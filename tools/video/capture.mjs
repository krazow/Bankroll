// Films Bankroll for the tutorial: made-up data, phone-size JPEG screenshots + a manifest of captions.
import { startServer, launch } from '../../tests/e2e/helpers.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const OUT = '/tmp/vid/shots';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
let n = 0;

const srv = await startServer();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, serviceWorkers: 'allow', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const go = async (hash, wait = 450) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(wait); };
async function shot(section, title, sub, { dur = 3.6, scrollTo = null, top = null } = {}) {
  if (scrollTo) await page.evaluate(([s, t]) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 68 + (t || 0)); }, [scrollTo, top]);
  else if (top !== null) await page.evaluate(y => window.scrollBy(0, y), top);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.waitForTimeout(350);
  const file = `${OUT}/${String(++n).padStart(2, '0')}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  manifest.push({ file, section, title, sub, dur });
}
const card = (section, title, sub, dur = 2.8, kind = 'card') => manifest.push({ kind, section, title, sub, dur });

await page.goto(srv.url, { waitUntil: 'load' });
await page.waitForSelector('html[data-ready="1"]');

// ---------- made-up data
await page.evaluate(async () => {
  const db = await import('./js/db.js'); const M = await import('./js/model.js');
  const def = await db.getSetting('defaultBankroll');
  const online = await db.put('bankrolls', { name: 'Online', archived: false });
  const now = Date.now(), H = 3600e3, D = 864e5;
  await db.put('transactions', { bankrollId: def, kind: 'deposit', amount: 8000, date: now - 62 * D, note: 'Starting bankroll' });
  await db.put('transactions', { bankrollId: def, kind: 'withdrawal', amount: 400, date: now - 20 * D, note: 'Paid a bill' });
  await db.put('transactions', { bankrollId: online.id, kind: 'deposit', amount: 6000, date: now - 50 * D, note: 'Site deposit' });
  const venues = [['1/2', 'NLH', 'Wildhorse'], ['1/3', 'NLH', 'Snoqualmie'], ['2/5', 'NLH', 'Wildhorse'], ['1/2', 'PLO', 'Home game'], ['1/2', 'NLH', 'Emerald Queen']];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 38; i++) {
    const [st, g, v] = venues[i % venues.length];
    const day = now - (60 - i * 1.55) * D; const d = new Date(day); d.setHours(i % 3 ? 19 : 13, 0, 0, 0);
    const start = d.getTime(), hrs = 2 + Math.round(rnd() * 5 * 2) / 2;
    const bb = M.parseStakes(st).bb, bi = bb * 100;
    const swing = Math.round((rnd() - 0.42) * bi * 1.6 / 5) * 5;
    const s = M.newSession({ stakes: st, game: g, venue: v, bankrollId: def, start, end: start + hrs * H, buyIns: [{ amount: bi, at: start }], cashOut: Math.max(0, bi + swing),
      expenses: i % 2 ? [{ kind: 'Tips', amount: 10 }] : [] });
    if (i % 3 === 0) s.review = { mood: 2 + (i % 4), tilt: 1 + (i % 3), focus: 3 + (i % 3), sleep: 6 + (i % 3), alcohol: i % 4 ? 0 : 2, keyHands: '', lesson: '' };
    await db.put('sessions', s);
  }
  for (let i = 0; i < 6; i++) {
    const start = now - (55 - i * 9) * D;
    const prize = [0, 420, 0, 0, 1150, 0][i];
    await db.put('sessions', M.newSession({ type: 'tourney', game: 'NLH', venue: i % 2 ? 'Wildhorse' : 'GGPoker', setting: i % 2 ? 'live' : 'online', bankrollId: i % 2 ? def : online.id,
      start, end: start + 5 * H, buyIns: M.tourneyEntries(100, 15, 1, start), tourney: { buyIn: 100, fee: 15, entrants: 60 + i * 12, place: prize ? [0, 6, 0, 0, 2, 0][i] : 25 + i, prize, bounties: 0 } }));
  }
  await db.setSetting('goals', { profit: 2000, hours: 60, sessions: 16 });
  await db.setSetting('rules', { cashBuyIns: 20, buyInBB: 100, tourneyBuyIns: 50, stopLoss: 400, stopWin: 400 });
  await db.put('opponents', { name: 'Red Hat Mike', venue: 'Wildhorse', style: 'Calling station', notes: 'Never folds top pair' });
});
await page.reload(); await page.waitForSelector('html[data-ready="1"]');

// ---------- intro
card('intro', 'Bankroll', 'Track every poker session.\nPrivate by design.', 4, 'title');

// ---------- 1. live session
card('Live sessions', 'Track a live session', 'Timer, rebuys, breaks and your result, one-handed at the table');
await go('/');
await shot('Live sessions', 'Your home screen', 'Bankroll balance, stats and one-tap start', { dur: 4.5 });
await go('/new?live=1');
await page.fill('input[name="stakes"]', '1/2'); await page.fill('input[name="venue"]', 'Wildhorse'); await page.fill('input[name="buyIn"]', '300');
await shot('Live sessions', 'Start in seconds', 'Pick the game, stakes, venue and buy-in');
await page.evaluate(async () => {
  const db = await import('./js/db.js'); const M = await import('./js/model.js');
  await db.put('sessions', M.startLive({ stakes: '1/2', venue: 'Wildhorse', firstBuyIn: 300, bankrollId: await db.getSetting('defaultBankroll') }, Date.now() - (72 * 60e3 + 14e3)));
});
await go('/live', 700);
await shot('Live sessions', 'The clock keeps running', 'Even if you close the app or lock your phone', { dur: 1.2 });
await page.waitForTimeout(750); await shot('Live sessions', 'The clock keeps running', 'Even if you close the app or lock your phone', { dur: 1.2 });
await page.waitForTimeout(750); await shot('Live sessions', 'The clock keeps running', 'Even if you close the app or lock your phone', { dur: 1.6 });
await page.click('#btn-rebuy');
await page.waitForTimeout(600);
await page.fill('.sheet input[name="amount"]', '300');
await shot('Live sessions', 'Rebuys and add-ons', 'Every buy-in is logged with the time');
await page.click('.sheet button:has-text("Add")'); await page.waitForTimeout(400);
await page.click('#btn-stack'); await page.waitForTimeout(350);
await page.fill('.sheet input[name="amount"]', '1020'); await page.click('.sheet button:has-text("Update")'); await page.waitForTimeout(500);
await shot('Live sessions', 'Know where you stand', 'Update your stack to see your profit live — plus stop-win and stop-loss warnings', { dur: 4.8 });
await page.click('#btn-pause'); await page.waitForTimeout(400);
await shot('Live sessions', 'Take a break', 'Break time doesn’t count toward your hourly rate');
await page.click('#btn-pause'); await page.waitForTimeout(300);
await page.click('#btn-end'); await page.waitForTimeout(600);
await page.fill('.sheet input[name="cashOut"]', '1020');
await shot('Live sessions', 'Cash out', 'Enter what you walked away with');
await page.click('.sheet button:has-text("End session")'); await page.waitForSelector('#review-form'); await page.waitForTimeout(400);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('Live sessions', 'Your result', 'Net result, time and hourly rate after tips and expenses');
await page.click('#review-form .scale label:has(input[name="mood"][value="4"])');
await page.click('#review-form .scale label:has(input[name="tilt"][value="1"])');
await page.click('#review-form .scale label:has(input[name="focus"][value="5"])');
await shot('Live sessions', 'Quick review', 'Rate mood, tilt and focus — Stats shows how they affect your results', { scrollTo: '#review', top: -6, dur: 4.5 });
await page.click('#review-form button[type="submit"]'); await page.waitForTimeout(300);

// ---------- 2. log & bankroll
card('Sessions & bankroll', 'Log sessions & manage your bankroll', 'Cash games, tournaments, deposits and withdrawals');
await go('/new');
await page.click('.seg label:has-text("Tournament")');
await page.fill('input[name="tBuyIn"]', '100'); await page.fill('input[name="tFee"]', '15'); await page.fill('input[name="tEntrants"]', '84');
await page.fill('input[name="tPlace"]', '3'); await page.fill('input[name="tPrize"]', '1260');
await shot('Sessions & bankroll', 'Log past sessions', 'Tournaments too: fee, re-entries, finish and prize', { scrollTo: 'fieldset.only-tourney', top: -250 });
await go('/sessions');
await shot('Sessions & bankroll', 'Every session, by month', 'Tap any session to see or edit it');
await go('/bankroll');
await shot('Sessions & bankroll', 'Bankroll ledger', 'Deposits, withdrawals and results, with a running balance — keep several bankrolls');

// ---------- 3. stats
card('Stats', 'See what’s working', 'Stats, graphs and goals to find your leaks');
await go('/stats', 700);
await shot('Stats', 'Your numbers', 'Profit, hourly rate, BB/hour, win rate and more');
await shot('Stats', 'Profit over time', 'By session or by date', { scrollTo: '#profit-chart', top: -56 });
await page.selectOption('#group-by', 'venue'); await page.waitForTimeout(400);
await shot('Stats', 'Breakdowns and filters', 'By game, stakes, venue, day, time of day or session length', { scrollTo: '#breakdown', top: -6 });
await shot('Stats', 'Calendar', 'Winning and losing days at a glance', { scrollTo: '#calendar', top: -6 });
await shot('Stats', 'Mindset vs results', 'See how tilt, sleep and drinks change your hourly rate', { scrollTo: '#mindset', top: -6 });
await go('/');
await shot('Stats', 'Goals and bankroll rules', 'Monthly goals, plus a warning when your bankroll is too small for your stakes', { scrollTo: '#goals-card', top: -420, dur: 4.6 });

// ---------- 4. tools
card('Tools', 'Built-in tools', 'Hand notes, opponents, odds, and home-game helpers');
await go('/tools/equity');
const pick = async cards => { for (const c of cards) await page.click(`.sheet .picker button[data-card="${c}"]`); await page.click('#cards-done'); await page.waitForTimeout(300); };
await page.click('.pick-player[data-player="0"]'); await pick(['As', 'Kd']);
await page.click('.pick-player[data-player="1"]'); await pick(['7h', '6h']);
await page.click('#pick-board'); await pick(['Ac', '2h', '9h']);
await page.click('#calc'); await page.waitForSelector('#equity-result .eq-1');
await shot('Tools', 'Odds & equity', 'Hand vs hand on any board, plus pot odds and outs');
await go('/tools/hands?new=1');
await page.click('#pick-hero'); await pick(['Qs', 'Qh']);
await page.click('#pick-board'); await pick(['Qd', '8c', '8s']);
await page.selectOption('#hand-form select[name="position"]', 'BTN');
await page.fill('#hand-form textarea[name="action"]', 'CO opens 15, I 3-bet 45, call.\nFlop full house: check-raise.');
await shot('Tools', 'Hand notes', 'Save key hands with cards, action and the lesson');
await go('/tools/timer');
await page.click('#timer-form button[type="submit"]'); await page.waitForSelector('#timer-clock'); await page.click('#timer-play'); await page.waitForTimeout(2200);
await shot('Tools', 'Blind timer', 'For home tournaments — keeps time even when the screen is off');
await go('/tools/settle');
const fill = async (i, name, a, b) => { const r = page.locator('.settle-row').nth(i); await r.locator('input').nth(0).fill(name); await r.locator('input').nth(1).fill(String(a)); await r.locator('input').nth(2).fill(String(b)); };
await fill(0, 'Ann', 100, 260); await fill(1, 'Bob', 200, 60); await fill(2, 'Cy', 100, 80); await page.waitForTimeout(300);
await shot('Tools', 'Settle up', 'Who pays whom after a home game, in the fewest payments');

// ---------- 5. data
card('Your data', 'Your data, your way', 'Export, import and back up');
await go('/settings');
await shot('Your data', 'Export and back up', 'CSV for taxes, a full backup file, and restore', { scrollTo: '#data', top: -6 });
await go('/settings/import');
const csv = 'Start Time,End Time,Game,Limit,Location,Buy In,Cash Out\n10/01/2026 7:00 PM,10/01/2026 11:00 PM,NL Holdem,1/2,Lucky Eagle,200,410\n10/03/2026 6:00 PM,10/03/2026 10:30 PM,NL Holdem,1/3,Lucky Eagle,300,120\n';
await page.setInputFiles('#import-file', { name: 'other-app.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await page.waitForSelector('#import-summary');
await shot('Your data', 'Import from other apps', 'Bring sessions in from other trackers or a spreadsheet — duplicates are skipped', { scrollTo: '#import-summary', top: -60, dur: 4.4 });

// ---------- 6. security
card('Security', 'Private and secure', 'Your poker results are nobody else’s business', 3.8);
await page.evaluate(async () => { const lock = await import('./js/lock.js'); await lock.setPin('2468', 0); });
await go('/more'); await go('/settings');
await shot('Security', 'Your data stays on your phone', 'No account, no server, no tracking. Add a PIN lock: only a salted hash is stored, never the PIN', { scrollTo: '#privacy', top: -6, dur: 4.6 });
await page.click('#lock-now'); await page.waitForSelector('#lock:not([hidden])');
for (const k of '13') await page.click(`#lock button[data-key="${k}"]`);
await shot('Security', 'Locked when you leave', 'Locks on open and after the app is in the background');
for (const k of '57') await page.click(`#lock button[data-key="${k}"]`);
await page.click('#lock button[data-key="OK"]'); await page.waitForTimeout(300);
await shot('Security', 'Wrong PIN? Stays locked', 'Nobody browses your results on your phone');
await page.keyboard.type('2468'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
await page.evaluate(async () => { const db = await import('./js/db.js'); await db.setSetting('gist', { token: 'ghp_demo_token_for_video_only', id: '', auto: true }); });
await go('/more'); await go('/settings');
await shot('Security', 'Private, optional cloud backup', 'Backs up to a private GitHub gist — your token stays on this device and never goes into a backup', { scrollTo: '#gist', top: -6, dur: 5 });
// offline
await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1200);
await ctx.setOffline(true);
await page.reload(); await page.waitForSelector('#lock:not([hidden])');
await page.keyboard.type('2468'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
await go('/');
await shot('Security', 'Works offline', 'Airplane mode in the card room? Everything still works', { dur: 4.2 });
await ctx.setOffline(false);

// beta: its own storage
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const beta = http.createServer((q, r) => { let f = path.join('/tmp/vbeta', decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) return r.writeHead(404).end(); r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => beta.listen(0, '127.0.0.1', r));
const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, serviceWorkers: 'block' });
const bp = await bctx.newPage();
await bp.goto(`http://127.0.0.1:${beta.address().port}/`); await bp.waitForSelector('html[data-ready="1"]'); await bp.waitForTimeout(400);
const bfile = `${OUT}/${String(++n).padStart(2, '0')}.jpg`;
await bp.screenshot({ path: bfile, type: 'jpeg', quality: 92 });
manifest.push({ file: bfile, section: 'Security', title: 'Beta keeps its own data', sub: 'Test new versions without touching your real sessions', dur: 4.2 });

card('outro', 'Bankroll', 'Open it in your browser and add it to your home screen\nkrazow.github.io/Bankroll', 5, 'title');

fs.writeFileSync('/tmp/vid/manifest.json', JSON.stringify(manifest, null, 1));
console.log('shots', n, 'items', manifest.length, 'seconds', manifest.reduce((a, m) => a + m.dur, 0).toFixed(1));
await browser.close(); srv.server.close(); beta.close();
