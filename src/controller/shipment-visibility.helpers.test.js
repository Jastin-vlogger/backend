const test = require('node:test');
const assert = require('node:assert/strict');
const { isOnTransitOrLaterStatus, isAtPortOrLaterStatus } = require('./shipment-visibility.helpers');

// Point 1: FAS sees "On Transit and later"; pre-transit ETD/ETA stages are hidden.
test('Point 1: includes On Transit and all later statuses', () => {
  ['On Transit', 'At Port of Discharge', 'Reached WH', 'Delivered WH', 'GRN Completed', 'Completed']
    .forEach((s) => assert.equal(isOnTransitOrLaterStatus(s), true, `${s} should be visible`));
});

test('Point 1: excludes pre-transit ETD/ETA statuses', () => {
  ['ETD yet to be confirmed', 'ETD yet to Due', 'ETA yet to due']
    .forEach((s) => assert.equal(isOnTransitOrLaterStatus(s), false, `${s} should be hidden`));
});

test('Point 1: excludes empty/unknown status (treated as pre-transit)', () => {
  assert.equal(isOnTransitOrLaterStatus(''), false);
  assert.equal(isOnTransitOrLaterStatus(null), false);
  assert.equal(isOnTransitOrLaterStatus(undefined), false);
});

test('Point 1: matching is case-insensitive', () => {
  assert.equal(isOnTransitOrLaterStatus('on transit'), true);
  assert.equal(isOnTransitOrLaterStatus('etd YET TO due'), false);
});

// Warehouse manager: "At Port of Discharge or later".
test('Warehouse: includes At Port and later, excludes On Transit + pre-transit', () => {
  ['At Port of Discharge', 'Reached WH', 'Delivered WH', 'GRN Completed', 'Completed']
    .forEach((s) => assert.equal(isAtPortOrLaterStatus(s), true, `${s} should be visible`));
  ['On Transit', 'ETD yet to be confirmed', 'ETD yet to Due', '', null]
    .forEach((s) => assert.equal(isAtPortOrLaterStatus(s), false, `${s} should be hidden`));
});
