// Start a live session, log a past one, or edit an existing one.
//   #/new?live=1      start a live session (timer)
//   #/new             log a past session
//   #/new?edit=<id>   edit a session
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, field, select, combo, num, toast, go, money, back } from '../ui.js';
import { getBankrolls, runningSession } from '../store.js';

export async function render(root, _params, query) {
  const sessions = await db.all('sessions');
  const bankrolls = (await getBankrolls()).filter(b => !b.archived);
  const editing = query.edit ? await db.get('sessions', query.edit) : null;
  if (query.edit && !editing) { mount(root, h('div.card', h('p', 'Session not found.'))); return; }
  const live = !editing && query.live === '1';
  const runningEdit = editing && M.isRunning(editing);

  if (live) {
    const running = await runningSession();
    if (running) { toast('A session is already running'); go('#/live'); return; }
  }

  const last = [...sessions].filter(s => s.status === 'done').sort((a, b) => b.start - a.start)[0];
  const defBank = await db.getSetting('defaultBankroll', bankrolls[0]?.id);
  const usual = await db.getSetting('usual', {});   // from the welcome: game, stakes, venue, buy-in
  const s = editing ? structuredClone(editing) : M.newSession({
    type: last?.type || 'cash', setting: last?.setting || 'live', game: last?.game || usual.game || 'NLH', stakes: last?.stakes || usual.stakes || '',
    venue: last?.venue || usual.venue || '', bankrollId: last?.bankrollId && bankrolls.some(b => b.id === last.bankrollId) ? last.bankrollId : defBank,
    start: defaultStart(), end: null,
  });
  const lastBuyIn = (last?.type === 'cash' && last.buyIns?.[0]?.amount) || usual.buyIn || '';
  const t = s.tourney || {};
  const entries = s.type === 'tourney' ? Math.max(1, M.entryCount(s)) : 1;
  const breakMin = Math.round(M.breaksMs(s) / 60e3);

  const seg = (name, opts, value) => h('div.seg', { role: 'radiogroup', 'aria-label': name },
    opts.map(([v, l]) => h('label', h('input', { type: 'radio', name, value: v, checked: v === value }), h('span', l))));

  const expBox = h('div.expenses');
  const addExpense = (e = { kind: 'Tips', amount: '' }) => {
    const row = h('div.row.exp-row', { style: { marginBottom: '8px', flexWrap: 'nowrap' } },
      h('div', { style: { flex: '1' } }, select('exp-kind', M.EXPENSE_KINDS, e.kind)),
      h('input', { name: 'exp-amount', type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'Amount', value: e.amount, style: { flex: '1' }, 'aria-label': 'Expense amount' }),
      h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Remove expense', onclick: () => row.remove() }, '✕'));
    expBox.appendChild(row);
  };
  (s.expenses || []).forEach(addExpense);

  const showTiming = !live && !runningEdit;
  const form = h('form#session-form', { 'data-type': s.type, novalidate: true },
    h('h1', editing ? 'Edit session' : live ? 'Start a session' : 'Log a past session'),
    seg('type', [['cash', 'Cash game'], ['tourney', 'Tournament']], s.type),
    seg('setting', [['live', 'Live'], ['online', 'Online']], s.setting),
    h('div.grid2',
      field('Game', combo('game', M.suggestions(sessions, 'game', M.GAMES), s.game)),
      h('div.only-cash', field('Stakes', combo('stakes', M.suggestions(sessions, 'stakes', M.STAKES), s.stakes, { placeholder: 'e.g. 1/2' })))),
    field('Venue', combo('venue', M.suggestions(sessions, 'venue', []), s.venue, { placeholder: 'Casino, site or home game' })),
    bankrolls.length > 1 ? field('Bankroll', select('bankrollId', bankrolls.map(b => [b.id, b.name]), s.bankrollId)) : h('input', { type: 'hidden', name: 'bankrollId', value: s.bankrollId || bankrolls[0]?.id || '' }),

    showTiming && whenFields(s, breakMin),

    !runningEdit && h('fieldset.only-cash', h('legend', 'Money'),
      h('div.grid2',
        field(live ? 'Buy-in' : 'Total buy-in', h('input', { name: 'buyIn', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: editing ? M.totalBuyIn(s) : lastBuyIn }),
          !live && 'Include rebuys and add-ons'),
        showTiming && field('Cash out', h('input', { name: 'cashOut', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: s.cashOut ?? '' })))),

    !runningEdit && h('fieldset.only-tourney', h('legend', 'Tournament'),
      h('div.grid3',
        field('Buy-in', h('input', { name: 'tBuyIn', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: t.buyIn ?? (last?.type === 'tourney' ? last.tourney?.buyIn : '') ?? '' })),
        field('Fee', h('input', { name: 'tFee', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: t.fee ?? (last?.type === 'tourney' ? last.tourney?.fee : '') ?? '' })),
        showTiming && field('Entries', h('input', { name: 'tEntries', type: 'number', inputmode: 'numeric', min: '1', value: entries }), 'incl. re-entries')),
      showTiming && h('div.grid2',
        field('Players', h('input', { name: 'tEntrants', type: 'number', inputmode: 'numeric', min: '0', value: t.entrants ?? '' })),
        field('Finished', h('input', { name: 'tPlace', type: 'number', inputmode: 'numeric', min: '0', value: t.place ?? '', placeholder: 'place' })),
        field('Prize', h('input', { name: 'tPrize', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: t.prize ?? '' })),
        field('Bounties', h('input', { name: 'tBounties', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: t.bounties ?? '' })))),

    h('details.more-opts#more-opts', { open: !!(s.notes || (s.expenses || []).length || s.bigBlind) },
      h('summary', 'More options'),
      h('div.only-cash', field('Big blind', h('input', { name: 'bigBlind', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: s.bigBlind ?? '', placeholder: 'worked out from the stakes' }))),
      h('fieldset', h('legend', 'Expenses'), h('p.small.muted', 'Tips, food, travel… taken off your net result.' + (live ? ' You can add them while you play, too.' : '')), expBox,
        h('button.btn.sm', { type: 'button', onclick: () => addExpense() }, '+ Add expense')),
      field('Notes', h('textarea', { name: 'notes', placeholder: 'Table dynamics, reads, how you played…' }, s.notes || ''))),
    h('div.actionbar',
      h('p#form-error.neg', { role: 'alert' }),
      h('button.btn.primary.block.xl', { type: 'submit' }, editing ? 'Save changes' : live ? 'Start session' : 'Save session')),
  );

  form.addEventListener('change', e => { if (e.target.name === 'type') form.dataset.type = e.target.value; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = form.querySelector('#form-error');
    try {
      const out = readForm(form, s, { live, editing, runningEdit, entries });
      if (!editing && !(out.backing || []).length) {
        const { autoBacking } = await import('../staking.js');
        out.backing = autoBacking(out, await db.all('deals'));
      }
      if (live) {
        const started = M.startLive(out);
        await db.put('sessions', started);
        toast('Session started — good luck!');
        go('#/live');
      } else {
        await db.put('sessions', out);
        toast(editing ? 'Saved' : `Saved: ${money(M.net(out), { sign: true })}`);
        go(runningEdit ? '#/live' : `#/session/${out.id}`);
      }
    } catch (ex) { err.textContent = ex.message; }
  });

  mount(root, back(editing ? `#/session/${s.id}` : '#/', editing ? 'Session' : 'Home'), h('div.card', form));
}

function readForm(form, s, { live, editing, runningEdit, entries }) {
  const f = Object.fromEntries(new FormData(form).entries());
  const out = structuredClone(s);
  out.type = f.type; out.setting = f.setting;
  out.game = (f.game || '').trim(); out.venue = (f.venue || '').trim(); out.notes = (f.notes || '').trim();
  out.bankrollId = f.bankrollId || null;
  if (out.type === 'cash') {
    out.stakes = (f.stakes || '').trim();
    out.bigBlind = f.bigBlind ? num(f.bigBlind) : null;
    out.tourney = null;
  } else {
    out.stakes = ''; out.bigBlind = null;
  }
  // expenses
  const kinds = form.querySelectorAll('[name="exp-kind"]'), amts = form.querySelectorAll('[name="exp-amount"]');
  out.expenses = [...kinds].map((k, i) => ({ kind: k.value, amount: num(amts[i].value) })).filter(e => e.amount > 0);

  if (runningEdit) return out;

  if (live) {
    if (out.type === 'cash') {
      const b = num(f.buyIn);
      if (b <= 0) throw new Error('Enter your buy-in.');
      out.firstBuyIn = b;
    } else {
      out.tourney = { buyIn: num(f.tBuyIn), fee: num(f.tFee) };
      if (out.tourney.buyIn + out.tourney.fee <= 0) throw new Error('Enter the tournament buy-in.');
      out.buyIns = M.tourneyEntries(out.tourney.buyIn, out.tourney.fee, 1);
    }
    return out;
  }

  // past session / edit of a finished one: a day, a start time and how long you played
  const start = f.date && f.time ? new Date(`${f.date}T${f.time}`).getTime() : null;
  const hours = num(f.hours);
  if (!start || Number.isNaN(start)) throw new Error('Enter the day and the time you started.');
  if (!(hours > 0)) throw new Error('How long did you play? Tap a length or type the hours.');
  if (hours > 72) throw new Error('That’s over 72 hours. Check the length.');
  const end = Math.round(start + hours * 3600e3);
  const brk = Math.max(0, num(f.breakMin)) * 60e3;
  if (brk >= end - start) throw new Error('Breaks are longer than the session.');
  const timingChanged = !editing || start !== s.start || end !== s.end || Math.round(M.breaksMs(s) / 60e3) !== num(f.breakMin);
  out.start = start; out.end = end; out.status = 'done';
  if (timingChanged) out.breaks = brk ? [{ start, end: start + brk }] : [];

  if (out.type === 'cash') {
    const total = num(f.buyIn);
    if (total < 0 || num(f.cashOut) < 0) throw new Error('Amounts can’t be negative.');
    if (f.buyIn === '') throw new Error('Enter your total buy-in.');
    if (f.cashOut === '') throw new Error('Enter how much you cashed out (0 if you lost it all).');
    if (!editing || s.type !== 'cash' || total !== M.totalBuyIn(s)) out.buyIns = [{ amount: total, at: start }];
    out.cashOut = num(f.cashOut);
    out.stacks = editing && s.type === 'cash' ? s.stacks || [] : [];
  } else {
    const tb = num(f.tBuyIn), fee = num(f.tFee), n = Math.max(1, Math.round(num(f.tEntries) || 1));
    if (tb + fee <= 0) throw new Error('Enter the tournament buy-in.');
    const same = editing && s.type === 'tourney' && s.tourney && s.tourney.buyIn === tb && s.tourney.fee === fee && n === entries;
    if (!same) out.buyIns = [...M.tourneyEntries(tb, fee, n, start), ...(s.buyIns || []).filter(b => b.kind === 'addon')];
    out.tourney = {
      buyIn: tb, fee, entrants: f.tEntrants ? num(f.tEntrants) : null, place: f.tPlace ? num(f.tPlace) : null,
      prize: num(f.tPrize), bounties: num(f.tBounties),
    };
    out.cashOut = null; out.stacks = [];
  }
  return out;
}

// Logging a past session: last night at 7pm by default.
function defaultStart() {
  const d = new Date(); d.setHours(19, 0, 0, 0);
  if (d.getTime() > Date.now() - 3600e3) d.setDate(d.getDate() - 1);
  return d.getTime();
}

const p2 = n => String(n).padStart(2, '0');
const dateValue = ms => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const timeValue = ms => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const LENGTHS = [2, 3, 4, 5, 6, 8];

// "When": day, start time, and length as one tap.
function whenFields(s, breakMin) {
  const hrs = s.end ? Math.round(((s.end - s.start) / 3600e3) * 100) / 100 : '';
  const hoursInput = h('input', { name: 'hours', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: hrs, placeholder: 'e.g. 4.5', 'aria-label': 'Hours played' });
  const chips = h('div.chips#length-chips', { role: 'group', 'aria-label': 'How long' }, LENGTHS.map(n => h('button', { type: 'button', 'data-hours': n, class: Number(hrs) === n ? 'on' : '', onclick: e => {
    hoursInput.value = n; chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget));
  } }, `${n}h`)));
  hoursInput.addEventListener('input', () => chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.hours) === Number(hoursInput.value))));
  return h('fieldset', h('legend', 'When'),
    h('div.grid2',
      field('Day', h('input', { name: 'date', type: 'date', value: dateValue(s.start), required: true })),
      field('Started at', h('input', { name: 'time', type: 'time', value: timeValue(s.start), required: true }))),
    h('span.small.muted', 'Length, start to finish'), chips,
    h('div.grid2', field('Hours', hoursInput), field('Breaks (minutes)', h('input', { name: 'breakMin', type: 'number', inputmode: 'numeric', min: '0', value: breakMin }))));
}
