// Phase 7 QA: edge cases around the easier-flow changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp, nav, noErrors, until } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });
const text = (page, sel) => page.locator(sel).first().innerText();
const H = 3600e3;

// Fresh app with the welcome already done.
async function ready(opts) {
  const r = await openApp(browser, srv.url, opts);
  await r.page.evaluate(async () => { const db = await import('./js/db.js'); await db.setSetting('welcomed', true); await db.setSetting('installDismissed', true); });
  return r;
}
const put = (page, list) => page.evaluate(async list => {
  const db = await import('./js/db.js'); const M = await import('./js/model.js');
  const ids = [];
  for (const p of list) ids.push((await db.put('sessions', { ...M.newSession(p), ...(p.extra || {}) })).id);
  return ids;
}, list);

test('welcome is skipped for people who already have data', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.waitForSelector('#welcome-form');
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.newSession({ start: Date.now() - 4 * 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 100 }));
  });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#welcome').count(), 0);
  assert.equal(await page.evaluate(async () => (await import('./js/db.js')).getSetting('welcomed', false)), true);
  noErrors(page);
  await context.close();
});

test('welcome with nothing filled in saves no deposit and keeps the defaults', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.waitForSelector('#welcome-form');
  await page.click('#welcome-form button[type="submit"]');
  await page.waitForSelector('#welcome', { state: 'detached' });
  const r = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return { txs: (await db.all('transactions')).length, usual: await db.getSetting('usual', null) };
  });
  assert.equal(r.txs, 0);
  assert.equal(r.usual.game, 'NLH');
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  assert.equal(await page.inputValue('input[name="game"]'), 'NLH');
  noErrors(page);
  await context.close();
});

test('past-session form: clear messages for a missing day or length', async () => {
  const { page, context } = await ready();
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  await page.fill('input[name="buyIn"]', '100');
  await page.fill('input[name="cashOut"]', '50');
  await page.click('.actionbar button[type="submit"]');
  assert.match(await text(page, '#form-error'), /How long did you play/);
  await page.fill('input[name="hours"]', '3');
  await page.fill('input[name="date"]', '');
  await page.click('.actionbar button[type="submit"]');
  assert.match(await text(page, '#form-error'), /Enter the day/);
  await page.fill('input[name="date"]', '2026-11-01');
  await page.fill('input[name="time"]', '20:00');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '-$50');
  // a session that crosses midnight keeps its start day
  const s = await page.evaluate(async () => (await (await import('./js/db.js')).all('sessions'))[0]);
  assert.equal(new Date(s.start).getDate(), 1);
  assert.equal(new Date(s.end).getDate(), 1 + 1 - 1 + (new Date(s.start).getHours() + 3 >= 24 ? 1 : 0));
  noErrors(page);
  await context.close();
});

test('editing a past session shows its day, start and length, and keeps them when saved', async () => {
  const { page, context } = await ready();
  const start = new Date(2026, 10, 5, 18, 30).getTime();
  const [id] = await put(page, [{ stakes: '1/2', start, end: start + 4.5 * H, buyIns: [{ amount: 200 }], cashOut: 260, notes: 'Table 4' }]);
  await nav(page, '/new?edit=' + id);
  await page.waitForSelector('#session-form');
  assert.equal(await page.inputValue('input[name="date"]'), '2026-11-05');
  assert.equal(await page.inputValue('input[name="time"]'), '18:30');
  assert.equal(await page.inputValue('input[name="hours"]'), '4.5');
  // "More options" opens by itself when it holds something
  assert.notEqual(await page.locator('#more-opts').getAttribute('open'), null);
  assert.equal(await page.inputValue('textarea[name="notes"]'), 'Table 4');
  assert.match(await text(page, 'a.back'), /Session/);
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#net');
  const s = await page.evaluate(async id => (await import('./js/db.js')).get('sessions', id), id);
  assert.equal(s.start, start);
  assert.equal(s.end, start + 4.5 * H);
  assert.equal(s.notes, 'Table 4');
  noErrors(page);
  await context.close();
});

test('editing a tournament keeps its add-on', async () => {
  const { page, context } = await ready();
  const start = new Date(2026, 10, 6, 12, 0).getTime();
  const [id] = await put(page, [{ type: 'tourney', start, end: start + 5 * H, buyIns: [{ amount: 110, at: start }, { amount: 50, at: start + H, kind: 'addon' }], tourney: { buyIn: 100, fee: 10, prize: 0, bounties: 0 } }]);
  await nav(page, '/new?edit=' + id);
  await page.waitForSelector('#session-form');
  assert.equal(await page.inputValue('input[name="tEntries"]'), '1');
  await page.fill('input[name="tEntries"]', '2');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#net');
  const s = await page.evaluate(async id => (await import('./js/db.js')).get('sessions', id), id);
  assert.equal(s.buyIns.filter(b => b.kind === 'addon').length, 1, 'add-on kept');
  assert.equal(s.buyIns.filter(b => b.kind !== 'addon').length, 2, 'two entries');
  assert.equal(await text(page, '#net'), '-$270');
  assert.match(await page.innerText('main'), /Add-ons\s+\$50/);
  noErrors(page);
  await context.close();
});

test('live cash game: no Busted/Cashed, no add-on or bounty buttons', async () => {
  const { page, context } = await ready();
  await nav(page, '/new?live=1');
  await page.fill('input[name="buyIn"]', '200');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#btn-rebuy');
  assert.equal(await page.locator('#btn-addon, #btn-bounty').count(), 0);
  await page.click('button:has-text("End session")');
  await page.waitForSelector('#end-form');
  assert.equal(await page.locator('#end-form .seg').count(), 0);
  await page.fill('#end-form [name="cashOut"]', '320');
  await page.click('#end-form button[type="submit"]');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$120');
  assert.equal(await page.locator('#btn-undo-end').count(), 1);
  noErrors(page);
  await context.close();
});

test('live tournament cashed: prize counts, bounties added', async () => {
  const { page, context } = await ready();
  await nav(page, '/new?live=1');
  await page.click('.seg label:has-text("Tournament")');
  await page.fill('input[name="tBuyIn"]', '100');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#btn-bounty');
  await page.click('#btn-bounty');
  await page.fill('.sheet input', '20'); await page.click('.sheet button[type="submit"]');
  await page.waitForSelector('#bounties');
  await page.click('#btn-bounty');
  await page.fill('.sheet input', '15'); await page.click('.sheet button[type="submit"]');
  await until(page, () => /35/.test(document.querySelector('#bounties')?.textContent || ''));
  await page.click('button:has-text("End session")');
  await page.click('#end-form .seg label:has-text("Cashed")');
  await page.fill('#end-form [name="place"]', '2');
  await page.fill('#end-form [name="prize"]', '600');
  assert.equal(await page.inputValue('#end-form [name="bounties"]'), '35');
  await page.click('#end-form button[type="submit"]');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$535');    // 600 + 35 - 100
  noErrors(page);
  await context.close();
});

test('cancelling the add-on or bounty box changes nothing', async () => {
  const { page, context } = await ready();
  await nav(page, '/new?live=1');
  await page.click('.seg label:has-text("Tournament")');
  await page.fill('input[name="tBuyIn"]', '100');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#btn-addon');
  await page.click('#btn-addon');
  await page.waitForSelector('.sheet');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-bounty');
  await page.waitForSelector('.sheet');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  const s = await page.evaluate(async () => (await import('./js/store.js')).runningSession());
  assert.equal(s.buyIns.length, 1);
  assert.ok(!s.tourney.bounties);
  noErrors(page);
  await context.close();
});

test('undo end: not offered for logged sessions or after 15 minutes, blocked if another session runs', async () => {
  const { page, context } = await ready();
  const now = Date.now();
  const [logged, stale, fresh] = await put(page, [
    { start: now - 4 * H, end: now - 60e3, buyIns: [{ amount: 100 }], cashOut: 100 },
    { start: now - 5 * H, end: now - 20 * 60e3, buyIns: [{ amount: 100 }], cashOut: 100, extra: { endedLive: now - 20 * 60e3 } },
    { start: now - 3 * H, end: now - 60e3, buyIns: [{ amount: 100 }], cashOut: 150, extra: { endedLive: now - 60e3 } },
  ]);
  for (const id of [logged, stale]) {
    await nav(page, '/session/' + id);
    await page.waitForSelector('#net');
    assert.equal(await page.locator('#btn-undo-end').count(), 0, id);
  }
  // another session is running: undo refuses
  await page.evaluate(async () => { const db = await import('./js/db.js'); const M = await import('./js/model.js'); await db.put('sessions', M.startLive({ firstBuyIn: 50 })); });
  await nav(page, '/session/' + fresh);
  await page.waitForSelector('#btn-undo-end');
  await page.click('#btn-undo-end');
  await page.waitForSelector('.toast:has-text("Another session is running")');
  const s = await page.evaluate(async id => (await import('./js/db.js')).get('sessions', id), fresh);
  assert.equal(s.status, 'done');
  noErrors(page);
  await context.close();
});

test('sessions list: no search bar for 5 or fewer; search matches stakes and game too', async () => {
  const { page, context } = await ready();
  const now = Date.now();
  const mk = (i, p = {}) => ({ start: now - (i + 1) * 864e5, end: now - (i + 1) * 864e5 + 3 * H, buyIns: [{ amount: 100 }], cashOut: 100, ...p });
  await put(page, [0, 1, 2, 3, 4].map(i => mk(i)));
  await nav(page, '/sessions');
  await page.waitForSelector('.session-list');
  assert.equal(await page.locator('#session-search').count(), 0);
  await put(page, [mk(5, { stakes: '5/10', game: 'PLO' }), mk(6, { setting: 'online', venue: 'PokerSite' })]);
  await nav(page, '/more'); await nav(page, '/sessions');
  await page.waitForSelector('#session-search');
  await page.fill('#session-search', '5/10');
  await until(page, () => document.querySelectorAll('.session-list li').length === 1);
  await page.fill('#session-search', 'plo');
  await until(page, () => document.querySelectorAll('.session-list li').length === 1);
  await page.fill('#session-search', '');
  await page.click('#session-kind button:has-text("Online")');
  await until(page, () => document.querySelectorAll('.session-list li').length === 1);
  await page.click('#session-kind button:has-text("All")');
  await until(page, () => document.querySelectorAll('.session-list li').length === 7);
  noErrors(page);
  await context.close();
});

test('backup reminder: "In a week" snoozes it, and a gist backup counts as a backup', async () => {
  const { page, context } = await ready();
  const now = Date.now();
  await put(page, Array.from({ length: 10 }, (_, i) => ({ start: now - (i + 1) * H * 5, end: now - (i + 1) * H * 5 + H, buyIns: [{ amount: 100 }], cashOut: 100 })));
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('#backup-banner');
  await page.click('#btn-backup-later');
  await page.waitForSelector('#backup-banner', { state: 'detached' });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#backup-banner').count(), 0);
  const snooze = await page.evaluate(async () => (await import('./js/db.js')).getSetting('backupSnooze', 0));
  assert.ok(snooze > Date.now() + 6.9 * 864e5);
  // clear the snooze but record a gist backup: still no banner
  await page.evaluate(async () => { const db = await import('./js/db.js'); await db.setSetting('backupSnooze', 0); await db.setSetting('gist', { lastAt: Date.now() }); });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#backup-banner').count(), 0);
  noErrors(page);
  await context.close();
});

test('install card on iPhone shows the Add to Home Screen steps', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(String(e)));
  await page.goto(srv.url, { waitUntil: 'load' });
  await page.waitForSelector('html[data-ready="1"]');
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true);
    await db.put('sessions', M.newSession({ start: Date.now() - 3 * 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 100 }));
  });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('#install-card');
  assert.match(await text(page, '#ios-steps'), /Add to Home Screen/);
  assert.equal(await page.locator('#btn-install').count(), 0);
  await page.click('#install-later');
  await page.waitForSelector('#install-card', { state: 'detached' });
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('lock screen: a wrong file is refused, data stays; the right PIN still unlocks after "Forgot PIN?"', async () => {
  const { page, context } = await ready();
  await put(page, [{ venue: 'Keep Me', start: Date.now() - H, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 100 }]);
  await page.evaluate(async () => (await import('./js/lock.js')).setPin('2468'));
  await page.reload();
  await page.click('#forgot-pin');
  await page.setInputFiles('#forgot-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForSelector('#lock p.neg');
  assert.match(await text(page, '#lock p.neg'), /not a Bankroll backup/);
  assert.equal(await page.evaluate(async () => (await (await import('./js/db.js')).all('sessions')).length), 1);
  await page.click('#forgot-back');
  await page.waitForSelector('#forgot-pin');
  for (const k of '2468') await page.click(`#lock [data-key="${k}"]`);
  await page.click('#lock [data-key="OK"]').catch(() => {});
  await page.waitForSelector('#lock', { state: 'hidden' });
  await page.waitForSelector('main .card');
  assert.match(await page.innerText('main'), /Keep Me|Recent/);
  noErrors(page);
  await context.close();
});

test('pinned save button stays visible while scrolling a long form on a small phone', async () => {
  const { page, context } = await ready({ viewport: { width: 320, height: 568 } });
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  await page.click('#more-opts summary');
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(200);
  const box = await page.locator('.actionbar button[type="submit"]').boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= 568, JSON.stringify(box));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'no sideways scrolling at 320px');
  noErrors(page);
  await context.close();
});
