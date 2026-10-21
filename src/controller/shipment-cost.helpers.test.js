const test = require('node:test');
const assert = require('node:assert/strict');
const { SHIPMENT_COST_COLUMNS, buildShipmentCostRows } = require('./shipment-cost.helpers');

const container = (id, blNo, allocations) => ({ _id: id, actual: { BLNo: blNo, paymentAllocations: allocations } });
const shipment = (id, shipmentNo, supplierName) => ({ _id: id, shipmentNo, supplierId: { name: supplierName } });
const byShipment = (entries) => new Map(entries);

const lines = [
  { sn: 1, description: 'Invoice Attestation - MOFAIC', paidAmount: 302.15 },
  { sn: 2, description: 'Admin fee', paidAmount: 105 },
  { sn: 3, description: 'Haulage charges', paidAmount: 0 },
];

test('columns put the BL No, Description and Actual Paid trio in the report', () => {
  const keys = SHIPMENT_COST_COLUMNS.map((c) => c.key);
  assert.deepEqual(keys, ['slNo', 'shipmentNo', 'supplier', 'blNo', 'description', 'actualPaid']);
});

test('one row per cost line with Actual Paid above 0, zeros dropped', () => {
  const { rows, totalActualPaid } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'DRRK FOODS')],
    byShipment([['s1', [container('c1', 'BAXISM030823', lines)]]])
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    slNo: 1, shipmentNo: 'RHST-1', supplier: 'DRRK FOODS', blNo: 'BAXISM030823',
    description: 'Invoice Attestation - MOFAIC', actualPaid: 302.15,
  });
  assert.equal(rows[1].description, 'Admin fee');
  assert.equal(totalActualPaid, 407.15);
});

test('containers sharing a BL (case and spaces ignored) count once', () => {
  const { rows, totalActualPaid } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'A')],
    byShipment([['s1', [
      container('c1', 'BL-1', lines),
      container('c2', ' bl-1 ', lines),
      container('c3', 'BL-1', lines),
    ]]])
  );
  assert.equal(rows.length, 2);
  assert.equal(totalActualPaid, 407.15);
});

test('different BLs in one shipment each get their lines', () => {
  const { rows } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'A')],
    byShipment([['s1', [container('c1', 'BL-1', lines), container('c2', 'BL-2', lines)]]])
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.blNo), ['BL-1', 'BL-1', 'BL-2', 'BL-2']);
  assert.deepEqual(rows.map((r) => r.slNo), [1, 2, 3, 4]);
});

test('containers without a BL No are not merged with each other', () => {
  const { rows } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'A')],
    byShipment([['s1', [container('c1', '', lines), container('c2', '', lines)]]])
  );
  assert.equal(rows.length, 4);
  assert.equal(rows[0].blNo, '');
});

test('same BL on two different shipments is kept for both', () => {
  const { rows } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'A'), shipment('s2', 'RHST-2', 'B')],
    byShipment([
      ['s1', [container('c1', 'BL-1', lines)]],
      ['s2', [container('c2', 'BL-1', lines)]],
    ])
  );
  assert.deepEqual(rows.map((r) => r.shipmentNo), ['RHST-1', 'RHST-1', 'RHST-2', 'RHST-2']);
});

test('shipments or containers with no saved allocations produce no rows; null and bad amounts are dropped', () => {
  const { rows, totalActualPaid } = buildShipmentCostRows(
    [shipment('s1', 'RHST-1', 'A'), shipment('s2', 'RHST-2', 'B'), shipment('s3', 'RHST-3', 'C')],
    byShipment([
      ['s1', [container('c1', 'BL-1', [])]],
      ['s2', [container('c2', 'BL-2', [{ sn: 1, description: 'Freight', paidAmount: null }, { sn: 2, description: 'X', paidAmount: 'abc' }])]],
    ])
  );
  assert.equal(rows.length, 0);
  assert.equal(totalActualPaid, 0);
});

test('lines keep the saved sn order and amounts round to 2 decimals', () => {
  const { rows } = buildShipmentCostRows(
    [{ _id: 's1', shipmentNo: 'RHST-1', supplierName: 'Fallback Name' }],
    byShipment([['s1', [container('c1', 'BL-1', [
      { sn: 2, description: 'Second', paidAmount: 10.005 },
      { sn: 1, description: 'First', paidAmount: 1.1 },
    ])]]])
  );
  assert.deepEqual(rows.map((r) => r.description), ['First', 'Second']);
  assert.equal(rows[1].actualPaid, 10.01);
  assert.equal(rows[0].supplier, 'Fallback Name');
});
