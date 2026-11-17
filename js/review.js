// Post-session review: how you felt and played, so Stats can link mindset to results.
import * as db from './db.js';
import { h, mount, num, toast } from './ui.js';

const scale = (name, label, value, lo = 'low', hi = 'high') => h('fieldset', h('legend', `${label} (1 = ${lo}, 5 = ${hi})`),
  h('div.scale', [1, 2, 3, 4, 5].map(n => h('label', h('input', { type: 'radio', name, value: n, checked: Number(value) === n }), h('span', n)))));

export function reviewCard(session, { open = false } = {}) {
  const card = h('div.card#review');
  const paintSummary = () => {
    const r = session.review;
    const bit = (k, v) => (v === null || v === undefined || v === '' ? null : h('span.tag', { style: { marginRight: '6px' } }, `${k}: ${v}`));
    mount(card,
      h('div.row.between', h('h3', 'Review'), h('button.btn.ghost.sm#edit-review', { onclick: paintForm }, r ? 'Edit' : 'Add review')),
      r ? [
        h('div', { style: { marginBottom: '6px' } }, bit('Mood', r.mood), bit('Tilt', r.tilt), bit('Focus', r.focus), bit('Sleep', r.sleep != null && r.sleep !== '' ? r.sleep + 'h' : null), bit('Drinks', r.alcohol)),
        r.keyHands && h('p', { style: { whiteSpace: 'pre-wrap' } }, h('b', 'Key hands: '), r.keyHands),
        r.lesson && h('p', { style: { whiteSpace: 'pre-wrap' } }, h('b', 'Lesson: '), r.lesson),
      ] : h('p.muted.small', 'Rate your mood, tilt and focus to see later how they affect your results.'));
  };
  const paintForm = () => {
    const r = session.review || {};
    const form = h('form#review-form', { onsubmit: async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      const opt = v => (v === undefined || v === '' ? null : num(v));
      session.review = { mood: opt(d.mood), tilt: opt(d.tilt), focus: opt(d.focus), sleep: opt(d.sleep), alcohol: opt(d.alcohol), keyHands: (d.keyHands || '').trim(), lesson: (d.lesson || '').trim() };
      session = await db.put('sessions', session);
      toast('Review saved');
      paintSummary();
    } },
    h('h3', 'How did it go?'),
    scale('mood', 'Mood', r.mood, 'bad', 'great'),
    scale('tilt', 'Tilt', r.tilt, 'calm', 'steaming'),
    scale('focus', 'Focus', r.focus, 'distracted', 'locked in'),
    h('div.grid2',
      h('label.field', h('span', 'Sleep last night (hours)'), h('input', { name: 'sleep', type: 'number', inputmode: 'decimal', step: 'any', min: '0', max: '24', value: r.sleep ?? '' })),
      h('label.field', h('span', 'Drinks'), h('input', { name: 'alcohol', type: 'number', inputmode: 'numeric', min: '0', value: r.alcohol ?? '' }))),
    h('label.field', h('span', 'Key hands'), h('textarea', { name: 'keyHands', placeholder: 'Big pots, tough spots…' }, r.keyHands || '')),
    h('label.field', h('span', 'Lesson / what to work on'), h('textarea', { name: 'lesson' }, r.lesson || '')),
    h('div.row.end', h('button.btn.ghost', { type: 'button', onclick: paintSummary }, session.review ? 'Cancel' : 'Skip'), h('button.btn.primary', { type: 'submit' }, 'Save review')));
    mount(card, form);
  };
  if (open && !session.review) paintForm(); else paintSummary();
  return card;
}
