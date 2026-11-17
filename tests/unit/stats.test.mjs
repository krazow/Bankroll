import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';
import * as S from '../../js/stats.js';
import { lineChart, barChart } from '../../js/chart.js';

const H = 3600e3;
// local-time helper: new Date(2026, 10, 2, 19) = Mon Nov 2 2026 7pm
const at = (d, hr) => new Date(2026, 10, d, hr).getTime();
const cash = (d, hr, hrs, bi, co, extra = {}) => M.newSession({ type: 'cash', stakes: '1/2', game: 'NLH', venue: 'A', start: at(d, hr), end: at(d, hr) + hrs * H, buyIns: [{ amount: bi }], cashOut: co, ...extra });
const tour = (d, cost, prize, place, field) => M.newSession({ type: 'tourney', game: 'NLH', venue: 'B', start: at(d, 12), end: at(d, 12) + 5 * H, buyIns: [{ amount: cost }], tourney: { buyIn: cost, fee: 0, prize, place, entrants: field } });

const data = [
  cash(2, 19, 4, 200, 500),                                // +300, Mon evening
  cash(3, 10, 2, 200, 0, { stakes: '2/5', venue: 'B' }),   // -200, Tue morning
  cash(4, 23, 5, 300, 350, { expenses: [{ amount: 20 }] }),// +30 net (gross +50), Wed late night
  tour(5, 100, 400, 2, 50),                                // +300
  tour(6, 100, 0, 30, 60),                                 // -100
  M.newSession({ status: 'running', start: at(7, 19), buyIns: [{ amount: 100 }] }), // ignored
];

test('summary over finished sessions', () => {
  const s = S.summary(data);
  assert.equal(s.count, 5);
  assert.equal(s.net, 330);
  assert.equal(s.hours, 21);
  assert.equal(s.hourly, Math.round((330 / 21) * 100) / 100);
  assert.equal(s.winRate, 60);
  assert.equal(s.biggestWin, 300);
  assert.equal(s.biggestLoss, -200);
  assert.equal(s.expenses, 20);
  // BB/hr over cash: 300/2=150bb, -200/5=-40bb, 50/2=25bb  => 135bb over 11h
  assert.equal(s.bbPerHour, Math.round((135 / 11) * 100) / 100);
  assert.equal(s.longestWinStreak, 2);  // +30 then +300
});

test('empty summary is safe', () => {
  const s = S.summary([]);
  assert.equal(s.count, 0);
  assert.equal(s.hourly, null);
  assert.equal(s.winRate, null);
});

test('tournament ROI, ITM and finishes', () => {
  const t = S.tourneySummary(data);
  assert.equal(t.count, 2);
  assert.equal(t.cost, 200);
  assert.equal(t.won, 400);
  assert.equal(t.roi, 100);
  assert.equal(t.itm, 50);
  assert.equal(t.avgFinish, 16);
  assert.equal(t.avgFinishPct, Math.round(((2 / 50 + 30 / 60) / 2) * 1000) / 10);
  assert.equal(S.tourneySummary(data.filter(s => s.type === 'cash')), null);
});

test('filters by fields, time of day, day of week and dates', () => {
  assert.equal(S.applyFilter(data, { type: 'cash' }).length, 3);
  assert.equal(S.applyFilter(data, { stakes: '2/5' }).length, 1);
  assert.equal(S.applyFilter(data, { venue: 'B' }).length, 3);
  assert.equal(S.applyFilter(data, { tod: 'Morning' }).length, 1);
  assert.equal(S.applyFilter(data, { tod: 'Late night' }).length, 1);
  assert.equal(S.applyFilter(data, { dow: '1' }).length, 1, 'Monday');
  assert.equal(S.applyFilter(data, { from: at(4, 0), to: at(6, 0) }).length, 2);
  assert.equal(S.applyFilter(data, { length: '4–6h' }).length, 4);
});

test('period presets', () => {
  const now = new Date(2026, 10, 16, 12).getTime();
  assert.equal(S.period('month', now).from, new Date(2026, 10, 1).getTime());
  assert.deepEqual(S.period('lastmonth', now), { from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 10, 1).getTime() });
  assert.equal(S.period('year', now).from, new Date(2026, 0, 1).getTime());
  assert.deepEqual(S.period('all', now), { from: null, to: null });
});

test('breakdown groups and orders', () => {
  const byStakes = S.breakdown(data, 'stakes');
  assert.deepEqual(byStakes.map(r => r.key), ['1/2', 'Tournaments', '2/5']);
  assert.equal(byStakes[0].net, 330);
  const byTod = S.breakdown(data, 'tod');
  assert.deepEqual(byTod.map(r => r.key), ['Morning', 'Afternoon', 'Evening', 'Late night']);
  const byDow = S.breakdown(data, 'dow');
  assert.equal(byDow[0].key, 'Mon');
});

test('cumulative profit line', () => {
  const c = S.cumulative(data);
  assert.deepEqual(c.map(p => p.value), [300, 100, 130, 430, 330]);
  assert.equal(c[4].i, 5);
});

test('calendar and heat levels', () => {
  const cal = S.calendar(data, 2026, 10);
  assert.equal(cal.count, 30);
  assert.equal(cal.first, new Date(2026, 10, 1).getDay());
  assert.equal(cal.days.get(2).net, 300);
  assert.equal(cal.days.size, 5);
  assert.equal(S.heat(300, 300), 'p3');
  assert.equal(S.heat(-50, 300), 'n1');
  assert.equal(S.heat(0, 300), '');
});

test('monthly goal progress', () => {
  const now = new Date(2026, 10, 15, 12).getTime();
  const g = S.goalProgress(data, { profit: 1000, hours: 40, sessions: 0 }, now);
  assert.deepEqual(g.profit, { target: 1000, value: 330, pct: 33 });
  assert.equal(g.hours.value, 21);
  assert.equal(g.sessions, null);
  assert.equal(g.monthPct, 50);
});

test('bankroll rules: buy-ins per stake and stop-loss/win', () => {
  const r = S.buyInsAt(4000, ['1/2', '2/5', 'junk'], { cashBuyIns: 20, buyInBB: 100 });
  assert.deepEqual(r.map(x => [x.stakes, x.buyIn, x.buyIns, x.ok]), [['1/2', 200, 20, true], ['2/5', 500, 8, false]]);
  assert.deepEqual(S.tourneyBuyIns(1000, 100, { tourneyBuyIns: 50 }), { buyIn: 100, buyIns: 10, ok: false });
  assert.equal(S.tourneyBuyIns(1000, 0), null);
  assert.deepEqual(S.stopCheck(-300, { stopLoss: 300 }), { kind: 'loss', limit: 300 });
  assert.deepEqual(S.stopCheck(500, { stopWin: 400 }), { kind: 'win', limit: 400 });
  assert.equal(S.stopCheck(-299, { stopLoss: 300, stopWin: 0 }), null);
  assert.equal(S.stopCheck(-1000, {}), null, 'off by default');
});

test('mindset insights group results by review values', () => {
  const r = [
    cash(2, 19, 2, 100, 300, { review: { tilt: 1, sleep: 8, alcohol: 0 } }),
    cash(3, 19, 2, 100, 0, { review: { tilt: 5, sleep: 5, alcohol: 4 } }),
    cash(4, 19, 2, 100, 200, { review: { tilt: 2, sleep: null } }),
    cash(5, 19, 2, 100, 50),
  ];
  const ins = S.reviewInsights(r);
  assert.equal(ins.count, 3);
  assert.deepEqual(ins.fields.tilt.rows.map(x => [x.label, x.count, x.hourly]), [['Calm (1–2)', 2, 75], ['Tilted (4–5)', 1, -50]]);
  assert.deepEqual(ins.fields.sleep.rows.map(x => x.label), ['Under 6h', '8h+']);
  assert.ok(!ins.fields.mood, 'no mood data');
});

test('charts render SVG and handle empty data', () => {
  const svg = lineChart([{ x: 0, y: 0 }, { x: 1, y: 300 }, { x: 2, y: -100 }], { fmt: v => '$' + v });
  assert.match(svg, /^<svg class="chart"/);
  assert.match(svg, /\$300/);
  assert.ok(!/NaN/.test(svg));
  assert.ok(!/NaN/.test(lineChart([{ x: 5, y: 10 }])), 'single point');
  assert.match(lineChart([]), /No data/);
  const bars = barChart([{ label: 'A', value: 100 }, { label: '<B>', value: -50 }]);
  assert.match(bars, /bar-neg/);
  assert.match(bars, /&lt;B&gt;/, 'labels are escaped');
  assert.ok(!/NaN/.test(bars));
});
