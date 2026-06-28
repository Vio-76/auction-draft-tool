/**
 * @OnlyCurrentDoc
 *
 * All manually-adjustable constants live here.
 * If the sheet layout changes, this is the only file you should need to edit.
 */


///Webpage configuration

//time for captains to submit opening bid before autoskip
const OPENING_BID_TIMEOUT_SECONDS = 30;

// How long the captain page shows the "<player> sold to <captain> for $<bid>"
// banner after each sale. Long enough to read, short enough not to stall the auction.
const SOLD_MESSAGE_DISPLAY_SECONDS = 6;

/// Sheet Locations

// Sheet names
const AUCT_SHEET = "Auction";
const AUTH_SHEET = "URLs";

// Number of captains, used to calculate sheet areas
const NUM_CAPTAINS = 6;

// Turn tracker Area (captain names + the "it's their turn" marker)
const TRACKER_NAME_COL   = 1;
const TRACKER_MARKER_COL = 2;
const TRACKER_FIRST_ROW  = 16;
const TRACKER_LAST_ROW   = TRACKER_FIRST_ROW + NUM_CAPTAINS - 1;

// Team Full Area - Captain list used to detect "team full" for skipping turns
const FULL_LIST_NAME_COL  = 1;
const FULL_LIST_FULL_COL  = 2;
const FULL_LIST_FIRST_ROW = 61;
const FULL_LIST_LAST_ROW  = FULL_LIST_FIRST_ROW + NUM_CAPTAINS - 1;

// Live auction state cells - cells that store information about the current bidding
const PLAYER_CELL      = "J14";
const HIGHEST_BID_CELL = "O14";
const BY_CAPTAIN_CELL  = "R14";
const STATUS_CELL      = "E61";

// Team card layout - where the drafted teams are displayed
const CAPTAIN_HEADER_ROWS = [4];   // rows where captain names appear in the team cards
                                    // e.g. two rows of teams -> [4, 13]
const TEAM_SLOTS          = 4;     // max players per team, excluding captain
const PRICE_COL_OFFSET    = 5;     // price cell is this many columns right of the player name
                                   // (player name is 5 merged cells wide)

// Misc strings
const MARKER       = "<-- it's their turn";
const FINISHED_MSG = "Auction finished";
const FULL_VALUE   = "full";

// Player pool
const OPEN_PLAYERS_RANGE = "E20:P34";   // adjust to wherever your open players list is

// Spectator-board "Available Players" ordering: players are shuffled by a deterministic hash
// of their name + this seed. Looks random (avoids alphabetical draft bias) but is stable for
// the same set of players. Change the seed to get a different fixed order.
const PLAYER_SHUFFLE_SEED = "neme-2026";

// Small blind cell
const SMALL_BLIND_CELL = "AF30";   // adjust to wherever your small blind value lives

// Status values
const STATUS_OPENING  = "OPENING";   // waiting for current turn-holder to place opening bid
const STATUS_BIDDING  = "BIDDING";      // bidding open to everyone
const STATUS_CLOSED   = "CLOSED";    // nothing happening, essentially paused. Occurs before Auction is started or after manual admin intervention
const STATUS_FINISHED = "FINISHED";  // auction over

// ----- Sell mode (how the bidding phase ends) -----

// Cell holding the current sell mode: "AUTO" or "MANUAL" (give it an AUTO/MANUAL dropdown).
const SELL_MODE_CELL = "E64";   // adjust to a free cell near the Sold! shape

// AUTO mode: sell automatically after this many seconds with no new bid.
const AUTO_SELL_COUNTDOWN_DURATION_CELL = "D69";   // adjust to a free cell

// Both modes: the Sold! button stays blocked for this many seconds after each
// bid, then arms. Gives late bidders a fair window and prevents instant selling.
const SOLD_COOLDOWN_CELL = "L69";   // adjust to a free cell

// Both modes: drives the Sold! button colour via conditional formatting
// (DISABLED -> red, ENABLED -> green, blank -> no fill). Place under the transparent Sold! shape.
const SOLD_BUTTON_USABLE_CELL = "T69";   // adjust to a free cell

const SELL_MODE_AUTO   = "AUTO";
const SELL_MODE_MANUAL = "MANUAL";
const SOLD_ENABLED  = "ENABLED";
const SOLD_DISABLED = "DISABLED";

// Fallbacks used when the corresponding cell is blank or invalid.
const DEFAULT_AUTO_WINDOW_SECONDS   = 15;
const DEFAULT_SOLD_COOLDOWN_SECONDS = 3;

// ----- Turn order (how the opening-bid turn rotates) -----

// Cell holding the current turn order: "WATERFALL" or "SNAKE" (give it a dropdown).
const TURN_ORDER_CELL = "Y69";   // adjust to a free cell near the tracker / sell-mode cell
const TURN_ORDER_WATERFALL = "WATERFALL";  // straight down the list, wrap to top (default)
const TURN_ORDER_SNAKE     = "SNAKE";      // bounce at the ends, end captain goes back-to-back

// Snake direction, kept on the sheet so the admin can see/override it live.
// "DOWN" = moving down the tracker list (+1, forward); "UP" = moving up (-1, reverse).
const TURN_DIRECTION_CELL = "C16";   // adjust to a free cell near TURN_ORDER_CELL
const TURN_DIR_DOWN = "DOWN";   // forward / +1 (default)
const TURN_DIR_UP   = "UP";     // reverse / -1

//TODO read this from the sheet instead of hardcoding it
const TEAM_BUDGET = 100;

// ----- Rules & info panel (captain page + spectator board) -----
// Shown in the collapsible "Rules & Links" panel on both the captain page and the
// board. Both pages render this single, sectioned content (WebApp.js#buildInfoSections
// fills it in at page load). Edit the copy freely.
//
// Two pieces of light markup are processed at render time:
//   {TOKEN}   — replaced with a live value or a variant snippet (see the token list in
//               buildInfoSections): {OPENING_SECONDS} {AUTO_SECONDS} {SMALL_BLIND}
//               {NUM_CAPTAINS} {TURN_ORDER} {SELL_MODE}.
//   *term*    — the wrapped term is emphasized as a keyword (rendered <span class="info-key">).
// Everything else is plain text (HTML-escaped), so write apostrophes / "&" freely.
const AUCTION_INFO_SECTIONS = [
  {
    heading: "Bidding phase",
    items: [
      "When a player is on the block, any captain can place a bid.",
      "A new bid must beat the current bid by at least $1.",
      "The *max bid* of a captain is the highest amount they can bid on a player. (It is calculated from the total team budget ${TEAM_BUDGET}, the minimum player cost ${SMALL_BLIND} and the costs of players already in the team.)",
      "A captain can not bid if the current bid exceeds their max bid or their team is full.",
      "{SELL_MODE}",
    ],
  },
  {
    heading: "Opening bid phase",
    items: [
      "When it is a captains *turn* they have {OPENING_SECONDS}seconds to pick an available player and place an *opening bid*.",
      "Alternatively they can *Skip* to pass their turn.",
      "Any opening bid must be at least ${SMALL_BLIND}.",
      "The opening turn order is at the bottom of the teams page. Full teams are skipped.",
    ],
  },  
  {
    heading: "Teams page details",
    items: [
      "Player roles are only displayed to help the captains draft good teams, they are not binding (roles can be swapped).",
    ],
  },
];

// Conditional snippets picked at render time from the live sheet settings. The chosen
// one is substituted in for {TURN_ORDER} / {SELL_MODE} above (and may carry its own tokens).
const AUCTION_INFO_VARIANTS = {
  TURN_ORDER_WATERFALL: "It moves down the list and wraps back to the top.",
  TURN_ORDER_SNAKE:     "It snakes back and forth, so the captain at each end bids twice in a row.",
  SELL_MODE_AUTO:       "Each bid refreshes a {AUTO_SECONDS}second countdown; when it ends the player is sold to the highest bidder.",
  SELL_MODE_MANUAL:     "The admin marks the player as *Sold* once bidding settles.",
};

// Extra links shown on the CAPTAIN page beside the auto-added "View Team Board" link.
// e.g. { label: "Auction Sheet", url: "https://..." }
const CAPTAIN_LINKS = [
  // { label: "Full Rules", url: "https://..." },
];

// ----- Captain page theme -----
// Visual theme for the captain web page. Change this one value (then redeploy)
// to restyle every captain's page. Options:
//   "draftroom"    - dark, gold-on-charcoal auction board (default)
//   "auctionhouse" - light, refined cream + antique-gold lot-card look
//   "terminal"     - green-on-black trading-floor / terminal
//   "broadcast"    - navy draft-night TV with red lower-thirds
//   "brutalist"    - stark black-on-paper with one alarm-red accent
//   "casino"       - poker-felt green with neon + gold chip-stack energy
const CAPTAIN_THEME = "draftroom";

// Google Fonts stylesheet per theme. Only the active theme's fonts are loaded,
// so adding themes never bloats a captain's page load.
const THEME_FONT_URLS = {
  draftroom:    "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap",
  auctionhouse: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Outfit:wght@300;400;500;600&display=swap",
  terminal:     "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap",
  broadcast:    "https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800;900&display=swap",
  brutalist:    "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800;900&family=JetBrains+Mono:wght@500;700&display=swap",
  casino:       "https://fonts.googleapis.com/css2?family=Bungee&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap",
};

// ----- Public team board (read-only spectator page) -----
// Served from the same web-app URL with ?view=board. No captain name/code needed.
// Reads a single dedicated "Board" data block so the whole board is one batched read,
// then caches the built payload (see WebApp.js#getBoardState) — keeps it fast and within
// Google limits even with ~100 spectators polling. See CLAUDE.md "Scale & Google limits".

const BOARD_SHEET     = "Data Board";   // dedicated tab holding the consolidated board block
const BOARD_FIRST_ROW = 2;         // row 1 is headers; data rows start here
const BOARD_NUM_COLS  = 21;        // columns A..U (read in one getValues; see the layout below)
const BOARD_MAX_ROWS  = 125;       // rows scanned per read — covers both the team rows
                                   // (first NUM_CAPTAINS) and the longer available-players list

// Board block layout (cols A..U). The first NUM_CAPTAINS rows are teams, one row each;
// the Available Players list (T/U) can run far longer, hence BOARD_MAX_ROWS.
//   A  captain name            (identifies the team)
//   B  captain price           (the captain's own cost; feeds the max-bid calc)
//   C/D  player1 name / price   E/F  player2    G/H  player3   I/J  player4
//   K  max bid                 L  player count        M  full? (1/0)
//   N..S  role-drafted flags (1/0) in ROLE_LABELS order
//   T  available player name   U  available player role
// PRICE pairs are read via TEAM_SLOTS (4 drafted slots) from Helpers/Config.
// 0-based column indices into the read block:
const BOARD_COL_MAXBID     = 10;   // K
const BOARD_COL_FULL       = 12;   // M (Player Count sits at L, between max bid and full)
const BOARD_COL_ROLE_FIRST = 13;   // N..S, in ROLE_LABELS order
const BOARD_COL_AVAIL_NAME = 19;   // T
const BOARD_COL_AVAIL_ROLE = 20;   // U

// Role order — matches the 6 role-flag columns (L..Q) AND the role icon set.
const ROLE_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"];

// Role icons (transparent-background PNGs, same as the sheet). The script reads them from
// Drive once at page load, base64-inlines them, and caches them — the browser fetches no
// images. Provide EITHER a folder of files named per role (e.g. "top.png") OR explicit IDs.
const ROLE_ICON_FOLDER_ID = "1em-bKBSfS7SaYNmpLQTtp7B0Zz9hifAG";    // <-- Drive folder ID containing the 6 role icons
const ROLE_ICON_FILE_IDS  = {};    // optional override, e.g. { Top: "<fileId>", ... }

// Board poll/cache cadence. The board only needs to refresh every few seconds; a short
// server cache means actual sheet reads are capped at ~1 per this interval no matter how
// many spectators are watching.
const BOARD_CACHE_TTL_SECONDS = 3;

// ----- Captain-page state block (drives getState in one batched read) -----
// A dedicated tab that mirrors (via cell references) everything the captain page polls,
// so getState reads it in a single getValues() instead of many scattered cell reads.
// Singletons live in the first data row; the per-captain Captain/Max-Bid pairs and the
// Available Players list run down their columns, hence CAPTAIN_STATE_MAX_ROWS.
//
// Block layout (cols A..L), row 1 = headers, data from CAPTAIN_STATE_FIRST_ROW:
//   A  highest bid (singleton)     B  by captain (singleton)    C  current player (singleton)
//   D  captain  / E  max bid       (per-captain list, one row each)
//   F  opening turn (list/order)   G  small blind (singleton)
//   H  available player name       (list)
//   I  team budget (singleton)     J  auto sell countdown (singleton)
//   K  auction status (singleton)  L  sell mode (singleton)
const CAPTAIN_STATE_SHEET     = "Data Captain Page";   // dedicated tab; adjust to the exact tab name
const CAPTAIN_STATE_FIRST_ROW = 2;                // row 1 is headers; data starts here
const CAPTAIN_STATE_NUM_COLS  = 12;               // columns A..L
const CAPTAIN_STATE_MAX_ROWS  = 125;              // covers the Available Players list

// 0-based column indices into the read block.
const CS_HIGHEST_BID    = 0;   // A
const CS_BY_CAPTAIN     = 1;   // B
const CS_CURRENT_PLAYER = 2;   // C
const CS_CAPTAIN        = 3;   // D  (per-captain list, paired with CS_MAX_BID)
const CS_MAX_BID        = 4;   // E
const CS_OPENING_TURN   = 5;   // F
const CS_SMALL_BLIND    = 6;   // G
const CS_AVAIL_PLAYER   = 7;   // H
const CS_TEAM_BUDGET    = 8;   // I
const CS_AUTO_COUNTDOWN = 9;   // J
const CS_STATUS         = 10;  // K
const CS_SELL_MODE      = 11;  // L