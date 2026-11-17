// Home: the running session (if any), one-tap starts, bankroll balance and recent sessions.
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, money, signClass, duration, go } from '../ui.js';
import { runningSession, lastFinished, startRepeat, getBankrolls, sessionsWithBankroll } from '../store.js';
import { item } from './sessions.js';
import { dashboardCards } from '../hooks.js';

export async function render(root) {
  const [running, last, banks, txs, sessions] = await Promise.all([runningSession(), lastFinished(), getBankrolls(), db.all('transactions'), sessionsWithBankroll()]);
  const active = banks.filter(b => !b.archived);
  const total = active.reduce((a, b) => a + M.bankrollBalance(b.id, txs, sessions), 0);
  const recent = [...sessions].sort((a, b) => b.start - a.start).slice(0, 5);

  const liveCard = running && h('a.card#running-card', { href: '#/live', style: { display: 'block', textDecoration: 'none', color: 'inherit', borderColor: 'var(--accent)' } },
    h('div.row.between', h('b', M.sessionTitle(running)), h('span.tag.live', M.onBreak(running) ? 'ON BREAK' : 'LIVE')),
    h('div.clock#home-clock', { style: { fontSize: '2.4rem' } }, duration(M.playedMs(running), { seconds: true })),
    h('p.center.muted', 'Tap to open'));

  mount(root,
    liveCard || h('div.card', { style: { display: 'grid', gap: '10px' } },
      h('a.btn.primary.xl.block#start-live', { href: '#/new?live=1' }, 'Start a session'),
      last && h('button.btn.xl.block#repeat-last', { onclick: async () => { await startRepeat(); go('#/live'); } },
        h('span', '↻ Repeat last', h('br'), h('small.muted', `${M.sessionTitle(last)}${last.venue ? ' @ ' + last.venue : ''}`))),
      h('a.btn.block#log-past', { href: '#/new' }, 'Log a past session')),
    h('a.card#bankroll-card', { href: '#/bankroll', style: { display: 'block', textDecoration: 'none', color: 'inherit' } },
      h('div.row.between', h('span.muted', 'Bankroll'), h('b#home-balance', { class: signClass(total), style: { fontSize: '1.4rem' } }, money(total)))),
    await dashboardCards(sessions),
    recent.length ? h('div.card', h('div.row.between', h('h3', 'Recent'), h('a.small', { href: '#/sessions' }, 'All sessions')), h('ul.list', recent.map(item))) : null);

  if (running) {
    const timer = setInterval(() => { const c = root.querySelector('#home-clock'); if (c) c.textContent = duration(M.playedMs(running), { seconds: true }); }, 1000);
    return () => clearInterval(timer);
  }
}
