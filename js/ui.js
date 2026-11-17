// Small DOM helpers shared by every screen.

// h('div.card#id', {onclick, ...attrs}, child, child...)
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(root, ...children) { root.replaceChildren(); append(root, children); }

// ---- formatting
let currency = '$';
export function setCurrency(sym) { currency = sym || '$'; }
export function money(n, { sign = false, cents = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents || abs % 1 ? 2 : 0 });
  const pre = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  return `${pre}${currency}${s}`;
}
export function signClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }

export function duration(ms, { seconds = false } = {}) {
  if (!ms || ms < 0) ms = 0;
  const t = Math.floor(ms / 1000), hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  if (seconds) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
}

export function dateLabel(ms, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(ms).toLocaleDateString(undefined, opts);
}
export function timeLabel(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:MM"
export function toLocalInput(ms) {
  const d = new Date(ms); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(s) { return s ? new Date(s).getTime() : null; }
export function num(v) { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; }

// ---- feedback
export function toast(msg, { ms = 2200 } = {}) {
  const t = h('div.toast', { role: 'status' }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Modal sheet. Resolves with the value passed to close(), or null when dismissed.
export function sheet(build, { title } = {}) {
  return new Promise(resolve => {
    const back = h('div.sheet-back');
    const close = v => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); resolve(v ?? null); };
    const box = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title && h('h2', title), build(close));
    back.appendChild(box);
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const first = box.querySelector('input,select,textarea,button');
    if (first) setTimeout(() => first.focus(), 50);
  });
}

export function confirmBox(message, { ok = 'OK', danger = false } = {}) {
  return sheet(close => [
    h('p', message),
    h('div.row.end', h('button.btn.ghost', { onclick: () => close(false) }, 'Cancel'),
      h('button.btn' + (danger ? '.danger' : '.primary'), { 'data-ok': '', onclick: () => close(true) }, ok)),
  ], { title: 'Are you sure?' }).then(v => !!v);
}

// Ask for one number (used for rebuys, stack updates...).
export function askNumber(title, { label = 'Amount', value = '', ok = 'Save' } = {}) {
  return sheet(close => {
    const inp = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value, 'aria-label': label, name: 'amount' });
    const form = h('form', { onsubmit: e => { e.preventDefault(); close(inp.value === '' ? null : num(inp.value)); } },
      h('label', label, inp),
      h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: () => close(null) }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, ok)));
    return form;
  }, { title });
}

// ---- form helpers
export function field(label, input, hint) { return h('label.field', h('span', label), input, hint && h('small', hint)); }
export function select(name, options, value) {
  return h('select', { name }, options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: String(v) === String(value) }, l);
  }));
}
// Text input with a datalist of suggestions you can extend just by typing a new value.
export function combo(name, options, value, attrs = {}) {
  const id = 'dl-' + name + '-' + Math.random().toString(36).slice(2, 7);
  return [h('input', { name, value: value ?? '', list: id, autocomplete: 'off', ...attrs }), h('datalist', { id }, options.map(o => h('option', { value: o })))];
}
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function download(name, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function go(hash) { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); }
