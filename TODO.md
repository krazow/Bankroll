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

## Phase 6 · Easier flow (from the usability tests)

- [x] Save / Start button pinned on screen on every form
- [x] Shorter start form: big blind, expenses and notes under "More options"
- [x] Welcome on first launch: currency, starting bankroll, usual game and stakes
- [x] "‹ Back" on every sub-screen
- [x] "Forgot PIN?" on the lock screen: restore a backup, or erase and start over
- [x] Backup reminder after 10 sessions or 14 days, with one-tap backup
- [x] Undo an ended session and keep playing
- [x] Quick past-session logging: day, start time and length buttons
- [x] Live tournaments: + Add-on, + Bounty, Busted / Cashed
- [x] "Install app" card, with iPhone steps
- [x] 44px buttons on session pages
- [x] Search and filter the sessions list

## Phase 7 · Start screen & clarity

From the second walkthrough (Nov 18). All five start-screen options were picked; choose which parts to combine when building. Screenshots: `docs/start-screen/`.

- [ ] Option 1 · Welcome hero: headline, description, three feature points; big bankroll number for regulars
- [ ] Option 2 · Bankroll dashboard: balance with profit graph, month / per-hour / sessions strip, quick-action buttons
- [ ] Option 3 · Getting-started checklist: "Get set up, 1 of 5"; monthly goal bar for regulars
- [ ] Option 4 · Action tiles: six labelled tiles with a line each
- [ ] Option 5 · This week + how it works: 1-2-3 steps and a tip; week chart and insight card for regulars
- [ ] Bankroll row looks tappable ("Add money" at $0)
- [ ] Hide Stats filters until there's a finished session
- [ ] Plain-English bankroll check
- [ ] Per-hour shown the same way everywhere ("$6/hr")
- [ ] Explain or remove the repeated profit (All-time tile vs Bankroll total)
- [ ] Backup reminder below Start a session
- [ ] Label the green ＋ button
- [ ] About page: what the app does, privacy, version

## Extras

- [x] Tutorial video (features and security), subtitles and YouTube thumbnail: [on YouTube](https://youtube.com/shorts/_pYxyl0TdmM)
- [x] Demo video (slide page before each feature, real use with tap highlights): [on YouTube](https://youtu.be/GSvarfdN8RM)

- [x] Video: keep titles and subtitles clear of YouTube's channel info on phones (Shorts safe area)
- [ ] Re-upload the fixed video to YouTube

## Later ideas

- [ ] Google Drive backup (needs a Google Cloud OAuth client)
- [ ] Full hand replayer
- [x] Staking / backer tracking (backer deals, makeup, settlements and statements, selling action)
