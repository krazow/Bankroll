// Phase 6 QA: easier flow — pinned buttons, short form, welcome, back links, forgot PIN,
// backup reminders, undo end, quick past logging, live tournaments, install card, 44px buttons, search.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp, nav, noErrors, until } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });
const text = (page, sel) => page.locator(sel).first().innerText();

test('welcome sets currency, starting bankroll and usual game; form uses them', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.waitForSelector('#welcome-form');
  await page.selectOption('#welcome-form [name="currency"]', '€');
  await page.fill('#welcome-form [name="bankroll"]', '2000');
  await page.fill('#welcome-form [name="stakes"]', '1/3');
  await page.fill('#welcome-form [name="venue"]', 'Casino A');
  await page.fill('#welcome-form [name="buyIn"]', '300');
  await page.click('#welcome-form button[type="submit"]');
  await page.waitForSelector('#welcome', { state: 'detached' });
  await until(page, async () => /2,000/.test(document.querySelector('main').innerText));
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  assert.equal(await page.inputValue('input[name="stakes"]'), '1/3');
  assert.equal(await page.inputValue('input[name="venue"]'), 'Casino A');
  assert.equal(await page.inputValue('input[name="buyIn"]'), '300');
  // reload: the welcome stays gone
  await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#welcome').count(), 0);
  noErrors(page);
  await context.close();
});

test('skip welcome; short form with pinned save button on a small phone; quick length chips', async () => {
  const { page, context } = await openApp(browser, srv.url, { viewport: { width: 360, height: 640 } });
  await page.click('#welcome-skip');
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  // the save button is on screen without scrolling
  const box = await page.locator('.actionbar button[type="submit"]').boundingBox();
  assert.ok(box && box.y + box.height <= 640, 'save button visible: ' + JSON.stringify(box));
  // extras are tucked away
  assert.equal(await page.locator('#more-opts').getAttribute('open'), null);
  assert.equal(await page.locator('a.back').count(), 1);
  await page.fill('input[name="buyIn"]', '200');
  await page.fill('input[name="cashOut"]', '350');
  await page.click('#length-chips button[data-hours="4"]');
  assert.equal(await page.inputValue('input[name="hours"]'), '4');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$150');
  assert.match(await page.innerText('main'), /4h 00m/);
  // back link on the session page goes to the list
  assert.match(await text(page, 'a.back'), /Sessions/);
  noErrors(page);
  await context.close();
});

test('session cards use 44px buttons; every sub-screen has a back link', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const id = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true);
    return (await db.put('sessions', M.newSession({ start: Date.now() - 4 * 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 50 }))).id;
  });
  await nav(page, '/session/' + id);
  await page.waitForSelector('#net');
  const small = await page.$$eval('main button', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5).map(b => b.textContent));
  assert.deepEqual(small, []);
  for (const hash of ['/bankroll', '/settings', '/staking', '/tools', '/settings/import']) {
    await nav(page, hash);
    await page.waitForSelector('a.back');
  }
  // back uses history when there is some
  await nav(page, '/more');
  await nav(page, '/settings');
  await page.click('a.back');
  await until(page, () => location.hash === '#/more');
  noErrors(page);
  await context.close();
});

test('search and filter the sessions list', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true);
    const now = Date.now();
    for (let i = 0; i < 6; i++) await db.put('sessions', M.newSession({ venue: i < 2 ? 'Lucky Room' : 'Home game', start: now - (i + 1) * 864e5, end: now - (i + 1) * 864e5 + 3 * 3600e3, buyIns: [{ amount: 100 }], cashOut: 120 }));
    await db.put('sessions', M.newSession({ type: 'tourney', venue: 'Big Hall', start: now - 10 * 864e5, end: now - 10 * 864e5 + 5 * 3600e3, buyIns: [{ amount: 50 }], tourney: { buyIn: 50, fee: 0, prize: 0 } }));
  });
  await nav(page, '/sessions');
  await page.waitForSelector('#session-search');
  const count = () => page.locator('.session-list li').count();
  assert.equal(await count(), 7);
  await page.fill('#session-search', 'lucky');
  await until(page, () => document.querySelectorAll('.session-list li').length === 2);
  await page.fill('#session-search', '');
  await page.click('#session-kind button:has-text("Tournament")');
  await until(page, () => document.querySelectorAll('.session-list li').length === 1);
  await page.fill('#session-search', 'nothing like this');
  await page.waitForSelector('#no-match');
  noErrors(page);
  await context.close();
});

test('live tournament: add-on, bounty, busted; then undo the end and keep playing', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => (await import('./js/db.js')).setSetting('welcomed', true));
  await nav(page, '/new?live=1');
  await page.click('.seg label:has-text("Tournament")');
  await page.fill('input[name="tBuyIn"]', '100');
  await page.click('.actionbar button[type="submit"]');
  await page.waitForSelector('#btn-addon');
  assert.match(await text(page, 'a.back'), /Home/);
  await page.click('#btn-addon');
  await page.fill('.sheet input', '50'); await page.click('.sheet button[type="submit"]');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  await page.click('#btn-bounty');
  await page.fill('.sheet input', '25'); await page.click('.sheet button[type="submit"]');
  await page.waitForSelector('#bounties');
  assert.equal(await text(page, '#entries'), '1');      // add-on isn't an entry
  assert.match(await text(page, '#bounties'), /\$25/);
  await page.click('button:has-text("End session")');
  await page.waitForSelector('#end-form');
  assert.equal(await page.locator('#end-form .only-cashed').isVisible(), false);   // busted: no prize box
  assert.equal(await page.inputValue('#end-form [name="bounties"]'), '25');
  await page.click('#end-form .seg label:has-text("Cashed")');
  assert.equal(await page.locator('#end-form .only-cashed').isVisible(), true);
  await page.click('#end-form .seg label:has-text("Busted")');
  await page.click('#end-form button[type="submit"]');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '-$125');     // 150 in, 25 bounty back
  await page.click('#btn-undo-end');
  await page.waitForSelector('#btn-addon');
  assert.equal(await page.evaluate(async () => (await (await import('./js/store.js')).runningSession())?.status), 'running');
  noErrors(page);
  await context.close();
});

test('backup reminder after 10 sessions; back up now clears it', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true); await db.setSetting('installDismissed', true);
    for (let i = 0; i < 10; i++) await db.put('sessions', M.newSession({ start: Date.now() - (i + 1) * 864e5, end: Date.now() - (i + 1) * 864e5 + 3600e3, buyIns: [{ amount: 100 }], cashOut: 100 }));
  });
  await nav(page, '/');
  await page.waitForSelector('#backup-banner');
  const dl = page.waitForEvent('download');
  await page.click('#btn-backup-now');
  assert.match((await dl).suggestedFilename(), /\.json$/);
  await page.waitForSelector('#backup-banner', { state: 'detached' });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#backup-banner').count(), 0);
  noErrors(page);
  await context.close();
});

test('install card shows after the first finished session and can be dismissed', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => (await import('./js/db.js')).setSetting('welcomed', true));
  await nav(page, '/');
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#install-card').count(), 0);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.newSession({ start: Date.now() - 3 * 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 100 }));
  });
  await nav(page, '/more'); await nav(page, '/');
  await page.waitForSelector('#install-card');
  await page.click('#install-later');
  await page.waitForSelector('#install-card', { state: 'detached' });
  noErrors(page);
  await context.close();
});

test('forgot PIN: erase everything needs ERASE typed, then the app opens fresh', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true);
    await db.put('sessions', M.newSession({ start: Date.now() - 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 100 }));
    await (await import('./js/lock.js')).setPin('1234');
  });
  await page.reload();
  await page.waitForSelector('#forgot-pin');
  await page.click('#forgot-pin');
  await page.waitForSelector('#forgot-restore');
  await page.click('#forgot-erase');
  await page.fill('#erase-confirm', 'nope');
  await page.click('#forgot-erase');
  assert.equal(await page.locator('#lock').isVisible(), true);
  await page.click('#forgot-back');
  await page.waitForSelector('#forgot-pin');
  await page.click('#forgot-pin');
  await page.click('#forgot-erase');
  await page.fill('#erase-confirm', 'ERASE');
  await Promise.all([page.waitForEvent('load'), page.click('#forgot-erase')]);
  await page.waitForSelector('#welcome-form');
  assert.equal(await page.evaluate(async () => (await (await import('./js/db.js')).all('sessions')).length), 0);
  noErrors(page);
  await context.close();
});

test('forgot PIN: restore a backup turns the PIN off', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const dump = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('welcomed', true);
    await db.put('sessions', M.newSession({ venue: 'Restored Room', start: Date.now() - 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], cashOut: 150 }));
    const d = JSON.stringify(await (await import('./js/backup.js')).backupData());
    await (await import('./js/lock.js')).setPin('1234');
    return d;
  });
  await page.reload();
  await page.click('#forgot-pin');
  await Promise.all([page.waitForEvent('load'),
    page.setInputFiles('#forgot-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(dump) })]);
  await page.waitForSelector('main .card');
  assert.equal(await page.locator('#lock').isVisible(), false);
  assert.equal(await page.evaluate(async () => (await import('./js/lock.js')).getLock()), null);
  assert.match(await page.innerText('main'), /Restored Room|\+\$50/);
  noErrors(page);
  await context.close();
});
