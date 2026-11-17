// Backing on one session: who owns how much of your action. Used on the session page and the live screen.
import * as db from './db.js';
import * as M from './model.js';
import * as K from './staking.js';
import { h, mount, money, signClass, sheet, field, num, toast, combo, select } from './ui.js';

export async function getBackers() { return (await db.all('backers')).sort((a, b) => a.name.localeCompare(b.name)); }

// Find a backer by name, or add them.
export async function backerByName(name) {
  const n = name.trim();
  if (!n) throw new Error('Give each backer a name.');
  const all = await db.all('backers');
  return all.find(b => b.name.toLowerCase() === n.toLowerCase()) || db.put('backers', { name: n, note: '' });
}

// Sheet to sell action / attach packages. Resolves to the new backing list, or null.
export async function editBacking(session) {
  const [backers, deals] = await Promise.all([getBackers(), db.all('deals')]);
  const byId = Object.fromEntries(backers.map(b => [b.id, b]));
  const active = deals.filter(d => d.status !== 'closed');
  return sheet(close => {
    let rows = (session.backing || []).map(l => ({ ...l, name: byId[l.backerId]?.name || '' }));
    const box = h('div#backing-rows');
    const total = h('p.small#backing-total');
    const err = h('p.neg#backing-error');
    const paint = () => {
      mount(box, rows.length ? rows.map((r, i) => h('div.backing-row', { style: { borderBottom: '1px solid var(--line)', padding: '8px 0' } },
        r.dealId
          ? h('div.row.between', h('b', `${r.name} · package “${deals.find(d => d.id === r.dealId)?.name || 'package'}”`),
            h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); paint(); } }, '✕'))
          : h('div.row', { style: { flexWrap: 'nowrap' } },
            h('div', { style: { flex: '2' } }, combo('bname', backers.map(b => b.name), r.name, { placeholder: 'Name', 'aria-label': 'Backer name', oninput: e => { r.name = e.target.value; } })),
            h('button.btn.ghost.sm', { type: 'button', 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); paint(); } }, '✕')),
        h('div.grid2', { style: { marginTop: '6px' } },
          field('Share %', h('input', { name: 'bshare', type: 'number', inputmode: 'decimal', step: 'any', min: '0', max: '100', value: r.share, oninput: e => { r.share = num(e.target.value); sum(); } })),
          field('Markup', h('input', { name: 'bmarkup', type: 'number', inputmode: 'decimal', step: '0.01', min: '0.5', max: '3', value: r.markup, oninput: e => { r.markup = num(e.target.value); sum(); } }), '1 = none, 1.2 = 20%'))))
        : h('p.muted', 'Nobody has a piece of this session.'));
      sum();
    };
    const sum = () => {
      const s = rows.reduce((a, r) => a + (Number(r.share) || 0), 0);
      const cost = M.totalBuyIn(session);
      const fromBackers = rows.reduce((a, r) => a + cost * (r.share || 0) / 100 * (r.markup || 1), 0);
      total.textContent = `${s}% sold · backers pay ${money(Math.round(fromBackers * 100) / 100)} of ${money(cost)} in buy-ins`;
      total.className = 'small' + (s > 100 ? ' neg' : ' muted');
    };
    paint();
    return [
      h('p.small.muted', 'Sell a piece of your action, or attach a staking package. Backers share the buy-ins and the winnings; tips and expenses stay yours.'),
      box,
      h('div.row', { style: { margin: '8px 0' } },
        h('button.btn.sm#add-backer-row', { type: 'button', onclick: () => { rows.push({ backerId: null, dealId: null, name: '', share: 10, markup: 1 }); paint(); } }, '+ Person'),
        active.length ? (() => {
          const s = select('pkg', [['', '+ Package…'], ...active.filter(d => !rows.some(r => r.dealId === d.id)).map(d => [d.id, `${byId[d.backerId]?.name || '?'} · ${d.name}`])], '');
          s.id = 'add-package'; s.style.width = 'auto';
          s.addEventListener('change', () => { const d = deals.find(x => x.id === s.value); if (d) { rows.push({ backerId: d.backerId, dealId: d.id, name: byId[d.backerId]?.name || '', share: d.share, markup: d.markup }); paint(); } });
          return s;
        })() : null),
      total, err,
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button.btn.primary#save-backing', { type: 'button', onclick: async () => {
          try {
            const clean = rows.filter(r => r.dealId || r.name.trim());
            K.validateBacking(clean.map(r => ({ share: r.share, markup: r.markup || 1 })));
            const out = [];
            for (const r of clean) {
              const b = r.dealId ? { id: r.backerId } : await backerByName(r.name);
              out.push({ backerId: b.id, dealId: r.dealId || null, share: Number(r.share), markup: Number(r.markup) || 1 });
            }
            close(out);
          } catch (e) { err.textContent = e.message; }
        } }, 'Save')),
    ];
  }, { title: 'Backers & action sold' });
}

// The card on a finished session's page.
export async function backingCard(session, onChange) {
  const backers = Object.fromEntries((await getBackers()).map(b => [b.id, b]));
  const deals = Object.fromEntries((await db.all('deals')).map(d => [d.id, d]));
  const links = session.backing || [];
  const edit = async () => {
    const next = await editBacking(session);
    if (!next) return;
    session.backing = next;
    await db.put('sessions', session);
    toast('Backing saved');
    onChange && onChange();
  };
  if (!links.length) {
    return h('div.card#session-backing', h('div.row.between', h('h3', 'Backing'), h('button.btn.ghost.sm#edit-backing', { onclick: edit }, '+ Sell action')),
      h('p.muted.small', 'All your own action.'));
  }
  const you = K.playerNet(session);
  return h('div.card#session-backing',
    h('div.row.between', h('h3', `Backing · ${K.soldShare(session)}% sold`), h('button.btn.ghost.sm#edit-backing', { onclick: edit }, 'Edit')),
    h('table.t', h('tbody',
      links.map(l => {
        const p = K.backerPart(session, l);
        return h('tr', h('td', h('a', { href: `#/staking/${l.backerId}` }, backers[l.backerId]?.name || 'Backer'),
          h('div.small.muted', `${p.share}%${p.markup !== 1 ? ` @ ${p.markup}` : ''}${l.dealId ? ` · ${deals[l.dealId]?.name || 'package'}` : ''}`)),
          h('td', h('div.small.muted', `paid ${money(p.paidIn)}`), h('div', { class: signClass(p.result) }, money(p.result, { sign: true }))));
      }),
      h('tr', h('td', h('b', 'Your share')), h('td', h('b#your-share', { class: signClass(you) }, money(you, { sign: true })))))),
    links.some(l => l.dealId && deals[l.dealId]?.makeup) && h('p.small.muted', 'Package profit reaches you when the package is settled.'));
}
