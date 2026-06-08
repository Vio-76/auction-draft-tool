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

/** Button: "Open Bidding". Treats reopening as a fresh bid (restarts the cooldown). */
function openBidding() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
  sheet.getRange(STATUS_CELL).setValue(STATUS_BIDDING);
  setLastBidTime();
  setSoldButtonUsableCell(sheet, SOLD_DISABLED);
}

/** Button: "set status to opening bid of current captains turn". */
function openOpeningBid() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(STATUS_CELL).setValue(STATUS_OPENING);
  setOpeningTurnDeadline();
}

/** Closes bidding without assigning a player. Only for manual admin interruption*/
function closeBidding() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
  sheet.getRange(STATUS_CELL).setValue(STATUS_CLOSED);
  clearLastBidTime();
  clearSoldButtonUsableCell(sheet);
}

/**
 * Button: "Sold!" — assign the player to the winning captain and advance the turn.
 * Blocked until the post-bid cooldown elapses (both modes). The lock is held while
 * selling, then status is set CLOSED so any queued bids reject in the gap before
 * advanceTurn() flips to the next captain's OPENING phase.
 */
function playerSold() {
  let advanceAfter = false;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);

    if (readStatus(sheet) !== STATUS_BIDDING) {
      alertUser("Nothing to sell — bidding isn't open.");
      return;
    }
    if (!checkSoldButtonUsable(sheet)) {
      const remaining = Math.ceil(readSoldCooldownSeconds(sheet) - (Date.now() - getLastBidTime()) / 1000);
      alertUser("Wait " + remaining + "s after the last bid before selling.");
      return;
    }

    const result = _sellPlayerInner(sheet);
    if (!result.ok) { alertUser(result.error); return; }

    sheet.getRange(STATUS_CELL).setValue(STATUS_CLOSED);
    clearLastBidTime();
    clearSoldButtonUsableCell(sheet);
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
    clearLastBidTime();
    clearSoldButtonUsableCell(sheet);

    // Clear the marker so advanceTurn starts from index 0
    const numRows = TRACKER_LAST_ROW - TRACKER_FIRST_ROW + 1;
    sheet.getRange(TRACKER_FIRST_ROW, TRACKER_MARKER_COL, numRows, 1).clearContent();
  } finally {
    lock.releaseLock();
  }

  advanceTurn();  // sets marker to first eligible captain and status to OPENING
}

/** Button: "Set Sell Mode: AUTO". Bidding ends automatically after the auto-sell window. */
function setSellModeAuto() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(SELL_MODE_CELL).setValue(SELL_MODE_AUTO);
}

/** Button: "Set Sell Mode: MANUAL". Bidding ends only when the admin clicks Sold!. */
function setSellModeManual() {
  SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET)
    .getRange(SELL_MODE_CELL).setValue(SELL_MODE_MANUAL);
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