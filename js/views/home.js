import { h, mount } from '../ui.js';

export function render(root) {
  mount(root,
    h('div.card', h('h1', 'Welcome to Bankroll'),
      h('p.muted', 'Your poker sessions and bankroll, stored only on this device.'),
      h('a.btn.primary.block.xl', { href: '#/new?live=1' }, 'Start a session')));
}
