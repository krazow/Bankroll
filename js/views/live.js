// The running session: big clock, quick buttons for rebuys, stack, breaks, expenses, and ending it.
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, money, duration, signClass, askNumber, sheet, toast, go, num, confirmBox, timeLabel, select, field, back } from '../ui.js';
import { runningSession, lastFinished, startRepeat } from '../store.js';
import { afterFinish, liveAlert, getRules } from '../hooks.js';

export async function render(root) {
  let s = await runningSession();
  if (!s) {
    const last = await lastFinished();
    mount(root, h('div.card.center',
      h('h1', 'No session running'),
      h('p.muted', 'Start one to track your time and buy-ins live.'),
      h('div', { style: { display: 'grid', gap: '10px' } },
        h('a.btn.primary.xl.block', { href: '#/new?live=1' }, 'Start a session'),
        last && h('button.btn.xl.block#repeat-last', { onclick: async () => { await startRepeat(); render(root); } },
          `Repeat last: ${M.sessionTitle(last)}${last.venue ? ' @ ' + last.venue : ''}`))));
    return;
  }

  const rules = await getRules();
  const save = async next => { s = await db.put('sessions', next); paint(); };
  const alertBox = h('div');
  const clock = h('div.clock#clock', { 'aria-live': 'off' });
  const statusTag = h('span.tag');
  const amounts = h('div');
  const events = h('ul.list.small');

  const isCash = s.type === 'cash';
  const buttons = h('div.btn-grid',
    h('button.btn.xl#btn-rebuy', { onclick: async () => {
      const last = s.buyIns[s.buyIns.length - 1]?.amount || '';
      const v = await askNumber(isCash ? 'Rebuy / add-on' : 'Re-entry', { value: last, ok: 'Add' });
      if (v > 0) { await save(M.addBuyIn(s, v)); toast(`Added ${money(v)}`); }
    } }, isCash ? '+ Rebuy' : '+ Re-entry'),
    !isCash && h('button.btn.xl#btn-addon', { onclick: async () => {
      const v = await askNumber('Add-on', { value: s.tourney?.buyIn || '', ok: 'Add' });
      if (v > 0) { await save(M.addBuyIn(s, v, Date.now(), 'addon')); toast(`Add-on ${money(v)}`); }
    } }, '+ Add-on'),
    !isCash && h('button.btn.xl#btn-bounty', { onclick: async () => {
      const v = await askNumber('Bounty won', { label: 'Amount', ok: 'Add' });
      if (v > 0) { await save(M.addBounty(s, v)); toast(`Bounty ${money(v)}`); }
    } }, '+ Bounty'),
    isCash && h('button.btn.xl#btn-stack', { onclick: async () => {
      const v = await askNumber('Current stack', { value: M.currentStack(s), label: 'Chips in front of you', ok: 'Update' });
      if (v !== null && v >= 0) await save(M.setStack(s, v));
    } }, 'Update stack'),
    h('button.btn.xl#btn-pause', { onclick: async () => { await save(M.onBreak(s) ? M.resume(s) : M.pause(s)); } }),
    h('button.btn.xl#btn-expense', { onclick: async () => {
      const r = await sheet(close => {
        const form = h('form', { onsubmit: e => { e.preventDefault(); close({ kind: form.kind.value, amount: num(form.amount.value) }); } },
          field('Type', select('kind', M.EXPENSE_KINDS, 'Tips')),
          field('Amount', h('input', { name: 'amount', type: 'number', inputmode: 'decimal', step: 'any', min: '0' })),
          h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Add')));
        return form;
      }, { title: 'Add expense' });
      if (r && r.amount > 0) { await save({ ...s, expenses: [...(s.expenses || []), r] }); toast(`${r.kind}: ${money(r.amount)}`); }
    } }, '+ Expense'),
  );

  const endBtn = h('button.btn.warn.xl.block#btn-end', { onclick: () => endSession() }, 'End session');

  async function endSession() {
    const result = await sheet(close => {
      const form = h('form#end-form', { onsubmit: e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form).entries());
        if (isCash) {
          if (d.cashOut === '') return;
          close({ cashOut: num(d.cashOut) });
        } else {
          close({ place: d.place ? num(d.place) : null, entrants: d.entrants ? num(d.entrants) : null, prize: d.outcome === 'cashed' ? num(d.prize) : 0, bounties: num(d.bounties) });
        }
      } },
      isCash
        ? field('Cash out', h('input', { name: 'cashOut', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: M.currentStack(s), required: true }), 'Total you walked away with (0 if you busted)')
        : [
          h('div.seg#outcome', { role: 'radiogroup', 'aria-label': 'How it ended', onchange: e => { form.dataset.outcome = e.target.value; } },
            h('label', h('input', { type: 'radio', name: 'outcome', value: 'busted', checked: true }), h('span', 'Busted')),
            h('label', h('input', { type: 'radio', name: 'outcome', value: 'cashed' }), h('span', 'Cashed'))),
          h('div.grid2',
            field('Finished (place)', h('input', { name: 'place', type: 'number', inputmode: 'numeric', min: '1' })),
            field('Players', h('input', { name: 'entrants', type: 'number', inputmode: 'numeric', min: '1', value: s.tourney?.entrants ?? '' })),
            h('div.only-cashed', field('Prize', h('input', { name: 'prize', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: '' }))),
            field('Bounties', h('input', { name: 'bounties', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: s.tourney?.bounties || 0 }))),
        ],
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Keep playing'), h('button.btn.primary', { type: 'submit' }, 'End session')));
      return form;
    }, { title: 'End session' });
    if (!result) return;
    const done = { ...M.finish(s, result), endedLive: Date.now() };
    await db.put('sessions', done);
    toast(`Session over: ${money(M.net(done), { sign: true })}`);
    await afterFinish(done);
  }

  function paint() {
    const now = Date.now();
    clock.textContent = duration(M.playedMs(s, now), { seconds: true });
    statusTag.textContent = M.onBreak(s) ? 'On break' : 'Playing';
    statusTag.className = 'tag' + (M.onBreak(s) ? '' : ' live');
    const lb = root.querySelector('#live-backing');
    if (lb) { const sold = (s.backing || []).reduce((t, l) => t + Number(l.share), 0); lb.textContent = sold ? `Backing (${sold}%)` : 'Sell action'; }
    const pb = root.querySelector('#btn-pause');
    if (pb) pb.textContent = M.onBreak(s) ? '▶ Resume' : '❚❚ Break';
    const bi = M.totalBuyIn(s), exp = M.expensesTotal(s);
    mount(amounts,
      h('div.tiles',
        h('div.tile', h('div.k', 'In for'), h('div.v#in-for', money(bi))),
        isCash ? h('div.tile', h('div.k', 'Stack'), h('div.v#stack', money(M.currentStack(s))))
          : h('div.tile', h('div.k', 'Entries'), h('div.v#entries', String(M.entryCount(s)))),
        !isCash && (s.tourney?.bounties > 0) && h('div.tile', h('div.k', 'Bounties'), h('div.v.pos#bounties', money(s.tourney.bounties))),
        isCash && h('div.tile.big', h('div.k', 'Up / down'), h('div.v#live-profit', { class: signClass(M.liveProfit(s)) }, money(M.liveProfit(s), { sign: true }))),
        exp > 0 && h('div.tile', h('div.k', 'Expenses'), h('div.v', money(exp)))));
    const ev = [
      { at: s.start, text: 'Started' },
      ...s.buyIns.slice(1).map(b => ({ at: b.at, text: `${b.kind === 'addon' ? 'Add-on' : isCash ? 'Rebuy' : 'Re-entry'} ${money(b.amount)}` })),
      ...(s.stacks || []).map(x => ({ at: x.at, text: `Stack ${money(x.amount)}` })),
      ...(s.breaks || []).map(b => ({ at: b.start, text: b.end ? `Break ${duration(b.end - b.start)}` : 'On break' })),
    ].sort((a, b) => b.at - a.at);
    mount(alertBox, liveAlert(s, rules));
    mount(events, ev.map(e => h('li.item', h('span.grow', e.text), h('span.muted', timeLabel(e.at)))));
  }

  mount(root,
    back('#/', 'Home'),
    h('div.card',
      h('div.row.between', h('h1', M.sessionTitle(s)), statusTag),
      h('p.muted', [s.setting === 'online' ? 'Online' : 'Live', s.venue].filter(Boolean).join(' · ')),
      clock),
    alertBox,
    amounts,
    h('div.card', buttons, h('div', { style: { height: '10px' } }), endBtn),
    h('div.card', h('h3', 'Timeline'), events),
    h('div.row', h('a.btn.ghost.sm', { href: `#/new?edit=${s.id}` }, 'Edit details'),
      h('button.btn.ghost.sm#live-backing', { onclick: async () => {
        const { editBacking } = await import('../backing.js');
        const next = await editBacking(s);
        if (next) { await save({ ...s, backing: next }); toast(next.length ? `${next.reduce((a, l) => a + l.share, 0)}% of your action sold` : 'Backing removed'); }
      } }, (s.backing || []).length ? `Backing (${(s.backing || []).reduce((a, l) => a + Number(l.share), 0)}%)` : 'Sell action'),
      h('a.btn.ghost.sm#live-hand', { href: `#/tools/hands?new=1&session=${s.id}` }, '+ Hand note'),
      h('button.btn.ghost.sm.danger#btn-discard', { onclick: async () => {
        if (await confirmBox('Delete this running session? Nothing will be saved.', { ok: 'Delete', danger: true })) {
          await db.remove('sessions', s.id); go('#/');
        }
      } }, 'Discard')),
  );
  paint();
  const timer = setInterval(paint, 1000);
  return () => clearInterval(timer);
}
