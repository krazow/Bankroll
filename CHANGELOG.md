# Changelog

## Unreleased

### Added

- **Staking and backers:** sell a piece of your action (share % and markup) on any session, even while playing;
  staking packages with makeup that attach themselves to new sessions, settle with your cut of the profit, and close
  when done; record payments both ways; see who owes whom; per-backer statements with CSV export.
- Your bankroll now counts only your own money, and shows separately what you hold for backers. Stats show your share
  after backers, and the sessions CSV has a "Your share of result" column.

## 0.1.0 (2026-11-16)

The first release of Bankroll: a personal poker session and bankroll tracker that installs from the browser,
works offline and keeps all data on your device.

### Added

- **Live sessions:** a timer that keeps running when the app is closed, breaks that don't count toward your hourly
  rate, rebuys and add-ons, stack updates with your profit so far, expenses (tips, food, travel), stop-loss and
  stop-win warnings, and a one-tap "repeat last session".
- **Logging:** past cash games and tournaments (buy-in plus fee, re-entries, players, finish, prize, bounties), with
  pick-lists that remember your games, stakes and venues. Edit or delete any session.
- **Bankrolls:** deposits, withdrawals and a running ledger, several bankrolls, and a warning when your bankroll is
  too small for the stakes you play.
- **Stats:** profit, hourly rate, BB per hour, win rate, biggest win and loss; a profit graph; breakdowns and filters
  by game, stakes, venue, day, time of day and session length; tournament ROI, in-the-money rate and average finish;
  a calendar of winning and losing days; monthly goals; and a post-session review (mood, tilt, focus, sleep, drinks)
  that shows how each one affects your results.
- **Tools:** hand notes with a card picker, opponent notes, an odds and equity calculator (plus pot odds and outs),
  a blind timer for home tournaments, a payout calculator and settle-up for home cash games.
- **Your data:** CSV export (handy for taxes), CSV import from other trackers with duplicates skipped, a full backup
  file and restore, and optional backup to a private GitHub gist (your token never leaves the device).
- **Privacy and comfort:** PIN lock (only a salted hash is stored), dark, light or automatic theme, large buttons for
  one-handed use, a "session running" notification and app badge, share images of a session or your stats, and
  "erase all data".
- Home-screen shortcuts to start a session, open the running one, or log a past one.
- A [tutorial video](https://youtube.com/shorts/_pYxyl0TdmM).
