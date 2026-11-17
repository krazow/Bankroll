# Bankroll to-do

Built in phases, with QA (unit + browser tests, release-kit checks) at the end of each phase.

## Phase 0 · Setup

- [x] Scaffold the PWA (index.html, manifest, service worker, icons)
- [x] Hook into the shared release kit (`/release now`: build → test → beta → production)
- [x] Hosting on GitHub Pages with HTTPS (through the release kit; needs the one-time repo settings in README)
- [x] Local-first storage with IndexedDB (sessions, bankrolls, venues, settings)

## Phase 1 · Core tracking

- [x] Live session timer: start, pause for breaks, end; survives closing the app
- [x] Mid-session rebuys, add-ons and stack updates
- [x] Quick "log past session" form
- [x] Session fields: game, stakes, cash/tourney, live/online, venue, notes (extendable pick-lists)
- [x] Tournament fields: buy-in + fee, entrants, finish place, prize, bounties
- [x] Expenses per session: tips, food, travel, rake
- [x] "Repeat last session" one-tap start
- [x] Bankroll ledger: deposits, withdrawals, balance over time
- [x] Multiple bankrolls

## Phase 2 · Analytics

- [x] Dashboard: total profit, hourly rate, sessions, hours, win rate, biggest win/loss
- [x] Cumulative profit graph
- [x] Filters and breakdowns by game, stakes, venue, day of week, time of day, session length
- [x] BB/hour, $/hour; ROI, ITM %, average finish
- [x] Calendar heatmap
- [x] Monthly goals with progress bars
- [x] Bankroll rules: buy-ins per stake, stop-loss / stop-win alerts
- [x] Post-session review: mood, tilt, focus, sleep, alcohol, key hands

## Phase 3 · Tools

- [x] Hand notes per session
- [x] Opponent notes
- [x] Odds / equity calculator
- [x] Home-game tools: blind timer, payout calculator, settle-up

## Phase 4 · Data & polish

- [x] CSV export + JSON backup / restore
- [x] CSV import from other trackers / spreadsheets
- [x] Optional backup to a private GitHub Gist (Google Drive was swapped for this: no sign-in setup needed)
- [x] Big-button, one-hand, dark-mode UI
- [x] Running-session notification + home-screen shortcuts
- [x] Share card image
- [x] PIN lock

## Extras

- [x] Tutorial video (features and security), subtitles and YouTube thumbnail: [on YouTube](https://youtube.com/shorts/_pYxyl0TdmM)

## Later ideas

- [ ] Google Drive backup (needs a Google Cloud OAuth client)
- [ ] Full hand replayer
- [ ] Staking / backer tracking
