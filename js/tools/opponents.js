// Opponent notes: nickname, venue, style and tendencies.
import * as db from '../db.js';
import { h, mount, field, toast, confirmBox, dateLabel, go, combo } from '../ui.js';
import { back } from '../views/tools.js';

export const STYLES = ['Nit', 'TAG', 'LAG', 'Maniac', 'Calling station', 'Fish', 'Reg', 'Unknown'];

export async function render(root, query = {}) {
  if (query.edit || query.new) return renderForm(root, query);
  const list = (await db.all('opponents')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const search = h('input#opp-search', { type: 'search', placeholder: 'Search name, venue, notes…', 'aria-label': 'Search opponents' });
  const ul = h('ul.list#opp-list');
  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const shown = list.filter(o => !q || [o.name, o.venue, o.style, o.notes, o.looks].join(' ').toLowerCase().includes(q));
    mount(ul, shown.length ? shown.map(o => h('li', h('a.item', { href: `#/tools/opponents?edit=${o.id}` },
      h('div.grow', h('div.t', o.name, ' ', o.style && h('span.tag', o.style)), h('div.s', [o.venue, (o.notes || '').slice(0, 70)].filter(Boolean).join(' · '))),
      h('span.muted.small', o.updatedAt ? dateLabel(o.updatedAt, { month: 'short', day: 'numeric' }) : ''))))
      : h('li.muted.pad', list.length ? 'Nobody matches.' : 'No opponents yet.'));
  };
  search.addEventListener('input', paint);
  mount(root, back(),
    h('div.row.between', { style: { marginBottom: '8px' } }, h('h1', 'Opponents'), h('a.btn.sm.primary#new-opp', { href: '#/tools/opponents?new=1' }, '+ Add')),
    search, h('div', { style: { height: '10px' } }), h('div.card', ul));
  paint();
}

async function renderForm(root, query) {
  const o = query.edit ? await db.get('opponents', query.edit) : { name: '', venue: '', style: '', looks: '', notes: '' };
  const venues = [...new Set((await db.all('sessions')).map(s => s.venue).filter(Boolean))];
  const form = h('form#opp-form', { onsubmit: async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    if (!d.name.trim()) { form.querySelector('#opp-error').textContent = 'Give them a name or nickname.'; return; }
    await db.put('opponents', { ...o, name: d.name.trim(), venue: d.venue.trim(), style: d.style || '', looks: d.looks.trim(), notes: d.notes.trim() });
    toast('Saved');
    go('#/tools/opponents');
  } },
  h('h1', query.edit ? 'Edit opponent' : 'New opponent'),
  field('Name or nickname', h('input', { name: 'name', value: o.name, placeholder: 'e.g. Red hat Mike', required: true })),
  field('Where they play', combo('venue', venues, o.venue)),
  h('fieldset', h('legend', 'Style'), h('div.row', STYLES.map(s => h('label.row', { style: { gap: '4px', marginRight: '6px' } },
    h('input', { type: 'radio', name: 'style', value: s, checked: o.style === s, style: { width: '20px', minHeight: '20px', height: '20px' } }), s)))),
  field('How to spot them', h('input', { name: 'looks', value: o.looks || '', placeholder: 'Seat, clothes, habits' })),
  field('Notes / tendencies', h('textarea', { name: 'notes', placeholder: 'Limps a lot, folds to 3-bets, overplays top pair…' }, o.notes || '')),
  h('p#opp-error.neg'),
  h('button.btn.primary.block.xl', { type: 'submit' }, 'Save'),
  query.edit && h('button.btn.danger.block#delete-opp', { type: 'button', style: { marginTop: '10px' }, onclick: async () => {
    if (await confirmBox(`Delete notes on ${o.name}?`, { ok: 'Delete', danger: true })) { await db.remove('opponents', o.id); go('#/tools/opponents'); }
  } }, 'Delete'));
  mount(root, back(), h('div.card', form));
}
