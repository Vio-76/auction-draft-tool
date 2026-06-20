/**
 * Turn rotation: the tracker marker, waterfall/snake order + direction, the
 * opening-bid deadline, and the core advance-turn logic.
 * (Apps Script flattens all .js files into one global namespace.)
 */

// ----- Turn tracker -----

/** Reads tracker names and the current marker index in one batched read. */
function readTracker(sheet) {
  const numRows = TRACKER_LAST_ROW - TRACKER_FIRST_ROW + 1;
  const left  = Math.min(TRACKER_NAME_COL, TRACKER_MARKER_COL);
  const right = Math.max(TRACKER_NAME_COL, TRACKER_MARKER_COL);
  const block = sheet.getRange(TRACKER_FIRST_ROW, left, numRows, right - left + 1).getValues();
  const nameOffset   = TRACKER_NAME_COL   - left;
  const markerOffset = TRACKER_MARKER_COL - left;

  const names = [];
  let markerIdx = -1;
  for (let i = 0; i < numRows; i++) {
    names.push(String(block[i][nameOffset]).trim());
    if (markerIdx === -1 && String(block[i][markerOffset]).trim() === MARKER) {
      markerIdx = i;
    }
  }
  return { names: names, markerIdx: markerIdx };
}

/** Finds the next non-full tracker index, wrapping around. -1 if all full. */
function findNextAvailableIndex(currentIdx, names, fullByName) {
  const n = names.length;
  const startFrom = currentIdx === -1 ? -1 : currentIdx;
  for (let step = 1; step <= n; step++) {
    const idx = (startFrom + step + n) % n;
    if (fullByName[names[idx]] !== true) return idx;
  }
  return -1;
}

/**
 * Next non-full index in SNAKE order, plus the resulting direction (+1 down / -1 up).
 * Bounces at index 0 and n-1 with the end captain repeating (true back-to-back snake);
 * full captains are skipped in the current direction. Returns { idx: -1, ... } if all full.
 */
function findNextSnakeIndex(currentIdx, direction, names, fullByName) {
  const n = names.length;
  // Fresh start (marker cleared by startAuction): scan forward from the top.
  if (currentIdx === -1) {
    for (let i = 0; i < n; i++) {
      if (fullByName[names[i]] !== true) return { idx: i, direction: 1 };
    }
    return { idx: -1, direction: 1 };
  }
  let dir = direction;
  let idx = currentIdx;
  for (let guard = 0; guard < 4 * n; guard++) {   // guard against an all-full loop
    let nxt = idx + dir;
    if (nxt < 0 || nxt >= n) { dir = -dir; nxt = idx; }  // bounce: same end goes again
    idx = nxt;
    if (fullByName[names[idx]] !== true) return { idx: idx, direction: dir };
  }
  return { idx: -1, direction: dir };
}

/** Writes the marker at `nextIdx`, or the finished message if -1. */
function writeMarker(sheet, nextIdx) {
  const numRows = TRACKER_LAST_ROW - TRACKER_FIRST_ROW + 1;
  sheet.getRange(TRACKER_FIRST_ROW, TRACKER_MARKER_COL, numRows, 1).clearContent();
  if (nextIdx !== -1) {
    sheet.getRange(TRACKER_FIRST_ROW + nextIdx, TRACKER_MARKER_COL).setValue(MARKER);
  } else {
    sheet.getRange(TRACKER_FIRST_ROW, TRACKER_MARKER_COL).setValue(FINISHED_MSG);
  }
}

/** Returns the captain who currently has the turn marker, or "" if none. */
function findCurrentTurnCaptain(sheet) {
  const tracker = readTracker(sheet);
  if (tracker.markerIdx === -1) return "";
  return tracker.names[tracker.markerIdx];
}

// ----- Turn order (waterfall vs snake) -----

/** Current turn order from the sheet. Defaults to WATERFALL (today's behavior). */
function readTurnOrder(sheet) {
  return readCell(sheet, TURN_ORDER_CELL).toUpperCase() === TURN_ORDER_SNAKE
    ? TURN_ORDER_SNAKE : TURN_ORDER_WATERFALL;
}

/** Snake direction as a number for the walker: -1 (UP/reverse) or +1 (DOWN/forward, default). */
function readTurnDirection(sheet) {
  return readCell(sheet, TURN_DIRECTION_CELL).toUpperCase() === TURN_DIR_UP ? -1 : 1;
}

/** Writes the snake direction back as the human-readable DOWN/UP the admin sees. */
function writeTurnDirection(sheet, dir) {
  sheet.getRange(TURN_DIRECTION_CELL).setValue(dir === -1 ? TURN_DIR_UP : TURN_DIR_DOWN);
}

// ----- Opening-bid deadline (stored in script properties) -----

function setOpeningTurnDeadline() {
  const deadline = Date.now() + OPENING_BID_TIMEOUT_SECONDS * 1000;
  PropertiesService.getScriptProperties().setProperty('OPENING_DEADLINE', String(deadline));
}

function getOpeningTurnSecondsRemaining() {
  const v = PropertiesService.getScriptProperties().getProperty('OPENING_DEADLINE');
  if (!v) return OPENING_BID_TIMEOUT_SECONDS; // graceful fallback if missing
  return Math.max(0, Math.round((Number(v) - Date.now()) / 1000));
}

// ----- Advance turn core (assumes caller holds the script lock) -----

function _advanceTurnInner(sheet) {
  const tracker = readTracker(sheet);
  const fullByName = readFullCaptains(sheet);

  let nextIdx;
  if (readTurnOrder(sheet) === TURN_ORDER_SNAKE) {
    const step = findNextSnakeIndex(tracker.markerIdx, readTurnDirection(sheet), tracker.names, fullByName);
    nextIdx = step.idx;
    writeTurnDirection(sheet, step.direction);
  } else {
    nextIdx = findNextAvailableIndex(tracker.markerIdx, tracker.names, fullByName);
  }

  writeMarker(sheet, nextIdx);
  if (nextIdx !== -1) {
    sheet.getRange(STATUS_CELL).setValue(STATUS_OPENING);
    setOpeningTurnDeadline();
  } else {
    sheet.getRange(STATUS_CELL).setValue(STATUS_FINISHED);
  }
}

/**
 * Skip the current captain's turn. Like _advanceTurnInner, but in SNAKE mode the end
 * captain gets two back-to-back turns at a turnaround — skipping the first should skip
 * both. The only time an advance lands back on the same captain is that snake bounce,
 * so if it does, advance once more. (Waterfall never bounces → this is a plain advance.)
 * Assumes the caller holds the script lock. Used by the skip paths, NOT by sales —
 * a captain who *buys* on the first of the two turns still keeps the second.
 */
function _skipTurnInner(sheet) {
  const skipped = findCurrentTurnCaptain(sheet);
  _advanceTurnInner(sheet);
  if (skipped && findCurrentTurnCaptain(sheet) === skipped) {
    _advanceTurnInner(sheet);
  }
}

function autoSkipIfDeadlinePassed() {
  const v = PropertiesService.getScriptProperties().getProperty('OPENING_DEADLINE');
  if (!v) return;
  if (Date.now() < Number(v)) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // someone else is doing it, or sheet is busy
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
    if (readStatus(sheet) !== STATUS_OPENING) return;            // phase already moved
    const fresh = PropertiesService.getScriptProperties().getProperty('OPENING_DEADLINE');
    if (!fresh || Date.now() < Number(fresh)) return;            // someone reset it
    _skipTurnInner(sheet);
  } finally {
    lock.releaseLock();
  }
}
