const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWarehouseDashboard, isSplitReceived } = require('./warehouse-dashboard.helpers');

const mkContainer = (allocations, splits, expectedContainers) => ({
  actual: {
    storageAllocationDecision: {
      itemAllocations: [{ itemName: 'Rice', expectedContainers, allocations }],
    },
    storageSplits: splits,
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
