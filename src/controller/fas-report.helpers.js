// Pure, unit-testable mapper for the FAS Document Tracking report rows.
// Mirrors the columns in FAS_Department_Document_Tracking_Summary.xlsx.

const COMPANY_RECEIVER_NAME = 'Royal Horizon LLC';

const yesNo = (value) => (value ? 'Yes' : 'No');
const isBankReceiver = (receiver) => String(receiver || '').trim().toLowerCase() === 'bank';

// Column definitions (header + key) shared by the JSON endpoint and the Excel export.
const FAS_DOC_TRACKING_COLUMNS = [
  { header: 'Sl No', key: 'slNo', width: 8 },
  { header: 'Courier Track No', key: 'courierTrackNo', width: 18 },
  { header: 'Provider', key: 'provider', width: 12 },
  { header: 'Receiver Type', key: 'receiverType', width: 14 },
  { header: 'Receiver', key: 'receiver', width: 22 },
  { header: 'Bank Name', key: 'bankName', width: 22 },
  { header: 'Expected Document Receipt Date', key: 'expectedDocDate', width: 16 },
  { header: 'DA Received', key: 'daReceived', width: 12 },
  { header: 'Submitted to Bank', key: 'submittedToBank', width: 14 },
  { header: 'Bank Submission Date', key: 'bankSubmissionDate', width: 16 },
  { header: 'DA Signed & Stamped', key: 'daSigned', width: 14 },
  { header: 'Murabaha Required', key: 'murabahaRequired', width: 14 },
  { header: 'Murabaha Released Date', key: 'murabahaReleasedDate', width: 16 },
  { header: 'Murabaha Attached', key: 'murabahaAttached', width: 14 },
  { header: 'Murabaha Submitted to Bank', key: 'murabahaSubmittedToBank', width: 16 },
  { header: 'Murabaha Submission Date', key: 'murabahaSubmissionDate', width: 16 },
  { header: 'Final Contract Received', key: 'finalContractReceived', width: 16 },
  { header: 'Final Contract Attached', key: 'finalContractAttached', width: 16 },
  { header: 'Final Contract Submission Date', key: 'finalContractSubmissionDate', width: 16 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Remarks', key: 'remarks', width: 24 },
];

/**
 * Maps a shipment + its container's `actual` document-tracking data into a single
 * FAS report row. Bank-receiver columns become 'N/A' for Direct receivers.
 *
 * @param {object} opts
 * @param {number} opts.slNo - 1-based serial number.
 * @param {object} opts.shipment - lean shipment doc (supplier/remarks/etc.).
 * @param {object} opts.actual - container.actual document-tracking subset.
 * @param {string} opts.status - computed shipment status.
 * @param {(d:any)=>string} opts.formatDate - date formatter (returns '' for empty).
 */
const mapFasDocumentTrackingRow = ({ slNo, shipment = {}, actual = {}, status = '', formatDate = (d) => (d ? String(d) : '') }) => {
  const bank = isBankReceiver(actual.receiver);
  const na = (value) => (bank ? value : 'N/A');

  return {
    slNo,
    courierTrackNo: actual.courierTrackNo || '',
    provider: actual.courierServiceProvider || '',
    receiverType: actual.receiver || '',
    receiver: bank ? (actual.bankName || '') : COMPANY_RECEIVER_NAME,
    bankName: bank ? (actual.bankName || '') : '',
    expectedDocDate: formatDate(actual.expectedDocDate),
    daReceived: na(yesNo(!!actual.inwardCollectionAdviceReceivedAt || !!actual.inwardCollectionAdviceDocumentUrl)),
    submittedToBank: na(yesNo(actual.daSubmittedToBank === true)),
    bankSubmissionDate: bank ? formatDate(actual.daSubmittedToBankDate) : 'N/A',
    daSigned: na(yesNo(!!actual.daSignedDocumentUrl)),
    murabahaRequired: na(yesNo(actual.skipMurabaha !== true)),
    murabahaReleasedDate: bank ? formatDate(actual.murabahaContractReleasedDate || actual.murabahaContractApprovedDate) : 'N/A',
    murabahaAttached: na(yesNo(!!actual.murabahaContractDocumentUrl)),
    murabahaSubmittedToBank: na(yesNo(actual.murabahaSubmittedToBank === true)),
    murabahaSubmissionDate: bank ? formatDate(actual.murabahaContractSubmittedDate) : 'N/A',
    finalContractReceived: yesNo(!!actual.documentsReleasedDate || !!actual.documentsReleasedDocumentUrl),
    finalContractAttached: yesNo(!!actual.documentsReleasedDocumentUrl),
    finalContractSubmissionDate: formatDate(actual.documentsReleasedDate),
    status: status || '',
    remarks: actual.docArrivalNotes || shipment.remarks || '',
  };
};

module.exports = { FAS_DOC_TRACKING_COLUMNS, mapFasDocumentTrackingRow, isBankReceiver };
