const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWarehouseDashboard, isSplitReceived } = require('./warehouse-dashboard.helpers');

const mkContainer = (allocations, splits, expectedContainers, approvalStatus = 'approved') => ({
  actual: {
    storageAllocationDecision: {
      itemAllocations: [{ itemName: 'Rice', expectedContainers, allocations }],
    },
    storageSplits: splits,
    storageAllocationApproval: { status: approvalStatus },
  },
});

test('aggregates allocated/received per warehouse with progress', () => {
  const containers = [
    mkContainer(
      [{ warehouse: 'AL AIN', containersAssigned: 120 }],
      [
        ...Array.from({ length: 90 }, () => ({ warehouse: 'AL AIN', grn: 'G1', receivedOnDate: new Date() })),
      ],
      120
    ),
    mkContainer(
      [{ warehouse: 'DIC', containersAssigned: 116 }],
      [
        ...Array.from({ length: 108 }, () => ({ warehouse: 'DIC', batch: 'B1' })),
      ],
      116
    ),
  ];
  const d = buildWarehouseDashboard(containers);
  const alain = d.byWarehouse.find((w) => w.warehouse === 'AL AIN');
  const dic = d.byWarehouse.find((w) => w.warehouse === 'DIC');
  assert.equal(alain.allocated, 120);
  assert.equal(alain.received, 90);
  assert.equal(alain.pendingReceiving, 30);
  assert.equal(alain.progress, 75);
  assert.equal(dic.allocated, 116);
  assert.equal(dic.received, 108);
  assert.equal(dic.pendingReceiving, 8);
  assert.equal(dic.progress, round2(108 / 116 * 100));
});

function round2(n) { return Math.round(n * 100) / 100; }

test('allocationStatus computes pending allocation from expected vs allocated', () => {
  // expected 200, allocated 120 -> pending allocation 80
  const containers = [mkContainer([{ warehouse: 'AL AIN', containersAssigned: 120 }], [], 200)];
  const d = buildWarehouseDashboard(containers);
  assert.equal(d.allocationStatus.allocated, 120);
  assert.equal(d.allocationStatus.pendingAllocation, 80);
  assert.equal(d.allocationStatus.total, 200);
  assert.equal(d.allocationStatus.allocatedPct, 60);
});

test('receivingStatus computes received vs allocated', () => {
  const containers = [
    mkContainer(
      [{ warehouse: 'AL AIN', containersAssigned: 100 }],
      Array.from({ length: 77 }, () => ({ warehouse: 'AL AIN', grn: 'G' })),
      100
    ),
  ];
  const d = buildWarehouseDashboard(containers);
  assert.equal(d.receivingStatus.allocated, 100);
  assert.equal(d.receivingStatus.received, 77);
  assert.equal(d.receivingStatus.pendingReceiving, 23);
  assert.equal(d.receivingStatus.receivedPct, 77);
});

test('falls back to storageAllocations rows when no itemAllocations', () => {
  const containers = [{
    actual: {
      storageAllocations: [
        { warehouse: 'SAJAA' }, { warehouse: 'SAJAA' }, { warehouse: 'MUSAFFEH' },
      ],
      storageSplits: [{ warehouse: 'SAJAA', grn: 'G' }],
    },
  }];
  const d = buildWarehouseDashboard(containers);
  const sajaa = d.byWarehouse.find((w) => w.warehouse === 'SAJAA');
  assert.equal(sajaa.allocated, 2);
  assert.equal(sajaa.received, 1);
});

test('isSplitReceived: true only with grn/batch/receivedOnDate', () => {
  assert.equal(isSplitReceived({ grn: 'G1' }), true);
  assert.equal(isSplitReceived({ batch: 'B1' }), true);
  assert.equal(isSplitReceived({ receivedOnDate: new Date() }), true);
  assert.equal(isSplitReceived({}), false);
  assert.equal(isSplitReceived({ warehouse: 'AL AIN' }), false);
});

test('empty input yields zeroed dashboard', () => {
  const d = buildWarehouseDashboard([]);
  assert.equal(d.allocationStatus.total, 0);
  assert.equal(d.receivingStatus.received, 0);
  assert.deepEqual(d.byWarehouse, []);
});

test('dbWarehouses seeds byWarehouse but filters out 0-allocation warehouses', () => {
  const dbWarehouses = [
    { name: 'SHARJAH', code: 'SHJ' },
    { name: 'AL AIN', code: 'AAN' },
  ];
  // Only AL AIN has container data; SHARJAH has none yet.
  const containers = [
    mkContainer([{ warehouse: 'AL AIN - AAN', containersAssigned: 10 }], [], 10),
  ];
  const d = buildWarehouseDashboard(containers, dbWarehouses);
  const sharjah = d.byWarehouse.find((w) => w.warehouse === 'SHARJAH - SHJ');
  const alain = d.byWarehouse.find((w) => w.warehouse === 'AL AIN - AAN');
  assert.equal(sharjah, undefined, 'SHARJAH should be excluded since it has 0 allocations');
  assert.ok(alain, 'AL AIN should appear with its allocations');
  assert.equal(alain.allocated, 10);
});

test('dbWarehouses with no code uses just the name as label (when allocated > 0)', () => {
  const dbWarehouses = [{ name: 'MUSAFFAH', code: '' }];
  const containers = [
    mkContainer([{ warehouse: 'MUSAFFAH', containersAssigned: 5 }], [], 5),
  ];
  const d = buildWarehouseDashboard(containers, dbWarehouses);
  const row = d.byWarehouse.find((w) => w.warehouse === 'MUSAFFAH');
  assert.ok(row);
  assert.equal(row.allocated, 5);
});

test('stale container warehouse strings are ignored when dbWarehouses supplied', () => {
  const dbWarehouses = [{ name: 'AL AIN', code: 'AL AIN' }];
  const containers = [
    // Valid warehouse (matches db)
    mkContainer([{ warehouse: 'AL AIN - AL AIN', containersAssigned: 50 }], [], 50),
    // Stale / removed warehouse — should be ignored
    mkContainer([{ warehouse: 'SHARJAH - SAJAH', containersAssigned: 30 }], [], 30),
    mkContainer([{ warehouse: 'Sharjah Block C - 0039 - Sharjah', containersAssigned: 10 }], [], 10),
  ];
  const d = buildWarehouseDashboard(containers, dbWarehouses);
  assert.equal(d.byWarehouse.length, 1, 'only known warehouses should appear');
  assert.equal(d.byWarehouse[0].warehouse, 'AL AIN - AL AIN');
  assert.equal(d.byWarehouse[0].allocated, 50);
  assert.equal(d.allocationStatus.allocated, 50, 'stale allocations excluded from totals');
});

test('draft storage allocations are ignored from allocated counts but counted as pending', () => {
  const containers = [
    // Draft allocation of 10 FCL with expected 10
    mkContainer([{ warehouse: 'AL AIN', containersAssigned: 10 }], [], 10, 'draft'),
    // Approved allocation of 5 FCL with expected 5
    mkContainer([{ warehouse: 'DIC', containersAssigned: 5 }], [], 5, 'approved'),
  ];
  const d = buildWarehouseDashboard(containers);
  // Total allocated should only be 5 (from DIC, AL AIN is draft)
  assert.equal(d.allocationStatus.allocated, 5);
  // Total expected is 15 (10 expected for AL AIN + 5 expected for DIC)
  assert.equal(d.allocationStatus.total, 15);
  // Pending allocation should be 10 (15 expected - 5 allocated)
  assert.equal(d.allocationStatus.pendingAllocation, 10);
});

