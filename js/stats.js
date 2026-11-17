// Analytics over finished sessions. Pure functions (no DOM, no storage).
import * as M from './model.js';

const round = (n, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const finished = sessions => sessions.filter(s => s.status === 'done');

// ---- filters
// f: { type, setting, game, stakes, venue, bankrollId, from, to, dow (0-6), tod, length }
export function applyFilter(sessions, f = {}) {
  return finished(sessions).filter(s =>
    (!f.type || s.type === f.type) &&
    (!f.setting || s.setting === f.setting) &&
    (!f.game || s.game === f.game) &&
    (!f.stakes || s.stakes === f.stakes) &&
    (!f.venue || s.venue === f.venue) &&
    (!f.bankrollId || s.bankrollId === f.bankrollId) &&
    (f.from == null || s.start >= f.from) &&
    (f.to == null || s.start < f.to) &&
    (f.dow == null || f.dow === '' || new Date(s.start).getDay() === Number(f.dow)) &&
    (!f.tod || timeOfDay(s) === f.tod) &&
    (!f.length || lengthBucket(s) === f.length));
}

// Period presets -> {from, to}
export function period(name, now = Date.now()) {
  const d = new Date(now);
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  switch (name) {
    case 'month': return { from: startOfMonth, to: null };
    case 'lastmonth': return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), to: startOfMonth };
    case '30d': return { from: now - 30 * 864e5, to: null };
    case '90d': return { from: now - 90 * 864e5, to: null };
    case 'year': return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: null };
    default: return { from: null, to: null };
  }
}

export function timeOfDay(s) {
  const h = new Date(s.start).getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Late night';
}
export function lengthBucket(s) {
  const h = M.hours(s);
  if (h < 2) return 'Under 2h';
  if (h < 4) return '2–4h';
  if (h < 6) return '4–6h';
  return '6h+';
}

// ---- summary
export function summary(sessions) {
  const done = finished(sessions);
  const nets = done.map(M.net);
  const hours = done.reduce((a, s) => a + M.hours(s), 0);
  const net = nets.reduce((a, b) => a + b, 0);
  const wins = nets.filter(n => n > 0).length;
  // BB/hour from cash games that have a big blind
  const bbGames = done.filter(s => s.type === 'cash' && M.bigBlind(s) > 0);
  const bbHours = bbGames.reduce((a, s) => a + M.hours(s), 0);
  const bbWon = bbGames.reduce((a, s) => a + M.gross(s) / M.bigBlind(s), 0);
  return {
    count: done.length,
    hours: round(hours),
    net: round(net),
    gross: round(done.reduce((a, s) => a + M.gross(s), 0)),
    expenses: round(done.reduce((a, s) => a + M.expensesTotal(s), 0)),
    hourly: hours > 0 ? round(net / hours) : null,
    winRate: done.length ? round((wins / done.length) * 100, 1) : null,
    avg: done.length ? round(net / done.length) : null,
    biggestWin: nets.length ? Math.max(0, ...nets) : null,
    biggestLoss: nets.length ? Math.min(0, ...nets) : null,
    bbPerHour: bbHours > 0 ? round(bbWon / bbHours, 2) : null,
    longestWinStreak: streak(done, n => n > 0),
  };
}

function streak(done, pred) {
  let best = 0, cur = 0;
  for (const s of [...done].sort((a, b) => a.start - b.start)) { if (pred(M.net(s))) { cur++; best = Math.max(best, cur); } else cur = 0; }
  return best;
}

export function tourneySummary(sessions) {
  const t = finished(sessions).filter(s => s.type === 'tourney');
  if (!t.length) return null;
  const cost = t.reduce((a, s) => a + M.totalBuyIn(s), 0);
  const won = t.reduce((a, s) => a + M.winnings(s), 0);
  const cashed = t.filter(s => (Number(s.tourney?.prize) || 0) > 0).length;
  const placed = t.filter(s => s.tourney?.place > 0);
  const withField = placed.filter(s => s.tourney?.entrants > 0);
  return {
    count: t.length,
    entries: t.reduce((a, s) => a + s.buyIns.length, 0),
    cost: round(cost), won: round(won), profit: round(won - cost),
    roi: cost > 0 ? round(((won - cost) / cost) * 100, 1) : null,
    itm: round((cashed / t.length) * 100, 1),
    avgFinish: placed.length ? round(placed.reduce((a, s) => a + s.tourney.place, 0) / placed.length, 1) : null,
    // average finish as % of the field (lower is better)
    avgFinishPct: withField.length ? round((withField.reduce((a, s) => a + s.tourney.place / s.tourney.entrants, 0) / withField.length) * 100, 1) : null,
    avgField: withField.length ? Math.round(withField.reduce((a, s) => a + s.tourney.entrants, 0) / withField.length) : null,
  };
}

// ---- breakdowns
export const GROUPS = {
  game: { label: 'Game', key: s => s.game || '—' },
  stakes: { label: 'Stakes', key: s => (s.type === 'tourney' ? 'Tournaments' : s.stakes || '—') },
  venue: { label: 'Venue', key: s => s.venue || '—' },
  type: { label: 'Cash / tourney', key: s => (s.type === 'tourney' ? 'Tournament' : 'Cash') },
  setting: { label: 'Live / online', key: s => (s.setting === 'online' ? 'Online' : 'Live') },
  dow: { label: 'Day of week', key: s => DAYS[new Date(s.start).getDay()], order: DAYS },
  tod: { label: 'Time of day', key: timeOfDay, order: ['Morning', 'Afternoon', 'Evening', 'Late night'] },
  length: { label: 'Session length', key: lengthBucket, order: ['Under 2h', '2–4h', '4–6h', '6h+'] },
  month: { label: 'Month', key: s => { const d = new Date(s.start); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } },
};

export function breakdown(sessions, groupBy) {
  const g = GROUPS[groupBy] || GROUPS.game;
  const map = new Map();
  for (const s of finished(sessions)) {
    const k = g.key(s);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  const rows = [...map.entries()].map(([key, list]) => {
    const sm = summary(list);
    return { key, count: sm.count, hours: sm.hours, net: sm.net, hourly: sm.hourly, winRate: sm.winRate, bbPerHour: sm.bbPerHour };
  });
  if (g.order) rows.sort((a, b) => g.order.indexOf(a.key) - g.order.indexOf(b.key));
  else if (groupBy === 'month') rows.sort((a, b) => b.key.localeCompare(a.key));
  else rows.sort((a, b) => b.net - a.net);
  return rows;
}

// ---- graph data: running total after each session (in time order)
export function cumulative(sessions) {
  let total = 0;
  return finished(sessions).sort((a, b) => (a.end ?? a.start) - (b.end ?? b.start)).map((s, i) => {
    total = round(total + M.net(s));
    return { i: i + 1, t: s.end ?? s.start, value: total, net: M.net(s), id: s.id };
  });
}

// ---- calendar: net and hours per local day for a month
export function calendar(sessions, year, month) {
  const days = new Map();
  for (const s of finished(sessions)) {
    const d = new Date(s.start);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const k = d.getDate();
    const cur = days.get(k) || { net: 0, hours: 0, count: 0 };
    cur.net = round(cur.net + M.net(s)); cur.hours = round(cur.hours + M.hours(s)); cur.count++;
    days.set(k, cur);
  }
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const max = Math.max(1, ...[...days.values()].map(d => Math.abs(d.net)));
  return { first, count, days, max };
}
// Color strength 1-3 for a day's result relative to the month's biggest day.
export function heat(net, max) {
  if (!net) return '';
  const lvl = Math.min(3, Math.max(1, Math.ceil((Math.abs(net) / max) * 3)));
  return (net > 0 ? 'p' : 'n') + lvl;
}

// ---- goals (this calendar month)
// goals: { profit, hours, sessions }
export function goalProgress(sessions, goals = {}, now = Date.now()) {
  const { from } = period('month', now);
  const month = finished(sessions).filter(s => s.start >= from);
  const sm = summary(month);
  const mk = (target, value) => (target > 0 ? { target, value, pct: Math.max(0, Math.min(100, round((value / target) * 100, 0))) } : null);
  const d = new Date(now);
  const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    profit: mk(Number(goals.profit) || 0, sm.net),
    hours: mk(Number(goals.hours) || 0, sm.hours),
    sessions: mk(Number(goals.sessions) || 0, sm.count),
    monthPct: round((d.getDate() / daysIn) * 100, 0),
  };
}

// ---- bankroll rules
export const DEFAULT_RULES = { cashBuyIns: 20, buyInBB: 100, tourneyBuyIns: 50, stopLoss: 0, stopWin: 0 };

// How many buy-ins the bankroll covers at each stake you play.
export function buyInsAt(balance, stakesList, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...rules };
  return stakesList.map(st => {
    const p = M.parseStakes(st);
    if (!p) return null;
    const buyIn = p.bb * r.buyInBB;
    const n = buyIn > 0 ? Math.floor((balance / buyIn) * 10) / 10 : 0;
    return { stakes: st, buyIn, buyIns: n, ok: n >= r.cashBuyIns };
  }).filter(Boolean);
}

export function tourneyBuyIns(balance, avgBuyIn, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...rules };
  if (!(avgBuyIn > 0)) return null;
  const n = Math.floor((balance / avgBuyIn) * 10) / 10;
  return { buyIn: avgBuyIn, buyIns: n, ok: n >= r.tourneyBuyIns };
}

// Stop-loss / stop-win check for a running session's profit so far.
export function stopCheck(profit, rules = DEFAULT_RULES) {
  const r = { ...DEFAULT_RULES, ...rules };
  if (r.stopLoss > 0 && profit <= -r.stopLoss) return { kind: 'loss', limit: r.stopLoss };
  if (r.stopWin > 0 && profit >= r.stopWin) return { kind: 'win', limit: r.stopWin };
  return null;
}

// ---- post-session review insights
export const REVIEW_FIELDS = {
  mood: { label: 'Mood', groups: [[1, 2, 'Low (1–2)'], [3, 3, 'OK (3)'], [4, 5, 'Good (4–5)']] },
  tilt: { label: 'Tilt', groups: [[1, 2, 'Calm (1–2)'], [3, 3, 'Some (3)'], [4, 5, 'Tilted (4–5)']] },
  focus: { label: 'Focus', groups: [[1, 2, 'Low (1–2)'], [3, 3, 'OK (3)'], [4, 5, 'Sharp (4–5)']] },
  sleep: { label: 'Sleep', groups: [[0, 5.99, 'Under 6h'], [6, 7.99, '6–8h'], [8, 24, '8h+']] },
  alcohol: { label: 'Drinks', groups: [[0, 0, 'None'], [1, 2, '1–2'], [3, 99, '3+']] },
};

export function reviewInsights(sessions) {
  const reviewed = finished(sessions).filter(s => s.review);
  const out = {};
  for (const [f, def] of Object.entries(REVIEW_FIELDS)) {
    const rows = def.groups.map(([lo, hi, label]) => {
      const list = reviewed.filter(s => s.review[f] !== null && s.review[f] !== undefined && s.review[f] !== '' && Number(s.review[f]) >= lo && Number(s.review[f]) <= hi);
      const sm = summary(list);
      return { label, count: sm.count, hourly: sm.hourly, net: sm.net };
    }).filter(r => r.count > 0);
    if (rows.length) out[f] = { label: def.label, rows };
  }
  return { count: reviewed.length, fields: out };
}

// Unique values used in sessions, for filter menus.
export function values(sessions, key) {
  return [...new Set(finished(sessions).map(s => s[key]).filter(Boolean))].sort();
}
