// Unit tests for the "easier flow" logic: tournament add-ons and bounties, undo end, backup reminders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';
import * as S from '../../js/stats.js';
import * as C from '../../js/csv.js';

const H = 3600e3, D = 864e5;
const t0 = new Date(2026, 10, 10, 12, 0).getTime();

const liveTourney = () => M.startLive({ type: 'tourney', tourney: { buyIn: 100, fee: 10 }, firstBuyIn: 110 }, t0);

test('add-ons cost money but are not entries; re-entries are', () => {
  let s = liveTourney();
  s = M.addBuyIn(s, 110, t0 + H);                 // re-entry
  s = M.addBuyIn(s, 50, t0 + 2 * H, 'addon');     // add-on
  assert.equal(M.totalBuyIn(s), 270);
  assert.equal(M.entryCount(s), 2);
  assert.equal(s.buyIns[2].kind, 'addon');
  assert.equal('kind' in s.buyIns[1], false, 'a plain re-entry has no kind');
  assert.equal(M.entryCount({ buyIns: [] }), 0);
  assert.equal(M.entryCount({}), 0);
});

test('bounties add up and round to cents', () => {
  let s = liveTourney();
  s = M.addBounty(s, 25); s = M.addBounty(s, 0.1); s = M.addBounty(s, 0.2);
  assert.equal(s.tourney.bounties, 25.3);
  assert.equal(s.tourney.buyIn, 100, 'other tournament fields are kept');
  assert.equal(M.addBounty({}, 5).tourney.bounties, 5, 'works with no tournament data yet');
});

test('busted tournament: result is bounties minus everything paid in', () => {
  let s = liveTourney();
  s = M.addBuyIn(s, 50, t0 + H, 'addon');
  s = M.addBounty(s, 40);
  const done = M.finish(s, { place: 30, entrants: 120, prize: 0, bounties: s.tourney.bounties }, t0 + 4 * H);
  assert.equal(M.net(done), 40 - 160);
  assert.equal(M.hours(done), 4);
});

test('tournament stats count entries without add-ons, ROI includes add-on cost', () => {
  const a = M.finish(M.addBuyIn(liveTourney(), 50, t0 + H, 'addon'), { place: 1, prize: 640, bounties: 0 }, t0 + 5 * H);
  const b = M.finish(M.addBuyIn(liveTourney(), 110, t0 + H), { place: 80, prize: 0, bounties: 0 }, t0 + 3 * H);
  const t = S.tourneySummary([a, b]);
  assert.equal(t.count, 2);
  assert.equal(t.entries, 3);
  assert.equal(t.cost, 380);
  assert.equal(t.roi, 68.4);   // (640 - 380) / 380
  assert.equal(t.itm, 50);
});

test('sessions CSV shows entries without add-ons', () => {
  const s = M.finish(M.addBuyIn(liveTourney(), 50, t0 + H, 'addon'), { prize: 0 }, t0 + 2 * H);
  const csv = C.sessionsCSV([s]);
  const [head, row] = C.parseCSV(csv);
  assert.equal(row[head.indexOf('Entries')], '1');
});

test('undo end: only for sessions ended live, and only for 15 minutes', () => {
  const s = M.startLive({ stakes: '1/2', firstBuyIn: 200 }, t0);
  const ended = { ...M.finish(s, { cashOut: 350 }, t0 + 3 * H), endedLive: t0 + 3 * H };
  assert.equal(M.canUndoEnd(ended, t0 + 3 * H + 60e3), true);
  assert.equal(M.canUndoEnd(ended, t0 + 3 * H + M.UNDO_WINDOW - 1), true);
  assert.equal(M.canUndoEnd(ended, t0 + 3 * H + M.UNDO_WINDOW), false, 'window closed');
  assert.equal(M.canUndoEnd(M.finish(s, { cashOut: 350 }, t0 + 3 * H), t0 + 3 * H + 60e3), false, 'logged after the fact: no undo');
  assert.equal(M.canUndoEnd(s, t0 + H), false, 'still running');
});

test('undo end on a cash game: running again, cash-out cleared, buy-ins kept', () => {
  let s = M.startLive({ stakes: '1/2', firstBuyIn: 200 }, t0);
  s = M.addBuyIn(s, 100, t0 + H);
  const ended = { ...M.finish(s, { cashOut: 350 }, t0 + 3 * H), endedLive: t0 + 3 * H };
  const back = M.undoEnd(ended);
  assert.equal(back.status, 'running');
  assert.equal(back.end, null);
  assert.equal(back.cashOut, null);
  assert.equal(back.endedLive, null);
  assert.equal(M.totalBuyIn(back), 300);
  assert.equal(M.isRunning(back), true);
  assert.equal(M.canUndoEnd(back, t0 + 3 * H), false);
  // the clock keeps counting from the original start
  assert.equal(M.hours(back, t0 + 4 * H), 4);
  // ending again works normally
  assert.equal(M.net(M.finish(back, { cashOut: 500 }, t0 + 5 * H)), 200);
});

test('undo end on a tournament: place and prize cleared, bounties kept', () => {
  const s = M.addBounty(liveTourney(), 30);
  const ended = { ...M.finish(s, { place: 3, entrants: 50, prize: 400, bounties: 30 }, t0 + 6 * H), endedLive: t0 + 6 * H };
  const back = M.undoEnd(ended);
  assert.equal(back.tourney.place, null);
  assert.equal(back.tourney.prize, 0);
  assert.equal(back.tourney.bounties, 30);
  assert.equal(back.tourney.entrants, 50);
  assert.equal(back.status, 'running');
});

test('undo end after ending on a break keeps the break closed', () => {
  let s = M.startLive({ stakes: '1/2', firstBuyIn: 200 }, t0);
  s = M.pause(s, t0 + H);
  const ended = { ...M.finish(s, { cashOut: 200 }, t0 + 2 * H), endedLive: t0 + 2 * H };
  const back = M.undoEnd(ended);
  assert.equal(back.breaks.length, 1);
  assert.equal(back.breaks[0].end, t0 + 2 * H);
  assert.equal(M.hours(back, t0 + 3 * H), 2);   // 3h on the clock, 1h break
});

const done = (start, extra = {}) => ({ ...M.newSession({ start, end: start + 3 * H, buyIns: [{ amount: 100 }], cashOut: 100 }), createdAt: start, ...extra });

test('backup reminder: nothing to back up, nothing to say', () => {
  assert.equal(M.backupDue([], 0, t0), null);
  const running = M.startLive({ firstBuyIn: 100 }, t0 - 30 * D);
  assert.equal(M.backupDue([running], 0, t0), null, 'a running session alone does not count');
});

test('backup reminder: 10 new sessions since the last backup', () => {
  const nine = Array.from({ length: 9 }, (_, i) => done(t0 - (i + 1) * H));
  assert.equal(M.backupDue(nine, 0, t0), null, '9 recent sessions: not yet');
  const ten = [...nine, done(t0 - 20 * H)];
  assert.deepEqual(M.backupDue(ten, 0, t0), { since: 10, days: 0 });
  // a backup after them resets the count
  assert.equal(M.backupDue(ten, t0 - 1, t0), null);
  // only sessions after the backup count
  assert.equal(M.backupDue(ten, t0 - 5 * H, t0), null);
});

test('backup reminder: 14 days with at least one new session', () => {
  const old = [done(t0 - 20 * D)];
  assert.deepEqual(M.backupDue(old, 0, t0), { since: 1, days: 20 }, 'never backed up, first session 20 days ago');
  assert.equal(M.backupDue([done(t0 - 13 * D)], 0, t0), null, '13 days: not yet');
  assert.ok(M.backupDue([done(t0 - 14 * D)], 0, t0), '14 days: due');
  // backed up 30 days ago but nothing new since: no nag
  assert.equal(M.backupDue([done(t0 - 40 * D)], t0 - 30 * D, t0), null);
  // backed up 15 days ago, one new session since: due
  assert.deepEqual(M.backupDue([done(t0 - 40 * D), done(t0 - 2 * D)], t0 - 15 * D, t0), { since: 1, days: 15 });
});

test('backup reminder: snooze hides it until the snooze ends', () => {
  const ten = Array.from({ length: 10 }, (_, i) => done(t0 - (i + 1) * H));
  assert.equal(M.backupDue(ten, 0, t0, t0 + 7 * D), null);
  assert.ok(M.backupDue(ten, 0, t0 + 7 * D, t0 + 7 * D));
});

test('backup reminder uses the start time when a session has no createdAt', () => {
  const s = M.newSession({ start: t0 - 20 * D, end: t0 - 20 * D + H, buyIns: [{ amount: 1 }], cashOut: 1 });
  delete s.createdAt;
  assert.ok(M.backupDue([s], 0, t0));
});
