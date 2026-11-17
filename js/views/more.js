// The "More" tab: links to everything that isn't on the bottom bar.
import { h, mount } from '../ui.js';

export const MENU = [
  ['#/bankroll', 'Bankroll', 'Balances, deposits and withdrawals'],
  ['#/tools', 'Tools', 'Hand notes, opponents, odds, home-game tools'],
  ['#/settings', 'Settings', 'Currency, goals, rules, backup and privacy'],
];

export function render(root) {
  mount(root, h('h1', 'More'),
    h('div.card', h('ul.list#more-menu', MENU.map(([href, t, s]) =>
      h('li', h('a.item', { href }, h('div.grow', h('div.t', t), h('div.s', s)), h('span.muted', '›')))))));
}
