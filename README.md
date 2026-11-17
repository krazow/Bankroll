# Bankroll

A personal poker session and bankroll tracker. It's an installable web app (PWA): open it in a browser,
add it to your home screen, and it works offline. All data stays on your device unless you back it up.

## Features

- **Live sessions**: a timer that keeps running when the app is closed, breaks, rebuys and add-ons, stack updates,
  expenses (tips, food, travel), stop-loss / stop-win warnings, one-tap "repeat last session".
- **Log past sessions**: cash games and tournaments (buy-in + fee, re-entries, place, prize, bounties).
- **Bankrolls**: deposits, withdrawals, a running ledger, several bankrolls, buy-in warnings for the stakes you play.
- **Stats**: profit, $/hour, BB/hour, win rate, biggest win/loss, cumulative graph, breakdowns by game, stakes,
  venue, day, time of day and session length, tournament ROI / ITM / average finish, calendar heatmap,
  monthly goals, and how mood, tilt, focus, sleep and drinks line up with results.
- **Tools**: hand notes with a card picker, opponent notes, odds & equity calculator (pot odds, outs),
  blind timer, payout calculator, settle-up for home games.
- **Data**: CSV export (handy for taxes), CSV import from other trackers, full JSON backup/restore,
  optional backup to a private GitHub Gist, share-card images, PIN lock, dark/light theme and large buttons.

Tutorial video: [watch on YouTube](https://youtube.com/shorts/_pYxyl0TdmM) (2:24, features and security).

Plan and progress: [TODO.md](TODO.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## Develop

No build step and no dependencies. Serve the folder and open it:

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

Code layout: `js/model.js` (session maths), `js/stats.js` (analytics), `js/csv.js`, `js/equity.js`,
`js/homegame.js` are pure and unit-tested; `js/db.js` is the IndexedDB layer; screens are in `js/views/`
and `js/tools/`. Every file under `js/` must be listed in `sw.js` (a test checks this).

## Test

```sh
npm install && npx playwright install chromium
npm test                              # unit tests + browser tests for every phase
KIT=../release-kit bash tools/qa.sh   # everything the release CI runs (release checks, beta + prod builds)
```

## Release

Uses the shared [krazow release kit](https://github.com/krazow/release-kit): type `/release now` in a Claude chat on
this repo. One-time GitHub settings: **Settings → Pages → Source: GitHub Actions**, and
**Settings → Actions → General → Workflow permissions: Read and write**. Optional Android signing secrets are in the
release kit's README.

- Production: `https://krazow.github.io/Bankroll/`
- Beta: `https://krazow.github.io/Bankroll/beta/` (keeps its own separate data)
- Windows installer and Android APK come with each release (`release.json`).
