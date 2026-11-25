const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const PaymentCostSheet = require('../models/paymentCostSheet.model');
const Container = require('../models/container.model');
const Shipment = require('../models/shipment.model');
const DocumentImportLog = require('../models/documentImportLog.model');
const AuditLog = require('../models/auditLog.model');
const { permissionService } = require('../core/services/permissionService');
const s3 = require('../core/utils/s3Upload');
const controller = require('./payment-cost-sheet.controller');

const CONTAINER_ID = '65f000000000000000000001';
const SHIPMENT_ID = '65f000000000000000000002';

// In-memory stand-ins for the database layer.
let store;
const makeDoc = (data) => {
  const doc = {
    ...data,
    history: data.history || [],
    containerIds: data.containerIds || [],
    markModified() {},
    async save() { return doc; },
    toObject() { const { markModified, save, toObject, ...plain } = doc; return JSON.parse(JSON.stringify(plain)); },
  };
  return doc;
};
const setup = () => {
  store = [];
  Container.findById = () => ({ select: () => ({ lean: async () => ({ _id: CONTAINER_ID, shipmentId: SHIPMENT_ID, actual: { BLNo: 'bl 123' } }) }) });
  Shipment.findById = () => ({ select: () => ({ lean: async () => ({ shipmentNo: 'RHST-0001/PO01-0001' }) }) });
  PaymentCostSheet.findOne = (query) => {
    const found = store.find((d) => String(d.shipmentId) === String(query.shipmentId) && d.blKey === query.blKey) || null;
    const thenable = Promise.resolve(found);
    thenable.lean = async () => (found ? found.toObject() : null);
    thenable.select = () => thenable;
    return thenable;
  };
  PaymentCostSheet.create = async (data) => { const doc = makeDoc(data); store.push(doc); return doc; };
  DocumentImportLog.insertMany = async () => {};
  AuditLog.prototype.save = async function save() { return this; };
  s3.uploadBufferToS3 = async () => ({ url: 'https://example.invalid/cost-sheet.xlsx' });
  // No DB: permission keys come from this table, by role.
  const grants = { FAS: ['import', 'submit', 'view'], Admin: ['import', 'submit', 'view', 'unlock'], Manager: ['import', 'submit', 'view', 'unlock'], Purchase: [] };
  permissionService.hasPermissionKey = async (user, key) => (grants[user.role] || []).includes(key.split('.').pop());
};

const xlsxFile = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('COST');
  ws.getCell('A1').value = 'Description'; ws.getCell('B1').value = 'Cost DH';
  ws.getCell('A2').value = 'DO Fee'; ws.getCell('B2').value = 575;
  ws.getCell('B3').value = { formula: 'SUM(B2:B2)', result: 575 };
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, size: buffer.length, originalname: 'cost sheet.xlsx' };
};

const call = async (fn, { role, body, file, query } = {}) => {
  const res = { code: 200, headers: {} };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.sent = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  await fn({ params: { containerId: CONTAINER_ID }, body: body || {}, query: query || {}, file, user: { _id: '65f000000000000000000009', name: `${role} user`, role } }, res);
  return res;
};

test('only FS (FAS) and Admin/Manager can import; Purchase gets 403', async () => {
  setup();
  const file = await xlsxFile();
  assert.equal((await call(controller.importPaymentCostSheet, { role: 'Purchase', file })).code, 403);
  assert.equal(store.length, 0);
  const ok = await call(controller.importPaymentCostSheet, { role: 'FAS', file });
  assert.equal(ok.code, 201, JSON.stringify(ok.body));
  assert.equal(store.length, 1);
  assert.equal(ok.body.sheet.status, 'draft');
  assert.equal(ok.body.sheet.importedBy, 'FAS user');
  assert.ok(ok.body.sheet.importedAt);
  assert.equal(ok.body.sheet.stats.cells, 5);
  assert.equal(ok.body.sheet.historyTotal, 1);
  assert.equal((await call(controller.getPaymentCostSheetHistory, { role: 'FAS' })).body.items[0].action, 'import');
});

test('import without a file, or with a non-Excel file, is a 400', async () => {
  setup();
  assert.equal((await call(controller.importPaymentCostSheet, { role: 'FAS' })).code, 400);
  const bad = { buffer: Buffer.from('plain text'), size: 10, originalname: 'x.xlsx' };
  assert.equal((await call(controller.importPaymentCostSheet, { role: 'FAS', file: bad })).code, 400);
});

test('submit locks the sheet; import, re-import and submit then return 409', async () => {
  setup();
  const file = await xlsxFile();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file });
  const submitted = await call(controller.submitPaymentCostSheet, { role: 'FAS' });
  assert.equal(submitted.code, 200);
  assert.equal(submitted.body.sheet.status, 'locked');
  assert.equal((await call(controller.importPaymentCostSheet, { role: 'FAS', file })).code, 409);
  assert.equal((await call(controller.importPaymentCostSheet, { role: 'Admin', file })).code, 409);
  assert.equal((await call(controller.submitPaymentCostSheet, { role: 'FAS' })).code, 409);
});

test('only Admin/Manager can unlock, with a reason; FS then corrects by re-importing', async () => {
  setup();
  const file = await xlsxFile();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file });
  await call(controller.submitPaymentCostSheet, { role: 'FAS' });

  assert.equal((await call(controller.unlockPaymentCostSheet, { role: 'FAS', body: { reason: 'typo in freight' } })).code, 403);
  assert.equal((await call(controller.unlockPaymentCostSheet, { role: 'Purchase', body: { reason: 'typo in freight' } })).code, 403);
  assert.equal((await call(controller.unlockPaymentCostSheet, { role: 'Admin', body: {} })).code, 400);

  const unlocked = await call(controller.unlockPaymentCostSheet, { role: 'Admin', body: { reason: 'typo in freight' } });
  assert.equal(unlocked.code, 200);
  assert.equal(unlocked.body.sheet.status, 'draft');
  assert.equal(unlocked.body.sheet.unlockReason, 'typo in freight');

  const again = await call(controller.importPaymentCostSheet, { role: 'FAS', file });
  assert.equal(again.code, 200);
  const log = (await call(controller.getPaymentCostSheetHistory, { role: 'FAS' })).body;
  assert.equal(log.items[0].action, 'reimport');
  assert.deepEqual(log.items.map((h) => h.action).reverse(), ['import', 'submit', 'unlock', 'reimport']);
});

test('unlocking a sheet that is not locked is a 400; submit without an import is a 400', async () => {
  setup();
  assert.equal((await call(controller.submitPaymentCostSheet, { role: 'FAS' })).code, 400);
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await xlsxFile() });
  assert.equal((await call(controller.unlockPaymentCostSheet, { role: 'Admin', body: { reason: 'because' } })).code, 400);
});

test('view returns permissions and the sheet; Excel download rebuilds a workbook', async () => {
  setup();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await xlsxFile() });
  const view = await call(controller.getPaymentCostSheet, { role: 'FAS' });
  assert.equal(view.code, 200);
  assert.deepEqual(view.body.permissions, { canImport: true, canSubmit: true, canUnlock: false });
  const adminView = await call(controller.getPaymentCostSheet, { role: 'Admin' });
  assert.equal(adminView.body.permissions.canUnlock, true);

  const dl = await call(controller.downloadPaymentCostSheetExcel, { role: 'FAS', query: { source: 'original' } });
  assert.equal(dl.code, 200);
  assert.match(dl.headers['Content-Disposition'], /payment-costing-RHST-0001_PO01-0001-original\.xlsx/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dl.sent);
  assert.equal(wb.worksheets[0].getCell('B2').value, 575);
  assert.equal(wb.worksheets[0].getCell('B3').formula, 'SUM(B2:B2)');
  assert.equal((await call(controller.getPaymentCostSheet, { role: 'Purchase' })).code, 403);
});

// ---- Dynamic cost lines ---------------------------------------------------------------------------

// A cost sheet with `count` numbered lines, a TOTAL row and an unrelated stream below it (must be ignored).
const costTableFile = async (count) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('COST');
  ws.getCell('B2').value = 'Date'; ws.getCell('C2').value = new Date('2026-07-22');
  ws.getCell('B3').value = 'GRV No.'; ws.getCell('C3').value = 'GRN01/26/01514';
  ['SN.', 'Description', 'Cost DH', 'Bill Ref.', 'Bill Ref.', 'Payment Ref./Remarks', 'Borne By RHGT', 'Borne by Silal']
    .forEach((h, i) => { ws.getCell(5, i + 1).value = h; });
  for (let n = 1; n <= count; n += 1) {
    const r = 5 + n;
    ws.getCell(r, 1).value = n;
    ws.getCell(r, 2).value = `Charge ${n}`;
    ws.getCell(r, 3).value = n * 10;
    ws.getCell(r, 4).value = `INV-${n}`;
    ws.getCell(r, 5).value = 'VENDOR';
    ws.getCell(r, 6).value = 'PC';
    ws.getCell(r, 7).value = { formula: `C${r}`, result: n * 10 };
    ws.getCell(r, 8).value = { formula: `C${r}-G${r}`, result: 0 };
  }
  const total = 6 + count;
  ws.getCell(total, 2).value = 'TOTAL';
  ws.getCell(total + 3, 1).value = 1; ws.getCell(total + 3, 2).value = 'PR11 Steam Rice'; ws.getCell(total + 3, 3).value = 1000;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, size: buffer.length, originalname: 'costing.xlsx' };
};

const sumTo = (n) => (n * (n + 1) / 2) * 10;

test('line count is dynamic: 36, 37 and 3 lines import exactly as many lines, never the stream below TOTAL', async () => {
  for (const count of [36, 37, 3]) {
    setup();
    const res = await call(controller.importPaymentCostSheet, { role: 'FAS', file: await costTableFile(count) });
    assert.equal(res.code, 201, JSON.stringify(res.body));
    assert.equal(res.body.sheet.lines.length, count);
    assert.equal(res.body.sheet.totals.count, count);
    assert.equal(res.body.sheet.totals.costDh, sumTo(count));
    assert.equal(res.body.sheet.totals.borneByRhgt, sumTo(count));
    assert.equal(res.body.sheet.totals.borneBySilal, 0);
    assert.ok(!res.body.sheet.lines.some((l) => /PR11/.test(l.description)));
    assert.equal(res.body.sheet.lines[0].billRefNo, 'INV-1');
    assert.equal(res.body.sheet.lines[0].paymentReference, 'PC');
  }
});

test('a sheet without a cost table still imports; the response warns and has no lines', async () => {
  setup();
  const res = await call(controller.importPaymentCostSheet, { role: 'FAS', file: await xlsxFile() });
  assert.equal(res.code, 201);
  assert.equal(res.body.sheet.lines.length, 0);
  assert.match(res.body.warnings?.[0] || res.body.sheet.warnings[0], /Could not find the cost table/);
  const save = await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: [] } });
  assert.equal(save.code, 400);
});

test('editing lines: FS saves, totals and history update, Purchase gets 403', async () => {
  setup();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await costTableFile(37) });
  const lines = (await call(controller.getPaymentCostSheet, { role: 'FAS' })).body.sheet.lines;
  const edited = lines.map((l) => ({ ...l }));
  edited[1].costDh = 500; edited[1].borneByRhgt = 300; edited[1].borneBySilal = 200; edited[1].remarks = 'split';

  assert.equal((await call(controller.savePaymentCostLines, { role: 'Purchase', body: { lines: edited } })).code, 403);
  const saved = await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: edited } });
  assert.equal(saved.code, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.sheet.lines.length, 37);
  assert.equal(saved.body.sheet.lines[1].remarks, 'split');
  assert.equal(saved.body.sheet.totals.costDh, sumTo(37) - 20 + 500);
  assert.equal(store[0].lines[1].borneBySilal, 200);

  const log = (await call(controller.getPaymentCostSheetHistory, { role: 'FAS' })).body;
  assert.equal(log.items[0].action, 'edit');
  assert.equal(log.items[0].note, 'Line 2 changed');

  const noChange = await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: saved.body.sheet.lines } });
  assert.equal(noChange.body.message, 'No changes to save.');
  assert.equal((await call(controller.getPaymentCostSheetHistory, { role: 'FAS' })).body.total, 2);
});

test('editing lines is validated: borne-by must add up, count and SNs are pinned to the sheet', async () => {
  setup();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await costTableFile(5) });
  const lines = (await call(controller.getPaymentCostSheet, { role: 'FAS' })).body.sheet.lines;

  const bad = lines.map((l) => ({ ...l })); bad[0].borneByRhgt = 1;
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: bad } })).code, 400);
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: lines.slice(1) } })).code, 400);
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: [...lines, { sn: 6 }] } })).code, 400);
  const resn = lines.map((l) => ({ ...l })); resn[2].sn = 99;
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: resn } })).code, 400);
  const nan = lines.map((l) => ({ ...l })); nan[0].costDh = 'abc';
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: nan } })).code, 400);
  assert.equal(store[0].lines.length, 5);
});

test('a locked sheet refuses line edits with 409; unlocking allows them again', async () => {
  setup();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await costTableFile(4) });
  const lines = (await call(controller.getPaymentCostSheet, { role: 'FAS' })).body.sheet.lines;
  await call(controller.submitPaymentCostSheet, { role: 'FAS' });
  const edited = lines.map((l) => ({ ...l, remarks: 'late' }));
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: edited } })).code, 409);
  assert.equal((await call(controller.savePaymentCostLines, { role: 'Admin', body: { lines: edited } })).code, 409);
  await call(controller.unlockPaymentCostSheet, { role: 'Admin', body: { reason: 'fix remarks' } });
  assert.equal((await call(controller.savePaymentCostLines, { role: 'FAS', body: { lines: edited } })).code, 200);
});

test('import log is paginated, newest first', async () => {
  setup();
  const file = await costTableFile(2);
  await call(controller.importPaymentCostSheet, { role: 'FAS', file });
  for (let i = 0; i < 11; i += 1) await call(controller.importPaymentCostSheet, { role: 'FAS', file }); // 12 rows
  const p1 = (await call(controller.getPaymentCostSheetHistory, { role: 'FAS', query: { page: '1', pageSize: '10' } })).body;
  assert.equal(p1.total, 12); assert.equal(p1.items.length, 10); assert.equal(p1.page, 1);
  const p2 = (await call(controller.getPaymentCostSheetHistory, { role: 'FAS', query: { page: '2', pageSize: '10' } })).body;
  assert.equal(p2.items.length, 2);
  assert.equal(p2.items[1].action, 'import'); // oldest row is last
  const past = (await call(controller.getPaymentCostSheetHistory, { role: 'FAS', query: { page: '9', pageSize: '10' } })).body;
  assert.equal(past.page, 2);
  assert.equal((await call(controller.getPaymentCostSheetHistory, { role: 'Purchase' })).code, 403);
});

test('Excel download is the edited lines + TOTAL for any count; ?source=original is the imported file', async () => {
  setup();
  await call(controller.importPaymentCostSheet, { role: 'FAS', file: await costTableFile(37) });
  const dl = await call(controller.downloadPaymentCostSheetExcel, { role: 'FAS' });
  assert.equal(dl.code, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dl.sent);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell('B5').value, 'Charge 1');
  assert.equal(ws.getCell('B41').value, 'Charge 37'); // 5 + 36
  assert.equal(ws.getCell('A42').value, 'TOTAL');
  assert.equal(ws.getCell('C42').formula, 'SUM(C5:C41)');
  assert.equal(ws.getCell('H42').formula, 'SUM(H5:H41)');
  const orig = await call(controller.downloadPaymentCostSheetExcel, { role: 'FAS', query: { source: 'original' } });
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(orig.sent);
  assert.equal(wb2.worksheets[0].getCell('B2').value, 'Date'); // header block kept in the original
});
