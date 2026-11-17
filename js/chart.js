// Small SVG charts, returned as strings (no library needed).
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// Line chart of points [{x, y}] with a zero line. fmt formats y labels; xLabel formats x labels.
export function lineChart(points, { width = 360, height = 200, fmt = v => v, xLabel = v => v, title = 'Chart' } = {}) {
  if (!points.length) return `<p class="muted">No data yet.</p>`;
  const pad = { l: 52, r: 10, t: 10, b: 24 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ticks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys));
  const ymin = ticks[0], ymax = ticks[ticks.length - 1];
  const X = x => pad.l + (xmax === xmin ? (width - pad.l - pad.r) / 2 : ((x - xmin) / (xmax - xmin)) * (width - pad.l - pad.r));
  const Y = y => pad.t + (1 - (y - ymin) / (ymax - ymin || 1)) * (height - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${X(xs[xs.length - 1]).toFixed(1)},${Y(0).toFixed(1)}L${X(xs[0]).toFixed(1)},${Y(0).toFixed(1)}Z`;
  const grid = ticks.map(t => `<line class="axis" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="lbl" x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join('');
  const xl = [xmin, xmax].filter((v, i, a) => a.indexOf(v) === i)
    .map((v, i) => `<text class="lbl" x="${X(v)}" y="${height - 6}" text-anchor="${i ? 'end' : 'start'}">${esc(xLabel(v))}</text>`).join('');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">${grid}
<path class="area" d="${area}"/><line class="zero" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(0)}" y2="${Y(0)}"/>
<path class="line" d="${path}"/><circle cx="${X(last.x)}" cy="${Y(last.y)}" r="4" fill="var(--accent)"/>${xl}</svg>`;
}

// Horizontal bars for [{label, value}] around zero.
export function barChart(rows, { width = 360, fmt = v => v, title = 'Chart' } = {}) {
  if (!rows.length) return `<p class="muted">No data yet.</p>`;
  const rowH = 26, pad = { l: 96, r: 64 }, height = rows.length * rowH + 6;
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  const hasNeg = rows.some(r => r.value < 0), hasPos = rows.some(r => r.value > 0);
  const inner = width - pad.l - pad.r;
  const zero = pad.l + (hasNeg && hasPos ? inner / 2 : hasNeg ? inner : 0);
  const scale = (hasNeg && hasPos ? inner / 2 : inner) / max;
  const bars = rows.map((r, i) => {
    const y = i * rowH + 4, w = Math.abs(r.value) * scale, x = r.value >= 0 ? zero : zero - w;
    return `<text class="lbl" x="${pad.l - 8}" y="${y + 15}" text-anchor="end">${esc(String(r.label).slice(0, 14))}</text>
<rect class="${r.value >= 0 ? 'bar-pos' : 'bar-neg'}" x="${x.toFixed(1)}" y="${y + 3}" width="${Math.max(1, w).toFixed(1)}" height="${rowH - 10}" rx="3"/>
<text class="lbl" x="${width - 4}" y="${y + 15}" text-anchor="end">${esc(fmt(r.value))}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="zero" x1="${zero}" x2="${zero}" y1="0" y2="${height}"/>${bars}</svg>`;
}
