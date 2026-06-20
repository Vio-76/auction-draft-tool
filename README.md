# Auction Draft Tool

A live, real-time **auction draft** built on [Google Apps Script](https://developers.google.com/apps-script). Six team captains bid on players to fill their rosters, with all state stored in a single Google Sheet — no separate server or database required.

## How it works

The tool has three surfaces:

- **Admin** — clickable shapes in the spreadsheet drive the auction (Start Auction, advance turn, Open/Close Bidding, Sold!, Skip Captain, Toggle Turn Order, Sell Mode AUTO/MANUAL).
- **Captains** — each captain opens a personal web-app link (`?captain=NAME&code=CODE`) on their phone or laptop. The page updates once per second and lets them place bids.
- **Spectators** — a public, read-only team board at `?view=board` (no captain/code) showing every team, the available-player pool, and the current opening-bid order. It polls every few seconds and is served from a short server-side cache.

A turn marker rotates through the captains:

1. **Opening phase** — the captain whose turn it is has 30 seconds to pick a player (from a dropdown of the still-available players) and place an opening bid. If they run out of time, their turn is auto-skipped.
2. **Bidding phase** — bidding opens to every captain until the player is sold. In **MANUAL** sell mode the admin clicks **Sold!**; in **AUTO** mode the server sells to the high bidder after a no-new-bid countdown. Either way the player is awarded to the highest bidder and the turn advances.

The turn rotation supports two orders, switchable live from a sheet cell: **waterfall** (straight down the list, wrapping to the top) and **snake** (bouncing at the ends, so the end captain picks twice in a row).

Captains are authenticated by a name + code looked up in an `Auth` sheet, which also stores each captain's maximum bid.

## Project structure

| File | Purpose |
|------|---------|
| `Config.js` | All tunable constants — sheet names, captain count, cell addresses, statuses, turn order, sell mode, theme, spectator board. **Start here if the sheet layout changes.** |
| `SheetReaders.js` | Generic sheet reads, `Auth`-sheet lookups, small shared utilities. |
| `TurnHelpers.js` | Turn tracker, waterfall/snake order + direction, opening-bid deadline, advance-turn core. |
| `TeamHelpers.js` | Team cards, captain-full lookup, live auction block, open-player pool. |
| `SellHelpers.js` | Sell mode, sold/last-bid clocks, the Sold!-button cooldown, sale logic, auto-sell, outbid checks. |
| `Buttons.js` | Functions wired to the admin shapes in the sheet. |
| `WebApp.js` | Web-app entry points: `doGet` (captain page, or `renderBoard` for `?view=board`), `getState`, `placeBid`, `placeOpeningBid`, `skipTurn`; the board's `getBoardState`/role icons; and the `include()` partial helper. |
| `Index.html` | The captain-facing single-page UI (polling + countdown timer). |
| `Board.html` | The public read-only spectator board (`?view=board`). |
| `ThemeStyles.html`, `InfoPanel.html`, `SharedScripts.html` | Shared partials (theme tokens, the Rules/Links panel, common JS) pulled into both pages via `include()` — see [Themes](#themes). |
| `appsscript.json` | Apps Script manifest (web-app access, timezone, runtime). |
| `.clasp.json` | [clasp](https://github.com/google/clasp) configuration (bound script ID). |

> Apps Script puts every `.js`/`.gs` file in one shared global namespace — there are no imports between files. The split above is organizational only.

## Setup

This project is managed with [clasp](https://github.com/google/clasp), Google's command-line tool for Apps Script.

1. Install clasp and log in:
   ```sh
   npm install -g @google/clasp
   clasp login
   ```
2. The repo is already bound to an Apps Script project via `.clasp.json`. Push the code:
   ```sh
   clasp push
   ```
3. In the Apps Script editor, **deploy the project as a web app** (Deploy → New deployment → Web app). The captain links point at this deployment URL.

The bound spreadsheet must contain the sheets and cell layout described in `Config.js` (an `Auction` sheet, an `Auth` sheet, and — for the spectator board — a `Board` sheet whose one-row-per-team data block is maintained with formulas). Adjust the constants in `Config.js` to match your sheet if the layout differs.

## Configuration

Common things you may want to change live in `Config.js`:

- `NUM_CAPTAINS` — number of captains in the draft.
- `OPENING_BID_TIMEOUT_SECONDS` — how long a captain has to open before auto-skip.
- `CAPTAIN_THEME` — visual theme for the captain page and board (see [Themes](#themes)).
- `TURN_ORDER_CELL` / `TURN_DIRECTION_CELL` — sheet cells holding the live `WATERFALL`/`SNAKE` order and the snake `DOWN`/`UP` direction.
- `SELL_MODE_CELL` and the AUTO-mode countdown / Sold!-cooldown cells — how the bidding phase ends.
- The `BOARD_*`, `ROLE_*` constants — the spectator board's data block and role icons.
- Cell addresses and ranges — where the live auction state, turn tracker, team cards, and player pool live in the sheet.

## Themes

The captain page ships with six visual themes. Switch them by setting one constant in `Config.js` and redeploying:

```js
const CAPTAIN_THEME = "draftroom";   // draftroom | auctionhouse | terminal | broadcast | brutalist | casino
```

| Theme | Look |
|-------|------|
| `draftroom` | Dark gold-on-charcoal auction board (default) |
| `auctionhouse` | Light cream + antique-gold, serif, lot-card luxury |
| `terminal` | Green-on-black monospace trading-floor terminal |
| `broadcast` | Navy draft-night TV with red lower-third labels |
| `brutalist` | Stark black-on-paper with one alarm-red accent |
| `casino` | Poker-felt green with neon and gold chip accents |

Each theme is a block of CSS custom properties keyed off `<body data-theme="...">`. The token blocks live once in the shared `ThemeStyles.html` partial (included by both the captain page and the spectator board, so the chosen theme styles both); only the active theme's fonts are loaded (`THEME_FONT_URLS` in `Config.js`). Adding a theme means one font-URL entry plus one `[data-theme="..."]` token block — no JavaScript changes. An unknown value falls back to `draftroom`.

## Notes

- All writes use Apps Script's `LockService` to stay safe under concurrent captain actions.
- The web app is deployed with anonymous access, so the per-captain code is the only access gate — treat the links as private.
