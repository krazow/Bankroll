import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';

const H = 3600e3;

test('parseStakes and bigBlind', () => {
  assert.deepEqual(M.parseStakes('1/2'), { sb: 1, bb: 2 });
  assert.deepEqual(M.parseStakes('$0.50/$1'), { sb: 0.5, bb: 1 });
  assert.equal(M.parseStakes('NL200'), null);
  assert.equal(M.bigBlind({ stakes: '2/5' }), 5);
  assert.equal(M.bigBlind({ stakes: '2/5', bigBlind: 10 }), 10);
  assert.equal(M.bigBlind({ stakes: '' }), null);
});

test('cash session results: gross, expenses, net', () => {
  const s = M.newSession({ buyIns: [{ amount: 200 }, { amount: 100 }], cashOut: 450, expenses: [{ kind: 'Tips', amount: 10 }, { kind: 'Food', amount: 15.5 }] });
  assert.equal(M.totalBuyIn(s), 300);
  assert.equal(M.gross(s), 150);
  assert.equal(M.expensesTotal(s), 25.5);
  assert.equal(M.net(s), 124.5);
});

test('busting a cash game is a full loss', () => {
  const s = M.newSession({ buyIns: [{ amount: 300 }], cashOut: 0 });
  assert.equal(M.net(s), -300);
});

test('tournament results use entries, prize and bounties', () => {
  const s = M.newSession({ type: 'tourney', buyIns: M.tourneyEntries(100, 10, 2), tourney: { buyIn: 100, fee: 10, prize: 500, bounties: 50 } });
  assert.equal(s.buyIns.length, 2);
  assert.equal(M.totalBuyIn(s), 220);
  assert.equal(M.net(s), 330);
  assert.equal(M.tourneyEntries(50, 0, 0).length, 1, 'at least one entry');
});

test('played time excludes breaks, including an open break', () => {
  const s = M.newSession({ start: 0, end: 5 * H, breaks: [{ start: H, end: H + 30 * 60e3 }] });
  assert.equal(M.playedMs(s), 4.5 * H);
  const live = { ...M.newSession({ start: 0, end: null, status: 'paused' }), breaks: [{ start: 2 * H, end: null }] };
  assert.equal(M.playedMs(live, 3 * H), 2 * H, 'open break counts up to now');
});

test('live flow: start, rebuy, stack, pause/resume, finish', () => {
  let s = M.startLive({ stakes: '1/2', firstBuyIn: 200 }, 0);
  assert.equal(s.status, 'running');
  assert.equal(M.totalBuyIn(s), 200);
  assert.equal(M.liveProfit(s), 0);
  s = M.setStack(s, 120, 10);
  assert.equal(M.liveProfit(s), -80);
  s = M.addBuyIn(s, 100, 20);
  assert.equal(M.totalBuyIn(s), 300);
  assert.equal(M.currentStack(s), 220, 'rebuy adds to the stack');
  s = M.pause(s, H);
  assert.equal(s.status, 'paused');
  assert.equal(M.pause(s, H).breaks.length, 1, 'pausing twice is a no-op');
  s = M.resume(s, H + 15 * 60e3);
  assert.equal(s.status, 'running');
  s = M.pause(s, 2 * H);
  s = M.finish(s, { cashOut: 500 }, 3 * H);           // finishing while on break closes the break
  assert.equal(s.status, 'done');
  assert.equal(s.end, 3 * H);
  assert.ok(s.breaks.every(b => b.end != null));
  assert.equal(M.playedMs(s), 3 * H - 15 * 60e3 - H);
  assert.equal(M.net(s), 200);
});

test('finish without a cash-out amount uses the current stack', () => {
  let s = M.startLive({ firstBuyIn: 100 }, 0);
  s = M.setStack(s, 175, 1);
  s = M.finish(s, {}, 2);
  assert.equal(s.cashOut, 175);
});

test('tournament finish merges results', () => {
  let s = M.startLive({ type: 'tourney', tourney: { buyIn: 50, fee: 5 }, buyIns: M.tourneyEntries(50, 5, 1, 0) }, 0);
  s = M.finish(s, { place: 3, entrants: 40, prize: 300, bounties: 0 }, H);
  assert.equal(s.tourney.buyIn, 50);
  assert.equal(s.tourney.place, 3);
  assert.equal(M.net(s), 245);
});

test('repeatOf copies the setup and first buy-in', () => {
  const prev = M.newSession({ type: 'cash', setting: 'live', game: 'PLO', stakes: '2/5', venue: 'Wildhorse', bankrollId: 'b1', buyIns: [{ amount: 500 }, { amount: 500 }], cashOut: 0, notes: 'x' });
  const s = M.repeatOf(prev, 1000);
  assert.equal(s.status, 'running');
  assert.equal(s.start, 1000);
  assert.equal(s.game, 'PLO');
  assert.equal(s.venue, 'Wildhorse');
  assert.equal(s.bankrollId, 'b1');
  assert.equal(M.totalBuyIn(s), 500);
  assert.equal(s.notes, '');
  assert.equal(s.id, undefined, 'gets a new id when saved');
});

test('bankroll balance and ledger combine transactions and finished sessions', () => {
  const txs = [
    { bankrollId: 'a', kind: 'deposit', amount: 1000, date: 1 },
    { bankrollId: 'a', kind: 'withdrawal', amount: 200, date: 5 },
    { bankrollId: 'b', kind: 'deposit', amount: 50, date: 1 },
  ];
  const sessions = [
    M.newSession({ bankrollId: 'a', start: 2, end: 3, buyIns: [{ amount: 100 }], cashOut: 250 }),
    M.newSession({ bankrollId: 'a', start: 6, end: 7, buyIns: [{ amount: 100 }], cashOut: 0 }),
    M.newSession({ bankrollId: 'a', start: 8, status: 'running', buyIns: [{ amount: 100 }] }),
  ];
  assert.equal(M.bankrollBalance('a', txs, sessions), 850);
  assert.equal(M.bankrollBalance('b', txs, sessions), 50);
  const l = M.ledger('a', txs, sessions);
  assert.deepEqual(l.map(r => r.balance), [1000, 1150, 950, 850]);
  assert.deepEqual(l.map(r => r.kind), ['deposit', 'session', 'withdrawal', 'session']);
});

test('suggestions: most used first, then defaults', () => {
  const s = [{ venue: 'B' }, { venue: 'A' }, { venue: 'B' }, { venue: '' }];
  assert.deepEqual(M.suggestions(s, 'venue', ['C', 'A']), ['B', 'A', 'C']);
});

test('sessionTitle', () => {
  assert.equal(M.sessionTitle({ type: 'cash', stakes: '1/2', game: 'NLH' }), '1/2 NLH');
  assert.equal(M.sessionTitle({ type: 'tourney', game: 'NLH' }), 'Tourney NLH');
  assert.equal(M.sessionTitle({ type: 'cash' }), 'Cash game');
});
