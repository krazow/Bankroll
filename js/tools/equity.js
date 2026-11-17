// Odds & equity: hand vs hand(s) on any board, plus pot odds and outs.
import { equity, potOdds, outsEquity, describe } from '../equity.js';
import { h, mount, field, num } from '../ui.js';
import { cardsEl, pickCards } from '../cards.js';
import { back } from '../views/tools.js';

const state = { players: [[], []], board: [] };

export function render(root) {
  const result = h('div#equity-result');
  const list = h('div');
  const used = except => [...state.board, ...state.players.flatMap((p, i) => (i === except ? [] : p))];

  const paint = () => {
    mount(list, state.players.map((p, i) => h('div.row', { style: { marginBottom: '8px', flexWrap: 'nowrap' } },
      h('b', { style: { width: '22px' } }, i + 1),
      h('button.btn.grow.pick-player', { type: 'button', 'data-player': i, style: { justifyContent: 'flex-start', minHeight: '66px' }, onclick: async () => {
        const r = await pickCards({ title: `Player ${i + 1}`, max: 2, value: p, taken: used(i) }); if (r) { state.players[i] = r; paint(); }
      } }, p.length ? cardsEl(p, 2) : h('span.muted', 'Random hand — tap to pick')),
      h('div.equity-pct', { 'data-player': i, style: { width: '64px', textAlign: 'right', fontWeight: '750' } }),
      state.players.length > 2 && h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Remove player', onclick: () => { state.players.splice(i, 1); paint(); } }, '✕'))),
    h('div.row', state.players.length < 6 && h('button.btn.sm#add-player', { type: 'button', onclick: () => { state.players.push([]); paint(); } }, '+ Player'),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => { state.players = [[], []]; state.board = []; paint(); mount(result); } }, 'Clear all')));
    boardBtn.replaceChildren(cardsEl(state.board, 5));
  };
  const boardBtn = h('button.btn.block#pick-board', { type: 'button', style: { justifyContent: 'flex-start', minHeight: '66px' }, onclick: async () => {
    const r = await pickCards({ title: 'Board', max: 5, value: state.board, taken: state.players.flat() }); if (r) { state.board = r; paint(); }
  } });

  const calc = h('button.btn.primary.block.xl#calc', { type: 'button', onclick: () => {
    mount(result, h('p.muted', 'Calculating…'));
    calc.disabled = true;
    setTimeout(() => {
      try {
        const known = state.players.filter(p => p.length === 2).length;
        if (known === 0) throw new Error('Pick at least one hand.');
        if (state.board.length > 0 && state.board.length < 3) throw new Error('The board needs 0, 3, 4 or 5 cards.');
        const r = equity(state.players, state.board, { iterations: state.players.length > 2 ? 10000 : 20000 });
        root.querySelectorAll('.equity-pct').forEach((el, i) => { el.textContent = r.equity[i] + '%'; });
        mount(result, h('div.card',
          h('h3', r.exact ? 'Exact result' : `Simulated (${r.trials.toLocaleString()} run-outs)`),
          state.players.map((p, i) => h('div', { style: { marginBottom: '10px' } },
            h('div.row.between.small', h('span', `Player ${i + 1}`, p.length && state.board.length >= 3 ? ` · ${describe([...p, ...state.board])}` : ''),
              h('span', h('b', { class: 'eq-' + i }, r.equity[i] + '%'), h('span.muted', ` win ${r.win[i]}% · tie ${r.tie[i]}%`))),
            h('div.bar', h('i', { style: { width: r.equity[i] + '%' } }))))));
      } catch (e) { mount(result, h('p.neg', e.message)); }
      calc.disabled = false;
    }, 30);
  } }, 'Calculate equity');

  // pot odds + outs
  const po = h('p#pot-odds-result.muted');
  const potForm = h('form', { oninput: () => {
    const need = potOdds(num(potForm.pot.value), num(potForm.call.value));
    po.textContent = need === null ? 'Enter the pot and the bet you face.' : `You need ${need}% equity to call.`;
  }, onsubmit: e => e.preventDefault() },
  h('div.grid2', field('Pot (incl. bet)', h('input', { name: 'pot', type: 'number', inputmode: 'decimal', step: 'any' })), field('To call', h('input', { name: 'call', type: 'number', inputmode: 'decimal', step: 'any' }))), po);
  const oe = h('p#outs-result.muted');
  const outsForm = h('form', { oninput: () => {
    const o = num(outsForm.outs.value);
    oe.textContent = o > 0 ? `≈ ${outsEquity(o, 1)}% on the next card, ${outsEquity(o, 2)}% by the river (from the flop).` : 'Enter your outs (e.g. 9 for a flush draw).';
  }, onsubmit: e => e.preventDefault() }, field('Outs', h('input', { name: 'outs', type: 'number', inputmode: 'numeric', min: '0', max: '30' })), oe);

  mount(root, back(), h('h1', 'Odds & equity'),
    h('div.card', h('h3', 'Hands'), list, h('h3', { style: { marginTop: '12px' } }, 'Board'), boardBtn, h('div', { style: { height: '12px' } }), calc),
    result,
    h('div.card', h('h3', 'Pot odds'), potForm),
    h('div.card', h('h3', 'Outs'), outsForm));
  paint();
  potForm.dispatchEvent(new Event('input')); outsForm.dispatchEvent(new Event('input'));
}
