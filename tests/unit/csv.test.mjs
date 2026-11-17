import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';
import * as C from '../../js/csv.js';

test('CSV parse handles quotes, commas, new lines, BOM and semicolons', () => {
  assert.deepEqual(C.parseCSV('﻿a,b,c\r\n1,"x, y","he said ""hi"""\n2,"multi\nline",\n'), [['a', 'b', 'c'], ['1', 'x, y', 'he said "hi"'], ['2', 'multi\nline', '']]);
  assert.deepEqual(C.parseCSV('a;b\n1,5;2'), [['a', 'b'], ['1,5', '2']]);
  assert.deepEqual(C.parseCSV('a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']], 'blank lines skipped');
});

test('export then import gives the same sessions back', () => {
  const H = 3600e3, t0 = new Date(2026, 10, 3, 19, 30).getTime();
  const sessions = [
    M.newSession({ stakes: '1/2', game: 'NLH', venue: 'Wild, "horse"', start: t0, end: t0 + 4 * H, buyIns: [{ amount: 200 }, { amount: 100 }], cashOut: 455.5, expenses: [{ kind: 'Tips', amount: 10 }], notes: 'line1\nline2' }),
    M.newSession({ type: 'tourney', setting: 'online', game: 'NLH', venue: 'GG', start: t0 + 864e5, end: t0 + 864e5 + 5 * H, buyIns: M.tourneyEntries(100, 10, 1), tourney: { buyIn: 100, fee: 10, entrants: 80, place: 3, prize: 700, bounties: 0 } }),
    M.newSession({ status: 'running', start: t0 }),
  ];
  const csv = C.sessionsCSV(sessions, () => 'Main');
  const rows = C.parseCSV(csv);
  assert.equal(rows.length, 3, 'header + 2 finished sessions');
  const headers = rows[0];
  const map = C.autoMap(headers);
  const { sessions: back, skipped } = C.rowsToSessions(rows.slice(1), map, { headers });
  assert.equal(skipped.length, 0);
  assert.equal(back[0].start, t0);
  assert.equal(back[0].end, t0 + 4 * H);
  assert.equal(back[0].venue, 'Wild, "horse"');
  assert.equal(back[0].notes, 'line1\nline2');
  assert.equal(M.net(back[0]), M.net(sessions[0]));
  assert.equal(back[1].type, 'tourney');
  assert.equal(back[1].setting, 'online');
  assert.equal(back[1].tourney.place, 3);
  assert.equal(M.net(back[1]), 590);
});

test('auto-mapping common column names from other trackers', () => {
  const m = C.autoMap(['Start Time', 'End Time', 'Game', 'Limit', 'Location', 'Buy In', 'Cash Out', 'Profit', 'Notes']);
  assert.deepEqual(m, { start: 0, end: 1, game: 2, stakes: 3, venue: 4, buyIn: 5, cashOut: 6, profit: 7, notes: 8 });
  const m2 = C.autoMap(['date', 'duration (min)', 'casino', 'p/l']);
  assert.deepEqual(m2, { start: 0, hours: 1, venue: 2, profit: 3 });
});

test('dates, numbers and durations in many formats', () => {
  const d = (y, mo, da, h = 0, mi = 0) => new Date(y, mo - 1, da, h, mi).getTime();
  assert.equal(C.parseDate('2026-11-14 19:30'), d(2026, 11, 14, 19, 30));
  assert.equal(C.parseDate('2026-11-14T19:30:00'), d(2026, 11, 14, 19, 30));
  assert.equal(C.parseDate('11/14/2026 7:30 PM'), d(2026, 11, 14, 19, 30));
  assert.equal(C.parseDate('14/11/2026'), d(2026, 11, 14), 'day > 12 means day first');
  assert.equal(C.parseDate('03/04/2026', { dayFirst: true }), d(2026, 4, 3));
  assert.equal(C.parseDate('14.11.26 21:05'), d(2026, 11, 14, 21, 5));
  assert.equal(C.parseDate(''), null);
  assert.equal(C.parseNumber('$1,234.50'), 1234.5);
  assert.equal(C.parseNumber('1.234,50 €'), 1234.5);
  assert.equal(C.parseNumber('-$75'), -75);
  assert.equal(C.parseNumber('($75)'), -75);
  assert.equal(C.parseNumber('12,5'), 12.5);
  assert.equal(C.parseNumber(''), null);
  assert.equal(C.parseHours('4:30'), 4.5);
  assert.equal(C.parseHours('270', 'Duration (min)'), 4.5);
  assert.equal(C.parseHours('4h 30m'), 4.5);
  assert.equal(C.parseHours('3.25'), 3.25);
});

test('rows with only profit and duration still import', () => {
  const rows = [['2026-11-01 18:00', '5', '1/2', '-150'], ['2026-11-02 18:00', '3', '1/2', '+$320'], ['', '3', '1/2', '10'], ['2026-11-03', '2', '1/2', '']];
  const { sessions, skipped } = C.rowsToSessions(rows, { start: 0, hours: 1, stakes: 2, profit: 3 });
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(M.net), [-150, 320]);
  assert.equal(M.hours(sessions[0]), 5);
  assert.deepEqual(skipped.map(s => s.reason), ['no start date', 'no amounts']);
});

test('end time after midnight', () => {
  const { sessions } = C.rowsToSessions([['2026-11-01 22:00', '2026-11-01 02:00', '100', '150']], { start: 0, end: 1, buyIn: 2, cashOut: 3 });
  assert.equal(M.hours(sessions[0]), 4);
});

test('dedupe skips sessions that are already there', () => {
  const a = M.newSession({ start: 60e3 * 1000, buyIns: [{ amount: 100 }], cashOut: 150 });
  const b = M.newSession({ start: 60e3 * 1000, buyIns: [{ amount: 200 }], cashOut: 250 }); // same start + same net
  const c = M.newSession({ start: 60e3 * 2000, buyIns: [{ amount: 100 }], cashOut: 150 });
  const r = C.dedupe([a], [b, c, c]);
  assert.equal(r.fresh.length, 1);
  assert.equal(r.dupes.length, 2);
});

test('transactions CSV', () => {
  const csv = C.transactionsCSV([{ bankrollId: 'x', kind: 'deposit', amount: 500, date: new Date(2026, 0, 1).getTime(), note: 'start' }], () => 'Main');
  assert.match(csv, /Date,Bankroll,Type,Amount,Note/);
  assert.match(csv, /2026-01-01 00:00,Main,Deposit,500,start/);
});
