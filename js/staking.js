// Staking and selling action. Pure functions (no DOM, no storage).
//
// A session can carry backing: [{ backerId, dealId|null, share, markup }]
//   share  – the backer's % of the action (0–100): their part of the buy-ins and of the winnings
//   markup – what the backer pays per $1 of buy-in (1.2 = 20% markup, paid to you)
// A deal (a staking package) sets these for many sessions and can carry makeup:
//   { id, backerId, name, share, markup, makeup: bool, split, autoAttach: 'none'|'all'|'cash'|'tourney', status: 'active'|'closed' }
//   split – YOUR % of package profit when you settle (e.g. 50). Losses stay as makeup until won back.
// Money moving between you and a backer: payments { backerId, kind: 'paid'|'received', amount, date, note }
// A package settlement: { kind: 'settle', backerId, dealId, date, packageResult, playerCut }
import * as M from './model.js';

const r2 = n => Math.round(n * 100) / 100;
const pct = v => Math.max(0, Math.min(100, Number(v) || 0)) / 100;

// What the backer put in and gets back for one session.
export function backerPart(s, link) {
  const share = pct(link.share), markup = Number(link.markup) > 0 ? Number(link.markup) : 1;
  const cost = r2(M.totalBuyIn(s) * share);
  const paidIn = r2(cost * markup);                 // what the backer pays you for their piece
  const returns = r2(M.winnings(s) * share);        // their piece of the cash-out / prize
  return { share: share * 100, markup, cost, paidIn, returns, result: r2(returns - paidIn), markupEarned: r2(paidIn - cost) };
}

export const soldShare = s => (s.backing || []).reduce((a, l) => a + (Number(l.share) || 0), 0);

// Your own result from a session after backers take their part.
// Expenses (tips, food...) are yours alone. Package profit reaches you only when the package is settled.
export function playerNet(s) {
  if (s.status !== 'done') return 0;
  return r2(M.net(s) - (s.backing || []).reduce((a, l) => a + backerPart(s, l).result, 0));
}

// Running result of a package since its last settlement. Negative = makeup.
export function packageState(deal, sessions, settles = []) {
  const rows = sessions.filter(s => s.status === 'done' && (s.backing || []).some(l => l.dealId === deal.id))
    .sort((a, b) => a.start - b.start)
    .map(s => ({ s, part: backerPart(s, s.backing.find(l => l.dealId === deal.id)) }));
  const total = r2(rows.reduce((a, r) => a + r.part.result, 0));
  const mine = settles.filter(x => x.dealId === deal.id);
  const cleared = r2(mine.reduce((a, x) => a + x.packageResult, 0));
  const balance = r2(total - cleared);
  const split = Math.max(0, Math.min(100, Number(deal.split) || 0)) / 100;
  return {
    sessions: rows.length, total, balance,
    makeup: deal.makeup && balance < 0 ? r2(-balance) : 0,
    canSettle: !!deal.makeup && balance > 0,
    playerCut: deal.makeup && balance > 0 ? r2(balance * split) : 0,
    backerCut: deal.makeup && balance > 0 ? r2(balance * (1 - split)) : 0,
    settles: mine.length,
  };
}

export function makeSettle(deal, state, date = Date.now()) {
  if (!state.canSettle) throw new Error(state.makeup ? `In makeup by ${state.makeup}: nothing to split yet.` : 'Nothing to settle.');
  return { kind: 'settle', backerId: deal.backerId, dealId: deal.id, date, packageResult: state.balance, playerCut: state.playerCut };
}

// Who owes whom. Positive due = you owe the backer; negative = the backer owes you.
// due = their share of results + what they've sent you − what you've paid them − your cuts from settled packages
export function backerBalance(backerId, sessions, money) {
  let results = 0, cuts = 0, paid = 0, received = 0;
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const l of s.backing || []) if (l.backerId === backerId) results += backerPart(s, l).result;
  }
  for (const m of money) {
    if (m.backerId !== backerId) continue;
    if (m.kind === 'settle') cuts += m.playerCut;
    else if (m.kind === 'paid') paid += Math.abs(m.amount);
    else if (m.kind === 'received') received += Math.abs(m.amount);
  }
  return { results: r2(results), cuts: r2(cuts), paid: r2(paid), received: r2(received), due: r2(results + received - paid - cuts) };
}

// Everything with one backer in time order, for the statement.
export function statement(backerId, sessions, money, title = s => M.sessionTitle(s)) {
  const rows = [];
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const l of s.backing || []) {
      if (l.backerId !== backerId) continue;
      const p = backerPart(s, l);
      rows.push({ at: s.end ?? s.start, kind: 'session', label: title(s), sessionId: s.id, dealId: l.dealId || null,
        share: p.share, markup: p.markup, paidIn: p.paidIn, returns: p.returns, amount: p.result });
    }
  }
  for (const m of money) {
    if (m.backerId !== backerId) continue;
    if (m.kind === 'settle') rows.push({ at: m.date, kind: 'settle', label: 'Package settled', dealId: m.dealId, amount: -m.playerCut, packageResult: m.packageResult, note: '' });
    else rows.push({ at: m.date, kind: m.kind, label: m.kind === 'paid' ? 'You paid' : 'You received', amount: m.kind === 'paid' ? -Math.abs(m.amount) : Math.abs(m.amount), note: m.note || '' });
  }
  rows.sort((a, b) => a.at - b.at);
  let due = 0;
  for (const r of rows) { due = r2(due + r.amount); r.due = due; }
  return rows;
}

// Deals that should attach themselves to a new session automatically.
export function autoBacking(session, deals) {
  return deals.filter(d => d.status !== 'closed' && d.autoAttach && d.autoAttach !== 'none' &&
    (d.autoAttach === 'all' || d.autoAttach === session.type))
    .map(d => ({ backerId: d.backerId, dealId: d.id, share: Number(d.share) || 0, markup: Number(d.markup) || 1 }));
}

export function validateBacking(links) {
  const total = links.reduce((a, l) => a + (Number(l.share) || 0), 0);
  if (links.some(l => !(Number(l.share) > 0))) throw new Error('Each backer needs a share above 0%.');
  if (total > 100) throw new Error(`That sells ${total}% of your action — more than 100%.`);
  if (links.some(l => !(Number(l.markup) >= 0.5 && Number(l.markup) <= 3))) throw new Error('Markup should be between 0.5 and 3 (1 = no markup).');
  return total;
}

// For the bankroll: your own money, and money you hold for backers.
export function ownResults(sessions) { return r2(sessions.filter(s => s.status === 'done').reduce((a, s) => a + playerNet(s), 0)); }
