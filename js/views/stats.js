// Stats: filters, summary, profit graph, breakdowns, calendar, tournaments and mindset.
import * as S from '../stats.js';
import { lineChart, barChart } from '../chart.js';
import { h, mount, money, signClass, dateLabel, select } from '../ui.js';
import { getBankrolls, sessionsWithBankroll } from '../store.js';

// Filters persist while the app is open.
const state = { period: 'all', type: '', setting: '', game: '', stakes: '', venue: '', bankrollId: '', dow: '', tod: '', length: '', group: 'stakes', xAxis: 'session', cal: null };

const hourly = v => (v === null ? '—' : money(Math.round(v), { sign: true }) + '/h');

export async function render(root) {
  const [all, banks] = await Promise.all([sessionsWithBankroll(), getBankrolls()]);
  const now = Date.now();
  if (!state.cal) { const d = new Date(now); state.cal = [d.getFullYear(), d.getMonth()]; }

  const draw = () => {
    const f = { ...state, ...S.period(state.period, now) };
    const list = S.applyFilter(all, f);
    const sm = S.summary(list);
    const ts = S.tourneySummary(list);
    const cum = S.cumulative(list);
    const rows = S.breakdown(list, state.group);
    const ins = S.reviewInsights(list);

    const set = (k, v) => { state[k] = v; draw(); };
    const sel = (k, label, opts) => {
      const el = select(k, [['', label], ...opts], state[k]);
      el.setAttribute('aria-label', label); el.id = 'f-' + k;
      el.addEventListener('change', () => set(k, el.value));
      return el;
    };
    const activeExtra = ['dow', 'tod', 'length'].filter(k => state[k]).length;

    mount(root,
      h('div.row.between', { style: { marginBottom: '8px' } }, h('h1', 'Stats'),
        h('button.btn.ghost.sm#reset-filters', { onclick: () => { Object.assign(state, { period: 'all', type: '', setting: '', game: '', stakes: '', venue: '', bankrollId: '', dow: '', tod: '', length: '' }); draw(); } }, 'Reset')),
      h('div.seg#period', [['all', 'All'], ['year', 'Year'], ['90d', '90d'], ['30d', '30d'], ['month', 'Month']].map(([v, l]) =>
        h('label', h('input', { type: 'radio', name: 'period', value: v, checked: state.period === v, onchange: () => set('period', v) }), h('span', l)))),
      h('div.card',
        h('div.grid2',
          sel('type', 'Cash + tourney', [['cash', 'Cash'], ['tourney', 'Tournaments']]),
          sel('setting', 'Live + online', [['live', 'Live'], ['online', 'Online']]),
          sel('game', 'All games', S.values(all, 'game')),
          sel('stakes', 'All stakes', S.values(all, 'stakes')),
          sel('venue', 'All venues', S.values(all, 'venue')),
          banks.length > 1 ? sel('bankrollId', 'All bankrolls', banks.map(b => [b.id, b.name])) : h('span')),
        h('details', { open: activeExtra > 0, style: { marginTop: '10px' } }, h('summary.muted', `More filters${activeExtra ? ` (${activeExtra})` : ''}`),
          h('div.grid3', { style: { marginTop: '8px' } },
            sel('dow', 'Any day', S.DAYS.map((d, i) => [String(i), d])),
            sel('tod', 'Any time', ['Morning', 'Afternoon', 'Evening', 'Late night']),
            sel('length', 'Any length', ['Under 2h', '2–4h', '4–6h', '6h+'])))),

      !sm.count ? h('div.card.center#no-stats', h('p.muted', all.length ? 'No sessions match these filters.' : 'Finish a session to see your stats.')) : [
        h('div.tiles#summary',
          h('div.tile.big', h('div.k', 'Net result'), h('div.v#s-net', { class: signClass(sm.net) }, money(sm.net, { sign: true }))),
          tile('Per hour', hourly(sm.hourly), sm.hourly, 's-hourly'),
          tile('Sessions', String(sm.count), 0, 's-count'),
          tile('Hours', sm.hours.toFixed(1), 0, 's-hours'),
          tile('Win rate', sm.winRate === null ? '—' : sm.winRate + '%', 0, 's-winrate'),
          sm.bbPerHour !== null && tile('BB / hour', sm.bbPerHour.toFixed(2), sm.bbPerHour, 's-bbhr'),
          tile('Biggest win', money(sm.biggestWin, { sign: true }), sm.biggestWin, 's-bigwin'),
          tile('Biggest loss', money(sm.biggestLoss), sm.biggestLoss, 's-bigloss'),
          tile('Avg session', money(sm.avg, { sign: true }), sm.avg, 's-avg'),
          sm.expenses > 0 && tile('Expenses', money(sm.expenses), 0, 's-exp')),

        h('div.card',
          h('div.row.between', h('h3', 'Profit over time'),
            h('div.seg', { style: { margin: 0 } }, [['session', 'By session'], ['date', 'By date']].map(([v, l]) =>
              h('label', h('input', { type: 'radio', name: 'xaxis', checked: state.xAxis === v, onchange: () => set('xAxis', v) }), h('span', { style: { padding: '4px 10px' } }, l))))),
          h('div#profit-chart', { html: lineChart(
            [{ x: state.xAxis === 'date' ? (cum[0]?.t ?? 0) - 1 : 0, y: 0 }, ...cum.map(p => ({ x: state.xAxis === 'date' ? p.t : p.i, y: p.value }))],
            { fmt: v => money(v), xLabel: v => (state.xAxis === 'date' ? dateLabel(v, { month: 'short', day: 'numeric' }) : `#${v}`), title: 'Cumulative profit' }) })),

        ts && h('div.card#tourney-stats', h('h3', 'Tournaments'),
          h('div.tiles',
            tile('ROI', ts.roi === null ? '—' : ts.roi + '%', ts.roi, 't-roi'),
            tile('In the money', ts.itm + '%', 0, 't-itm'),
            tile('Avg finish', ts.avgFinish ?? '—', 0, 't-avgfinish'),
            tile('Profit', money(ts.profit, { sign: true }), ts.profit, 't-profit')),
          h('p.small.muted', `${ts.count} tournaments, ${ts.entries} entries, ${money(ts.cost)} in, ${money(ts.won)} won`
            + (ts.avgFinishPct !== null ? `. Average finish: top ${ts.avgFinishPct}% of ${ts.avgField} players.` : '.'))),

        h('div.card#breakdown',
          h('div.row.between', h('h3', 'Breakdown'),
            (() => { const el = select('group', Object.entries(S.GROUPS).map(([k, g]) => [k, g.label]), state.group); el.id = 'group-by'; el.style.width = 'auto'; el.addEventListener('change', () => set('group', el.value)); return el; })()),
          h('div', { html: barChart(rows.slice(0, 12).map(r => ({ label: r.key, value: r.net })), { fmt: v => money(v, { sign: true }), title: 'Net by ' + S.GROUPS[state.group].label }) }),
          h('div.table-wrap', h('table.t#breakdown-table', h('thead', h('tr', h('th', S.GROUPS[state.group].label), h('th', '#'), h('th', 'Hrs'), h('th', 'Net'), h('th', '$/h'), h('th', 'Win'))),
            h('tbody', rows.map(r => h('tr', h('td', r.key), h('td', r.count), h('td', r.hours.toFixed(1)),
              h('td', { class: signClass(r.net) }, money(r.net, { sign: true })), h('td', { class: signClass(r.hourly) }, r.hourly === null ? '—' : money(Math.round(r.hourly))), h('td', r.winRate + '%'))))))),

        calendarCard(list, draw),
        ins.count ? h('div.card#mindset', h('h3', 'Mindset vs results'), h('p.small.muted', `From ${ins.count} reviewed session${ins.count === 1 ? '' : 's'}: your hourly rate by how you felt.`),
          Object.values(ins.fields).map(fd => h('div', { style: { marginBottom: '10px' } }, h('b', fd.label),
            h('table.t', h('tbody', fd.rows.map(r => h('tr', h('td', r.label), h('td.muted', `${r.count}×`), h('td', { class: signClass(r.hourly) }, hourly(r.hourly))))))))) : null,
      ]);
  };
  draw();
}

function tile(k, v, n, id) { return h('div.tile', h('div.k', k), h('div.v', { id, class: signClass(n) }, v)); }

function calendarCard(list, redraw) {
  const [y, m] = state.cal;
  const cal = S.calendar(list, y, m);
  const shift = d => { const t = new Date(y, m + d, 1); state.cal = [t.getFullYear(), t.getMonth()]; redraw(); };
  const monthNet = [...cal.days.values()].reduce((a, d) => a + d.net, 0);
  const cells = [];
  for (let i = 0; i < cal.first; i++) cells.push(h('div'));
  for (let d = 1; d <= cal.count; d++) {
    const day = cal.days.get(d);
    cells.push(h('div.d' + (day ? '.h.' + S.heat(day.net, cal.max) : ''), { title: day ? `${money(day.net, { sign: true })} · ${day.hours}h · ${day.count} session(s)` : '' }, d));
  }
  return h('div.card#calendar',
    h('div.row.between',
      h('button.btn.ghost.sm#cal-prev', { onclick: () => shift(-1), 'aria-label': 'Previous month' }, '‹'),
      h('b#cal-title', new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      h('button.btn.ghost.sm#cal-next', { onclick: () => shift(1), 'aria-label': 'Next month' }, '›')),
    h('div.cal', { style: { marginTop: '8px' } }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => h('div.wd', d)), cells),
    h('p.small.muted.center', { style: { marginTop: '8px' } }, `${cal.days.size} days played · `, h('span', { class: signClass(monthNet) }, money(monthNet, { sign: true }))));
}
