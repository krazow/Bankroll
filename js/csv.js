// CSV export and import. Pure functions (no DOM, no storage).
import * as M from './model.js';
import { playerNet } from './staking.js';

// ---------- writing
const cell = v => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCSV(rows, columns) {
  return [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(c.get(r))).join(','))].join('\r\n') + '\r\n';
}

const iso = ms => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60e3).toISOString().slice(0, 16).replace('T', ' ') : '');
const r2 = n => Math.round(n * 100) / 100;

export function sessionColumns(bankrollName = () => '') {
  return [
    { label: 'Date', get: s => iso(s.start).slice(0, 10) },
    { label: 'Start', get: s => iso(s.start) },
    { label: 'End', get: s => iso(s.end) },
    { label: 'Hours', get: s => r2(M.hours(s)) },
    { label: 'Type', get: s => (s.type === 'tourney' ? 'Tournament' : 'Cash') },
    { label: 'Live/Online', get: s => (s.setting === 'online' ? 'Online' : 'Live') },
    { label: 'Game', get: s => s.game },
    { label: 'Stakes', get: s => s.stakes },
    { label: 'Big blind', get: s => M.bigBlind(s) ?? '' },
    { label: 'Venue', get: s => s.venue },
    { label: 'Bankroll', get: s => bankrollName(s.bankrollId) },
    { label: 'Buy-in', get: s => r2(M.totalBuyIn(s)) },
    { label: 'Cash out', get: s => (s.type === 'tourney' ? r2(M.winnings(s)) : s.cashOut ?? '') },
    { label: 'Tourney buy-in', get: s => s.tourney?.buyIn ?? '' },
    { label: 'Tourney fee', get: s => s.tourney?.fee ?? '' },
    { label: 'Entries', get: s => (s.type === 'tourney' ? s.buyIns.length : '') },
    { label: 'Players', get: s => s.tourney?.entrants ?? '' },
    { label: 'Place', get: s => s.tourney?.place ?? '' },
    { label: 'Prize', get: s => s.tourney?.prize ?? '' },
    { label: 'Bounties', get: s => s.tourney?.bounties ?? '' },
    { label: 'Expenses', get: s => r2(M.expensesTotal(s)) },
    { label: 'Result before expenses', get: s => M.gross(s) },
    { label: 'Net result', get: s => M.net(s) },
    { label: 'Your share of result', get: s => playerNet(s) },
    { label: 'Notes', get: s => s.notes },
  ];
}

export function sessionsCSV(sessions, bankrollName) {
  const done = sessions.filter(s => s.status === 'done').sort((a, b) => a.start - b.start);
  return toCSV(done, sessionColumns(bankrollName));
}

export function transactionsCSV(txs, bankrollName = () => '') {
  return toCSV([...txs].sort((a, b) => a.date - b.date), [
    { label: 'Date', get: t => iso(t.date) }, { label: 'Bankroll', get: t => bankrollName(t.bankrollId) },
    { label: 'Type', get: t => (t.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit') }, { label: 'Amount', get: t => t.amount }, { label: 'Note', get: t => t.note },
  ]);
}

// One backer's statement: + means you owe them more.
export function statementCSV(backer, rows, sessionById = {}, dealName = {}) {
  return toCSV(rows, [
    { label: 'Date', get: r => iso(r.at) },
    { label: 'Backer', get: () => backer.name },
    { label: 'Item', get: r => r.label },
    { label: 'Package', get: r => (r.dealId ? dealName[r.dealId] || '' : '') },
    { label: 'Venue', get: r => (r.sessionId ? sessionById[r.sessionId]?.venue || '' : '') },
    { label: 'Share %', get: r => r.share ?? '' },
    { label: 'Markup', get: r => r.markup ?? '' },
    { label: 'Backer paid in', get: r => r.paidIn ?? '' },
    { label: 'Backer gets back', get: r => r.returns ?? '' },
    { label: 'Change', get: r => r.amount },
    { label: 'Balance (you owe them)', get: r => r.due },
    { label: 'Note', get: r => r.note || '' },
  ]);
}

// ---------- reading
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], val = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
      else if (c === '"') q = false;
      else val += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(val); val = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(val); rows.push(row); row = []; val = '';
    } else val += c;
  }
  if (val !== '' || row.length) { row.push(val); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// What each of our fields might be called in other apps' exports or your own spreadsheet.
export const FIELDS = {
  start: ['start', 'start time', 'starttime', 'start date', 'started', 'date', 'session date', 'begin'],
  end: ['end', 'end time', 'endtime', 'end date', 'ended', 'finish'],
  hours: ['hours', 'duration', 'length', 'time played', 'hours played', 'duration (hours)', 'minutes', 'duration (min)', 'mins'],
  type: ['type', 'session type', 'game type', 'format', 'cash/tourney', 'kind'],
  setting: ['live/online', 'live or online', 'setting', 'online', 'is online', 'platform'],
  game: ['game', 'variant', 'game name', 'poker game'],
  stakes: ['stakes', 'stake', 'limit', 'blinds', 'level'],
  bigBlind: ['big blind', 'bb', 'big blind size'],
  venue: ['venue', 'location', 'casino', 'site', 'room', 'place played', 'card room'],
  buyIn: ['buy-in', 'buy in', 'buyin', 'total buy-in', 'total buy in', 'invested', 'cost'],
  cashOut: ['cash out', 'cash-out', 'cashout', 'cashed out', 'winnings', 'payout', 'won'],
  fee: ['fee', 'rake', 'tourney fee', 'entry fee'],
  entrants: ['players', 'entrants', 'field size', 'field', 'entries total'],
  place: ['place', 'position', 'finish', 'finished', 'rank'],
  prize: ['prize', 'prize money', 'cash'],
  profit: ['profit', 'net', 'net result', 'result', 'profit/loss', 'p/l', 'pnl', 'win/loss', 'amount'],
  expenses: ['expenses', 'tips', 'costs'],
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
};

const norm = s => String(s || '').toLowerCase().replace(/[_]/g, ' ').replace(/\s+/g, ' ').trim();

// Guess which column holds which field. Returns { field: columnIndex }.
export function autoMap(headers) {
  const h = headers.map(norm);
  const map = {};
  const taken = new Set();
  // exact names first, then "contains"
  for (const pass of ['exact', 'contains']) {
    for (const [field, names] of Object.entries(FIELDS)) {
      if (map[field] !== undefined) continue;
      // names are in priority order: "start" beats "date" when both columns exist
      for (const n of names) {
        const idx = h.findIndex((x, i) => !taken.has(i) && (pass === 'exact' ? x === n : n.length > 3 && x.includes(n)));
        if (idx >= 0) { map[field] = idx; taken.add(idx); break; }
      }
    }
  }
  // "Hours" and "Hours played" both exist? keep the first. If "date" was used for start and there's also a time column, fine.
  return map;
}

// Dates like 2026-11-14, 2026-11-14 19:30, 11/14/2026 7:30 PM, 14.11.2026 19:30. `dayFirst` for 14/11/2026.
export function parseDate(v, { dayFirst = false } = {}) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    const dotted = s.includes('.');
    let month = a, day = b;
    if (dayFirst || dotted || a > 12) { month = b; day = a; }
    let year = +m[3]; if (year < 100) year += 2000;
    let hr = +(m[4] || 0);
    const ap = (m[7] || '').toLowerCase();
    if (ap === 'pm' && hr < 12) hr += 12;
    if (ap === 'am' && hr === 12) hr = 0;
    return new Date(year, month - 1, day, hr, +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[^\d\-(]/g, '')) || s.startsWith('-');
  s = s.replace(/[^\d.,]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// Duration like "4.5", "4:30", "270" (minutes when the column says minutes), "4h 30m".
export function parseHours(v, header = '') {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  let m = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) return +m[1] + +m[2] / 60 + (+(m[3] || 0)) / 3600;
  m = s.match(/(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (m && (m[1] || m[2])) return (+(m[1] || 0)) + (+(m[2] || 0)) / 60;
  const n = parseNumber(s);
  if (n === null) return null;
  return /min/i.test(header) ? n / 60 : n;
}

// Turns CSV rows into sessions. Returns { sessions, skipped: [{line, reason}] }.
export function rowsToSessions(rows, map, { dayFirst = false, bankrollId = null, headers = [] } = {}) {
  const out = [], skipped = [];
  const get = (r, f) => (map[f] === undefined || map[f] === null || map[f] === '' ? null : r[map[f]]);
  rows.forEach((r, i) => {
    const line = i + 2;
    const start = parseDate(get(r, 'start'), { dayFirst });
    if (!start) { skipped.push({ line, reason: 'no start date' }); return; }
    let end = parseDate(get(r, 'end'), { dayFirst });
    const hrs = parseHours(get(r, 'hours'), headers[map.hours] || '');
    if (end && end < start) end += 864e5; // end time past midnight with only a time-of-day change
    if (!end) end = start + (hrs !== null ? hrs : 0) * 3600e3;
    const typeRaw = norm(get(r, 'type'));
    const isTourney = /tour|mtt|sng|sit|freeroll/.test(typeRaw);
    const settingRaw = norm(get(r, 'setting'));
    const setting = /online|true|yes|^1$/.test(settingRaw) ? 'online' : 'live';
    let buyIn = parseNumber(get(r, 'buyIn'));
    let cashOut = parseNumber(get(r, 'cashOut'));
    const profit = parseNumber(get(r, 'profit'));
    const prize = parseNumber(get(r, 'prize'));
    const expenses = parseNumber(get(r, 'expenses'));
    if (buyIn === null && cashOut === null && profit === null && prize === null) { skipped.push({ line, reason: 'no amounts' }); return; }
    // Fill the gaps from profit when only part of the money is given.
    if (buyIn === null && cashOut === null) { buyIn = profit < 0 ? -profit : 0; cashOut = profit > 0 ? profit : 0; }
    else if (buyIn === null) buyIn = profit !== null ? (cashOut ?? 0) - profit : 0;
    else if (cashOut === null && !isTourney) cashOut = profit !== null ? buyIn + profit : 0;
    const s = M.newSession({
      type: isTourney ? 'tourney' : 'cash', setting, start, end, status: 'done', bankrollId,
      game: String(get(r, 'game') || '').trim() || 'NLH', stakes: isTourney ? '' : String(get(r, 'stakes') || '').trim(),
      bigBlind: parseNumber(get(r, 'bigBlind')), venue: String(get(r, 'venue') || '').trim(), notes: String(get(r, 'notes') || '').trim(),
      buyIns: [{ amount: Math.abs(buyIn || 0), at: start }],
      expenses: expenses ? [{ kind: 'Other', amount: Math.abs(expenses) }] : [],
      imported: true,
    });
    if (isTourney) {
      const fee = parseNumber(get(r, 'fee')) || 0;
      const won = prize !== null ? prize : (cashOut ?? (profit !== null ? profit + buyIn : 0));
      s.tourney = { buyIn: Math.max(0, (buyIn || 0) - fee), fee, entrants: parseNumber(get(r, 'entrants')), place: parseNumber(get(r, 'place')), prize: Math.max(0, won), bounties: 0 };
      s.cashOut = null;
    } else {
      s.cashOut = Math.max(0, cashOut ?? 0);
    }
    out.push(s);
  });
  return { sessions: out, skipped };
}

// Same start time and same result = same session (so importing a file twice doesn't double it).
export function dedupe(existing, incoming) {
  const keys = new Set(existing.map(s => `${Math.round(s.start / 60e3)}|${M.net(s)}`));
  const fresh = [], dupes = [];
  for (const s of incoming) {
    const k = `${Math.round(s.start / 60e3)}|${M.net(s)}`;
    if (keys.has(k)) dupes.push(s); else { keys.add(k); fresh.push(s); }
  }
  return { fresh, dupes };
}
