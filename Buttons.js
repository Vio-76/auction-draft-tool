/**
 * Functions assigned to the clickable shapes in the spreadsheet.
 * Right-click a shape -> three-dot menu -> Assign script -> function name.
 */

/** Button: "Press to advance turn". Moves marker to next eligible captain. Sets status to finished if all teams full, else to opening bid.*/
function advanceTurn() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    _advanceTurnInner(SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET));
  } finally {
    lock.releaseLock();
  }
}

/** Button: "Open Bidding". */
function openBidding() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(STATUS_CELL).setValue(STATUS_BIDDING);
}

/** Button: "set status to opening bid of current captains turn". */
function openOpeningBid() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(STATUS_CELL).setValue(STATUS_OPENING);
  setOpeningTurnDeadline();
}

/** Closes bidding without assigning a player. Only for manual admin interruption*/
function closeBidding() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(STATUS_CELL).setValue(STATUS_CLOSED);
}

/** Button: "Sold!" — close bidding, acquire lock, assign the player to the winning captain and reset current bidding. */
function playerSold() {
  //first close bidding for the captains
  closeBidding();

  let advanceAfter = false;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
    const player = readCell(sheet, PLAYER_CELL);
    const bid    = readNumber(sheet, HIGHEST_BID_CELL);
    const winner = readCell(sheet, BY_CAPTAIN_CELL);

    if (!player) { alertUser("No player to assign."); return; }
    if (!winner) { alertUser("No winning captain — nobody placed a bid."); return; }

    const captainPos = findCaptainCellPosition(sheet, winner);
    if (!captainPos) {
      alertUser("Could not find captain '" + winner + "' in the team header rows.");
      return;
    }

    if (!placePlayerInTeam(sheet, captainPos, player, bid)) {
      alertUser("Captain '" + winner + "' has no free slots left.");
      return;
    }
    CacheService.getScriptCache().remove('maxBids');

    clearAuctionBlock(sheet);
    advanceAfter = true;
  } finally {
    lock.releaseLock();
  }
  if (advanceAfter) advanceTurn();
}

/** Button: "Start Auction". Resets the turn to the first eligible captain
 *  and enters the opening-bid phase.
 */
function startAuction() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Start auction?",
    "This resets the turn to the first captain and clears any in-flight auction state.",
    ui.ButtonSet.OK_CANCEL
  );
  if (response !== ui.Button.OK) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);

    clearAuctionBlock(sheet);

    // Clear the marker so advanceTurn starts from index 0
    const numRows = TRACKER_LAST_ROW - TRACKER_FIRST_ROW + 1;
    sheet.getRange(TRACKER_FIRST_ROW, TRACKER_MARKER_COL, numRows, 1).clearContent();
  } finally {
    lock.releaseLock();
  }

  advanceTurn();  // sets marker to first eligible captain and status to OPENING
}

/** Button: "Skip Captain". Admin-only — skips whoever currently has the turn. */
function adminSkipCaptain() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);

  const status = readStatus(sheet);
  if (status !== STATUS_OPENING) {
    ui.alert("Can only skip during opening bid phase. Current status: " + status + ".");
    return;
  }

  const current = findCurrentTurnCaptain(sheet);
  if (!current) {
    ui.alert("No current turn-holder to skip.");
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    // Re-check inside the lock — they might have submitted while you were confirming
    if (readStatus(sheet) !== STATUS_OPENING) {
      ui.alert("Phase changed while confirming — nothing skipped.");
      return;
    }
    if (findCurrentTurnCaptain(sheet) !== current) {
      ui.alert("Turn-holder changed while confirming — nothing skipped.");
      return;
    }
    _advanceTurnInner(sheet);
  } finally {
    lock.releaseLock();
  }
}