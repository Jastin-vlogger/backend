const test = require('node:test');
const assert = require('node:assert/strict');

const DocumentImportLog = require('../../models/documentImportLog.model');
const { recordDocumentImports } = require('./importLog');

test('writes one row per entry with date, user name and file, skipping falsy entries', async () => {
  let inserted;
  DocumentImportLog.insertMany = async (rows) => { inserted = rows; };
  await recordDocumentImports([
    { shipmentId: 's1', containerId: 'c1', source: 'bl', fileName: 'bl.pdf', summary: { containers: 60 } },
    false,
    null,
    { shipmentId: 's1', containerId: 'c1', source: 'packing_list', fileName: 'pl.pdf' },
  ], { _id: 'u1', name: 'Rayees' });
  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].source, 'bl');
  assert.equal(inserted[0].importedBy.name, 'Rayees');
  assert.equal(inserted[0].summary.containers, 60);
  assert.ok(inserted[0].importedAt instanceof Date);
  assert.equal(inserted[1].action, 'import');
});

test('nothing to log means no insert', async () => {
  let called = false;
  DocumentImportLog.insertMany = async () => { called = true; };
  await recordDocumentImports([false, null], { _id: 'u1' });
  assert.equal(called, false);
});

test('a failing insert never throws into the caller', async () => {
  DocumentImportLog.insertMany = async () => { throw new Error('db down'); };
  await assert.doesNotReject(recordDocumentImports({ source: 'bl' }, { _id: 'u1', name: 'X' }));
});
