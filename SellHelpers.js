/**
 * Ending the bidding phase: sell mode, the sold/last-bid script-property clocks,
 * the Sold!-button cooldown, the core sale logic, auto-sell, and outbid checks.
 * (Apps Script flattens all .js files into one global namespace.)
 */

// ----- Sell mode -----

/** Current sell mode from the sheet. Defaults to MANUAL (never auto-sells unexpectedly). */
function readSellMode(sheet) {
  return readCell(sheet, SELL_MODE_CELL).toUpperCase() === SELL_MODE_AUTO
    ? SELL_MODE_AUTO : SELL_MODE_MANUAL;
}

function readAutoWindowSeconds(sheet) {
  return readNumber(sheet, AUTO_SELL_COUNTDOWN_DURATION_CELL) || DEFAULT_AUTO_WINDOW_SECONDS;
}

function readSoldCooldownSeconds(sheet) {
  return readNumber(sheet, SOLD_COOLDOWN_CELL) || DEFAULT_SOLD_COOLDOWN_SECONDS;
}

// ----- Last-sale announcement (script properties) -----

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

// ----- Last-bid clock (script properties) -----

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

// ----- Sold! button arming -----

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

/** Flips the Sold! button from WAIT to READY once the cooldown elapses (both modes). */
function armSoldButtonIfCooldownPeriodElapsed(sheet) {
  if (readStatus(sheet) !== STATUS_BIDDING) return;
  if (!checkSoldButtonUsable(sheet)) return;
  if (readCell(sheet, SOLD_BUTTON_USABLE_CELL) !== SOLD_DISABLED) return; // single-transition guard
  setSoldButtonUsableCell(sheet, SOLD_ENABLED);
}

// ----- Core sale logic (lock-held) -----

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

// ----- Uncontestable-bid auto-sell -----

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
