/**
 * @OnlyCurrentDoc
 *
 * All manually-adjustable constants live here.
 * If the sheet layout changes, this is the only file you should need to edit.
 */

// Sheet names
const AUCT_SHEET = "Auction";
const AUTH_SHEET = "Auth";

// Number of captains
const NUM_CAPTAINS = 6;

//time for captains to submit opening bid before autoskip
const OPENING_BID_TIMEOUT_SECONDS = 30;

// How long the captain page shows the "<player> sold to <captain> for $<bid>"
// banner after each sale. Long enough to read, short enough not to stall the auction.
const SOLD_MESSAGE_DISPLAY_SECONDS = 6;

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