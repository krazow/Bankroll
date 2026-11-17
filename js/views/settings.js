// Settings. Later phases add goals, bankroll rules, data and privacy sections through settingsSections().
import * as db from '../db.js';
import { h, mount, field, select, setCurrency, toast } from '../ui.js';
import { settingsSections } from '../hooks.js';

export const CURRENCIES = ['$', '€', '£', 'C$', 'A$', '¥', '₹', 'kr', 'CHF '];

export async function render(root) {
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const currency = await db.getSetting('currency', '$');

  const cur = select('currency', CURRENCIES.map(c => [c, c.trim()]), currency);
  cur.id = 'currency';
  cur.addEventListener('change', async () => { await db.setSetting('currency', cur.value); setCurrency(cur.value); toast('Currency saved'); });

  mount(root, h('h1', 'Settings'),
    h('div.card', h('h2', 'General'), field('Currency symbol', cur)),
    await settingsSections(),
    h('div.card', h('h2', 'Storage'),
      h('p', 'Storage: ', h('b#storage-status', 'IndexedDB ready')),
      h('p.muted.small', persisted ? 'Protected from automatic clean-up.' : 'Not yet protected from automatic clean-up (install the app to protect it).'),
      est && h('p.muted.small', `Using ${(est.usage / 1024).toFixed(0)} KB`),
      h('p.muted.small', 'Version ', h('span#app-version', typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'))));
}
