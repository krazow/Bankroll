// Staking: backers, packages (with makeup), payments, settlements and statements.
//   #/staking            everyone you have deals with, and who owes whom
//   #/staking/<backerId> one backer: packages, payments, statement, CSV
import * as db from '../db.js';
import * as M from '../model.js';
import * as K from '../staking.js';
import { statementCSV } from '../csv.js';
import { h, mount, money, signClass, sheet, field, num, toast, confirmBox, dateLabel, select, download, toLocalInput, fromLocalInput, go } from '../ui.js';
import { getBackers, backerByName } from '../backing.js';
import { getBankrolls } from '../store.js';

const dueText = d => (d > 0 ? `You owe ${money(d)}` : d < 0 ? `Owes you ${money(-d)}` : 'All square');
const dueClass = d => (d > 0 ? 'warn' : d < 0 ? 'pos' : 'muted');
const ATTACH = [['none', 'Only when I add it'], ['all', 'Every new session'], ['cash', 'New cash games'], ['tourney', 'New tournaments']];

async function load() {
  const [backers, deals, sessions, money] = await Promise.all([getBackers(), db.all('deals'), db.all('sessions'), db.all('stakemoney')]);
  return { backers, deals, sessions, money };
}

export async function render(root, params) {
  if (params[0]) return renderBacker(root, params[0]);
  const { backers, deals, sessions, money: mon } = await load();
  mount(root,
    h('div.row.between', { style: { marginBottom: '8px' } }, h('h1', 'Staking'),
      h('div.row', h('button.btn.sm#new-package', { onclick: async () => { if (await editDeal(null)) render(root, params); } }, '+ Package'))),
    h('p.muted.small', 'Track backers who buy a piece of your action, staking packages with makeup, and who owes whom. To sell action in one session, open it and tap “Sell action”.'),
    backers.length ? h('div.card', h('ul.list#backer-list', backers.map(b => {
      const bal = K.backerBalance(b.id, sessions, mon);
      const act = deals.filter(d => d.backerId === b.id && d.status !== 'closed');
      return h('li', h('a.item', { href: `#/staking/${b.id}` },
        h('div.grow', h('div.t', b.name), h('div.s', act.length ? act.map(d => d.name).join(', ') : 'No package')),
        h('div.amt', { class: dueClass(bal.due) }, dueText(bal.due))));
    }))) : h('div.card.center', h('p.muted', 'No backers yet. Add a package, or sell action from a session.')));
}

// Package form. Returns the saved deal or null.
async function editDeal(deal, presetBacker = null) {
  const backers = await getBackers();
  const d = deal || { name: 'Package', share: 100, markup: 1, makeup: true, split: 50, autoAttach: 'all', status: 'active', backerId: presetBacker };
  const r = await sheet(close => {
    const form = h('form#deal-form', { novalidate: true, onsubmit: async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      try {
        const share = num(f.share), markup = num(f.markup) || 1, split = num(f.split);
        K.validateBacking([{ share, markup }]);
        if (form.makeup.checked && !(split >= 0 && split <= 100)) throw new Error('Your split must be 0–100%.');
        const b = deal ? { id: deal.backerId } : await backerByName(f.backer);
        close({ ...d, backerId: b.id, name: f.name.trim() || 'Package', share, markup, makeup: form.makeup.checked, split, autoAttach: f.autoAttach });
      } catch (ex) { form.querySelector('#deal-error').textContent = ex.message; }
    } },
    deal ? null : field('Backer', h('input', { name: 'backer', list: 'dl-backers', value: backers.find(b => b.id === presetBacker)?.name || '', placeholder: 'Name', autocomplete: 'off' }), h('datalist#dl-backers', backers.map(b => h('option', { value: b.name })))),
    field('Package name', h('input', { name: 'name', value: d.name, placeholder: 'e.g. 2026 MTT package' })),
    h('div.grid2',
      field('Backer’s share %', h('input', { name: 'share', type: 'number', inputmode: 'decimal', step: 'any', min: '1', max: '100', value: d.share })),
      field('Markup', h('input', { name: 'markup', type: 'number', inputmode: 'decimal', step: '0.01', min: '0.5', max: '3', value: d.markup }), '1 = none')),
    h('label.row', { style: { margin: '6px 0 10px' } }, h('input', { type: 'checkbox', name: 'makeup', checked: !!d.makeup }), 'Makeup: losses carry until won back, then profit is split'),
    field('Your cut of profit %', h('input', { name: 'split', type: 'number', inputmode: 'decimal', step: 'any', min: '0', max: '100', value: d.split }), 'Used when you settle a makeup package'),
    field('Attach automatically to', select('autoAttach', ATTACH, d.autoAttach || 'none')),
    h('p#deal-error.neg'),
    h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Save')));
    return form;
  }, { title: deal ? 'Edit package' : 'New staking package' });
  if (!r) return null;
  const saved = await db.put('deals', r);
  toast('Package saved');
  return saved;
}

async function recordMoney(backer, kind) {
  const r = await sheet(close => {
    const form = h('form#money-form', { onsubmit: e => {
      e.preventDefault();
      const a = num(form.amount.value);
      if (a > 0) close({ amount: a, date: fromLocalInput(form.date.value) || Date.now(), note: form.note.value.trim() });
    } },
    field('Amount', h('input', { name: 'amount', type: 'number', inputmode: 'decimal', step: 'any', min: '0', required: true })),
    field('Date', h('input', { name: 'date', type: 'datetime-local', value: toLocalInput(Date.now()) })),
    field('Note', h('input', { name: 'note', placeholder: kind === 'paid' ? 'e.g. Venmo' : 'e.g. package funds' })),
    h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Save')));
    return form;
  }, { title: kind === 'paid' ? `You paid ${backer.name}` : `${backer.name} paid you` });
  if (!r) return false;
  await db.put('stakemoney', { ...r, kind, backerId: backer.id });
  toast('Saved');
  return true;
}

async function renderBacker(root, id) {
  const { backers, deals, sessions, money: mon } = await load();
  const b = backers.find(x => x.id === id);
  if (!b) { mount(root, h('div.card', h('p', 'Backer not found.'), h('a', { href: '#/staking' }, 'Staking'))); return; }
  const again = () => renderBacker(root, id);
  const bal = K.backerBalance(b.id, sessions, mon);
  const mine = deals.filter(d => d.backerId === b.id).sort((a, c) => (a.status === 'closed') - (c.status === 'closed'));
  const settles = mon.filter(m => m.kind === 'settle');
  const rows = K.statement(b.id, sessions, mon).reverse();
  const sessionById = Object.fromEntries(sessions.map(s => [s.id, s]));
  const dealName = Object.fromEntries(deals.map(d => [d.id, d.name]));

  const pkgCard = d => {
    const st = K.packageState(d, sessions, settles);
    return h('div.card.package', { 'data-deal': d.id },
      h('div.row.between', h('b', d.name, d.status === 'closed' ? h('span.tag', { style: { marginLeft: '6px' } }, 'closed') : null),
        h('button.btn.ghost.sm', { onclick: async () => { if (await editDeal(d)) again(); } }, 'Edit')),
      h('p.small.muted', `${d.share}% of your action${d.markup !== 1 ? ` at ${d.markup} markup` : ''}${d.makeup ? ` · makeup · your cut ${d.split}%` : ''} · ${ATTACH.find(a => a[0] === (d.autoAttach || 'none'))[1].toLowerCase()}`),
      h('div.tiles', { style: { marginBottom: '6px' } },
        h('div.tile', h('div.k', 'Sessions'), h('div.v', String(st.sessions))),
        d.makeup
          ? h('div.tile', h('div.k', st.makeup ? 'Makeup' : 'To split'), h('div.v.pkg-state', { class: st.makeup ? 'neg' : signClass(st.balance) }, money(st.makeup ? st.makeup : st.balance)))
          : h('div.tile', h('div.k', 'Backer result'), h('div.v', { class: signClass(st.total) }, money(st.total, { sign: true })))),
      st.canSettle && h('button.btn.primary.block.settle-btn', { onclick: async () => {
        if (!(await confirmBox(`Settle ${d.name}: ${money(st.balance)} profit. You take ${money(st.playerCut)}, ${b.name} keeps ${money(st.backerCut)}. Makeup resets to zero.`, { ok: 'Settle' }))) return;
        const banks = await getBankrolls();
        await db.put('stakemoney', { ...K.makeSettle(d, st), bankrollId: await db.getSetting('defaultBankroll', banks[0].id) });
        toast(`Settled: your cut ${money(st.playerCut)}`); again();
      } }, `Settle: your cut ${money(st.playerCut)}`),
      h('div.row', { style: { marginTop: '8px' } },
        h('button.btn.ghost.sm', { onclick: async () => { await db.put('deals', { ...d, status: d.status === 'closed' ? 'active' : 'closed' }); again(); } }, d.status === 'closed' ? 'Reopen' : 'Close package')));
  };

  mount(root,
    h('a.small', { href: '#/staking' }, '‹ Staking'),
    h('div.row.between', { style: { margin: '4px 0 8px' } }, h('h1#backer-name', b.name),
      h('button.btn.ghost.sm', { onclick: async () => {
        const name = await sheet(close => { const f = h('form', { onsubmit: e => { e.preventDefault(); close(f.n.value.trim() || null); } }, field('Name', h('input', { name: 'n', value: b.name })), h('div.row.end', h('button.btn.primary', { type: 'submit' }, 'Save'))); return f; }, { title: 'Rename backer' });
        if (name) { await db.put('backers', { ...b, name }); again(); }
      } }, 'Rename')),
    h('div.card',
      h('div.tiles', h('div.tile.big', h('div.k', 'Balance'), h('div.v#backer-due', { class: dueClass(bal.due) }, dueText(bal.due)))),
      h('div.btn-grid',
        h('button.btn#btn-paid', { onclick: async () => { if (await recordMoney(b, 'paid')) again(); } }, 'You paid them'),
        h('button.btn#btn-received', { onclick: async () => { if (await recordMoney(b, 'received')) again(); } }, 'They paid you'))),
    h('div.row.between', { style: { margin: '14px 0 6px' } }, h('h3', 'Packages'),
      h('button.btn.ghost.sm#add-package-backer', { onclick: async () => { if (await editDeal(null, b.id)) again(); } }, '+ Package')),
    mine.length ? mine.map(pkgCard) : h('p.muted.small', 'No packages — action sold session by session shows in the statement below.'),
    h('div.card#statement',
      h('div.row.between', h('h3', 'Statement'),
        h('button.btn.ghost.sm#export-statement', { onclick: () => download(`bankroll-statement-${b.name.replace(/\W+/g, '-').toLowerCase()}.csv`, statementCSV(b, K.statement(b.id, sessions, mon), sessionById, dealName), 'text/csv') }, 'Export CSV')),
      rows.length ? h('ul.list', rows.map(r => h('li', h(r.sessionId ? 'a.item' : 'div.item', r.sessionId ? { href: `#/session/${r.sessionId}` } : {},
        h('div.grow',
          h('div.t', r.label),
          h('div.s', [dateLabel(r.at), r.kind === 'session' ? `${r.share}%${r.markup !== 1 ? ' @ ' + r.markup : ''} · paid ${money(r.paidIn)} · gets ${money(r.returns)}` : r.kind === 'settle' ? `package ${dealName[r.dealId] || ''}: ${money(r.packageResult)} split, your cut` : r.note].filter(Boolean).join(' · '))),
        h('div', { style: { textAlign: 'right' } },
          h('div.amt', { class: signClass(r.amount) }, money(r.amount, { sign: true })),
          h('div.s.muted', dueText(r.due))),
        r.kind === 'paid' || r.kind === 'received' ? h('button.btn.ghost.sm', { 'aria-label': 'Delete payment', onclick: async e => {
          e.preventDefault();
          const m = mon.find(x => x.backerId === b.id && x.kind === r.kind && x.date === r.at && Math.abs(x.amount) === Math.abs(r.amount));
          if (m && await confirmBox('Delete this payment?', { ok: 'Delete', danger: true })) { await db.remove('stakemoney', m.id); again(); }
        } }, '✕') : null)))) : h('p.muted.small', 'Nothing yet.'),
      h('p.small.muted', { style: { marginTop: '8px' } }, 'Amounts are from ', b.name, '’s side: + means you owe them more.')),
    !rows.length && !mine.length && h('button.btn.danger.block', { onclick: async () => { if (await confirmBox(`Remove ${b.name}?`, { ok: 'Remove', danger: true })) { await db.remove('backers', b.id); go('#/staking'); } } }, 'Remove backer'));
}
