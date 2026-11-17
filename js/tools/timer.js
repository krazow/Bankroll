// Blind timer for home tournaments. Keeps running correctly if the app is closed and reopened.
import * as db from '../db.js';
import { blindStructure } from '../homegame.js';
import { h, mount, field, num, duration, confirmBox } from '../ui.js';
import { back } from '../views/tools.js';

const KEY = 'blind-timer';

// Pure clock maths so it can be tested: where are we after `now`?
export function position(t, now = Date.now()) {
  let i = t.index, started = t.levelStartedAt;
  if (!t.running) return { index: i, remaining: t.remaining ?? t.levels[i].minutes * 60e3, changed: 0 };
  let changed = 0;
  while (i < t.levels.length) {
    const len = t.levels[i].minutes * 60e3;
    if (now - started < len) return { index: i, remaining: len - (now - started), changed, started };
    started += len; i++; changed++;
  }
  return { index: t.levels.length - 1, remaining: 0, changed, started, over: true };
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not allowed: fine */ }
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(d => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.2; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15); });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* no audio */ }
}

export async function render(root) {
  let t = await db.getSetting(KEY, null);
  if (!t) return renderSetup(root);
  const save = () => db.setSetting(KEY, t);
  const big = h('div.clock#timer-clock', { style: { fontSize: '4.2rem' } });
  const now = h('div.center#timer-level');
  const next = h('p.center.muted#timer-next');
  const playBtn = h('button.btn.primary.xl#timer-play', { type: 'button' });
  const list = h('ul.list.small#timer-levels');
  const lvlText = l => (l.break ? 'Break' : `${l.sb.toLocaleString()} / ${l.bb.toLocaleString()}${l.ante ? ` (ante ${l.ante})` : ''}`);

  const sync = () => {
    const p = position(t);
    if (p.changed) { t.index = p.index; t.levelStartedAt = p.started; save(); beep(); }
    return p;
  };
  const paint = () => {
    const p = sync();
    const l = t.levels[p.index], n = t.levels[p.index + 1];
    big.textContent = duration(p.remaining, { seconds: true }).replace(/^0:/, '');
    mount(now, h('div.small.muted', l.break ? 'BREAK' : `LEVEL ${l.level}`), h('div', { style: { fontSize: '2rem', fontWeight: '800' } }, lvlText(l)));
    next.textContent = p.over ? 'Last level' : n ? `Next: ${lvlText(n)}` : 'Last level';
    playBtn.textContent = t.running ? '❚❚ Pause' : '▶ Start';
    [...list.children].forEach((li, i) => { li.style.opacity = i < p.index ? '.45' : '1'; li.style.fontWeight = i === p.index ? '800' : ''; });
  };
  const go = async i => {
    const p = position(t);
    t.index = Math.max(0, Math.min(t.levels.length - 1, i ?? p.index));
    if (t.running) t.levelStartedAt = Date.now(); else t.remaining = t.levels[t.index].minutes * 60e3;
    await save(); paint();
  };
  playBtn.onclick = async () => {
    const p = position(t);
    if (t.running) { t.running = false; t.index = p.index; t.remaining = p.remaining; keepAwake(false); }
    else { t.running = true; t.levelStartedAt = Date.now() - (t.levels[t.index].minutes * 60e3 - (t.remaining ?? t.levels[t.index].minutes * 60e3)); t.remaining = null; keepAwake(true); }
    await save(); paint();
  };
  mount(list, t.levels.map((l, i) => h('li.item', { onclick: () => go(i), style: { cursor: 'pointer', minHeight: '36px', padding: '6px 2px' } },
    h('span.grow', l.break ? 'Break' : `Level ${l.level}`), h('span', lvlText(l)), h('span.muted', { style: { width: '50px', textAlign: 'right' } }, `${l.minutes}m`))));

  mount(root, back(),
    h('div.card', now, big, next,
      h('div.grid3', h('button.btn.xl#timer-prev', { type: 'button', onclick: () => go(position(t).index - 1) }, '‹'), playBtn, h('button.btn.xl#timer-next-btn', { type: 'button', onclick: () => go(position(t).index + 1) }, '›'))),
    h('div.card', h('h3', 'Levels'), list),
    h('button.btn.danger.block#timer-reset', { type: 'button', onclick: async () => {
      if (await confirmBox('Stop this tournament clock and set up a new one?', { ok: 'Reset', danger: true })) { await db.setSetting(KEY, null); keepAwake(false); render(root); }
    } }, 'New tournament / reset'));
  paint();
  if (t.running) keepAwake(true);
  const timer = setInterval(paint, 250);
  return () => { clearInterval(timer); keepAwake(false); };
}

function renderSetup(root) {
  const n = (name, value, label, hint, min = '1') => field(label, h('input', { name, type: 'number', inputmode: 'numeric', min, value }), hint);
  const preview = h('div#timer-preview');
  const form = h('form#timer-form', { oninput: () => paintPreview(), onsubmit: async e => {
    e.preventDefault();
    await db.setSetting(KEY, { levels: build(), index: 0, running: false, remaining: null, levelStartedAt: null });
    render(root);
  } },
  h('div.grid2', n('players', 8, 'Players'), n('stack', 10000, 'Starting chips')),
  h('div.grid2', n('hours', 4, 'Length (hours)'), n('minutes', 20, 'Minutes per level')),
  h('div.grid2', n('chip', 25, 'Smallest chip'), n('breakEvery', 0, 'Break every N levels', '0 = no breaks', '0')),
  h('button.btn.primary.block.xl', { type: 'submit' }, 'Use this structure'));
  const build = () => {
    const d = Object.fromEntries(new FormData(form).entries());
    return blindStructure({ players: num(d.players) || 8, startingStack: num(d.stack) || 10000, hours: num(d.hours) || 4, levelMinutes: num(d.minutes) || 20, smallestChip: num(d.chip) || 25, breakEvery: num(d.breakEvery) });
  };
  const paintPreview = () => mount(preview, h('table.t', h('tbody', build().map(l => h('tr', h('td', l.break ? 'Break' : `Level ${l.level}`), h('td', l.break ? '' : `${l.sb.toLocaleString()} / ${l.bb.toLocaleString()}`), h('td.muted', `${l.minutes}m`))))));
  mount(root, back(), h('h1', 'Blind timer'), h('div.card', form), h('div.card', h('h3', 'Structure'), preview));
  paintPreview();
}
