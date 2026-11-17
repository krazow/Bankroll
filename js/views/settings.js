import * as db from '../db.js';
import { h, mount } from '../ui.js';

export async function render(root) {
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  mount(root,
    h('div.card', h('h1', 'Settings'),
      h('p', 'Storage: ', h('b#storage-status', 'IndexedDB ready')),
      h('p.muted.small', persisted ? 'Protected from automatic clean-up.' : 'Not yet protected from automatic clean-up (install the app to protect it).'),
      est && h('p.muted.small', `Using ${(est.usage / 1024).toFixed(0)} KB`),
      h('p.muted.small', 'Version ', h('span#app-version', typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'))));
}
