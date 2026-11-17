import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../js/equity.js';
import * as G from '../../js/homegame.js';

const cat = cards => E.describe(E.parseCards(cards));

test('hand categories', () => {
  assert.equal(cat('As Ks Qs Js Ts'), 'Straight flush');
  assert.equal(cat('Ah 2h 3h 4h 5h'), 'Straight flush');
  assert.equal(cat('9c 9d 9h 9s 2c'), 'Four of a kind');
  assert.equal(cat('9c 9d 9h 2s 2c'), 'Full house');
  assert.equal(cat('Ac Tc 7c 4c 2c'), 'Flush');
  assert.equal(cat('5c 4d 3h 2s Ac'), 'Straight');
  assert.equal(cat('Kc Kd Kh 7s 2c'), 'Three of a kind');
  assert.equal(cat('Kc Kd 7h 7s 2c'), 'Two pair');
  assert.equal(cat('Kc Kd 8h 7s 2c'), 'Pair');
  assert.equal(cat('Kc Qd 8h 7s 2c'), 'High card');
  assert.equal(cat('As Ah Kd Kc Qs Qh 2c'), 'Two pair', 'best 5 of 7');
  assert.equal(cat('2c 3d 4h 5s 6c 7d 8h'), 'Straight');
});

test('hand ranking tie-breaks', () => {
  const s = t => E.evalBest(E.parseCards(t));
  assert.ok(s('Ac Ad Kh 7s 2c') > s('Ac Ad Qh 7s 2c'), 'kicker');
  assert.ok(s('6c 5d 4h 3s 2c') > s('5c 4d 3h 2s Ac'), '6-high straight beats the wheel');
  assert.ok(s('Kc Kd Kh 2s 2c') > s('Qc Qd Qh As Ac'), 'full house by trips');
  assert.equal(s('Ac Kd Qh Js 9c'), s('Ad Kh Qs Jc 9d'), 'same ranks tie');
  assert.ok(s('Th Td 9h 9d 2c') > s('Th Td 8h 8d Ac'), 'second pair beats kicker');
});

test('parse and pretty cards', () => {
  assert.deepEqual(E.parseCards('ah KD 10c'), ['Ah', 'Kd', 'Tc']);
  assert.equal(E.pretty('Tc'), '10♣');
  assert.equal(E.DECK.length, 52);
});

test('exact equity on the turn and river', () => {
  // river, AA vs KK on a blank board: AA wins 100%
  const r = E.equity([['As', 'Ah'], ['Ks', 'Kh']], E.parseCards('2c 7d 9h Jc 3s'));
  assert.equal(r.exact, true);
  assert.deepEqual(r.equity, [100, 0]);
  // turn: flush draw, 9 outs of 44 remaining cards for player 2
  const t = E.equity([['As', 'Kd'], ['7h', '6h']], E.parseCards('Ac 2h 9h Qs'));
  assert.equal(t.trials, 44);
  assert.equal(t.equity[1], Math.round((9 / 44) * 1000) / 10);
  // chopped pot: both play the board
  const c = E.equity([['2c', '3d'], ['2d', '3c']], E.parseCards('As Ks Qs Js Ts'));
  assert.deepEqual(c.tie, [100, 100]);
  assert.deepEqual(c.equity, [50, 50]);
});

test('preflop equity (Monte Carlo) is in the right ballpark', () => {
  const r = E.equity([['As', 'Ah'], ['Kd', 'Kc']], [], { iterations: 20000, seed: 7 });
  assert.equal(r.exact, false);
  assert.ok(r.equity[0] > 79 && r.equity[0] < 84, 'AA vs KK is ~82%: ' + r.equity[0]);
  const v = E.equity([['As', 'Ah'], []], [], { iterations: 20000, seed: 3 });
  assert.ok(v.equity[0] > 83 && v.equity[0] < 88, 'AA vs random is ~85%: ' + v.equity[0]);
  assert.ok(Math.abs(r.equity[0] + r.equity[1] - 100) < 0.2);
});

test('equity input errors', () => {
  assert.throws(() => E.equity([['As', 'Ah']]), /two players/);
  assert.throws(() => E.equity([['As', 'Ah'], ['As', 'Kd']]), /twice/);
  assert.throws(() => E.equity([['As'], ['Kd', 'Kc']]), /2 cards/);
  assert.throws(() => E.equity([['Xx', 'Ah'], ['Kd', 'Kc']]), /Unknown card/);
});

test('pot odds and outs', () => {
  assert.equal(E.potOdds(100, 50), 33.3);
  assert.equal(E.potOdds(100, 0), null);
  assert.equal(E.outsEquity(9, 1), 19.6);
  assert.equal(E.outsEquity(9, 2), 35);
});

test('payouts add up to the pool', () => {
  const p = G.payouts(1000, 3);
  assert.deepEqual(p.map(x => x.amount), [500, 300, 200]);
  const q = G.payouts(1234, 4, { unit: 5 });
  assert.equal(q.reduce((a, b) => a + b.amount, 0), 1234);
  assert.ok(q.slice(1).every(x => x.amount % 5 === 0));
  const custom = G.payouts(100, 2, { split: [70, 30] });
  assert.deepEqual(custom.map(x => x.amount), [70, 30]);
  assert.equal(G.recommendedPlaces(3), 1);
  assert.equal(G.recommendedPlaces(8), 2);
  assert.equal(G.recommendedPlaces(10), 3);
  assert.equal(G.prizePool({ players: 8, buyIn: 20, rebuys: 3, rebuyCost: 20, rake: 10 }), 210);
});

test('blind structure grows and stays payable', () => {
  const lv = G.blindStructure({ players: 8, startingStack: 10000, hours: 4, levelMinutes: 20, smallestChip: 25 });
  assert.equal(lv.length, 12);
  assert.equal(lv[0].bb, 100);
  for (let i = 1; i < lv.length; i++) assert.ok(lv[i].bb > lv[i - 1].bb, 'blinds go up');
  assert.ok(lv.every(l => l.bb % 50 === 0 && l.sb % 25 === 0 && l.sb <= l.bb));
  const last = lv[lv.length - 1].bb;
  assert.ok(last >= 4000 && last <= 12000, 'ends near 1/10 of chips per player: ' + last);
  const withBreaks = G.blindStructure({ hours: 2, levelMinutes: 20, breakEvery: 3 });
  assert.equal(withBreaks.filter(l => l.break).length, 1);
});

test('settle up with the fewest payments', () => {
  const r = G.settleUp([
    { name: 'Ann', in: 100, out: 250 }, { name: 'Bob', in: 100, out: 0 },
    { name: 'Cy', in: 200, out: 150 }, { name: 'Di', in: 100, out: 100 },
  ]);
  assert.equal(r.diff, 0);
  assert.deepEqual(r.transfers, [{ from: 'Bob', to: 'Ann', amount: 100 }, { from: 'Cy', to: 'Ann', amount: 50 }]);
  const off = G.settleUp([{ name: 'A', in: 100, out: 120 }, { name: 'B', in: 100, out: 70 }]);
  assert.equal(off.diff, -10, 'money missing from the table');
});

test('blind timer clock survives being closed: it catches up across levels', async () => {
  const { position } = await import('../../js/tools/timer.js');
  const levels = [{ minutes: 10 }, { minutes: 10 }, { minutes: 10 }];
  const t = { levels, index: 0, running: true, levelStartedAt: 0 };
  assert.deepEqual(position(t, 5 * 60e3), { index: 0, remaining: 5 * 60e3, changed: 0, started: 0 });
  const p = position(t, 23 * 60e3);
  assert.equal(p.index, 2);
  assert.equal(p.changed, 2);
  assert.equal(p.remaining, 7 * 60e3);
  assert.equal(position(t, 99 * 60e3).over, true);
  assert.equal(position({ ...t, running: false, remaining: 1234 }, 1e9).remaining, 1234, 'paused clock stands still');
});
