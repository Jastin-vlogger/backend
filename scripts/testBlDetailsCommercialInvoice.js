process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');

const { __test } = require('../src/controller/shipment.controller');
const {
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  SAME_BL_DOCUMENT_TRACKER_FIELDS,
  SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
} = require('../src/core/utils/sameBlSync');

const { applyCommercialInvoiceDocumentUpload } = __test;

const runCommercialInvoiceUploadAssignmentTest = () => {
  const actual = {
    commercialInvoiceNo: 'DRRK/3559',
  };

  applyCommercialInvoiceDocumentUpload(actual, {
    url: 's3://shipments/bl-details/commercial-invoice/invoice.pdf',
    fileName: 'invoice.pdf',
  });

  assert.equal(actual.commercialInvoiceNo, 'DRRK/3559');
  assert.equal(actual.commercialInvoiceDocumentUrl, 's3://shipments/bl-details/commercial-invoice/invoice.pdf');
  assert.equal(actual.commercialInvoiceDocumentName, 'invoice.pdf');
};

const runCommercialInvoiceNotSameBlSyncedTest = () => {
  const syncedFields = [
    ...SAME_BL_CLEARING_ADVANCE_FIELDS,
    ...SAME_BL_PAYMENT_ALLOCATION_FIELDS,
    ...SAME_BL_DOCUMENT_TRACKER_FIELDS,
    ...SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
  ];

  assert.equal(syncedFields.includes('commercialInvoiceDocumentUrl'), false);
  assert.equal(syncedFields.includes('commercialInvoiceDocumentName'), false);
};

const tests = [
  runCommercialInvoiceUploadAssignmentTest,
  runCommercialInvoiceNotSameBlSyncedTest,
];

tests.forEach((test) => {
  test();
  console.log(`✓ ${test.name}`);
});

console.log(`B/L commercial invoice tests passed: ${tests.length}`);
process.exit(0);
