const test = require('node:test');
const assert = require('node:assert/strict');
const { mapFasDocumentTrackingRow, FAS_DOC_TRACKING_COLUMNS, isBankReceiver, computeFasDocumentStatus, classifyFasReceiver } = require('./fas-report.helpers');

const idDate = (d) => (d ? String(d) : '');

test('Point 2: has the 21 report columns', () => {
  assert.equal(FAS_DOC_TRACKING_COLUMNS.length, 21);
  assert.equal(FAS_DOC_TRACKING_COLUMNS[0].header, 'Sl No');
  assert.equal(FAS_DOC_TRACKING_COLUMNS.at(-1).header, 'Remarks');
});

test('Point 2: Bank receiver maps Yes/No + dates', () => {
  const row = mapFasDocumentTrackingRow({
    slNo: 1,
    shipment: {},
    status: 'On Transit',
    formatDate: idDate,
    actual: {
      courierTrackNo: 'DHL987654321', courierServiceProvider: 'DHL',
      receiver: 'Bank', bankName: 'Emirates NBD', expectedDocDate: '2025-08-05',
      inwardCollectionAdviceReceivedAt: '2025-08-05', daSubmittedToBank: true,
      daSubmittedToBankDate: '2025-08-06', daSignedDocumentUrl: 's3://da.pdf',
      skipMurabaha: false, murabahaContractReleasedDate: '2025-08-08', murabahaContractDocumentUrl: 's3://m.pdf',
      murabahaSubmittedToBank: true, murabahaContractSubmittedDate: '2025-08-09',
      documentsReleasedDate: '2025-08-10', documentsReleasedDocumentUrl: 's3://final.pdf',
      docArrivalNotes: 'All documents completed',
    },
  });
  assert.equal(row.receiverType, 'Bank');
  assert.equal(row.receiver, 'Emirates NBD');
  assert.equal(row.daReceived, 'Yes');
  assert.equal(row.submittedToBank, 'Yes');
  assert.equal(row.daSigned, 'Yes');
  assert.equal(row.murabahaRequired, 'Yes');
  assert.equal(row.murabahaAttached, 'Yes');
  assert.equal(row.finalContractReceived, 'Yes');
  assert.equal(row.finalContractAttached, 'Yes');
  // Final contract attached, no payment request yet -> Pending Payment Request.
  assert.equal(row.status, 'Pending Payment Request');
  assert.equal(row.remarks, 'All documents completed');
});

test('Point 2: Direct receiver shows N/A for bank-only columns', () => {
  const row = mapFasDocumentTrackingRow({
    slNo: 3, shipment: {}, status: 'Completed', formatDate: idDate,
    actual: {
      courierTrackNo: 'UPS564738291', courierServiceProvider: 'UPS', receiver: 'Direct',
      documentsReleasedDate: '2025-08-10', documentsReleasedDocumentUrl: 's3://final.pdf',
    },
  });
  assert.equal(row.receiverType, 'Direct');
  assert.equal(row.receiver, 'Royal Horizon LLC');
  assert.equal(row.bankName, '');
  assert.equal(row.daReceived, 'N/A');
  assert.equal(row.submittedToBank, 'N/A');
  assert.equal(row.daSigned, 'N/A');
  assert.equal(row.murabahaRequired, 'N/A');
  assert.equal(row.bankSubmissionDate, 'N/A');
  assert.equal(row.murabahaReleasedDate, 'N/A');
  // Final contract columns still apply for Direct receivers
  assert.equal(row.finalContractReceived, 'Yes');
  assert.equal(row.finalContractAttached, 'Yes');
});

test('Point 2: skipMurabaha=true sets Murabaha Required = No for bank receiver', () => {
  const row = mapFasDocumentTrackingRow({
    slNo: 2, shipment: {}, status: 'In Progress', formatDate: idDate,
    actual: { receiver: 'Bank', bankName: 'FAB', skipMurabaha: true },
  });
  assert.equal(row.murabahaRequired, 'No');
  assert.equal(row.murabahaAttached, 'No');
});

test('isBankReceiver is case-insensitive', () => {
  assert.equal(isBankReceiver('bank'), true);
  assert.equal(isBankReceiver('Bank'), true);
  assert.equal(isBankReceiver('Direct'), false);
  assert.equal(isBankReceiver(''), false);
});

// Dashboard "Documents by Receiver Type" classification fix (Direct = 1 bug).
test('classifyFasReceiver: bank receiver -> bank', () => {
  assert.equal(classifyFasReceiver({ receiver: 'Bank' }), 'bank');
});

test('classifyFasReceiver: no receiver but has document activity -> direct', () => {
  assert.equal(classifyFasReceiver({ courierTrackNo: '3091143742', courierServiceProvider: 'DHL' }), 'direct');
});

test('classifyFasReceiver: explicit Direct receiver -> direct', () => {
  assert.equal(classifyFasReceiver({ receiver: 'Direct', expectedDocDate: '2026-06-01' }), 'direct');
});

test('classifyFasReceiver: empty planned container (no receiver, no docs) -> null', () => {
  assert.equal(classifyFasReceiver({}), null);
  assert.equal(classifyFasReceiver({ qtyMT: 100 }), null);
});

// Point 2/3: FAS Status condition table (screenshot).
test('FAS Status: Shipment On Transit -> Documents In Transit', () => {
  assert.equal(computeFasDocumentStatus({ shipmentStatus: 'On Transit' }), 'Documents In Transit');
});

test('FAS Status: arrived, no receiver flow -> Awaiting Documents', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'At Port of Discharge' }),
    'Awaiting Documents'
  );
});

test('FAS Status: Bank & DA not received -> Awaiting DA', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'At Port of Discharge', isBank: true, daReceived: false }),
    'Awaiting DA'
  );
});

test('FAS Status: DA received & not submitted -> Pending Bank Submission', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'Reached WH', isBank: true, daReceived: true, submittedToBank: false }),
    'Pending Bank Submission'
  );
});

test('FAS Status: Murabaha required & not submitted -> Pending Murabaha', () => {
  assert.equal(
    computeFasDocumentStatus({
      shipmentStatus: 'Reached WH', isBank: true, daReceived: true, submittedToBank: true,
      murabahaRequired: true, murabahaSubmitted: false,
    }),
    'Pending Murabaha'
  );
});

test('FAS Status: Murabaha not required (bank) -> Pending Final Contract (Skip Murabaha)', () => {
  assert.equal(
    computeFasDocumentStatus({
      shipmentStatus: 'Reached WH', isBank: true, daReceived: true, submittedToBank: true, murabahaRequired: false,
    }),
    'Pending Final Contract (Skip Murabaha)'
  );
});

test('FAS Status: Receiver Direct -> Pending Final Contract (Skip DA & Murabaha)', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'At Port of Discharge', isDirect: true }),
    'Pending Final Contract (Skip DA & Murabaha)'
  );
});

test('FAS Status: Final Contract Attached -> Pending Payment Request', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'Reached WH', isBank: true, finalContractAttached: true }),
    'Pending Payment Request'
  );
});

test('FAS Status: Payment Request Created -> Payment Allocation Pending', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'Reached WH', finalContractAttached: true, paymentRequestCreated: true }),
    'Payment Allocation Pending'
  );
});

test('FAS Status: Payment Allocation Completed -> Completed', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'GRN Completed', paymentAllocationCompleted: true }),
    'Completed'
  );
});

test('FAS Status: pre-transit falls back to shipment status', () => {
  assert.equal(
    computeFasDocumentStatus({ shipmentStatus: 'ETD yet to be confirmed' }),
    'ETD yet to be confirmed'
  );
});
