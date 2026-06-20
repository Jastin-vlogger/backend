process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');

const { __test } = require('../src/controller/shipment.controller');

const { buildDashboardRStatusMetrics, buildDashboardStatusPivot, normalizeDpwCargoExtraction } = __test;

const metricValue = (metrics, label) => metrics.find((metric) => metric.label === label)?.value;

const buildMap = (entries = []) => new Map(entries.map(([shipmentId, containers]) => [shipmentId, containers]));

const runEntryStageCountsAsEtdUnconfirmedTest = () => {
  const shipments = [
    {
      _id: 'lpo-entry',
      currentStage: 'Shipment Entry',
      plannedETD: null,
      plannedETA: null,
    },
  ];

  const metrics = buildDashboardRStatusMetrics(shipments, buildMap());

  assert.equal(metricValue(metrics, 'Total LPO'), 1);
  assert.equal(metricValue(metrics, 'Open LPO'), 1);
  assert.equal(metricValue(metrics, 'Total Shipments'), 1);
  assert.equal(metricValue(metrics, 'ETD Yet To Be Confirmed'), 1);
  assert.equal(metricValue(metrics, 'ETA Yet To Due'), 0);
};

const runPlannedStageWithoutSplitDoesNotCountAsEntryTest = () => {
  const shipments = [
    {
      _id: 'lpo-planned',
      currentStage: 'Planned Split',
      plannedETD: null,
      plannedETA: null,
    },
  ];

  const metrics = buildDashboardRStatusMetrics(shipments, buildMap());

  assert.equal(metricValue(metrics, 'Total LPO'), 1);
  assert.equal(metricValue(metrics, 'Open LPO'), 1);
  assert.equal(metricValue(metrics, 'Total Shipments'), 0);
  assert.equal(metricValue(metrics, 'ETD Yet To Be Confirmed'), 0);
};

const runEntryStageWithExpectedDateStillCountsAsEtdUnconfirmedTest = () => {
  const shipments = [
    {
      _id: 'lpo-scheduled',
      currentStage: 'Shipment Entry',
      plannedETD: new Date('2026-06-20T00:00:00.000Z'),
      plannedETA: null,
      noOfShipments: 1,
    },
  ];

  const metrics = buildDashboardRStatusMetrics(shipments, buildMap([
    ['lpo-scheduled', [
      {
        _id: 'container-scheduled',
        planned: { etd: new Date('2026-06-20T00:00:00.000Z') },
        actual: {},
      },
    ]],
  ]));

  assert.equal(metricValue(metrics, 'Total Shipments'), 1);
  assert.equal(metricValue(metrics, 'ETD Yet To Be Confirmed'), 1);
  assert.equal(metricValue(metrics, 'ETA Yet To Due'), 0);
};

const runPlannedStageWithScheduledDateCountsAsEtaDueTest = () => {
  const shipments = [
    {
      _id: 'lpo-scheduled',
      currentStage: 'Planned Split',
      plannedETD: new Date('2026-06-20T00:00:00.000Z'),
      plannedETA: null,
      noOfShipments: 1,
    },
  ];

  const metrics = buildDashboardRStatusMetrics(shipments, buildMap([
    ['lpo-scheduled', [
      {
        _id: 'container-scheduled',
        planned: { etd: new Date('2026-06-20T00:00:00.000Z') },
        actual: {},
      },
    ]],
  ]));

  assert.equal(metricValue(metrics, 'Total Shipments'), 1);
  assert.equal(metricValue(metrics, 'ETD Yet To Be Confirmed'), 0);
  assert.equal(metricValue(metrics, 'ETA Yet To Due'), 1);
};

const runMissingSplitCountStillCountsAsEtdUnconfirmedTest = () => {
  const shipments = [
    {
      _id: 'lpo-split',
      currentStage: 'Planned Split',
      noOfShipments: 3,
    },
  ];

  const metrics = buildDashboardRStatusMetrics(shipments, buildMap());

  assert.equal(metricValue(metrics, 'Total Shipments'), 3);
  assert.equal(metricValue(metrics, 'ETD Yet To Be Confirmed'), 3);
};

const runStatusPivotIncludesFclTotalsTest = () => {
  const shipments = [
    {
      _id: 'lpo-fcl',
      currentStage: 'Planned Split',
      supplierName: 'Supplier A',
      itemDescription: 'Rice',
      plannedQtyMT: 40,
      fcl: 4,
      plannedETD: null,
    },
  ];

  const pivot = buildDashboardStatusPivot(shipments, buildMap([
    ['lpo-fcl', [
      {
        _id: 'container-a',
        planned: { qtyMT: 20, FCL: 2 },
        actual: {},
      },
      {
        _id: 'container-b',
        planned: { qtyMT: 20, FCL: 2 },
        actual: {},
      },
    ]],
  ]));

  assert.equal(pivot.grandTotal, 40);
  assert.equal(pivot.grandTotalFCL, 4);
  const unconfirmedColumn = pivot.columns.find((column) => column.toLowerCase().includes('etd yet'));
  assert.equal(pivot.totalsFCL[unconfirmedColumn], 4);
  assert.equal(pivot.rows[0].grandTotalFCL, 4);
};

const runDpwCargoNormalizationTest = () => {
  const normalized = normalizeDpwCargoExtraction({
    receipt_no: 'R-123',
    pages_processed: 3,
    total_containers: 2,
    containers: [
      { container: 'ABCD1234567', from_date: '2026-06-01', to_date: '2026-06-10' },
      { container_no: 'WXYZ7654321', from: null, to: null },
    ],
    metadata: { model: 'test' },
  });

  assert.equal(normalized.receiptNo, 'R-123');
  assert.equal(normalized.pagesProcessed, 3);
  assert.equal(normalized.totalContainers, 2);
  assert.deepEqual(normalized.containers[0], {
    container: 'ABCD1234567',
    from: '2026-06-01',
    to: '2026-06-10',
  });
  assert.deepEqual(normalized.containers[1], {
    container: 'WXYZ7654321',
    from: null,
    to: null,
  });
};

const tests = [
  runEntryStageCountsAsEtdUnconfirmedTest,
  runPlannedStageWithoutSplitDoesNotCountAsEntryTest,
  runEntryStageWithExpectedDateStillCountsAsEtdUnconfirmedTest,
  runPlannedStageWithScheduledDateCountsAsEtaDueTest,
  runMissingSplitCountStillCountsAsEtdUnconfirmedTest,
  runStatusPivotIncludesFclTotalsTest,
  runDpwCargoNormalizationTest,
];

tests.forEach((test) => {
  test();
  console.log(`✓ ${test.name}`);
});

console.log(`Dashboard metric tests passed: ${tests.length}`);
process.exit(0);
