/**
 * Web app: doGet renders the captain page,
 * getState and placeBid are called from the captain page via google.script.run.
 */

function doGet(e) {
  const captain = (e && e.parameter && e.parameter.captain) || "";
  const code    = (e && e.parameter && e.parameter.code) || "";
  const tmpl = HtmlService.createTemplateFromFile('Index');
  tmpl.captain = captain;
  tmpl.code = code;
  tmpl.authorized = checkCode(captain, code);
  tmpl.statuses = {
    OPENING:  STATUS_OPENING,
    BIDDING:  STATUS_BIDDING,
    CLOSED:   STATUS_CLOSED,
    FINISHED: STATUS_FINISHED,
  };
  tmpl.openingBidTimeoutSeconds = OPENING_BID_TIMEOUT_SECONDS;
  tmpl.sellModeAuto = SELL_MODE_AUTO;
  return tmpl.evaluate()
    .setTitle("Auction — " + (captain || "no captain"))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called by the captain webpage every second. */
function getState(captain, code) {
  if (!checkCode(captain, code)) return { unauthorized: true };
  autoSkipIfDeadlinePassed();
  const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
  maximizeAutoSellTimeWindowIfSwitchedToAutoMode(sheet);
  autoSellIfTimeWindowElapsed(sheet);
  armSoldButtonIfCooldownPeriodElapsed(sheet);

  const phase = readStatus(sheet) || STATUS_CLOSED;
  const sellMode = readSellMode(sheet);
  const currentTurnCaptain = findCurrentTurnCaptain(sheet);
  const isYourTurnToOpen = (phase === STATUS_OPENING) && (currentTurnCaptain === captain);

  const result = {
    captain:      captain,
    phase:        phase,
    sellMode:     sellMode,
    currentTurnCaptain: currentTurnCaptain,
    isYourTurnToOpen: isYourTurnToOpen,
    player:       readCell(sheet, PLAYER_CELL),
    highestBid:   readNumber(sheet, HIGHEST_BID_CELL),
    byCaptain:    readCell(sheet, BY_CAPTAIN_CELL),
    yourMaxBid:   readCaptainMaxBid(sheet, captain),
    smallBlind:   readSmallBlind(sheet),
    youAreFull:         isCaptainFull(sheet, captain),
  };

    // Only send the (potentially long) open players list when needed
  if (isYourTurnToOpen) {
    result.openPlayers = readOpenPlayers(sheet);
    result.secondsRemaining = getOpeningTurnSecondsRemaining();
  }

  // AUTO mode: send the auto-sell countdown so captains see a ring during bidding.
  if (phase === STATUS_BIDDING && sellMode === SELL_MODE_AUTO) {
    result.sellWindowSeconds  = readAutoWindowSeconds(sheet);
    result.sellSecondsRemaining = getAutoSellSecondsRemaining(sheet);
  }

  // Recently-sold banner: shown for a few seconds after each sale (both modes).
  const soldMessage = getRecentSoldMessage();
  if (soldMessage) result.soldMessage = soldMessage;

  return result;
}

/** Called by the captain webpage when they hit "Bid". */
function placeBid(captain, code, amount) {
  if (!checkCode(captain, code)) return { ok: false, error: "Unauthorized." };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, error: "Server busy, try again." };
  }
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);

    if (isCaptainFull(sheet, captain)) return { ok: false, error: "Your team is full." };
    if (readStatus(sheet) !== STATUS_BIDDING) return { ok: false, error: "Bidding is closed." };

    const bid = Number(amount);
    if (!Number.isFinite(bid) || bid <= 0) return { ok: false, error: "Invalid bid." };
    if (!Number.isInteger(bid)) return { ok: false, error: "Bid must be a whole number." };

    const highest = readNumber(sheet, HIGHEST_BID_CELL);
    if (bid <= highest) return { ok: false, error: "Bid must be higher than $" + highest + "." };

    const maxBid = readCaptainMaxBid(sheet, captain);
    if (maxBid && bid > maxBid) return { ok: false, error: "Exceeds your max bid of $" + maxBid + "." };

    sheet.getRange(HIGHEST_BID_CELL).setValue(bid);
    sheet.getRange(BY_CAPTAIN_CELL).setValue(captain);
    setLastBidTime();
    setSoldButtonUsableCell(sheet, SOLD_DISABLED);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Called by the turn-holder when they place their opening bid on a player. */
function placeOpeningBid(captain, code, playerName, amount) {
  if (!checkCode(captain, code)) return { ok: false, error: "Unauthorized." };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, error: "Server busy, try again." };
  }
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);

    if (readStatus(sheet) !== STATUS_OPENING) {
      return { ok: false, error: "Not currently in opening bid phase." };
    }
    if (isCaptainFull(sheet, captain)) return { ok: false, error: "Your team is full." };
    if (findCurrentTurnCaptain(sheet) !== captain) {
      return { ok: false, error: "It's not your turn to open." };
    }

    const player = String(playerName).trim();
    if (!player) return { ok: false, error: "Pick a player." };
    if (!isPlayerInPool(sheet, player)) {
      return { ok: false, error: "That player isn't in the open pool." };
    }

    const bid = Number(amount);
    if (!Number.isFinite(bid) || bid <= 0) return { ok: false, error: "Invalid bid." };
    if (!Number.isInteger(bid)) return { ok: false, error: "Bid must be a whole number." };

    const smallBlind = readSmallBlind(sheet);
    if (bid < smallBlind) {
      return { ok: false, error: "Opening bid must be at least $" + smallBlind + "." };
    }

    const maxBid = readCaptainMaxBid(sheet, captain);
    if (maxBid && bid > maxBid) {
      return { ok: false, error: "Exceeds your max bid of $" + maxBid + "." };
    }

    sheet.getRange(PLAYER_CELL).setValue(player);
    sheet.getRange(HIGHEST_BID_CELL).setValue(bid);
    sheet.getRange(BY_CAPTAIN_CELL).setValue(captain);
    sheet.getRange(STATUS_CELL).setValue(STATUS_BIDDING);
    setLastBidTime();
    setSoldButtonUsableCell(sheet, SOLD_DISABLED);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Called by the turn-holder when they skip instead of submitting an opening bid. */
function skipTurn(captain, code) {
  if (!checkCode(captain, code)) return { ok: false, error: "Unauthorized." };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, error: "Server busy, try again." };
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(AUCT_SHEET);
    if (readStatus(sheet) !== STATUS_OPENING) {
      return { ok: false, error: "Nothing to skip — not in opening bid phase." };
    }
    if (findCurrentTurnCaptain(sheet) !== captain) {
      return { ok: false, error: "It's not your turn." };
    }
    _advanceTurnInner(sheet);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}