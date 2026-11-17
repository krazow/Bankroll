# Bankroll

A personal poker session and bankroll tracker. It's an installable web app (PWA): open it in a browser,
add it to your home screen, and it works offline. All data stays on your device.

Plan and progress: [TODO.md](TODO.md).

## Develop

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

## Test

```sh
npm install          # Playwright for the browser tests
npx playwright install chromium
npm test             # unit tests + browser tests
KIT=../release-kit bash tools/qa.sh   # everything the release CI runs
```

## Release

Uses the shared [krazow release kit](https://github.com/krazow/release-kit): type `/release now` in a Claude chat on
this repo. One-time GitHub settings: **Settings → Pages → Source: GitHub Actions**, and
**Settings → Actions → General → Workflow permissions: Read and write**.

- Production: `https://krazow.github.io/Bankroll/`
- Beta: `https://krazow.github.io/Bankroll/beta/` (keeps its own separate data)
