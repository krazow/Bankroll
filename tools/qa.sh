#!/usr/bin/env bash
# Runs the same QA as the release kit's CI, locally:
#   KIT=/path/to/release-kit bash tools/qa.sh
set -euo pipefail
KIT="${KIT:-../release-kit}"
[ -f "$KIT/scripts/kit.py" ] || { echo "Set KIT to a checkout of github.com/krazow/release-kit"; exit 1; }
echo "== release checks";      python3 "$KIT/scripts/kit.py" check
echo "== build beta + prod";   rm -rf /tmp/bankroll-beta /tmp/bankroll-prod
python3 "$KIT/scripts/kit.py" build-web --channel beta --out /tmp/bankroll-beta >/dev/null
python3 "$KIT/scripts/kit.py" build-web --channel prod --out /tmp/bankroll-prod >/dev/null
echo "== app tests";           npm test
echo "== kit browser check (prod build)"; node "$KIT/scripts/site-check.mjs" /tmp/bankroll-prod /tmp/bankroll-prod
echo "== kit browser check (beta build)"; node "$KIT/scripts/site-check.mjs" /tmp/bankroll-beta /tmp/bankroll-beta
echo "QA passed"
