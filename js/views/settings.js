// Settings: general, appearance, goals & rules, data (CSV / backups), privacy (PIN), notifications.
import * as db from '../db.js';
import { h, mount, field, select, setCurrency, toast, download, confirmBox, sheet, dateLabel, timeLabel, go, back } from '../ui.js';
import { settingsSections } from '../hooks.js';
import { sessionsCSV, transactionsCSV } from '../csv.js';
import { backupData, backupName, restore, gistBackup, gistRestore } from '../backup.js';
import * as lock from '../lock.js';
import * as notify from '../notify.js';
import { applyAppearance } from '../appearance.js';
import { sessionsWithBankroll } from '../store.js';

export const CURRENCIES = ['$', '€', '£', 'C$', 'A$', '¥', '₹', 'kr', 'CHF '];

export async function render(root, params = []) {
  if (params[0] === 'import') return (await import('./import.js')).render(root);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const [currency, theme, size, pin, gist, notifyOn] = await Promise.all([
    db.getSetting('currency', '$'), db.getSetting('theme', 'dark'), db.getSetting('size', 'normal'), lock.getLock(), db.getSetting('gist', {}), db.getSetting('notify', false)]);
  const again = () => render(root, params);

  const cur = select('currency', CURRENCIES.map(c => [c, c.trim()]), currency);
  cur.id = 'currency';
  cur.addEventListener('change', async () => { await db.setSetting('currency', cur.value); setCurrency(cur.value); toast('Currency saved'); });

  const seg = (name, opts, value, onchange) => h('div.seg#' + name, opts.map(([v, l]) =>
    h('label', h('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => onchange(v) }), h('span', l))));

  // ---- data
  const bankName = async () => { const b = await db.all('bankrolls'); const m = Object.fromEntries(b.map(x => [x.id, x.name])); return id => m[id] || ''; };
  const stamp = new Date().toISOString().slice(0, 10);
  const restoreInput = h('input#restore-file', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!(await confirmBox('Restoring replaces everything in Bankroll on this device with the backup. Continue?', { ok: 'Restore', danger: true }))) return;
    try { const c = await restore(await f.text()); toast(`Restored ${c.sessions ?? 0} sessions`); setCurrency(await db.getSetting('currency', '$')); applyAppearance(); again(); }
    catch (err) { toast(err.message, { ms: 4000 }); }
  } });

  // ---- gist
  const gistForm = h('form#gist-form', { onsubmit: async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(gistForm).entries());
    await db.setSetting('gist', { ...gist, token: d.token.trim(), id: d.id.trim() || null, auto: !!gistForm.auto.checked });
    toast('Backup settings saved'); again();
  } },
  field('GitHub token', h('input', { name: 'token', type: 'password', autocomplete: 'off', value: gist.token || '', placeholder: 'ghp_… or github_pat_…' }),
    h('span', 'Needs only the "gist" permission. ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=gist&description=Bankroll%20backup', target: '_blank', rel: 'noopener' }, 'Create one'), '. Stays on this device.')),
  field('Backup gist ID', h('input', { name: 'id', value: gist.id || '', placeholder: 'made for you on the first backup' })),
  h('label.row', h('input', { type: 'checkbox', name: 'auto', checked: !!gist.auto }), 'Back up automatically after each session'),
  h('div.row', { style: { marginTop: '10px' } },
    h('button.btn', { type: 'submit' }, 'Save'),
    h('button.btn.primary#gist-backup', { type: 'button', disabled: !gist.token, onclick: async () => {
      try { await gistBackup(); toast('Backed up to GitHub'); again(); } catch (err) { toast(err.message, { ms: 4000 }); }
    } }, 'Back up now'),
    h('button.btn.ghost#gist-restore', { type: 'button', disabled: !gist.token || !gist.id, onclick: async () => {
      if (!(await confirmBox('Replace everything on this device with the GitHub backup?', { ok: 'Restore', danger: true }))) return;
      try { const c = await gistRestore(); toast(`Restored ${c.sessions ?? 0} sessions`); again(); } catch (err) { toast(err.message, { ms: 4000 }); }
    } }, 'Restore')),
  gist.lastAt && h('p.small.muted#gist-last', `Last backup: ${dateLabel(gist.lastAt)} ${timeLabel(gist.lastAt)}`),
  gist.lastError && h('p.small.neg', `Last automatic backup failed: ${gist.lastError}`));

  // ---- PIN
  const askPin = (title) => sheet(close => {
    const f = h('form', { onsubmit: e => { e.preventDefault(); close(f.pin.value); } },
      field('PIN (4–8 digits)', h('input', { name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', autocomplete: 'off', required: true })),
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'OK')));
    return f;
  }, { title });

  mount(root, back('#/more', 'More'), h('h1', 'Settings'),
    h('div.card', h('h2', 'General'), field('Currency symbol', cur)),
    h('div.card#appearance', h('h2', 'Appearance'),
      h('p.small.muted', 'Dark mode and large buttons are easiest to use at the table.'),
      seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']], theme, async v => { await db.setSetting('theme', v); applyAppearance(); }),
      seg('size', [['normal', 'Normal'], ['large', 'Large buttons']], size, async v => { await db.setSetting('size', v); applyAppearance(); })),
    await settingsSections(),
    h('div.card#data', h('h2', 'Your data'),
      h('p.small.muted', 'Everything is stored only on this device. Export or back up to keep a copy.'),
      h('div.btn-grid',
        h('button.btn#export-csv', { onclick: async () => download(`bankroll-sessions-${stamp}.csv`, sessionsCSV(await sessionsWithBankroll(), await bankName()), 'text/csv') }, 'Sessions CSV'),
        h('button.btn#export-tx-csv', { onclick: async () => download(`bankroll-deposits-withdrawals-${stamp}.csv`, transactionsCSV(await db.all('transactions'), await bankName()), 'text/csv') }, 'Deposits CSV'),
        h('button.btn.primary#backup-json', { onclick: async () => { download(backupName(), JSON.stringify(await backupData(), null, 1), 'application/json'); await db.setSetting('lastFileBackup', Date.now()); } }, 'Full backup'),
        h('button.btn#restore-json', { onclick: () => restoreInput.click() }, 'Restore backup'),
        h('a.btn#import-csv', { href: '#/settings/import' }, 'Import CSV')),
      h('p.small.muted', { style: { marginTop: '8px' } }, 'Sessions CSV is handy for taxes: dates, buy-ins, cash-outs and results.'),
      restoreInput),
    h('div.card#gist', h('h2', 'Backup to GitHub (optional)'), h('p.small.muted', 'Saves a private gist in your GitHub account, so your data survives a lost phone.'), gistForm),
    h('div.card#privacy', h('h2', 'App lock'),
      pin ? [
        h('p', 'PIN lock is ', h('b#pin-status', 'on'), '.'),
        field('Lock again after the app is closed for', (() => {
          const s = select('after', [[0, 'Right away'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour']], pin.after ?? 5);
          s.addEventListener('change', async () => { await lock.setLockAfter(Number(s.value)); toast('Saved'); });
          return s;
        })()),
        h('div.row',
          h('button.btn#lock-now', { onclick: () => lock.showLock() }, 'Lock now'),
          h('button.btn.danger#pin-off', { onclick: async () => {
            const p = await askPin('Enter your current PIN');
            if (p === null) return;
            if (await lock.checkPin(p)) { await lock.clearPin(); toast('PIN removed'); again(); } else toast('Wrong PIN');
          } }, 'Turn off')),
      ] : [
        h('p.small.muted', 'Ask for a PIN when Bankroll opens.'),
        h('button.btn.primary#pin-on', { onclick: async () => {
          const p = await askPin('Choose a PIN');
          if (p === null) return;
          const p2 = await askPin('Enter it again');
          if (p2 === null) return;
          if (p !== p2) { toast('The PINs didn’t match'); return; }
          try { await lock.setPin(p); toast('PIN lock on'); again(); } catch (err) { toast(err.message); }
        } }, 'Set a PIN'),
      ]),
    h('div.card#notifications', h('h2', 'Running-session notification'),
      h('p.small.muted', 'Keeps a notification (and an app-icon badge) while a session is running, so you can jump back in with one tap. Long-press the app icon for Start / Live / Log shortcuts.'),
      notify.supported()
        ? h('label.row', h('input#notify-toggle', { type: 'checkbox', checked: notifyOn, onchange: async e => {
          try { if (e.target.checked) { await notify.enable(); toast('Notifications on'); } else { await notify.disable(); toast('Notifications off'); } }
          catch (err) { e.target.checked = false; toast(err.message, { ms: 4000 }); }
        } }), 'Show while a session is running')
        : h('p.small.muted', 'Not supported in this browser.')),
    h('div.card', h('h2', 'Storage'),
      h('p', 'Storage: ', h('b#storage-status', 'IndexedDB ready')),
      h('p.muted.small', persisted ? 'Protected from automatic clean-up.' : 'Not yet protected from automatic clean-up (install the app to protect it).'),
      est && h('p.muted.small', `Using ${(est.usage / 1024).toFixed(0)} KB`),
      h('p.muted.small', 'Version ', h('span#app-version', typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?')),
      h('button.btn.danger#erase-all', { onclick: async () => {
        if (!(await confirmBox('Erase ALL sessions, bankrolls, notes and settings on this device? Make a backup first. This can’t be undone.', { ok: 'Erase everything', danger: true }))) return;
        await db.wipeAll(); toast('Everything erased'); go('#/');
      } }, 'Erase all data')));
}
