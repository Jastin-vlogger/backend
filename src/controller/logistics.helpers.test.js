const test = require('node:test');
const assert = require('node:assert/strict');
const { applyLogisticsScalarFields, toLogisticsDate } = require('./logistics.helpers');

// Point 1: Commercial document received date (+ free storage days, clearance remarks) persist.
test('Point 1: persists commercialDocumentReceivedDate / freeStorageDays / clearanceRemarks', () => {
  const target = {};
  applyLogisticsScalarFields(target, {
    commercialDocumentReceivedDate: '2026-05-24',
    freeStorageDays: '14',
    clearanceRemarks: 'all good',
  });
  assert.ok(target.commercialDocumentReceivedDate instanceof Date);
  assert.equal(target.commercialDocumentReceivedDate.toISOString().slice(0, 10), '2026-05-24');
  assert.equal(target.freeStorageDays, 14);
  assert.equal(target.clearanceRemarks, 'all good');
});

// Point 4: DO remarks persists.
test('Point 4: persists doRemarks', () => {
  const target = {};
  applyLogisticsScalarFields(target, { doRemarks: 'DO note' });
  assert.equal(target.doRemarks, 'DO note');
});

// Point 5: customerInspectionRequired parses string boolean correctly.
test('Point 5: customerInspectionRequired parses "true"/"false" to boolean', () => {
  const t1 = {};
  applyLogisticsScalarFields(t1, { customerInspectionRequired: 'true' });
  assert.equal(t1.customerInspectionRequired, true);

  const t2 = {};
  applyLogisticsScalarFields(t2, { customerInspectionRequired: 'false' });
  assert.equal(t2.customerInspectionRequired, false);
});

// Point 6: Municipality released date / response remarks / comments persist.
test('Point 6: persists municipality released date, response remarks, comments', () => {
  const target = {};
  applyLogisticsScalarFields(target, {
    municipalityReleasedDate: '2026-06-23',
    municipalityResponseRemarks: 'approved',
    municipalityComments: 'no issues',
  });
  assert.ok(target.municipalityReleasedDate instanceof Date);
  assert.equal(target.municipalityReleasedDate.toISOString().slice(0, 10), '2026-06-23');
  assert.equal(target.municipalityResponseRemarks, 'approved');
  assert.equal(target.municipalityComments, 'no issues');
});

// Partial-save safety: fields absent from body must NOT be touched (no clobbering).
test('does not clobber fields absent from the payload', () => {
  const target = {
    commercialDocumentReceivedDate: new Date('2026-01-01'),
    clearanceRemarks: 'existing',
    municipalityComments: 'existing comment',
  };
  applyLogisticsScalarFields(target, { doRemarks: 'only this' });
  assert.equal(target.doRemarks, 'only this');
  assert.equal(target.clearanceRemarks, 'existing');
  assert.equal(target.municipalityComments, 'existing comment');
  assert.equal(target.commercialDocumentReceivedDate.toISOString().slice(0, 10), '2026-01-01');
});

// Empty string date clears to null (so a cleared date field round-trips correctly).
test('empty date string maps to null', () => {
  const target = { commercialDocumentReceivedDate: new Date('2026-01-01') };
  applyLogisticsScalarFields(target, { commercialDocumentReceivedDate: '' });
  assert.equal(target.commercialDocumentReceivedDate, null);
});

// Invalid date string maps to null rather than an Invalid Date.
test('toLogisticsDate returns null for invalid input', () => {
  assert.equal(toLogisticsDate('not-a-date'), null);
  assert.equal(toLogisticsDate(''), null);
  assert.equal(toLogisticsDate(null), null);
});

// null target is handled gracefully.
test('null target returns null without throwing', () => {
  assert.equal(applyLogisticsScalarFields(null, { doRemarks: 'x' }), null);
});
