/**
 * Generic sheet readers, Auth-sheet lookups, and small shared utilities.
 * (Apps Script flattens all .js files into one global namespace.)
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

function readSmallBlind(sheet) {
  return readNumber(sheet, SMALL_BLIND_CELL);
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

// ----- Misc -----

function alertUser(message) {
  SpreadsheetApp.getUi().alert(message);
}
