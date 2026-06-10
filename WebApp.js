/**
 * Web app: doGet renders the captain page,
 * getState and placeBid are called from the captain page via google.script.run.
 */

function doGet(e) {
  const view = (e && e.parameter && e.parameter.view) || "";
  if (view === "board") return renderBoard();

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
  tmpl.theme = CAPTAIN_THEME;
  tmpl.fontUrl = THEME_FONT_URLS[CAPTAIN_THEME] || THEME_FONT_URLS.draftroom;
  return tmpl.evaluate()
    .setTitle("Auction — " + (captain || "no captain"))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ----- Public read-only team board (?view=board) -----

/** Renders the public spectator board. No auth — read-only, no captain-specific data. */
function renderBoard() {
  const icons = getRoleIconDataUris();
  const tmpl = HtmlService.createTemplateFromFile('Board');
  tmpl.theme = CAPTAIN_THEME;
  tmpl.fontUrl = THEME_FONT_URLS[CAPTAIN_THEME] || THEME_FONT_URLS.draftroom;
  tmpl.roleLabels = ROLE_LABELS;
  tmpl.roleIcons = icons;  // { "Top": "data:image/png;base64,...", ... } — used for CSS only
  tmpl.rolesJson = JSON.stringify(ROLE_LABELS.map(function(r) {
    return { key: r.toLowerCase(), label: r, hasIcon: !!icons[r] };
  }));
  return tmpl.evaluate()
    .setTitle("Auction — Teams")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Polled by the board page every few seconds. Reads the whole Board block in one
 * getValues() and returns the parsed teams + current live highest bid. The built payload
 * is cached (BOARD_CACHE_TTL_SECONDS) so sheet I/O is ~1 read per interval regardless of
 * how many spectators are watching. No auth (public, read-only).
 */
function getBoardState() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('boardState');
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActive();
  const boardSheet = ss.getSheetByName(BOARD_SHEET);
  if (!boardSheet) {
    const miss = { teams: [], highestBid: 0, error: "Board sheet not found." };
    cache.put('boardState', JSON.stringify(miss), BOARD_CACHE_TTL_SECONDS);
    return miss;
  }

  const auctSheet = ss.getSheetByName(AUCT_SHEET);
  const highestBid = readNumber(auctSheet, HIGHEST_BID_CELL);
  const block = boardSheet.getRange(BOARD_FIRST_ROW, 1, NUM_TEAMS, BOARD_NUM_COLS).getValues();

  const teams = [];
  for (const row of block) {
    const captain = String(row[0]).trim();
    if (!captain) continue;  // unused row in the block

    const players = [];
    for (let i = 0; i < TEAM_SLOTS; i++) {       // cols C/D, E/F, G/H, I/J
      const name = String(row[2 + i * 2]).trim();
      players.push({ name: name, price: Number(row[3 + i * 2]) || 0 });
    }

    const roles = [];
    for (let i = 0; i < ROLE_LABELS.length; i++) {  // cols M..R
      roles.push(_boardFlag(row[12 + i]));
    }

    teams.push({
      captain:      captain,
      captainPrice: Number(row[1]) || 0,    // col B
      players:      players,
      maxBid:       Number(row[10]) || 0,    // col K
      full:         _boardFlag(row[11]),     // col L
      roles:        roles,
    });
  }

  const openPlayers = readOpenPlayersWithRoles(auctSheet);

  const payload = { teams: teams, highestBid: highestBid, openPlayers: openPlayers };
  cache.put('boardState', JSON.stringify(payload), BOARD_CACHE_TTL_SECONDS);
  return payload;
}

/** Parses a 1/0 (or true/false) board flag cell into a boolean. */
function _boardFlag(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v >= 1;          // counts (e.g. 2 top laners) are still "drafted"
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return true;
  const n = parseFloat(s);
  return !isNaN(n) ? n >= 1 : false;                 // numeric strings like "2" count too
}

/**
 * Returns { "Top": "data:<type>;base64,...", ... } for the role icons, read from Drive
 * once and cached (icons rarely change). Only called from renderBoard at page load, never
 * in the poll loop. Missing/unfound icons are simply omitted — the page falls back to a
 * text label for those roles.
 */
function getRoleIconDataUris() {
  const cache = CacheService.getScriptCache();
  const keys = ROLE_LABELS.map(function(r) { return 'roleIcon_' + r; });
  const found = cache.getAll(keys);
  if (Object.keys(found).length === ROLE_LABELS.length) {
    const m = {};
    ROLE_LABELS.forEach(function(r) { m[r] = found['roleIcon_' + r]; });
    return m;
  }

  const map = _buildRoleIconDataUris();
  const toCache = {};
  ROLE_LABELS.forEach(function(r) { if (map[r]) toCache['roleIcon_' + r] = map[r]; });
  try {
    if (Object.keys(toCache).length) cache.putAll(toCache, 21600); // 6h
  } catch (err) { /* icon too large to cache — fine, it's only read at page load */ }
  return map;
}

function _buildRoleIconDataUris() {
  const map = {};
  let folder = null;
  for (const role of ROLE_LABELS) {
    try {
      let file = null;
      if (ROLE_ICON_FILE_IDS && ROLE_ICON_FILE_IDS[role]) {
        file = DriveApp.getFileById(ROLE_ICON_FILE_IDS[role]);
      } else if (ROLE_ICON_FOLDER_ID) {
        if (!folder) folder = DriveApp.getFolderById(ROLE_ICON_FOLDER_ID);
        file = _findIconFileInFolder(folder, role);
      }
      if (file) {
        const blob = file.getBlob();
        map[role] = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
      }
    } catch (err) { /* leave this role iconless; UI shows a text fallback */ }
  }
  return map;
}

/**
 * Run this ONCE from the Apps Script editor (Run ▸ debugRoleIcons) to:
 *   1. trigger the Drive authorization prompt for the deploying account, and
 *   2. log which role icons resolve, plus the actual file names in the folder
 *      (so you can fix the folder ID or rename files to match ROLE_LABELS).
 * The web app can't show this prompt to anonymous viewers — only you, the owner, can grant it.
 */
function debugRoleIcons() {
  // Clear any cached icon results so this reads fresh from Drive.
  CacheService.getScriptCache().removeAll(ROLE_LABELS.map(function(r) { return 'roleIcon_' + r; }));

  Logger.log('ROLE_ICON_FOLDER_ID = "' + ROLE_ICON_FOLDER_ID + '"');
  if (ROLE_ICON_FOLDER_ID) {
    const folder = DriveApp.getFolderById(ROLE_ICON_FOLDER_ID);  // throws here if unauthorized / bad ID
    Logger.log('Folder found: "' + folder.getName() + '". Files inside:');
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      Logger.log('  • ' + f.getName() + '  [' + f.getBlob().getContentType() + ']');
    }
  }

  const map = _buildRoleIconDataUris();
  Logger.log('Resolved icons (expecting one per role in ROLE_LABELS):');
  ROLE_LABELS.forEach(function(r) {
    Logger.log('  ' + r + ': ' + (map[r] ? 'OK' : 'MISSING — no file named "' + r.toLowerCase() + '" in the folder'));
  });
}

/** Finds a file in `folder` whose name (without extension) equals the role, case-insensitively. */
function _findIconFileInFolder(folder, role) {
  const target = role.toLowerCase();
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const base = f.getName().toLowerCase().replace(/\.[a-z0-9]+$/, '');
    if (base === target) return f;
  }
  return null;
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
    _finalizeBid(sheet, captain, bid);
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
    _finalizeBid(sheet, captain, bid);
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