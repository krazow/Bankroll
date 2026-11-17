// The running session: big clock, quick buttons for rebuys, stack, breaks, expenses, and ending it.
import * as db from '../db.js';
import * as M from '../model.js';
import { h, mount, money, duration, signClass, askNumber, sheet, toast, go, num, confirmBox, timeLabel, select, field } from '../ui.js';
import { runningSession, lastFinished, startRepeat } from '../store.js';
import { afterFinish } from '../hooks.js';

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

  const save = async next => { s = await db.put('sessions', next); paint(); };
  const clock = h('div.clock#clock', { 'aria-live': 'off' });
  const statusTag = h('span.tag');
  const amounts = h('div');
  const events = h('ul.list.small');

  const isCash = s.type === 'cash';
  const buttons = h('div.btn-grid',
    h('button.btn.xl#btn-rebuy', { onclick: async () => {
      const last = s.buyIns[s.buyIns.length - 1]?.amount || '';
      const v = await askNumber(isCash ? 'Rebuy / add-on' : 'Re-entry / add-on', { value: last, ok: 'Add' });
      if (v > 0) { await save(M.addBuyIn(s, v)); toast(`Added ${money(v)}`); }
    } }, isCash ? '+ Rebuy' : '+ Re-entry'),
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
          close({ place: d.place ? num(d.place) : null, entrants: d.entrants ? num(d.entrants) : null, prize: num(d.prize), bounties: num(d.bounties) });
        }
      } },
      isCash
        ? field('Cash out', h('input', { name: 'cashOut', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: M.currentStack(s), required: true }), 'Total you walked away with (0 if you busted)')
        : h('div.grid2',
          field('Finished (place)', h('input', { name: 'place', type: 'number', inputmode: 'numeric', min: '1' })),
          field('Players', h('input', { name: 'entrants', type: 'number', inputmode: 'numeric', min: '1', value: s.tourney?.entrants ?? '' })),
          field('Prize', h('input', { name: 'prize', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: '0' })),
          field('Bounties', h('input', { name: 'bounties', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: '0' }))),
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Keep playing'), h('button.btn.primary', { type: 'submit' }, 'End session')));
      return form;
    }, { title: 'End session' });
    if (!result) return;
    const done = M.finish(s, result);
    await db.put('sessions', done);
    toast(`Session over: ${money(M.net(done), { sign: true })}`);
    await afterFinish(done);
  }

  function paint() {
    const now = Date.now();
    clock.textContent = duration(M.playedMs(s, now), { seconds: true });
    statusTag.textContent = M.onBreak(s) ? 'On break' : 'Playing';
    statusTag.className = 'tag' + (M.onBreak(s) ? '' : ' live');
    const pb = root.querySelector('#btn-pause');
    if (pb) pb.textContent = M.onBreak(s) ? '▶ Resume' : '❚❚ Break';
    const bi = M.totalBuyIn(s), exp = M.expensesTotal(s);
    mount(amounts,
      h('div.tiles',
        h('div.tile', h('div.k', 'In for'), h('div.v#in-for', money(bi))),
        isCash ? h('div.tile', h('div.k', 'Stack'), h('div.v#stack', money(M.currentStack(s))))
          : h('div.tile', h('div.k', 'Entries'), h('div.v', String(s.buyIns.length))),
        isCash && h('div.tile.big', h('div.k', 'Up / down'), h('div.v#live-profit', { class: signClass(M.liveProfit(s)) }, money(M.liveProfit(s), { sign: true }))),
        exp > 0 && h('div.tile', h('div.k', 'Expenses'), h('div.v', money(exp)))));
    const ev = [
      { at: s.start, text: 'Started' },
      ...s.buyIns.slice(1).map(b => ({ at: b.at, text: `${isCash ? 'Rebuy' : 'Re-entry'} ${money(b.amount)}` })),
      ...(s.stacks || []).map(x => ({ at: x.at, text: `Stack ${money(x.amount)}` })),
      ...(s.breaks || []).map(b => ({ at: b.start, text: b.end ? `Break ${duration(b.end - b.start)}` : 'On break' })),
    ].sort((a, b) => b.at - a.at);
    mount(events, ev.map(e => h('li.item', h('span.grow', e.text), h('span.muted', timeLabel(e.at)))));
  }

  mount(root,
    h('div.card',
      h('div.row.between', h('h1', M.sessionTitle(s)), statusTag),
      h('p.muted', [s.setting === 'online' ? 'Online' : 'Live', s.venue].filter(Boolean).join(' · ')),
      clock),
    amounts,
    h('div.card', buttons, h('div', { style: { height: '10px' } }), endBtn),
    h('div.card', h('h3', 'Timeline'), events),
    h('div.row', h('a.btn.ghost.sm', { href: `#/new?edit=${s.id}` }, 'Edit details'),
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
