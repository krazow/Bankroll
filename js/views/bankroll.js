// Bankrolls: balances, deposits/withdrawals, and the full ledger.
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, money, signClass, dateLabel, sheet, field, num, toLocalInput, fromLocalInput, toast, confirmBox, select, back } from '../ui.js';
import { getBankrolls, moneyInputs } from '../store.js';

export async function render(root, _params, query) {
  const banks = await getBankrolls();
  const [{ txs, sessions, opts, held }, defId] = await Promise.all([moneyInputs(), db.getSetting('defaultBankroll', banks[0].id)]);
  const active = banks.filter(b => !b.archived);
  const cur = banks.find(b => b.id === query.id) || banks.find(b => b.id === defId) || active[0] || banks[0];
  const balance = id => M.bankrollBalance(id, txs, sessions, opts);
  const total = active.reduce((a, b) => a + balance(b.id), 0);
  const rows = M.ledger(cur.id, txs, sessions, opts).reverse();

  const addTx = async kind => {
    const r = await sheet(close => {
      const form = h('form#tx-form', { onsubmit: e => {
        e.preventDefault();
        const amt = num(form.amount.value);
        if (amt <= 0) return;
        close({ amount: amt, date: fromLocalInput(form.date.value) || Date.now(), note: form.note.value.trim(), bankrollId: form.bankrollId.value });
      } },
      field('Amount', h('input', { name: 'amount', type: 'number', inputmode: 'decimal', step: 'any', min: '0', required: true })),
      field('Date', h('input', { name: 'date', type: 'datetime-local', value: toLocalInput(Date.now()) })),
      field('Bankroll', select('bankrollId', active.map(b => [b.id, b.name]), cur.id)),
      field('Note', h('input', { name: 'note', placeholder: kind === 'deposit' ? 'e.g. starting bankroll' : 'e.g. rent money' })),
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Save')));
      return form;
    }, { title: kind === 'deposit' ? 'Add money (deposit)' : 'Take money out (withdrawal)' });
    if (!r) return;
    await db.put('transactions', { ...r, kind });
    toast(kind === 'deposit' ? 'Deposit saved' : 'Withdrawal saved');
    render(root, _params, { id: r.bankrollId });
  };

  const editBank = async (b) => {
    const r = await sheet(close => {
      const form = h('form#bank-form', { onsubmit: e => { e.preventDefault(); const n = form.name.value.trim(); if (n) close({ name: n, makeDefault: form.def.checked, archived: form.arch?.checked }); } },
        field('Name', h('input', { name: 'name', value: b?.name || '', placeholder: 'e.g. Online, Vegas trip', required: true })),
        h('label.row', h('input', { type: 'checkbox', name: 'def', checked: !!b && b.id === defId }), 'Use for new sessions'),
        b && b.id !== defId && h('label.row', h('input', { type: 'checkbox', name: 'arch', checked: !!b.archived }), 'Archived (hidden from new sessions)'),
        h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Save')));
      return form;
    }, { title: b ? 'Edit bankroll' : 'New bankroll' });
    if (!r) return;
    const saved = await db.put('bankrolls', { ...(b || {}), name: r.name, archived: !!r.archived });
    if (r.makeDefault) await db.setSetting('defaultBankroll', saved.id);
    render(root, _params, { id: saved.id });
  };

  mount(root,
    back('#/', 'Back'),
    h('div.row.between', { style: { marginBottom: '10px' } }, h('h1', 'Bankroll'), h('button.btn.sm#new-bankroll', { onclick: () => editBank(null) }, '+ New bankroll')),
    active.length > 1 && h('div.card', h('div.row.between', h('span.muted', 'All bankrolls'), h('b#total-balance', { class: signClass(total) }, money(total)))),
    active.length > 1 && h('div.seg', active.map(b => h('label', h('input', { type: 'radio', name: 'bank', checked: b.id === cur.id, onchange: () => render(root, _params, { id: b.id }) }), h('span', b.name)))),
    h('div.card',
      h('div.row.between', h('h2', cur.name, cur.id === defId ? h('span.tag', { style: { marginLeft: '8px' } }, 'default') : null), h('button.btn.ghost.sm#edit-bankroll', { onclick: () => editBank(cur) }, 'Edit')),
      h('div.tiles', h('div.tile.big', h('div.k', 'Balance'), h('div.v#balance', { class: signClass(balance(cur.id)) }, money(balance(cur.id))))),
      held > 0 && h('a.row.between.small#held', { href: '#/staking', style: { margin: '-4px 2px 12px', color: 'var(--muted)', textDecoration: 'none' } },
        h('span', 'You also hold backers’ money'), h('b', money(held))),
      h('div.btn-grid', h('button.btn.primary#btn-deposit', { onclick: () => addTx('deposit') }, '+ Deposit'), h('button.btn#btn-withdraw', { onclick: () => addTx('withdrawal') }, '− Withdraw'))),
    h('div.card', h('h3', 'History'),
      rows.length ? h('ul.list#ledger', rows.map(r => h('li', h('div.item',
        h('div.grow',
          h('div.t', r.kind === 'session' ? M.sessionTitle(r.ref) : r.kind === 'settle' ? 'Staking: your cut' : r.kind === 'deposit' ? 'Deposit' : 'Withdrawal'),
          h('div.s', [dateLabel(r.at), r.kind === 'session' ? r.ref.venue : r.kind === 'settle' ? 'package settled' : r.ref.note, r.kind === 'session' && (r.ref.backing || []).length ? 'your share' : null].filter(Boolean).join(' · '))),
        h('div', { style: { textAlign: 'right' } },
          h('div.amt', { class: signClass(r.amount) }, money(r.amount, { sign: true })),
          h('div.s.muted', money(r.balance))),
        r.kind === 'settle' ? h('a.btn.ghost.sm', { href: `#/staking/${r.ref.backerId}`, 'aria-label': 'Open backer' }, '›')
          : r.kind !== 'session'
          ? h('button.btn.ghost.sm', { 'aria-label': 'Delete', onclick: async () => {
            if (await confirmBox(`Delete this ${r.kind}?`, { ok: 'Delete', danger: true })) { await db.remove('transactions', r.ref.id); render(root, _params, { id: cur.id }); }
          } }, '✕')
          : h('a.btn.ghost.sm', { href: `#/session/${r.ref.id}`, 'aria-label': 'Open session' }, '›')))))
        : h('p.muted', 'No money in or out yet. Add a deposit to set your starting bankroll.')),
    archivedList(banks, root, _params));
}

function archivedList(banks, root, params) {
  const arch = banks.filter(b => b.archived);
  if (!arch.length) return null;
  return h('div.card', h('h3', 'Archived'), h('ul.list', arch.map(b => h('li', h('a.item', { href: '#/bankroll', onclick: e => { e.preventDefault(); render(root, params, { id: b.id }); } }, h('span.grow', b.name))))));
}
