const test = require('node:test');
const assert = require('node:assert/strict');

const Container = require('../models/container.model');
const Shipment = require('../models/shipment.model');
const { permissionService } = require('../core/services/permissionService');
const approvals = require('./shipment-approvals.controller');
const { isPendingFsApproval } = require('./shipment-preamble.helpers');

const makeRes = () => {
  const res = { code: 200 };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const makeContainer = (status) => ({
  _id: 'c1',
  shipmentId: 's1',
  actual: { paymentAllocationApproval: { status }, paymentAllocations: [{ requestAmount: 10, paidAmount: 10 }] },
  toObject() { return JSON.parse(JSON.stringify({ actual: this.actual })); },
  async save() {},
});

const run = async (role, status) => {
  Container.findById = async () => makeContainer(status);
  Container.find = () => ({ select: () => ({ lean: async () => [] }), lean: async () => [], sort: () => ({ lean: async () => [] }) });
  Container.updateMany = async () => ({});
  Shipment.findById = async () => null;
  permissionService.hasPermissionKey = async () => false;
  const res = makeRes();
  await approvals.approvePaymentAllocation({ params: { id: 'c1' }, user: { _id: '000000000000000000000001', role } }, res);
  return res;
};

test('isPendingFsApproval accepts new and legacy pending values only', () => {
  assert.equal(isPendingFsApproval('pending_fas'), true);
  assert.equal(isPendingFsApproval('pending_fas_manager'), true);
  assert.equal(isPendingFsApproval('approved'), false);
  assert.equal(isPendingFsApproval('draft'), false);
});

test('FAS approves a legacy pending_fas_manager row directly', async () => {
  const res = await run('FAS', 'pending_fas_manager');
  assert.equal(res.code, 200, JSON.stringify(res.body));
});

test('FAS approves a new pending_fas row', async () => {
  const res = await run('FAS', 'pending_fas');
  assert.equal(res.code, 200, JSON.stringify(res.body));
});

test('FasManager, Purchase and Logistic cannot approve (FAS-only)', async () => {
  for (const role of ['FasManager', 'Purchase', 'Logistic']) {
    const res = await run(role, 'pending_fas');
    assert.equal(res.code, 403, `${role}: ${JSON.stringify(res.body)}`);
  }
});

test('already approved rows are rejected with 400', async () => {
  const res = await run('FAS', 'approved');
  assert.equal(res.code, 400);
});
