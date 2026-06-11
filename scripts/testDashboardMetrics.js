process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');

const { __test } = require('../src/controller/shipment.controller');

const { buildDashboardRStatusMetrics } = __test;

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

const tests = [
  runEntryStageCountsAsEtdUnconfirmedTest,
  runPlannedStageWithoutSplitDoesNotCountAsEntryTest,
  runEntryStageWithExpectedDateStillCountsAsEtdUnconfirmedTest,
  runPlannedStageWithScheduledDateCountsAsEtaDueTest,
  runMissingSplitCountStillCountsAsEtdUnconfirmedTest,
];

tests.forEach((test) => {
  test();
  console.log(`✓ ${test.name}`);
});

console.log(`Dashboard metric tests passed: ${tests.length}`);
process.exit(0);
