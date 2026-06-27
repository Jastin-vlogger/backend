const test = require('node:test');
const assert = require('node:assert/strict');
const { mapFasDocumentTrackingRow, FAS_DOC_TRACKING_COLUMNS, isBankReceiver } = require('./fas-report.helpers');

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
  assert.equal(row.status, 'On Transit');
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
