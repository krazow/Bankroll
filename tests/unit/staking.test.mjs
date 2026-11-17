import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';
import * as K from '../../js/staking.js';

const tour = (prize, extra = {}) => M.newSession({ type: 'tourney', start: 1, end: 2, buyIns: [{ amount: 100 }], tourney: { buyIn: 100, fee: 0, prize, bounties: 0 }, ...extra });
const cash = (bi, co, extra = {}) => M.newSession({ type: 'cash', start: 1, end: 2, buyIns: [{ amount: bi }], cashOut: co, ...extra });

test('selling action with markup: backer pays share x cost x markup, gets share of the prize', () => {
  const s = tour(1000, { backing: [{ backerId: 'ann', share: 30, markup: 1.2 }, { backerId: 'bob', share: 20, markup: 1 }] });
  const ann = K.backerPart(s, s.backing[0]);
  assert.deepEqual([ann.cost, ann.paidIn, ann.returns, ann.result, ann.markupEarned], [30, 36, 300, 264, 6]);
  assert.equal(K.soldShare(s), 50);
  // whole session +900; Ann's result 264, Bob's 180 → you keep 456 (50% of 900 = 450, plus $6 markup)
  assert.equal(K.playerNet(s), 456);
});

test('a losing tournament: backers lose their stake, you keep the markup', () => {
  const s = tour(0, { backing: [{ backerId: 'ann', share: 50, markup: 1.1 }] });
  assert.equal(K.backerPart(s, s.backing[0]).result, -55);
  assert.equal(K.playerNet(s), -45);          // -100 + 55 from Ann
});

test('expenses stay with the player', () => {
  const s = cash(100, 300, { expenses: [{ amount: 10 }], backing: [{ backerId: 'x', share: 50, markup: 1 }] });
  assert.equal(M.net(s), 190);
  assert.equal(K.playerNet(s), 90);           // 190 - backer's 100
});

test('package with makeup: losses carry, profit splits only after makeup is cleared', () => {
  const deal = { id: 'd1', backerId: 'sam', share: 100, markup: 1, makeup: true, split: 50 };
  const link = { backerId: 'sam', dealId: 'd1', share: 100, markup: 1 };
  const sessions = [cash(500, 0, { backing: [link], start: 1 }), cash(500, 700, { backing: [link], start: 2 })];
  let st = K.packageState(deal, sessions, []);
  assert.equal(st.balance, -300);
  assert.equal(st.makeup, 300);
  assert.equal(st.canSettle, false);
  assert.throws(() => K.makeSettle(deal, st), /makeup by 300/);
  sessions.push(cash(500, 1300, { backing: [link], start: 3 }));
  st = K.packageState(deal, sessions, []);
  assert.deepEqual([st.balance, st.makeup, st.canSettle, st.playerCut, st.backerCut], [500, 0, true, 250, 250]);
  const settle = K.makeSettle(deal, st, 10);
  st = K.packageState(deal, sessions, [settle]);
  assert.equal(st.balance, 0, 'cleared after settling');
  // your own money: the staked sessions themselves give you nothing until the settlement
  assert.equal(K.ownResults(sessions), 0);
});

test('who owes whom, with payments and settlements', () => {
  const link = { backerId: 'sam', dealId: 'd1', share: 100, markup: 1 };
  const sessions = [cash(500, 900, { backing: [link] })];            // +400 for the package
  const money = [{ backerId: 'sam', kind: 'received', amount: 1000, date: 0 }];
  let b = K.backerBalance('sam', sessions, money);
  assert.equal(b.due, 1400, 'you hold their 1000 plus the 400 won');
  money.push({ kind: 'settle', backerId: 'sam', dealId: 'd1', date: 5, packageResult: 400, playerCut: 200 });
  b = K.backerBalance('sam', sessions, money);
  assert.equal(b.due, 1200, 'after your 200 cut');
  money.push({ backerId: 'sam', kind: 'paid', amount: 1200, date: 6 });
  assert.equal(K.backerBalance('sam', sessions, money).due, 0);
  const rows = K.statement('sam', sessions, money);
  assert.deepEqual(rows.map(r => r.kind), ['received', 'session', 'settle', 'paid']);
  assert.deepEqual(rows.map(r => r.due), [1000, 1400, 1200, 0]);
});

test('a backer who hasn’t paid for their action owes you', () => {
  const s = tour(0, { backing: [{ backerId: 'kim', share: 25, markup: 1.2 }] });
  assert.equal(K.backerBalance('kim', [s], []).due, -30);
});

test('auto-attach picks active deals that match the session type', () => {
  const deals = [
    { id: 'a', backerId: 'x', share: 100, markup: 1, autoAttach: 'tourney', status: 'active' },
    { id: 'b', backerId: 'y', share: 50, markup: 1, autoAttach: 'all', status: 'active' },
    { id: 'c', backerId: 'z', share: 10, markup: 1, autoAttach: 'all', status: 'closed' },
    { id: 'd', backerId: 'w', share: 10, markup: 1, autoAttach: 'none', status: 'active' },
  ];
  assert.deepEqual(K.autoBacking({ type: 'cash' }, deals).map(l => l.dealId), ['b']);
  assert.deepEqual(K.autoBacking({ type: 'tourney' }, deals).map(l => l.dealId), ['a', 'b']);
});

test('validation', () => {
  assert.equal(K.validateBacking([{ share: 40, markup: 1.1 }, { share: 60, markup: 1 }]), 100);
  assert.throws(() => K.validateBacking([{ share: 70, markup: 1 }, { share: 40, markup: 1 }]), /110%/);
  assert.throws(() => K.validateBacking([{ share: 0, markup: 1 }]), /above 0%/);
  assert.throws(() => K.validateBacking([{ share: 10, markup: 9 }]), /Markup/);
});

test('running sessions are left out', () => {
  const s = M.newSession({ status: 'running', buyIns: [{ amount: 100 }], backing: [{ backerId: 'a', share: 50, markup: 1 }] });
  assert.equal(K.playerNet(s), 0);
  assert.equal(K.backerBalance('a', [s], []).due, 0);
});
