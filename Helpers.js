/**
 * Shared helpers used by the web app and the buttons.
 * Grouped by topic: sheet readers, auth lookups, turn tracker, team cards, misc.
 */

// ----- Sheet readers -----

function readCell(sheet, a1) {
  return String(sheet.getRange(a1).getValue()).trim();
}

function readNumber(sheet, a1) {
  return Number(sheet.getRange(a1).getValue()) || 0;
}

function readStatus(sheet) {
  return readCell(sheet, STATUS_CELL).toUpperCase();
}

function readCaptainMaxBid(sheet, captain) {
  const cache = CacheService.getScriptCache();
  let json = cache.get('maxBids');
  if (json) {
    return (JSON.parse(json))[captain] || 0;
  }
  const authSheet = SpreadsheetApp.getActive().getSheetByName(AUTH_SHEET);
  const rows = authSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    map[String(rows[i][0]).trim()] = Number(rows[i][3]) || 0;
  }
  cache.put('maxBids', JSON.stringify(map), 5); // 5 second TTL
  return map[captain] || 0;
}

// ----- Auth sheet lookups -----

/** Returns the raw Auth-sheet row array for `captain`, or null. */
function findAuthRow(captain) {
  if (!captain) return null;
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUTH_SHEET);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) { // skip header
    if (String(rows[i][0]).trim() === captain) return rows[i];
  }
  return null;
}

function checkCode(captain, code) {
  if (!captain || !code) return false;
  const row = findAuthRow(captain);
  return !!row && String(row[1]).trim() === code;
}

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

/** Reads the captain-full lookup: { "Monarch": false, "Tomi": true, ... } */
function readFullCaptains(sheet) {
  const numRows = FULL_LIST_LAST_ROW - FULL_LIST_FIRST_ROW + 1;
  const left  = Math.min(FULL_LIST_NAME_COL, FULL_LIST_FULL_COL);
  const right = Math.max(FULL_LIST_NAME_COL, FULL_LIST_FULL_COL);
  const block = sheet.getRange(FULL_LIST_FIRST_ROW, left, numRows, right - left + 1).getValues();
  const nameOffset = FULL_LIST_NAME_COL - left;
  const fullOffset = FULL_LIST_FULL_COL - left;

  const map = {};
  for (let i = 0; i < numRows; i++) {
    const name = String(block[i][nameOffset]).trim();
    if (!name) continue;
    map[name] = String(block[i][fullOffset]).trim().toLowerCase() === FULL_VALUE;
  }
  return map;
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

// ----- Team cards -----

/** Locates a captain's cell position in the captain rows of the teams. Returns {row, col} or null. */
function findCaptainCellPosition(sheet, captain) {
  const lastCol = sheet.getLastColumn();
  for (const row of CAPTAIN_HEADER_ROWS) {
    const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    for (let c = 0; c < values.length; c++) {
      if (String(values[c]).trim() === captain) {
        return { row: row, col: c + 1 };
      }
    }
  }
  return null;
}

/** Places `player` at the first empty slot in the team. Returns true if placed. */
function placePlayerInTeam(sheet, captainPos, player, bid) {
  for (let i = 1; i <= TEAM_SLOTS; i++) {
    const slotRow = captainPos.row + i;
    const slotCell = sheet.getRange(slotRow, captainPos.col);
    if (!String(slotCell.getValue()).trim()) {
      slotCell.setValue(player);
      sheet.getRange(slotRow, captainPos.col + PRICE_COL_OFFSET).setValue(bid);
      return true;
    }
  }
  return false;
}

/** Clears the live auction cells and closes bidding. */
function clearAuctionBlock(sheet) {
  sheet.getRange(PLAYER_CELL).clearContent();
  sheet.getRange(HIGHEST_BID_CELL).clearContent();
  sheet.getRange(BY_CAPTAIN_CELL).clearContent();
}

// ----- Open players pool -----

/** Reads the open players list as a flat array of non-empty trimmed names. */
function readOpenPlayers(sheet) {
  const values = sheet.getRange(OPEN_PLAYERS_RANGE).getValues();
  const names = [];
  for (const row of values) {
    for (let c = 0; c < row.length; c++) {
      if (c % 6 === 5) continue;  // role column, skip
      const name = String(row[c]).trim();
      if (name) names.push(name);
    }
  }
  names.sort(function(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  return names;
}

function isPlayerInPool(sheet, player) {
  return readOpenPlayers(sheet).indexOf(player) !== -1;
}

// ----- Small blind / max bids -----

function readSmallBlind(sheet) {
  return readNumber(sheet, SMALL_BLIND_CELL);
}

// ----- Turn helpers -----

/** Returns the captain who currently has the turn marker, or "" if none. */
function findCurrentTurnCaptain(sheet) {
  const tracker = readTracker(sheet);
  if (tracker.markerIdx === -1) return "";
  return tracker.names[tracker.markerIdx];
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
  const nextIdx = findNextAvailableIndex(tracker.markerIdx, tracker.names, fullByName);
  writeMarker(sheet, nextIdx);
  if (nextIdx !== -1) {
    sheet.getRange(STATUS_CELL).setValue(STATUS_OPENING);
    setOpeningTurnDeadline();
  } else {
    sheet.getRange(STATUS_CELL).setValue(STATUS_FINISHED);
  }
}

function maybeAutoSkip() {
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
    _advanceTurnInner(sheet);
  } finally {
    lock.releaseLock();
  }
}

// ----- Misc -----

function alertUser(message) {
  SpreadsheetApp.getUi().alert(message);
}

function isCaptainFull(sheet, captain) {
  const fullByName = readFullCaptains(sheet);
  return fullByName[captain] === true;
}