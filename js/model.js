// Session and bankroll maths. Pure functions only (no DOM, no storage) so they're easy to test.
//
// A session:
// { id, type: 'cash'|'tourney', setting: 'live'|'online', game, stakes, bigBlind, venue, bankrollId,
//   start, end, breaks: [{start, end}], status: 'running'|'paused'|'done',
//   buyIns: [{amount, at}],            // cash: buy-in + rebuys/add-ons; tourney: each entry (buy-in + fee)
//   stacks: [{amount, at}],            // live stack updates (cash)
//   cashOut,                           // cash
//   tourney: { buyIn, fee, entrants, place, prize, bounties },
//   expenses: [{kind, amount}], notes, review: {...} }

export const GAMES = ["NLH", "PLO", "PLO8", "Limit Hold'em", "Short Deck", "Stud", "Mixed"];
export const STAKES = ['0.50/1', '1/2', '1/3', '2/3', '2/5', '5/5', '5/10', '10/20'];
export const EXPENSE_KINDS = ['Tips', 'Food', 'Travel', 'Lodging', 'Other'];

const sum = (arr, f = x => x) => (arr || []).reduce((a, x) => a + (Number(f(x)) || 0), 0);
const round2 = n => Math.round(n * 100) / 100;

export function newSession(p = {}) {
  return {
    type: 'cash', setting: 'live', game: 'NLH', stakes: '', bigBlind: null, venue: '', bankrollId: null,
    start: Date.now(), end: null, breaks: [], status: 'done', buyIns: [], stacks: [], cashOut: null,
    tourney: null, expenses: [], notes: '', review: null, ...p,
  };
}

// "1/2" -> {sb: 1, bb: 2}; "2/5/10" -> bb 5 (straddle ignored); "$0.50/$1" -> bb 1
export function parseStakes(stakes) {
  const parts = String(stakes || '').replace(/[^0-9./]/g, '').split('/').filter(Boolean).map(Number).filter(Number.isFinite);
  if (parts.length < 2) return null;
  return { sb: parts[0], bb: parts[1] };
}
export function bigBlind(s) {
  if (s.bigBlind > 0) return Number(s.bigBlind);
  const p = parseStakes(s.stakes);
  return p ? p.bb : null;
}

export function breaksMs(s, now = Date.now()) {
  return sum(s.breaks, b => Math.max(0, (b.end ?? (s.end ?? now)) - b.start));
}
export function playedMs(s, now = Date.now()) {
  if (s.durationMs != null && !s.start) return s.durationMs;
  return Math.max(0, (s.end ?? now) - s.start - breaksMs(s, now));
}
export const hours = (s, now) => playedMs(s, now) / 3600e3;

export const totalBuyIn = s => sum(s.buyIns, b => b.amount);
// Tournament entries (re-entries count, add-ons don't).
export const entryCount = s => (s.buyIns || []).filter(b => b.kind !== 'addon').length;
export const expensesTotal = s => sum(s.expenses, e => e.amount);
export function winnings(s) {
  if (s.type === 'tourney') return (Number(s.tourney?.prize) || 0) + (Number(s.tourney?.bounties) || 0);
  return Number(s.cashOut) || 0;
}
// Result at the table, before expenses.
export const gross = s => round2(winnings(s) - totalBuyIn(s));
// Result after expenses (tips, food, travel...).
export const net = s => round2(gross(s) - expensesTotal(s));

export function currentStack(s) {
  if (s.stacks && s.stacks.length) return s.stacks[s.stacks.length - 1].amount;
  return totalBuyIn(s);
}
// Running profit while a cash session is live.
export const liveProfit = s => round2(currentStack(s) - totalBuyIn(s));

export const isRunning = s => s.status === 'running' || s.status === 'paused';
export const onBreak = s => s.status === 'paused';

// ---- live session actions (return a new object)
export function startLive(p, now = Date.now()) {
  const s = newSession({ ...p, start: now, status: 'running', end: null });
  if (!s.buyIns.length && p.firstBuyIn > 0) s.buyIns = [{ amount: Number(p.firstBuyIn), at: now }];
  delete s.firstBuyIn;
  return s;
}
export function addBuyIn(s, amount, now = Date.now(), kind = undefined) {
  const stackBefore = currentStack(s);
  const out = { ...s, buyIns: [...(s.buyIns || []), kind ? { amount: Number(amount), at: now, kind } : { amount: Number(amount), at: now }] };
  // A rebuy adds chips to the stack too.
  if (s.stacks && s.stacks.length) out.stacks = [...s.stacks, { amount: stackBefore + Number(amount), at: now }];
  return out;
}
export function setStack(s, amount, now = Date.now()) {
  return { ...s, stacks: [...(s.stacks || []), { amount: Number(amount), at: now }] };
}
export function pause(s, now = Date.now()) {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', breaks: [...(s.breaks || []), { start: now, end: null }] };
}
export function resume(s, now = Date.now()) {
  if (s.status !== 'paused') return s;
  const breaks = (s.breaks || []).map((b, i, a) => (i === a.length - 1 && b.end == null ? { ...b, end: now } : b));
  return { ...s, status: 'running', breaks };
}
// Bounties won during a tournament.
export function addBounty(s, amount) {
  const t = { ...(s.tourney || {}) };
  t.bounties = Math.round(((Number(t.bounties) || 0) + Number(amount)) * 100) / 100;
  return { ...s, tourney: t };
}

// Undo "End session": back to running as if it was never ended (only shortly after ending live).
export const UNDO_WINDOW = 15 * 60e3;
export function canUndoEnd(s, now = Date.now()) { return s.status === 'done' && !!s.endedLive && now - s.endedLive < UNDO_WINDOW; }
export function undoEnd(s) {
  const out = { ...s, status: 'running', end: null, endedLive: null };
  if (out.type === 'tourney') out.tourney = { ...(out.tourney || {}), place: null, prize: 0 };
  else out.cashOut = null;
  return out;
}

export function finish(s, result = {}, now = Date.now()) {
  let out = s.status === 'paused' ? resume(s, now) : { ...s };
  out = { ...out, status: 'done', end: now };
  if (out.type === 'tourney') out.tourney = { ...(out.tourney || {}), ...result };
  else out.cashOut = Number(result.cashOut ?? currentStack(s));
  return out;
}

// Copy the setup of a previous session for a one-tap start.
export function repeatOf(prev, now = Date.now()) {
  const first = prev.buyIns && prev.buyIns[0] ? prev.buyIns[0].amount : 0;
  const keep = ['type', 'setting', 'game', 'stakes', 'bigBlind', 'venue', 'bankrollId'];
  const p = Object.fromEntries(keep.map(k => [k, prev[k]]));
  if (prev.type === 'tourney') p.tourney = { buyIn: prev.tourney?.buyIn ?? null, fee: prev.tourney?.fee ?? null };
  return startLive({ ...p, firstBuyIn: first }, now);
}

// Tournament entry cost from buy-in + fee x entries.
export function tourneyEntries(buyIn, fee, count = 1, at = Date.now()) {
  const each = (Number(buyIn) || 0) + (Number(fee) || 0);
  return Array.from({ length: Math.max(1, count | 0) }, () => ({ amount: each, at }));
}

// ---- bankrolls
// transaction: { bankrollId, kind: 'deposit'|'withdrawal', amount, date, note }
export function txSigned(t) { return t.kind === 'withdrawal' ? -Math.abs(t.amount) : Math.abs(t.amount); }

// opts.result: a session's result for YOU (staking passes your share); opts.settles: package settlements (your cut).
export function bankrollBalance(bankrollId, txs, sessions, { result = net, settles = [] } = {}) {
  const t = sum(txs.filter(x => x.bankrollId === bankrollId), txSigned);
  const s = sum(sessions.filter(x => x.bankrollId === bankrollId && x.status === 'done'), result);
  const c = sum(settles.filter(x => x.bankrollId === bankrollId), x => x.playerCut);
  return round2(t + s + c);
}

// Every change to a bankroll in time order, with the running balance.
export function ledger(bankrollId, txs, sessions, { result = net, settles = [] } = {}) {
  const rows = [
    ...txs.filter(x => x.bankrollId === bankrollId).map(t => ({ kind: t.kind, at: t.date, amount: txSigned(t), ref: t })),
    ...sessions.filter(x => x.bankrollId === bankrollId && x.status === 'done').map(s => ({ kind: 'session', at: s.end ?? s.start, amount: result(s), ref: s })),
    ...settles.filter(x => x.bankrollId === bankrollId).map(x => ({ kind: 'settle', at: x.date, amount: x.playerCut, ref: x })),
  ].sort((a, b) => a.at - b.at);
  let bal = 0;
  for (const r of rows) { bal = round2(bal + r.amount); r.balance = bal; }
  return rows;
}

// Values the user has typed before, to offer again (most used first), merged with defaults.
export function suggestions(sessions, key, defaults = []) {
  const counts = new Map();
  for (const s of sessions) { const v = (s[key] ?? '').toString().trim(); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  return [...used, ...defaults.filter(d => !counts.has(d))];
}

export function sessionTitle(s) {
  const bits = [s.type === 'tourney' ? 'Tourney' : s.stakes, s.game].filter(Boolean);
  return bits.join(' ') || (s.type === 'tourney' ? 'Tournament' : 'Cash game');
}
