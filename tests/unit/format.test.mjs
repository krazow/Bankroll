import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, duration, num, signClass, setCurrency } from '../../js/ui.js';

test('money formats signs and currency', () => {
  setCurrency('$');
  assert.equal(money(1234), '$1,234');
  assert.equal(money(-50), '-$50');
  assert.equal(money(25, { sign: true }), '+$25');
  assert.equal(money(0, { sign: true }), '$0');
  assert.equal(money(12.5), '$12.5'.replace('12.5', (12.5).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })));
  assert.equal(money(null), '—');
  setCurrency('€');
  assert.equal(money(10), '€10');
  setCurrency('$');
});

test('duration formats hours and minutes', () => {
  assert.equal(duration(0), '0m');
  assert.equal(duration(45 * 60e3), '45m');
  assert.equal(duration(3 * 3600e3 + 5 * 60e3), '3h 05m');
  assert.equal(duration(3661e3, { seconds: true }), '1:01:01');
  assert.equal(duration(-5), '0m');
});

test('num parses messy input', () => {
  assert.equal(num('$1,200'), 1200);
  assert.equal(num('-40.5'), -40.5);
  assert.equal(num(''), 0);
  assert.equal(num('abc'), 0);
});

test('signClass', () => {
  assert.equal(signClass(5), 'pos');
  assert.equal(signClass(-5), 'neg');
  assert.equal(signClass(0), '');
});
