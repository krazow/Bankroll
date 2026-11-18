// Phase 1 QA: live sessions, logging past sessions, tournaments, expenses, repeat-last and bankrolls, in a real browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp, nav, noErrors } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });

const text = (page, sel) => page.locator(sel).first().innerText();
async function sheetNumber(page, value, button) {
  await page.fill('.sheet input[name="amount"]', String(value));
  await page.click(`.sheet button:has-text("${button}")`);
  await page.waitForSelector('.sheet-back', { state: 'detached' });
}

test('live cash session: start, rebuy, stack, break, expense, end', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/new?live=1' });
  await page.fill('input[name="stakes"]', '1/2');
  await page.fill('input[name="venue"]', 'Wildhorse');
  await page.fill('input[name="buyIn"]', '200');
  await page.click('button:has-text("Start session")');
  await page.waitForSelector('#clock');
  assert.match(location(page), /#\/live$/);
  assert.equal(await text(page, '#in-for'), '$200');

  await page.click('#btn-rebuy');
  await sheetNumber(page, 100, 'Add');
  await page.waitForFunction(() => document.querySelector('#in-for').textContent === '$300');

  await page.click('#btn-stack');
  await sheetNumber(page, 450, 'Update');
  await page.waitForFunction(() => document.querySelector('#live-profit').textContent === '+$150');

  await page.click('#btn-pause');
  await page.waitForFunction(() => document.querySelector('#btn-pause').textContent.includes('Resume'));
  assert.equal(await text(page, '.tag'), 'On break');
  // the header pill shows on other screens while running
  await nav(page, '/');
  await page.waitForSelector('#running-card');
  assert.equal(await page.isVisible('#live-pill'), true);
  await nav(page, '/live');
  await page.waitForSelector('#btn-pause');
  await page.click('#btn-pause');
  await page.waitForFunction(() => document.querySelector('#btn-pause').textContent.includes('Break'));

  await page.click('#btn-expense');
  await page.selectOption('.sheet select[name="kind"]', 'Tips');
  await sheetNumber(page, 10, 'Add');

  await page.click('#btn-end');
  await page.fill('.sheet input[name="cashOut"]', '450');
  await page.click('.sheet button:has-text("End session")');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$140');   // 450 - 300 - 10 tips
  assert.equal(await page.isVisible('#live-pill'), false);
  noErrors(page);
  await context.close();
});

function location(page) { return page.url(); }

test('the live timer keeps counting after the app is closed and reopened', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.startLive({ stakes: '1/3', firstBuyIn: 300 }, Date.now() - (2 * 3600e3 + 5 * 60e3)));
  });
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('#running-card');
  assert.match(await text(page, '#home-clock'), /^2:0[45]:/);
  await nav(page, '/live');
  await page.waitForSelector('#clock');
  assert.match(await text(page, '#clock'), /^2:0[45]:/);
  noErrors(page);
  await context.close();
});

test('only one session can run at a time', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 100 }));
  });
  await nav(page, '/new?live=1');
  await page.waitForSelector('#clock');
  noErrors(page);
  await context.close();
});

test('log a past cash session with expenses; validation catches mistakes', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/new' });
  await page.fill('input[name="stakes"]', '2/5');
  await page.fill('input[name="date"]', '2026-11-10');
  await page.fill('input[name="time"]', '19:00');
  await page.fill('input[name="hours"]', '80');
  await page.fill('input[name="buyIn"]', '500');
  await page.fill('input[name="cashOut"]', '1200');
  await page.click('button:has-text("Save session")');
  assert.match(await text(page, '#form-error'), /over 72 hours/);
  await page.fill('input[name="hours"]', '5.5');
  await page.fill('input[name="breakMin"]', '30');
  await page.click('#more-opts summary');
  await page.click('button:has-text("+ Add expense")');
  await page.selectOption('[name="exp-kind"]', 'Food');
  await page.fill('[name="exp-amount"]', '25');
  await page.click('button:has-text("Save session")');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$675');
  const body = await page.innerText('main');
  assert.match(body, /5h 00m/);          // 5.5h minus 30 min break
  assert.match(body, /BB \/ hour/);
  assert.match(body, /BB \/ hour\t28\.0/);  // 700 won = 140 BB over 5h
  noErrors(page);
  await context.close();
});

test('log a tournament with re-entries, prize and bounties', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/new' });
  await page.click('.seg label:has-text("Tournament")');
  await page.fill('input[name="date"]', '2026-11-09');
  await page.fill('input[name="time"]', '12:00');
  await page.click('#length-chips button[data-hours="6"]');
  await page.fill('input[name="tBuyIn"]', '100');
  await page.fill('input[name="tFee"]', '20');
  await page.fill('input[name="tEntries"]', '2');
  await page.fill('input[name="tEntrants"]', '87');
  await page.fill('input[name="tPlace"]', '4');
  await page.fill('input[name="tPrize"]', '900');
  await page.fill('input[name="tBounties"]', '50');
  await page.click('button:has-text("Save session")');
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '+$710');      // 950 - 240
  assert.match(await page.innerText('main'), /4 of 87/);
  noErrors(page);
  await context.close();
});

test('edit and delete a session', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const id = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    return (await db.put('sessions', M.newSession({ stakes: '1/2', start: Date.now() - 4 * 3600e3, end: Date.now(), buyIns: [{ amount: 200 }], cashOut: 100 }))).id;
  });
  await nav(page, '/session/' + id);
  await page.waitForSelector('#net');
  assert.equal(await text(page, '#net'), '-$100');
  await page.click('#edit-session');
  await page.waitForSelector('#session-form');
  await page.fill('input[name="cashOut"]', '380');
  await page.click('button:has-text("Save changes")');
  await page.waitForFunction(() => document.querySelector('#net')?.textContent === '+$180');
  await page.click('#delete-session');
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('text=No sessions yet');
  noErrors(page);
  await context.close();
});

test('repeat last session starts the same game in one tap', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.newSession({ game: 'PLO', stakes: '1/2', venue: 'Snoqualmie', start: Date.now() - 9e6, end: Date.now() - 5e6, buyIns: [{ amount: 400 }], cashOut: 600 }));
  });
  await nav(page, '/sessions'); await nav(page, '/');
  await page.waitForSelector('#repeat-last');
  assert.match(await text(page, '#repeat-last'), /1\/2 PLO @ Snoqualmie/);
  await page.click('#repeat-last');
  await page.waitForSelector('#clock');
  assert.equal(await text(page, '#in-for'), '$400');
  assert.match(await page.innerText('main'), /Snoqualmie/);
  noErrors(page);
  await context.close();
});

test('pick-lists remember venues you typed before', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.newSession({ venue: 'Emerald Queen', start: 1, end: 2, buyIns: [{ amount: 1 }], cashOut: 1 }));
  });
  await nav(page, '/new');
  await page.waitForSelector('#session-form');
  const opts = await page.$$eval('input[name="venue"] + datalist option', o => o.map(x => x.value));
  assert.ok(opts.includes('Emerald Queen'));
  noErrors(page);
  await context.close();
});

test('bankroll: deposits, withdrawals, session results and multiple bankrolls', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    const def = await db.getSetting('defaultBankroll');
    await db.put('sessions', M.newSession({ bankrollId: def, start: Date.now() - 5e6, end: Date.now() - 1e6, buyIns: [{ amount: 200 }], cashOut: 350 }));
  });
  await nav(page, '/bankroll');
  await page.waitForSelector('#balance');
  assert.equal(await text(page, '#balance'), '$150');
  await page.click('#btn-deposit');
  await page.fill('#tx-form input[name="amount"]', '1000');
  await page.click('#tx-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#balance')?.textContent === '$1,150');
  await page.click('#btn-withdraw');
  await page.fill('#tx-form input[name="amount"]', '300');
  await page.click('#tx-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#balance')?.textContent === '$850');
  assert.equal(await page.locator('#ledger li').count(), 3);

  // second bankroll
  await page.click('#new-bankroll');
  await page.fill('#bank-form input[name="name"]', 'Online');
  await page.click('#bank-form button[type="submit"]');
  await page.waitForSelector('text=Online');
  await page.click('#btn-deposit');
  await page.fill('#tx-form input[name="amount"]', '500');
  await page.click('#tx-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#total-balance')?.textContent === '$1,350');
  // new sessions can pick the bankroll
  await nav(page, '/new');
  await page.waitForSelector('#session-form select[name="bankrollId"]');
  assert.equal(await page.locator('#session-form select[name="bankrollId"] option').count(), 2);
  // home shows the total
  await nav(page, '/');
  await page.waitForSelector('#home-balance');
  assert.equal(await text(page, '#home-balance'), '$1,350');
  noErrors(page);
  await context.close();
});

test('More menu and currency setting', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/more' });
  await page.waitForSelector('#more-menu');
  assert.equal(await page.locator('#more-menu li').count(), 4);
  await nav(page, '/settings');
  await page.selectOption('#currency', '€');
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const M = await import('./js/model.js');
    await db.put('sessions', M.newSession({ start: 1, end: 3600e3, buyIns: [{ amount: 100 }], cashOut: 150 }));
  });
  await nav(page, '/sessions');
  await page.waitForSelector('#session-list');
  assert.match(await page.innerText('#session-list'), /\+€50/);
  noErrors(page);
  await context.close();
});
