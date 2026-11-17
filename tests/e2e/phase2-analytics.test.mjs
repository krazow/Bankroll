// Phase 2 QA: dashboard, stats filters, graph, breakdowns, calendar, goals, bankroll rules, stop-loss, review.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openApp, nav, noErrors } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });

const text = (page, sel) => page.locator(sel).first().innerText();

// Seeds known sessions in the current month so every period filter includes them.
async function seed(page) {
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    const def = await db.getSetting('defaultBankroll');
    const d = new Date(); const day = n => new Date(d.getFullYear(), d.getMonth(), 1, 19).getTime() + (n - 1) * 864e5 * 0; // all on the 1st, 7pm
    const H = 3600e3, base = day(1);
    const mk = (o) => db.put('sessions', M.newSession({ bankrollId: def, game: 'NLH', venue: 'Wildhorse', setting: 'live', ...o }));
    await mk({ stakes: '1/2', start: base, end: base + 4 * H, buyIns: [{ amount: 200 }], cashOut: 500 });              // +300
    await mk({ stakes: '2/5', start: base + 1, end: base + 1 + 2 * H, buyIns: [{ amount: 500 }], cashOut: 300, venue: 'Snoqualmie' }); // -200
    await mk({ stakes: '1/2', game: 'PLO', start: base + 2, end: base + 2 + 4 * H, buyIns: [{ amount: 200 }], cashOut: 300, setting: 'online', venue: 'GGPoker' }); // +100
    await mk({ type: 'tourney', start: base + 3, end: base + 3 + 5 * H, buyIns: [{ amount: 110 }], tourney: { buyIn: 100, fee: 10, prize: 550, place: 2, entrants: 40 } }); // +440
    await db.put('transactions', { bankrollId: def, kind: 'deposit', amount: 1000, date: base - 864e5 });
  });
}

test('home dashboard shows all-time stats', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/sessions'); await nav(page, '/');
  await page.waitForSelector('#dashboard');
  assert.equal(await text(page, '#d-net'), '+$640');
  assert.equal(await text(page, '#d-hourly'), '+$43');       // 640 / 15h
  assert.equal(await text(page, '#d-month'), '+$640');
  assert.equal(await text(page, '#d-winrate'), '75%');
  assert.equal(await text(page, '#d-bigwin'), '+$440');
  assert.equal(await text(page, '#d-bigloss'), '-$200');
  noErrors(page);
  await context.close();
});

test('stats: summary, filters, graph, breakdown, tournament stats, calendar', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/stats');
  await page.waitForSelector('#summary');
  assert.equal(await text(page, '#s-net'), '+$640');
  assert.equal(await text(page, '#s-count'), '4');
  assert.equal(await text(page, '#s-hours'), '15.0');
  // BB/hr: 1/2 +300 = 150bb (4h), 2/5 -200 = -40bb (2h), 1/2 +100 = 50bb (4h) => 160bb / 10h = 16
  assert.equal(await text(page, '#s-bbhr'), '16.00');
  assert.equal(await page.locator('#profit-chart svg path.line').count(), 1);
  assert.equal(await text(page, '#t-roi'), '400%');
  assert.equal(await text(page, '#t-itm'), '100%');

  await page.selectOption('#f-type', 'cash');
  await page.waitForFunction(() => document.querySelector('#s-count')?.textContent === '3');
  assert.equal(await page.locator('#tourney-stats').count(), 0);
  await page.selectOption('#f-setting', 'online');
  await page.waitForFunction(() => document.querySelector('#s-net')?.textContent === '+$100');
  await page.selectOption('#f-venue', 'Wildhorse');
  await page.waitForSelector('#no-stats');
  await page.click('#reset-filters');
  await page.waitForFunction(() => document.querySelector('#s-count')?.textContent === '4');

  await page.selectOption('#group-by', 'venue');
  await page.waitForFunction(() => document.querySelector('#breakdown-table tbody tr td')?.textContent === 'Wildhorse');
  const rows = await page.$$eval('#breakdown-table tbody tr', trs => trs.map(t => [...t.children].map(c => c.textContent)));
  assert.deepEqual(rows.map(r => [r[0], r[3]]), [['Wildhorse', '+$740'], ['GGPoker', '+$100'], ['Snoqualmie', '-$200']]);
  await page.selectOption('#group-by', 'tod');
  await page.waitForFunction(() => document.querySelector('#breakdown-table tbody tr td')?.textContent === 'Evening');

  // period: all sessions are this month
  await page.click('#period label:has-text("Month")');
  await page.waitForFunction(() => document.querySelector('#s-count')?.textContent === '4');

  // calendar shows the 1st as a played day
  assert.equal(await page.locator('#calendar .d.h').count(), 1);
  await page.click('#cal-prev');
  await page.waitForFunction(() => document.querySelectorAll('#calendar .d.h').length === 0);
  await page.click('#cal-next');
  noErrors(page);
  await context.close();
});

test('goals and bankroll rules: settings, progress bars, low buy-in warning', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await seed(page);
  await nav(page, '/settings');
  await page.waitForSelector('#goals-form');
  await page.fill('#goals-form input[name="profit"]', '2000');
  await page.fill('#goals-form input[name="hours"]', '30');
  await page.click('#goals-form button[type="submit"]');
  await page.fill('#rules-form input[name="cashBuyIns"]', '20');
  await page.click('#rules-form button[type="submit"]');
  await page.waitForTimeout(200);
  await nav(page, '/');
  await page.waitForSelector('#goals-card');
  assert.match(await text(page, '#goals-card'), /\$640 \/ \$2,000/);
  assert.match(await text(page, '#goals-card'), /15\.0 \/ 30\.0/);
  // balance 1000 + 640 = 1640: 1/2 needs 20 x $200 = $4000 -> warning for 1/2 and 2/5
  const alerts = await page.$$eval('.bankroll-alert', a => a.map(x => x.textContent));
  assert.equal(await page.locator('#alerts').count(), 1, 'one combined alert');
  assert.ok(alerts.some(a => /^8\.2 buy-ins for 1\/2/.test(a)), alerts.join(' | '));
  assert.ok(alerts.some(a => /for 2\/5/.test(a)));
  noErrors(page);
  await context.close();
});

test('stop-loss warning on the live screen', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.setSetting('rules', { stopLoss: 300, stopWin: 500 });
    await db.put('sessions', M.setStack(M.startLive({ stakes: '1/2', firstBuyIn: 400 }), 50));
  });
  await nav(page, '/live');
  await page.waitForSelector('#stop-alert');
  assert.match(await text(page, '#stop-alert'), /Stop-loss/);
  await page.click('#btn-stack');
  await page.fill('.sheet input[name="amount"]', '950');
  await page.click('.sheet button:has-text("Update")');
  await page.waitForFunction(() => /Stop-win/.test(document.querySelector('#stop-alert')?.textContent || ''));
  noErrors(page);
  await context.close();
});

test('post-session review appears after ending a session and feeds mindset stats', async () => {
  const { page, context } = await openApp(browser, srv.url);
  await page.evaluate(async () => {
    const db = await import('./js/db.js'); const M = await import('./js/model.js');
    await db.put('sessions', M.startLive({ stakes: '1/2', firstBuyIn: 200 }, Date.now() - 2 * 3600e3));
  });
  await nav(page, '/live');
  await page.click('#btn-end');
  await page.fill('.sheet input[name="cashOut"]', '400');
  await page.click('.sheet button:has-text("End session")');
  await page.waitForSelector('#review-form');
  await page.click('#review-form .scale label:has(input[name="mood"][value="4"])');
  await page.click('#review-form .scale label:has(input[name="tilt"][value="1"])');
  await page.click('#review-form .scale label:has(input[name="focus"][value="5"])');
  await page.fill('#review-form input[name="sleep"]', '8');
  await page.fill('#review-form input[name="alcohol"]', '0');
  await page.fill('#review-form textarea[name="lesson"]', 'Value bet thinner on the river');
  await page.click('#review-form button[type="submit"]');
  await page.waitForSelector('#edit-review');
  assert.match(await text(page, '#review'), /Mood: 4/);
  assert.match(await text(page, '#review'), /Value bet thinner/);
  // opening the session again shows the saved review, not the form
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('#review');
  await nav(page, '/stats');
  await page.waitForSelector('#mindset');
  assert.match(await text(page, '#mindset'), /Calm \(1–2\)/);
  assert.match(await text(page, '#mindset'), /\+\$100\/h/);
  noErrors(page);
  await context.close();
});

test('stats with no sessions shows a friendly message', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/stats' });
  await page.waitForSelector('#no-stats');
  noErrors(page);
  await context.close();
});
