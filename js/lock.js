// Optional PIN lock. The PIN itself is never stored, only a salted SHA-256 hash.
import * as db from './db.js';
import { h, mount } from './ui.js';

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getLock() { return db.getSetting('pin', null); }
export async function setPin(pin, after = 5) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Use 4 to 8 digits.');
  const salt = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  await db.setSetting('pin', { salt, hash: await hashPin(pin, salt), after });
}
export async function checkPin(pin) {
  const p = await getLock();
  return !!p && (await hashPin(pin, p.salt)) === p.hash;
}
export async function clearPin() { await db.setSetting('pin', null); }
export async function setLockAfter(after) { const p = await getLock(); if (p) await db.setSetting('pin', { ...p, after }); }

let locked = false;
let hiddenAt = null;

// Shows the keypad and resolves once the right PIN is entered.
export function showLock() {
  const box = document.getElementById('lock');
  if (!box || locked) return Promise.resolve();
  locked = true;
  return new Promise(resolve => {
    if (!pendingResolve) pendingResolve = resolve;
    let entry = '';
    const dots = h('div.dots', { 'aria-hidden': 'true' });
    const msg = h('p.muted#lock-msg', 'Enter your PIN');
    const paint = () => mount(dots, Array.from({ length: Math.max(4, entry.length) }, (_, i) => h('i', { class: i < entry.length ? 'on' : '' })));
    const press = async k => {
      if (k === '⌫') entry = entry.slice(0, -1);
      else if (k === 'OK') {
        if (await checkPin(entry)) { box.hidden = true; box.replaceChildren(); locked = false; const r = pendingResolve || resolve; pendingResolve = null; r(); return; }
        msg.textContent = 'Wrong PIN'; msg.className = 'neg'; entry = '';
        if (navigator.vibrate) navigator.vibrate(150);
      } else if (entry.length < 8) entry += k;
      paint();
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    const unlockNow = () => { box.hidden = true; box.replaceChildren(); locked = false; resolve(); };
    mount(box, h('img', { src: 'icons/icon.svg', width: 56, height: 56, alt: '' }), h('h2', 'Bankroll is locked'), msg, dots,
      h('div.keys', keys.map(k => h('button.btn' + (k === 'OK' ? '.primary' : ''), { type: 'button', 'data-key': k, 'aria-label': k === '⌫' ? 'Delete' : k, onclick: () => press(k) }, k))),
      h('button.btn.ghost#forgot-pin', { type: 'button', onclick: () => forgotPin(box, unlockNow) }, 'Forgot PIN?'));
    const onKey = e => { if (!locked) { document.removeEventListener('keydown', onKey); return; } if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') press('OK'); };
    document.addEventListener('keydown', onKey);
    box.hidden = false;
    paint();
  });
}

// No PIN, no data: restore a backup (which removes the PIN) or erase everything and start fresh.
function forgotPin(box, unlockNow) {
  const file = h('input#forgot-file', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const { restore } = await import('./backup.js');
      await restore(await f.text());
      await clearPin();
      unlockNow(); location.reload();
    } catch (err) { info.textContent = err.message; info.className = 'neg'; }
  } });
  const info = h('p.small.muted', 'Your PIN can’t be recovered — only a scrambled version was saved. You can:');
  let confirmText = null;
  mount(box, h('h2', 'Forgot your PIN?'), info,
    h('button.btn.primary.block#forgot-restore', { type: 'button', onclick: () => file.click() }, 'Restore from a backup file'),
    h('p.small.muted', 'Brings back everything in the backup and turns the PIN off.'),
    h('button.btn.danger.block#forgot-erase', { type: 'button', onclick: async () => {
      if (!confirmText) {
        confirmText = h('input#erase-confirm', { placeholder: 'Type ERASE to confirm', 'aria-label': 'Type ERASE to confirm', autocomplete: 'off' });
        box.insertBefore(confirmText, box.querySelector('#forgot-erase'));
        info.textContent = 'This deletes every session, bankroll and note on this phone. Type ERASE, then tap the button again.';
        return;
      }
      if (confirmText.value.trim().toUpperCase() !== 'ERASE') { confirmText.focus(); return; }
      await db.wipeAll();
      unlockNow(); location.hash = '#/'; location.reload();
    } }, 'Erase everything and start over'),
    h('button.btn.ghost#forgot-back', { type: 'button', onclick: () => { box.hidden = true; locked = false; showLockAgain(); } }, '‹ Back to the keypad'),
    file);
  box.style.overflowY = 'auto';
}
let pendingResolve = null;
function showLockAgain() { showLock().then(() => { if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r(); } }); }

// Lock at start, and again after the app has been in the background for the chosen minutes.
export async function initLock() {
  document.addEventListener('visibilitychange', async () => {
    const p = await getLock();
    if (!p) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= (p.after ?? 5) * 60e3) { hiddenAt = null; showLock(); }
  });
  if (await getLock()) await showLock();
}
