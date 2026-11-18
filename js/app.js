// Bankroll app shell: hash router, bottom tabs, startup.
import * as db from './db.js';
import { h, mount, setCurrency, duration, noteNavigation } from './ui.js';
import * as M from './model.js';
import { getBankrolls, runningSession } from './store.js';
import { applyAppearance } from './appearance.js';
import { initLock } from './lock.js';
import * as notify from './notify.js';
import { listenForInstall } from './onboarding.js';

// route pattern -> [view module, tab]
const ROUTES = [
  [/^$/, 'home', 'home'],
  [/^live$/, 'live', 'home'],
  [/^sessions$/, 'sessions', 'sessions'],
  [/^session\/([\w-]+)$/, 'sessions', 'sessions'],
  [/^new$/, 'session-form', 'new'],
  [/^bankroll$/, 'bankroll', 'more'],
  [/^staking(?:\/([\w-]+))?$/, 'staking', 'more'],
  [/^stats$/, 'stats', 'stats'],
  [/^tools(?:\/([\w-]+))?$/, 'tools', 'more'],
  [/^more$/, 'more', 'more'],
  [/^settings(?:\/([\w-]+))?$/, 'settings', 'more'],
];

const view = document.getElementById('view');
let cleanup = null;
let renderSeq = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { path: path.replace(/\/$/, ''), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function route() {
  const seq = ++renderSeq;
  noteNavigation();
  const { path, query } = parseHash();
  const match = ROUTES.find(([rx]) => rx.test(path));
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', !!match && a.dataset.tab === match[2]));
  if (!match) { mount(view, h('div.card', h('h1', 'Not found'), h('p', h('a', { href: '#/' }, 'Go home')))); return; }
  const params = path.match(match[0]).slice(1);
  try {
    const mod = await import(`./views/${match[1]}.js`);
    if (seq !== renderSeq) return; // a newer navigation started
    view.replaceChildren();
    cleanup = await mod.render(view, params, query);
  } catch (e) {
    console.error(e);
    mount(view, h('div.card', h('h1', 'Coming soon'), h('p.muted', 'This screen is not built yet.'), h('p.small.muted', String(e.message || e))));
  }
  window.scrollTo(0, 0);
}

// The little "LIVE 1:23:45" pill in the header while a session runs.
const pill = document.getElementById('live-pill');
let running = null;
async function refreshRunning() { running = await runningSession(); paintPill(); notify.update(running); }
function paintPill() {
  pill.hidden = !running || location.hash.startsWith('#/live');
  if (!running) return;
  pill.textContent = (M.onBreak(running) ? '❚❚ ' : '● ') + duration(M.playedMs(running), { seconds: true });
  pill.classList.toggle('paused', M.onBreak(running));
}

async function start() {
  listenForInstall();
  await db.open();
  db.persist();
  await applyAppearance();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyAppearance);
  await initLock();
  setCurrency(await db.getSetting('currency', '$'));
  await getBankrolls();
  await refreshRunning();
  db.onChange(store => { if (store === 'sessions') refreshRunning(); });
  setInterval(paintPill, 1000);
  window.addEventListener('hashchange', paintPill);
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => notify.update(running)).catch(e => console.warn('service worker', e));
  }
  document.documentElement.dataset.ready = '1';
}

start().catch(e => {
  console.error(e);
  mount(view, h('div.card', h('h1', 'Bankroll could not start'), h('p', String(e.message || e))));
});
