const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlannedQtyMT } = require('./planned-total.helpers');

test('keeps the ordered total when the saved rows add up to less', () => {
  assert.equal(resolvePlannedQtyMT(2520, 2270.04), 2520);
});

test('grows the total if rows add up to more', () => {
  assert.equal(resolvePlannedQtyMT(2000, 2100.5), 2100.5);
});

test('equal values stay the same', () => {
  assert.equal(resolvePlannedQtyMT(2496.04, 2496.04), 2496.04);
});

test('missing or non-numeric existing total falls back to the rows total', () => {
  assert.equal(resolvePlannedQtyMT(undefined, 100), 100);
  assert.equal(resolvePlannedQtyMT('abc', 100), 100);
  assert.equal(resolvePlannedQtyMT(null, null), 0);
});

test('result is rounded to 2 decimals', () => {
  assert.equal(resolvePlannedQtyMT(0, 10.005), 10.01);
});
