
const Shipment = require('../models/shipment.model');
const Container = require('../models/container.model');
const BLRowDefinition = require('../models/blRowDefinition.model');
const Supplier = require('../models/supplier.model');
const SupplierAccount = require('../models/supplierAccount.model');
const Item = require('../models/item.model');
const User = require('../models/auth.model');
const AuditLog = require('../models/auditLog.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { uploadBufferToS3, deleteFromS3, createSignedGetUrl } = require('../core/utils/s3Upload');
const { calculateSupplierOnboardingState } = require('../core/utils/supplierOnboarding');
const {
  sendSupplierInviteEmail,
  sendWorkflowUpdateEmail,
  sendShipmentScheduledEmail,
  sendActualContainerSavedEmail,
  sendClearingAdvanceStatusEmail,
  sendPaymentAllocationStatusEmail,
  sendStorageAllocationStatusEmail,
  sendPaymentCostingStatusEmail,
} = require('../services/mail.service');
const { normalizeRole } = require('../core/utils/roleHelpers');
const { permissionService } = require('../core/services/permissionService');
const {
  DEFAULT_BL_ROW_DEFINITIONS,
  normalizeNumericDefault,
  normalizeVisibleTo,
  normalizeDescription,
  slugifyKey,
} = require('../config/blRowDefinitions');
const {
  syncSameBlActualFields,
  hydrateMissingSameBlActualFields,
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  SAME_BL_STORAGE_ALLOCATION_FIELDS,
  SAME_BL_DOCUMENT_TRACKER_FIELDS,
  SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
  SAME_BL_INHERIT_FIELDS,
} = require('../core/utils/sameBlSync');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

const parseJsonField = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeUploadedFiles = (files) => {
  if (!files) return {};
  if (!Array.isArray(files)) return files;

  return files.reduce((acc, file) => {
    if (!file?.fieldname) return acc;
    if (!acc[file.fieldname]) {
      acc[file.fieldname] = [];
    }
    acc[file.fieldname].push(file);
    return acc;
  }, {});
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Pure, unit-testable mapper for the Port & Clearance / Regulatory scalar fields that
// the logistics save previously dropped (see ./logistics.helpers.js).
const { applyLogisticsScalarFields } = require('./logistics.helpers');
const { isOnTransitOrLaterStatus, isAtPortOrLaterStatus } = require('./shipment-visibility.helpers');
const { FAS_DOC_TRACKING_COLUMNS, mapFasDocumentTrackingRow, classifyFasReceiver } = require('./fas-report.helpers');
const { buildWarehouseDashboard } = require('./warehouse-dashboard.helpers');
const { RH_STATUS_SUMMARY_COLUMNS, buildRhStatusSummaryRows } = require('./rh-status-summary.helpers');
const Warehouse = require('../models/warehouse.model');

const toSignedDocument = async (url, name, expiresIn = 900) => {
  if (!url) return { url: null, name: name || null };
  const signedUrl = await createSignedGetUrl(url, expiresIn).catch(() => url);
  return { url: signedUrl, name: name || null };
};

const fireAndForgetWorkflowEmail = (payload) => {
  notifyWorkflowRoleByEmail(payload).catch((error) => {
    console.error(`Workflow email warning for ${payload?.sectionLabel || 'shipment update'}:`, error.message);
  });
};

const toPlainObject = (value) => {
  if (value && typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
};

const toTimeString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 5);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  return '';
};

const combineDateTime = (dateValue, timeValue) => {
  const date = toDateOrNull(dateValue);
  const time = toTimeString(timeValue);
  if (!date || !time) return null;
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
};

const calculateDelayHours = (transportDateValue, transportTimeValue, receivedDateValue, receivedTimeValue) => {
  const transportDateTime = combineDateTime(transportDateValue, transportTimeValue);
  const receivedDateTime = combineDateTime(receivedDateValue, receivedTimeValue);
  if (!transportDateTime || !receivedDateTime) return 0;
  const diffHours = (receivedDateTime.getTime() - transportDateTime.getTime()) / (1000 * 60 * 60);
  return diffHours > 0 ? Number(diffHours.toFixed(2)) : 0;
};

const addDays = (dateValue, days) => {
  const date = toDateOrNull(dateValue);
  if (!date || !Number.isFinite(Number(days))) return null;
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days));
  return result;
};

const formatDateValue = (value) => {
  const date = toDateOrNull(value);
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTimeValue = (value) => {
  const date = toDateOrNull(value);
  if (!date) return '';
  return date.toLocaleString('en-US', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDateDifferenceDays = (actualValue, scheduledValue) => {
  const actualDate = toDateOrNull(actualValue);
  const scheduledDate = toDateOrNull(scheduledValue);
  if (!actualDate || !scheduledDate) return '';

  const normalize = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const differenceMs = normalize(actualDate).getTime() - normalize(scheduledDate).getTime();
  const differenceDays = Math.round(differenceMs / (1000 * 60 * 60 * 24));
  const prefix = differenceDays > 0 ? '+' : '';
  return `${prefix}${differenceDays} day(s)`;
};

const WORKFLOW_NOTIFICATION_ROLE_MAP = {
  blDetails: 'FAS',
  documentation: 'Logistic',
  logistics: 'Logistic',
  storage: 'Purchase',
  quality: 'FAS',
  paymentCosting: 'Purchase',
};

const CLEARING_ADVANCE_APPROVAL_STATUSES = {
  draft: 'draft',
  pendingFas: 'pending_fas',
  pendingFasManager: 'pending_fas_manager',
  approved: 'approved',
};

const PAYMENT_COSTING_APPROVAL_STATUSES = {
  draft: 'draft',
  pendingFasManager: 'pending_fas_manager',
  approved: 'approved',
};

const STORAGE_ALLOCATION_APPROVAL_STATUSES = {
  draft: 'draft',
  pendingWarehouseManager: 'pending_warehouse_manager',
  approved: 'approved',
};

const STORAGE_ARRIVAL_APPROVAL_STATUSES = {
  draft: 'draft',
  pendingWarehouseManager: 'pending_warehouse_manager',
  approved: 'approved',
};

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value || {}));

const applyCommercialInvoiceDocumentUpload = (actual, uploaded) => {
  if (!actual || !uploaded) return actual;
  actual.commercialInvoiceDocumentUrl = uploaded.url;
  actual.commercialInvoiceDocumentName = uploaded.fileName;
  return actual;
};

const buildClearingAdvancePendingApproval = (user) => ({
  status: CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas,
  submittedAt: new Date(),
  submittedBy: user?._id || null,
  fasApprovedAt: null,
  fasApprovedBy: null,
  fasManagerApprovedAt: null,
  fasManagerApprovedBy: null,
});

const buildPaymentCostingPendingApproval = (user) => ({
  status: PAYMENT_COSTING_APPROVAL_STATUSES.pendingFasManager,
  submittedAt: new Date(),
  submittedBy: user?._id || null,
  fasManagerApprovedAt: null,
  fasManagerApprovedBy: null,
});

const buildPaymentAllocationPendingApproval = (user) => buildPaymentCostingPendingApproval(user);

const buildStorageAllocationPendingApproval = (user, existing) => ({
  status: STORAGE_ALLOCATION_APPROVAL_STATUSES.pendingWarehouseManager,
  submittedAt: existing?.submittedAt || new Date(),
  submittedBy: existing?.submittedBy || user?._id || null,
  lastUpdatedAt: new Date(),
  lastUpdatedBy: user?._id || null,
  warehouseManagerApprovedAt: null,
  warehouseManagerApprovedBy: null,
});

// "Requested By/At" always reflects whoever most recently saved — not who first submitted it.
// e.g. Admin saves at 12pm, then a storekeeper edits later: the storekeeper becomes the
// attributed submitter, since they're the one who last touched the data being approved.
const buildStorageArrivalPendingApproval = (user, existing) => ({
  status: STORAGE_ARRIVAL_APPROVAL_STATUSES.pendingWarehouseManager,
  submittedAt: new Date(),
  submittedBy: user?._id || null,
  warehouseManagerApprovedAt: existing?.warehouseManagerApprovedAt || null,
  warehouseManagerApprovedBy: existing?.warehouseManagerApprovedBy || null,
});

// Every row save re-attributes submittedAt/submittedBy to the current user — independent of
// whether the section is complete enough to promote from draft to pending approval.
const touchStorageArrivalLastUpdated = (container, user) => {
  const current = container.actual.storageArrivalApproval;
  const existing = (current?.toObject ? current.toObject() : current) || { status: STORAGE_ARRIVAL_APPROVAL_STATUSES.draft };
  container.actual.storageArrivalApproval = {
    ...existing,
    submittedAt: new Date(),
    submittedBy: user?._id || null,
  };
};

const hasSavedClearingAdvanceData = (container) => {
  const rows = container?.actual?.costSheetBookings || [];
  return Array.isArray(rows) && rows.some((row) =>
    Number(row?.requestAmount || 0) > 0 ||
    String(row?.remarks || '').trim().length > 0 ||
    String(row?.attachmentDocumentUrl || '').trim().length > 0
  );
};

const hasSavedPaymentCostingData = (container) => {
  const rows = container?.actual?.paymentCostings || [];
  return Array.isArray(rows) && rows.some((row) =>
    String(row?.refBillNo || '').trim().length > 0 ||
    String(row?.refBillVendor || '').trim().length > 0 ||
    !!row?.refBillDate
  );
};

const hasSavedPaymentAllocationData = (container) => {
  const rows = container?.actual?.paymentAllocations || [];
  return Array.isArray(rows) && rows.some((row) =>
    Number(row?.requestAmount || 0) > 0 ||
    Number(row?.paidAmount || 0) > 0 ||
    String(row?.reference || '').trim().length > 0 ||
    String(row?.attachmentDocumentUrl || '').trim().length > 0
  );
};

const ensureBlRowDefinitionsSeeded = async () => {
  const existingRows = await BLRowDefinition.find().sort({ sn: 1 }).lean();
  if (!existingRows.length) {
    await BLRowDefinition.insertMany(DEFAULT_BL_ROW_DEFINITIONS.map((row) => ({
      key: row.key,
      sn: row.sn,
      description: row.description,
      visibleTo: normalizeVisibleTo(row.visibleTo),
      defaultQty: normalizeNumericDefault(row.defaultQty, 1),
      defaultRate: normalizeNumericDefault(row.defaultRate, 0),
      isActive: true,
      isDeleted: false,
    })));
    return BLRowDefinition.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sn: 1 }).lean();
  }

  const existingKeys = new Set(existingRows.map((row) => row.key || slugifyKey(row.description)));
  const existingDescriptions = new Set(existingRows.map((row) => normalizeDescription(row.description)));
  let nextSn = Math.max(...existingRows.map((row) => Number(row.sn) || 0), 0) + 1;
  const toInsert = [];

  for (const row of DEFAULT_BL_ROW_DEFINITIONS) {
    const normalizedDescription = normalizeDescription(row.description);
    if (existingKeys.has(row.key) || existingDescriptions.has(normalizedDescription)) {
      continue;
    }

    toInsert.push({
      key: row.key,
      sn: nextSn++,
      description: row.description,
      visibleTo: normalizeVisibleTo(row.visibleTo),
      defaultQty: normalizeNumericDefault(row.defaultQty, 1),
      defaultRate: normalizeNumericDefault(row.defaultRate, 0),
      isActive: true,
      isDeleted: false,
    });
    existingKeys.add(row.key);
    existingDescriptions.add(normalizedDescription);
  }

  if (toInsert.length) {
    await BLRowDefinition.insertMany(toInsert);
  }

  return BLRowDefinition.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sn: 1 }).lean();
};

const hasSavedStorageAllocationData = (container) => {
  const legacyRows = container?.actual?.storageAllocations || [];
  const splitRows = container?.actual?.storageAllocationSplits || [];
  const hasLegacyRows = Array.isArray(legacyRows) && legacyRows.some((row) =>
    String(row?.containerSerialNo || '').trim().length > 0 ||
    Number(row?.bags || 0) > 0 ||
    String(row?.warehouse || '').trim().length > 0
  );
  const hasSplitRows = Array.isArray(splitRows) && splitRows.some((row) =>
    String(row?.itemName || '').trim().length > 0 ||
    Number(row?.quantity || 0) > 0 ||
    String(row?.warehouse || '').trim().length > 0
  );
  return hasLegacyRows || hasSplitRows;
};

// A row counts as "recorded" once GRN + batch are both present — same "Recorded" definition
// the Status column uses (shipment-storage.component.ts). NOT receivedOnDate/receivedOnTime:
// those auto-prefill to "now" client-side even on untouched rows, so treating them as signal
// let a still-pending row (no GRN/batch) count as recorded once SAVE ALL persisted the prefill.
const isStorageArrivalRowRecorded = (row) =>
  !!String(row?.grn || '').trim() && !!String(row?.batch || '').trim();

// How many physical containers this container doc actually represents. `actual.noOfContainers`
// (a manually-typed BL Details field) is unreliable — confirmed stale/doubled against real data
// (e.g. declared 26 when transportationBooked/packagingList/extractedContainers all independently
// agree on 18, or declared 40 when they all agree on 20). Those three sources are populated by the
// same sync path and always agree with each other in practice, so prefer them over the manual field.
const getExpectedContainerSerialCount = (container) => {
  const actual = container?.actual || {};
  const booked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked.length : 0;
  if (booked) return booked;
  const packing = Array.isArray(actual.packagingList?.containerInfo) ? actual.packagingList.containerInfo.length : 0;
  if (packing) return packing;
  const extracted = Array.isArray(actual.extractedContainers) ? actual.extractedContainers.length : 0;
  return extracted;
};

// "Delivered WH" / warehouse-manager-approvable only once EVERY container in the split has been
// recorded — a single recorded row must never flip the whole shipment to Delivered WH while the
// rest are still Pending. Also require the row count to match the container's real expected count
// (see getExpectedContainerSerialCount) — a container with only 2 of 8 real containers logged must
// not read as fully delivered just because those 2 existing rows are individually complete.
const hasSavedStorageArrivalData = (container) => {
  const rows = container?.actual?.storageSplits || [];
  if (!Array.isArray(rows) || !rows.length || !rows.every(isStorageArrivalRowRecorded)) return false;
  const expected = getExpectedContainerSerialCount(container);
  return expected === 0 || rows.length >= expected;
};

const hasAssignedWarehouse = (container) => {
  const rows = container?.actual?.storageAllocations || [];
  return Array.isArray(rows) && rows.some((row) => String(row?.warehouse || '').trim().length > 0);
};

const hasTransitActualMilestone = (container) => {
  const actual = Array.isArray(container?.actual) ? container.actual[0] || {} : container?.actual || {};
  return (
    hasValue(actual?.BLNo) &&
    hasValue(actual?.commercialInvoiceNo) &&
    !!toDateOrNull(actual?.shipOnBoardDate) &&
    !!toDateOrNull(actual?.updatedETD) &&
    !!toDateOrNull(actual?.updatedETA)
  );
};

const hasExplicitShipmentArrival = (container) => {
  const actual = Array.isArray(container?.actual) ? container.actual[0] || {} : container?.actual || {};
  return String(actual?.shipmentArrived || '').trim().toLowerCase() === 'yes' || !!toDateOrNull(actual?.shipmentArrivedOn);
};

const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getContainerActual = (container) =>
  Array.isArray(container?.actual) ? container.actual[0] || {} : container?.actual || {};

const getContainerEtdDate = (shipment, container) => {
  const actual = getContainerActual(container);
  return toDateOrNull(actual?.updatedETD || container?.planned?.etd || shipment?.plannedETD);
};

const getContainerEtaDate = (shipment, container) => {
  const actual = getContainerActual(container);
  return toDateOrNull(actual?.updatedETA || container?.planned?.eta || shipment?.plannedETA);
};

const isOnOrBeforeToday = (date) => {
  if (!date) return false;
  return startOfLocalDay(date).getTime() <= getStartOfToday().getTime();
};

const hasArrivedAtPortOfDischarge = (shipment, container) =>
  hasExplicitShipmentArrival(container);

const hasOnTransitStatus = (shipment, container) => {
  if (hasArrivedAtPortOfDischarge(shipment, container)) return false;
  const etd = getContainerEtdDate(shipment, container);
  if (!hasTransitActualMilestone(container)) return false;
  return isOnOrBeforeToday(etd);
};

const getApprovalActorName = (user) => user?.name || user?.email || 'A user';

const getContainerSerialNo = (container) =>
  container?.actual?.containerSerialNo ||
  container?.planned?.containerSerialNo ||
  container?.containerSerialNo ||
  container?._id?.toString?.() ||
  'N/A';

const getClearingAdvanceSummaryLines = (container) => {
  const rows = Array.isArray(container?.actual?.costSheetBookings) ? container.actual.costSheetBookings : [];
  const totalRequestAmount = rows.reduce((sum, row) => sum + (Number(row?.requestAmount) || 0), 0);
  const actual = container?.actual || {};
  const paymentDetails = actual?.clearingAdvancePaymentDetails || {};
  const expectedContainers = [
    ...(Array.isArray(actual?.extractedContainers)
      ? actual.extractedContainers.map((item) => item?.containerNo || item?.container_no)
      : []),
    ...(Array.isArray(actual?.transportationBooked)
      ? actual.transportationBooked.map((item) => item?.containerSerialNo)
      : []),
    ...(Array.isArray(actual?.storageAllocations)
      ? actual.storageAllocations.map((item) => item?.containerSerialNo)
      : []),
    actual?.actualSerialNo,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  return [
    { label: 'Commercial Invoice', value: actual?.commercialInvoiceDocumentName || 'N/A', url: actual?.commercialInvoiceDocumentUrl || '' },
    { label: 'BL No', value: actual?.BLNo || actual?.CLNo || 'N/A', url: actual?.blDocumentUrl || '' },
    { label: 'Expected Containers', value: expectedContainers.length ? expectedContainers.join(', ') : 'N/A' },
    {
      label: 'DO Proforma Invoice',
      value: actual?.costSheetBookingDocumentName || 'N/A',
      url: actual?.costSheetBookingDocumentUrl || '',
    },
    { label: 'Line Items', value: String(rows.length) },
    { label: 'Total Request Amount', value: totalRequestAmount.toFixed(2) },
    { label: 'Cheque No', value: paymentDetails?.chequeNo || 'N/A' },
    { label: 'Cheque Date', value: formatDateValue(paymentDetails?.chequeDate) || 'N/A' },
    { label: 'Payment Voucher No', value: paymentDetails?.paymentVoucherNo || 'N/A' },
    ...(paymentDetails?.transactionId ? [{ label: 'Transaction ID', value: paymentDetails.transactionId }] : []),
  ];
};

const getPaymentAllocationSummaryLines = (container) => {
  const rows = Array.isArray(container?.actual?.paymentAllocations) ? container.actual.paymentAllocations : [];
  const totalRequestAmount = rows.reduce((sum, row) => sum + (Number(row?.requestAmount) || 0), 0);
  const totalPaidAmount = rows.reduce((sum, row) => sum + (Number(row?.paidAmount) || 0), 0);
  return [
    `Line Items: ${rows.length}`,
    `Total Request Amount: ${totalRequestAmount.toFixed(2)}`,
    `Total Received Amount: ${totalPaidAmount.toFixed(2)}`,
    `Difference Amount: ${(totalPaidAmount - totalRequestAmount).toFixed(2)}`,
  ];
};

const getStorageAllocationSummaryLines = (container) => {
  const rows = Array.isArray(container?.actual?.storageAllocations) ? container.actual.storageAllocations : [];
  const totalBags = rows.reduce((sum, row) => sum + (Number(row?.bags) || 0), 0);
  const warehouseCount = new Set(
    rows
      .map((row) => String(row?.warehouse || '').trim())
      .filter(Boolean)
  ).size;
  return [
    `Line Items: ${rows.length}`,
    `Total Bags: ${totalBags}`,
    `Warehouses: ${warehouseCount}`,
  ];
};

const getPaymentCostingSummaryLines = (container) => {
  const rows = Array.isArray(container?.actual?.paymentCostings) ? container.actual.paymentCostings : [];
  const totalRequestAmount = rows.reduce((sum, row) => sum + (Number(row?.requestAmount) || 0), 0);
  const totalPaidAmount = rows.reduce((sum, row) => sum + (Number(row?.paidAmount) || 0), 0);
  return [
    `Line Items: ${rows.length}`,
    `Total Request Amount: ${totalRequestAmount.toFixed(2)}`,
    `Total Paid Amount: ${totalPaidAmount.toFixed(2)}`,
    `Attachment: ${container?.actual?.paymentCostingDocumentName || 'N/A'}`,
  ];
};

const requirePermission = async (user, permissionKey) => {
  if (!user) return false;
  return permissionService.hasPermission(user, permissionKey);
};

const hasRoleOrPermission = async (user, permissionKey, allowedRoles = []) => {
  if (!user) return false;
  const normalizedRole = normalizeRole(user.role);
  if (allowedRoles.includes(normalizedRole)) {
    return true;
  }
  return requirePermission(user, permissionKey);
};

const notifyWorkflowRoleByEmail = async ({
  role,
  shipment,
  container,
  sectionLabel,
  actor,
  approvalStage,
}) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return;

  try {
    const recipients = await User.find({
      role: normalizedRole,
      isActive: true,
      email: { $exists: true, $ne: null },
    })
      .select('name email')
      .lean();

    if (!recipients.length) return;

    const actorName = actor?.name || actor?.email || 'A user';
    const shipmentNo = shipment?.shipmentNo || 'N/A';
    const containerSerialNo =
      getContainerSerialNo(container);

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.all(
      uniqueRecipients.map((recipient) =>
        sendWorkflowUpdateEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentNo,
          containerSerialNo,
          sectionLabel,
          updatedBy: actorName,
          nextRole: normalizedRole,
          approvalStage,
        })
      )
    );
  } catch (error) {
    console.error(`Workflow email warning for ${sectionLabel}:`, error.message);
  }
};

const getScheduleActorLabel = (actor) => {
  const normalizedRole = normalizeRole(actor?.role);
  if (normalizedRole === 'Purchase') {
    return 'the Purchase Department';
  }
  return 'this supplier';
};

const getShipmentTrackerBase = (shipment) => {
  const shipmentNo = String(shipment?.shipmentNo || '').trim();
  const trackerPrefix = shipmentNo.match(/^(RHST-\d+\/[A-Z0-9-]+)/i)?.[1];
  return trackerPrefix || shipmentNo || shipment?._id?.toString() || 'RHST';
};

const getScheduledShipmentId = (shipment, index) => {
  const base = getShipmentTrackerBase(shipment);
  return `${base}/SCG${String(index + 1).padStart(2, '0')}`;
};

const notifyShipmentScheduledRolesByEmail = async ({
  roles = [],
  shipment,
  changedScheduleLines = [],
  actor,
}) => {
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';
  const scheduledByLabel = getScheduleActorLabel(actor);
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length) return;
  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const scheduleLines = Array.isArray(changedScheduleLines) ? changedScheduleLines.filter(Boolean) : [];

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    })
      .select('name email')
      .lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.all(
      uniqueRecipients.map((recipient) =>
        sendShipmentScheduledEmail({
          to: recipient.email,
          userName: recipient.name || 'Team',
          shipmentId,
          shipmentUrl,
          scheduleLines,
          scheduledByLabel,
        })
      )
    );
  } catch (error) {
    console.error(`Shipment schedule email warning for ${shipmentId}:`, error.message);
  }
};

const notifyActualContainerSavedRolesByEmail = async ({
  roles = [],
  shipment,
  container,
  actor,
}) => {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length || !shipment || !container?.actual) return;

  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const actorName = actor?.name || actor?.email || 'A user';
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';

  const scheduleSerialNo = (() => {
    const allContainers = Array.isArray(shipment.__orderedContainersForEmail) ? shipment.__orderedContainersForEmail : [];
    const index = allContainers.findIndex((entry) => String(entry?._id) === String(container?._id));
    return index >= 0 ? getScheduledShipmentId(shipment, index) : 'N/A';
  })();

  const actualSerialNo = container?.actual?.actualSerialNo || 'N/A';
  const actualDetails = [
    `Commercial Invoice No: ${container?.actual?.commercialInvoiceNo || 'N/A'}`,
    `BL No: ${container?.actual?.BLNo || container?.actual?.CLNo || 'N/A'}`,
    `Ship On Board Date: ${formatDateValue(container?.actual?.shipOnBoardDate) || 'N/A'}`,
    `ETD: ${formatDateValue(container?.actual?.updatedETD) || 'N/A'}`,
    `ETA: ${formatDateValue(container?.actual?.updatedETA) || 'N/A'}`,
    `FCL: ${container?.actual?.FCL ?? container?.planned?.FCL ?? 'N/A'}`,
    `Container Size: ${container?.actual?.size ?? container?.planned?.size ?? 'N/A'}`,
    `Qty MT: ${container?.actual?.qtyMT ?? 'N/A'}`,
    `Bags: ${container?.actual?.bags ?? 'N/A'}`,
    `Pallet: ${container?.actual?.pallet ?? 'N/A'}`,
    `Port of Loading: ${container?.actual?.portOfLoading || 'N/A'}`,
    `Port of Discharge: ${container?.actual?.portOfDischarge || 'N/A'}`,
    `Shipping Line: ${container?.actual?.shippingLine || 'N/A'}`,
  ];

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    })
      .select('name email')
      .lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.all(
      uniqueRecipients.map((recipient) =>
        sendActualContainerSavedEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentId,
          scheduleSerialNo,
          actualSerialNo,
          actualDetails,
          shipmentUrl,
          updatedBy: actorName,
        })
      )
    );
  } catch (error) {
    console.error(`Actual shipment email warning for ${shipmentId}:`, error.message);
  }
};

const notifyClearingAdvanceRolesByEmail = async ({
  roles = [],
  shipment,
  container,
  actor,
  approvalStage,
}) => {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length || !shipment || !container?.actual) return;

  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const updatedBy = getApprovalActorName(actor);
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';
  const containerSerialNo = getContainerSerialNo(container);
  const detailLines = getClearingAdvanceSummaryLines(container);

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    })
      .select('name email')
      .lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendClearingAdvanceStatusEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentId,
          containerSerialNo,
          approvalStage,
          updatedBy,
          detailLines,
          shipmentUrl,
        })
      )
    );
  } catch (error) {
    console.error(`Clearing advance email warning for ${shipmentId}:`, error.message);
  }
};

const notifyPaymentAllocationRolesByEmail = async ({
  roles = [],
  shipment,
  container,
  actor,
}) => {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length || !shipment || !container?.actual) return;

  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const updatedBy = getApprovalActorName(actor);
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';
  const containerSerialNo = getContainerSerialNo(container);
  const detailLines = getPaymentAllocationSummaryLines(container);

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    }).select('name email').lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendPaymentAllocationStatusEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentId,
          containerSerialNo,
          updatedBy,
          detailLines,
          shipmentUrl,
        })
      )
    );
  } catch (error) {
    console.error(`Payment allocation email warning for ${shipmentId}:`, error.message);
  }
};

const notifyStorageAllocationRolesByEmail = async ({
  roles = [],
  shipment,
  container,
  actor,
  approvalStage,
}) => {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length || !shipment || !container?.actual) return;

  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const updatedBy = getApprovalActorName(actor);
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';
  const containerSerialNo = getContainerSerialNo(container);
  const detailLines = getStorageAllocationSummaryLines(container);

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    }).select('name email').lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendStorageAllocationStatusEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentId,
          containerSerialNo,
          approvalStage,
          updatedBy,
          detailLines,
          shipmentUrl,
        })
      )
    );
  } catch (error) {
    console.error(`Storage allocation email warning for ${shipmentId}:`, error.message);
  }
};

const notifyPaymentCostingRolesByEmail = async ({
  roles = [],
  shipment,
  container,
  actor,
  approvalStage,
}) => {
  const normalizedRoles = Array.from(new Set((roles || []).map((role) => normalizeRole(role)).filter(Boolean)));
  if (!normalizedRoles.length || !shipment || !container?.actual) return;

  const portalBaseUrl = process.env.INTERNAL_PORTAL_BASE_URL || process.env.INTERNAL_PORTAL_URL || 'http://localhost:4200';
  const shipmentUrl = shipment?._id ? `${String(portalBaseUrl).replace(/\/$/, '')}/shipments/track/${shipment._id}` : '';
  const updatedBy = getApprovalActorName(actor);
  const shipmentId = shipment?.shipmentNo || shipment?._id?.toString() || 'N/A';
  const containerSerialNo = getContainerSerialNo(container);
  const detailLines = getPaymentCostingSummaryLines(container);

  try {
    const recipients = await User.find({
      role: { $in: normalizedRoles },
      isActive: true,
      email: { $exists: true, $ne: null },
    }).select('name email').lean();

    if (!recipients.length) return;

    const uniqueRecipients = recipients.filter((recipient, index, list) => {
      const email = String(recipient.email || '').trim().toLowerCase();
      return email && list.findIndex((entry) => String(entry.email || '').trim().toLowerCase() === email) === index;
    });

    await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendPaymentCostingStatusEmail({
          to: recipient.email,
          userName: recipient.name,
          shipmentId,
          containerSerialNo,
          approvalStage,
          updatedBy,
          detailLines,
          shipmentUrl,
        })
      )
    );
  } catch (error) {
    console.error(`Payment costing email warning for ${shipmentId}:`, error.message);
  }
};

const REPORT_STATUS_ETD_UNCONFIRMED = 'ETD yet to be confirmed';
const REPORT_STATUS_ETD_DUE = 'ETA yet to Due';

const SHIPMENT_REPORT_COLUMNS = [
  { header: 'S/N', key: 'sn', width: 8 },
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Shipment No.', key: 'shipmentNo', width: 24 },
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Supplier', key: 'supplier', width: 28 },
  { header: 'Country', key: 'country', width: 16 },
  { header: 'Variant', key: 'variant', width: 18 },
  { header: 'Item Description', key: 'itemDescription', width: 34 },
  { header: 'Rice Name', key: 'riceName', width: 18 },
  { header: 'Packing', key: 'packing', width: 12 },
  { header: 'PI No.', key: 'piNo', width: 20 },
  // LPO Number = shipment.fpoNo — same field the "PO No." label on the Shipment Summary step
  // reads (fpoNo first, poNumber/orderNumber only as fallback). shipment.poNumber is a
  // different, internal reference code and is NOT what the client means by "LPO Number".
  { header: 'LPO Number', key: 'fpoNo', width: 20 },
  { header: 'Foreign / Local', key: 'foreignLocal', width: 14 },
  { header: 'FCL', key: 'fcl', width: 10 },
  { header: 'Cont. Size', key: 'containerSize', width: 12 },
  { header: 'Buying Unit', key: 'buyingUnit', width: 14 },
  { header: 'Buying Qty (MT)', key: 'buyingQtyMT', width: 16 },
  { header: 'FC per Unit', key: 'fcPerUnit', width: 14 },
  { header: 'Total FC', key: 'totalFC', width: 16 },
  { header: 'Inco Terms', key: 'incoterms', width: 14 },
  { header: 'FPO Number', key: 'fpoNo', width: 20 },
  { header: 'Bank Name', key: 'bankName', width: 18 },
  { header: 'Payment Terms', key: 'paymentTerms', width: 18 },
  { header: 'Shipment Status', key: 'shipmentStatus', width: 22 },
  { header: 'No. of Shipments', key: 'noOfShipments', width: 16 },
  { header: 'Port of Loading', key: 'portOfLoading', width: 20 },
  { header: 'Port of Discharge', key: 'portOfDischarge', width: 20 },
  { header: 'Advance Amount', key: 'advanceAmount', width: 16 },
  { header: 'Bags', key: 'bags', width: 12 },
  { header: 'Pallet', key: 'pallet', width: 12 },
  { header: 'Report Status', key: 'reportStatus', width: 26 },
  { header: 'Batch No', key: 'qualityBatchNo', width: 18 },
  { header: 'Inhouse Report No', key: 'qualityInhouseReportNo', width: 20 },
  { header: 'Inhouse Document', key: 'qualityInhouseDocument', width: 24 },
  { header: 'Inhouse Remarks', key: 'qualityInhouseRemarks', width: 24 },
  { header: 'Third Party report No', key: 'qualityThirdPartyReportNo', width: 20 },
  { header: 'Third Party Document', key: 'qualityThirdPartyDocument', width: 24 },
  { header: 'Third Party Remarks', key: 'qualityThirdPartyRemarks', width: 24 },
];

const SHIPMENT_REPORT_CHILD_COLUMNS = [
  { header: 'Shipment Split', key: 'shipmentNo', width: 24 },
  { header: 'Actual Shipment', key: 'actualShipmentNo', width: 24 },
  { header: 'Schedule ETD', key: 'scheduledETD', width: 16 },
  { header: 'Schedule ETA', key: 'scheduledETA', width: 16 },
  { header: 'Actual ETD', key: 'actualETD', width: 16 },
  { header: 'Actual ETA', key: 'actualETA', width: 16 },
  { header: 'ETA Difference', key: 'etaDifference', width: 16 },
  { header: 'FCL', key: 'fcl', width: 10 },
  { header: 'Cont. Size', key: 'containerSize', width: 12 },
  { header: 'Buying Qty (MT)', key: 'buyingQtyMT', width: 16 },
  { header: 'Bags', key: 'bags', width: 12 },
  { header: 'Pallet', key: 'pallet', width: 12 },
  { header: 'Month', key: 'month', width: 12 },
  { header: 'Week', key: 'weekWiseShipment', width: 12 },
  { header: 'Status', key: 'shipmentStatus', width: 22 },
];

// Roll every container's quality data for a shipment into one flat set of report cells.
// Rule: first non-empty value wins (documented in the plan). The data model carries a single
// `remarks` per quality row — surfaced here as "Third Party Remarks" — while the dedicated
// in-house remark lives in the newer `inhouseRemarks` field.
const aggregateShipmentQuality = (shipmentContainers = []) => {
  const out = {
    qualityBatchNo: '',
    qualityInhouseReportNo: '',
    qualityInhouseDocument: '',
    qualityInhouseRemarks: '',
    qualityThirdPartyReportNo: '',
    qualityThirdPartyDocument: '',
    qualityThirdPartyRemarks: '',
  };
  const take = (key, value) => {
    if (!out[key] && value != null && String(value).trim() !== '') out[key] = String(value).trim();
  };

  for (const container of shipmentContainers) {
    const actual = container?.actual || {};
    for (const split of Array.isArray(actual.storageSplits) ? actual.storageSplits : []) {
      take('qualityBatchNo', split?.batch);
    }
    for (const row of Array.isArray(actual.qualityRows) ? actual.qualityRows : []) {
      take('qualityInhouseReportNo', row?.inhouseReportNo);
      take('qualityInhouseDocument', row?.inhouseReportDocumentName);
      take('qualityInhouseRemarks', row?.inhouseRemarks);
      take('qualityThirdPartyReportNo', row?.thirdPartyReportNo);
      take('qualityThirdPartyDocument', row?.thirdPartyReportDocumentName);
      take('qualityThirdPartyRemarks', row?.remarks);
    }
  }
  return out;
};

// Sum the per-container actual figures (qtyMT / bags / pallet) a shipment currently holds.
// B/L Details (step 3) is the manual source of truth for these, so the report parent row
// reflects them once they're entered; until then it falls back to the ordered/shipment value.
const aggregateShipmentActuals = (shipmentContainers = []) => {
  let qtyMT = 0, bags = 0, pallet = 0, has = false;
  for (const container of shipmentContainers) {
    const a = container && container.actual;
    if (!a) continue;
    if (Number(a.qtyMT) > 0) { qtyMT += Number(a.qtyMT); has = true; }
    if (Number(a.bags) > 0) { bags += Number(a.bags); has = true; }
    if (Number(a.pallet) > 0) { pallet += Number(a.pallet); has = true; }
  }
  return has ? { qtyMT, bags, pallet } : null;
};

const QUALITY_DOCUMENT_KEYS = new Set(['qualityInhouseDocument', 'qualityThirdPartyDocument']);

const formatReportCellValue = (value, key) => {
  // "No document uploaded" is a real state a reviewer needs to see, not a blank gap.
  if ((value == null || value === '') && QUALITY_DOCUMENT_KEYS.has(key)) return 'Not Available';
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (['fcPerUnit', 'totalFC', 'advanceAmount'].includes(key)) {
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    if (['bags', 'pallet', 'buyingQtyMT', 'fcl', 'noOfShipments'].includes(key)) {
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value;
  }
  return String(value);
};

const getDisplayStageName = (stage) => {
  const normalizedStage = String(stage || '').trim();
  if (normalizedStage === 'Planned Split') return 'Shipment Split';
  if (normalizedStage === 'Port & Customs') return 'Port and Clearance';
  return normalizedStage;
};

const hasMeaningfulActualData = (container) => {
  const actual = Array.isArray(container?.actual) ? container.actual[0] || {} : container?.actual || {};
  return (
    hasValue(actual?.actualSerialNo) ||
    hasValue(actual?.commercialInvoiceNo) ||
    !!toDateOrNull(actual?.shipOnBoardDate) ||
    !!toDateOrNull(actual?.updatedETD) ||
    !!toDateOrNull(actual?.updatedETA) ||
    hasValue(actual?.BLNo) ||
    hasValue(actual?.portOfLoading) ||
    hasValue(actual?.portOfDischarge) ||
    Number(actual?.qtyMT || 0) > 0 ||
    Number(actual?.bags || 0) > 0 ||
    Number(actual?.FCL || 0) > 0 ||
    Number(actual?.pallet || 0) > 0
  );
};

const getStartOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const getShipmentMonthLabel = (shipment, shipmentContainers = []) => {
  const candidateDates = [
    ...shipmentContainers.flatMap((container) => [
      container?.planned?.eta,
      container?.planned?.etd,
      container?.actual?.updatedETA,
      container?.actual?.updatedETD,
    ]),
    shipment?.plannedETA,
    shipment?.plannedETD,
    shipment?.orderDate,
    shipment?.createdAt,
  ]
    .map((value) => toDateOrNull(value))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  const firstDate = candidateDates[0];
  return firstDate ? firstDate.toLocaleString('en-US', { month: 'short' }) : '';
};

const hasScheduledShipmentData = (shipment, shipmentContainers = []) => {
  if (toDateOrNull(shipment?.plannedETD) || toDateOrNull(shipment?.plannedETA)) return true;
  return shipmentContainers.some((container) =>
    toDateOrNull(container?.planned?.etd) || toDateOrNull(container?.planned?.eta)
  );
};

const getShipmentReportStatus = (shipment, shipmentContainers = []) => {
  if (!hasScheduledShipmentData(shipment, shipmentContainers)) {
    return REPORT_STATUS_ETD_UNCONFIRMED;
  }
  return getComputedShipmentStatus(shipment, shipmentContainers);
};

const normalizeReportText = (value) => String(value ?? '').trim().toLowerCase();

const normalizeReportFilters = (query = {}) => ({
  date: String(query.date || '').trim(),
  month: String(query.month || '').trim(),
  supplier: normalizeReportText(query.supplier),
  status: normalizeReportText(query.status),
  portOfDischarge: normalizeReportText(query.portOfDischarge),
  portOfLoading: normalizeReportText(query.portOfLoading),
  item: normalizeReportText(query.item),
});

const formatDateOnlyForFilter = (value) => {
  const date = toDateOrNull(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
};

const getReportMonthFilterValues = (row) => {
  const values = new Set();
  const addMonth = (value) => {
    if (!value) return;
    const raw = String(value).trim();
    if (!raw) return;
    values.add(raw.toLowerCase());
    const parsed = toDateOrNull(raw);
    if (parsed) {
      values.add(parsed.toISOString().slice(0, 7).toLowerCase());
      values.add(parsed.toLocaleString('en-US', { month: 'short' }).toLowerCase());
      values.add(parsed.toLocaleString('en-US', { month: 'long' }).toLowerCase());
    }
  };

  (row.monthFilterValues || []).forEach(addMonth);
  addMonth(row.month);
  (row.children || []).forEach((child) => {
    addMonth(child.month);
    addMonth(child.scheduledETA);
    addMonth(child.scheduledETD);
  });
  return values;
};

const reportContains = (value, needle) => !needle || normalizeReportText(value).includes(needle);

const childMatchesReportStatus = (child, status) =>
  !status || reportContains(child.shipmentStatus, status) || reportContains(child.currentStage, status);

const applyShipmentReportFilters = (rows = [], filters = {}) => {
  const normalized = normalizeReportFilters(filters);
  const hasFilters = Object.values(normalized).some(Boolean);
  if (!hasFilters) return rows;

  return rows.filter((row) => {
    const childRows = Array.isArray(row.children) ? row.children : [];
    const monthValues = getReportMonthFilterValues(row);
    const monthMatches = !normalized.month || monthValues.has(normalized.month.toLowerCase());
    const dateMatches = !normalized.date || row.dateFilterValue === normalized.date || formatDateOnlyForFilter(row.date) === normalized.date;
    const statusMatches =
      !normalized.status ||
      reportContains(row.shipmentStatus, normalized.status) ||
      reportContains(row.reportStatus, normalized.status) ||
      childRows.some((child) => childMatchesReportStatus(child, normalized.status));

    return (
      dateMatches &&
      monthMatches &&
      reportContains(row.supplier, normalized.supplier) &&
      statusMatches &&
      reportContains(row.portOfDischarge, normalized.portOfDischarge) &&
      reportContains(row.portOfLoading, normalized.portOfLoading) &&
      (
        reportContains(row.itemDescription, normalized.item) ||
        reportContains(row.riceName, normalized.item) ||
        childRows.some((child) => reportContains(child.shipmentNo, normalized.item))
      )
    );
  });
};

const parseReportColumnKeys = (value) =>
  String(value || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

const selectReportColumns = (availableColumns, selectedKeys) => {
  const allowed = new Set(availableColumns.map((column) => column.key));
  const selected = parseReportColumnKeys(selectedKeys).filter((key) => allowed.has(key));
  if (!selected.length) return availableColumns;
  const selectedSet = new Set(selected);
  return availableColumns.filter((column) => selectedSet.has(column.key));
};

const getComputedContainerShipmentStatus = (shipment, container) => {
  if (!container) {
    const fallback = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
    return fallback === 'Shipment Entry' ? REPORT_STATUS_ETD_UNCONFIRMED : fallback;
  }
  if (hasSavedStorageArrivalData(container)) return 'Delivered WH';
  if (hasArrivedAtPortOfDischarge(shipment, container)) return 'At Port of Discharge';
  if (hasOnTransitStatus(shipment, container)) return 'On Transit';

  // "ETA yet to Due" only once THIS container's own actual documentation (BL/CI/ship-on-board/
  // ETD/ETA) has actually been saved but ETD hasn't passed yet — never just because the
  // PARENT shipment/container has SOME planned ETD. Otherwise a fully-documented container and
  // a completely untouched one collapse into the identical label.
  const scheduledEtd = toDateOrNull(container?.planned?.etd || shipment?.plannedETD);
  if (scheduledEtd && hasTransitActualMilestone(container)) {
    return REPORT_STATUS_ETD_DUE;
  }

  if (!hasTransitActualMilestone(container)) return REPORT_STATUS_ETD_UNCONFIRMED;

  const fallback = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
  return fallback === 'Shipment Entry' ? REPORT_STATUS_ETD_UNCONFIRMED : fallback;
};

// Rank per container status — higher = further along. Anything not in this table (including
// REPORT_STATUS_ETD_UNCONFIRMED and generic workflow-stage fallback names) is treated as the
// lowest tier, "not meaningfully progressed yet".
const SHIPMENT_STATUS_RANK = {
  'Delivered WH': 4,
  'At Port of Discharge': 3,
  'On Transit': 2,
  [REPORT_STATUS_ETD_DUE]: 1,
};

// A shipment's DISPLAYED overall status — used by the Order/Shipment list, shipment detail,
// dashboard summary, and report exports. Deliberately "least advanced container wins" (a
// shipment is only as far along as its slowest container), NOT "most advanced wins": with the
// old getComputedShipmentStatus, a single at-port container made the WHOLE shipment report "At
// Port of Discharge" even while other containers were still fully unscheduled, permanently
// masking them — confirmed against real data, zero shipments in the DB could ever compute to
// "ETA yet to Due" because of this, making that filter option structurally dead.
// NOT used for role-visibility gates (getOnTransitOrLaterShipmentIds/getAtPortOrLaterShipmentIds
// deliberately keep the OLD "any container reached this stage" semantics via
// getComputedShipmentStatus/getShipmentReportStatus below — a warehouse manager should see a
// shipment the moment ONE container arrives, not wait for the slowest one to catch up).
const getShipmentOverallStatus = (shipment, shipmentContainers = []) => {
  if (!shipmentContainers.length) {
    return getComputedContainerShipmentStatus(shipment, null);
  }
  let worst = null;
  let worstRank = Infinity;
  shipmentContainers.forEach((container) => {
    const status = getComputedContainerShipmentStatus(shipment, container);
    const rank = SHIPMENT_STATUS_RANK[status] ?? 0;
    if (rank < worstRank) {
      worstRank = rank;
      worst = status;
    }
  });
  return worst;
};

const getComputedShipmentStatus = (shipment, shipmentContainers = []) => {
  if (shipmentContainers.length && shipmentContainers.every((container) => hasSavedStorageArrivalData(container))) {
    return 'Delivered WH';
  }

  if (shipmentContainers.some((container) => hasArrivedAtPortOfDischarge(shipment, container))) {
    return 'At Port of Discharge';
  }

  if (shipmentContainers.some((container) => hasOnTransitStatus(shipment, container))) {
    return 'On Transit';
  }

  // "ETA yet to Due" only counts containers whose own actual docs (BL/CI/ship-on-board/
  // ETD/ETA) are actually saved — a container with zero actual data must fall through to
  // REPORT_STATUS_ETD_UNCONFIRMED ("Shipment Not Scheduled"), not borrow another container's
  // planned ETD just because it exists somewhere on the shipment.
  const pendingScheduledDates = shipmentContainers
    .filter((container) => hasTransitActualMilestone(container))
    .filter((container) => !hasOnTransitStatus(shipment, container) && !hasArrivedAtPortOfDischarge(shipment, container))
    .map((container) => toDateOrNull(container?.planned?.etd || shipment?.plannedETD))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (pendingScheduledDates.length) {
    return REPORT_STATUS_ETD_DUE;
  }

  const anyContainerHasMilestone = shipmentContainers.some((container) => hasTransitActualMilestone(container));
  const shipmentLevelEtd = anyContainerHasMilestone ? toDateOrNull(shipment?.plannedETD) : null;
  if (shipmentLevelEtd) {
    return REPORT_STATUS_ETD_DUE;
  }

  const fallback = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
  return fallback === 'Shipment Entry' ? REPORT_STATUS_ETD_UNCONFIRMED : fallback;
};

const DASHBOARD_STATUS_COLUMNS = [
  'Delivered WH',
  'At the Port',
  'On Transit',
  REPORT_STATUS_ETD_DUE,
  REPORT_STATUS_ETD_UNCONFIRMED,
];

const getDashboardStatusColumn = (shipment, container) => {
  if (hasSavedStorageArrivalData(container)) return 'Delivered WH';
  if (hasArrivedAtPortOfDischarge(shipment, container)) return 'At the Port';
  if (hasOnTransitStatus(shipment, container)) return 'On Transit';

  // "ETA yet to Due" only once real actual documentation is saved (BL/CI/ship-on-board/ETD/ETA)
  // — a bare planned.etd alone (set at order creation, before anything real happens) isn't
  // enough. Same fix already applied to getComputedContainerShipmentStatus; this function
  // (Status Snapshot + both pivot charts + Dynamic Metrics Explorer) had the same gap.
  const plannedEtd = toDateOrNull(container?.planned?.etd || shipment?.plannedETD);
  if (plannedEtd && hasTransitActualMilestone(container)) return REPORT_STATUS_ETD_DUE;

  return REPORT_STATUS_ETD_UNCONFIRMED;
};

const getDashboardChildQuantity = (shipment, container, splitCount) => {
  const actual = container?.actual || {};
  const planned = container?.planned || {};
  return Number(getContainerReportNumber(actual.qtyMT, planned.qtyMT, shipment?.plannedQtyMT, splitCount) || 0);
};

const getDashboardChildFcl = (shipment, container, splitCount) => {
  const actual = container?.actual || {};
  const planned = container?.planned || {};
  return Number(getContainerReportNumber(actual.FCL, planned.FCL, shipment?.fcl, splitCount) || 0);
};

// Returns an ARRAY of labels a shipment contributes to for the given grouping — plural because
// a multi-line-item shipment must contribute to EACH of its distinct items' own rows, not one
// combined comma-joined row (that combined string was showing up as its own near-duplicate row,
// separate from the same items' standalone rows elsewhere in the chart). Quantity tracking lives
// at the container level, not per line-item, so each distinct item gets the shipment's FULL
// quantity/status added to its row (confirmed acceptable — simplest option, no fabricated split).
const getDashboardPivotLabels = (shipment, groupBy) => {
  if (groupBy === 'item') {
    const lineItems = Array.isArray(shipment?.lineItems) ? shipment.lineItems : [];
    const distinctDescriptions = [...new Set(
      lineItems.map((item) => String(item?.itemDescription || '').trim()).filter(Boolean)
    )];
    if (distinctDescriptions.length) return distinctDescriptions;
    return [
      shipment?.itemId?.description
        || shipment?.itemDescription
        || shipment?.item
        || 'Unknown Item'
    ];
  }
  return [shipment?.supplierId?.name || shipment?.supplierName || 'Unknown Supplier'];
};

// Internal status-classification strings (REPORT_STATUS_ETD_DUE/_UNCONFIRMED) are matched
// against elsewhere in this file and possibly stored data — kept unchanged. Only the DISPLAYED
// label is renamed here, mirroring the Status Snapshot table's STATUS_SNAPSHOT_CONFIG labels,
// so the two stay consistent throughout the dashboard.
const displayDashboardStatusColumn = (column) => {
  if (column === REPORT_STATUS_ETD_DUE) return 'ETD yet to Due';
  if (column === REPORT_STATUS_ETD_UNCONFIRMED) return 'Shipment Not Scheduled';
  return column;
};

const buildDashboardStatusPivot = (shipments, containerMap, groupBy = 'supplier') => {
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const columns = DASHBOARD_STATUS_COLUMNS.map((column) => {
    const display = displayDashboardStatusColumn(column);
    return column === REPORT_STATUS_ETD_DUE ? `${display} - ${currentMonth}` : display;
  });
  const rowMap = new Map();
  const totals = Object.fromEntries(columns.map((column) => [column, 0]));
  const totalsFCL = Object.fromEntries(columns.map((column) => [column, 0]));

  const addValue = (label, column, qty, fcl = 0) => {
    if (!qty && !fcl) return;
    const row = rowMap.get(label) || {
      supplier: label,
      values: Object.fromEntries(columns.map((statusColumn) => [statusColumn, 0])),
      valuesFCL: Object.fromEntries(columns.map((statusColumn) => [statusColumn, 0])),
      grandTotal: 0,
      grandTotalFCL: 0,
    };

    row.values[column] += qty;
    row.valuesFCL[column] += fcl;
    row.grandTotal += qty;
    row.grandTotalFCL += fcl;
    totals[column] += qty;
    totalsFCL[column] += fcl;
    rowMap.set(label, row);
  };

  shipments.forEach((shipment) => {
    const labels = getDashboardPivotLabels(shipment, groupBy);
    const shipmentContainers = containerMap.get(String(shipment._id)) || [];
    const splitCount = getShipmentSplitCount(shipment, shipmentContainers);

    if (!shipmentContainers.length) {
      labels.forEach((label) => addValue(
        label,
        displayDashboardStatusColumn(REPORT_STATUS_ETD_UNCONFIRMED),
        Number(shipment?.plannedQtyMT || shipment?.totalOrderedQtyMT || 0),
        Number(shipment?.fcl || 0)
      ));
      return;
    }

    shipmentContainers.forEach((container) => {
      const baseColumn = getDashboardStatusColumn(shipment, container);
      const displayBase = displayDashboardStatusColumn(baseColumn);
      const column = baseColumn === REPORT_STATUS_ETD_DUE ? `${displayBase} - ${currentMonth}` : displayBase;
      const qty = getDashboardChildQuantity(shipment, container, splitCount);
      const fcl = getDashboardChildFcl(shipment, container, splitCount);
      labels.forEach((label) => addValue(label, column, qty, fcl));
    });
  });

  const rows = Array.from(rowMap.values())
    .map((row) => ({
      ...row,
      grandTotal: Number(row.grandTotal.toFixed(2)),
      grandTotalFCL: Number(row.grandTotalFCL.toFixed(2)),
      values: Object.fromEntries(Object.entries(row.values).map(([column, value]) => [column, Number(value.toFixed(2))])),
      valuesFCL: Object.fromEntries(Object.entries(row.valuesFCL).map(([column, value]) => [column, Number(value.toFixed(2))])),
    }))
    .filter((row) => row.grandTotal > 0 || row.grandTotalFCL > 0)
    .sort((a, b) => a.supplier.localeCompare(b.supplier));

  const roundedTotals = Object.fromEntries(
    Object.entries(totals).map(([column, value]) => [column, Number(value.toFixed(2))])
  );
  const roundedTotalsFCL = Object.fromEntries(
    Object.entries(totalsFCL).map(([column, value]) => [column, Number(value.toFixed(2))])
  );

  return {
    asOfDate: new Date(),
    valueLabel: 'Sum of Buying Qty (MT)',
    fclLabel: 'Total FCL',
    rowLabel: groupBy === 'item' ? 'Item' : 'Supplier',
    columns,
    rows,
    totals: roundedTotals,
    totalsFCL: roundedTotalsFCL,
    grandTotal: Number(Object.values(roundedTotals).reduce((sum, value) => sum + Number(value || 0), 0).toFixed(2)),
    grandTotalFCL: Number(Object.values(roundedTotalsFCL).reduce((sum, value) => sum + Number(value || 0), 0).toFixed(2)),
  };
};

const buildDashboardRStatusMetrics = (shipments, containerMap) => {
  // Each bucket tracks the count (quantity), plus summed FCL and MT (buying qty) volume
  // so the dashboard Status Snapshot can show STATUS / QUANTITY / FCL / MT per row.
  const labelOrder = [
    'At The Port',
    'On Transit',
    'ETA Yet To Due',
    'ETD Yet To Be Confirmed',
    'Total LPO',
    'Total Shipments',
    'Open LPO',
    'Completed LPO',
    'Delivered WH',
  ];
  const metrics = {};
  labelOrder.forEach((label) => {
    metrics[label] = { count: 0, fcl: 0, mt: 0 };
  });
  const permissionKeys = {
    'At The Port': 'dashboard.snapshot.at_port.view',
    'On Transit': 'dashboard.snapshot.on_transit.view',
    'ETA Yet To Due': 'dashboard.snapshot.eta_due.view',
    'ETD Yet To Be Confirmed': 'dashboard.snapshot.etd_unconfirmed.view',
    'Total LPO': 'dashboard.snapshot.total_lpo.view',
    'Total Shipments': 'dashboard.snapshot.total_shipments.view',
    'Open LPO': 'dashboard.snapshot.open_lpo.view',
    'Completed LPO': 'dashboard.snapshot.completed_lpo.view',
    'Delivered WH': 'dashboard.snapshot.delivered_wh.view',
  };

  const add = (label, count, mt, fcl) => {
    const bucket = metrics[label];
    if (!bucket) return;
    bucket.count += count || 0;
    bucket.mt += Number(mt) || 0;
    bucket.fcl += Number(fcl) || 0;
  };

  shipments.forEach((shipment) => {
    const shipmentContainers = containerMap.get(String(shipment._id)) || [];
    const splitCount = getShipmentSplitCount(shipment, shipmentContainers);
    // Always count every container that actually exists in the DB — `splitCount` (the
    // manually-confirmed "No of Shipments" field) is only used below to model containers
    // that are PLANNED but not yet created (splitCount > actual containers). It must never
    // truncate real container rows, since that stored count can go stale (e.g. a row gets
    // added after the last time someone clicked "Confirm") and silently hide real, later
    // containers — including their status — from every dashboard bucket.
    const dashboardContainers = shipmentContainers;
    const missingSplitCount = Math.max(splitCount - dashboardContainers.length, 0);
    const isPendingEntryStage = isShipmentEntryPendingSchedule(shipment);
    const pendingEntryCount = isPendingEntryStage ? 1 : 0;

    // Planned (LPO-level) volume, used as a fallback when container data is missing.
    const plannedMt = Number(shipment?.plannedQtyMT || shipment?.totalOrderedQtyMT || 0) || 0;
    const plannedFcl = Number(shipment?.fcl || 0) || 0;

    // Per-shipment FCL/MT from container data (falls back to planned when no containers).
    const containerMt = dashboardContainers.reduce(
      (sum, container) => sum + getDashboardChildQuantity(shipment, container, splitCount),
      0
    );
    const containerFcl = dashboardContainers.reduce(
      (sum, container) => sum + getDashboardChildFcl(shipment, container, splitCount),
      0
    );
    const missingShare = missingSplitCount ? missingSplitCount / Math.max(splitCount, 1) : 0;
    const missingMt = plannedMt * missingShare;
    const missingFcl = plannedFcl * missingShare;
    const lpoMt = dashboardContainers.length ? containerMt + missingMt : plannedMt;
    const lpoFcl = dashboardContainers.length ? containerFcl + missingFcl : plannedFcl;

    // Total LPO — one row per shipment, carrying the whole LPO volume.
    add('Total LPO', 1, lpoMt, lpoFcl);

    if (!shipmentContainers.length && !missingSplitCount) {
      add('Open LPO', 1, lpoMt, lpoFcl);
      if (pendingEntryCount) {
        add('Total Shipments', pendingEntryCount, plannedMt, plannedFcl);
        add('ETD Yet To Be Confirmed', pendingEntryCount, plannedMt, plannedFcl);
      }
      return;
    }

    add('Total Shipments', dashboardContainers.length + missingSplitCount, containerMt + missingMt, containerFcl + missingFcl);
    add('ETD Yet To Be Confirmed', missingSplitCount, missingMt, missingFcl);

    // Completed = judged at SHIPMENT level from the storage-arrival rows, not per container doc.
    // All arrival rows for a shipment can live inside one container doc's storageSplits (other
    // container docs may be empty), so `every(container hasSaved)` wrongly fails. Instead: the
    // LPO is complete when it has arrival rows and every row is recorded (GRN + batch present,
    // same "Recorded" definition the UI uses), with no planned-but-missing containers.
    const arrivalRows = dashboardContainers.reduce(
      (acc, container) => acc.concat(Array.isArray(container?.actual?.storageSplits) ? container.actual.storageSplits : []),
      []
    );
    const isRowRecorded = (row) => !!String(row?.grn || '').trim() && !!String(row?.batch || '').trim();
    // `arrivalRows.every(isRowRecorded)` alone is not enough — a container with 20 expected
    // containers but only 3 storageSplits rows saved (17 never even started) passes trivially
    // since every EXISTING row is recorded. Also require the row count to match each container's
    // real expected count (see getExpectedContainerSerialCount — NOT the manually-typed
    // `noOfContainers` BL Details field, which is confirmed stale/doubled against real data), so a
    // partially-started arrival can't read as complete just because nobody has touched the
    // remaining rows yet.
    const expectedContainerCount = dashboardContainers.reduce(
      (sum, container) => sum + getExpectedContainerSerialCount(container),
      0
    );
    const isCompletedLpo =
      missingSplitCount === 0 &&
      arrivalRows.length > 0 &&
      (expectedContainerCount === 0 || arrivalRows.length >= expectedContainerCount) &&
      arrivalRows.every(isRowRecorded);
    if (isCompletedLpo) add('Completed LPO', 1, lpoMt, lpoFcl);
    else add('Open LPO', 1, lpoMt, lpoFcl);

    dashboardContainers.forEach((container) => {
      const status = isPendingEntryStage ? REPORT_STATUS_ETD_UNCONFIRMED : getDashboardStatusColumn(shipment, container);
      const mt = getDashboardChildQuantity(shipment, container, splitCount);
      const fcl = getDashboardChildFcl(shipment, container, splitCount);
      if (status === 'Delivered WH') add('Delivered WH', 1, mt, fcl);
      else if (status === 'On Transit') add('On Transit', 1, mt, fcl);
      else if (status === 'At the Port') add('At The Port', 1, mt, fcl);
      else if (status === REPORT_STATUS_ETD_DUE || status === 'ETD yet to Due' || status === 'ETA yet to due') add('ETA Yet To Due', 1, mt, fcl);
      else add('ETD Yet To Be Confirmed', 1, mt, fcl);
    });
  });

  return labelOrder.map((label) => ({
    label,
    value: metrics[label].count,
    quantity: metrics[label].count,
    fcl: Number(metrics[label].fcl.toFixed(2)),
    mt: Number(metrics[label].mt.toFixed(2)),
    permissionKey: permissionKeys[label],
  }));
};

const getMeaningfulNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

const getShipmentSplitCount = (shipment, shipmentContainers = []) => {
  return Number(shipment?.noOfShipments || shipment?.assumedContainerCount || shipmentContainers.length || 0) || 0;
};

const isShipmentEntryPendingSchedule = (shipment) => {
  const stage = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
  return stage === 'Shipment Entry';
};

const getContainerDividendValue = (totalValue, splitCount) => {
  const total = Number(totalValue) || 0;
  const count = Number(splitCount) || 0;
  if (!total || !count) return '';
  return Math.round(total / count);
};

const getContainerReportNumber = (actualValue, plannedValue, totalValue, splitCount) => {
  return (
    getMeaningfulNumber(actualValue) ??
    getMeaningfulNumber(plannedValue) ??
    getContainerDividendValue(totalValue, splitCount)
  );
};

const hasValue = (value) => String(value ?? '').trim().length > 0;

const generateTempPassword = (length = Number(process.env.INVITE_PASSWORD_LENGTH || 10)) => {
  const targetLength = Number.isFinite(length) && length >= 8 ? length : 10;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(targetLength);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

const generateSupplierCode = async () => {
  let unique = false;
  let code = '';

  while (!unique) {
    code = `SUP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await Supplier.findOne({ supplierCode: code }).lean();
    if (!existing) {
      unique = true;
    }
  }

  return code;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCatalogKey = (value) => String(value || '').trim().toUpperCase();

const findSupplierByName = async (name) => {
  if (!hasValue(name)) return null;
  const normalizedName = escapeRegex(String(name).trim());
  return Supplier.findOne({
    $or: [{ name: new RegExp(`^${normalizedName}$`, 'i') }, { companyName: new RegExp(`^${normalizedName}$`, 'i') }],
  });
};

const ensureSupplierPortalAccessForShipment = async (shipment) => {
  const normalizedSupplierEmail = normalizeEmail(shipment?.supplierEmail);
  if (!hasValue(normalizedSupplierEmail) || !hasValue(shipment?.supplierName)) {
    return {
      supplier: shipment?.supplierId ? await Supplier.findById(shipment.supplierId) : null,
      supplierCreated: false,
      inviteSent: null,
      inviteStatusMessage: '',
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSupplierEmail)) {
    throw new Error('A valid supplierEmail is required before locking the baseline.');
  }

  let supplier = shipment?.supplierId ? await Supplier.findById(shipment.supplierId) : null;
  let supplierAccount = null;
  let supplierCreated = false;
  let inviteSent = null;
  let inviteStatusMessage = '';
  let temporaryPassword = '';

  if (supplier) {
    supplierAccount = await SupplierAccount.findOne({ supplierId: supplier._id });
  } else {
    supplierAccount = await SupplierAccount.findOne({ email: normalizedSupplierEmail });
    if (supplierAccount) {
      supplier = await Supplier.findById(supplierAccount.supplierId);
    }

    if (!supplier) {
      supplier = await Supplier.findOne({ contactEmail: normalizedSupplierEmail });
      if (supplier) {
        supplierAccount = await SupplierAccount.findOne({ supplierId: supplier._id });
      }
    }

    if (!supplier) {
      supplier = await findSupplierByName(shipment.supplierName);
      if (supplier) {
        supplierAccount = await SupplierAccount.findOne({ supplierId: supplier._id });
      }
    }
  }

  if (!supplier) {
    if (!hasValue(shipment.countryOfOrigin)) {
      throw new Error('Country of origin is required to create a new supplier invite.');
    }

    const supplierCode = await generateSupplierCode();
    const onboardingState = calculateSupplierOnboardingState({
      name: shipment.supplierName,
      companyName: shipment.supplierName,
      country: shipment.countryOfOrigin,
      contactEmail: normalizedSupplierEmail,
    });

    supplier = await Supplier.create({
      supplierCode,
      name: shipment.supplierName,
      companyName: shipment.supplierName,
      country: shipment.countryOfOrigin,
      status: 'Pending',
      contactEmail: normalizedSupplierEmail,
      registrationStage: onboardingState.registrationStage,
      profileCompletionPercent: onboardingState.profileCompletionPercent,
      profileCompletedAt: onboardingState.profileCompletedAt,
    });

    temporaryPassword = generateTempPassword();
    supplierAccount = await SupplierAccount.create({
      supplierId: supplier._id,
      email: normalizedSupplierEmail,
      password: temporaryPassword,
      isActive: true,
      mustChangePassword: true,
    });
    supplierCreated = true;
  } else if (!supplierAccount) {
    temporaryPassword = generateTempPassword();
    supplierAccount = await SupplierAccount.create({
      supplierId: supplier._id,
      email: normalizedSupplierEmail,
      password: temporaryPassword,
      isActive: true,
      mustChangePassword: true,
    });
    supplierCreated = true;
  }

  let supplierChanged = false;
  if (supplier && !supplier.contactEmail) {
    supplier.contactEmail = normalizedSupplierEmail;
    supplierChanged = true;
  }
  if (supplier && !shipment.supplierId) {
    shipment.supplierId = supplier._id;
    supplierChanged = true;
  }
  if (supplierChanged) {
    await supplier.save();
    await shipment.save();
  }

  if (temporaryPassword && supplierAccount) {
    try {
      await sendSupplierInviteEmail({
        to: supplierAccount.email,
        supplierName: supplier.name || supplier.companyName || shipment.supplierName || 'Supplier',
        temporaryPassword,
      });
      inviteSent = true;
      inviteStatusMessage = 'Invite email sent successfully.';
    } catch (mailError) {
      inviteSent = false;
      inviteStatusMessage = mailError.message || 'Supplier account was created, but invite email could not be sent.';
    }
  }

  return { supplier, supplierCreated, inviteSent, inviteStatusMessage };
};

const buildShipmentReportRows = async (filters = {}, user = null) => {
  let labelSet = null;
  let isStorekeeperUser = false;
  let matchedShipmentIds = null;

  if (user && normalizeRole(user.role || '') === 'storekeeper') {
    isStorekeeperUser = true;
    const assignedWarehouses = await Warehouse.find({ assignedStorekeepers: user._id, status: 'Active' })
      .select('name code').lean();
    const labels = assignedWarehouses.map((w) => {
      const code = String(w.code || '').trim();
      const name = String(w.name || '').trim();
      return code ? `${name} - ${code}` : name;
    });
    labelSet = new Set(labels.map(normalizeWarehouseLabelForMatch));
    matchedShipmentIds = new Set(await getStorekeeperShipmentIds(labels));
  }

  const query = isStorekeeperUser && matchedShipmentIds
    ? { _id: { $in: [...matchedShipmentIds] } }
    : {};

  const shipments = await Shipment.find(query)
    .populate('supplierId', 'name')
    .populate('itemId', 'description')
    .sort({ createdAt: -1, orderDate: -1 })
    .lean();

  const shipmentIds = shipments.map((shipment) => shipment._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .sort({ createdAt: 1 })
    .lean();

  const containerMap = new Map();
  containers.forEach((container) => {
    const key = String(container.shipmentId);
    if (!containerMap.has(key)) {
      containerMap.set(key, []);
    }
    containerMap.get(key).push(container);
  });

  const totalShipments = shipments.length;

  const rows = shipments.map((shipment, index) => {
    const shipmentContainers = containerMap.get(String(shipment._id)) || [];
    const firstContainer = shipmentContainers[0] || null;
    const actual = firstContainer?.actual || {};
    const planned = firstContainer?.planned || {};
    const splitCount = getShipmentSplitCount(shipment, shipmentContainers);
    const reportStatus = getShipmentReportStatus(shipment, shipmentContainers);
    const children = shipmentContainers
      .filter((container) => {
        if (!isStorekeeperUser) return true;
        const actual = container?.actual || {};
        const approval = actual.storageAllocationApproval;
        const approvalStatus = approval ? (approval.status || 'draft') : null;
        if (approvalStatus !== null && approvalStatus !== 'pending_warehouse_manager' && approvalStatus !== 'approved') return false;

        const allocs = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
        const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
        const decision = actual.storageAllocationDecision || {};
        const itemAllocs = Array.isArray(decision.itemAllocations) ? decision.itemAllocations : [];
        // Once transport is booked, that's the real/current destination and takes priority
        // over the (possibly stale/superseded) allocation plan — see getStorekeeperShipmentIds.
        const booked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];

        return booked.length
          ? booked.some((b) => labelSet.has(normalizeWarehouseLabelForMatch(b.warehouse)))
          : allocs.some((a) => labelSet.has(normalizeWarehouseLabelForMatch(a.warehouse))) ||
            splits.some((s) => labelSet.has(normalizeWarehouseLabelForMatch(s.warehouse))) ||
            itemAllocs.some((item) =>
              (Array.isArray(item.allocations) ? item.allocations : []).some((a) =>
                labelSet.has(normalizeWarehouseLabelForMatch(a.warehouse))
              )
            );
      })
      .map((container, childIndex) => {
      const childActual = container?.actual || {};
      const childPlanned = container?.planned || {};
      const scheduledEtdSource = childPlanned.etd || shipment.plannedETD;
      const scheduledEtaSource = childPlanned.eta || shipment.plannedETA;
      const actualEtdSource = childActual.updatedETD || '';
      const actualEtaSource = childActual.updatedETA || '';
      const childMonthSource = scheduledEtaSource || scheduledEtdSource || actualEtaSource || actualEtdSource;
      const childMonth = getShipmentMonthLabel({ plannedETA: childMonthSource, plannedETD: childMonthSource }, []);
      return {
        rowType: 'child',
        shipmentNo: getScheduledShipmentId(shipment, childIndex),
        actualShipmentNo: childActual.actualSerialNo || '',
        scheduledETD: formatDateValue(scheduledEtdSource),
        scheduledETA: formatDateValue(scheduledEtaSource),
        actualETD: formatDateValue(actualEtdSource),
        actualETA: formatDateValue(actualEtaSource),
        etaDifference: formatDateDifferenceDays(actualEtaSource, scheduledEtaSource),
        fcl: childActual.FCL ?? childPlanned.FCL ?? '',
        containerSize: childActual.size || childPlanned.size || shipment.containersize || '',
        buyingQtyMT: childActual.qtyMT ?? childPlanned.qtyMT ?? '',
        bags: getContainerReportNumber(childActual.bags, childPlanned.bags, shipment.bags, splitCount),
        pallet: getContainerReportNumber(childActual.pallet, childPlanned.pallet, shipment.pallet, splitCount),
        month: childMonth,
        monthFilterValues: [
          formatDateOnlyForFilter(scheduledEtaSource).slice(0, 7),
          formatDateOnlyForFilter(scheduledEtdSource).slice(0, 7),
          childMonth,
        ].filter(Boolean),
        weekWiseShipment: childActual.weekWiseShipment || childPlanned.weekWiseShipment || '',
        shipmentStatus: getComputedContainerShipmentStatus(shipment, container),
        currentStage: getComputedContainerShipmentStatus(shipment, container),
      };
    });

    const shipmentActuals = aggregateShipmentActuals(shipmentContainers);

    return {
      rowType: 'parent',
      sn: totalShipments - index,
      year: shipment.year || '',
      shipmentNo: shipment.shipmentNo || '',
      actualShipmentNo: '',
      date: formatDateValue(shipment.orderDate),
      dateFilterValue: formatDateOnlyForFilter(shipment.orderDate),
      supplier: shipment.supplierId?.name || shipment.supplierName || '',
      country: shipment.countryOfOrigin || '',
      variant: shipment.variant || '',
      itemDescription: shipment.itemId?.description || shipment.itemDescription || '',
      riceName: shipment.brandName || '',
      packing: shipment.packing || '',
      piNo: shipment.piNo || '',
      foreignLocal: shipment.isLocal ? 'Local' : 'Foreign',
      ciNo: actual.commercialInvoiceNo || '',
      fcl: shipment.fcl ?? '',
      containerSize: shipment.containersize || actual.size || planned.size || '',
      buyingUnit: shipment.buyunit || actual.buyingUnit || planned.buyingUnit || '',
      buyingQtyMT: shipmentActuals?.qtyMT ?? shipment.plannedQtyMT ?? shipment.totalOrderedQtyMT ?? '',
      fcPerUnit: shipment.fcPerUnit ?? '',
      totalFC: shipment.totalFC ?? '',
      incoterms: shipment.incoterms || '',
      poNumber: shipment.poNumber || '',
      fpoNo: shipment.fpoNo || '',
      bankName: shipment.bankName || '',
      paymentTerms: shipment.paymentTerms || '',
      shipmentStatus: reportStatus,
      reportStatus,
      currentStage: getDisplayStageName(shipment.currentStage || ''),
      noOfShipments: shipment.noOfShipments ?? shipment.assumedContainerCount ?? 0,
      portOfLoading: shipment.portOfLoading || actual.portOfLoading || '',
      portOfDischarge: shipment.portOfDischarge || actual.portOfDischarge || '',
      month: getShipmentMonthLabel(shipment, shipmentContainers),
      monthFilterValues: [
        formatDateOnlyForFilter(shipment.plannedETA).slice(0, 7),
        formatDateOnlyForFilter(shipment.plannedETD).slice(0, 7),
        ...children.flatMap((child) => child.monthFilterValues || []),
      ].filter(Boolean),
      weekWiseShipment: planned.weekWiseShipment || actual.weekWiseShipment || '',
      advanceAmount: shipment.advanceAmount ?? '',
      bags: shipmentActuals?.bags ?? shipment.bags ?? '',
      pallet: shipmentActuals?.pallet ?? shipment.pallet ?? '',
      ...aggregateShipmentQuality(shipmentContainers),
      children,
    };
  });

  return applyShipmentReportFilters(rows, filters);
};

const buildShipmentReportExportRows = (rows = [], parentColumns = SHIPMENT_REPORT_COLUMNS, childColumns = SHIPMENT_REPORT_CHILD_COLUMNS) => {
  const totalColumns = Math.max(parentColumns.length, childColumns.length + 1);
  const blankValues = () => Array.from({ length: totalColumns }, () => '');

  return rows.flatMap((row) => {
    const parentValues = blankValues();
    parentColumns.forEach((column, index) => {
      parentValues[index] = formatReportCellValue(row[column.key], column.key);
    });

    const exportRows = [{ rowType: 'parent', values: parentValues }];
    const childRows = Array.isArray(row.children) ? row.children : [];
    if (!childRows.length) return exportRows;

    exportRows.push({ rowType: 'spacer', values: blankValues() });

    const childHeaderValues = blankValues();
    childColumns.forEach((column, index) => {
      childHeaderValues[index + 1] = column.header;
    });
    exportRows.push({ rowType: 'childHeader', values: childHeaderValues });

    childRows.forEach((child) => {
      const childValues = blankValues();
      childColumns.forEach((column, index) => {
        childValues[index + 1] = formatReportCellValue(child[column.key], column.key);
      });
      exportRows.push({ rowType: 'child', values: childValues });
    });

    exportRows.push({ rowType: 'spacer', values: blankValues() });
    return exportRows;
  });
};

// Stage order — used to advance shipment status only forward
const STAGE_ORDER = [
  "Shipment Entry",
  "Planned Split",
  "Shipment Split",
  "B/L Details",
  "Documentation",
  "Port & Customs",
  "Storage",
  "Quality",
  "Payment Costing",
  "Completed"
];

const advanceShipmentStage = (shipment, newStage) => {
  const current = STAGE_ORDER.indexOf(shipment.currentStage);
  const next = STAGE_ORDER.indexOf(newStage);
  if (next > current) {
    shipment.currentStage = newStage;
  }
};

// Comma-joins the distinct values of one field across a shipment's line items — used to
// replace the old "Multiple (N)" / "Multiple Items (N)" placeholders with the actual values,
// derived at read time so it self-heals existing shipments too (no migration needed), since
// the real per-item data is already sitting in shipment.lineItems.
// Display-only fixup for warehouse labels already saved as "NAME - NAME" (when a warehouse's
// code happens to equal its name) — doesn't touch stored data, only how the export shows it.
const dedupeWarehouseLabel = (label) => String(label || '').replace(/^(.*?)\s*-\s*\1$/i, '$1');

const joinDistinctLineItemValues = (lineItems, field) => {
  if (!Array.isArray(lineItems) || !lineItems.length) return null;
  const cleaned = [...new Set(lineItems.map((item) => String(item?.[field] || '').trim()).filter(Boolean))];
  return cleaned.length ? cleaned.join(', ') : null;
};

// Warehouse labels have been saved under two forms historically ("SAJAH - SAJAH" and bare
// "SAJAH" when a warehouse's code equals its name) depending on which save path wrote them.
// Normalize both sides before comparing so storekeeper scoping doesn't silently miss rows
// saved under the form the current label-building code doesn't happen to produce.
const normalizeWarehouseLabelForMatch = (label) =>
  dedupeWarehouseLabel(String(label || '').trim()).toLowerCase();

// True when a single container's OWN warehouse data (not any sibling container's) matches
// one of the given normalized warehouse labels. Shared by shipment-level admission
// (getStorekeeperShipmentIds) and per-row filtering (a shipment can have one container that
// matches and another — e.g. still DRAFT/unallocated — that doesn't; only the matching
// container's row should ever be shown to a storekeeper).
const containerMatchesWarehouseLabelSet = (container, labelSet) => {
  const actual = container?.actual || {};
  const allocs = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
  const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
  const decision = actual.storageAllocationDecision || {};
  const itemAllocs = Array.isArray(decision.itemAllocations) ? decision.itemAllocations : [];
  // transportationBooked reflects the actual/current arrival warehouse and can be
  // RE-ROUTED away from the original storage allocation decision after booking (e.g.
  // planned for DIC, later booked to SAJAH) — once transport has been booked, that's
  // the real destination and the stale allocation plan must not also count as a match.
  // Only fall back to the allocation-plan fields when nothing has been booked yet.
  const booked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];

  // The old storageAllocationApproval gate (draft/pending_warehouse_manager/approved) was
  // built for the pre-transportationBooked workflow — a container can be genuinely booked to
  // a warehouse (real, current data) while that older approval field is still stuck on 'draft'
  // (e.g. never re-approved after a reroute). Only apply that gate when there's no booking to
  // fall back on; a real transportationBooked entry is authoritative on its own.
  if (!booked.length) {
    const approval = actual.storageAllocationApproval;
    const approvalStatus = approval ? (approval.status || 'draft') : null;
    if (approvalStatus !== null && approvalStatus !== 'pending_warehouse_manager' && approvalStatus !== 'approved') return false;
  }

  return booked.length
    ? booked.some((b) => labelSet.has(normalizeWarehouseLabelForMatch(b.warehouse)))
    : allocs.some((a) => labelSet.has(normalizeWarehouseLabelForMatch(a.warehouse))) ||
      splits.some((s) => labelSet.has(normalizeWarehouseLabelForMatch(s.warehouse))) ||
      itemAllocs.some((item) =>
        (Array.isArray(item.allocations) ? item.allocations : []).some((a) =>
          labelSet.has(normalizeWarehouseLabelForMatch(a.warehouse))
        )
      );
};

// Returns shipment IDs for containers allocated to any of the given warehouse labels.
const getStorekeeperShipmentIds = async (warehouseLabels) => {
  if (!warehouseLabels.length) return [];
  const labelSet = new Set(warehouseLabels.map(normalizeWarehouseLabelForMatch));
  const containers = await Container.find({}).select('shipmentId actual').lean();
  const matchedShipmentIds = new Set();
  containers.forEach((c) => {
    if (containerMatchesWarehouseLabelSet(c, labelSet)) matchedShipmentIds.add(String(c.shipmentId));
  });
  return [...matchedShipmentIds];
};

module.exports = {
  addDays,
  advanceShipmentStage,
  applyCommercialInvoiceDocumentUpload,
  applyLogisticsScalarFields,
  applyShipmentReportFilters,
  AuditLog,
  BLRowDefinition,
  buildClearingAdvancePendingApproval,
  buildDashboardRStatusMetrics,
  buildDashboardStatusPivot,
  buildPaymentAllocationPendingApproval,
  buildPaymentCostingPendingApproval,
  buildRhStatusSummaryRows,
  buildShipmentReportExportRows,
  buildShipmentReportRows,
  buildStorageAllocationPendingApproval,
  buildStorageArrivalPendingApproval,
  buildWarehouseDashboard,
  calculateDelayHours,
  calculateSupplierOnboardingState,
  childMatchesReportStatus,
  classifyFasReceiver,
  CLEARING_ADVANCE_APPROVAL_STATUSES,
  cloneForAudit,
  combineDateTime,
  Container,
  containerMatchesWarehouseLabelSet,
  createSignedGetUrl,
  crypto,
  DASHBOARD_STATUS_COLUMNS,
  dedupeWarehouseLabel,
  DEFAULT_BL_ROW_DEFINITIONS,
  deleteFromS3,
  displayDashboardStatusColumn,
  ensureBlRowDefinitionsSeeded,
  ensureSupplierPortalAccessForShipment,
  escapeRegex,
  ExcelJS,
  FAS_DOC_TRACKING_COLUMNS,
  findSupplierByName,
  fireAndForgetWorkflowEmail,
  formatDateDifferenceDays,
  formatDateOnlyForFilter,
  formatDateTimeValue,
  formatDateValue,
  formatReportCellValue,
  generateSupplierCode,
  generateTempPassword,
  getApprovalActorName,
  getClearingAdvanceSummaryLines,
  getComputedContainerShipmentStatus,
  getComputedShipmentStatus,
  getContainerActual,
  getContainerDividendValue,
  getContainerEtaDate,
  getContainerEtdDate,
  getContainerReportNumber,
  getContainerSerialNo,
  getDashboardChildFcl,
  getDashboardChildQuantity,
  getDashboardPivotLabels,
  getDashboardStatusColumn,
  getDisplayStageName,
  getExpectedContainerSerialCount,
  getMeaningfulNumber,
  getPaymentAllocationSummaryLines,
  getPaymentCostingSummaryLines,
  getReportMonthFilterValues,
  getScheduleActorLabel,
  getScheduledShipmentId,
  getShipmentMonthLabel,
  getShipmentOverallStatus,
  getShipmentReportStatus,
  getShipmentSplitCount,
  getShipmentTrackerBase,
  getStartOfToday,
  getStorageAllocationSummaryLines,
  getStorekeeperShipmentIds,
  hasArrivedAtPortOfDischarge,
  hasAssignedWarehouse,
  hasExplicitShipmentArrival,
  hasMeaningfulActualData,
  hasOnTransitStatus,
  hasRoleOrPermission,
  hasSavedClearingAdvanceData,
  hasSavedPaymentAllocationData,
  hasSavedPaymentCostingData,
  hasSavedStorageAllocationData,
  hasSavedStorageArrivalData,
  hasScheduledShipmentData,
  hasTransitActualMilestone,
  hasValue,
  hydrateMissingSameBlActualFields,
  isAtPortOrLaterStatus,
  isOnOrBeforeToday,
  isOnTransitOrLaterStatus,
  isShipmentEntryPendingSchedule,
  isStorageArrivalRowRecorded,
  Item,
  joinDistinctLineItemValues,
  mapFasDocumentTrackingRow,
  mongoose,
  normalizeCatalogKey,
  normalizeDescription,
  normalizeEmail,
  normalizeNumericDefault,
  normalizeReportFilters,
  normalizeReportText,
  normalizeRole,
  normalizeUploadedFiles,
  normalizeVisibleTo,
  normalizeWarehouseLabelForMatch,
  notifyActualContainerSavedRolesByEmail,
  notifyClearingAdvanceRolesByEmail,
  notifyPaymentAllocationRolesByEmail,
  notifyPaymentCostingRolesByEmail,
  notifyShipmentScheduledRolesByEmail,
  notifyStorageAllocationRolesByEmail,
  notifyWorkflowRoleByEmail,
  parseJsonField,
  parseReportColumnKeys,
  PAYMENT_COSTING_APPROVAL_STATUSES,
  PDFDocument,
  permissionService,
  REPORT_STATUS_ETD_DUE,
  REPORT_STATUS_ETD_UNCONFIRMED,
  reportContains,
  requirePermission,
  RH_STATUS_SUMMARY_COLUMNS,
  SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_DOCUMENT_TRACKER_FIELDS,
  SAME_BL_INHERIT_FIELDS,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  SAME_BL_STORAGE_ALLOCATION_FIELDS,
  selectReportColumns,
  sendActualContainerSavedEmail,
  sendClearingAdvanceStatusEmail,
  sendPaymentAllocationStatusEmail,
  sendPaymentCostingStatusEmail,
  sendShipmentScheduledEmail,
  sendStorageAllocationStatusEmail,
  sendSupplierInviteEmail,
  sendWorkflowUpdateEmail,
  Shipment,
  SHIPMENT_REPORT_CHILD_COLUMNS,
  SHIPMENT_REPORT_COLUMNS,
  slugifyKey,
  STAGE_ORDER,
  startOfLocalDay,
  STORAGE_ALLOCATION_APPROVAL_STATUSES,
  STORAGE_ARRIVAL_APPROVAL_STATUSES,
  Supplier,
  SupplierAccount,
  syncSameBlActualFields,
  toDateOrNull,
  toPlainObject,
  toSignedDocument,
  toTimeString,
  touchStorageArrivalLastUpdated,
  uploadBufferToS3,
  User,
  Warehouse,
  WORKFLOW_NOTIFICATION_ROLE_MAP,
  writeAuditLog,
};
