// Home-screen helpers: first-run welcome, "install the app", and backup reminders.
import * as db from './db.js';
import { h, mount, field, select, num, toast, setCurrency, download, combo } from './ui.js';
import { CURRENCIES } from './views/settings.js';
import * as M from './model.js';

// ---- 1. Welcome: currency, starting bankroll, usual game. Shown until done or skipped.
export async function welcomeCard(onDone) {
  if (await db.getSetting('welcomed', false)) return null;
  const [sessions, txs] = await Promise.all([db.all('sessions'), db.all('transactions')]);
  if (sessions.length || txs.length) { await db.setSetting('welcomed', true); return null; }
  const cur = await db.getSetting('currency', '$');
  const card = h('div.banner#welcome');
  const finish = async () => { await db.setSetting('welcomed', true); card.remove(); onDone && onDone(); };
  const form = h('form#welcome-form', { novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    await db.setSetting('currency', f.currency); setCurrency(f.currency);
    const amount = num(f.bankroll);
    if (amount > 0) await db.put('transactions', { bankrollId: await db.getSetting('defaultBankroll', 'main'), kind: 'deposit', amount, date: Date.now(), note: 'Starting bankroll' });
    await db.setSetting('usual', { game: f.game.trim() || 'NLH', stakes: f.stakes.trim(), venue: f.venue.trim(), buyIn: num(f.buyIn) || '' });
    toast('All set — good luck at the tables');
    await finish();
  } },
  h('h2', 'Welcome to Bankroll'),
  h('p.small.muted', '30 seconds of set-up makes every screen useful. Everything stays on this phone.'),
  h('div.grid2',
    field('Currency', select('currency', CURRENCIES.map(c => [c, c.trim()]), cur)),
    field('Starting bankroll', h('input', { name: 'bankroll', type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'e.g. 2000' }))),
  h('div.grid2',
    field('Usual game', combo('game', M.GAMES, 'NLH')),
    field('Usual stakes', combo('stakes', M.STAKES, '', { placeholder: 'e.g. 1/2' }))),
  h('div.grid2',
    field('Usual venue', h('input', { name: 'venue', placeholder: 'optional' })),
    field('Usual buy-in', h('input', { name: 'buyIn', type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'optional' }))),
  h('div.row', h('button.btn.primary.grow', { type: 'submit' }, 'Save and start'), h('button.btn.ghost#welcome-skip', { type: 'button', onclick: finish }, 'Skip')));
  mount(card, form);
  return card;
}

// ---- 2. Install prompt: after the first finished session, until installed or dismissed.
let deferred = null;
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => db.setSetting('installDismissed', true));
}
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function installCard(finishedCount) {
  if (standalone() || finishedCount < 1 || await db.getSetting('installDismissed', false)) return null;
  const card = h('div.banner#install-card');
  const dismiss = async () => { await db.setSetting('installDismissed', true); card.remove(); };
  mount(card,
    h('h2', 'Install Bankroll on this phone'),
    h('p.small', 'It opens like an app, works offline, and the phone stops clearing its data.'),
    isIOS() && !deferred
      ? h('ol.small#ios-steps', { style: { margin: '6px 0 10px', paddingLeft: '20px' } },
        h('li', 'Tap the Share button (square with an arrow) in Safari.'),
        h('li', 'Scroll down and tap “Add to Home Screen”.'),
        h('li', 'Tap “Add”, then open Bankroll from your home screen.'))
      : null,
    h('div.row',
      deferred ? h('button.btn.primary#btn-install', { onclick: async () => {
        deferred.prompt();
        const r = await deferred.userChoice.catch(() => null);
        deferred = null;
        if (r && r.outcome === 'accepted') dismiss();
      } }, 'Install') : (!isIOS() ? h('p.small.muted', 'Use your browser’s menu: “Install app” or “Add to Home screen”.') : null),
      h('button.btn.ghost#install-later', { onclick: dismiss }, isIOS() || deferred ? 'Not now' : 'Got it')));
  return card;
}

// ---- 3. Backup reminder (rule lives in model.js so it can be unit-tested).
export const backupDue = M.backupDue;

export async function backupBanner(sessions) {
  const [file, gist, snooze] = await Promise.all([db.getSetting('lastFileBackup', 0), db.getSetting('gist', {}), db.getSetting('backupSnooze', 0)]);
  const last = Math.max(file || 0, gist.lastAt || 0);
  const due = M.backupDue(sessions, last, Date.now(), snooze);
  if (!due) return null;
  const card = h('div.banner#backup-banner', { style: { borderColor: 'var(--warn)' } });
  mount(card,
    h('h2', 'Time for a backup'),
    h('p.small', `${due.since} session${due.since === 1 ? '' : 's'} ${last ? 'since your last backup' : 'and no backup yet'}. Your data lives only on this phone.`),
    h('div.row',
      h('button.btn.primary#btn-backup-now', { onclick: async () => {
        const { backupData, backupName } = await import('./backup.js');
        download(backupName(), JSON.stringify(await backupData(), null, 1), 'application/json');
        await db.setSetting('lastFileBackup', Date.now());
        toast('Backup saved — keep it somewhere safe');
        card.remove();
      } }, 'Back up now'),
      h('button.btn.ghost#btn-backup-later', { onclick: async () => { await db.setSetting('backupSnooze', Date.now() + 7 * 864e5); card.remove(); } }, 'In a week')));
  return card;
}
