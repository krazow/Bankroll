// Settle up after a home cash game: enter what each player put in and took out.
import * as db from '../db.js';
import { settleUp } from '../homegame.js';
import { h, mount, num, money, signClass } from '../ui.js';
import { back } from '../views/tools.js';

export async function render(root) {
  let rows = await db.getSetting('settle-rows', [{ name: '', in: '', out: '' }, { name: '', in: '', out: '' }, { name: '', in: '', out: '' }]);
  const table = h('div#settle-rows');
  const result = h('div#settle-result');
  const save = () => db.setSetting('settle-rows', rows);
  const calc = () => {
    const players = rows.filter(r => r.name.trim() || num(r.in) || num(r.out)).map((r, i) => ({ name: r.name.trim() || `Player ${i + 1}`, in: num(r.in), out: num(r.out) }));
    if (players.length < 2) { mount(result, h('p.muted', 'Add at least two players.')); return; }
    const r = settleUp(players);
    mount(result, h('div.card',
      r.diff !== 0 && h('div.alert.warn#settle-diff', r.diff > 0 ? `Cash-outs are ${money(r.diff)} more than buy-ins. Check the numbers.` : `${money(-r.diff)} is missing: buy-ins are more than cash-outs.`),
      h('h3', 'Results'),
      h('table.t', h('tbody', r.results.map(p => h('tr', h('td', p.name), h('td', { class: signClass(p.v) }, money(p.v, { sign: true })))))),
      h('h3', { style: { marginTop: '12px' } }, 'Payments'),
      r.transfers.length ? h('ul.list#transfers', r.transfers.map(t => h('li.item', h('span.grow', h('b', t.from), ' pays ', h('b', t.to)), h('b', money(t.amount)))))
        : h('p.muted', 'Nobody owes anything.')));
  };
  const paint = () => {
    mount(table,
      h('div.row.small.muted', { style: { flexWrap: 'nowrap' } }, h('span', { style: { flex: '2' } }, 'Player'), h('span', { style: { flex: '1' } }, 'In'), h('span', { style: { flex: '1' } }, 'Out'), h('span', { style: { width: '40px' } })),
      rows.map((r, i) => h('div.row.settle-row', { style: { flexWrap: 'nowrap', marginBottom: '6px' } },
        h('input', { value: r.name, placeholder: `Player ${i + 1}`, 'aria-label': 'Name', style: { flex: '2' }, oninput: e => { r.name = e.target.value; save(); calc(); } }),
        h('input', { value: r.in, type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': 'Bought in', style: { flex: '1' }, oninput: e => { r.in = e.target.value; save(); calc(); } }),
        h('input', { value: r.out, type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': 'Cashed out', style: { flex: '1' }, oninput: e => { r.out = e.target.value; save(); calc(); } }),
        h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Remove', style: { width: '40px' }, onclick: () => { rows.splice(i, 1); save(); paint(); calc(); } }, '✕'))),
      h('div.row', h('button.btn.sm#add-row', { type: 'button', onclick: () => { rows.push({ name: '', in: '', out: '' }); save(); paint(); } }, '+ Player'),
        h('button.btn.sm.ghost', { type: 'button', onclick: () => { rows = [{ name: '', in: '', out: '' }, { name: '', in: '', out: '' }]; save(); paint(); calc(); } }, 'Start over')));
  };
  mount(root, back(), h('h1', 'Settle up'), h('p.muted', 'Enter what each player bought in for in total and what they cashed out.'), h('div.card', table), result);
  paint(); calc();
}
