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

// A captain's max bid, defaulting a missing/blank value to the small blind (and at
// least 1, in case the small blind itself is unset) so there is never an unbounded
// ("0 = no cap") captain. Every captain always has a finite, positive max.
function readCaptainMaxBid(sheet, captain) {
  const cache = CacheService.getScriptCache();
  const json = cache.get('maxBids');
  let map;
  if (json) {
    map = JSON.parse(json);
  } else {
    const authSheet = SpreadsheetApp.getActive().getSheetByName(AUTH_SHEET);
    const rows = authSheet.getDataRange().getValues();
    map = {};
    for (let i = 1; i < rows.length; i++) {
      map[String(rows[i][0]).trim()] = Number(rows[i][3]) || 0;
    }
    cache.put('maxBids', JSON.stringify(map), 5); // 5 second TTL
  }
  return map[captain] || readSmallBlind(sheet) || 1;
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

/** Reads open players as [{name, role}], preserving the role column the spectator board needs. */
function readOpenPlayersWithRoles(sheet) {
  const values = sheet.getRange(OPEN_PLAYERS_RANGE).getValues();
  const out = [];
  for (const row of values) {
    for (let b = 0; b * 6 < row.length; b++) {   // each player block = 5 merged name cells + 1 role cell
      const name = String(row[b * 6]).trim();
      if (!name) continue;
      const role = String(row[b * 6 + 5]).trim();
      out.push({ name: name, role: role });
    }
  }
  // Shuffle deterministically by a hash of the name (looks random, avoids alphabetical draft
  // bias, but is stable for the same players so the board order doesn't churn as players sell).
  out.sort(function(a, b) {
    const ka = _shuffleKey(a.name), kb = _shuffleKey(b.name);
    return ka === kb ? a.name.localeCompare(b.name) : ka - kb;
  });
  return out;
}

/** Deterministic 32-bit hash (FNV-1a) of the seeded name — a stable, random-looking sort key. */
function _shuffleKey(name) {
  const s = PLAYER_SHUFFLE_SEED + "|" + name;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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
    _advanceTurnInner(sheet);
  } finally {
    lock.releaseLock();
  }
}

// ----- Sell mode (ending the bidding phase) -----

/** Current sell mode from the sheet. Defaults to MANUAL (never auto-sells unexpectedly). */
function readSellMode(sheet) {
  return readCell(sheet, SELL_MODE_CELL).toUpperCase() === SELL_MODE_AUTO
    ? SELL_MODE_AUTO : SELL_MODE_MANUAL;
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

function readAutoWindowSeconds(sheet) {
  return readNumber(sheet, AUTO_SELL_COUNTDOWN_DURATION_CELL) || DEFAULT_AUTO_WINDOW_SECONDS;
}

function readSoldCooldownSeconds(sheet) {
  return readNumber(sheet, SOLD_COOLDOWN_CELL) || DEFAULT_SOLD_COOLDOWN_SECONDS;
}

// Last-sale announcement, surfaced to captains for SOLD_MESSAGE_DISPLAY_SECONDS.
function setLastSold(player, winner, bid) {
  PropertiesService.getScriptProperties().setProperty(
    'LAST_SOLD',
    JSON.stringify({ player: player, winner: winner, bid: bid, at: Date.now() })
  );
}

function getRecentSoldMessage() {
  const v = PropertiesService.getScriptProperties().getProperty('LAST_SOLD');
  if (!v) return null;
  const data = JSON.parse(v);
  if (Date.now() - data.at > SOLD_MESSAGE_DISPLAY_SECONDS * 1000) return null;
  return { player: data.player, winner: data.winner, bid: data.bid };
}

// Last-bid timestamp, stored in script properties (mirrors the opening-bid deadline).
function setLastBidTime() {
  PropertiesService.getScriptProperties().setProperty('LAST_BID_TIME', String(Date.now()));
}

function getLastBidTime() {
  const v = PropertiesService.getScriptProperties().getProperty('LAST_BID_TIME');
  return v ? Number(v) : 0;
}

function clearLastBidTime() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_BID_TIME');
}

/** Seconds until the AUTO-mode auto-sell fires (for the captain countdown ring). */
function getAutoSellSecondsRemaining(sheet) {
  const lastBid = getLastBidTime();
  if (!lastBid) return readAutoWindowSeconds(sheet);
  return Math.max(0, Math.round(readAutoWindowSeconds(sheet) - (Date.now() - lastBid) / 1000));
}

/** True once the Sold!-button arming cooldown has passed (both modes). */
function checkSoldButtonUsable(sheet) {
  const lastBid = getLastBidTime();
  if (!lastBid) return true; // no bid recorded — nothing to wait for
  return Date.now() - lastBid >= readSoldCooldownSeconds(sheet) * 1000;
}

function setSoldButtonUsableCell(sheet, value) {
  sheet.getRange(SOLD_BUTTON_USABLE_CELL).setValue(value);
}

function clearSoldButtonUsableCell(sheet) {
  sheet.getRange(SOLD_BUTTON_USABLE_CELL).clearContent();
}

/**
 * Core sale logic, lock-held. Assigns the current player to the winning captain.
 * Returns { ok, error } so both the admin button and auto-sell can use it
 * (auto-sell can't show modal alerts). Does NOT advance the turn — caller does.
 */
function _sellPlayerInner(sheet) {
  const player = readCell(sheet, PLAYER_CELL);
  const bid    = readNumber(sheet, HIGHEST_BID_CELL);
  const winner = readCell(sheet, BY_CAPTAIN_CELL);

  if (!player) return { ok: false, error: "No player to assign." };
  if (!winner) return { ok: false, error: "No winning captain — nobody placed a bid." };

  const captainPos = findCaptainCellPosition(sheet, winner);
  if (!captainPos) {
    return { ok: false, error: "Could not find captain '" + winner + "' in the team header rows." };
  }
  if (!placePlayerInTeam(sheet, captainPos, player, bid)) {
    return { ok: false, error: "Captain '" + winner + "' has no free slots left." };
  }

  CacheService.getScriptCache().remove('maxBids');
  clearAuctionBlock(sheet);
  setLastSold(player, winner, bid);
  return { ok: true };
}

/**
 * If the admin flips MANUAL -> AUTO during an active bidding phase, restart the
 * auto-sell window from the top: re-anchor the last-bid clock to now and re-arm
 * the Sold!-button cooldown. Otherwise the window would be measured from the last
 * (possibly long-past) bid and could fire instantly. Tracks the last-seen mode in
 * script properties. Server-only; piggybacks on getState polls before autoSellIfTimeWindowElapsed.
 */
function maximizeAutoSellTimeWindowIfSwitchedToAutoMode(sheet) {
  const props = PropertiesService.getScriptProperties();
  const mode = readSellMode(sheet);
  const prev = props.getProperty('PREVIOUS_SELL_MODE');
  if (mode === prev) return;
  if (mode === SELL_MODE_AUTO && prev === SELL_MODE_MANUAL
      && readStatus(sheet) === STATUS_BIDDING && getLastBidTime()) {
    setLastBidTime();
    setSoldButtonUsableCell(sheet, SOLD_DISABLED);
  }
  props.setProperty('PREVIOUS_SELL_MODE', mode);
}

/**
 * AUTO mode only: if no bid has landed within the window, sell to the high bidder
 * and advance the turn. Piggybacks on getState polls, like autoSkipIfDeadlinePassed. Server-only.
 */
function autoSellIfTimeWindowElapsed(sheet) {
  if (readSellMode(sheet) !== SELL_MODE_AUTO) return;
  if (readStatus(sheet) !== STATUS_BIDDING) return;
  const lastBid = getLastBidTime();
  if (!lastBid) return;
  if (Date.now() - lastBid < readAutoWindowSeconds(sheet) * 1000) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // someone else is doing it, or sheet is busy
  try {
    // Re-check inside the lock to avoid a double-sell race.
    if (readStatus(sheet) !== STATUS_BIDDING) return;
    if (readSellMode(sheet) !== SELL_MODE_AUTO) return;
    const fresh = getLastBidTime();
    if (!fresh || Date.now() - fresh < readAutoWindowSeconds(sheet) * 1000) return;

    if (!_finalizeSaleAndAdvance(sheet).ok) return; // e.g. no free slot — leave it for the admin
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sell the current player and advance the turn. Caller must hold the script lock.
 * Returns the _sellPlayerInner result ({ ok, error }). Shared by the time-window
 * auto-sell and the uncontestable-bid auto-sell in placeBid/placeOpeningBid.
 */
function _finalizeSaleAndAdvance(sheet) {
  const result = _sellPlayerInner(sheet);
  if (!result.ok) return result;
  clearLastBidTime();
  clearSoldButtonUsableCell(sheet);
  _advanceTurnInner(sheet);
  return result;
}

/** A captain can still outbid `currentBid` if they're not full and their (floored)
 *  max bid is strictly above the current bid. */
function captainCanOutbid(sheet, captain, currentBid, fullByName) {
  if (fullByName[captain] === true) return false;
  return readCaptainMaxBid(sheet, captain) > currentBid;
}

/** True when no captain other than `currentBidder` can outbid `currentBid` — i.e.
 *  every other captain is full or capped at/below it. Covers both "all others full"
 *  and "bid meets/exceeds all other maxes", so the player can be sold immediately. */
function noOneCanOutbid(sheet, currentBidder, currentBid) {
  const fullByName = readFullCaptains(sheet);
  for (const name in fullByName) {
    if (name === currentBidder) continue;
    if (captainCanOutbid(sheet, name, currentBid, fullByName)) return false;
  }
  return true;
}

/**
 * Called right after a bid is written (caller holds the lock): if nobody else can
 * outbid it, sell immediately and advance; otherwise stamp the last-bid clock and
 * re-arm the Sold!-button cooldown. Shared by placeBid and placeOpeningBid.
 */
function _finalizeBid(sheet, bidder, bid) {
  if (noOneCanOutbid(sheet, bidder, bid) && _finalizeSaleAndAdvance(sheet).ok) return;
  setLastBidTime();
  setSoldButtonUsableCell(sheet, SOLD_DISABLED);
}

/** Flips the Sold! button from WAIT to READY once the cooldown elapses (both modes). */
function armSoldButtonIfCooldownPeriodElapsed(sheet) {
  if (readStatus(sheet) !== STATUS_BIDDING) return;
  if (!checkSoldButtonUsable(sheet)) return;
  if (readCell(sheet, SOLD_BUTTON_USABLE_CELL) !== SOLD_DISABLED) return; // single-transition guard
  setSoldButtonUsableCell(sheet, SOLD_ENABLED);
}

// ----- Misc -----

function alertUser(message) {
  SpreadsheetApp.getUi().alert(message);
}

function isCaptainFull(sheet, captain) {
  const fullByName = readFullCaptains(sheet);
  return fullByName[captain] === true;
}