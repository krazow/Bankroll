// Hand notes: cards, position, action, result and the lesson. Linked to a session when you want.
import * as db from '../db.js';
import * as M from '../model.js';
import { describe } from '../equity.js';
import { h, mount, field, select, num, toast, confirmBox, money, signClass, dateLabel, toLocalInput, fromLocalInput, go } from '../ui.js';
import { cardsEl, pickCards } from '../cards.js';
import { back } from '../views/tools.js';

export const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'Straddle'];

export async function render(root, query = {}) {
  if (query.edit || query.new) return renderForm(root, query);
  const [hands, sessions] = await Promise.all([db.all('hands'), db.all('sessions')]);
  const byId = Object.fromEntries(sessions.map(s => [s.id, s]));
  let list = hands.sort((a, b) => b.date - a.date);
  if (query.session) list = list.filter(x => x.sessionId === query.session);
  const search = h('input', { type: 'search', placeholder: 'Search notes, tags, cards…', 'aria-label': 'Search hands', id: 'hand-search' });
  const ul = h('ul.list#hand-list');
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const shown = list.filter(x => !q || [x.action, x.lesson, (x.tags || []).join(' '), (x.hero || []).join(' '), x.position].join(' ').toLowerCase().includes(q));
    mount(ul, shown.length ? shown.map(x => handItem(x, byId[x.sessionId])) : h('li.muted.pad', hands.length ? 'No hands match.' : 'No hands yet.'));
  };
  search.addEventListener('input', paint);
  mount(root, back(),
    h('div.row.between', { style: { marginBottom: '8px' } }, h('h1', 'Hand notes'),
      h('a.btn.sm.primary#new-hand', { href: `#/tools/hands?new=1${query.session ? '&session=' + query.session : ''}` }, '+ New hand')),
    query.session && byId[query.session] && h('p.muted', 'Hands from ', h('a', { href: `#/session/${query.session}` }, `${M.sessionTitle(byId[query.session])}, ${dateLabel(byId[query.session].start)}`)),
    hands.length > 3 && search,
    h('div.card', ul));
  paint();
}

export function handItem(x, session) {
  return h('li', h('a.item.hand-item', { href: `#/tools/hands?edit=${x.id}` },
    cardsEl(x.hero || [], 2),
    h('div.grow',
      h('div.t', [x.position, x.board?.length ? (x.board.length >= 3 ? describe([...(x.hero || []), ...x.board]) : '') : 'Preflop'].filter(Boolean).join(' · ') || 'Hand'),
      h('div.s', [(x.action || x.lesson || '').slice(0, 60), session ? M.sessionTitle(session) : null].filter(Boolean).join(' · '))),
    x.result ? h('div.amt', { class: signClass(x.result) }, money(x.result, { sign: true })) : null));
}

async function renderForm(root, query) {
  const existing = query.edit ? await db.get('hands', query.edit) : null;
  const sessions = (await db.all('sessions')).sort((a, b) => b.start - a.start).slice(0, 50);
  const x = existing || { date: Date.now(), sessionId: query.session || sessions.find(M.isRunning)?.id || '', hero: [], board: [], position: '', stack: '', action: '', result: '', lesson: '', tags: [] };
  let hero = [...(x.hero || [])], board = [...(x.board || [])];
  const heroBox = h('button.btn.block#pick-hero', { type: 'button', style: { justifyContent: 'flex-start', minHeight: '70px' } });
  const boardBox = h('button.btn.block#pick-board', { type: 'button', style: { justifyContent: 'flex-start', minHeight: '70px' } });
  const madeHand = h('p.small.muted#made-hand');
  const paint = () => {
    heroBox.replaceChildren(cardsEl(hero, 2));
    boardBox.replaceChildren(cardsEl(board, 5));
    madeHand.textContent = hero.length === 2 && board.length >= 3 ? 'Made hand: ' + describe([...hero, ...board]) : '';
  };
  heroBox.onclick = async () => { const r = await pickCards({ title: 'Your cards', max: 2, value: hero, taken: board }); if (r) { hero = r; paint(); } };
  boardBox.onclick = async () => { const r = await pickCards({ title: 'Board', max: 5, value: board, taken: hero }); if (r) { board = r; paint(); } };
  paint();

  const form = h('form#hand-form', { onsubmit: async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const out = { ...x, date: fromLocalInput(d.date) || Date.now(), sessionId: d.sessionId || null, hero, board, position: d.position,
      stack: d.stack ? num(d.stack) : null, action: d.action.trim(), result: d.result === '' ? null : num(d.result), lesson: d.lesson.trim(),
      tags: d.tags.split(',').map(t => t.trim()).filter(Boolean) };
    if (!out.hero.length && !out.action && !out.lesson) { form.querySelector('#hand-error').textContent = 'Add your cards or a note.'; return; }
    await db.put('hands', out);
    toast('Hand saved');
    go(out.sessionId && query.from === 'session' ? `#/session/${out.sessionId}` : `#/tools/hands${out.sessionId && query.session ? '?session=' + out.sessionId : ''}`);
  } },
  h('h1', existing ? 'Edit hand' : 'New hand'),
  field('Your cards', heroBox),
  field('Board', boardBox), madeHand,
  h('div.grid2',
    field('Position', select('position', [['', '—'], ...POSITIONS], x.position)),
    field('Effective stack', h('input', { name: 'stack', type: 'number', inputmode: 'decimal', step: 'any', value: x.stack ?? '' }))),
  field('Action', h('textarea', { name: 'action', placeholder: 'Pre: open 15, BTN 3-bets 45, I call.\nFlop (95): check, bet 60…' }, x.action || '')),
  h('div.grid2',
    field('Won / lost', h('input', { name: 'result', type: 'number', inputmode: 'decimal', step: 'any', value: x.result ?? '', placeholder: 'e.g. -150' })),
    field('When', h('input', { name: 'date', type: 'datetime-local', value: toLocalInput(x.date) }))),
  field('Lesson', h('textarea', { name: 'lesson', placeholder: 'What would you do differently?' }, x.lesson || '')),
  field('Tags', h('input', { name: 'tags', value: (x.tags || []).join(', '), placeholder: 'bluff, 3-bet pot, river' }), 'Separate with commas'),
  field('Session', select('sessionId', [['', 'Not linked'], ...sessions.map(s => [s.id, `${dateLabel(s.start)} · ${M.sessionTitle(s)}${s.venue ? ' · ' + s.venue : ''}`])], x.sessionId || '')),
  h('p#hand-error.neg'),
  h('button.btn.primary.block.xl', { type: 'submit' }, 'Save hand'),
  existing && h('button.btn.danger.block#delete-hand', { type: 'button', style: { marginTop: '10px' }, onclick: async () => {
    if (await confirmBox('Delete this hand?', { ok: 'Delete', danger: true })) { await db.remove('hands', x.id); go('#/tools/hands'); }
  } }, 'Delete hand'));
  mount(root, back(), h('div.card', form));
}
