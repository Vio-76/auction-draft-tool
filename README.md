# Auction Draft Tool

A live, real-time **auction draft** built on [Google Apps Script](https://developers.google.com/apps-script). Six team captains bid on players to fill their rosters, with all state stored in a single Google Sheet — no separate server or database required.

## How it works

The tool has two sides:

- **Admin** — clickable shapes in the spreadsheet drive the auction (Start Auction, advance turn, Open/Close Bidding, Sold!, Skip Captain).
- **Captains** — each captain opens a personal web-app link (`?captain=NAME&code=CODE`) on their phone or laptop. The page updates once per second and lets them place bids.

A turn marker rotates through the captains:

1. **Opening phase** — the captain whose turn it is has 30 seconds to pick a player (from a dropdown of the still-available players) and place an opening bid. If they run out of time, their turn is auto-skipped.
2. **Bidding phase** — bidding opens to every captain until the admin marks the player **Sold!**, which awards the player to the highest bidder and advances to the next captain.

Captains are authenticated by a name + code looked up in an `Auth` sheet, which also stores each captain's maximum bid.

## Project structure

| File | Purpose |
|------|---------|
| `Config.js` | All tunable constants — sheet names, captain count, cell addresses, statuses. **Start here if the sheet layout changes.** |
| `Helpers.js` | Shared logic: sheet reads, auth lookups, turn tracker, team cards, player pool, turn advancement. |
| `Buttons.js` | Functions wired to the admin shapes in the sheet. |
| `WebApp.js` | Web-app entry points: `doGet`, `getState`, `placeBid`, `placeOpeningBid`, `skipTurn`. |
| `Index.html` | The captain-facing single-page UI (polling + countdown timer). Styling is theme-driven via CSS tokens — see [Themes](#themes). |
| `appsscript.json` | Apps Script manifest (web-app access, timezone, runtime). |
| `.clasp.json` | [clasp](https://github.com/google/clasp) configuration (bound script ID). |

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

The bound spreadsheet must contain the sheets and cell layout described in `Config.js` (an `Auction` sheet and an `Auth` sheet). Adjust the constants in `Config.js` to match your sheet if the layout differs.

## Configuration

Common things you may want to change live in `Config.js`:

- `NUM_CAPTAINS` — number of captains in the draft.
- `OPENING_BID_TIMEOUT_SECONDS` — how long a captain has to open before auto-skip.
- `CAPTAIN_THEME` — visual theme for the captain page (see [Themes](#themes)).
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

Each theme is a block of CSS custom properties in `Index.html` keyed off `<body data-theme="...">`; only the active theme's fonts are loaded (`THEME_FONT_URLS` in `Config.js`). Adding a theme means one font-URL entry plus one `[data-theme="..."]` token block — no JavaScript changes. An unknown value falls back to `draftroom`.

## Notes

- All writes use Apps Script's `LockService` to stay safe under concurrent captain actions.
- The web app is deployed with anonymous access, so the per-captain code is the only access gate — treat the links as private.
