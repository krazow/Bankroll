// Payout calculator for home tournaments.
import { payouts, prizePool, recommendedPlaces } from '../homegame.js';
import { h, mount, field, num, money } from '../ui.js';
import { back } from '../views/tools.js';

export function render(root) {
  const out = h('div#payout-result');
  const n = (name, value, label) => field(label, h('input', { name, type: 'number', inputmode: 'decimal', step: 'any', min: '0', value }));
  const form = h('form#payout-form', { oninput: e => { if (e.target.name === 'players') form.places.value = recommendedPlaces(num(form.players.value)); calc(); }, onsubmit: e => e.preventDefault() },
    h('div.grid2', n('players', 8, 'Players'), n('buyIn', 20, 'Buy-in')),
    h('div.grid2', n('rebuys', 0, 'Rebuys'), n('rebuyCost', 20, 'Rebuy cost')),
    h('div.grid2', n('addOns', 0, 'Add-ons'), n('addOnCost', 0, 'Add-on cost')),
    h('div.grid2', n('rake', 0, 'Taken out (food, rake)'), n('places', recommendedPlaces(8), 'Places paid')),
    field('Round to', h('select', { name: 'unit' }, [1, 5, 10].map(u => h('option', { value: u, selected: u === 5 }, u === 1 ? 'Exact' : `Nearest ${u}`)))));
  const calc = () => {
    const d = Object.fromEntries(new FormData(form).entries());
    const pool = prizePool({ players: num(d.players), buyIn: num(d.buyIn), rebuys: num(d.rebuys), rebuyCost: num(d.rebuyCost), addOns: num(d.addOns), addOnCost: num(d.addOnCost), rake: num(d.rake) });
    const places = Math.max(1, Math.min(9, Math.round(num(d.places)) || 1));
    const p = payouts(pool, places, { unit: num(d.unit) || 1 });
    mount(out, h('div.card',
      h('div.row.between', h('h3', 'Prize pool'), h('b#prize-pool', { style: { fontSize: '1.4rem' } }, money(pool))),
      h('table.t#payout-table', h('tbody', p.map(x => h('tr', h('td', ordinal(x.place)), h('td.muted', x.pct + '%'), h('td', h('b', money(x.amount)))))))));
  };
  mount(root, back(), h('h1', 'Payout calculator'), h('div.card', form), out);
  calc();
}

export function ordinal(n) {
  const t = n % 100, o = n % 10;
  return n + (t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th');
}
