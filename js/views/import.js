// Import sessions from a CSV file (another tracker app's export, or your own spreadsheet).
import * as db from '../db.js';
import * as M from '../model.js';
import { parseCSV, autoMap, rowsToSessions, dedupe, FIELDS } from '../csv.js';
import { h, mount, select, field, toast, money, signClass, go, dateLabel } from '../ui.js';
import { getBankrolls } from '../store.js';

const LABELS = {
  start: 'Start / date', end: 'End', hours: 'Duration', type: 'Cash or tourney', setting: 'Live / online', game: 'Game', stakes: 'Stakes',
  bigBlind: 'Big blind', venue: 'Venue', buyIn: 'Buy-in', cashOut: 'Cash out', fee: 'Tourney fee', entrants: 'Players', place: 'Place',
  prize: 'Prize', profit: 'Profit / result', expenses: 'Expenses', notes: 'Notes',
};

export async function render(root) {
  const banks = (await getBankrolls()).filter(b => !b.archived);
  const defBank = await db.getSetting('defaultBankroll', banks[0].id);
  let rows = null, headers = [], map = {};
  const preview = h('div#import-preview');
  const fileInput = h('input#import-file', { type: 'file', accept: '.csv,text/csv,.txt', onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    const all = parseCSV(await f.text());
    if (all.length < 2) { mount(preview, h('p.neg', 'That file has no rows to import.')); return; }
    headers = all[0]; rows = all.slice(1); map = autoMap(headers);
    paint();
  } });

  const opts = { dayFirst: false, bankrollId: defBank };
  const paint = async () => {
    const { sessions, skipped } = rowsToSessions(rows, map, { ...opts, headers });
    const existing = await db.all('sessions');
    const { fresh, dupes } = dedupe(existing, sessions);
    const total = fresh.reduce((a, s) => a + M.net(s), 0);
    const colOpts = [['', '— not in file —'], ...headers.map((x, i) => [String(i), x || `Column ${i + 1}`])];
    mount(preview,
      h('div.card', h('h3', 'Match the columns'), h('p.small.muted', 'We guessed from the column names. Fix anything that’s wrong.'),
        h('div.grid2', Object.keys(FIELDS).map(f => {
          const s = select('map-' + f, colOpts, map[f] === undefined ? '' : String(map[f]));
          s.addEventListener('change', () => { if (s.value === '') delete map[f]; else map[f] = Number(s.value); paint(); });
          return field(LABELS[f] || f, s);
        })),
        h('label.row', h('input#day-first', { type: 'checkbox', checked: opts.dayFirst, onchange: e => { opts.dayFirst = e.target.checked; paint(); } }), 'Dates are day/month/year'),
        banks.length > 1 && field('Put into bankroll', (() => { const s = select('bank', banks.map(b => [b.id, b.name]), opts.bankrollId); s.addEventListener('change', () => { opts.bankrollId = s.value; paint(); }); return s; })())),
      h('div.card',
        h('h3', 'Preview'),
        h('p#import-summary', `${fresh.length} session${fresh.length === 1 ? '' : 's'} to import, net `, h('b', { class: signClass(total) }, money(total, { sign: true })),
          dupes.length ? `. ${dupes.length} already in Bankroll (skipped).` : '.', skipped.length ? ` ${skipped.length} row(s) couldn’t be read.` : ''),
        skipped.length ? h('p.small.muted', 'Unread rows: ' + skipped.slice(0, 8).map(s => `line ${s.line} (${s.reason})`).join(', ') + (skipped.length > 8 ? '…' : '')) : null,
        h('div.table-wrap', h('table.t', h('thead', h('tr', h('th', 'Date'), h('th', 'Game'), h('th', 'Venue'), h('th', 'Hours'), h('th', 'Net'))),
          h('tbody', fresh.slice(0, 8).map(s => h('tr', h('td', dateLabel(s.start)), h('td', M.sessionTitle(s)), h('td', s.venue), h('td', M.hours(s).toFixed(1)), h('td', { class: signClass(M.net(s)) }, money(M.net(s), { sign: true }))))))),
        fresh.length > 8 && h('p.small.muted', `…and ${fresh.length - 8} more`),
        h('button.btn.primary.block.xl#do-import', { disabled: !fresh.length, style: { marginTop: '10px' }, onclick: async () => {
          for (const s of fresh) await db.put('sessions', s);
          toast(`Imported ${fresh.length} sessions`);
          go('#/sessions');
        } }, `Import ${fresh.length} session${fresh.length === 1 ? '' : 's'}`)));
  };

  mount(root, h('a.small', { href: '#/settings' }, '‹ Settings'), h('h1', 'Import sessions'),
    h('div.card', h('p', 'Choose a CSV file exported from another poker tracker (Poker Bankroll Tracker, Pokerbase, Poker Analytics…) or your own spreadsheet.'),
      h('p.small.muted', 'Needs at least a date and an amount (profit, or buy-in and cash-out). Sessions already in Bankroll are skipped.'),
      fileInput),
    preview);
}
