// Card display and a tap-to-pick card selector.
import { h, sheet } from './ui.js';
import { RANKS, SUITS, pretty } from './equity.js';

export function cardEl(c) {
  if (!c) return h('span.pc.empty', '?');
  return h('span.pc' + (c[1] === 'h' || c[1] === 'd' ? '.r' : ''), { 'data-card': c }, pretty(c));
}
export function cardsEl(list, slots = 0) {
  const out = [...list];
  while (out.length < slots) out.push(null);
  return h('span.cards', out.map(cardEl));
}

// Opens a sheet to pick up to `max` cards. `taken` cards are disabled. Resolves to the picked list or null.
export function pickCards({ title = 'Pick cards', max = 2, value = [], taken = [] } = {}) {
  return sheet(close => {
    let picked = [...value];
    const preview = h('div.row', { style: { minHeight: '58px', marginBottom: '8px' } });
    const grid = h('div.picker');
    const paint = () => {
      preview.replaceChildren(cardsEl(picked, max));
      for (const b of grid.querySelectorAll('button')) {
        const c = b.dataset.card;
        b.disabled = taken.includes(c) && !picked.includes(c);
        b.style.outline = picked.includes(c) ? '3px solid var(--accent)' : '';
      }
    };
    for (const s of SUITS) for (const r of [...RANKS].reverse()) {
      const c = r + s;
      grid.appendChild(h('button' + (s === 'h' || s === 'd' ? '.r' : ''), { type: 'button', 'data-card': c, 'aria-label': pretty(c), onclick: () => {
        if (picked.includes(c)) picked = picked.filter(x => x !== c);
        else if (picked.length < max) picked.push(c);
        else picked = [...picked.slice(1), c];
        paint();
      } }, pretty(c)));
    }
    paint();
    return [preview, grid,
      h('div.row.end', { style: { marginTop: '12px' } },
        h('button.btn.ghost', { type: 'button', onclick: () => { picked = []; paint(); } }, 'Clear'),
        h('button.btn.primary#cards-done', { type: 'button', onclick: () => close(picked) }, 'Done'))];
  }, { title });
}
