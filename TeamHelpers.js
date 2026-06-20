/**
 * Team cards, the captain-full lookup, the live auction block, and the open-player pool.
 * (Apps Script flattens all .js files into one global namespace.)
 */

// ----- Captain-full lookup -----

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

function isCaptainFull(sheet, captain) {
  const fullByName = readFullCaptains(sheet);
  return fullByName[captain] === true;
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
