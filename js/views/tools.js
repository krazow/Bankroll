// Tools menu (#/tools) and each tool (#/tools/<name>).
import { h, mount, back as backLink } from '../ui.js';

export const TOOLS = [
  ['hands', 'Hand notes', 'Write down key hands with cards, action and lessons'],
  ['opponents', 'Opponent notes', 'Who plays how, and where'],
  ['equity', 'Odds & equity', 'Hand vs hand, pot odds and outs'],
  ['timer', 'Blind timer', 'Tournament clock for home games'],
  ['payouts', 'Payout calculator', 'Prize pool and payouts by place'],
  ['settle', 'Settle up', 'Who owes whom after a cash game'],
];

export async function render(root, params, query) {
  const name = params[0];
  if (name && TOOLS.some(t => t[0] === name)) {
    const mod = await import(`../tools/${name}.js`);
    return mod.render(root, query);
  }
  mount(root, backLink('#/more', 'More'), h('h1', 'Tools'),
    h('div.card', h('ul.list#tools-menu', TOOLS.map(([k, t, s]) =>
      h('li', h('a.item', { href: `#/tools/${k}` }, h('div.grow', h('div.t', t), h('div.s', s)), h('span.muted', '›')))))));
}

export const back = () => backLink('#/tools', 'Tools');
