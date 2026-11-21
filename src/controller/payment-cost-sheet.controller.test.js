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

const call = async (fn, { role, body, file } = {}) => {
  const res = { code: 200, headers: {} };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.sent = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  await fn({ params: { containerId: CONTAINER_ID }, body: body || {}, file, user: { _id: '65f000000000000000000009', name: `${role} user`, role } }, res);
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
  assert.equal(ok.body.sheet.history[0].action, 'import');
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
  assert.equal(again.body.sheet.history[0].action, 'reimport');
  assert.deepEqual(again.body.sheet.history.map((h) => h.action).reverse(), ['import', 'submit', 'unlock', 'reimport']);
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

  const dl = await call(controller.downloadPaymentCostSheetExcel, { role: 'FAS' });
  assert.equal(dl.code, 200);
  assert.match(dl.headers['Content-Disposition'], /payment-costing-RHST-0001_PO01-0001\.xlsx/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dl.sent);
  assert.equal(wb.worksheets[0].getCell('B2').value, 575);
  assert.equal(wb.worksheets[0].getCell('B3').formula, 'SUM(B2:B2)');
  assert.equal((await call(controller.getPaymentCostSheet, { role: 'Purchase' })).code, 403);
});
