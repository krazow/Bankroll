// Start a live session, log a past one, or edit an existing one.
//   #/new?live=1      start a live session (timer)
//   #/new             log a past session
//   #/new?edit=<id>   edit a session
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, field, select, combo, num, toLocalInput, fromLocalInput, toast, go, money } from '../ui.js';
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
  const s = editing ? structuredClone(editing) : M.newSession({
    type: last?.type || 'cash', setting: last?.setting || 'live', game: last?.game || 'NLH', stakes: last?.stakes || '',
    venue: last?.venue || '', bankrollId: last?.bankrollId && bankrolls.some(b => b.id === last.bankrollId) ? last.bankrollId : defBank,
    start: Date.now() - 3 * 3600e3, end: Date.now(),
  });
  const t = s.tourney || {};
  const entries = s.type === 'tourney' ? Math.max(1, (s.buyIns || []).length) : 1;
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
    h('div.grid2',
      field('Venue', combo('venue', M.suggestions(sessions, 'venue', []), s.venue, { placeholder: 'Casino, site or home game' })),
      h('div.only-cash', field('Big blind', h('input', { name: 'bigBlind', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: s.bigBlind ?? '', placeholder: 'from stakes' })))),
    bankrolls.length > 1 ? field('Bankroll', select('bankrollId', bankrolls.map(b => [b.id, b.name]), s.bankrollId)) : h('input', { type: 'hidden', name: 'bankrollId', value: s.bankrollId || bankrolls[0]?.id || '' }),

    showTiming && h('fieldset', h('legend', 'When'),
      h('div.grid2.stack-sm',
        field('Started', h('input', { name: 'start', type: 'datetime-local', value: toLocalInput(s.start), required: true })),
        field('Ended', h('input', { name: 'end', type: 'datetime-local', value: toLocalInput(s.end ?? Date.now()), required: true }))),
      field('Breaks (minutes)', h('input', { name: 'breakMin', type: 'number', inputmode: 'numeric', min: '0', value: breakMin }))),

    !runningEdit && h('fieldset.only-cash', h('legend', 'Money'),
      h('div.grid2',
        field(live ? 'Buy-in' : 'Total buy-in', h('input', { name: 'buyIn', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: editing ? M.totalBuyIn(s) : (last?.type === 'cash' && last.buyIns?.[0]?.amount) || '' }),
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

    h('fieldset', h('legend', 'Expenses'), h('p.small.muted', 'Tips, food, travel… taken off your net result.'), expBox,
      h('button.btn.sm', { type: 'button', onclick: () => addExpense() }, '+ Add expense')),
    field('Notes', h('textarea', { name: 'notes', placeholder: 'Table dynamics, reads, how you played…' }, s.notes || '')),
    h('p#form-error.neg', { role: 'alert' }),
    h('div.row', h('button.btn.primary.block.xl', { type: 'submit' }, editing ? 'Save changes' : live ? 'Start session' : 'Save session')),
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

  mount(root, h('div.card', form));
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

  // past session / edit of a finished one
  const start = fromLocalInput(f.start), end = fromLocalInput(f.end);
  if (!start || !end) throw new Error('Enter when the session started and ended.');
  if (end <= start) throw new Error('The end time must be after the start time.');
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
    if (!same) out.buyIns = M.tourneyEntries(tb, fee, n, start);
    out.tourney = {
      buyIn: tb, fee, entrants: f.tEntrants ? num(f.tEntrants) : null, place: f.tPlace ? num(f.tPlace) : null,
      prize: num(f.tPrize), bounties: num(f.tBounties),
    };
    out.cashOut = null; out.stacks = [];
  }
  return out;
}
