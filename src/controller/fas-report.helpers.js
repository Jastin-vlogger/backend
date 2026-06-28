// Pure, unit-testable mapper for the FAS Document Tracking report rows.
// Mirrors the columns in FAS_Department_Document_Tracking_Summary.xlsx.

const COMPANY_RECEIVER_NAME = 'Royal Horizon LLC';

const yesNo = (value) => (value ? 'Yes' : 'No');
const isBankReceiver = (receiver) => String(receiver || '').trim().toLowerCase() === 'bank';
const isDirectReceiver = (receiver) => String(receiver || '').trim().toLowerCase() === 'direct';

// Fields that indicate a container has FAS document-tracking activity. Used to decide
// whether a non-bank (Direct) container should count in "Documents by Receiver Type".
const FAS_DOC_ACTIVITY_FIELDS = [
  'courierTrackNo', 'courierServiceProvider', 'expectedDocDate', 'docArrivalNotes', 'bankName',
  'inwardCollectionAdviceReceivedAt', 'inwardCollectionAdviceDocumentUrl', 'daSignedDocumentUrl',
  'documentsReleasedDocumentUrl', 'documentsReleasedDate',
];

const hasFasDocumentActivity = (actual = {}) =>
  FAS_DOC_ACTIVITY_FIELDS.some((field) => !!actual[field]);

/**
 * Classifies a container for the "Documents by Receiver Type" chart.
 * - Bank receiver (receiver === 'bank') always counts as 'bank'.
 * - A non-bank container counts as 'direct' only if it has real document activity
 *   (so empty planned containers with no receiver are not miscounted).
 * Returns 'bank' | 'direct' | null (null = not a tracked document).
 */
const classifyFasReceiver = (actual = {}) => {
  if (isBankReceiver(actual.receiver)) return 'bank';
  if (hasFasDocumentActivity(actual)) return 'direct';
  return null;
};

// Derives the boolean workflow flags used by both the Yes/No columns and the status.
const deriveFasFlags = (actual = {}) => ({
  isBank: isBankReceiver(actual.receiver),
  isDirect: isDirectReceiver(actual.receiver),
  daReceived: !!actual.inwardCollectionAdviceReceivedAt || !!actual.inwardCollectionAdviceDocumentUrl,
  submittedToBank: actual.daSubmittedToBank === true,
  murabahaRequired: actual.skipMurabaha !== true,
  murabahaSubmitted: actual.murabahaSubmittedToBank === true,
  finalContractAttached: !!actual.documentsReleasedDocumentUrl || !!actual.documentsReleasedDate,
  // Payment phase is driven only by the Payment Allocation step (BL Details / FAS),
  // not the earlier port-clearance advance. "Created" = submitted for approval.
  paymentRequestCreated: actual.paymentAllocationApproval?.status === 'pending_fas_manager',
  paymentAllocationCompleted: actual.paymentAllocationApproval?.status === 'approved',
});

/**
 * Point 2/3: computes the FAS document-tracking Status from the condition table.
 * Evaluated as a progression so the furthest-reached stage wins.
 */
const computeFasDocumentStatus = ({
  shipmentStatus = '',
  isDirect = false,
  isBank = false,
  daReceived = false,
  submittedToBank = false,
  murabahaRequired = true,
  murabahaSubmitted = false,
  finalContractAttached = false,
  paymentRequestCreated = false,
  paymentAllocationCompleted = false,
} = {}) => {
  const s = String(shipmentStatus || '').trim().toLowerCase();
  const onTransit = s === 'on transit';
  const preTransit = !s || s.includes('yet to');
  const arrived = !onTransit && !preTransit;

  // Payment phase (most advanced) first.
  if (paymentAllocationCompleted) return 'Completed';
  if (paymentRequestCreated) return 'Payment Allocation Pending';
  if (finalContractAttached) return 'Pending Payment Request';

  // Still in transit / not yet arrived.
  if (onTransit) return 'Documents In Transit';
  if (preTransit) return shipmentStatus || 'Documents In Transit';

  // Arrived — branch by receiver.
  if (isDirect) return 'Pending Final Contract (Skip DA & Murabaha)';
  if (isBank) {
    if (!daReceived) return 'Awaiting DA';
    if (!submittedToBank) return 'Pending Bank Submission';
    if (murabahaRequired && !murabahaSubmitted) return 'Pending Murabaha';
    if (!murabahaRequired) return 'Pending Final Contract (Skip Murabaha)';
    return 'Pending Final Contract';
  }

  // Arrived but receiver/flow not set yet.
  return arrived ? 'Awaiting Documents' : (shipmentStatus || '');
};

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
 * @param {string} opts.status - computed SHIPMENT status (used to derive the FAS status).
 * @param {(d:any)=>string} opts.formatDate - date formatter (returns '' for empty).
 */
const mapFasDocumentTrackingRow = ({ slNo, shipment = {}, actual = {}, status = '', formatDate = (d) => (d ? String(d) : '') }) => {
  const flags = deriveFasFlags(actual);
  const bank = flags.isBank;
  const na = (value) => (bank ? value : 'N/A');
  const fasStatus = computeFasDocumentStatus({ shipmentStatus: status, ...flags });

  return {
    slNo,
    courierTrackNo: actual.courierTrackNo || '',
    provider: actual.courierServiceProvider || '',
    receiverType: actual.receiver || '',
    receiver: bank ? (actual.bankName || '') : COMPANY_RECEIVER_NAME,
    bankName: bank ? (actual.bankName || '') : '',
    expectedDocDate: formatDate(actual.expectedDocDate),
    daReceived: na(yesNo(flags.daReceived)),
    submittedToBank: na(yesNo(flags.submittedToBank)),
    bankSubmissionDate: bank ? formatDate(actual.daSubmittedToBankDate) : 'N/A',
    daSigned: na(yesNo(!!actual.daSignedDocumentUrl)),
    murabahaRequired: na(yesNo(flags.murabahaRequired)),
    murabahaReleasedDate: bank ? formatDate(actual.murabahaContractReleasedDate || actual.murabahaContractApprovedDate) : 'N/A',
    murabahaAttached: na(yesNo(!!actual.murabahaContractDocumentUrl)),
    murabahaSubmittedToBank: na(yesNo(flags.murabahaSubmitted)),
    murabahaSubmissionDate: bank ? formatDate(actual.murabahaContractSubmittedDate) : 'N/A',
    finalContractReceived: yesNo(!!actual.documentsReleasedDate || !!actual.documentsReleasedDocumentUrl),
    finalContractAttached: yesNo(!!actual.documentsReleasedDocumentUrl),
    finalContractSubmissionDate: formatDate(actual.documentsReleasedDate),
    status: fasStatus,
    remarks: actual.docArrivalNotes || shipment.remarks || '',
  };
};

module.exports = {
  FAS_DOC_TRACKING_COLUMNS,
  mapFasDocumentTrackingRow,
  isBankReceiver,
  isDirectReceiver,
  hasFasDocumentActivity,
  classifyFasReceiver,
  deriveFasFlags,
  computeFasDocumentStatus,
};
