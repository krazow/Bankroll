// Extension points that tie the features together (dashboard, review, settings sections...).
import * as db from './db.js';
import * as M from './model.js';
import * as S from './stats.js';
import { h, go, money, signClass, field, num, toast } from './ui.js';
import { reviewCard } from './review.js';
import { getBankrolls } from './store.js';

export async function getGoals() { return db.getSetting('goals', { profit: 0, hours: 0, sessions: 0 }); }
export async function getRules() { return { ...S.DEFAULT_RULES, ...(await db.getSetting('rules', {})) }; }

// What happens right after a session ends: open it with the review form.
export async function afterFinish(session) {
  import('./backup.js').then(b => b.autoBackup());
  go(`#/session/${session.id}?review=1`);
}

// Stats cards on the home screen.
export async function dashboardCards(sessions) {
  const done = S.finished(sessions);
  if (!done.length) return null;
  const [goals, rules, banks, txs] = await Promise.all([getGoals(), getRules(), getBankrolls(), db.all('transactions')]);
  const all = S.summary(done);
  const month = S.summary(S.applyFilter(done, S.period('month')));
  const gp = S.goalProgress(done, goals);
  const alerts = await bankrollAlerts(sessions, rules, banks, txs);
  const tile = (k, v, n, id) => h('div.tile', h('div.k', k), h('div.v', { id, class: signClass(n) }, v));
  const bar = (label, g, fmt) => g && h('div', { style: { marginBottom: '10px' } },
    h('div.row.between.small', h('span', label), h('span.muted', `${fmt(g.value)} / ${fmt(g.target)}`)),
    h('div.bar', h('i', { style: { width: g.pct + '%', background: g.pct >= gp.monthPct ? 'var(--accent)' : 'var(--warn)' } })));
  return [
    alerts,
    h('div.tiles#dashboard',
      tile('All-time', money(all.net, { sign: true }), all.net, 'd-net'),
      tile('Per hour', all.hourly === null ? '—' : money(Math.round(all.hourly), { sign: true }), all.hourly, 'd-hourly'),
      tile('This month', money(month.net, { sign: true }), month.net, 'd-month'),
      tile('Win rate', all.winRate + '%', 0, 'd-winrate'),
      tile('Sessions', String(all.count), 0, 'd-count'),
      tile('Hours', all.hours.toFixed(1), 0, 'd-hours'),
      tile('Biggest win', money(all.biggestWin, { sign: true }), all.biggestWin, 'd-bigwin'),
      tile('Biggest loss', money(all.biggestLoss), all.biggestLoss, 'd-bigloss')),
    (gp.profit || gp.hours || gp.sessions)
      ? h('a.card#goals-card', { href: '#/settings', style: { display: 'block', textDecoration: 'none', color: 'inherit' } },
        h('div.row.between', h('h3', 'Monthly goals'), h('span.small.muted', `${gp.monthPct}% of the month gone`)),
        bar('Profit', gp.profit, v => money(v)), bar('Hours', gp.hours, v => Number(v).toFixed(1)), bar('Sessions', gp.sessions, v => v))
      : null,
  ];
}

// Warnings when a bankroll is too small for the stakes you play.
export async function bankrollAlerts(sessions, rules, banks, txs) {
  const out = [];
  for (const b of banks.filter(x => !x.archived)) {
    const mine = sessions.filter(s => s.bankrollId === b.id && s.status === 'done');
    if (!mine.length) continue;
    const bal = M.bankrollBalance(b.id, txs, sessions);
    const recentStakes = [...new Set([...mine].sort((a, c) => c.start - a.start).filter(s => s.type === 'cash' && s.stakes).slice(0, 5).map(s => s.stakes))];
    for (const r of S.buyInsAt(bal, recentStakes, rules)) {
      if (!r.ok) out.push(h('li.bankroll-alert', `${banks.length > 1 ? b.name + ': ' : ''}${r.buyIns} buy-ins for ${r.stakes} (${money(r.buyIn)} each)`));
    }
    const tour = mine.filter(s => s.type === 'tourney').slice(-20);
    if (tour.length) {
      const avg = tour.reduce((a, s) => a + M.totalBuyIn(s) / s.buyIns.length, 0) / tour.length;
      const t = S.tourneyBuyIns(bal, avg, rules);
      if (t && !t.ok) out.push(h('li.bankroll-alert', `${banks.length > 1 ? b.name + ': ' : ''}${t.buyIns} tournament buy-ins (avg ${money(Math.round(t.buyIn))}; rule ${rules.tourneyBuyIns})`));
    }
  }
  return out.length ? h('a.alert.warn#alerts', { href: '#/settings', style: { display: 'block', color: 'inherit', textDecoration: 'none' } },
    h('b', `Bankroll check (rule: ${rules.cashBuyIns} buy-ins)`), h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, out)) : null;
}

// Stop-loss / stop-win banner on the live screen.
export function liveAlert(session, rules) {
  if (session.type !== 'cash') return null;
  const hit = S.stopCheck(M.liveProfit(session), rules);
  if (!hit) return null;
  return hit.kind === 'loss'
    ? h('div.alert.neg#stop-alert', `Stop-loss hit: you're down ${money(hit.limit)} or more. Time to consider leaving.`)
    : h('div.alert.ok#stop-alert', `Stop-win reached: you're up ${money(hit.limit)} or more. Consider locking it up.`);
}

// Extra sections on the Settings screen.
export async function settingsSections() {
  const [goals, rules] = await Promise.all([getGoals(), getRules()]);
  const n = (name, value, attrs = {}) => h('input', { name, type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: value || '', ...attrs });
  const goalsForm = h('form.card#goals-form', { onsubmit: async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(goalsForm).entries());
    await db.setSetting('goals', { profit: num(d.profit), hours: num(d.hours), sessions: num(d.sessions) });
    toast('Goals saved');
  } },
  h('h2', 'Monthly goals'), h('p.small.muted', 'Leave blank for no goal. Progress shows on Home.'),
  h('div.grid3', field('Profit', n('profit', goals.profit)), field('Hours', n('hours', goals.hours)), field('Sessions', n('sessions', goals.sessions))),
  h('button.btn.primary', { type: 'submit' }, 'Save goals'));

  const rulesForm = h('form.card#rules-form', { onsubmit: async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(rulesForm).entries());
    await db.setSetting('rules', { cashBuyIns: num(d.cashBuyIns), buyInBB: num(d.buyInBB) || 100, tourneyBuyIns: num(d.tourneyBuyIns), stopLoss: num(d.stopLoss), stopWin: num(d.stopWin) });
    toast('Rules saved');
  } },
  h('h2', 'Bankroll rules'),
  h('div.grid3',
    field('Cash buy-ins', n('cashBuyIns', rules.cashBuyIns), 'minimum to play a stake'),
    field('Buy-in size (BB)', n('buyInBB', rules.buyInBB), '100 BB is standard'),
    field('Tourney buy-ins', n('tourneyBuyIns', rules.tourneyBuyIns))),
  h('div.grid2',
    field('Stop-loss per session', n('stopLoss', rules.stopLoss, { placeholder: 'off' }), 'warns on the live screen'),
    field('Stop-win per session', n('stopWin', rules.stopWin, { placeholder: 'off' }))),
  h('button.btn.primary', { type: 'submit' }, 'Save rules'));
  return [goalsForm, rulesForm];
}

// Extra cards shown on a finished session's page.
export async function sessionExtras(session, query = {}) {
  const { handItem } = await import('./tools/hands.js');
  const hands = (await db.byIndex('hands', 'sessionId', session.id)).sort((a, b) => a.date - b.date);
  return [
    reviewCard(session, { open: query.review === '1' }),
    h('div.card#session-hands',
      h('div.row.between', h('h3', `Hands${hands.length ? ` (${hands.length})` : ''}`),
        h('a.btn.ghost.sm#add-hand', { href: `#/tools/hands?new=1&session=${session.id}&from=session` }, '+ Add hand')),
      hands.length ? h('ul.list', hands.map(x => handItem(x, null))) : h('p.muted.small', 'No hands noted for this session.')),
  ];
}

