// Phase 5 QA: staking packages with makeup, selling action, payments, settlements, statements, bankroll split.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, openApp, nav, noErrors, until } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });
const text = (page, sel) => page.locator(sel).first().innerText();
const sheetClosed = page => page.waitForSelector('.sheet-back', { state: 'detached' });

test('sell action on a tournament to friends, with markup', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const id = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    return (await db.put('sessions', M.newSession({ type: 'tourney', start: Date.now() - 6 * 3600e3, end: Date.now(), buyIns: [{ amount: 100 }], tourney: { buyIn: 100, fee: 0, prize: 1000, place: 2, entrants: 50, bounties: 0 } }))).id;
  });
  await nav(page, '/session/' + id);
  await page.waitForSelector('#edit-backing');
  assert.match(await text(page, '#session-backing'), /All your own action/);
  await page.click('#edit-backing');
  await page.click('#add-backer-row');
  await page.click('#add-backer-row');
  const rows = page.locator('.backing-row');
  await rows.nth(0).locator('input[name="bname"]').fill('Ann');
  await rows.nth(0).locator('input[name="bshare"]').fill('30');
  await rows.nth(0).locator('input[name="bmarkup"]').fill('1.2');
  await rows.nth(1).locator('input[name="bname"]').fill('Bob');
  await rows.nth(1).locator('input[name="bshare"]').fill('20');
  assert.match(await text(page, '#backing-total'), /50% sold · backers pay \$56/);
  // too much sold is refused
  await rows.nth(1).locator('input[name="bshare"]').fill('80');
  await page.click('#save-backing');
  assert.match(await text(page, '#backing-error'), /110%/);
  await rows.nth(1).locator('input[name="bshare"]').fill('20');
  await page.click('#save-backing');
  await page.waitForFunction(() => /50% sold/.test(document.querySelector('#session-backing')?.textContent || ''));
  assert.equal(await text(page, '#your-share'), '+$456');           // 900 - Ann 264 - Bob 180
  // staking overview: who owes whom
  await nav(page, '/staking');
  await page.waitForSelector('#backer-list');
  const list = await page.$$eval('#backer-list li', l => l.map(x => x.innerText.replace(/\s+/g, ' ')));
  assert.ok(list.some(x => /Ann .*You owe \$264/.test(x)), list.join(' | '));
  assert.ok(list.some(x => /Bob .*You owe \$180/.test(x)));
  noErrors(page);
  await context.close();
});

test('staking package with makeup: auto-attach, makeup, settle, payments, statement CSV, bankroll', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => { const db = await import('./js/db.js'); await db.put('transactions', { bankrollId: 'main', kind: 'deposit', amount: 1000, date: Date.now() - 9e8 }); });
  await nav(page, '/staking');
  await page.click('#new-package');
  await page.fill('#deal-form input[name="backer"]', 'Sam');
  await page.fill('#deal-form input[name="name"]', 'Cash package');
  await page.fill('#deal-form input[name="share"]', '100');
  await page.fill('#deal-form input[name="split"]', '50');
  await page.selectOption('#deal-form select[name="autoAttach"]', 'cash');
  await page.click('#deal-form button[type="submit"]');
  await sheetClosed(page);
  await nav(page, '/'); await nav(page, '/staking');
  await page.waitForSelector('#backer-list');
  // Sam sends the package money
  await page.click('#backer-list a.item');
  await page.waitForSelector('#btn-received');
  await page.click('#btn-received');
  await page.fill('#money-form input[name="amount"]', '1000');
  await page.click('#money-form button[type="submit"]');
  await page.waitForFunction(() => /You owe \$1,000/.test(document.querySelector('#backer-due')?.textContent || ''));

  // a losing session logged through the form gets the package automatically
  const logPast = async (start, end, bi, co) => {
    await nav(page, '/new');
    await page.waitForSelector('#session-form');
    await page.fill('input[name="stakes"]', '1/2');
    await page.fill('input[name="date"]', start.slice(0, 10)); await page.fill('input[name="time"]', start.slice(11));
    await page.fill('input[name="hours"]', String((Date.parse(end) - Date.parse(start)) / 3600e3));
    await page.fill('input[name="buyIn"]', String(bi)); await page.fill('input[name="cashOut"]', String(co));
    await page.click('button:has-text("Save session")');
    await page.waitForSelector('#session-backing');
  };
  await logPast('2026-11-01T19:00', '2026-11-01T23:00', 500, 200);
  assert.match(await text(page, '#session-backing'), /100% sold/i);
  assert.equal(await text(page, '#your-share'), '$0');
  const sam = await page.evaluate(async () => (await (await import('./js/db.js')).all('backers'))[0].id);
  await nav(page, '/staking/' + sam);
  await page.waitForSelector('.package');
  assert.match(await text(page, '.package'), /Makeup\s*\$300/i);
  assert.equal(await page.locator('.settle-btn').count(), 0, 'nothing to settle while in makeup');

  await logPast('2026-11-02T19:00', '2026-11-02T23:00', 500, 1300);   // +800: clears 300 makeup, 500 to split
  await nav(page, '/staking/' + sam);
  await page.waitForSelector('.settle-btn');
  assert.match(await text(page, '.settle-btn'), /your cut \$250/);
  await page.click('.settle-btn');
  await page.click('.sheet button[data-ok]');
  await page.waitForFunction(() => /You owe \$1,250/.test(document.querySelector('#backer-due')?.textContent || ''));   // 1000 + 500 - 250
  await page.click('#btn-paid');
  await page.fill('#money-form input[name="amount"]', '1250');
  await page.click('#money-form button[type="submit"]');
  await page.waitForFunction(() => /All square/.test(document.querySelector('#backer-due')?.textContent || ''));
  // statement CSV
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-statement')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split(/\r\n/);
  assert.match(csv[0], /^Date,Backer,Item,Package,Venue,Share %,Markup,Backer paid in,Backer gets back,Change,Balance \(you owe them\),Note$/);
  assert.equal(csv.length, 6, 'received, 2 sessions, settle, paid');
  assert.match(csv[5], /,0,/);
  // bankroll counts only your money: 1000 deposit + 250 cut; nothing held for Sam any more
  await nav(page, '/bankroll');
  await page.waitForSelector('#balance');
  assert.equal(await text(page, '#balance'), '$1,250');
  assert.match(await page.innerText('#ledger'), /Staking: your cut/);
  assert.equal(await page.locator('#held').count(), 0);
  // a tournament doesn't get the cash-only package
  await nav(page, '/new');
  await page.click('.seg label:has-text("Tournament")');
  await page.fill('input[name="date"]', '2026-11-03'); await page.fill('input[name="time"]', '12:00'); await page.fill('input[name="hours"]', '4');
  await page.fill('input[name="tBuyIn"]', '50');
  await page.click('button:has-text("Save session")');
  await page.waitForSelector('#session-backing');
  assert.match(await text(page, '#session-backing'), /All your own action/i);
  noErrors(page);
  await context.close();
});

test('money held for backers shows on the bankroll; stats show your share', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    const b = await db.put('backers', { name: 'Kim' });
    await db.put('sessions', M.newSession({ bankrollId: 'main', stakes: '1/2', start: Date.now() - 5e6, end: Date.now() - 1e6, buyIns: [{ amount: 200 }], cashOut: 600, backing: [{ backerId: b.id, dealId: null, share: 50, markup: 1 }] }));
  });
  await nav(page, '/bankroll');
  await page.waitForSelector('#balance');
  assert.equal(await text(page, '#balance'), '$200');          // your half of +400
  assert.match(await text(page, '#held'), /\$200/);           // Kim's half
  await nav(page, '/stats');
  await page.waitForSelector('#staking-stats');
  assert.equal(await text(page, '#st-take'), '+$200');
  assert.equal(await text(page, '#s-net'), '+$400');
  // CSV export has your share
  await nav(page, '/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
  const lines = fs.readFileSync(await dl.path(), 'utf8').trim().split(/\r\n/);
  assert.match(lines[0], /Net result,Your share of result,Notes$/);
  assert.match(lines[1], /,400,200,$/);
  noErrors(page);
  await context.close();
});

test('sell action while playing live, and repeat-last keeps auto packages', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    const b = await db.put('backers', { name: 'Lee' });
    await db.put('deals', { backerId: b.id, name: 'All games', share: 25, markup: 1, makeup: false, split: 0, autoAttach: 'all', status: 'active' });
    await db.put('sessions', M.newSession({ stakes: '1/3', venue: 'Snoqualmie', start: Date.now() - 9e6, end: Date.now() - 5e6, buyIns: [{ amount: 300 }], cashOut: 300 }));
  });
  await nav(page, '/sessions'); await nav(page, '/');
  await page.click('#repeat-last');
  await page.waitForSelector('#live-backing');
  assert.match(await text(page, '#live-backing'), /Backing \(25%\)/);
  await page.click('#live-backing');
  await page.click('#add-backer-row');
  const row = page.locator('.backing-row').nth(1);
  await row.locator('input[name="bname"]').fill('Mo');
  await row.locator('input[name="bshare"]').fill('15');
  await page.click('#save-backing');
  await sheetClosed(page);
  await page.waitForFunction(() => /Backing \(40%\)/.test(document.querySelector('#live-backing')?.textContent || ''));
  const n = await page.evaluate(async () => (await (await import('./js/db.js')).all('backers')).length);
  assert.equal(n, 2, 'a new backer was added by name');
  noErrors(page);
  await context.close();
});

test('old backups (before staking) still restore', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const counts = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return db.importAll({ app: 'bankroll', schema: 1, data: { sessions: [], transactions: [], kv: [], bankrolls: [{ id: 'main', name: 'Main' }] } });
  });
  assert.equal(counts.bankrolls, 1);
  await nav(page, '/staking');
  await page.waitForSelector('text=No backers yet');
  noErrors(page);
  await context.close();
});
