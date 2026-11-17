# Bankroll to-do

Built in phases, with QA (unit + browser tests, release-kit checks) at the end of each phase.

## Phase 0 · Setup

- [x] Scaffold the PWA (index.html, manifest, service worker, icons)
- [x] Hook into the shared release kit (`/release now`: build → test → beta → production)
- [x] Hosting on GitHub Pages with HTTPS (through the release kit; needs the one-time repo settings in README)
- [x] Local-first storage with IndexedDB (sessions, bankrolls, venues, settings)

## Phase 1 · Core tracking

- [ ] Live session timer: start, pause for breaks, end; survives closing the app
- [ ] Mid-session rebuys, add-ons and stack updates
- [ ] Quick "log past session" form
- [ ] Session fields: game, stakes, cash/tourney, live/online, venue, notes (extendable pick-lists)
- [ ] Tournament fields: buy-in + fee, entrants, finish place, prize, bounties
- [ ] Expenses per session: tips, food, travel, rake
- [ ] "Repeat last session" one-tap start
- [ ] Bankroll ledger: deposits, withdrawals, balance over time
- [ ] Multiple bankrolls

## Phase 2 · Analytics

- [ ] Dashboard: total profit, hourly rate, sessions, hours, win rate, biggest win/loss
- [ ] Cumulative profit graph
- [ ] Filters and breakdowns by game, stakes, venue, day of week, time of day, session length
- [ ] BB/hour, $/hour; ROI, ITM %, average finish
- [ ] Calendar heatmap
- [ ] Monthly goals with progress bars
- [ ] Bankroll rules: buy-ins per stake, stop-loss / stop-win alerts
- [ ] Post-session review: mood, tilt, focus, sleep, alcohol, key hands

## Phase 3 · Tools

- [ ] Hand notes per session
- [ ] Opponent notes
- [ ] Odds / equity calculator
- [ ] Home-game tools: blind timer, payout calculator, settle-up

## Phase 4 · Data & polish

- [ ] CSV export + JSON backup / restore
- [ ] CSV import from other trackers / spreadsheets
- [ ] Optional backup to a private GitHub Gist
- [ ] Big-button, one-hand, dark-mode UI
- [ ] Running-session notification + home-screen shortcuts
- [ ] Share card image
- [ ] PIN lock
