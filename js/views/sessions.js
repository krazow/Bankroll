// Session list (#/sessions) and one session's details (#/session/<id>).
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, money, duration, signClass, dateLabel, timeLabel, confirmBox, go, toast } from '../ui.js';
import { getBankrolls } from '../store.js';
import { sessionExtras } from '../hooks.js';

export async function render(root, params, query) {
  if (params[0]) return renderOne(root, params[0], query || {});
  const sessions = (await db.all('sessions')).sort((a, b) => b.start - a.start);
  if (!sessions.length) {
    mount(root, h('div.card.center', h('h1', 'No sessions yet'), h('p.muted', 'Start a session or log one you already played.'),
      h('div', { style: { display: 'grid', gap: '10px' } },
        h('a.btn.primary.block', { href: '#/new?live=1' }, 'Start a session'),
        h('a.btn.block', { href: '#/new' }, 'Log a past session'))));
    return;
  }
  // group by month
  const groups = new Map();
  for (const s of sessions) {
    const k = new Date(s.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  mount(root,
    h('div.row.between', { style: { marginBottom: '10px' } }, h('h1', 'Sessions'), h('a.btn.sm', { href: '#/new' }, '+ Log past session')),
    [...groups.entries()].map(([month, list]) => {
      const done = list.filter(s => s.status === 'done');
      const tot = done.reduce((a, s) => a + M.net(s), 0);
      return h('div.card',
        h('div.row.between', h('h3', month), h('b', { class: signClass(tot) }, money(tot, { sign: true }))),
        h('ul.list#session-list', list.map(item)));
    }));
}

export function item(s) {
  const running = M.isRunning(s);
  return h('li', h('a.item', { href: running ? '#/live' : `#/session/${s.id}`, 'data-id': s.id },
    h('div.grow',
      h('div.t', M.sessionTitle(s), ' ', running && h('span.tag.live', 'LIVE')),
      h('div.s', [dateLabel(s.start, { weekday: 'short', month: 'short', day: 'numeric' }), s.venue, duration(M.playedMs(s))].filter(Boolean).join(' · '))),
    h('div.amt', { class: running ? '' : signClass(M.net(s)) }, running ? '…' : money(M.net(s), { sign: true }))));
}

async function renderOne(root, id, query) {
  const s = await db.get('sessions', id);
  if (!s) { mount(root, h('div.card', h('p', 'Session not found.'), h('a', { href: '#/sessions' }, 'All sessions'))); return; }
  if (M.isRunning(s)) { go('#/live'); return; }
  const banks = await getBankrolls();
  const bank = banks.find(b => b.id === s.bankrollId);
  const hrs = M.hours(s);
  const bb = M.bigBlind(s);
  const net = M.net(s), gross = M.gross(s);
  const t = s.tourney || {};
  const row = (k, v) => v === null || v === undefined || v === '' ? null : h('tr', h('td', k), h('td', v));

  mount(root,
    h('div.card',
      h('div.row.between', h('h1', M.sessionTitle(s)), h('span.tag', s.setting === 'online' ? 'Online' : 'Live')),
      h('p.muted', [dateLabel(s.start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), s.venue].filter(Boolean).join(' · ')),
      h('div.tiles',
        h('div.tile.big', h('div.k', 'Net result'), h('div.v#net', { class: signClass(net) }, money(net, { sign: true }))),
        h('div.tile', h('div.k', 'Time'), h('div.v', duration(M.playedMs(s)))),
        h('div.tile', h('div.k', 'Per hour'), h('div.v', { class: signClass(net) }, hrs > 0 ? money(Math.round(net / hrs), { sign: true }) : '—'))),
      h('table.t',
        row('Started', `${dateLabel(s.start)} ${timeLabel(s.start)}`),
        row('Ended', s.end && `${dateLabel(s.end)} ${timeLabel(s.end)}`),
        (s.breaks || []).length ? row('Breaks', duration(M.breaksMs(s))) : null,
        s.type === 'cash' ? [
          row('Buy-ins', `${money(M.totalBuyIn(s))}${s.buyIns.length > 1 ? ` (${s.buyIns.length})` : ''}`),
          row('Cash out', money(s.cashOut)),
          bb && row('Big blind', money(bb)),
          bb && hrs > 0 && row('BB / hour', (gross / bb / hrs).toFixed(1)),
        ] : [
          row('Buy-in + fee', `${money(t.buyIn || 0)} + ${money(t.fee || 0)}`),
          row('Entries', String(s.buyIns.length)),
          row('Players', t.entrants),
          row('Finished', t.place ? `${t.place}${t.entrants ? ' of ' + t.entrants : ''}` : null),
          row('Prize', money(t.prize || 0)),
          t.bounties ? row('Bounties', money(t.bounties)) : null,
        ],
        row('Result before expenses', money(gross, { sign: true })),
        (s.expenses || []).map(e => row(e.kind, '-' + money(e.amount))),
        banks.length > 1 && bank ? row('Bankroll', bank.name) : null),
      s.notes && h('div', h('h3', { style: { marginTop: '12px' } }, 'Notes'), h('p', { style: { whiteSpace: 'pre-wrap' } }, s.notes))),
    await sessionExtras(s, query),
    h('div.btn-grid',
      h('button.btn.primary#share-session', { style: { gridColumn: '1 / -1' }, onclick: async () => {
        const { shareCard } = await import('../sharecard.js');
        const r = await shareCard({
          title: M.sessionTitle(s), subtitle: [dateLabel(s.start, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), s.venue].filter(Boolean).join(' · '),
          big: money(net, { sign: true }), positive: net > 0 ? true : net < 0 ? false : null,
          lines: [['Time', duration(M.playedMs(s))], ['Per hour', hrs > 0 ? money(Math.round(net / hrs), { sign: true }) : '—'],
            s.type === 'tourney' ? ['Finished', s.tourney?.place ? `${s.tourney.place}${s.tourney.entrants ? ' of ' + s.tourney.entrants : ''}` : '—'] : ['Buy-in', money(M.totalBuyIn(s))]],
          footer: 'Tracked with Bankroll',
        }, `bankroll-${new Date(s.start).toISOString().slice(0, 10)}.png`);
        if (r === 'downloaded') toast('Image saved');
      } }, 'Share result'),
      h('a.btn#edit-session', { href: `#/new?edit=${s.id}` }, 'Edit'),
      h('button.btn.danger#delete-session', { onclick: async () => {
        if (await confirmBox('Delete this session for good?', { ok: 'Delete', danger: true })) {
          await db.remove('sessions', s.id); toast('Deleted'); go('#/sessions');
        }
      } }, 'Delete')));
}
