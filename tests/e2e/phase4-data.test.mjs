// Phase 4 QA: CSV export/import, JSON backup/restore, GitHub Gist backup (mocked), appearance,
// running-session notification, share card, PIN lock, erase all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, openApp, nav, noErrors, until } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });
const text = (page, sel) => page.locator(sel).first().innerText();

async function seed(page) {
  return page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    const t = new Date(2026, 10, 3, 19, 0).getTime(), H = 3600e3;
    await db.put('sessions', M.newSession({ stakes: '1/2', venue: 'Wildhorse', start: t, end: t + 4 * H, buyIns: [{ amount: 200 }], cashOut: 450, notes: 'good, "solid" game' }));
    await db.put('sessions', M.newSession({ type: 'tourney', start: t + 864e5, end: t + 864e5 + 5 * H, buyIns: [{ amount: 110 }], tourney: { buyIn: 100, fee: 10, prize: 0, place: 40, entrants: 90 } }));
    await db.put('transactions', { bankrollId: await db.getSetting('defaultBankroll'), kind: 'deposit', amount: 1000, date: t - 864e5, note: 'start' });
    await db.put('hands', { hero: ['As', 'Ad'], board: [], action: 'raise', date: t });
  });
}
async function downloadFrom(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: dl.suggestedFilename(), body: fs.readFileSync(await dl.path(), 'utf8') };
}

test('CSV exports for sessions and deposits', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/settings');
  await page.waitForSelector('#export-csv');
  const s = await downloadFrom(page, '#export-csv');
  assert.match(s.name, /^bankroll-sessions-\d{4}-\d\d-\d\d\.csv$/);
  const lines = s.body.trim().split(/\r\n/);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Date,Start,End,Hours,Type/);
  assert.match(lines[1], /2026-11-03,2026-11-03 19:00,2026-11-03 23:00,4,Cash,Live,NLH,1\/2,2,Wildhorse,Main,200,450/);
  assert.match(lines[1], /"good, ""solid"" game"$/);
  assert.match(lines[2], /Tournament/);
  const t = await downloadFrom(page, '#export-tx-csv');
  assert.match(t.body, /Deposit,1000,start/);
  noErrors(page);
  await context.close();
});

test('full JSON backup and restore', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await page.evaluate(async () => { const db = await import('./js/db.js'); await db.setSetting('gist', { token: 'secret-token' }); await db.setSetting('currency', '€'); });
  await nav(page, '/settings');
  const b = await downloadFrom(page, '#backup-json');
  assert.match(b.name, /^bankroll-backup-.*\.json$/);
  assert.ok(!b.body.includes('secret-token'), 'the GitHub token never goes into a backup');
  const dump = JSON.parse(b.body);
  assert.equal(dump.data.sessions.length, 2);
  // wipe, then restore from the file
  await page.evaluate(async () => { const db = await import('./js/db.js'); for (const s of await db.all('sessions')) await db.remove('sessions', s.id); });
  await page.setInputFiles('#restore-file', { name: b.name, mimeType: 'application/json', buffer: Buffer.from(b.body) });
  await page.click('.sheet button[data-ok]');
  await until(page, async () => (await (await import('./js/db.js')).all('sessions')).length === 2);
  const after = await page.evaluate(async () => { const db = await import('./js/db.js'); return { hands: (await db.all('hands')).length, gist: await db.getSetting('gist'), cur: await db.getSetting('currency') }; });
  assert.equal(after.hands, 1);
  assert.equal(after.gist.token, 'secret-token', 'this device keeps its token');
  assert.equal(after.cur, '€');
  // a wrong file is refused and nothing changes
  await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('.toast:has-text("not a Bankroll backup")');
  noErrors(page);
  await context.close();
});

test('CSV import from another tracker, with duplicates skipped', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/settings/import' });
  const csv = [
    'Start Time,End Time,Game,Limit,Location,Buy In,Cash Out,Notes',
    '11/01/2026 7:00 PM,11/01/2026 11:30 PM,NL Holdem,1/2,Wildhorse,300,520,',
    '11/02/2026 6:00 PM,11/03/2026 1:00 AM,PLO,2/5,Snoqualmie,1000,400,"rough, night"',
    ',,NLH,1/2,X,100,100,missing date',
  ].join('\n');
  await page.setInputFiles('#import-file', { name: 'pbt.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForSelector('#import-summary');
  assert.match(await text(page, '#import-summary'), /2 sessions to import, net -\$380.*1 row/);
  assert.equal(await page.inputValue('select[name="map-stakes"]'), '3', 'Limit column mapped to stakes');
  await page.click('#do-import');
  await page.waitForSelector('#session-list');
  assert.equal(await page.locator('#session-list li').count(), 2);
  assert.match(await page.innerText('main'), /2\/5 PLO/);
  // importing the same file again adds nothing
  await nav(page, '/settings/import');
  await page.setInputFiles('#import-file', { name: 'pbt.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForSelector('#import-summary');
  assert.match(await text(page, '#import-summary'), /0 sessions to import.*2 already in Bankroll/);
  assert.equal(await page.isDisabled('#do-import'), true);
  noErrors(page);
  await context.close();
});

test('GitHub Gist backup and restore (GitHub mocked)', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  let stored = null; const calls = [];
  await context.route('https://api.github.com/**', async route => {
    const req = route.request();
    calls.push(`${req.method()} ${new URL(req.url()).pathname} ${req.headers().authorization}`);
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const body = JSON.parse(req.postData());
      assert.equal(body.public, false);
      stored = body.files['bankroll-backup.json'].content;
      return route.fulfill({ json: { id: 'abc123' } });
    }
    return route.fulfill({ json: { id: 'abc123', files: { 'bankroll-backup.json': { content: stored, truncated: false } } } });
  });
  await nav(page, '/settings');
  await page.fill('#gist-form input[name="token"]', 'ghp_test');
  await page.check('#gist-form input[name="auto"]');
  await page.click('#gist-form button[type="submit"]');
  await page.waitForSelector('#gist-backup:not([disabled])');
  await page.click('#gist-backup');
  await page.waitForSelector('#gist-last');
  assert.equal(await page.inputValue('#gist-form input[name="id"]'), 'abc123');
  assert.ok(!stored.includes('ghp_test'), 'token not uploaded');
  assert.equal(JSON.parse(stored).data.sessions.length, 2);
  // auto-backup after finishing a session uses PATCH on the same gist
  await page.evaluate(async () => { const db = await import('./js/db.js'); const M = await import('./js/model.js'); await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 100 })); });
  await nav(page, '/live');
  await page.click('#btn-end');
  await page.fill('.sheet input[name="cashOut"]', '100');
  await page.click('.sheet button:has-text("End session")');
  await page.waitForTimeout(800);
  assert.ok(calls.some(c => c.startsWith('PATCH /gists/abc123 Bearer ghp_test')), calls.join(' | '));
  assert.equal(JSON.parse(stored).data.sessions.length, 3);
  // restore
  await page.evaluate(async () => { const db = await import('./js/db.js'); for (const s of await db.all('sessions')) await db.remove('sessions', s.id); });
  await nav(page, '/settings');
  await page.click('#gist-restore');
  await page.click('.sheet button[data-ok]');
  await until(page, async () => (await (await import('./js/db.js')).all('sessions')).length === 3);
  // a bad token gives a clear message
  await context.unroute('https://api.github.com/**');
  await context.route('https://api.github.com/**', r => r.fulfill({ status: 401, json: {} }));
  await page.click('#gist-backup');
  await page.waitForSelector('.toast:has-text("did not accept the token")');
  page.errors = page.errors.filter(e => !/status of 401/.test(e)); // the browser logs the refused request itself
  noErrors(page);
  await context.close();
});

test('appearance: light theme and large buttons are saved', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/settings' });
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.click('#theme label:has-text("Light")');
  await page.click('#size label:has-text("Large")');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.size === 'large');
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
  assert.equal(await page.getAttribute('html', 'data-size'), 'large');
  noErrors(page);
  await context.close();
});

test('at-the-table UI: live screen buttons are big enough to hit one-handed', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => { const db = await import('./js/db.js'); const M = await import('./js/model.js'); await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 100 })); });
  await nav(page, '/live');
  await page.waitForSelector('#btn-end');
  const sizes = await page.$$eval('#btn-rebuy, #btn-stack, #btn-pause, #btn-expense, #btn-end', b => b.map(x => x.getBoundingClientRect().height));
  assert.ok(sizes.every(hgt => hgt >= 64), 'buttons ≥ 64px: ' + sizes);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no sideways scrolling on a phone');
  noErrors(page);
  await context.close();
});

test('share card makes a PNG image', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/sessions');
  await page.click('#session-list a.item >> nth=1');
  await page.waitForSelector('#share-session');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#share-session')]);
  assert.match(dl.suggestedFilename(), /^bankroll-2026-11-0\d\.png$/);
  const buf = fs.readFileSync(await dl.path());
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  assert.ok(buf.length > 10000);
  await nav(page, '/stats');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#share-stats')]);
  assert.equal(dl2.suggestedFilename(), 'bankroll-stats.png');
  noErrors(page);
  await context.close();
});

test('running-session notification and badge', async () => {
  const { page, context } = await openApp(browser, srv.url, { serviceWorkers: 'allow' });
  await context.grantPermissions(['notifications'], { origin: srv.url.replace(/\/$/, '') });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await nav(page, '/settings');
  await page.check('#notify-toggle');
  await page.waitForSelector('.toast:has-text("Notifications on")');
  const count = () => page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications({ tag: 'bankroll-live' })).length);
  await page.evaluate(async () => { const db = await import('./js/db.js'); const M = await import('./js/model.js'); await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 200, venue: 'Wildhorse' })); });
  const bodies = () => page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).getNotifications({ tag: 'bankroll-live' })).map(n => n.body));
  let body = null;
  for (let i = 0; i < 40 && !body; i++) { body = (await bodies())[0]; if (!body) await page.waitForTimeout(100); }
  assert.match(body, /1\/2 NLH @ Wildhorse · in for \$200/);
  await nav(page, '/live');
  await page.click('#btn-end');
  await page.fill('.sheet input[name="cashOut"]', '250');
  await page.click('.sheet button:has-text("End session")');
  await page.waitForSelector('#net');
  for (let i = 0; i < 40 && (await count()) > 0; i++) await page.waitForTimeout(100);
  assert.equal(await count(), 0, 'notification cleared when the session ends');
  noErrors(page);
  await context.close();
});

test('PIN lock: set, lock on open, wrong and right PIN, turn off', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/settings' });
  const enterPin = async pin => {
    const sh = page.locator('.sheet-back.show').last();
    await sh.locator('input[name="pin"]').fill(pin); await sh.locator('button[type="submit"]').click();
    await page.waitForTimeout(350);
  };
  await page.click('#pin-on');
  await enterPin('2468'); await enterPin('2468');
  await page.waitForSelector('#pin-status');
  const stored = await page.evaluate(async () => (await import('./js/db.js')).getSetting('pin'));
  assert.ok(stored.hash && !JSON.stringify(stored).includes('2468'), 'only a hash is stored');
  await page.reload();
  await page.waitForSelector('#lock:not([hidden])');
  for (const k of '1111') await page.click(`#lock button[data-key="${k}"]`);
  await page.click('#lock button[data-key="OK"]');
  await page.waitForSelector('#lock-msg.neg');
  await page.keyboard.type('2468'); await page.keyboard.press('Enter');
  await page.waitForSelector('#lock', { state: 'hidden' });
  await page.waitForSelector('html[data-ready="1"]');
  await page.click('#pin-off');
  await enterPin('0000');
  await page.waitForSelector('.toast:has-text("Wrong PIN")');
  await page.click('#pin-off');
  await enterPin('2468');
  await page.waitForSelector('#pin-on');
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.equal(await page.isVisible('#lock'), false);
  noErrors(page);
  await context.close();
});

test('erase all data', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/settings');
  await page.click('#erase-all');
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('#start-live');
  const n = await page.evaluate(async () => (await (await import('./js/db.js')).all('sessions')).length);
  assert.equal(n, 0);
  noErrors(page);
  await context.close();
});
