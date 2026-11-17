// Phase 3 QA: hand notes, opponent notes, equity calculator, blind timer, payouts, settle up.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp, nav, noErrors } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });
const text = (page, sel) => page.locator(sel).first().innerText();

async function pick(page, cards) {
  for (const c of cards) await page.click(`.sheet .picker button[data-card="${c}"]`);
  await page.click('#cards-done');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
}

test('tools menu lists every tool', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools' });
  await page.waitForSelector('#tools-menu');
  assert.equal(await page.locator('#tools-menu li').count(), 6);
  noErrors(page);
  await context.close();
});

test('hand notes: add with cards and board, link to a session, search, edit, delete', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const sid = await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    return (await db.put('sessions', M.newSession({ stakes: '1/2', start: Date.now() - 4e6, end: Date.now(), buyIns: [{ amount: 200 }], cashOut: 400 }))).id;
  });
  await nav(page, '/session/' + sid);
  await page.waitForSelector('#add-hand');
  await page.click('#add-hand');
  await page.waitForSelector('#hand-form');
  await page.click('#pick-hero');
  await pick(page, ['As', 'Ks']);
  await page.click('#pick-board');
  await pick(page, ['Qs', 'Js', '2d']);
  assert.match(await text(page, '#made-hand'), /High card/);
  await page.click('#pick-board');
  await page.click('.sheet .picker button[data-card="Ts"]');   // add the turn: royal flush
  await page.click('#cards-done');
  await page.waitForSelector('.sheet-back', { state: 'detached' });
  assert.match(await text(page, '#made-hand'), /Straight flush/);
  await page.selectOption('#hand-form select[name="position"]', 'BTN');
  await page.fill('#hand-form textarea[name="action"]', 'Open 6, BB calls. Bet 3 streets.');
  await page.fill('#hand-form input[name="result"]', '180');
  await page.fill('#hand-form textarea[name="lesson"]', 'Size up on wet boards');
  await page.fill('#hand-form input[name="tags"]', 'value, royal');
  await page.click('#hand-form button[type="submit"]');
  // back on the session page, the hand is listed
  await page.waitForSelector('#session-hands .hand-item');
  assert.match(await text(page, '#session-hands'), /BTN · Straight flush/);
  assert.match(await text(page, '#session-hands'), /\+\$180/);
  // all hands list + search
  await nav(page, '/tools/hands');
  await page.waitForSelector('#hand-list .hand-item');
  await page.click('#hand-list .hand-item');
  await page.waitForSelector('#delete-hand');
  await page.fill('#hand-form textarea[name="lesson"]', 'Edited lesson');
  await page.click('#hand-form button[type="submit"]');
  await page.waitForSelector('#hand-list');
  const saved = await page.evaluate(async () => (await (await import('./js/db.js')).all('hands'))[0]);
  assert.deepEqual(saved.hero, ['As', 'Ks']);
  assert.deepEqual(saved.board, ['Qs', 'Js', '2d', 'Ts']);
  assert.deepEqual(saved.tags, ['value', 'royal']);
  assert.equal(saved.lesson, 'Edited lesson');
  await page.click('#hand-list .hand-item');
  await page.click('#delete-hand');
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('text=No hands yet.');
  noErrors(page);
  await context.close();
});

test('a hand can be noted from the live screen', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 200 }));
  });
  await nav(page, '/live');
  await page.click('#live-hand');
  await page.waitForSelector('#hand-form');
  await page.fill('#hand-form textarea[name="action"]', 'Quick note');
  const linked = await page.$eval('#hand-form select[name="sessionId"]', s => s.value);
  assert.ok(linked, 'linked to the running session');
  await page.click('#hand-form button[type="submit"]');
  await page.waitForSelector('#hand-list .hand-item');
  noErrors(page);
  await context.close();
});

test('opponent notes: add, search, edit, delete', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools/opponents' });
  await page.click('#new-opp');
  await page.fill('#opp-form input[name="name"]', 'Red Hat Mike');
  await page.fill('#opp-form input[name="venue"]', 'Wildhorse');
  await page.check('#opp-form input[value="Calling station"]');
  await page.fill('#opp-form textarea[name="notes"]', 'Never folds top pair');
  await page.click('#opp-form button[type="submit"]');
  await page.click('#new-opp');
  await page.fill('#opp-form input[name="name"]', 'Quiet Sue');
  await page.check('#opp-form input[value="Nit"]');
  await page.click('#opp-form button[type="submit"]');
  await page.waitForSelector('#opp-list li a');
  assert.equal(await page.locator('#opp-list li a').count(), 2);
  await page.fill('#opp-search', 'top pair');
  await page.waitForFunction(() => document.querySelectorAll('#opp-list li a').length === 1);
  assert.match(await text(page, '#opp-list'), /Red Hat Mike/);
  assert.match(await text(page, '#opp-list'), /Calling station/);
  await page.click('#opp-list li a');
  await page.click('#delete-opp');
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('#opp-list');
  await page.waitForFunction(() => document.querySelectorAll('#opp-list li a').length === 1);
  noErrors(page);
  await context.close();
});

test('equity calculator: exact on the turn, simulated preflop, pot odds and outs', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools/equity' });
  await page.waitForSelector('.pick-player');
  await page.click('.pick-player[data-player="0"]');
  await pick(page, ['As', 'Kd']);
  await page.click('.pick-player[data-player="1"]');
  await pick(page, ['7h', '6h']);
  await page.click('#pick-board');
  await pick(page, ['Ac', '2h', '9h', 'Qs']);
  await page.click('#calc');
  await page.waitForSelector('#equity-result .eq-1');
  assert.match(await text(page, '#equity-result'), /Exact result/i);
  assert.equal(await text(page, '#equity-result .eq-1'), '20.5%');     // 9 outs of 44
  assert.equal(await text(page, '#equity-result .eq-0'), '79.5%');
  // preflop, 3 players with a random hand
  await page.click('button:has-text("Clear all")');
  await page.click('.pick-player[data-player="0"]');
  await pick(page, ['Ah', 'Ad']);
  await page.click('#add-player');
  await page.click('#calc');
  await page.waitForSelector('#equity-result .eq-2');
  assert.match(await text(page, '#equity-result'), /Simulated/i);
  const aa = parseFloat(await text(page, '#equity-result .eq-0'));
  assert.ok(aa > 70 && aa < 78, 'AA vs two random hands ≈ 73%: ' + aa);
  // pot odds
  await page.fill('input[name="pot"]', '150');
  await page.fill('input[name="call"]', '50');
  assert.match(await text(page, '#pot-odds-result'), /25% equity/);
  await page.fill('input[name="outs"]', '9');
  assert.match(await text(page, '#outs-result'), /19\.6%.*35%/);
  noErrors(page);
  await context.close();
});

test('payout calculator', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools/payouts' });
  await page.waitForSelector('#payout-form');
  await page.fill('#payout-form input[name="players"]', '10');
  await page.fill('#payout-form input[name="buyIn"]', '20');
  await page.fill('#payout-form input[name="rebuys"]', '2');
  await page.waitForFunction(() => document.querySelector('#prize-pool').textContent === '$240');
  assert.equal(await page.inputValue('#payout-form input[name="places"]'), '3');
  const rows = await page.$$eval('#payout-table tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  assert.deepEqual(rows, ['1st 50% $125', '2nd 30% $70', '3rd 20% $45']);   // rounded to $5, the rest to 1st
  const total = rows.reduce((a, r) => a + parseFloat(r.split('$')[1].replace(',', '')), 0);
  assert.equal(total, 240);
  noErrors(page);
  await context.close();
});

test('settle up shows who pays whom and flags missing money', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools/settle' });
  await page.waitForSelector('.settle-row');
  const fill = async (i, name, a, b) => {
    const row = page.locator('.settle-row').nth(i);
    await row.locator('input').nth(0).fill(name); await row.locator('input').nth(1).fill(String(a)); await row.locator('input').nth(2).fill(String(b));
  };
  await fill(0, 'Ann', 100, 250); await fill(1, 'Bob', 100, 0); await fill(2, 'Cy', 200, 150);
  await page.waitForSelector('#transfers');
  const t = await page.$$eval('#transfers li', l => l.map(x => x.innerText.replace(/\s+/g, ' ')));
  assert.deepEqual(t, ['Bob pays Ann $100', 'Cy pays Ann $50']);
  await page.click('#add-row');
  await fill(3, 'Di', 50, 40);
  await page.waitForSelector('#settle-diff');
  assert.match(await text(page, '#settle-diff'), /\$10 is missing/);
  // rows are kept if you leave and come back
  await nav(page, '/tools'); await nav(page, '/tools/settle');
  await page.waitForSelector('#transfers');
  assert.equal(await page.locator('.settle-row').count(), 4);
  noErrors(page);
  await context.close();
});

test('blind timer: set up, start, skip levels, pause, survive reload, reset', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/tools/timer' });
  await page.waitForSelector('#timer-form');
  await page.fill('#timer-form input[name="hours"]', '2');
  await page.fill('#timer-form input[name="minutes"]', '15');
  await page.click('#timer-form button[type="submit"]');
  await page.waitForSelector('#timer-clock');
  assert.equal(await text(page, '#timer-clock'), '15:00');
  assert.match(await text(page, '#timer-level'), /LEVEL 1/);
  await page.click('#timer-play');
  await page.waitForTimeout(1300);
  assert.match(await text(page, '#timer-clock'), /^14:5\d$/);
  await page.click('#timer-next-btn');
  await page.waitForFunction(() => /LEVEL 2/.test(document.querySelector('#timer-level').textContent));
  await page.click('#timer-play');                 // pause
  const paused = await text(page, '#timer-clock');
  await page.waitForTimeout(1200);
  assert.equal(await text(page, '#timer-clock'), paused, 'paused clock stands still');
  await page.click('#timer-play');                 // resume
  // pretend the phone was locked for 16 minutes: the clock moves on to level 3
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const t = await db.getSetting('blind-timer'); t.levelStartedAt -= 16 * 60e3; await db.setSetting('blind-timer', t);
  });
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('#timer-level');
  await page.waitForFunction(() => /LEVEL 3/.test(document.querySelector('#timer-level').textContent));
  await page.click('#timer-reset');
  await page.click('.sheet button[data-ok]');
  await page.waitForSelector('#timer-form');
  noErrors(page);
  await context.close();
});
