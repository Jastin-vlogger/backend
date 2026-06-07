const assert = require('node:assert/strict');

const {
  syncSameBlActualFieldsInMemory,
  syncSameBlOrSameShipmentActualFieldsInMemory,
  hydrateMissingSameBlActualFieldsInMemory,
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  SAME_BL_INHERIT_FIELDS,
} = require('../src/core/utils/sameBlSync');

const makeContainer = (_id, BLNo, actual = {}, options = {}) => ({
  _id,
  shipmentId: options.shipmentId,
  status: options.status || 'Actual',
  actual: {
    BLNo,
    CLNo: BLNo,
    ...actual,
  },
});

const runClearingAdvanceSyncTest = () => {
  const sourceRows = [
    {
      sn: 1,
      description: 'DO Fee',
      defaultQty: 20,
      defaultRate: 125,
      requestAmount: 2500,
      paymentTo: 'Shipping line',
      paymentTerm: 'Cash',
      remarks: 'shared BL cost',
    },
  ];
  const approval = { status: 'pending', stage: 'FAS', submittedBy: 'user-1' };
  const containers = [
    makeContainer('source', ' MUNKLF26139815 ', {
      costSheetBookings: sourceRows,
      costSheetBookingDocumentUrl: 's3://doc-a.pdf',
      costSheetBookingDocumentName: 'doc-a.pdf',
      clearingAdvanceApproval: approval,
    }),
    makeContainer('same-bl', 'munklf26139815', {
      costSheetBookings: [{ description: 'old' }],
    }),
    makeContainer('different-bl', 'MUNKLF99999999', {
      costSheetBookings: [{ description: 'keep me' }],
    }),
  ];

  syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: SAME_BL_CLEARING_ADVANCE_FIELDS,
  });

  assert.deepEqual(containers[1].actual.costSheetBookings, sourceRows);
  assert.equal(containers[1].actual.costSheetBookingDocumentUrl, 's3://doc-a.pdf');
  assert.deepEqual(containers[1].actual.clearingAdvanceApproval, approval);
  assert.deepEqual(containers[2].actual.costSheetBookings, [{ description: 'keep me' }]);

  containers[0].actual.costSheetBookings[0].remarks = 'source mutated later';
  assert.equal(containers[1].actual.costSheetBookings[0].remarks, 'shared BL cost');
};

const runClearingAdvanceSameShipmentDifferentBlSyncTest = () => {
  const sourceRows = [{ sn: 1, description: 'Same LPO clearance', requestAmount: 500 }];
  const containers = [
    makeContainer('source', 'BL-A', { costSheetBookings: sourceRows }, { shipmentId: 'lpo-1' }),
    makeContainer('same-lpo-different-bl', 'BL-B', { costSheetBookings: [] }, { shipmentId: 'lpo-1' }),
    makeContainer('same-lpo-planned', 'BL-C', { costSheetBookings: [] }, { shipmentId: 'lpo-1', status: 'Planned' }),
    makeContainer('different-lpo', 'BL-D', { costSheetBookings: [{ description: 'keep me' }] }, { shipmentId: 'lpo-2' }),
  ];

  syncSameBlOrSameShipmentActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: SAME_BL_CLEARING_ADVANCE_FIELDS,
  });

  assert.deepEqual(containers[1].actual.costSheetBookings, sourceRows);
  assert.deepEqual(containers[2].actual.costSheetBookings, []);
  assert.deepEqual(containers[3].actual.costSheetBookings, [{ description: 'keep me' }]);
};

const runPaymentAllocationSyncTest = () => {
  const paymentAllocations = [
    {
      sn: 1,
      description: 'Payment allocation row',
      requestAmount: 700,
      paidAmount: 300,
      paymentTo: 'Dubai customs',
      paymentTerm: 'Trans',
      reference: 'REF-1',
    },
  ];
  const containers = [
    makeContainer('source', 'MUNKLF26139815', { paymentAllocations }),
    makeContainer('same-bl', ' MUNKLF26139815 ', { paymentAllocations: [] }),
  ];

  syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  });

  assert.deepEqual(containers[1].actual.paymentAllocations, paymentAllocations);
};

const runPaymentAllocationSameShipmentDifferentBlSyncTest = () => {
  const paymentAllocations = [{ sn: 1, description: 'Same LPO payment', requestAmount: 900 }];
  const containers = [
    makeContainer('source', 'BL-A', { paymentAllocations }, { shipmentId: 'lpo-1' }),
    makeContainer('same-lpo-different-bl', 'BL-B', { paymentAllocations: [] }, { shipmentId: 'lpo-1' }),
    makeContainer('different-lpo', 'BL-C', { paymentAllocations: [{ description: 'keep me' }] }, { shipmentId: 'lpo-2' }),
  ];

  syncSameBlOrSameShipmentActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  });

  assert.deepEqual(containers[1].actual.paymentAllocations, paymentAllocations);
  assert.deepEqual(containers[2].actual.paymentAllocations, [{ description: 'keep me' }]);
};

const runClearingAdvanceApprovalSameShipmentSyncTest = () => {
  const approval = {
    status: 'approved',
    submittedBy: 'logistics-1',
    fasApprovedBy: 'fas-1',
  };
  const containers = [
    makeContainer('source', 'BL-A', { clearingAdvanceApproval: approval }, { shipmentId: 'lpo-1' }),
    makeContainer('same-lpo-different-bl', 'BL-B', { clearingAdvanceApproval: { status: 'pending_fas' } }, { shipmentId: 'lpo-1' }),
    makeContainer('different-lpo', 'BL-C', { clearingAdvanceApproval: { status: 'pending_fas' } }, { shipmentId: 'lpo-2' }),
  ];

  syncSameBlOrSameShipmentActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: ['clearingAdvanceApproval'],
  });

  assert.deepEqual(containers[1].actual.clearingAdvanceApproval, approval);
  assert.deepEqual(containers[2].actual.clearingAdvanceApproval, { status: 'pending_fas' });
};

const runDocumentTrackerSelectedFieldSyncTest = () => {
  const containers = [
    makeContainer('source', 'MUNKLF26139815', {
      courierTrackNo: 'DHL-123',
      courierServiceProvider: 'DHL',
      bankName: 'Source bank should not sync in this test',
    }),
    makeContainer('same-bl', 'MUNKLF26139815', {
      courierTrackNo: '',
      courierServiceProvider: '',
      bankName: 'Existing peer bank',
    }),
  ];

  syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: ['courierTrackNo', 'courierServiceProvider'],
  });

  assert.equal(containers[1].actual.courierTrackNo, 'DHL-123');
  assert.equal(containers[1].actual.courierServiceProvider, 'DHL');
  assert.equal(containers[1].actual.bankName, 'Existing peer bank');
};

const runDocumentTrackerBankSyncTest = () => {
  const containers = [
    makeContainer('source', 'MUNKLF26139815', {
      receiver: 'Bank',
      bankName: 'ADIB',
      expectedDocDate: '2026-06-25',
      courierTrackNo: 'DHL-source',
    }),
    makeContainer('same-bl', 'munklf26139815', {
      receiver: '',
      bankName: '',
      expectedDocDate: '',
      courierTrackNo: 'DHL-peer-keep',
    }),
    makeContainer('different-bl', 'OTHER-BL', {
      receiver: 'Direct',
      bankName: 'Keep Bank',
      expectedDocDate: '',
    }),
  ];

  syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: ['receiver', 'bankName', 'expectedDocDate'],
  });

  assert.equal(containers[1].actual.receiver, 'Bank');
  assert.equal(containers[1].actual.bankName, 'ADIB');
  assert.equal(containers[1].actual.expectedDocDate, '2026-06-25');
  assert.equal(containers[1].actual.courierTrackNo, 'DHL-peer-keep');
  assert.equal(containers[2].actual.bankName, 'Keep Bank');
};

const runDocumentTrackerDocumentFieldSyncTest = () => {
  const containers = [
    makeContainer('source', 'MUNKLF26139815', {
      inwardCollectionAdviceDate: '2026-06-10',
      inwardCollectionAdviceDocumentUrl: 's3://inward.pdf',
      inwardCollectionAdviceDocumentName: 'inward.pdf',
      murabahaContractSubmittedDate: '2026-06-11',
      murabahaContractSubmittedDocumentUrl: 's3://murabaha.pdf',
      murabahaContractSubmittedDocumentName: 'murabaha.pdf',
      documentsReleasedDate: '2026-06-12',
      documentsReleasedDocumentUrl: 's3://release.pdf',
      documentsReleasedDocumentName: 'release.pdf',
      bankName: 'Source bank not in payload',
    }),
    makeContainer('same-bl', ' MUNKLF26139815 ', {
      inwardCollectionAdviceDocumentUrl: '',
      murabahaContractSubmittedDocumentUrl: '',
      documentsReleasedDocumentUrl: '',
      bankName: 'Peer bank keep',
    }),
    makeContainer('different-bl', 'OTHER-BL', {
      inwardCollectionAdviceDocumentUrl: 's3://keep.pdf',
      bankName: 'Other bank keep',
    }),
  ];

  syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: [
      'inwardCollectionAdviceDate',
      'inwardCollectionAdviceDocumentUrl',
      'inwardCollectionAdviceDocumentName',
      'murabahaContractSubmittedDate',
      'murabahaContractSubmittedDocumentUrl',
      'murabahaContractSubmittedDocumentName',
      'documentsReleasedDate',
      'documentsReleasedDocumentUrl',
      'documentsReleasedDocumentName',
    ],
  });

  assert.equal(containers[1].actual.inwardCollectionAdviceDocumentUrl, 's3://inward.pdf');
  assert.equal(containers[1].actual.murabahaContractSubmittedDocumentName, 'murabaha.pdf');
  assert.equal(containers[1].actual.documentsReleasedDocumentUrl, 's3://release.pdf');
  assert.equal(containers[1].actual.bankName, 'Peer bank keep');
  assert.equal(containers[2].actual.inwardCollectionAdviceDocumentUrl, 's3://keep.pdf');
  assert.equal(containers[2].actual.bankName, 'Other bank keep');
};

const runHydrateNewSameBlTest = () => {
  const costSheetBookings = [{ sn: 1, description: 'Inherited cost', requestAmount: 10 }];
  const paymentAllocations = [{ sn: 1, description: 'Inherited payment', requestAmount: 20 }];
  const containers = [
    makeContainer('existing', 'MUNKLF26139815', {
      costSheetBookings,
      paymentAllocations,
    }),
    makeContainer('new-upload', 'MUNKLF26139815'),
  ];

  const hydratedFields = hydrateMissingSameBlActualFieldsInMemory({
    containers,
    targetId: 'new-upload',
    fields: SAME_BL_INHERIT_FIELDS,
  });

  assert(hydratedFields.includes('costSheetBookings'));
  assert(hydratedFields.includes('paymentAllocations'));
  assert.deepEqual(containers[1].actual.costSheetBookings, costSheetBookings);
  assert.deepEqual(containers[1].actual.paymentAllocations, paymentAllocations);
};

const runDocumentTrackerBlNumberChangeSyncTest = () => {
  const containers = [
    makeContainer('source', 'NEW-BL', {
      CLNo: 'NEW-BL',
      courierTrackNo: 'DHL-NEW',
    }),
    makeContainer('old-peer', 'OLD-BL', {
      CLNo: 'OLD-BL',
      courierTrackNo: 'DHL-OLD',
    }),
    makeContainer('new-peer', 'NEW-BL', {
      CLNo: 'NEW-BL',
      courierTrackNo: '',
    }),
  ];

  ['OLD-BL', 'NEW-BL'].forEach((matchBlNo) => {
    syncSameBlActualFieldsInMemory({
      containers,
      sourceId: 'source',
      fields: ['BLNo', 'CLNo', 'courierTrackNo'],
      matchBlNo,
    });
  });

  assert.equal(containers[1].actual.BLNo, 'NEW-BL');
  assert.equal(containers[1].actual.CLNo, 'NEW-BL');
  assert.equal(containers[1].actual.courierTrackNo, 'DHL-NEW');
  assert.equal(containers[2].actual.BLNo, 'NEW-BL');
  assert.equal(containers[2].actual.courierTrackNo, 'DHL-NEW');
};

const runBlankBlDoesNotSyncTest = () => {
  const containers = [
    makeContainer('source', '   ', { paymentAllocations: [{ description: 'do not copy' }] }),
    makeContainer('target', '   ', { paymentAllocations: [{ description: 'keep blank BL isolated' }] }),
  ];

  const updated = syncSameBlActualFieldsInMemory({
    containers,
    sourceId: 'source',
    fields: SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  });

  assert.deepEqual(updated, []);
  assert.deepEqual(containers[1].actual.paymentAllocations, [{ description: 'keep blank BL isolated' }]);
};

const tests = [
  runClearingAdvanceSyncTest,
  runClearingAdvanceSameShipmentDifferentBlSyncTest,
  runPaymentAllocationSyncTest,
  runPaymentAllocationSameShipmentDifferentBlSyncTest,
  runClearingAdvanceApprovalSameShipmentSyncTest,
  runDocumentTrackerSelectedFieldSyncTest,
  runDocumentTrackerBankSyncTest,
  runDocumentTrackerDocumentFieldSyncTest,
  runHydrateNewSameBlTest,
  runDocumentTrackerBlNumberChangeSyncTest,
  runBlankBlDoesNotSyncTest,
];

tests.forEach((test) => {
  test();
  console.log(`✓ ${test.name}`);
});

console.log(`Same-BL sync tests passed: ${tests.length}`);
