
const Shipment = require('../models/shipment.model');
const Container = require('../models/container.model');
const BLRowDefinition = require('../models/blRowDefinition.model');
const Supplier = require('../models/supplier.model');
const SupplierAccount = require('../models/supplierAccount.model');
const Item = require('../models/item.model');
const User = require('../models/auth.model');
const AuditLog = require('../models/auditLog.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { uploadBufferToS3, createSignedGetUrl } = require('../core/utils/s3Upload');
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

const buildStorageAllocationPendingApproval = (user) => ({
  status: STORAGE_ALLOCATION_APPROVAL_STATUSES.pendingWarehouseManager,
  submittedAt: new Date(),
  submittedBy: user?._id || null,
  warehouseManagerApprovedAt: null,
  warehouseManagerApprovedBy: null,
});

const buildStorageArrivalPendingApproval = (user) => ({
  status: STORAGE_ARRIVAL_APPROVAL_STATUSES.pendingWarehouseManager,
  submittedAt: new Date(),
  submittedBy: user?._id || null,
  warehouseManagerApprovedAt: null,
  warehouseManagerApprovedBy: null,
});

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

const hasSavedStorageArrivalData = (container) => {
  const rows = container?.actual?.storageSplits || [];
  return Array.isArray(rows) && rows.some((row) =>
    !!row?.receivedOnDate ||
    String(row?.receivedOnTime || '').trim().length > 0 ||
    String(row?.grn || '').trim().length > 0 ||
    String(row?.batch || '').trim().length > 0 ||
    !!row?.productionDate ||
    !!row?.expiryDate ||
    String(row?.documentUrl || '').trim().length > 0
  );
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
const REPORT_STATUS_ETD_DUE = 'ETD yet to Due';

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

const formatReportCellValue = (value, key) => {
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

  const scheduledEtd = toDateOrNull(container?.planned?.etd || shipment?.plannedETD);
  if (scheduledEtd) {
    return REPORT_STATUS_ETD_DUE;
  }

  const fallback = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
  return fallback === 'Shipment Entry' ? REPORT_STATUS_ETD_UNCONFIRMED : fallback;
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

  const pendingScheduledDates = shipmentContainers
    .filter((container) => !hasOnTransitStatus(shipment, container) && !hasArrivedAtPortOfDischarge(shipment, container))
    .map((container) => toDateOrNull(container?.planned?.etd || shipment?.plannedETD))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (pendingScheduledDates.length) {
    return REPORT_STATUS_ETD_DUE;
  }

  const shipmentLevelEtd = toDateOrNull(shipment?.plannedETD);
  if (shipmentLevelEtd) {
    return REPORT_STATUS_ETD_DUE;
  }

  const fallback = getDisplayStageName(shipment?.currentStage || 'Shipment Entry');
  return fallback === 'Shipment Entry' ? REPORT_STATUS_ETD_UNCONFIRMED : fallback;
};

const DASHBOARD_STATUS_COLUMNS = [
  'At the Port',
  'On Transit',
  REPORT_STATUS_ETD_DUE,
  REPORT_STATUS_ETD_UNCONFIRMED,
];

const getDashboardStatusColumn = (shipment, container) => {
  if (hasSavedStorageArrivalData(container)) return 'Delivered WH';
  if (hasArrivedAtPortOfDischarge(shipment, container)) return 'At the Port';
  if (hasOnTransitStatus(shipment, container)) return 'On Transit';

  const plannedEtd = toDateOrNull(container?.planned?.etd || shipment?.plannedETD);
  if (plannedEtd) return REPORT_STATUS_ETD_DUE;

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

const getDashboardPivotLabel = (shipment, groupBy) => {
  if (groupBy === 'item') {
    return shipment?.itemId?.description || shipment?.itemDescription || shipment?.item || 'Unknown Item';
  }
  return shipment?.supplierId?.name || shipment?.supplierName || 'Unknown Supplier';
};

const buildDashboardStatusPivot = (shipments, containerMap, groupBy = 'supplier') => {
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const columns = DASHBOARD_STATUS_COLUMNS.map((column) =>
    column === REPORT_STATUS_ETD_DUE ? `${column} - ${currentMonth}` : column
  );
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
    const label = getDashboardPivotLabel(shipment, groupBy);
    const shipmentContainers = containerMap.get(String(shipment._id)) || [];
    const splitCount = getShipmentSplitCount(shipment, shipmentContainers);

    if (!shipmentContainers.length) {
      addValue(
        label,
        REPORT_STATUS_ETD_UNCONFIRMED,
        Number(shipment?.plannedQtyMT || shipment?.totalOrderedQtyMT || 0),
        Number(shipment?.fcl || 0)
      );
      return;
    }

    shipmentContainers.forEach((container) => {
      const baseColumn = getDashboardStatusColumn(shipment, container);
      const column = baseColumn === REPORT_STATUS_ETD_DUE ? `${baseColumn} - ${currentMonth}` : baseColumn;
      addValue(
        label,
        column,
        getDashboardChildQuantity(shipment, container, splitCount),
        getDashboardChildFcl(shipment, container, splitCount)
      );
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
  const metrics = {
    'At The Port': 0,
    'On Transit': 0,
    'ETD Yet To Due': 0,
    'ETD Yet To Be Confirmed': 0,
    'Total LPO': shipments.length,
    'Total Shipments': 0,
    'Open LPO': 0,
    'Completed LPO': 0,
    'Delivered WH': 0,
  };
  const permissionKeys = {
    'At The Port': 'dashboard.snapshot.at_port.view',
    'On Transit': 'dashboard.snapshot.on_transit.view',
    'ETD Yet To Due': 'dashboard.snapshot.eta_due.view',
    'ETD Yet To Be Confirmed': 'dashboard.snapshot.etd_unconfirmed.view',
    'Total LPO': 'dashboard.snapshot.total_lpo.view',
    'Total Shipments': 'dashboard.snapshot.total_shipments.view',
    'Open LPO': 'dashboard.snapshot.open_lpo.view',
    'Completed LPO': 'dashboard.snapshot.completed_lpo.view',
    'Delivered WH': 'dashboard.snapshot.delivered_wh.view',
  };

  shipments.forEach((shipment) => {
    const shipmentContainers = containerMap.get(String(shipment._id)) || [];
    const splitCount = getShipmentSplitCount(shipment, shipmentContainers);
    const dashboardContainers = splitCount > 0
      ? shipmentContainers.slice(0, splitCount)
      : shipmentContainers;
    const missingSplitCount = Math.max(splitCount - dashboardContainers.length, 0);
    const isPendingEntryStage = isShipmentEntryPendingSchedule(shipment);
    const pendingEntryCount = isPendingEntryStage ? 1 : 0;

    if (!shipmentContainers.length && !missingSplitCount) {
      metrics['Open LPO'] += 1;
      metrics['Total Shipments'] += pendingEntryCount;
      metrics['ETD Yet To Be Confirmed'] += pendingEntryCount;
      return;
    }

    metrics['Total Shipments'] += dashboardContainers.length + missingSplitCount;
    metrics['ETD Yet To Be Confirmed'] += missingSplitCount;

    const isCompletedLpo = missingSplitCount === 0 && dashboardContainers.length > 0 && dashboardContainers.every((container) => hasSavedStorageArrivalData(container));
    if (isCompletedLpo) metrics['Completed LPO'] += 1;
    else metrics['Open LPO'] += 1;

    dashboardContainers.forEach((container) => {
      const status = isPendingEntryStage ? REPORT_STATUS_ETD_UNCONFIRMED : getDashboardStatusColumn(shipment, container);
      if (status === 'Delivered WH') metrics['Delivered WH'] += 1;
      else if (status === 'On Transit') metrics['On Transit'] += 1;
      else if (status === 'At the Port') metrics['At The Port'] += 1;
      else if (status === REPORT_STATUS_ETD_DUE || status === 'ETA yet to due') metrics['ETD Yet To Due'] += 1;
      else metrics['ETD Yet To Be Confirmed'] += 1;
    });
  });

  return Object.entries(metrics).map(([label, value]) => ({ label, value, permissionKey: permissionKeys[label] }));
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

const buildShipmentReportRows = async (filters = {}) => {
  const shipments = await Shipment.find({})
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
    const children = shipmentContainers.map((container, childIndex) => {
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
      ciNo: actual.commercialInvoiceNo || '',
      fcl: shipment.fcl ?? '',
      containerSize: shipment.containersize || actual.size || planned.size || '',
      buyingUnit: shipment.buyunit || actual.buyingUnit || planned.buyingUnit || '',
      buyingQtyMT: shipment.plannedQtyMT ?? shipment.totalOrderedQtyMT ?? '',
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
      bags: shipment.bags ?? '',
      pallet: shipment.pallet ?? '',
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

exports.createShipment = async (req, res) => {
  try {
    const {
      orderDate,
      poNumber,
      year,
      supplierId,
      supplierName,
      supplierEmail,
      piNo,
      piDate,
      fpoNo,
      itemId,
      itemCode,
      itemDescription,
      commodity,
      countryOfOrigin,
      brandName,
      barcode,
      variant,
      hsCode,
      packing,
      portOfLoading,
      portOfDischarge,
      plannedQtyMT,
      estimatedContainerCount,
      estimatedContainerSize,
      fcl,
      pallet,
      bags,
      plannedETD,
      plannedETA,
      fcPerUnit,
      totalFC,
      paymentTerms,
      bankName,
      advanceAmount,
      advanceAmountDate,
      incoterms,
      buyunit,
      totalSplitQtyMT,
      q1Report
      ,
      itemsJson
    } = req.body;

    const files = req.files || {};
    const lpoDocument = files?.lpoDocument?.[0];
    const proformaDocument = files?.proformaDocument?.[0];
    const s1QualityReport = files?.s1QualityReport?.[0];

    // 1️⃣ Basic validation (itemId now optional)
    const parsedQ1Report = parseJsonField(q1Report);
    const parsedItems = parseJsonField(itemsJson);
    const normalizedLineItems = Array.isArray(parsedItems)
      ? parsedItems.map((item, index) => {
          const quantity = Number(item?.plannedContainers) || 0;
          const price = Number(item?.fcPerUnit) || 0;
          const total = item?.totalUSD != null && item?.totalUSD !== '' ? Number(item.totalUSD) : quantity * price;
          return {
            lineNo: Number(item?.lineNo) || index + 1,
            itemCode: String(item?.itemCode || '').trim(),
            itemDescription: String(item?.itemDescription || '').trim(),
            commodity: String(item?.commodity || '').trim(),
            countryOfOrigin: String(item?.countryOfOrigin || '').trim(),
            brandName: String(item?.brandName || '').trim(),
            barcode: String(item?.barcode || '').trim(),
            dmBarcode: String(item?.dmBarcode || '').trim(),
            variant: String(item?.variant || '').trim(),
            hsCode: String(item?.hsCode || '').trim(),
            packagingType: String(item?.packagingType || '').trim(),
            containerSize: item?.containerSize != null && item?.containerSize !== '' ? String(item.containerSize).trim() : '',
            plannedContainers: quantity,
            fcl: Number(item?.fcl) || 0,
            pallet: Number(item?.pallet) || 0,
            bags: Number(item?.bags) || 0,
            buyingUnit: String(item?.buyingUnit || '').trim(),
            fclPerUnit: Number(item?.fclPerUnit) || 0,
            fcPerUnit: price,
            totalUSD: total,
            totalAED: item?.totalAED != null && item?.totalAED !== '' ? Number(item.totalAED) : Math.round(total * 3.67 * 100) / 100,
            expectedETD: toDateOrNull(item?.expectedETD),
            expectedETA: toDateOrNull(item?.expectedETA)
          };
        }).filter((item) => item.itemCode || item.itemDescription || item.plannedContainers || item.totalUSD)
      : [];

    const derivedLineItems = normalizedLineItems.length ? normalizedLineItems : [];
    const derivedQty = derivedLineItems.length ? derivedLineItems.reduce((sum, item) => sum + (item.plannedContainers || 0), 0) : Number(plannedQtyMT) || 0;
    const derivedFcl = derivedLineItems.length ? derivedLineItems.reduce((sum, item) => sum + (item.fcl || 0), 0) : Number(fcl) || 0;
    const derivedPallet = derivedLineItems.length ? derivedLineItems.reduce((sum, item) => sum + (item.pallet || 0), 0) : Number(pallet) || 0;
    const derivedBags = derivedLineItems.length ? derivedLineItems.reduce((sum, item) => sum + (item.bags || 0), 0) : Number(bags) || 0;
    const derivedTotalAmount = derivedLineItems.length ? derivedLineItems.reduce((sum, item) => sum + (item.totalUSD || 0), 0) : null;
    const derivedRate = derivedLineItems.length
      ? (derivedQty > 0 ? Number((derivedTotalAmount / derivedQty).toFixed(2)) : Number(derivedLineItems[0]?.fcPerUnit) || 0)
      : Number(fcPerUnit) || 0;
    const uniqueJoin = (values, fallback = '') => {
      const cleaned = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
      if (!cleaned.length) return fallback;
      return cleaned.length === 1 ? cleaned[0] : `Multiple (${cleaned.length})`;
    };
    const primaryItem = derivedLineItems[0] || null;

    const missingFields = [];
    if (!poNumber) missingFields.push('poNumber');
    if (!orderDate) missingFields.push('orderDate');
    if (!(supplierId || supplierName)) missingFields.push('supplierIdOrSupplierName');
    if (!(derivedQty || plannedQtyMT)) missingFields.push('plannedQtyMT');
    if (!piNo) missingFields.push('piNo');
    if (!incoterms) missingFields.push('incoterms');
    if (!(buyunit || derivedLineItems.length)) missingFields.push('buyunit');
    if (!paymentTerms) missingFields.push('paymentTerms');
    if (!totalSplitQtyMT) missingFields.push('totalSplitQtyMT');
    if (!supplierEmail) missingFields.push('supplierEmail');

    if (missingFields.length) {
      return res.status(400).json({
        message: 'Required fields missing',
        missingFields
      });
    }

    // Prevent duplicate tracker creation for the same PO (and year if available).
    // Users sometimes click "Save" again; this should not create a new tracker.
    const resolvedYear =
      year != null && String(year).trim() !== ''
        ? Number(year)
        : (orderDate ? new Date(orderDate).getFullYear() : undefined);
    const existingShipmentQuery = { poNumber: String(poNumber || '').trim() };
    if (resolvedYear && !Number.isNaN(resolvedYear)) {
      existingShipmentQuery.year = resolvedYear;
    }
    const existingShipment = await Shipment.findOne(existingShipmentQuery).select('_id shipmentNo');
    if (existingShipment) {
      return res.status(409).json({
        message: 'Tracker already exists for this PO. Please open and update the existing tracker instead of creating a new one.',
        shipmentId: existingShipment._id,
        shipmentNo: existingShipment.shipmentNo,
      });
    }

    if (!lpoDocument || !s1QualityReport) {
      return res.status(400).json({
        message: 'Required documents missing: lpoDocument and s1QualityReport are mandatory'
      });
    }

    // 2️⃣ Validate supplier
    const normalizedSupplierEmail = normalizeEmail(supplierEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSupplierEmail)) {
      return res.status(400).json({ message: 'A valid supplierEmail is required' });
    }

    let supplier = null;
    if (supplierId) {
      supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return res.status(400).json({ message: "Invalid supplier" });
      }
    }

    // 3️⃣ Auto PO number generation: RHST + YY + MM + running 3-digit sequence (monthly)
    const orderDateObj = orderDate ? new Date(orderDate) : new Date();
    if (Number.isNaN(orderDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid orderDate' });
    }

    const yy = String(orderDateObj.getFullYear()).slice(-2);
    const mm = String(orderDateObj.getMonth() + 1).padStart(2, '0');
    const monthStart = new Date(orderDateObj.getFullYear(), orderDateObj.getMonth(), 1, 0, 0, 0, 0);
    const nextMonthStart = new Date(orderDateObj.getFullYear(), orderDateObj.getMonth() + 1, 1, 0, 0, 0, 0);

    const monthCount = await Shipment.countDocuments({
      orderDate: { $gte: monthStart, $lt: nextMonthStart }
    });

    let runningNo = monthCount + 1;
    let autoPoNumber = `RHST${yy}${mm}${String(runningNo).padStart(3, '0')}`;
    while (await Shipment.exists({ poNumber: autoPoNumber })) {
      runningNo += 1;
      autoPoNumber = `RHST${yy}${mm}${String(runningNo).padStart(3, '0')}`;
    }

    const extractPurchaseSuffix = (value) => {
      const cleaned = String(value || '')
        .toUpperCase()
        .trim();

      const digitGroups = cleaned.match(/\d+/g) || [];
      if (digitGroups.length >= 2) {
        const poSeries = String(digitGroups[0] || '').slice(-2).padStart(2, '0');
        const poTail = String(digitGroups[digitGroups.length - 1] || '').slice(-4).padStart(4, '0');
        return `PO${poSeries}-${poTail}`;
      }

      const compact = cleaned.replace(/[^A-Z0-9]/g, '');
      const poMatch = compact.match(/PO?0*(\d+)(\d{4})$/i);
      if (poMatch) {
        const prefixDigits = String(poMatch[1] || '').slice(-2).padStart(2, '0');
        const tailDigits = String(poMatch[2]).slice(-4).padStart(4, '0');
        return `PO${prefixDigits}-${tailDigits}`;
      }

      const digits = compact.replace(/\D/g, '');
      if (digits.length >= 4) {
        const poSeries = digits.slice(0, Math.max(0, digits.length - 4)).slice(-2).padStart(2, '0');
        const poTail = digits.slice(-4).padStart(4, '0');
        return `PO${poSeries}-${poTail}`;
      }

      return 'PO00-0000';
    };

    const trackerSourceValue =
      [fpoNo, poNumber]
        .map((value) => String(value || '').trim())
        .find((value) => value && !/^RHST\d{5,}$/i.test(value.replace(/[^A-Z0-9]/g, ''))) ||
      String(fpoNo || poNumber || '').trim();

    // Extract the PO suffix
    const purchaseSuffix = extractPurchaseSuffix(trackerSourceValue);
    
    // Check if this PO suffix already exists in any shipment (prevent duplicate PO suffixes)
    if (purchaseSuffix && purchaseSuffix !== 'PO00-0000') {
      const suffixRegex = new RegExp(`/${purchaseSuffix}$`);
      const existingSuffixShipment = await Shipment.findOne({ shipmentNo: suffixRegex }).select('_id shipmentNo');
      if (existingSuffixShipment) {
        return res.status(409).json({
          message: `A shipment with PO suffix "${purchaseSuffix}" already exists (${existingSuffixShipment.shipmentNo}). Each PO must be unique.`,
          shipmentId: existingSuffixShipment._id,
          shipmentNo: existingSuffixShipment.shipmentNo,
        });
      }
    }

    let shipmentRunningNo = (await Shipment.countDocuments()) + 1;
    let trackerSerial = `RHST-${String(shipmentRunningNo).padStart(4, '0')}/${purchaseSuffix}`;
    while (await Shipment.exists({ shipmentNo: trackerSerial })) {
      shipmentRunningNo += 1;
      trackerSerial = `RHST-${String(shipmentRunningNo).padStart(4, '0')}/${purchaseSuffix}`;
    }

    // Auto generate shipment number from running tracker sequence + source PO suffix
    const shipmentNo = trackerSerial;

    const yearStr = orderDateObj.getFullYear();

    const qty = derivedQty;
    const rate = derivedRate;

    const totalAmount = derivedTotalAmount != null ? derivedTotalAmount : qty * rate;

    // 4️⃣ Upload all mandatory documents to S3
    const uploads = await Promise.all([
      uploadBufferToS3(lpoDocument, 'shipments/lpo'),
      proformaDocument ? uploadBufferToS3(proformaDocument, 'shipments/proforma') : Promise.resolve(null),
      uploadBufferToS3(s1QualityReport, 'shipments/quality/s1')
    ]);
    const [lpoUpload, proformaUpload, s1Upload] = uploads;

    // 5️⃣ Create shipment with persisted document URLs
    const shipment = await Shipment.create({
      poNumber: autoPoNumber,
      year: yearStr,
      orderDate,
      supplierId: supplier?._id,
      supplierName: supplierName || supplier?.name || '',
      supplierEmail: normalizedSupplierEmail,
      itemId: itemId || undefined,
      itemCode: uniqueJoin(derivedLineItems.map((item) => item.itemCode), itemCode || ''),
      itemDescription: derivedLineItems.length > 1
        ? `Multiple Items (${derivedLineItems.length})`
        : (primaryItem?.itemDescription || itemDescription || ''),
      commodity: uniqueJoin(derivedLineItems.map((item) => item.commodity), commodity || ''),
      countryOfOrigin: uniqueJoin(derivedLineItems.map((item) => item.countryOfOrigin), countryOfOrigin || ''),
      brandName: uniqueJoin(derivedLineItems.map((item) => item.brandName), brandName || ''),
      barcode: uniqueJoin(derivedLineItems.map((item) => item.barcode), barcode || ''),
      variant: uniqueJoin(derivedLineItems.map((item) => item.variant), variant || ''),
      hsCode: uniqueJoin(derivedLineItems.map((item) => item.hsCode), hsCode || ''),
      packing: uniqueJoin(derivedLineItems.map((item) => item.packagingType), packing || ''),
      portOfLoading: portOfLoading || '',
      portOfDischarge: portOfDischarge || '',
      shipmentNo,
      plannedQtyMT: qty,
      estimatedContainerCount,
      estimatedContainerSize,
      plannedETD: primaryItem?.expectedETD || plannedETD,
      plannedETA: primaryItem?.expectedETA || plannedETA,
      piNo,
      piDate: toDateOrNull(piDate),
      fpoNo,
      fcl: derivedFcl,
      pallet: derivedPallet,
      bags: derivedBags,
      fcPerUnit: rate,
      totalFC,
      paymentTerms,
      bankName: bankName || '',
      advanceAmount,
      advanceAmountDate,
      q1Report: parsedQ1Report,
      lineItems: derivedLineItems,
      lpoDocumentName: lpoUpload.fileName,
      lpoDocumentUrl: lpoUpload.url,
      proformaDocumentName: proformaUpload?.fileName || '',
      proformaDocumentUrl: proformaUpload?.url || '',
      s1QualityReportName: s1Upload.fileName,
      s1QualityReportUrl: s1Upload.url,
      payment: {
        totalAmount,   // from req.body
        paidAmount: 0,                   // initially 0
        balanceAmount: totalAmount, // initially same as total
        paymentStatus: "Pending"         // default
      },
      incoterms,
      buyunit: uniqueJoin(derivedLineItems.map((item) => item.buyingUnit), buyunit || ''),
      totalSplitQtyMT,
      containersize: Number(uniqueJoin(derivedLineItems.map((item) => item.containerSize), estimatedContainerSize || '')) || Number(estimatedContainerSize) || 0
    });

    // 6️⃣ Audit log
    await writeAuditLog({
      userId: req.user._id,
      module: "Purchase",
      entity: "Shipment",
      entityId: shipment._id,
      action: "Create",
      before: null,
      after: shipment.toObject(),
      remarks: "Shipment entry created"
    });

    return res.status(201).json({
      message: 'Shipment created successfully. Supplier invite will be checked when the baseline is locked.',
      data: shipment,
      documents: {
        lpo: { name: lpoUpload.fileName, url: lpoUpload.url },
        proforma: proformaUpload ? { name: proformaUpload.fileName, url: proformaUpload.url } : null,
        s1QualityReport: { name: s1Upload.fileName, url: s1Upload.url }
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};


exports.createPlannedContainersBulk = async (req, res) => {
  try {
    const { shipmentId, plannedContainers, noOfShipments } = req.body;

    if (!Array.isArray(plannedContainers)) {
      return res.status(400).json({ message: "plannedContainers must be an array" });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });

    const totalQtyMT = shipment.plannedQtyMT ?? shipment.totalOrderedQtyMT ?? 0;
    const existingAllContainers = await Container.find({ shipmentId }).sort({ createdAt: 1 });
    const existingPlannedContainers = existingAllContainers.filter((container) => container.status === "Planned");
    const existingActualContainers = existingAllContainers.filter((container) => container.status === "Actual");
    const previousPlannedSnapshot = existingPlannedContainers.map((container) => ({
      containerId: container._id,
      size: container.planned?.size,
      FCL: container.planned?.FCL,
      qtyMT: container.planned?.qtyMT,
      bags: container.planned?.bags,
      etd: container.planned?.etd,
      eta: container.planned?.eta,
      weekWiseShipment: container.planned?.weekWiseShipment,
      buyingUnit: container.planned?.buyingUnit,
      status: container.status,
    }));

    // 1️⃣ Delete all existing planned containers for this shipment
    await Container.deleteMany({ shipmentId, status: "Planned" });

    // 2️⃣ Insert all new planned containers
    let currentPlannedMT = 0;
    const processedContainers = [];

    for (let c of plannedContainers) {
      const qty = Number(c.qtyMT) || 0;
      if (totalQtyMT > 0 && currentPlannedMT + qty > totalQtyMT) {
        return res.status(400).json({
          message: `Cannot add container of ${qty} MT. Total would exceed ordered quantity (${totalQtyMT} MT)`
        });
      }

      const container = await Container.create({
        shipmentId,
        planned: {
          size: c.size,
          FCL: c.FCL,
          etd: toDateOrNull(c.etd),
          eta: toDateOrNull(c.eta),
          weekWiseShipment: c.weekWiseShipment,
          qtyMT: qty,
          buyingUnit: c.buyingUnit || "MT"
        },
        status: "Planned"
      });

      currentPlannedMT += qty;
      processedContainers.push(container);
    }

    // 3️⃣ Recalculate shipment totals and save noOfShipments
    shipment.plannedQtyMT = currentPlannedMT;
    shipment.assumedContainerCount = processedContainers.length;
    if (noOfShipments != null && noOfShipments !== '') shipment.noOfShipments = Number(noOfShipments);
    shipment.currentStage = "Planned Split";
    await shipment.save();
    const supplierInviteResult = await ensureSupplierPortalAccessForShipment(shipment);

    const updatedPlannedSnapshot = processedContainers.map((container) => ({
      containerId: container._id,
      size: container.planned?.size,
      FCL: container.planned?.FCL,
      qtyMT: container.planned?.qtyMT,
      bags: container.planned?.bags,
      etd: container.planned?.etd,
      eta: container.planned?.eta,
      weekWiseShipment: container.planned?.weekWiseShipment,
      buyingUnit: container.planned?.buyingUnit,
      status: container.status,
    }));

    const mapContainerToScheduleSnapshot = (container) => ({
      containerId: container._id,
      size: container.planned?.size,
      FCL: container.planned?.FCL,
      qtyMT: container.planned?.qtyMT,
      bags: container.planned?.bags,
      etd: container.planned?.etd,
      eta: container.planned?.eta,
      weekWiseShipment: container.planned?.weekWiseShipment,
      buyingUnit: container.planned?.buyingUnit,
      status: container.status,
      isUiLocked: !!container?.actual?.BLNo,
    });

    const previousFullScheduleSnapshot = existingAllContainers.map(mapContainerToScheduleSnapshot);
    const updatedFullScheduleSnapshot = [
      ...existingActualContainers.map(mapContainerToScheduleSnapshot),
      ...processedContainers.map(mapContainerToScheduleSnapshot),
    ];

    if (req.user?._id) {
      await AuditLog.create({
        userId: req.user._id,
        module: "Purchase",
        entity: "Shipment",
        entityId: shipment._id,
        action: previousPlannedSnapshot.length > 0 ? "ScheduledBaselineUpdated" : "ScheduledBaselineCreated",
        before: { plannedContainers: previousPlannedSnapshot },
        after: {
          plannedContainers: updatedPlannedSnapshot,
          noOfShipments: shipment.noOfShipments,
          plannedQtyMT: shipment.plannedQtyMT,
        },
        remarks: previousPlannedSnapshot.length > 0
          ? "Scheduled baseline updated from Step 2"
          : "Scheduled baseline created from Step 2",
      });
    }

    notifyShipmentScheduledRolesByEmail({
      roles: ['FAS', 'Logistic'],
      shipment,
      changedScheduleLines: (() => {
        return updatedFullScheduleSnapshot.flatMap((row, index) => {
          const previousRow = previousFullScheduleSnapshot[index];
          const isLockedRow = !!(row?.isUiLocked || previousRow?.isUiLocked);

          if (isLockedRow) {
            return [];
          }

          const currentEtd = formatDateValue(row?.etd);
          const currentEta = formatDateValue(row?.eta);
          const absoluteRowIndex = index + 1;

          return [`${getScheduledShipmentId(shipment, absoluteRowIndex - 1)}: ETD ${currentEtd || 'N/A'} | ETA ${currentEta || 'N/A'}`];
        });
      })(),
      actor: req.user,
    }).catch((error) => {
      console.error(`Shipment schedule notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
    });

    // Future use: send shipment scheduled notification to supplier email as well.
    // if (shipment.supplierEmail) {
    //   sendShipmentScheduledEmail({
    //     to: shipment.supplierEmail,
    //     userName: shipment.supplierName || shipment.supplier || 'Supplier',
    //     shipmentId: shipment.shipmentNo || String(shipment._id),
    //     scheduledByLabel: getScheduleActorLabel(req.user),
    //   }).catch((error) => {
    //     console.error(`Supplier shipment schedule email warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
    //   });
    // }

    res.status(200).json({
      message:
        supplierInviteResult.inviteSent === false
          ? 'Planned containers replaced successfully, but the supplier invite email could not be sent.'
          : supplierInviteResult.supplierCreated
            ? 'Planned containers replaced successfully and the supplier invite email was sent.'
            : 'Planned containers replaced successfully',
      supplierCreated: supplierInviteResult.supplierCreated,
      inviteSent: supplierInviteResult.inviteSent,
      inviteStatusMessage: supplierInviteResult.inviteStatusMessage,
      shipment: {
        plannedQtyMT: shipment.plannedQtyMT,
        assumedContainerCount: shipment.assumedContainerCount,
        currentStage: shipment.currentStage
      },
      containers: processedContainers
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message, error: err.message });
  }
};





exports.addActualContainer = async (req, res) => {
  try {

    const container = await Container.findById(req.params.id);
    const files = req.files || {};
    const blDocument = files?.blDocument?.[0];
    const commercialInvoiceDocument = files?.commercialInvoiceDocument?.[0];


    const {
      actualSerialNo,
      commercialInvoiceNo,
      shipOnBoardDate,
      qtyMT,
      bags,
      pallet,
      updatedETD,
      updatedETA,
      CLNo,
      BLNo,
      portOfLoading,
      portOfDischarge,
      shipmentArrived,
      noOfContainers,
      noOfBags,
      quantityByMt,
      shippingLine,
      freeDetentionDays,
      maximumDetentionDays,
      freightPrepared,
      billExtractionData,
      extractedContainers,
      packagingList
    } = req.body;
    const packagingListDocument = req.files?.packaging_list_document?.[0];


    if (!container) {
      return res.status(404).json({ message: "Container not found" });
    }

    const shipment = await Shipment.findById(container.shipmentId);
    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }

    // BLNo is sent by frontend; CLNo kept for backward compatibility.
    // First B/L save notifications are owned by the B/L Details tab save,
    // not by Shipment Tracker actual-row saves.
    const billOrLadingNo = BLNo ?? CLNo;

    // 🔥 REPLACE ACTUAL (NOT ARRAY)
    container.actual = {
      ...(container.actual?.toObject ? container.actual.toObject() : container.actual || {}),
      actualSerialNo,
      commercialInvoiceNo,
      shipOnBoardDate: shipOnBoardDate ? new Date(shipOnBoardDate) : null,
      size: container.planned?.size,
      FCL: container.planned?.FCL,
      qtyMT,
      bags,
      pallet,
      updatedETD,
      updatedETA,
      CLNo: billOrLadingNo,
      BLNo: billOrLadingNo,
      portOfLoading: portOfLoading || container.actual?.portOfLoading || '',
      portOfDischarge: portOfDischarge || container.actual?.portOfDischarge || '',
      shipmentArrived: shipmentArrived === 'Yes' ? 'Yes' : container.actual?.shipmentArrived || 'No',
      noOfContainers: Number(noOfContainers) || container.actual?.noOfContainers || 0,
      noOfBags: Number(noOfBags) || Number(bags) || container.actual?.noOfBags || 0,
      quantityByMt: Number(quantityByMt) || Number(qtyMT) || container.actual?.quantityByMt || 0,
      shippingLine: shippingLine || container.actual?.shippingLine || '',
      freeDetentionDays: Number(freeDetentionDays) || container.actual?.freeDetentionDays || 0,
      maximumDetentionDays: Number(maximumDetentionDays) || container.actual?.maximumDetentionDays || 0,
      freightPrepared: freightPrepared || container.actual?.freightPrepared || 'No',
      extractedContainers: Array.isArray(JSON.parse(extractedContainers || '[]'))
        ? JSON.parse(extractedContainers || '[]').map((row) => ({
            containerNo: row.containerNo || row.container_number || '',
            pkgCt: Number(row.pkgCt ?? row.no_of_bags) || 0
          }))
        : container.actual?.extractedContainers || [],
      packagingList: packagingList ? (() => {
        const raw = JSON.parse(packagingList);
        return {
          brand: raw.brand || '',
          productionDate: raw.production_date || raw.productionDate || '',
          expiryDate: raw.expiry_date || raw.expiryDate || '',
          packingDescription: raw.packing_description || raw.packingDescription || '',
          totalBags: Number(raw.total_bags ?? raw.totalBags) || 0,
          totalGrossWeight: raw.total_gross_weight || raw.totalGrossWeight || '',
          totalNetWeight: raw.total_net_weight || raw.totalNetWeight || '',
          containerInfo: (raw.container_info || raw.containerInfo || []).map((ci) => ({
            container_number: ci.container_number || ci.containerNumber || '',
            no_of_bags: Number(ci.no_of_bags ?? ci.noOfBags) || 0,
            gross_weight: ci.gross_weight || ci.grossWeight || '',
            net_weight: ci.net_weight || ci.netWeight || ''
          }))
        };
      })() : container.actual?.packagingList || null,
      receivedOn: new Date()
    };
    if (blDocument) {
      const uploaded = await uploadBufferToS3(blDocument, 'shipments/actual/bl-document');
      container.actual.blDocumentUrl = uploaded.url;
      container.actual.blDocumentName = uploaded.fileName;
    }
    if (commercialInvoiceDocument) {
      const uploaded = await uploadBufferToS3(commercialInvoiceDocument, 'shipments/actual/commercial-invoice-document');
      container.actual.commercialInvoiceDocumentUrl = uploaded.url;
      container.actual.commercialInvoiceDocumentName = uploaded.fileName;
    }

    if (packagingListDocument) {
      const uploaded = await uploadBufferToS3(packagingListDocument, 'shipments/actual/packaging-list-document');
      container.actual.packagingListDocumentUrl = uploaded.url;
      container.actual.packagingListDocumentName = uploaded.fileName;
    }

    container.status = "Actual";
    await container.save();

    await hydrateMissingSameBlActualFields({
      ContainerModel: Container,
      targetContainer: container,
      fields: SAME_BL_INHERIT_FIELDS,
    });

    if (billOrLadingNo || blDocument) {
      await syncSameBlActualFields({
        ContainerModel: Container,
        sourceContainer: container,
        fields: SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
      });
    }

    // 🔥 RECALCULATE SHIPMENT TOTALS
    const allContainers = await Container.find({ shipmentId: shipment._id });

    shipment.actualQtyMT = allContainers.reduce(
      (sum, c) => sum + (c.actual?.qtyMT || 0),
      0
    );

    shipment.actualBags = allContainers.reduce(
      (sum, c) => sum + (c.actual?.bags || 0),
      0
    );

    shipment.currentStage = "Shipment Split";

    if (billOrLadingNo) shipment.CLNo = billOrLadingNo;

    // 🔥 AUTO CLOSE LOGIC
    if (shipment.actualQtyMT >= shipment.totalOrderedQtyMT) {
      shipment.currentStage = "Shipment Split";
    }

    await shipment.save();

    shipment.__orderedContainersForEmail = allContainers;

    res.status(200).json({
      message: "Actual container recorded successfully",
      container,
      shipment: {
        actualQtyMT: shipment.actualQtyMT,
        actualBags: shipment.actualBags,
        currentStage: shipment.currentStage
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

exports.updateBLDetails = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) {
      return res.status(404).json({ message: 'Container not found' });
    }

    if (!container.actual) {
      container.actual = {
        size: container.planned?.size,
        FCL: container.planned?.FCL,
        qtyMT: container.planned?.qtyMT || 0,
        bags: container.planned?.bags || 0
      };
    }
    const beforeUpdate = cloneForAudit(container.toObject());
    const hadExistingBlTabSave = Boolean(container.actual?.blFirstSavedAt);

    const files = normalizeUploadedFiles(req.files || {});
    const costSheetBookingDocument = files?.costSheetBookingDocument?.[0];
    const commercialInvoiceDocument = files?.commercialInvoiceDocument?.[0];

    const {
      blNo,
      commercialInvoiceNo,
      blDetailsRemarks,
      shippedOnBoard,
      portOfLoading,
      portOfDischarge,
      shipmentArrived,
      noOfContainers,
      noOfBags,
      quantityByMt,
      shippingLine,
      freeDetentionDays,
      maximumDetentionDays,
      freightPrepared,
      costSheetBookings,
      storageAllocations,
      storageAllocationDecision,
      storageAllocationSplits,
      clearingAdvancePaymentDetails,
      chequeNo,
      chequeDate,
      paymentVoucherNo,
      transactionId,
      actualBags,
      expiryDate,
      hsCode,
      packagingDate,
      grossWeight,
      netWeight,
      packagingList
    } = req.body;

    const parsedCostSheetBookings = parseJsonField(costSheetBookings);
    const parsedStorageAllocations = parseJsonField(storageAllocations);
    const parsedStorageAllocationDecision = parseJsonField(storageAllocationDecision);
    const parsedStorageAllocationSplits = parseJsonField(storageAllocationSplits);
    const parsedClearingAdvancePaymentDetails = parseJsonField(clearingAdvancePaymentDetails) || {};
    const parsedPackagingList = parseJsonField(packagingList);
    const isClearingAdvanceSave = Array.isArray(parsedCostSheetBookings) || !!costSheetBookingDocument;
    const isStorageAllocationSave =
      Array.isArray(parsedStorageAllocations) ||
      Array.isArray(parsedStorageAllocationSplits) ||
      !!parsedStorageAllocationDecision;

    if (parsedPackagingList) {
      container.actual.packagingList = {
        ...parsedPackagingList,
        // Normalize snake_case keys from Python extraction to camelCase
        productionDate: parsedPackagingList.productionDate || parsedPackagingList.production_date || '',
        expiryDate: parsedPackagingList.expiryDate || parsedPackagingList.expiry_date || '',
        packingDescription: parsedPackagingList.packingDescription || parsedPackagingList.packing_description || '',
        totalBags: parsedPackagingList.totalBags ?? parsedPackagingList.total_bags ?? 0,
        totalGrossWeight: parsedPackagingList.totalGrossWeight || parsedPackagingList.total_gross_weight || '',
        totalNetWeight: parsedPackagingList.totalNetWeight || parsedPackagingList.total_net_weight || '',
      };
    }

    if (blNo !== undefined) {
      container.actual.BLNo = blNo || '';
      container.actual.CLNo = blNo || '';
    }
    const hasBlAfterSave = String(container.actual?.BLNo || container.actual?.CLNo || '').trim().length > 0;
    const isFirstBlSave = blNo !== undefined && hasBlAfterSave && !hadExistingBlTabSave;
    if (isFirstBlSave) {
      container.actual.blFirstSavedAt = new Date();
    }
    if (commercialInvoiceNo !== undefined) container.actual.commercialInvoiceNo = commercialInvoiceNo || '';
    if (blDetailsRemarks !== undefined) container.actual.blDetailsRemarks = blDetailsRemarks || '';
    if (shippedOnBoard !== undefined) container.actual.shipOnBoardDate = toDateOrNull(shippedOnBoard);
    if (portOfLoading !== undefined) container.actual.portOfLoading = portOfLoading || '';
    if (portOfDischarge !== undefined) container.actual.portOfDischarge = portOfDischarge || '';
    if (shipmentArrived !== undefined) container.actual.shipmentArrived = shipmentArrived === 'Yes' ? 'Yes' : 'No';
    if (noOfContainers !== undefined) container.actual.noOfContainers = Number(noOfContainers) || 0;
    if (noOfBags !== undefined) container.actual.noOfBags = Number(noOfBags) || 0;
    if (quantityByMt !== undefined) container.actual.quantityByMt = Number(quantityByMt) || 0;
    if (shippingLine !== undefined) container.actual.shippingLine = shippingLine || '';
    if (freeDetentionDays !== undefined) container.actual.freeDetentionDays = Number(freeDetentionDays) || 0;
    if (maximumDetentionDays !== undefined) container.actual.maximumDetentionDays = Number(maximumDetentionDays) || 0;
    if (freightPrepared !== undefined) container.actual.freightPrepared = freightPrepared || 'No';

    if (actualBags !== undefined) container.actual.actualBags = Number(actualBags) || 0;
    if (expiryDate !== undefined) container.actual.expiryDate = toDateOrNull(expiryDate);
    if (hsCode !== undefined) container.actual.hsCode = hsCode || '';
    if (packagingDate !== undefined) container.actual.packagingDate = toDateOrNull(packagingDate);
    if (grossWeight !== undefined) container.actual.grossWeight = grossWeight || '';
    if (netWeight !== undefined) container.actual.netWeight = netWeight || '';
    const uploadedByField = {};
    for (const [field, list] of Object.entries(files)) {
      if (field === 'commercialInvoiceDocument') continue;
      const file = Array.isArray(list) ? list[0] : null;
      if (!file) continue;
      const uploaded = await uploadBufferToS3(file, `shipments/bl-details/${field}`);
      uploadedByField[field] = uploaded;
    }

    if (Array.isArray(parsedCostSheetBookings)) {
      container.actual.costSheetBookings = parsedCostSheetBookings.map((row, index) => {
        const existing = container.actual?.costSheetBookings?.[index] || {};
        const attachmentUpload = uploadedByField[`costSheetBookings_${index}_attachment`];
        return {
          sn: Number(row.sn) || 0,
          description: row.description || '',
          visibleTo: normalizeVisibleTo(row.visibleTo),
          defaultQty: Number(row.defaultQty ?? 0),
          defaultRate: Number(row.defaultRate ?? 0),
          requestAmount: Number(row.requestAmount ?? (Number(row.defaultQty ?? 0) * Number(row.defaultRate ?? 0))),
          paymentTo: row.paymentTo || '',
          paymentTerm: row.paymentTerm || '',
          // POINT 5: paidAmount removed, replaced with remarks
          remarks: row.remarks ?? '',
          attachmentDocumentUrl: attachmentUpload?.url || row.attachmentDocumentUrl || existing.attachmentDocumentUrl || '',
          attachmentDocumentName: attachmentUpload?.fileName || row.attachmentDocumentName || existing.attachmentDocumentName || '',
        };
      });
    }
    if (Array.isArray(parsedStorageAllocations)) {
      container.actual.storageAllocations = parsedStorageAllocations.map((row) => ({
        sn: Number(row.sn) || 0,
        containerSerialNo: row.containerSerialNo || '',
        bags: Number(row.bags ?? row.pkgCt ?? 0) || 0,
        warehouse: row.warehouse || '',
        storageAvailability: Number(row.storageAvailability) || 0
      }));
    }
    if (parsedStorageAllocationDecision) {
      container.actual.storageAllocationDecision = {
        similarItems: parsedStorageAllocationDecision.similarItems !== false,
        splitRequired: !!parsedStorageAllocationDecision.splitRequired,
        splitQuantity: Number(parsedStorageAllocationDecision.splitQuantity) || 0,
      };
    }
    if (Array.isArray(parsedStorageAllocationSplits)) {
      container.actual.storageAllocationSplits = parsedStorageAllocationSplits.map((row, index) => ({
        sn: Number(row.sn) || index + 1,
        itemName: row.itemName || '',
        quantity: Number(row.quantity) || 0,
        warehouse: row.warehouse || '',
      }));
    }

    if (costSheetBookingDocument) {
      const uploaded = await uploadBufferToS3(costSheetBookingDocument, 'shipments/bl/cost-sheet');
      container.actual.costSheetBookingDocumentUrl = uploaded.url;
      container.actual.costSheetBookingDocumentName = uploaded.fileName;
    }

    if (commercialInvoiceDocument) {
      const uploaded = await uploadBufferToS3(commercialInvoiceDocument, 'shipments/bl-details/commercial-invoice');
      applyCommercialInvoiceDocumentUpload(container.actual, uploaded);
    }

    if (isClearingAdvanceSave) {
      const normalizedPaymentDetails = {
        chequeNo: String(chequeNo ?? parsedClearingAdvancePaymentDetails.chequeNo ?? '').trim(),
        chequeDate: chequeDate ?? parsedClearingAdvancePaymentDetails.chequeDate ?? null,
        paymentVoucherNo: String(paymentVoucherNo ?? parsedClearingAdvancePaymentDetails.paymentVoucherNo ?? '').trim(),
        transactionId: String(transactionId ?? parsedClearingAdvancePaymentDetails.transactionId ?? '').trim(),
      };
      const missingPaymentFields = [];
      if (!normalizedPaymentDetails.chequeNo) missingPaymentFields.push('Cheque No');
      if (!normalizedPaymentDetails.chequeDate) missingPaymentFields.push('Cheque Date');
      if (!normalizedPaymentDetails.paymentVoucherNo) missingPaymentFields.push('Payment Voucher No');
      if (missingPaymentFields.length) {
        return res.status(400).json({
          message: `Please provide ${missingPaymentFields.join(', ')} before submitting clearing advance.`,
        });
      }
      container.actual.clearingAdvancePaymentDetails = {
        ...(container.actual.clearingAdvancePaymentDetails?.toObject
          ? container.actual.clearingAdvancePaymentDetails.toObject()
          : container.actual.clearingAdvancePaymentDetails || {}),
        chequeNo: normalizedPaymentDetails.chequeNo,
        chequeDate: toDateOrNull(normalizedPaymentDetails.chequeDate),
        paymentVoucherNo: normalizedPaymentDetails.paymentVoucherNo,
        transactionId: normalizedPaymentDetails.transactionId,
      };
      container.actual.clearingAdvanceApproval = buildClearingAdvancePendingApproval(req.user);
    }

    if (isStorageAllocationSave) {
      container.actual.storageAllocationApproval = buildStorageAllocationPendingApproval(req.user);
    }

    await container.save();

    if (isClearingAdvanceSave) {
      await syncSameBlActualFields({
        ContainerModel: Container,
        sourceContainer: container,
        fields: SAME_BL_CLEARING_ADVANCE_FIELDS,
      });
    }

    // Advance shipment stage to B/L Details
    const shipmentForBL = await Shipment.findById(container.shipmentId);
    if (shipmentForBL) {
      advanceShipmentStage(shipmentForBL, 'B/L Details');
      await shipmentForBL.save();
      if (isFirstBlSave) {
        notifyActualContainerSavedRolesByEmail({
          roles: ['Logistic', 'warehouse'],
          shipment: shipmentForBL,
          container,
          actor: req.user,
        }).catch((error) => {
          console.error(`First B/L save notification warning for ${shipmentForBL.shipmentNo || shipmentForBL._id}:`, error.message);
        });
      } else if (isStorageAllocationSave) {
        notifyStorageAllocationRolesByEmail({
          roles: ['warehouse'],
          shipment: shipmentForBL,
          container,
          actor: req.user,
          approvalStage: 'Pending Warehouse Manager Approval',
        }).catch((error) => {
          console.error(`Storage allocation notification warning for ${shipmentForBL.shipmentNo || shipmentForBL._id}:`, error.message);
        });
      } else if (!isClearingAdvanceSave) {
        fireAndForgetWorkflowEmail({
          role: WORKFLOW_NOTIFICATION_ROLE_MAP.blDetails,
          shipment: shipmentForBL,
          container,
          sectionLabel: 'B/L Details',
          actor: req.user,
        });
      }
    }

    if (isClearingAdvanceSave) {
      await writeAuditLog({
        userId: req.user._id,
        module: 'Logistics',
        entity: 'Container',
        entityId: container._id,
        action: 'SubmitClearingAdvance',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: 'Clearing advance submitted for FAS approval'
      });
    } else if (isStorageAllocationSave) {
      await writeAuditLog({
        userId: req.user._id,
        module: 'Logistics',
        entity: 'Container',
        entityId: container._id,
        action: 'SubmitStorageAllocations',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: 'Storage allocations submitted for warehouse manager approval'
      });
    }

    res.status(200).json({
      message: 'B/L details updated successfully',
      container
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


exports.updateFASContainer = async (req, res) => {
  try {
    const files = req.files || {};
    const inwardCollectionAdviceDocument = files?.inwardCollectionAdviceDocument?.[0];
    const murabahaContractSubmittedDocument = files?.murabahaContractSubmittedDocument?.[0];
    const documentsReleasedDocument = files?.documentsReleasedDocument?.[0];

    const {
      BLNo,
      DHL,
      expectedDocDate,
      receiver,
      courierTrackNo,
      courierServiceProvider,
      bankName,
      docArrivalNotes,
      inwardCollectionAdviceDate,
      inwardCollectionAdviceReceivedAt,
      inwardCollectionAdviceSubmittedAt,
      murabahaContractReleasedDate,
      murabahaContractApprovedDate,
      murabahaContractSubmittedDate,
      documentsReleasedDate,
      bankAdvanceAmountDocumentUrl,
      bankAdvanceApprovedDocumentUrl,
      bankAdvanceSubmittedOn,
      docToBeReleasedOn
    } = req.body;

    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: "Container not found" });

    if (!container.actual) return res.status(400).json({ message: "Container has no actual recorded yet" });

    const beforeUpdate = container.toObject();
    const documentTrackerSyncFields = [];
    const documentTrackerSyncBlNos = new Set();
    const addDocumentTrackerSyncField = (...fields) => {
      fields.forEach((field) => {
        if (
          SAME_BL_DOCUMENT_TRACKER_FIELDS.includes(field) &&
          !documentTrackerSyncFields.includes(field)
        ) {
          documentTrackerSyncFields.push(field);
        }
      });
    };
    const addDocumentTrackerSyncBlNo = (value) => {
      const normalized = String(value || '').trim();
      if (normalized) documentTrackerSyncBlNos.add(normalized);
    };

    if (BLNo !== undefined) {
      addDocumentTrackerSyncBlNo(beforeUpdate?.actual?.BLNo);
      addDocumentTrackerSyncBlNo(BLNo);
      container.actual.BLNo = BLNo;
      container.actual.CLNo = BLNo;
      addDocumentTrackerSyncField('BLNo', 'CLNo');
    }
    if (DHL !== undefined) {
      container.actual.DHL = DHL;
      addDocumentTrackerSyncField('DHL');
    }
    if (courierTrackNo !== undefined) {
      container.actual.courierTrackNo = courierTrackNo || '';
      addDocumentTrackerSyncField('courierTrackNo');
    }
    if (courierServiceProvider !== undefined) {
      container.actual.courierServiceProvider = courierServiceProvider || '';
      addDocumentTrackerSyncField('courierServiceProvider');
    }
    if (expectedDocDate !== undefined) {
      container.actual.expectedDocDate = toDateOrNull(expectedDocDate);
      addDocumentTrackerSyncField('expectedDocDate');
    }
    if (receiver !== undefined) {
      container.actual.receiver = receiver;
      addDocumentTrackerSyncField('receiver');
    }
    if (bankName !== undefined) {
      container.actual.bankName = bankName || '';
      addDocumentTrackerSyncField('bankName');
    }
    if (docArrivalNotes !== undefined) {
      container.actual.docArrivalNotes = docArrivalNotes || '';
      addDocumentTrackerSyncField('docArrivalNotes');
    }
    if (inwardCollectionAdviceDate !== undefined) {
      container.actual.inwardCollectionAdviceDate = toDateOrNull(inwardCollectionAdviceDate);
      addDocumentTrackerSyncField('inwardCollectionAdviceDate');
    }
    if (inwardCollectionAdviceReceivedAt !== undefined) {
      container.actual.inwardCollectionAdviceReceivedAt = toDateOrNull(inwardCollectionAdviceReceivedAt);
      addDocumentTrackerSyncField('inwardCollectionAdviceReceivedAt');
    }
    if (inwardCollectionAdviceSubmittedAt !== undefined) {
      container.actual.inwardCollectionAdviceSubmittedAt = toDateOrNull(inwardCollectionAdviceSubmittedAt);
      addDocumentTrackerSyncField('inwardCollectionAdviceSubmittedAt');
    }
    if (murabahaContractReleasedDate !== undefined) {
      container.actual.murabahaContractReleasedDate = toDateOrNull(murabahaContractReleasedDate);
      addDocumentTrackerSyncField('murabahaContractReleasedDate');
    }
    if (murabahaContractApprovedDate !== undefined) {
      container.actual.murabahaContractApprovedDate = toDateOrNull(murabahaContractApprovedDate);
      addDocumentTrackerSyncField('murabahaContractApprovedDate');
    }
    if (murabahaContractSubmittedDate !== undefined) {
      container.actual.murabahaContractSubmittedDate = toDateOrNull(murabahaContractSubmittedDate);
      addDocumentTrackerSyncField('murabahaContractSubmittedDate');
    }
    if (documentsReleasedDate !== undefined) {
      container.actual.documentsReleasedDate = toDateOrNull(documentsReleasedDate);
      addDocumentTrackerSyncField('documentsReleasedDate');
    }
    if (bankAdvanceAmountDocumentUrl !== undefined) {
      container.actual.bankAdvanceAmountDocumentUrl = bankAdvanceAmountDocumentUrl || '';
      addDocumentTrackerSyncField('bankAdvanceAmountDocumentUrl');
    }
    if (bankAdvanceApprovedDocumentUrl !== undefined) {
      container.actual.bankAdvanceApprovedDocumentUrl = bankAdvanceApprovedDocumentUrl || '';
      addDocumentTrackerSyncField('bankAdvanceApprovedDocumentUrl');
    }
    if (bankAdvanceSubmittedOn !== undefined) {
      container.actual.bankAdvanceSubmittedOn = toDateOrNull(bankAdvanceSubmittedOn);
      addDocumentTrackerSyncField('bankAdvanceSubmittedOn');
    }
    if (docToBeReleasedOn !== undefined) {
      container.actual.docToBeReleasedOn = toDateOrNull(docToBeReleasedOn);
      addDocumentTrackerSyncField('docToBeReleasedOn');
    }

    if (inwardCollectionAdviceDocument) {
      const uploaded = await uploadBufferToS3(inwardCollectionAdviceDocument, 'shipments/document-tracker/inward-advice');
      container.actual.inwardCollectionAdviceDocumentUrl = uploaded.url;
      container.actual.inwardCollectionAdviceDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('inwardCollectionAdviceDocumentUrl', 'inwardCollectionAdviceDocumentName');
    }
    if (murabahaContractSubmittedDocument) {
      const uploaded = await uploadBufferToS3(murabahaContractSubmittedDocument, 'shipments/document-tracker/murabaha-submitted');
      container.actual.murabahaContractSubmittedDocumentUrl = uploaded.url;
      container.actual.murabahaContractSubmittedDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('murabahaContractSubmittedDocumentUrl', 'murabahaContractSubmittedDocumentName');
    }
    if (documentsReleasedDocument) {
      const uploaded = await uploadBufferToS3(documentsReleasedDocument, 'shipments/document-tracker/documents-released');
      container.actual.documentsReleasedDocumentUrl = uploaded.url;
      container.actual.documentsReleasedDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('documentsReleasedDocumentUrl', 'documentsReleasedDocumentName');
    }

    container.status = "Documented";
    await container.save();

    if (documentTrackerSyncFields.length) {
      const matchBlNos = documentTrackerSyncBlNos.size ? Array.from(documentTrackerSyncBlNos) : [undefined];
      for (const matchBlNo of matchBlNos) {
        await syncSameBlActualFields({
          ContainerModel: Container,
          sourceContainer: container,
          fields: documentTrackerSyncFields,
          matchBlNo,
        });
      }
    }

    // Advance shipment stage to Documentation
    const shipmentForDoc = await Shipment.findById(container.shipmentId);
    if (shipmentForDoc) {
      advanceShipmentStage(shipmentForDoc, 'Documentation');
      await shipmentForDoc.save();
      fireAndForgetWorkflowEmail({
        role: WORKFLOW_NOTIFICATION_ROLE_MAP.documentation,
        shipment: shipmentForDoc,
        container,
        sectionLabel: 'Document Tracker',
        actor: req.user,
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: "FAS",
      entity: "Container",
      entityId: container._id,
      action: "UpdateFASDetails",
      before: beforeUpdate,
      after: container.toObject(),
      remarks: "FAS updated documentation details for container"
    });

    res.status(200).json({ message: "FAS details updated successfully", container });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateLogisticsDetails = async (req, res) => {
  console.log('🚀 [Logistics] Received update request for container:', req.params.id);
  try {
    const container = await Container.findById(req.params.id);
    const files = req.files || {};
    console.log('📦 [Logistics] Section Key:', req.body.sectionKey);
    console.log('📄 [Logistics] Files attached:', Object.keys(files));
    const {
      arrivalOn,
      shipmentFreeRetentionDate,
      portRetentionWithPenaltyDate,
      maximumRetentionDate,
      arrivalNoticeDate,
      arrivalNoticeFreeRetentionDays,
      advanceRequestDate,
      doReleasedDate,
      doReleasedRemarks,
      boePassingDate,
      boePassingRemarks,
      dmBarcode,
      customsClearanceDate,
      customsClearanceRemarks,
      tokenReceivedDate,
      municipalityDate,
      municipalityRemarks,
      municipalityStatus,
      municipalityStatusComment,
      sectionKey,
      bulkSectionKeys,
      transportationBooked,
      transportationPartialSave,
      deliveryOrderDocumentUrl,
      deliveryOrderDate,
      tokenDocumentUrl,
      tokenDate,
      transportArrangedDocumentUrl,
      transportArrangedDate,
      customsClearanceDocumentUrl,
      municipalityClearanceDocumentUrl,
      municipalityClearanceDate,
      deliverySchedules,
      warehouseSchedules,
      customClearanceRequired,
      dpInvoiceDocumentUrl,
      dpInvoiceDocumentName,
      dpwCargoExtraction,
      municipalityClearanceCertificateUrl,
      municipalityClearanceCertificateName
    } = req.body;

    if (!container)
      return res.status(404).json({ message: "Container not found" });

    if (!container.actual)
      return res.status(400).json({ message: "Actual not created yet" });

    const parsedTransportationBooked = parseJsonField(transportationBooked);
    const parsedDeliverySchedules = parseJsonField(deliverySchedules);
    const parsedWarehouseSchedules = parseJsonField(warehouseSchedules);
    const parsedBulkSectionKeys = parseJsonField(bulkSectionKeys);
    const isBulkSave = Array.isArray(parsedBulkSectionKeys) && parsedBulkSectionKeys.length > 0;
    const isTransportationPartialSave = String(transportationPartialSave) === 'true';
    const shouldProcessTransportation =
      sectionKey === 'transportation' || (isBulkSave && parsedBulkSectionKeys.includes('transportation'));

    if (arrivalOn !== undefined) container.actual.arrivalOn = toDateOrNull(arrivalOn);
    if (arrivalNoticeFreeRetentionDays !== undefined) {
      container.actual.arrivalNoticeFreeRetentionDays = Number(arrivalNoticeFreeRetentionDays) || 0;
    }
    const effectiveArrivalOn = arrivalOn !== undefined ? arrivalOn : container.actual.arrivalOn;
    const effectiveFreeRetentionDays =
      Number(container.actual.arrivalNoticeFreeRetentionDays) > 0
        ? Number(container.actual.arrivalNoticeFreeRetentionDays)
        : Number(container.actual.freeDetentionDays) || 0;
    const computedFreeRetentionDate = addDays(effectiveArrivalOn, effectiveFreeRetentionDays);
    const computedMaximumRetentionDate = addDays(effectiveArrivalOn, container.actual.maximumDetentionDays);
    if (shipmentFreeRetentionDate !== undefined || computedFreeRetentionDate) {
      container.actual.shipmentFreeRetentionDate = computedFreeRetentionDate || toDateOrNull(shipmentFreeRetentionDate);
    }
    if (portRetentionWithPenaltyDate !== undefined) {
      container.actual.portRetentionWithPenaltyDate = toDateOrNull(portRetentionWithPenaltyDate);
    }
    if (maximumRetentionDate !== undefined || computedMaximumRetentionDate) {
      container.actual.maximumRetentionDate = computedMaximumRetentionDate || toDateOrNull(maximumRetentionDate);
    }
    if (arrivalNoticeDate !== undefined) container.actual.arrivalNoticeDate = toDateOrNull(arrivalNoticeDate);
    if (advanceRequestDate !== undefined) container.actual.advanceRequestDate = toDateOrNull(advanceRequestDate);
    if (doReleasedDate !== undefined) container.actual.doReleasedDate = toDateOrNull(doReleasedDate);
    if (doReleasedRemarks !== undefined) container.actual.doReleasedRemarks = doReleasedRemarks || '';
    if (boePassingDate !== undefined) container.actual.boePassingDate = toDateOrNull(boePassingDate);
    if (boePassingRemarks !== undefined) container.actual.boePassingRemarks = boePassingRemarks || '';
    if (dmBarcode !== undefined) container.actual.dmBarcode = dmBarcode || '';
    if (customsClearanceDate !== undefined) container.actual.customsClearanceDate = toDateOrNull(customsClearanceDate);
    if (customsClearanceRemarks !== undefined) container.actual.customsClearanceRemarks = customsClearanceRemarks || '';
    if (tokenReceivedDate !== undefined) container.actual.tokenReceivedDate = toDateOrNull(tokenReceivedDate);
    if (municipalityDate !== undefined) container.actual.municipalityDate = toDateOrNull(municipalityDate);
    if (municipalityRemarks !== undefined) container.actual.municipalityRemarks = municipalityRemarks || '';
    if (municipalityStatus !== undefined) {
      container.actual.municipalityStatus = ['open', 'closed'].includes(String(municipalityStatus).toLowerCase())
        ? String(municipalityStatus).toLowerCase()
        : 'open';
    }
    if (municipalityStatusComment !== undefined) {
      container.actual.municipalityStatusComment = municipalityStatusComment || '';
    }
    if (customClearanceRequired !== undefined) {
      container.actual.customClearanceRequired = String(customClearanceRequired) === 'true';
    }
    if (dpwCargoExtraction !== undefined) {
      container.actual.dpwCargoExtraction = parseJsonField(dpwCargoExtraction);
    }
    if (dpInvoiceDocumentUrl !== undefined) {
      container.actual.dpInvoiceDocumentUrl = dpInvoiceDocumentUrl || '';
    }
    if (dpInvoiceDocumentName !== undefined) {
      container.actual.dpInvoiceDocumentName = dpInvoiceDocumentName || '';
    }
    if (municipalityClearanceCertificateUrl !== undefined) {
      container.actual.municipalityClearanceCertificateUrl = municipalityClearanceCertificateUrl || '';
    }
    if (municipalityClearanceCertificateName !== undefined) {
      container.actual.municipalityClearanceCertificateName = municipalityClearanceCertificateName || '';
    }

    if (deliveryOrderDocumentUrl !== undefined) container.actual.deliveryOrderDocumentUrl = deliveryOrderDocumentUrl || '';
    if (deliveryOrderDate !== undefined) container.actual.deliveryOrderDate = toDateOrNull(deliveryOrderDate);
    if (tokenDocumentUrl !== undefined) container.actual.tokenDocumentUrl = tokenDocumentUrl || '';
    if (tokenDate !== undefined) container.actual.tokenDate = toDateOrNull(tokenDate);
    if (transportArrangedDocumentUrl !== undefined) container.actual.transportArrangedDocumentUrl = transportArrangedDocumentUrl || '';
    if (transportArrangedDate !== undefined) container.actual.transportArrangedDate = toDateOrNull(transportArrangedDate);
    if (customsClearanceDocumentUrl !== undefined) container.actual.customsClearanceDocumentUrl = customsClearanceDocumentUrl || '';
    if (customsClearanceDate !== undefined) container.actual.customsClearanceDate = toDateOrNull(customsClearanceDate);
    if (municipalityClearanceDocumentUrl !== undefined) container.actual.municipalityClearanceDocumentUrl = municipalityClearanceDocumentUrl || '';
    if (municipalityClearanceDate !== undefined) container.actual.municipalityClearanceDate = toDateOrNull(municipalityClearanceDate);

    const arrivalNoticeDocument = files?.arrivalNoticeDocument?.[0];
    const advanceRequestDocument = files?.advanceRequestDocument?.[0];
    const doReleasedDocument = files?.doReleasedDocument?.[0];
    const boePassingDocument = files?.boePassingDocument?.[0];
    const customsClearanceDocument = files?.customsClearanceDocument?.[0];
    const municipalityDocument = files?.municipalityDocument?.[0];
    const dpInvoiceDocument = files?.dpInvoiceDocument?.[0];
    const municipalityClearanceCertificate = files?.municipalityClearanceCertificate?.[0];
    const customsDocBoe = files?.customsDocBoe?.[0];
    const customsDocDo = files?.customsDocDo?.[0];
    const customsDocBl = files?.customsDocBl?.[0];
    const customsDocInvoice = files?.customsDocInvoice?.[0];
    const customsDocPackingList = files?.customsDocPackingList?.[0];

    if (arrivalNoticeDocument) {
      const uploaded = await uploadBufferToS3(arrivalNoticeDocument, 'shipments/logistics/arrival-notice');
      container.actual.arrivalNoticeDocumentUrl = uploaded.url;
      container.actual.arrivalNoticeDocumentName = uploaded.fileName;
    }
    if (advanceRequestDocument) {
      const uploaded = await uploadBufferToS3(advanceRequestDocument, 'shipments/logistics/advance-request');
      container.actual.advanceRequestDocumentUrl = uploaded.url;
      container.actual.advanceRequestDocumentName = uploaded.fileName;
    }
    if (doReleasedDocument) {
      const uploaded = await uploadBufferToS3(doReleasedDocument, 'shipments/logistics/do-released');
      container.actual.doReleasedDocumentUrl = uploaded.url;
      container.actual.doReleasedDocumentName = uploaded.fileName;
    }
    if (boePassingDocument) {
      const uploaded = await uploadBufferToS3(boePassingDocument, 'shipments/logistics/boe-passing');
      container.actual.boePassingDocumentUrl = uploaded.url;
      container.actual.boePassingDocumentName = uploaded.fileName;
    }
    if (customsClearanceDocument) {
      const uploaded = await uploadBufferToS3(customsClearanceDocument, 'shipments/logistics/customs-clearance');
      container.actual.customsClearanceDocumentUrl = uploaded.url;
      container.actual.customsClearanceDocumentName = uploaded.fileName;
    }
    if (municipalityDocument) {
      const uploaded = await uploadBufferToS3(municipalityDocument, 'shipments/logistics/municipality');
      container.actual.municipalityDocumentUrl = uploaded.url;
      container.actual.municipalityDocumentName = uploaded.fileName;
    }
    if (dpInvoiceDocument) {
      const uploaded = await uploadBufferToS3(dpInvoiceDocument, 'shipments/logistics/dp-invoice');
      container.actual.dpInvoiceDocumentUrl = uploaded.url;
      container.actual.dpInvoiceDocumentName = uploaded.fileName;
    }
    if (municipalityClearanceCertificate) {
      const uploaded = await uploadBufferToS3(municipalityClearanceCertificate, 'shipments/logistics/municipality-certificate');
      container.actual.municipalityClearanceCertificateUrl = uploaded.url;
      container.actual.municipalityClearanceCertificateName = uploaded.fileName;
    }
    if (!container.actual.customsOriginalDocuments) {
      container.actual.customsOriginalDocuments = {};
    }
    if (customsDocBoe) {
      const uploaded = await uploadBufferToS3(customsDocBoe, 'shipments/logistics/customs-documents/boe');
      container.actual.customsOriginalDocuments.boeDocumentUrl = uploaded.url;
      container.actual.customsOriginalDocuments.boeDocumentName = uploaded.fileName;
    }
    if (customsDocDo) {
      const uploaded = await uploadBufferToS3(customsDocDo, 'shipments/logistics/customs-documents/do');
      container.actual.customsOriginalDocuments.doDocumentUrl = uploaded.url;
      container.actual.customsOriginalDocuments.doDocumentName = uploaded.fileName;
    }
    if (customsDocBl) {
      const uploaded = await uploadBufferToS3(customsDocBl, 'shipments/logistics/customs-documents/bl');
      container.actual.customsOriginalDocuments.blOriginalDocumentUrl = uploaded.url;
      container.actual.customsOriginalDocuments.blOriginalDocumentName = uploaded.fileName;
    }
    if (customsDocInvoice) {
      const uploaded = await uploadBufferToS3(customsDocInvoice, 'shipments/logistics/customs-documents/invoice');
      container.actual.customsOriginalDocuments.invoiceDocumentUrl = uploaded.url;
      container.actual.customsOriginalDocuments.invoiceDocumentName = uploaded.fileName;
    }
    if (customsDocPackingList) {
      const uploaded = await uploadBufferToS3(customsDocPackingList, 'shipments/logistics/customs-documents/packing-list');
      container.actual.customsOriginalDocuments.packingListDocumentUrl = uploaded.url;
      container.actual.customsOriginalDocuments.packingListDocumentName = uploaded.fileName;
    }

    const shouldValidateBoePassing =
      sectionKey === 'boePassingDate' || (isBulkSave && parsedBulkSectionKeys.includes('boePassingDate'));
    if (shouldValidateBoePassing) {
      if (!container.actual.dpInvoiceDocumentUrl) {
        return res.status(400).json({
          message: 'DP Invoice document is required',
        });
      }
    }

    const shouldValidateCustomsClearance =
      sectionKey === 'customsClearance' || (isBulkSave && parsedBulkSectionKeys.includes('customsClearance'));
    if (shouldValidateCustomsClearance && container.actual.customClearanceRequired) {
      if (!container.actual.customsClearanceDate) {
        return res.status(400).json({
          message: 'Customs Clearance Date is required',
        });
      }
    }

    if (shouldProcessTransportation && Array.isArray(parsedTransportationBooked)) {
      const transportationRowsToValidate = isTransportationPartialSave
        ? parsedTransportationBooked.filter((row) => row?.bulkSelected === true)
        : parsedTransportationBooked;

      if (isTransportationPartialSave && transportationRowsToValidate.length === 0) {
        return res.status(400).json({
          message: 'Select at least one transportation row to save',
        });
      }

      const missingTransportCompany = transportationRowsToValidate.some(
        (row) => !row.transportCompanyName || String(row.transportCompanyName).trim() === ''
      );

      if (missingTransportCompany) {
        return res.status(400).json({
          message: isTransportationPartialSave
            ? 'Transport company name is required for selected transportation bookings'
            : 'Transport company name is required for all transportation bookings',
        });
      }

      container.actual.transportationBooked = parsedTransportationBooked.map((row) => ({
        sn: Number(row.sn) || 0,
        containerSerialNo: row.containerSerialNo || '',
        transportCompanyName: row.transportCompanyName || '',
        bookedDate: toDateOrNull(row.bookedDate),
        bookingTime: toTimeString(row.bookingTime),
        transportDate: toDateOrNull(row.transportDate),
        transportTime: toTimeString(row.transportTime),
        delayHours: Number(row.delayHours ?? 0) || 0,
        storageStartDate: toDateOrNull(row.storageStartDate),
        storageEndDate: toDateOrNull(row.storageEndDate),
        tokenReceivedDate: toDateOrNull(row.tokenReceivedDate)
      }));
    }

    if (shouldProcessTransportation && Array.isArray(container.actual.transportationBooked)) {
      container.actual.transportationBooked = container.actual.transportationBooked.map((row) => {
        const matchingStorage = (container.actual.storageSplits || []).find(
          (split) => split.containerSerialNo === row.containerSerialNo
        );
        const plain = toPlainObject(row);
        return {
          ...plain,
          storageStartDate: toDateOrNull(plain.storageStartDate),
          storageEndDate: toDateOrNull(plain.storageEndDate),
          tokenReceivedDate: toDateOrNull(plain.tokenReceivedDate),
          delayHours: calculateDelayHours(
            row.transportDate,
            row.transportTime,
            matchingStorage?.receivedOnDate,
            matchingStorage?.receivedOnTime
          )
        };
      });
    }

    if (Array.isArray(parsedDeliverySchedules)) {
      container.actual.deliverySchedules = parsedDeliverySchedules.map((ds) => ({
        deliveryDate: toDateOrNull(ds.deliveryDate),
        deliveryNo: ds.deliveryNo || '',
        noOfFCL: ds.noOfFCL,
        time: ds.time || '',
        location: ds.location || ''
      }));
    }
    if (Array.isArray(parsedWarehouseSchedules)) {
      container.actual.warehouseSchedules = parsedWarehouseSchedules.map((ws) => ({
        deliveryDate: toDateOrNull(ws.deliveryDate),
        deliveryNo: ws.deliveryNo || '',
        noOfFCL: ws.noOfFCL,
        time: ws.time || '',
        location: ws.location || '',
        grn: ws.grn || ''
      }));
    }

    container.status = "Arrived";

    // Persist section lock if sectionKey is provided
    if (isBulkSave) {
      if (!Array.isArray(container.actual.lockedLogisticsSections)) {
        container.actual.lockedLogisticsSections = [];
      }
      parsedBulkSectionKeys.forEach((key) => {
        if (key && !container.actual.lockedLogisticsSections.includes(key)) {
          container.actual.lockedLogisticsSections.push(key);
        }
      });
    } else if (sectionKey && !(sectionKey === 'transportation' && isTransportationPartialSave)) {
      if (!Array.isArray(container.actual.lockedLogisticsSections)) {
        container.actual.lockedLogisticsSections = [];
      }
      if (!container.actual.lockedLogisticsSections.includes(sectionKey)) {
        container.actual.lockedLogisticsSections.push(sectionKey);
      }
    }

    await container.save();

    // Advance shipment stage to Port and Clearance while keeping the stored enum value backward-compatible.
    const shipmentForLogistics = await Shipment.findById(container.shipmentId);
    if (shipmentForLogistics) {
      console.log('📈 [Logistics] Advancing shipment stage to "Port and Clearance"');
      advanceShipmentStage(shipmentForLogistics, 'Port & Customs');
      await shipmentForLogistics.save();
      fireAndForgetWorkflowEmail({
        role: WORKFLOW_NOTIFICATION_ROLE_MAP.logistics,
        shipment: shipmentForLogistics,
        container,
        sectionLabel:
          isBulkSave
            ? 'Port and Clearance - Bulk Save'
            : sectionKey
              ? `Port and Clearance - ${sectionKey}`
              : 'Port and Clearance',
        actor: req.user,
      });
    }

    const shipment = await Shipment.findById(container.shipmentId);
    if (!shipment) {
      return res.status(500).json({ message: "Shipment not found" });
    }

    console.log('✅ [Logistics] Successfully updated section:', isBulkSave ? `bulk(${parsedBulkSectionKeys.join(',')})` : (sectionKey || 'All'));
    res.status(200).json({
      message:
        isBulkSave
          ? 'Bulk logistics details updated successfully'
          : sectionKey
            ? `${sectionKey} updated successfully`
            : "Logistics details updated successfully",
      container,
      shipment: {
        actualQtyMT: shipment.actualQtyMT,
        actualBags: shipment.actualBags,
        currentStage: shipment.currentStage
      }
    });

  } catch (err) {
    console.error('❌ [Logistics] Error updating logistics details:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.addContainerPayment = async (req, res) => {
  try {

    const container = await Container.findById(req.params.id);
    const { paid_amount, paidOn, remarks } = req.body;

    if (!paid_amount || paid_amount <= 0)
      return res.status(400).json({ message: "Valid amount required" });

    if (!container)
      return res.status(404).json({ message: "Container not found" });

    const shipment = await Shipment.findById(container.shipmentId);
    if (!shipment)
      return res.status(404).json({ message: "Shipment not found" });

    const allContainers = await Container.find({
      shipmentId: shipment._id
    });


    const shipmentTotalPaid = allContainers.reduce(
      (sum, c) => sum + (c.actual?.paid_amount || 0),
      0
    );


    if (shipmentTotalPaid + paid_amount > shipment.payment?.totalAmount) {
      return res.status(400).json({
        message: "Payment exceeds shipment invoice amount"
      });
    }

    container.actual.paid_amount = paid_amount;
    container.actual.paidOn = paidOn;
    container.actual.remarks = remarks;
    container.status = "Paid";
    await container.save();

    // 🔥 Add to existing paidAmount
    shipment.payment.paidAmount += paid_amount;

    // 🔥 Update balance
    shipment.payment.balanceAmount =
      shipment.payment.totalAmount - shipment.payment.paidAmount;

    // 🔥 Update status
    if (shipment.payment.paidAmount === 0) {
      shipment.payment.paymentStatus = "Pending";
    } else if (shipment.payment.balanceAmount === 0) {
      shipment.payment.paymentStatus = "Paid";
    } else {
      shipment.payment.paymentStatus = "Partially Paid";
    }

    await shipment.save();

    res.status(200).json({
      message: "Payment added successfully",
      payment: container.payment
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.clearContainer = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    const { clearedOn, remarks, warehouse } = req.body;

    if (!container) return res.status(404).json({ message: "Container not found" });

    // 🔥 Only allow clearance if actual exists
    if (!container.actual) {
      return res.status(400).json({ message: "Cannot clear: container has no actual record" });
    }


    container.actual.clearance = {
      clearedOn: clearedOn || new Date(),
      remarks: remarks || "",
      warehouse: warehouse || ""
    };

    container.status = "Cleared"; // optional overall status update

    await container.save();

    res.status(200).json({
      message: "Container cleared successfully",
      containerActual: container.actual
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.addContainerGRN = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    const { grnNo, grnDate, statusRemarks } = req.body;

    if (!grnNo || !grnDate) return res.status(400).json({ message: "GRN No and GRN Date required" });


    if (!container) return res.status(404).json({ message: "Container not found" });

    // 🔥 Ensure container has actual and is cleared
    if (!container.actual) {
      return res.status(400).json({ message: "Cannot add GRN: container has no actual record" });
    }

    if (!container.actual.clearance || !container.actual.clearance.clearedOn) {
      return res.status(400).json({ message: "Cannot add GRN: container not cleared yet" });
    }

    container.actual.grn = {
      grnNo,
      grnDate: new Date(grnDate),
      statusRemarks: statusRemarks || ""
    };

    container.status = "GRN"; // optional overall status

    await container.save();

    res.status(200).json({
      message: "GRN added successfully",
      containerActual: container.actual
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateStorageDetails = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const files = normalizeUploadedFiles(req.files);
    const { storageSplits } = req.body;
    const parsedStorageSplits = parseJsonField(storageSplits);
    if (!Array.isArray(parsedStorageSplits)) {
      return res.status(400).json({ message: 'storageSplits must be an array' });
    }

    container.actual.storageSplits = parsedStorageSplits.map((row, index) => {
      const rowUpload = files[`storageSplits_${index}_document`]?.[0];
      const existing = container.actual?.storageSplits?.[index] || {};
      return {
        containerSerialNo: row.containerSerialNo || '',
        bags: Number(row.bags ?? 0) || 0,
        warehouse: row.warehouse || '',
        storageAvailability: Number(row.storageAvailability) || 0,
        receivedOnDate: toDateOrNull(row.receivedOnDate),
        receivedOnTime: toTimeString(row.receivedOnTime),
        customsInspection: row.customsInspection || 'No',
        grn: row.grn || '',
        batch: row.batch || '',
        productionDate: toDateOrNull(row.productionDate),
        expiryDate: toDateOrNull(row.expiryDate),
        remarks: row.remarks || '',
        documentUrl: rowUpload ? undefined : (row.documentUrl || existing.documentUrl || ''),
        documentName: rowUpload ? undefined : (row.documentName || existing.documentName || '')
      };
    });

    for (let index = 0; index < container.actual.storageSplits.length; index++) {
      const rowUpload = files[`storageSplits_${index}_document`]?.[0];
      if (!rowUpload) continue;
      const uploaded = await uploadBufferToS3(rowUpload, `shipments/storage/row-${index + 1}`);
      container.actual.storageSplits[index].documentUrl = uploaded.url;
      container.actual.storageSplits[index].documentName = uploaded.fileName;
    }

    const globalStorageDocument = files?.storageDocument?.[0];
    if (globalStorageDocument) {
      const uploaded = await uploadBufferToS3(globalStorageDocument, 'shipments/storage/global');
      container.actual.storageDocumentUrl = uploaded.url;
      container.actual.storageDocumentName = uploaded.fileName;
    }

    if (Array.isArray(container.actual.transportationBooked)) {
      container.actual.transportationBooked = container.actual.transportationBooked.map((row) => {
        const matchingStorage = container.actual.storageSplits.find(
          (split) => split.containerSerialNo === row.containerSerialNo
        );
        return {
          ...toPlainObject(row),
          delayHours: calculateDelayHours(
            row.transportDate,
            row.transportTime,
            matchingStorage?.receivedOnDate,
            matchingStorage?.receivedOnTime
          )
        };
      });
    }

    container.actual.storageArrivalApproval = buildStorageArrivalPendingApproval(req.user);

    await container.save();

    // Advance shipment stage to Storage
    const shipmentForStorage = await Shipment.findById(container.shipmentId);
    if (shipmentForStorage) {
      advanceShipmentStage(shipmentForStorage, 'Storage');
      await shipmentForStorage.save();
      fireAndForgetWorkflowEmail({
        role: 'warehouse',
        shipment: shipmentForStorage,
        container,
        sectionLabel: 'Storage Arrival',
        actor: req.user,
        approvalStage: 'Pending Warehouse Manager Approval',
      });
    }

    res.status(200).json({ message: 'Storage details updated successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateStorageArrivalRow = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return res.status(400).json({ message: 'Invalid row index' });
    }

    const files = normalizeUploadedFiles(req.files);
    container.actual.storageSplits = Array.isArray(container.actual.storageSplits) ? container.actual.storageSplits : [];

    const existing = container.actual.storageSplits[rowIndex] || {};
    container.actual.storageSplits[rowIndex] = {
      containerSerialNo: req.body.containerSerialNo || existing.containerSerialNo || '',
      bags: Number(req.body.bags ?? existing.bags ?? 0) || 0,
      warehouse: req.body.warehouse || existing.warehouse || '',
      storageAvailability: Number(req.body.storageAvailability ?? existing.storageAvailability ?? 0) || 0,
      receivedOnDate: req.body.receivedOnDate !== undefined ? toDateOrNull(req.body.receivedOnDate) : existing.receivedOnDate || null,
      receivedOnTime: req.body.receivedOnTime !== undefined ? toTimeString(req.body.receivedOnTime) : existing.receivedOnTime || '',
      customsInspection: req.body.customsInspection || existing.customsInspection || 'No',
      grn: req.body.grn || existing.grn || '',
      batch: req.body.batch || existing.batch || '',
      productionDate: req.body.productionDate !== undefined ? toDateOrNull(req.body.productionDate) : existing.productionDate || null,
      expiryDate: req.body.expiryDate !== undefined ? toDateOrNull(req.body.expiryDate) : existing.expiryDate || null,
      remarks: req.body.remarks || existing.remarks || '',
      documentUrl: req.body.documentUrl || existing.documentUrl || '',
      documentName: req.body.documentName || existing.documentName || '',
    };

    const rowUpload = files?.storageRowDocument?.[0];
    if (rowUpload) {
      const uploaded = await uploadBufferToS3(rowUpload, `shipments/storage/row-${rowIndex + 1}`);
      container.actual.storageSplits[rowIndex].documentUrl = uploaded.url;
      container.actual.storageSplits[rowIndex].documentName = uploaded.fileName;
    }

    if (Array.isArray(container.actual.transportationBooked)) {
      container.actual.transportationBooked = container.actual.transportationBooked.map((row) => {
        const matchingStorage = container.actual.storageSplits.find(
          (split) => split.containerSerialNo === row.containerSerialNo
        );
        return {
          ...toPlainObject(row),
          delayHours: calculateDelayHours(
            row.transportDate,
            row.transportTime,
            matchingStorage?.receivedOnDate,
            matchingStorage?.receivedOnTime
          ),
        };
      });
    }

    container.actual.storageArrivalApproval = buildStorageArrivalPendingApproval(req.user);

    await container.save();
    const shipmentForStorageArrival = await Shipment.findById(container.shipmentId);
    if (shipmentForStorageArrival) {
      fireAndForgetWorkflowEmail({
        role: 'warehouse',
        shipment: shipmentForStorageArrival,
        container,
        sectionLabel: `Storage Arrival Row ${rowIndex + 1}`,
        actor: req.user,
        approvalStage: 'Pending Warehouse Manager Approval',
      });
    }
    res.json({ message: 'Storage arrival row updated successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateQualityDetails = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const files = normalizeUploadedFiles(req.files);
    const { qualityRows, qualityReports } = req.body;
    const parsedQualityRows = parseJsonField(qualityRows);
    const parsedQualityReports = parseJsonField(qualityReports);

    const uploadedByField = {};
    for (const [field, list] of Object.entries(files)) {
      const file = Array.isArray(list) ? list[0] : null;
      if (!file) continue;
      const uploaded = await uploadBufferToS3(file, `shipments/quality/${field}`);
      uploadedByField[field] = uploaded;
    }

    if (Array.isArray(parsedQualityRows)) {
      container.actual.qualityRows = parsedQualityRows.map((row, index) => {
        const inhouseUpload = uploadedByField[`qualityRows_${index}_inhouse`];
        const strategicUpload = uploadedByField[`qualityRows_${index}_strategic`];
        const thirdPartyUpload = uploadedByField[`qualityRows_${index}_thirdParty`];
        const attachmentUpload = uploadedByField[`qualityRows_${index}_attachment`];
        const existing = container.actual?.qualityRows?.[index] || {};
        const existingReport = container.actual?.qualityReports?.[index] || {};
        return {
          sn: Number(row.sn) || index + 1,
          sampleNo: row.sampleNo || '',
          phase: row.phase || 'S1',
          date: toDateOrNull(row.date),
          inhouseReportNo: row.inhouseReportNo || '',
          inhouseReportDate: toDateOrNull(row.inhouseReportDate),
          inhouseReportDocumentUrl: inhouseUpload?.url || row.inhouseReportDocumentUrl || existing.inhouseReportDocumentUrl || '',
          inhouseReportDocumentName: inhouseUpload?.fileName || row.inhouseReportDocumentName || existing.inhouseReportDocumentName || '',
          strategicReportNo: row.strategicReportNo || '',
          strategicReportDate: toDateOrNull(row.strategicReportDate),
          strategicReportDocumentUrl: strategicUpload?.url || row.strategicReportDocumentUrl || existing.strategicReportDocumentUrl || '',
          strategicReportDocumentName: strategicUpload?.fileName || row.strategicReportDocumentName || existing.strategicReportDocumentName || '',
          thirdPartyReportNo: row.thirdPartyReportNo || '',
          thirdPartyReportDate: toDateOrNull(row.thirdPartyReportDate),
          thirdPartyReportDocumentUrl: thirdPartyUpload?.url || row.thirdPartyReportDocumentUrl || existing.thirdPartyReportDocumentUrl || '',
          thirdPartyReportDocumentName: thirdPartyUpload?.fileName || row.thirdPartyReportDocumentName || existing.thirdPartyReportDocumentName || '',
          remarks: row.remarks || existing.remarks || existingReport.remarks || '',
          attachmentDocumentUrl: attachmentUpload?.url || row.attachmentDocumentUrl || existing.attachmentDocumentUrl || existingReport.documentUrl || '',
          attachmentDocumentName: attachmentUpload?.fileName || row.attachmentDocumentName || existing.attachmentDocumentName || existingReport.documentName || ''
        };
      });
    }

    if (Array.isArray(parsedQualityReports)) {
      container.actual.qualityReports = parsedQualityReports.map((row, index) => {
        const reportUpload = uploadedByField[`qualityReports_${index}_report`];
        const existing = container.actual?.qualityReports?.[index] || {};
        return {
          phase: row.phase || 'S1',
          reportDate: toDateOrNull(row.reportDate),
          remarks: row.remarks || '',
          documentUrl: reportUpload?.url || row.documentUrl || existing.documentUrl || '',
          documentName: reportUpload?.fileName || row.documentName || existing.documentName || ''
        };
      });
    } else {
      container.actual.qualityReports = [];
    }

    container.status = 'GRN';
    await container.save();

    // Advance shipment stage to Quality
    const shipmentForQuality = await Shipment.findById(container.shipmentId);
    if (shipmentForQuality) {
      advanceShipmentStage(shipmentForQuality, 'Quality');
      await shipmentForQuality.save();
      fireAndForgetWorkflowEmail({
        role: WORKFLOW_NOTIFICATION_ROLE_MAP.quality,
        shipment: shipmentForQuality,
        container,
        sectionLabel: 'Quality',
        actor: req.user,
      });
    }

    res.status(200).json({ message: 'Quality details updated successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updatePaymentCostingDetails = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });
    const beforeUpdate = cloneForAudit(container.toObject());

    const files = normalizeUploadedFiles(req.files);
    const { paymentAllocations, paymentCostings, packagingExpenses } = req.body;
    const parsedAllocations = parseJsonField(paymentAllocations);
    const parsedCostings = parseJsonField(paymentCostings);
    const parsedPackagingExpenses = parseJsonField(packagingExpenses);
    const overallDoc = files?.paymentCostingDocument?.[0];
    const isPaymentAllocationSave = Array.isArray(parsedAllocations);
    const isPaymentCostingSave =
      Array.isArray(parsedCostings) ||
      Array.isArray(parsedPackagingExpenses) ||
      !!overallDoc;

    const uploadedByField = {};
    for (const [field, list] of Object.entries(files)) {
      const file = Array.isArray(list) ? list[0] : null;
      if (!file) continue;
      const uploaded = await uploadBufferToS3(file, `shipments/payment-costing/${field}`);
      uploadedByField[field] = uploaded;
    }

    if (Array.isArray(parsedAllocations)) {
      container.actual.paymentAllocations = parsedAllocations.map((row, index) => {
        const attachmentUpload = uploadedByField[`paymentAllocations_${index}_attachment`];
        const existing = container.actual?.paymentAllocations?.[index] || {};
        return {
          sn: Number(row.sn) || index + 1,
          description: row.description || '',
          visibleTo: normalizeVisibleTo(row.visibleTo),
          requestAmount: Number(row.requestAmount) || 0,
          paidAmount: Number(row.paidAmount) || 0,
          paymentTo: row.paymentTo || '',
          paymentTerm: row.paymentTerm || '',
          reference: row.reference || '',
          attachmentDocumentUrl: attachmentUpload?.url || row.attachmentDocumentUrl || existing.attachmentDocumentUrl || '',
          attachmentDocumentName: attachmentUpload?.fileName || row.attachmentDocumentName || existing.attachmentDocumentName || '',
        };
      });
    }

    if (Array.isArray(parsedCostings)) {
      container.actual.paymentCostings = parsedCostings.map((row, index) => {
        const refUpload = uploadedByField[`paymentCostings_${index}_refBill`];
        const existing = container.actual?.paymentCostings?.[index] || {};
        return {
          sn: Number(row.sn) || index + 1,
          description: row.description || '',
          visibleTo: normalizeVisibleTo(row.visibleTo),
          requestAmount: Number(row.requestAmount) || 0,
          paidAmount: Number(row.paidAmount) || 0,
          // POINT 7: actualPaid removed — difference is paidAmount - requestAmount
          refBillNo: row.refBillNo || '',
          refBillDate: toDateOrNull(row.refBillDate),
          refBillVendor: row.refBillVendor || '',
          refBillDocumentUrl: refUpload?.url || row.refBillDocumentUrl || existing.refBillDocumentUrl || '',
          refBillDocumentName: refUpload?.fileName || row.refBillDocumentName || existing.refBillDocumentName || ''
        };
      });
    }

    if (Array.isArray(parsedPackagingExpenses)) {
      container.actual.packagingExpenses = parsedPackagingExpenses.map((row, index) => ({
        sn: Number(row.sn) || index + 1,
        item: row.item || '',
        packing: row.packing || '',
        qty: Number(row.qty) || 0,
        uom: row.uom || '',
        unitCostFC: Number(row.unitCostFC) || 0,
        unitCostDH: Number(row.unitCostDH) || 0,
        totalCostFC: Number(row.totalCostFC) || 0,
        totalCostDH: Number(row.totalCostDH) || 0,
        expenseAllocationFactor: Number(row.expenseAllocationFactor) || 0,
        expensesAllocated: Number(row.expensesAllocated) || 0,
        totalValueWithExpenses: Number(row.totalValueWithExpenses) || 0,
        landedCostPerUnit: Number(row.landedCostPerUnit) || 0,
        reference: row.reference || '',
      }));
    }

    if (overallDoc) {
      const uploaded = await uploadBufferToS3(overallDoc, 'shipments/payment-costing/overall');
      container.actual.paymentCostingDocumentUrl = uploaded.url;
      container.actual.paymentCostingDocumentName = uploaded.fileName;
    }

    if (isPaymentAllocationSave) {
      container.actual.paymentAllocationApproval = buildPaymentAllocationPendingApproval(req.user);
    }

    if (isPaymentCostingSave) {
      container.actual.paymentCostingApproval = buildPaymentCostingPendingApproval(req.user);
    }

    await container.save();

    if (isPaymentAllocationSave) {
      await syncSameBlActualFields({
        ContainerModel: Container,
        sourceContainer: container,
        fields: SAME_BL_PAYMENT_ALLOCATION_FIELDS,
      });
    }

    // Advance shipment stage to Payment Costing
    const shipmentForPayment = await Shipment.findById(container.shipmentId);
    if (shipmentForPayment) {
      advanceShipmentStage(shipmentForPayment, 'Payment Costing');
      await shipmentForPayment.save();
      if (isPaymentAllocationSave) {
        notifyPaymentAllocationRolesByEmail({
          roles: ['FasManager'],
          shipment: shipmentForPayment,
          container,
          actor: req.user,
        }).catch((error) => {
          console.error(`Payment allocation notification warning for ${shipmentForPayment.shipmentNo || shipmentForPayment._id}:`, error.message);
        });
      }
      if (isPaymentCostingSave) {
        notifyPaymentCostingRolesByEmail({
          roles: ['FasManager'],
          shipment: shipmentForPayment,
          container,
          actor: req.user,
          approvalStage: 'Pending FAS Manager Approval',
        }).catch((error) => {
          console.error(`Payment costing notification warning for ${shipmentForPayment.shipmentNo || shipmentForPayment._id}:`, error.message);
        });
      }
    }

    if (isPaymentCostingSave) {
      await writeAuditLog({
        userId: req.user._id,
        module: 'FAS',
        entity: 'Container',
        entityId: container._id,
        action: 'SubmitPaymentCosting',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: 'Payment costing submitted for FAS manager approval'
      });
    }

    if (isPaymentAllocationSave) {
      await writeAuditLog({
        userId: req.user._id,
        module: 'FAS',
        entity: 'Container',
        entityId: container._id,
        action: 'SubmitPaymentAllocation',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: 'Payment allocation submitted for FAS manager approval'
      });
    }

    res.status(200).json({ message: 'Payment costing updated successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.approveClearingAdvance = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const currentState = container.actual.clearingAdvanceApproval || { status: CLEARING_ADVANCE_APPROVAL_STATUSES.draft };
    const effectiveStatus =
      currentState.status === CLEARING_ADVANCE_APPROVAL_STATUSES.draft && hasSavedClearingAdvanceData(container)
        ? CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas
        : currentState.status === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFasManager
          ? CLEARING_ADVANCE_APPROVAL_STATUSES.approved
        : currentState.status;
    const shipment = await Shipment.findById(container.shipmentId);

    if (effectiveStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas) {
      const allowed = await hasRoleOrPermission(
        req.user,
        'shipment.tab.bl_details.clearing_advance.approve_fas',
        ['FAS', 'FasManager', 'Admin', 'Manager', 'Management']
      );
      if (!allowed) {
        return res.status(403).json({ message: 'You do not have permission to approve clearing advance as FAS.' });
      }

      container.actual.clearingAdvanceApproval = {
        ...currentState,
        status: CLEARING_ADVANCE_APPROVAL_STATUSES.approved,
        submittedAt: currentState.submittedAt || new Date(),
        submittedBy: currentState.submittedBy || null,
        fasApprovedAt: new Date(),
        fasApprovedBy: req.user._id,
        fasManagerApprovedAt: currentState.fasManagerApprovedAt || null,
        fasManagerApprovedBy: currentState.fasManagerApprovedBy || null,
      };
      await container.save();

      await syncSameBlActualFields({
        ContainerModel: Container,
        sourceContainer: container,
        fields: ['clearingAdvanceApproval'],
      });

      if (shipment) {
        notifyClearingAdvanceRolesByEmail({
          roles: ['Logistic', 'FAS', 'warehouse'],
          shipment,
          container,
          actor: req.user,
          approvalStage: 'Approved',
        }).catch((error) => {
          console.error(`Clearing advance notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
        });
      }

      await writeAuditLog({
        userId: req.user._id,
        module: 'FAS',
        entity: 'Container',
        entityId: container._id,
        action: 'ApproveClearingAdvanceFAS',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: 'Clearing advance approved by FAS'
      });

      return res.json({ message: 'Clearing advance approved by FAS successfully', container });
    }

    if (effectiveStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.approved) {
      return res.status(400).json({ message: 'Clearing advance is already approved.' });
    }

    return res.status(400).json({ message: 'Clearing advance must be saved before it can be approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.submitAdditionalClearingAdvanceRequest = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const currentState = container.actual.clearingAdvanceApproval || { status: CLEARING_ADVANCE_APPROVAL_STATUSES.draft };
    if (currentState.status !== CLEARING_ADVANCE_APPROVAL_STATUSES.approved) {
      return res.status(400).json({ message: 'Additional requests can be submitted only after clearing advance is approved.' });
    }

    const title = String(req.body?.title || '').trim();
    const comment = String(req.body?.comment || req.body?.details || '').trim();
    const requestAmount = Number(req.body?.requestAmount) || 0;
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    if (requestAmount <= 0) return res.status(400).json({ message: 'Request amount must be greater than zero.' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const files = normalizeUploadedFiles(req.files || {});
    const attachment =
      files?.attachment?.[0] ||
      files?.additionalRequestAttachment?.[0] ||
      files?.document?.[0] ||
      null;
    let uploaded = null;
    if (attachment) {
      uploaded = await uploadBufferToS3(attachment, 'shipments/bl/additional-clearing-advance');
    }

    container.actual.additionalClearingAdvanceRequests.push({
      title,
      comment,
      requestAmount,
      attachmentDocumentUrl: uploaded?.url || '',
      attachmentDocumentName: uploaded?.fileName || '',
      status: CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas,
      submittedAt: new Date(),
      submittedBy: req.user?._id || null,
      fasApprovedAt: null,
      fasApprovedBy: null,
    });

    await container.save();
    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['additionalClearingAdvanceRequests'],
    });

    const shipment = await Shipment.findById(container.shipmentId);
    if (shipment) {
      notifyClearingAdvanceRolesByEmail({
        roles: ['FAS'],
        shipment,
        container,
        actor: req.user,
        approvalStage: 'Additional Request Pending FAS Approval',
      }).catch((error) => {
        console.error(`Additional clearing advance notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'Logistics',
      entity: 'Container',
      entityId: container._id,
      action: 'SubmitAdditionalClearingAdvanceRequest',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Additional clearing advance request submitted for FAS approval',
    });

    return res.status(201).json({ message: 'Additional request submitted successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.approveAdditionalClearingAdvanceRequest = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const requestRow = container.actual.additionalClearingAdvanceRequests.id(req.params.requestId);
    if (!requestRow) return res.status(404).json({ message: 'Additional request not found.' });
    if (requestRow.status === CLEARING_ADVANCE_APPROVAL_STATUSES.approved) {
      return res.status(400).json({ message: 'Additional request is already approved.' });
    }

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.bl_details.clearing_advance.approve_fas',
      ['FAS', 'FasManager', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve additional clearing advance requests.' });
    }

    const beforeUpdate = cloneForAudit(container.toObject());
    requestRow.status = CLEARING_ADVANCE_APPROVAL_STATUSES.approved;
    requestRow.fasApprovedAt = new Date();
    requestRow.fasApprovedBy = req.user?._id || null;

    await container.save();
    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['additionalClearingAdvanceRequests'],
    });

    const shipment = await Shipment.findById(container.shipmentId);
    if (shipment) {
      notifyClearingAdvanceRolesByEmail({
        roles: ['Logistic'],
        shipment,
        container,
        actor: req.user,
        approvalStage: 'Additional Request Approved',
      }).catch((error) => {
        console.error(`Additional clearing advance approval notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'Container',
      entityId: container._id,
      action: 'ApproveAdditionalClearingAdvanceRequest',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Additional clearing advance request approved by FAS',
    });

    return res.json({ message: 'Additional request approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.approvePaymentAllocation = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const currentState = container.actual.paymentAllocationApproval || { status: PAYMENT_COSTING_APPROVAL_STATUSES.draft };
    const effectiveStatus =
      currentState.status === PAYMENT_COSTING_APPROVAL_STATUSES.draft && hasSavedPaymentAllocationData(container)
        ? PAYMENT_COSTING_APPROVAL_STATUSES.pendingFasManager
        : currentState.status;

    if (effectiveStatus !== PAYMENT_COSTING_APPROVAL_STATUSES.pendingFasManager) {
      if (effectiveStatus === PAYMENT_COSTING_APPROVAL_STATUSES.approved) {
        return res.status(400).json({ message: 'Payment allocation is already approved.' });
      }
      return res.status(400).json({ message: 'Payment allocation must be saved before it can be approved.' });
    }

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.payment_costing.payment_allocation.approve_fas_manager',
      ['FasManager', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve payment allocation.' });
    }

    container.actual.paymentAllocationApproval = {
      ...currentState,
      status: PAYMENT_COSTING_APPROVAL_STATUSES.approved,
      submittedAt: currentState.submittedAt || new Date(),
      submittedBy: currentState.submittedBy || null,
      fasManagerApprovedAt: new Date(),
      fasManagerApprovedBy: req.user._id,
    };
    await container.save();

    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['paymentAllocationApproval'],
    });

    const shipment = await Shipment.findById(container.shipmentId);
    if (shipment) {
      notifyPaymentAllocationRolesByEmail({
        roles: ['FAS', 'Logistic'],
        shipment,
        container,
        actor: req.user,
      }).catch((error) => {
        console.error(`Payment allocation approval notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'Container',
      entityId: container._id,
      action: 'ApprovePaymentAllocationFasManager',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Payment allocation approved by FAS manager'
    });

    return res.json({ message: 'Payment allocation approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.approvePaymentCosting = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const currentState = container.actual.paymentCostingApproval || { status: PAYMENT_COSTING_APPROVAL_STATUSES.draft };
    const effectiveStatus =
      currentState.status === PAYMENT_COSTING_APPROVAL_STATUSES.draft && hasSavedPaymentCostingData(container)
        ? PAYMENT_COSTING_APPROVAL_STATUSES.pendingFasManager
        : currentState.status;

    if (effectiveStatus !== PAYMENT_COSTING_APPROVAL_STATUSES.pendingFasManager) {
      if (effectiveStatus === PAYMENT_COSTING_APPROVAL_STATUSES.approved) {
        return res.status(400).json({ message: 'Payment costing is already approved.' });
      }
      return res.status(400).json({ message: 'Payment costing must be saved before it can be approved.' });
    }

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.payment_costing.costing_table.approve_fas_manager',
      ['FasManager', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve payment costing.' });
    }

    container.actual.paymentCostingApproval = {
      ...currentState,
      status: PAYMENT_COSTING_APPROVAL_STATUSES.approved,
      submittedAt: currentState.submittedAt || new Date(),
      submittedBy: currentState.submittedBy || null,
      fasManagerApprovedAt: new Date(),
      fasManagerApprovedBy: req.user._id,
    };
    await container.save();

    const shipment = await Shipment.findById(container.shipmentId);
    if (shipment) {
      notifyPaymentCostingRolesByEmail({
        roles: ['FAS'],
        shipment,
        container,
        actor: req.user,
        approvalStage: 'Approved',
      }).catch((error) => {
        console.error(`Payment costing approval notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'Container',
      entityId: container._id,
      action: 'ApprovePaymentCostingFasManager',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Payment costing approved by FAS manager'
    });

    return res.json({ message: 'Payment costing approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.approveStorageAllocations = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const currentState = container.actual.storageAllocationApproval || { status: STORAGE_ALLOCATION_APPROVAL_STATUSES.draft };
    const effectiveStatus =
      currentState.status === STORAGE_ALLOCATION_APPROVAL_STATUSES.draft && hasSavedStorageAllocationData(container)
        ? STORAGE_ALLOCATION_APPROVAL_STATUSES.pendingWarehouseManager
        : currentState.status;

    if (effectiveStatus !== STORAGE_ALLOCATION_APPROVAL_STATUSES.pendingWarehouseManager) {
      if (effectiveStatus === STORAGE_ALLOCATION_APPROVAL_STATUSES.approved) {
        return res.status(400).json({ message: 'Storage allocations are already approved.' });
      }
      return res.status(400).json({ message: 'Storage allocations must be saved before they can be approved.' });
    }

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.bl_details.storage_allocations.approve_warehouse_manager',
      ['warehouse', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve storage allocations.' });
    }

    container.actual.storageAllocationApproval = {
      ...currentState,
      status: STORAGE_ALLOCATION_APPROVAL_STATUSES.approved,
      submittedAt: currentState.submittedAt || new Date(),
      submittedBy: currentState.submittedBy || null,
      warehouseManagerApprovedAt: new Date(),
      warehouseManagerApprovedBy: req.user._id,
    };
    await container.save();

    const shipment = await Shipment.findById(container.shipmentId);
    if (shipment) {
      notifyStorageAllocationRolesByEmail({
        roles: ['storekeeper'],
        shipment,
        container,
        actor: req.user,
        approvalStage: 'Approved',
      }).catch((error) => {
        console.error(`Storage allocation approval notification warning for ${shipment.shipmentNo || shipment._id}:`, error.message);
      });
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'Warehouse',
      entity: 'Container',
      entityId: container._id,
      action: 'ApproveStorageAllocationsWarehouseManager',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Storage allocations approved by warehouse manager'
    });

    return res.json({ message: 'Storage allocations approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.approveStorageArrival = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const beforeUpdate = cloneForAudit(container.toObject());
    const currentState = container.actual.storageArrivalApproval || { status: STORAGE_ARRIVAL_APPROVAL_STATUSES.draft };
    const effectiveStatus =
      currentState.status === STORAGE_ARRIVAL_APPROVAL_STATUSES.draft && hasSavedStorageArrivalData(container)
        ? STORAGE_ARRIVAL_APPROVAL_STATUSES.pendingWarehouseManager
        : currentState.status;

    if (effectiveStatus !== STORAGE_ARRIVAL_APPROVAL_STATUSES.pendingWarehouseManager) {
      if (effectiveStatus === STORAGE_ARRIVAL_APPROVAL_STATUSES.approved) {
        return res.status(400).json({ message: 'Storage arrival is already approved.' });
      }
      return res.status(400).json({ message: 'Storage arrival must be saved before it can be approved.' });
    }

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.storage.storage_arrival.approve_warehouse_manager',
      ['warehouse', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve storage arrival.' });
    }

    container.actual.storageArrivalApproval = {
      ...currentState,
      status: STORAGE_ARRIVAL_APPROVAL_STATUSES.approved,
      submittedAt: currentState.submittedAt || new Date(),
      submittedBy: currentState.submittedBy || null,
      warehouseManagerApprovedAt: new Date(),
      warehouseManagerApprovedBy: req.user._id,
    };
    await container.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Warehouse',
      entity: 'Container',
      entityId: container._id,
      action: 'ApproveStorageArrivalWarehouseManager',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Storage arrival approved by warehouse manager'
    });

    return res.json({ message: 'Storage arrival approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getBlRowDefinitions = async (_req, res) => {
  try {
    const rows = await ensureBlRowDefinitionsSeeded();
    return res.status(200).json({
      rows: rows.map((row) => ({
        key: row.key || slugifyKey(row.description),
        sn: Number(row.sn) || 0,
        description: row.description,
        visibleTo: normalizeVisibleTo(row.visibleTo),
        defaultQty: normalizeNumericDefault(row.defaultQty, 1),
        defaultRate: normalizeNumericDefault(row.defaultRate, 0),
        isActive: row.isActive !== false,
      })),
    });
  } catch (error) {
    console.error('Error loading BL row definitions:', error);
    return res.status(500).json({ message: 'Unable to load BL row definitions' });
  }
};

const buildShipmentListQuery = ({ search = '', status = '', shipmentIds = null, commercialInvoiceShipmentIds = null }) => {
  const query = {};
  const normalizedSearch = String(search || '').trim();
  const normalizedStatus = String(status || '').trim();

  if (Array.isArray(shipmentIds)) {
    query._id = { $in: shipmentIds };
  }

  if (normalizedSearch) {
    query.$or = [
      { shipmentNo: { $regex: normalizedSearch, $options: 'i' } },
      { orderNumber: { $regex: normalizedSearch, $options: 'i' } },
      { piNo: { $regex: normalizedSearch, $options: 'i' } },
      { fpoNo: { $regex: normalizedSearch, $options: 'i' } },
      { supplierName: { $regex: normalizedSearch, $options: 'i' } },
      { itemDescription: { $regex: normalizedSearch, $options: 'i' } },
      { brandName: { $regex: normalizedSearch, $options: 'i' } },
    ];

    if (Array.isArray(commercialInvoiceShipmentIds) && commercialInvoiceShipmentIds.length) {
      query.$or.push({ _id: { $in: commercialInvoiceShipmentIds } });
    }
  }

  if (normalizedStatus) {
    query.currentStage = normalizedStatus;
  }

  return query;
};

const getCommercialInvoiceShipmentIds = async (search = '') => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) return [];

  const containers = await Container.find({
    'actual.commercialInvoiceNo': { $regex: normalizedSearch, $options: 'i' },
  })
    .select('shipmentId')
    .lean();

  return [
    ...new Set(
      containers
        .map((container) => String(container.shipmentId || ''))
        .filter(Boolean)
    ),
  ];
};

const getActualWorkflowShipmentIds = async () => {
  const containers = await Container.find({ actual: { $exists: true, $ne: null } })
    .select('shipmentId actual')
    .lean();

  return [
    ...new Set(
      containers
        .filter((container) => hasMeaningfulActualData(container))
        .map((container) => String(container.shipmentId))
        .filter(Boolean)
    ),
  ];
};

const shouldRestrictShipmentListForPendingBlRoles = (user) =>
  normalizeRole(user?.role || '') === 'Logistic';

const fetchShipmentList = async ({ page = 1, limit = 20, search = '', status = '', user = null }) => {
  const actualWorkflowShipmentIds = shouldRestrictShipmentListForPendingBlRoles(user)
    ? await getActualWorkflowShipmentIds()
    : null;
  const commercialInvoiceShipmentIds = await getCommercialInvoiceShipmentIds(search);
  const query = buildShipmentListQuery({
    search,
    status,
    shipmentIds: actualWorkflowShipmentIds,
    commercialInvoiceShipmentIds,
  });
  const total = await Shipment.countDocuments(query);

  const shipments = await Shipment.find(query)
    .populate("supplierId", "name")
    .populate("itemId", "description")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ orderDate: -1, createdAt: -1 });

  const shipmentIds = shipments.map((shipment) => shipment._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } }).lean();
  const containerMap = new Map();
  containers.forEach((container) => {
    const key = String(container.shipmentId);
    if (!containerMap.has(key)) {
      containerMap.set(key, []);
    }
    containerMap.get(key).push(container);
  });

  const formatted = shipments.map(s => ({
    _id: s._id,
    year: s.year,
    shipmentNo: s.shipmentNo,
    orderNumber: s.orderNumber,
    orderDate: s.orderDate,
    supplier: s.supplierId?.name || s.supplierName || null,
    description: s.itemId?.description || s.itemDescription || null,
    buyingQty: s.plannedQtyMT || s.totalOrderedQtyMT || 0,
    fcPerUnit: s.fcPerUnit || 0,
    totalFC: s.totalFC || 0,
    noOfShipments: s.noOfShipments || s.assumedContainerCount || 0,
    status: getShipmentReportStatus(s, containerMap.get(String(s._id)) || [])
  }));

  return {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
    shipments: formatted
  };
};

exports.getAllShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', status = '' } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const result = await fetchShipmentList({ page, limit, search, status, user: req.user });
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, q = '', status = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const result = await fetchShipmentList({ page, limit, search: q, status, user: req.user });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getShipmentReportExportData = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);

    return res.status(200).json({
      rows,
      totalRecords: rows.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to prepare shipment export data' });
  }
};

exports.downloadShipmentReportExcel = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const title = 'Royal Horizon Group';
    const subtitle = 'Shipment Master Report';
    const totalColumns = Math.max(parentColumns.length, childColumns.length + 1);
    const childExcelStartCol = 2;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shipment Report', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    const borderDark = { style: 'thin', color: { argb: 'FF0F172A' } };
    const borderSlate = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const borderLight = { style: 'thin', color: { argb: 'FFCBD5E1' } };
    const fullDarkBorder = { top: borderDark, bottom: borderDark, left: borderDark, right: borderDark };
    const fullSlateBorder = { top: borderSlate, bottom: borderSlate, left: borderSlate, right: borderSlate };
    const fullLightBorder = { top: borderLight, bottom: borderLight, left: borderLight, right: borderLight };

    const defaultCellStyle = {
      font: { name: 'Calibri', size: 11 },
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: fullDarkBorder,
    };
    const headerCellStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } },
      alignment: { vertical: 'middle', horizontal: 'left' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
      border: fullDarkBorder,
    };
    const childHeaderStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
      border: fullSlateBorder,
    };
    const childHeaderHighlightStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF78350F' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } },
      border: fullSlateBorder,
    };
    const childCellStyle = {
      font: { name: 'Calibri', size: 11 },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } },
      border: fullLightBorder,
    };
    const childHighlightCellStyle = {
      font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1F2937' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
      border: fullLightBorder,
    };

    worksheet.columns = Array.from({ length: totalColumns }, (_, index) => {
      const column = parentColumns[index] || childColumns[index - 1] || { key: `extra_${index}`, width: 14 };
      return {
        key: column.key,
        width: Math.max(column.width, 12),
      };
    });

    worksheet.addRow([title]);
    worksheet.addRow([subtitle]);
    const metaRow = worksheet.addRow([
      `Downloaded By: ${downloadedBy}`,
      ...Array.from({ length: totalColumns - 2 }, () => ''),
      `Downloaded At: ${downloadedAt}`,
    ]);
    const headerRow = worksheet.addRow([
      ...parentColumns.map((column) => column.header),
      ...Array.from({ length: totalColumns - parentColumns.length }, () => ''),
    ]);

    const titleRowNumber = 1;
    const subtitleRowNumber = 2;
    worksheet.mergeCells(titleRowNumber, 1, titleRowNumber, totalColumns);
    worksheet.mergeCells(subtitleRowNumber, 1, subtitleRowNumber, totalColumns);

    worksheet.getRow(titleRowNumber).height = 20;
    worksheet.getRow(subtitleRowNumber).height = 18;
    metaRow.height = 18;
    headerRow.height = 22;

    worksheet.getCell(titleRowNumber, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(subtitleRowNumber, 1).font = { name: 'Calibri', size: 12, bold: true };
    worksheet.getCell(titleRowNumber, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell(subtitleRowNumber, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell(titleRowNumber, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    worksheet.getCell(subtitleRowNumber, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    headerRow.eachCell((cell) => {
      cell.font = headerCellStyle.font;
      cell.alignment = headerCellStyle.alignment;
      cell.fill = headerCellStyle.fill;
      cell.border = headerCellStyle.border;
    });

    const childHighlightColumns = [childExcelStartCol, childExcelStartCol + 1];

    flattenedRows.forEach((row) => {
      const excelRow = worksheet.addRow(row.values);

      if (row?.rowType === 'spacer') {
        excelRow.height = 12;
        return;
      }

      if (row?.rowType === 'childHeader') {
        excelRow.height = 21;
      } else if (row?.rowType === 'child') {
        excelRow.height = 20;
      } else {
        excelRow.height = 18;
      }

      excelRow.eachCell((cell, colNumber) => {
        if (row?.rowType === 'childHeader') {
          if (colNumber < childExcelStartCol || colNumber >= childExcelStartCol + childColumns.length) {
            return;
          }
          const style = childHighlightColumns.includes(colNumber)
            ? childHeaderHighlightStyle
            : childHeaderStyle;
          cell.font = style.font;
          cell.alignment = style.alignment;
          cell.fill = style.fill;
          cell.border = style.border;
          return;
        }

        if (row?.rowType === 'child') {
          if (colNumber < childExcelStartCol || colNumber >= childExcelStartCol + childColumns.length) {
            return;
          }
          const style = childHighlightColumns.includes(colNumber)
            ? childHighlightCellStyle
            : childCellStyle;
          cell.font = style.font;
          cell.alignment = style.alignment;
          cell.fill = style.fill;
          cell.border = style.border;
          return;
        }

        cell.font = defaultCellStyle.font;
        cell.alignment = defaultCellStyle.alignment;
        cell.border = defaultCellStyle.border;
      });
    });

    worksheet.addRow([]);
    const footerRow = worksheet.addRow(['Printed from Royal Horizon Systems']);
    worksheet.mergeCells(footerRow.number, 1, footerRow.number, totalColumns);
    footerRow.height = 18;
    worksheet.getCell(footerRow.number, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF64748B' } };
    worksheet.getCell(footerRow.number, 1).alignment = { horizontal: 'left', vertical: 'middle' };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `royal-horizon-shipment-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to generate Excel report' });
  }
};

exports.downloadShipmentReportPdf = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const filename = `royal-horizon-shipment-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A3',
      layout: 'landscape',
      margin: 34,
      bufferPages: true,
    });

    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const startX = 34;
    const usableWidth = pageWidth - startX * 2;
    const tableTop = 120;
    const minRowHeight = 24;
    const footerY = pageHeight - 24;
    const exportColumnCount = Math.max(parentColumns.length, childColumns.length + 1);
    const pdfColumns = Array.from({ length: exportColumnCount }, (_, index) =>
      parentColumns[index] || childColumns[index - 1] || { header: '', key: `extra_${index}`, width: 12 }
    );
    const getCellText = (row, index) => String(row?.values?.[index] ?? '');
    const baseWeightedWidths = (() => {
      const totalWeight = pdfColumns.reduce((sum, column) => sum + column.width, 0);
      return pdfColumns.map((column) => (column.width / totalWeight) * usableWidth);
    })();

    const computeContentAwareColumnWidths = () => {
      doc.font('Helvetica').fontSize(7.5);

      const desiredWidths = pdfColumns.map((column, index) => {
        const baseWidth = baseWeightedWidths[index];
        const minWidth = Math.max(Math.min(baseWidth * 0.72, 46), 28);
        const maxWidth = column.key === 'itemDescription'
          ? Math.max(baseWidth * 1.8, 120)
          : column.key === 'shipmentNo'
            ? Math.max(baseWidth * 1.6, 90)
            : ['supplier', 'portOfLoading', 'portOfDischarge', 'paymentTerms', 'shipmentStatus'].includes(column.key)
              ? Math.max(baseWidth * 1.45, 72)
              : Math.max(baseWidth * 1.3, 64);

        const longestWidth = flattenedRows.reduce((max, row) => {
          const value = getCellText(row, index);
          if (!value) return max;
          return Math.max(max, doc.widthOfString(value));
        }, doc.widthOfString(column.header));

        return Math.min(Math.max(longestWidth + 14, minWidth), maxWidth);
      });

      const totalDesiredWidth = desiredWidths.reduce((sum, width) => sum + width, 0);
      if (totalDesiredWidth <= usableWidth) {
        const extra = usableWidth - totalDesiredWidth;
        const weights = pdfColumns.map((column) =>
          ['shipmentNo', 'supplier', 'itemDescription', 'portOfLoading', 'portOfDischarge', 'paymentTerms', 'shipmentStatus'].includes(column.key) ? 2 : 1
        );
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
        return desiredWidths.map((width, index) => width + ((extra * weights[index]) / weightTotal));
      }

      const minimums = desiredWidths.map((width, index) => Math.max(Math.min(baseWeightedWidths[index] * 0.6, width), 26));
      const reducible = desiredWidths.reduce((sum, width, index) => sum + Math.max(width - minimums[index], 0), 0);
      if (reducible <= 0) {
        return baseWeightedWidths;
      }

      const overflow = totalDesiredWidth - usableWidth;
      return desiredWidths.map((width, index) => {
        const availableReduction = Math.max(width - minimums[index], 0);
        const reduction = (overflow * availableReduction) / reducible;
        return width - reduction;
      });
    };

    const columnWidths = computeContentAwareColumnWidths();

    const computeHeaderHeight = () => {
      doc.font('Helvetica-Bold').fontSize(8);
      return Math.max(
        minRowHeight,
        ...pdfColumns.map((column, index) =>
          doc.heightOfString(column.header, {
            width: Math.max(columnWidths[index] - 8, 10),
            align: 'left',
          }) + 10
        )
      );
    };

    const headerHeight = computeHeaderHeight();

    const computeRowHeight = (row) => {
      if (row.rowType === 'spacer') return 14;
      doc.font('Helvetica').fontSize(7.5);
      return Math.max(
        minRowHeight,
        ...pdfColumns.map((column, index) =>
          doc.heightOfString(getCellText(row, index), {
            width: Math.max(columnWidths[index] - 8, 10),
            align: 'left',
          }) + 10
        )
      );
    };

    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(24).text('Royal Horizon Group', startX, 26, { align: 'center', width: usableWidth });
      doc.font('Helvetica-Bold').fontSize(18).text('Shipment Master Report', startX, 56, { align: 'center', width: usableWidth });
      doc.font('Helvetica').fontSize(12).text(`Downloaded By: ${downloadedBy}`, startX, 92, { align: 'left', width: usableWidth / 2 });
      doc.font('Helvetica').fontSize(12).text(`Downloaded At: ${downloadedAt}`, startX, 92, { align: 'right', width: usableWidth });
    };

    const drawTableHeader = (y) => {
      let x = startX;
      doc.font('Helvetica-Bold').fontSize(8);
      pdfColumns.forEach((column, index) => {
        const width = columnWidths[index];
        doc.rect(x, y, width, headerHeight).fillAndStroke('#f1f5f9', '#0f172a');
        doc.fillColor('#0f172a').text(column.header, x + 4, y + 5, {
          width: width - 8,
          align: 'left',
        });
        x += width;
      });
      doc.fillColor('#0f172a');
    };

    const drawRow = (row, y, rowHeight) => {
      if (row.rowType === 'spacer') {
        return;
      }
      let x = startX;
      doc.font(row.rowType === 'childHeader' ? 'Helvetica-Bold' : 'Helvetica').fontSize(row.rowType === 'childHeader' ? 8 : 7.5);
      if (row.rowType === 'child') {
        doc.save();
        doc.rect(startX, y, usableWidth, rowHeight).fill('#f8fafc');
        doc.restore();
      } else if (row.rowType === 'childHeader') {
        doc.save();
        doc.rect(startX, y, usableWidth, rowHeight).fill('#e2e8f0');
        doc.restore();
      }
      pdfColumns.forEach((column, index) => {
        const width = columnWidths[index];
        const isChildHighlightColumn = row.rowType !== 'parent' && (index === 1 || index === 2);
        if (row.rowType === 'childHeader') {
          if (isChildHighlightColumn) {
            doc.save();
            doc.rect(x, y, width, rowHeight).fill('#fde68a');
            doc.restore();
          }
          doc.rect(x, y, width, rowHeight).stroke('#94a3b8');
        } else if (row.rowType === 'child') {
          if (isChildHighlightColumn) {
            doc.save();
            doc.rect(x, y, width, rowHeight).fill('#fef3c7');
            doc.restore();
          }
          doc.rect(x, y, width, rowHeight).stroke('#cbd5e1');
        } else {
          doc.rect(x, y, width, rowHeight).stroke('#0f172a');
        }
        const align = row.rowType === 'child' || row.rowType === 'childHeader'
          ? 'center'
          : 'left';
        doc.text(getCellText(row, index), x + 4, y + 5, {
          width: width - 8,
          align,
        });
        x += width;
      });
    };

    drawHeader();
    let currentY = tableTop;
    drawTableHeader(currentY);
    currentY += headerHeight;

    flattenedRows.forEach((row) => {
      const rowHeight = computeRowHeight(row);
      if (currentY + rowHeight > footerY - 18) {
        doc.addPage();
        drawHeader();
        currentY = tableTop;
        drawTableHeader(currentY);
        currentY += headerHeight;
      }
      drawRow(row, currentY, rowHeight);
      currentY += rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica-Oblique').fontSize(12).text('Printed from Royal Horizon Systems', startX, footerY, {
        align: 'center',
        width: usableWidth,
      });
      doc.font('Helvetica').fontSize(12).text(`Page ${i + 1} of ${range.count}`, startX, footerY, {
        align: 'right',
        width: usableWidth,
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Unable to generate PDF report' });
    }
  }
};

exports.getShipmentSummary = async (req, res) => {
  try {
    const shipments = await Shipment.find({})
      .populate('supplierId', 'name country')
      .populate('itemId', 'description itemCode')
      .sort({ orderDate: -1, createdAt: -1 })
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

    const normalizedRole = normalizeRole(req.user?.role || '');
    const logisticsPendingShipmentIds = new Set(
      containers
        .filter((container) => hasMeaningfulActualData(container))
        .map((container) => String(container.shipmentId))
        .filter(Boolean)
    );
    const logisticsPendingCount = logisticsPendingShipmentIds.size;
    const rolePending = {
      role: normalizedRole || 'Unknown',
      label: normalizedRole === 'Logistic' ? 'Logistics Documentation' : 'Pending For Your Role',
      count: normalizedRole === 'Logistic' ? logisticsPendingCount : 0,
    };

    const total = shipments.length;
    const completed = shipments.filter((s) => s.currentStage === 'GRN Completed').length;
    const inProgress = Math.max(total - completed, 0);
    const underClearance = shipments.filter((s) =>
      ['Under Clearance', 'Cleared', 'Released'].includes(s.currentStage)
    ).length;

    const stageMap = new Map();
    shipments.forEach((s) => {
      const stage = getComputedShipmentStatus(s, containerMap.get(String(s._id)) || []);
      stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
    });

    const stageBreakdown = Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count }));

    const monthMap = new Map();
    shipments.forEach((s) => {
      const date = s.orderDate ? new Date(s.orderDate) : new Date(s.createdAt);
      if (!date || Number.isNaN(date.getTime())) return;
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });

    const monthlyTrend = Array.from(monthMap.entries())
      .map(([key, count]) => {
        const [yearStr, monthStr] = key.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const label = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short' });
        return { label, month, year, count };
      })
      .sort((a, b) => (a.year - b.year) || (a.month - b.month))
      .slice(-6);

    const paymentSummary = shipments.reduce((acc, s) => {
      const totalAmount = Number(s?.payment?.totalAmount || 0);
      const paidAmount = Number(s?.payment?.paidAmount || 0);
      const balanceAmount = Number(s?.payment?.balanceAmount || Math.max(totalAmount - paidAmount, 0));
      const status = String(s?.payment?.paymentStatus || '').toLowerCase();

      acc.totalAmount += totalAmount;
      acc.paidAmount += paidAmount;
      acc.balanceAmount += balanceAmount;

      if (status === 'paid') acc.paidShipments += 1;
      else if (status === 'partially paid') acc.partiallyPaidShipments += 1;
      else acc.pendingShipments += 1;
      return acc;
    }, {
      totalAmount: 0,
      paidAmount: 0,
      balanceAmount: 0,
      pendingShipments: 0,
      partiallyPaidShipments: 0,
      paidShipments: 0
    });

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const totalContainers = shipments.reduce((sum, s) =>
      sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0
    );

    const arrivedContainers = shipments
      .filter((s) => ['Arrived', 'Cleared', 'Released', 'GRN Completed'].includes(s.currentStage))
      .reduce((sum, s) => sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0);

    const clearedContainers = shipments
      .filter((s) => ['Cleared', 'Released', 'GRN Completed'].includes(s.currentStage))
      .reduce((sum, s) => sum + Number(s.noOfShipments || s.assumedContainerCount || 1), 0);

    const dueThisWeekShipments = shipments.filter((s) => {
      if (!s.plannedETA) return false;
      const eta = new Date(s.plannedETA);
      return eta >= startOfToday && eta <= endOfWeek;
    }).length;

    const overdueShipments = shipments.filter((s) => {
      if (!s.plannedETA) return false;
      const eta = new Date(s.plannedETA);
      return eta < startOfToday && !['Cleared', 'Released', 'GRN Completed'].includes(s.currentStage);
    }).length;

    const etaScheduledShipments = shipments.filter((s) => !!s.plannedETA).length;

    const recentShipments = shipments.slice(0, 8).map((s) => ({
      _id: s._id,
      shipmentNo: s.shipmentNo,
      orderDate: s.orderDate || s.createdAt,
      plannedETA: s.plannedETA || null,
      status: getComputedShipmentStatus(s, containerMap.get(String(s._id)) || []),
      totalAmount: Number(s?.payment?.totalAmount || 0),
      supplier: s?.supplierId?.name || '',
      item: s?.itemId?.description || ''
    }));

    const regionFromCountry = (country) => {
      const c = String(country || '').toLowerCase();
      if (c.includes('uae') || c.includes('saudi') || c.includes('oman') || c.includes('qatar')) return 'NA';
      if (c.includes('india') || c.includes('pakistan') || c.includes('china') || c.includes('japan')) return 'Asia';
      if (c.includes('germany') || c.includes('france') || c.includes('italy') || c.includes('uk')) return 'EUR';
      return 'SA';
    };

    const perfRegions = ['NA', 'EUR', 'Asia', 'SA'];
    const perfMap = new Map(perfRegions.map((r) => [r, []]));
    shipments.forEach((s) => {
      const region = regionFromCountry(s?.supplierId?.country);
      perfMap.get(region).push(s);
    });

    const financialPerformance = perfRegions.map((label) => {
      const rows = perfMap.get(label) || [];
      const qtyAvg = rows.length
        ? rows.reduce((sum, r) => sum + Number(r.plannedQtyMT || 0), 0) / rows.length
        : 0;
      return {
        label,
        cashToCash: Math.round(Math.max(qtyAvg * 0.2, -10)),
        accountRec: Math.round(Math.max(qtyAvg * 0.15, 5)),
        inventoryDays: Math.round(Math.max(qtyAvg * 0.25, 8)),
        payableDays: Math.round(Math.max(qtyAvg * 0.3, 12))
      };
    });

    const inventoryMap = new Map();
    shipments.forEach((s) => {
      const key = String(s.itemId?._id || s.itemId?.itemCode || s._id);
      const existing = inventoryMap.get(key) || {
        category: 'Shipment',
        product: s?.itemId?.description || s.shipmentNo,
        sku: s?.itemId?.itemCode || String(s._id).slice(-6).toUpperCase(),
        inStock: 0
      };
      existing.inStock += Math.max(Math.round(Number(s.plannedQtyMT || 0)), 0);
      inventoryMap.set(key, existing);
    });

    const inventory = Array.from(inventoryMap.values()).slice(0, 6);

    const orders = recentShipments.map((s) => ({
      _id: s._id,
      customer: s.supplier || '-',
      orderStatus: s.status,
      orderDate: s.orderDate
    }));

    const monthlyKpis = monthlyTrend.slice(-5).map((entry, index, rows) => {
      const prev = rows[index - 1]?.count ?? entry.count ?? 1;
      const change = prev ? ((entry.count - prev) / prev) * 100 : 0;
      return {
        metric: `${entry.label} ${entry.year}`,
        thisMonth: entry.count,
        pastMonth: prev,
        change: Number(change.toFixed(1))
      };
    });

    const volumeToday = buildDashboardRStatusMetrics(shipments, containerMap);

    // Chart Data Generation
    const mapStageToStatus = (status) => {
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      if (status === 'On Transit') return 'On Transit';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'Shipment Entry' || status === REPORT_STATUS_ETD_UNCONFIRMED) return REPORT_STATUS_ETD_UNCONFIRMED;
      return String(status || REPORT_STATUS_ETD_UNCONFIRMED);
    };

    const mapStageToYearlyStatus = (status) => {
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'On Transit') return 'On Transit';
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      return String(status || REPORT_STATUS_ETD_UNCONFIRMED);
    };

    const qtyMappingMap = new Map();
    const valueMappingMap = new Map();
    const yearlyQtyMappingMap = new Map();
    const supplierAvgFcMap = new Map();
    const supplierYearlyQtyMap = new Map();

    shipments.forEach(s => {
      const itemDesc = s.itemId?.description || s.itemDescription || 'Unknown Item';
      const supplierName = s.supplierId?.name || s.supplierName || 'Unknown Supplier';
      const shipmentContainers = containerMap.get(String(s._id)) || [];
      const fc = Number(s.totalFC || 0);
      const fcPerUnit = Number(s.fcPerUnit || 0);
      const splitCount = getShipmentSplitCount(s, shipmentContainers);
      const dashboardChildren = shipmentContainers.length
        ? shipmentContainers.map((container) => ({
          status: getDashboardStatusColumn(s, container),
          qty: getDashboardChildQuantity(s, container, splitCount),
        }))
        : [{
          status: REPORT_STATUS_ETD_UNCONFIRMED,
          qty: Number(s.plannedQtyMT || s.totalOrderedQtyMT || 0),
        }];

      dashboardChildren.forEach(({ status: childStatus, qty }) => {
        const status = mapStageToStatus(childStatus);
        const yearlyStatus = mapStageToYearlyStatus(childStatus);
        const valueShare = Number(s.plannedQtyMT || 0) > 0 ? fc * (qty / Number(s.plannedQtyMT || 0)) : 0;

        // 1. Qty Mapping
        if (!qtyMappingMap.has(itemDesc)) qtyMappingMap.set(itemDesc, { rowLabel: itemDesc });
        qtyMappingMap.get(itemDesc)[status] = (qtyMappingMap.get(itemDesc)[status] || 0) + qty;

        // 2. Value Mapping
        if (!valueMappingMap.has(itemDesc)) valueMappingMap.set(itemDesc, { rowLabel: itemDesc });
        valueMappingMap.get(itemDesc)[status] = (valueMappingMap.get(itemDesc)[status] || 0) + valueShare;

        // 3. Yearly Qty Mapping
        if (!yearlyQtyMappingMap.has(itemDesc)) yearlyQtyMappingMap.set(itemDesc, { rowLabel: itemDesc });
        yearlyQtyMappingMap.get(itemDesc)[yearlyStatus] = (yearlyQtyMappingMap.get(itemDesc)[yearlyStatus] || 0) + qty;

        // 5. Supplier Yearly Qty
        if (!supplierYearlyQtyMap.has(supplierName)) supplierYearlyQtyMap.set(supplierName, { rowLabel: supplierName });
        supplierYearlyQtyMap.get(supplierName)[yearlyStatus] = (supplierYearlyQtyMap.get(supplierName)[yearlyStatus] || 0) + qty;
      });

      // 4. Supplier Avg FC
      if (!supplierAvgFcMap.has(itemDesc)) supplierAvgFcMap.set(itemDesc, { rowLabel: itemDesc });
      const supAvg = supplierAvgFcMap.get(itemDesc);
      if (!supAvg[`${supplierName}_sum`]) {
        supAvg[`${supplierName}_sum`] = 0;
        supAvg[`${supplierName}_count`] = 0;
      }
      supAvg[`${supplierName}_sum`] += fcPerUnit;
      supAvg[`${supplierName}_count`] += 1;
    });

    const formatSupplierAvgFc = Array.from(supplierAvgFcMap.values()).map(row => {
      const newRow = { rowLabel: row.rowLabel };
      Object.keys(row).forEach(k => {
        if (k.endsWith('_sum')) {
          const supplier = k.replace('_sum', '');
          newRow[supplier] = Number((row[`${supplier}_sum`] / row[`${supplier}_count`]).toFixed(2));
        }
      });
      return newRow;
    });
    const statusPivot = buildDashboardStatusPivot(shipments, containerMap, 'supplier');
    const statusPivotByItem = buildDashboardStatusPivot(shipments, containerMap, 'item');

    res.status(200).json({
      kpis: {
        totalShipments: total,
        completedShipments: completed,
        inProgressShipments: inProgress,
        underClearanceShipments: underClearance,
        totalPaymentExposure: paymentSummary.balanceAmount
      },
      stageBreakdown,
      monthlyTrend,
      arrivalSummary: {
        totalContainers,
        arrivedContainers,
        pendingArrivalContainers: Math.max(totalContainers - arrivedContainers, 0),
        clearedContainers,
        dueThisWeekShipments,
        overdueShipments,
        etaScheduledShipments
      },
      paymentSummary,
      rolePending,
      recentShipments,
      shippingStatus: {
        orders,
        volumeToday,
        inventory,
        financialPerformance,
        monthlyKpis
      },
      chartData: {
        qtyMapping: Array.from(qtyMappingMap.values()),
        valueMapping: Array.from(valueMappingMap.values()),
        yearlyQtyMapping: Array.from(yearlyQtyMappingMap.values()),
        supplierAvgFc: formatSupplierAvgFc,
        supplierYearlyQty: Array.from(supplierYearlyQtyMap.values())
      },
      statusPivot,
      statusPivotByItem
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.getShipmentById = async (req, res) => {
  try {

    // Fetch shipment info
    const shipment = await Shipment.findById(req.params.id)
      .populate("supplierId", "name")
      .populate("itemId", "description itemCode unit riceName packing");

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }
    const shipmentId = shipment._id;
    // Fetch all containers for this shipment
    const containers = await Container.find({ shipmentId })
      .sort({ createdAt: 1 })
      .populate('actual.clearingAdvanceApproval.submittedBy', 'name email role')
      .populate('actual.clearingAdvanceApproval.fasApprovedBy', 'name email role')
      .populate('actual.additionalClearingAdvanceRequests.submittedBy', 'name email role')
      .populate('actual.additionalClearingAdvanceRequests.fasApprovedBy', 'name email role')
      .populate('actual.paymentAllocationApproval.submittedBy', 'name email role')
      .populate('actual.paymentAllocationApproval.fasManagerApprovedBy', 'name email role')
      .populate('actual.paymentCostingApproval.submittedBy', 'name email role')
      .populate('actual.paymentCostingApproval.fasManagerApprovedBy', 'name email role');
    const containerIds = containers.map((container) => container._id);
    const scheduledHistoryLogs = await AuditLog
      .find({
        module: "Purchase",
        entity: "Shipment",
        entityId: shipmentId,
        action: { $in: ["ScheduledBaselineCreated", "ScheduledBaselineUpdated"] },
      })
      .sort({ createdAt: -1 })
      .populate("userId", "name email");
    const clearingAdvanceSubmissionLogs = await AuditLog
      .find({
        module: 'Logistics',
        entity: 'Container',
        entityId: { $in: containerIds },
        action: 'SubmitClearingAdvance',
      })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role')
      .lean();
    const clearingAdvanceSubmitterByContainer = new Map();
    clearingAdvanceSubmissionLogs.forEach((entry) => {
      const key = String(entry.entityId || '');
      if (!key || clearingAdvanceSubmitterByContainer.has(key)) return;
      const user = entry.userId || null;
      const name = user?.name || user?.email || '';
      const role = user?.role || '';
      clearingAdvanceSubmitterByContainer.set(key, {
        name,
        role,
        label: name ? `${name}${role ? ` (${role})` : ''}` : '',
        submittedAt: entry.createdAt || null,
      });
    });

    // Planned array
    const planned = containers.map(c => ({
      containerId: c._id,
      size: c.planned?.size,
      FCL: c.planned?.FCL,
      qtyMT: c.planned?.qtyMT,
      bags: c.planned?.bags,
      etd: c.planned?.etd,
      eta: c.planned?.eta,
      weekWiseShipment: c.planned?.weekWiseShipment,
      buyingUnit: c.planned?.buyingUnit,
      status: c.status,
      shipmentStatus: getComputedContainerShipmentStatus(shipment, c),
    }));

    // Actual array
    const actual = [];
    containers.forEach(c => {
      if (c.actual) {
        // ensure actual is always an array
        const actualArr = Array.isArray(c.actual) ? c.actual : [c.actual];
        actualArr.forEach(a => {
          const clearingAdvanceSubmittedBy = a.clearingAdvanceApproval?.submittedBy || null;
          const clearingAdvanceSubmittedByLabel = clearingAdvanceSubmittedBy?.name || clearingAdvanceSubmittedBy?.email || '';
          const clearingAdvanceSubmitter = clearingAdvanceSubmittedByLabel
            ? {
                name: clearingAdvanceSubmittedByLabel,
                role: clearingAdvanceSubmittedBy?.role || '',
                label: `${clearingAdvanceSubmittedByLabel}${clearingAdvanceSubmittedBy?.role ? ` (${clearingAdvanceSubmittedBy.role})` : ''}`,
                submittedAt: a.clearingAdvanceApproval?.submittedAt || null,
              }
            : clearingAdvanceSubmitterByContainer.get(String(c._id)) || null;

          const actualData = {
            containerId: c._id,
            logisticPreparedBy: clearingAdvanceSubmitter?.label || '',
            logisticPreparedByUser: clearingAdvanceSubmitter,
            shipmentStatus: getComputedContainerShipmentStatus(shipment, c),
            actualSerialNo: a.actualSerialNo,
            commercialInvoiceNo: a.commercialInvoiceNo,
            blDetailsRemarks: a.blDetailsRemarks,
            shipOnBoardDate: a.shipOnBoardDate,
            size: a.size,
            FCL: a.FCL,
            qtyMT: a.qtyMT,
            bags: a.bags,
            pallet: a.pallet,
            buyingUnit: a.buyingUnit,
            receivedOn: a.receivedOn,
            updatedETD: a.updatedETD,
            updatedETA: a.updatedETA,
            CLNo: a.CLNo,
            BLNo: a.BLNo,
            blFirstSavedAt: a.blFirstSavedAt,
            portOfLoading: a.portOfLoading,
            portOfDischarge: a.portOfDischarge,
            shipmentArrived: a.shipmentArrived || 'No',
            noOfContainers: a.noOfContainers,
            noOfBags: a.noOfBags,
            quantityByMt: a.quantityByMt,
            shippingLine: a.shippingLine,
            freeDetentionDays: a.freeDetentionDays,
            maximumDetentionDays: a.maximumDetentionDays,
            freightPrepared: a.freightPrepared,
            billExtractionData: a.billExtractionData || null,
            blDocumentUrl: a.blDocumentUrl,
            blDocumentName: a.blDocumentName,
            commercialInvoiceDocumentUrl: a.commercialInvoiceDocumentUrl,
            commercialInvoiceDocumentName: a.commercialInvoiceDocumentName,
            packagingList: a.packagingList || null,
            packagingListDocumentUrl: a.packagingListDocumentUrl,
            packagingListDocumentName: a.packagingListDocumentName,
            actualBags: a.actualBags,
            expiryDate: a.expiryDate,
            hsCode: a.hsCode,
            packagingDate: a.packagingDate,
            grossWeight: a.grossWeight,
            netWeight: a.netWeight,
            extractedContainers: a.extractedContainers || [],
            costSheetBookingDocumentUrl: a.costSheetBookingDocumentUrl,
            costSheetBookingDocumentName: a.costSheetBookingDocumentName,
            costSheetBookings: a.costSheetBookings || [],
            clearingAdvancePaymentDetails: a.clearingAdvancePaymentDetails || null,
            clearingAdvanceApproval: a.clearingAdvanceApproval || null,
            additionalClearingAdvanceRequests: a.additionalClearingAdvanceRequests || [],
            storageAllocations: a.storageAllocations || [],
            storageAllocationDecision: a.storageAllocationDecision || null,
            storageAllocationSplits: a.storageAllocationSplits || [],
            storageAllocationApproval: a.storageAllocationApproval || null,
            storageArrivalApproval: a.storageArrivalApproval || null,
            maximumRetentionDate: a.maximumRetentionDate,
            DHL: a.DHL,
            courierTrackNo: a.courierTrackNo,
            courierServiceProvider: a.courierServiceProvider,
            docArrivalNotes: a.docArrivalNotes,
            expectedDocDate: a.expectedDocDate,
            receiver: a.receiver,
            bankName: a.bankName,
            inwardCollectionAdviceDate: a.inwardCollectionAdviceDate,
            inwardCollectionAdviceReceivedAt: a.inwardCollectionAdviceReceivedAt,
            inwardCollectionAdviceSubmittedAt: a.inwardCollectionAdviceSubmittedAt,
            inwardCollectionAdviceDocumentUrl: a.inwardCollectionAdviceDocumentUrl,
            inwardCollectionAdviceDocumentName: a.inwardCollectionAdviceDocumentName,
            murabahaContractReleasedDate: a.murabahaContractReleasedDate,
            murabahaContractApprovedDate: a.murabahaContractApprovedDate,
            murabahaContractSubmittedDate: a.murabahaContractSubmittedDate,
            murabahaContractSubmittedDocumentUrl: a.murabahaContractSubmittedDocumentUrl,
            murabahaContractSubmittedDocumentName: a.murabahaContractSubmittedDocumentName,
            documentsReleasedDate: a.documentsReleasedDate,
            documentsReleasedDocumentUrl: a.documentsReleasedDocumentUrl,
            documentsReleasedDocumentName: a.documentsReleasedDocumentName,
            bankAdvanceAmountDocumentUrl: a.bankAdvanceAmountDocumentUrl,
            bankAdvanceApprovedDocumentUrl: a.bankAdvanceApprovedDocumentUrl,
            bankAdvanceSubmittedOn: a.bankAdvanceSubmittedOn,
            docToBeReleasedOn: a.docToBeReleasedOn,
            arrivalOn: a.arrivalOn,
            shipmentFreeRetentionDate: a.shipmentFreeRetentionDate,
            portRetentionWithPenaltyDate: a.portRetentionWithPenaltyDate,
            maximumRetentionDate: a.maximumRetentionDate,
            arrivalNoticeDate: a.arrivalNoticeDate,
            arrivalNoticeFreeRetentionDays: a.arrivalNoticeFreeRetentionDays,
            arrivalNoticeDocumentUrl: a.arrivalNoticeDocumentUrl,
            arrivalNoticeDocumentName: a.arrivalNoticeDocumentName,
            advanceRequestDate: a.advanceRequestDate,
            advanceRequestDocumentUrl: a.advanceRequestDocumentUrl,
            advanceRequestDocumentName: a.advanceRequestDocumentName,
            doReleasedDate: a.doReleasedDate,
            doReleasedDocumentUrl: a.doReleasedDocumentUrl,
            doReleasedDocumentName: a.doReleasedDocumentName,
            doReleasedRemarks: a.doReleasedRemarks,
            boePassingDate: a.boePassingDate,
            boePassingDocumentUrl: a.boePassingDocumentUrl,
            boePassingDocumentName: a.boePassingDocumentName,
            boePassingRemarks: a.boePassingRemarks,
            dmBarcode: a.dmBarcode,
            dpApprovalDate: a.dpApprovalDate,
            dpApprovalDocumentUrl: a.dpApprovalDocumentUrl,
            dpApprovalDocumentName: a.dpApprovalDocumentName,
            dpApprovalRemarks: a.dpApprovalRemarks,
            tokenReceivedDate: a.tokenReceivedDate,
            municipalityDate: a.municipalityDate,
            municipalityDocumentUrl: a.municipalityDocumentUrl,
            municipalityDocumentName: a.municipalityDocumentName,
            municipalityRemarks: a.municipalityRemarks,
            municipalityStatus: a.municipalityStatus || 'open',
            municipalityStatusComment: a.municipalityStatusComment || '',
            customsClearanceRemarks: a.customsClearanceRemarks,
            customsOriginalDocuments: a.customsOriginalDocuments
              ? {
                  boe: {
                    submissionDate: a.customsOriginalDocuments.boeSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.boeDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.boeDocumentName || '',
                  },
                  do: {
                    submissionDate: a.customsOriginalDocuments.doSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.doDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.doDocumentName || '',
                  },
                  blOriginal: {
                    submissionDate: a.customsOriginalDocuments.blOriginalSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.blOriginalDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.blOriginalDocumentName || '',
                  },
                  invoice: {
                    submissionDate: a.customsOriginalDocuments.invoiceSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.invoiceDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.invoiceDocumentName || '',
                  },
                  packingList: {
                    submissionDate: a.customsOriginalDocuments.packingListSubmissionDate || null,
                    documentUrl: a.customsOriginalDocuments.packingListDocumentUrl || '',
                    documentName: a.customsOriginalDocuments.packingListDocumentName || '',
                  },
                }
              : null,
            clearExpectedOn: a.clearExpectedOn,
            shipmentArrivedOn: a.shipmentArrivedOn,
            deliveryOrderDocumentUrl: a.deliveryOrderDocumentUrl,
            deliveryOrderDate: a.deliveryOrderDate,
            tokenDocumentUrl: a.tokenDocumentUrl,
            tokenDate: a.tokenDate,
            transportArrangedDocumentUrl: a.transportArrangedDocumentUrl,
            transportArrangedDate: a.transportArrangedDate,
            customsClearanceDocumentUrl: a.customsClearanceDocumentUrl,
            customsClearanceDate: a.customsClearanceDate,
            municipalityClearanceDocumentUrl: a.municipalityClearanceDocumentUrl,
            municipalityClearanceDate: a.municipalityClearanceDate,
            deliverySchedules: a.deliverySchedules || [],
            warehouseSchedules: a.warehouseSchedules || [],
            transportationBooked: a.transportationBooked || [],
            lockedLogisticsSections: a.lockedLogisticsSections || [],
            storageSplits: a.storageSplits || [],
            storageDocumentUrl: a.storageDocumentUrl || null,
            storageDocumentName: a.storageDocumentName || null,
            storageDocumentUrl: a.storageDocumentUrl,
            storageDocumentName: a.storageDocumentName,
            qualityRows: a.qualityRows || [],
            qualityReports: a.qualityReports || [],
            paymentAllocations: a.paymentAllocations || [],
            paymentAllocationApproval: a.paymentAllocationApproval || null,
            paymentCostings: a.paymentCostings || [],
            paymentCostingApproval: a.paymentCostingApproval || null,
            packagingExpenses: a.packagingExpenses || [],
            paymentCostingDocumentUrl: a.paymentCostingDocumentUrl,
            paymentCostingDocumentName: a.paymentCostingDocumentName,
            paid_amount: a.paid_amount,
            paidOn: a.paidOn,
            remarks: a.remarks
          };

          if (hasValues(a.clearance)) {
            actualData.clearance = a.clearance;
          }

          if (hasValues(a.grn)) {
            actualData.grn = a.grn;
          }

          actual.push(actualData);
        });
      }
    });

    await Promise.all(actual.map(async (row) => {
      const [
        signedStep3Doc,
        signedBlDocument,
        signedCommercialInvoiceDocument,
        signedPkgDocument,
        signedInwardAdvice,
        signedMurabaha,
        signedReleased,
        signedArrivalNotice,
        signedAdvance,
        signedDoReleased,
        signedBoePassing,
        signedDpApproval,
        signedCustoms,
        signedMunicipality,
        signedPaymentCosting,
        signedStorageDocument,
        signedCustomsBoe,
        signedCustomsDo,
        signedCustomsBl,
        signedCustomsInvoice,
        signedCustomsPackingList,
      ] = await Promise.all([
        toSignedDocument(row.costSheetBookingDocumentUrl, row.costSheetBookingDocumentName),
        toSignedDocument(row.blDocumentUrl, row.blDocumentName),
        toSignedDocument(row.commercialInvoiceDocumentUrl, row.commercialInvoiceDocumentName),
        toSignedDocument(row.packagingListDocumentUrl, row.packagingListDocumentName),
        toSignedDocument(row.inwardCollectionAdviceDocumentUrl, row.inwardCollectionAdviceDocumentName),
        toSignedDocument(row.murabahaContractSubmittedDocumentUrl, row.murabahaContractSubmittedDocumentName),
        toSignedDocument(row.documentsReleasedDocumentUrl, row.documentsReleasedDocumentName),
        toSignedDocument(row.arrivalNoticeDocumentUrl, row.arrivalNoticeDocumentName),
        toSignedDocument(row.advanceRequestDocumentUrl, row.advanceRequestDocumentName),
        toSignedDocument(row.doReleasedDocumentUrl, row.doReleasedDocumentName),
        toSignedDocument(row.boePassingDocumentUrl, row.boePassingDocumentName),
        toSignedDocument(row.dpApprovalDocumentUrl, row.dpApprovalDocumentName),
        toSignedDocument(row.customsClearanceDocumentUrl, row.customsClearanceDocumentName),
        toSignedDocument(row.municipalityDocumentUrl, row.municipalityDocumentName),
        toSignedDocument(row.paymentCostingDocumentUrl, row.paymentCostingDocumentName),
        toSignedDocument(row.storageDocumentUrl, row.storageDocumentName),
        toSignedDocument(row.customsOriginalDocuments?.boe?.documentUrl, row.customsOriginalDocuments?.boe?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.do?.documentUrl, row.customsOriginalDocuments?.do?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.blOriginal?.documentUrl, row.customsOriginalDocuments?.blOriginal?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.invoice?.documentUrl, row.customsOriginalDocuments?.invoice?.documentName),
        toSignedDocument(row.customsOriginalDocuments?.packingList?.documentUrl, row.customsOriginalDocuments?.packingList?.documentName),
      ]);

      row.costSheetBookingDocumentUrl = signedStep3Doc.url;
      row.costSheetBookingDocumentName = signedStep3Doc.name;
      row.blDocumentUrl = signedBlDocument.url;
      row.blDocumentName = signedBlDocument.name;
      row.commercialInvoiceDocumentUrl = signedCommercialInvoiceDocument.url;
      row.commercialInvoiceDocumentName = signedCommercialInvoiceDocument.name;
      row.packagingListDocumentUrl = signedPkgDocument.url;
      row.packagingListDocumentName = signedPkgDocument.name;
      row.inwardCollectionAdviceDocumentUrl = signedInwardAdvice.url;
      row.inwardCollectionAdviceDocumentName = signedInwardAdvice.name;
      row.murabahaContractSubmittedDocumentUrl = signedMurabaha.url;
      row.murabahaContractSubmittedDocumentName = signedMurabaha.name;
      row.documentsReleasedDocumentUrl = signedReleased.url;
      row.documentsReleasedDocumentName = signedReleased.name;
      row.arrivalNoticeDocumentUrl = signedArrivalNotice.url;
      row.arrivalNoticeDocumentName = signedArrivalNotice.name;
      row.advanceRequestDocumentUrl = signedAdvance.url;
      row.advanceRequestDocumentName = signedAdvance.name;
      row.doReleasedDocumentUrl = signedDoReleased.url;
      row.doReleasedDocumentName = signedDoReleased.name;
      row.boePassingDocumentUrl = signedBoePassing.url;
      row.boePassingDocumentName = signedBoePassing.name;
      row.dpApprovalDocumentUrl = signedDpApproval.url;
      row.dpApprovalDocumentName = signedDpApproval.name;
      row.customsClearanceDocumentUrl = signedCustoms.url;
      row.customsClearanceDocumentName = signedCustoms.name;
      row.municipalityDocumentUrl = signedMunicipality.url;
      row.municipalityDocumentName = signedMunicipality.name;
      row.paymentCostingDocumentUrl = signedPaymentCosting.url;
      row.paymentCostingDocumentName = signedPaymentCosting.name;
      row.storageDocumentUrl = signedStorageDocument.url;
      row.storageDocumentName = signedStorageDocument.name;
      if (row.customsOriginalDocuments) {
        row.customsOriginalDocuments.boe.documentUrl = signedCustomsBoe.url;
        row.customsOriginalDocuments.boe.documentName = signedCustomsBoe.name;
        row.customsOriginalDocuments.do.documentUrl = signedCustomsDo.url;
        row.customsOriginalDocuments.do.documentName = signedCustomsDo.name;
        row.customsOriginalDocuments.blOriginal.documentUrl = signedCustomsBl.url;
        row.customsOriginalDocuments.blOriginal.documentName = signedCustomsBl.name;
        row.customsOriginalDocuments.invoice.documentUrl = signedCustomsInvoice.url;
        row.customsOriginalDocuments.invoice.documentName = signedCustomsInvoice.name;
        row.customsOriginalDocuments.packingList.documentUrl = signedCustomsPackingList.url;
        row.customsOriginalDocuments.packingList.documentName = signedCustomsPackingList.name;
      }

      const [costSheetBookings, additionalClearingAdvanceRequests, qualityRows, qualityReports, paymentAllocations, paymentCostings, storageSplits] = await Promise.all([
        Promise.all((row.costSheetBookings || []).map(async (costRow) => {
          const plainCostRow = toPlainObject(costRow);
          const signed = await toSignedDocument(costRow.attachmentDocumentUrl, costRow.attachmentDocumentName);
          return {
            ...plainCostRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.additionalClearingAdvanceRequests || []).map(async (requestRow) => {
          const plainRequestRow = toPlainObject(requestRow);
          const signed = await toSignedDocument(requestRow.attachmentDocumentUrl, requestRow.attachmentDocumentName);
          return {
            ...plainRequestRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.qualityRows || []).map(async (qualityRow) => {
          const plainQualityRow = toPlainObject(qualityRow);
          const [inhouse, strategic, thirdParty, attachment] = await Promise.all([
            toSignedDocument(qualityRow.inhouseReportDocumentUrl, qualityRow.inhouseReportDocumentName),
            toSignedDocument(qualityRow.strategicReportDocumentUrl, qualityRow.strategicReportDocumentName),
            toSignedDocument(qualityRow.thirdPartyReportDocumentUrl, qualityRow.thirdPartyReportDocumentName),
            toSignedDocument(qualityRow.attachmentDocumentUrl, qualityRow.attachmentDocumentName),
          ]);
          return {
            ...plainQualityRow,
            inhouseReportDocumentUrl: inhouse.url,
            inhouseReportDocumentName: inhouse.name,
            strategicReportDocumentUrl: strategic.url,
            strategicReportDocumentName: strategic.name,
            thirdPartyReportDocumentUrl: thirdParty.url,
            thirdPartyReportDocumentName: thirdParty.name,
            attachmentDocumentUrl: attachment.url,
            attachmentDocumentName: attachment.name,
          };
        })),
        Promise.all((row.qualityReports || []).map(async (reportRow) => {
          const plainReportRow = toPlainObject(reportRow);
          const signed = await toSignedDocument(reportRow.documentUrl, reportRow.documentName);
          return {
            ...plainReportRow,
            documentUrl: signed.url,
            documentName: signed.name,
          };
        })),
        Promise.all((row.paymentAllocations || []).map(async (allocationRow) => {
          const plainAllocationRow = toPlainObject(allocationRow);
          const signed = await toSignedDocument(allocationRow.attachmentDocumentUrl, allocationRow.attachmentDocumentName);
          return {
            ...plainAllocationRow,
            attachmentDocumentUrl: signed.url,
            attachmentDocumentName: signed.name,
          };
        })),
        Promise.all((row.paymentCostings || []).map(async (costingRow) => {
          const plainCostingRow = toPlainObject(costingRow);
          const signed = await toSignedDocument(costingRow.refBillDocumentUrl, costingRow.refBillDocumentName);
          return {
            ...plainCostingRow,
            refBillDocumentUrl: signed.url,
            refBillDocumentName: signed.name,
          };
        })),
        Promise.all((row.storageSplits || []).map(async (storageRow) => {
          const plainStorageRow = toPlainObject(storageRow);
          const signed = await toSignedDocument(storageRow.documentUrl, storageRow.documentName);
          return {
            ...plainStorageRow,
            documentUrl: signed.url,
            documentName: signed.name,
          };
        })),
      ]);

      row.costSheetBookings = costSheetBookings;
      row.additionalClearingAdvanceRequests = additionalClearingAdvanceRequests;
      row.qualityRows = qualityRows;
      row.qualityReports = qualityReports;
      row.paymentAllocations = paymentAllocations;
      row.paymentCostings = paymentCostings;
      row.storageSplits = storageSplits;
    }));

    const [signedLpoUrl, signedProformaUrl, signedS1QualityUrl] = await Promise.all([
      shipment.lpoDocumentUrl
        ? createSignedGetUrl(shipment.lpoDocumentUrl, 900).catch(() => shipment.lpoDocumentUrl)
        : null,
      shipment.proformaDocumentUrl
        ? createSignedGetUrl(shipment.proformaDocumentUrl, 900).catch(() => shipment.proformaDocumentUrl)
        : null,
      shipment.s1QualityReportUrl
        ? createSignedGetUrl(shipment.s1QualityReportUrl, 900).catch(() => shipment.s1QualityReportUrl)
        : null,
    ]);

    res.status(200).json({
      shipment: {
        _id: shipment._id,
        shipmentNo: shipment.shipmentNo,
        orderNumber: shipment.poNumber,
        poNumber: shipment.poNumber,
        fpoNo: shipment.fpoNo,
        orderDate: shipment.orderDate,
        supplier: shipment.supplierName || shipment.supplierId?.name || null,
        supplierEmail: shipment.supplierEmail || null,
        itemCode: shipment.itemCode || shipment.itemId?.itemCode || null,
        commodity: shipment.commodity || null,
        countryOfOrigin: shipment.countryOfOrigin || null,
        itemDescription: shipment.itemDescription || shipment.itemId?.description || null,
        item: shipment.itemId
          ? `${shipment.itemId.itemCode} - ${shipment.itemId.description}`
          : (shipment.itemCode || shipment.itemDescription
            ? `${shipment.itemCode || ''}${shipment.itemCode && shipment.itemDescription ? ' - ' : ''}${shipment.itemDescription || ''}`.trim()
            : null),
        riceName: shipment.brandName || shipment.itemId?.riceName,
        packing: shipment.packing || shipment.itemId?.packing,
        piNo: shipment.piNo,
        piDate: shipment.piDate,
        portOfLoading: shipment.portOfLoading || null,
        portOfDischarge: shipment.portOfDischarge || null,
        fcl: shipment.fcl ?? null,
        pallet: shipment.pallet ?? null,
        bags: shipment.bags ?? null,
        totalOrderedQtyMT: shipment.totalOrderedQtyMT,
        plannedQtyMT: shipment.plannedQtyMT,
        actualQtyMT: shipment.actualQtyMT,
        assumedContainerCount: shipment.assumedContainerCount ?? shipment.totalSplitQtyMT,
        currentStage: shipment.currentStage,
        payment: shipment.payment.totalAmount,
        totalAED: (() => {
          // If lineItems exist and have totalAED, sum them up
          if (Array.isArray(shipment.lineItems) && shipment.lineItems.length > 0) {
            const sum = shipment.lineItems.reduce((acc, item) => acc + (Number(item.totalAED) || 0), 0);
            if (sum > 0) return Math.round(sum * 100) / 100;
          }
          // Fallback: schema-level amountAED field
          if (shipment.amountAED != null && shipment.amountAED > 0) return shipment.amountAED;
          // Last resort: convert totalFC / payment amount at 3.67
          const usd = Number(shipment.totalFC || shipment.payment?.totalAmount || 0);
          return usd > 0 ? Math.round(usd * 3.67 * 100) / 100 : null;
        })(),
        incoterms: shipment.incoterms,
        buyunit: shipment.buyunit,
        fcPerUnit: shipment.fcPerUnit,
        advanceAmount: shipment.advanceAmount,
        paymentTerms: shipment.paymentTerms,
        bankName: shipment.bankName,
        barcode: shipment.barcode,
        variant: shipment.variant,
        hsCode: shipment.hsCode,
        lineItems: Array.isArray(shipment.lineItems)
          ? shipment.lineItems.map((item) => ({
              lineNo: item.lineNo ?? null,
              itemCode: item.itemCode || null,
              itemDescription: item.itemDescription || null,
              commodity: item.commodity || null,
              countryOfOrigin: item.countryOfOrigin || null,
              brandName: item.brandName || null,
              barcode: item.barcode || null,
              dmBarcode: item.dmBarcode || null,
              variant: item.variant || null,
              hsCode: item.hsCode || null,
              packagingType: item.packagingType || null,
              containerSize: item.containerSize || null,
              plannedContainers: item.plannedContainers ?? null,
              fcl: item.fcl ?? null,
              pallet: item.pallet ?? null,
              bags: item.bags ?? null,
              buyingUnit: item.buyingUnit || null,
              fclPerUnit: item.fclPerUnit ?? null,
              fcPerUnit: item.fcPerUnit ?? null,
              totalUSD: item.totalUSD ?? null,
              totalAED: item.totalAED ?? null,
              expectedETD: item.expectedETD || null,
              expectedETA: item.expectedETA || null,
            }))
          : [],
        lpoDocumentName: shipment.lpoDocumentName || null,
        lpoDocumentUrl: signedLpoUrl,
        proformaDocumentName: shipment.proformaDocumentName || null,
        proformaDocumentUrl: signedProformaUrl,
        s1QualityReportName: shipment.s1QualityReportName || null,
        s1QualityReportUrl: signedS1QualityUrl,
        q1Report: shipment.q1Report || null,
        plannedETD: shipment.plannedETD,
        plannedETA: shipment.plannedETA,
        containerSize: shipment.containersize,
        noOfShipments: shipment.noOfShipments,
        shipmentStatus: getComputedShipmentStatus(shipment, containers),
      },
      planned,
      actual,
      scheduledHistory: scheduledHistoryLogs.map((entry) => ({
        id: entry._id,
        action: entry.action,
        remarks: entry.remarks || "",
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        user: entry.userId || entry.after?.historyActorName || entry.before?.historyActorName
          ? {
              id: entry.userId?._id || entry.userId || null,
              name:
                (entry.userId && entry.userId.name) ||
                entry.after?.historyActorName ||
                entry.before?.historyActorName ||
                "",
              email:
                (entry.userId && entry.userId.email) ||
                entry.after?.historyActorEmail ||
                entry.before?.historyActorEmail ||
                "",
            }
          : null,
        before: entry.before?.plannedContainers || [],
        after: entry.after?.plannedContainers || [],
      })),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


const hasValues = (obj) => {
  if (!obj) return false;
  return Object.values(obj).some(
    value => value !== null && value !== undefined && value !== ""
  );
};

// Parse number from strings like "USD 985.00", "480.000 MT (+/- 5%)", "48,000.00"
function parseNum(s) {
  if (s == null) return undefined;
  if (typeof s === 'number' && !Number.isNaN(s)) return s;
  if (typeof s !== 'string') return undefined;
  const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, ' ');
  const match = cleaned.match(/-?\d+\.?\d*/);
  return match ? parseFloat(match[0]) : undefined;
}

// Map Python extraction API response to frontend ExtractedShipmentData shape
function mapPythonResponseToExtraction(pythonRes) {
  const out = {};
  if (!pythonRes || typeof pythonRes !== 'object') return out;

  const lpo = pythonRes.lpo_invoice || {};
  const sc = pythonRes.shipment_calculations || {};

  const getIndexedValue = (value, index) => {
    if (Array.isArray(value)) return value[index];
    return value;
  };

  const toContainerSizeValue = (value) => {
    if (value == null || value === '') return undefined;
    const size = String(value).trim().toLowerCase();
    if (size.startsWith('40')) return '40';
    if (size.startsWith('20')) return '20';
    return undefined;
  };

  const mapBuyingUnit = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return undefined;
    if (normalized === 'BAG' || normalized === 'BAGS') return 'Bag';
    if (normalized === 'PALLET' || normalized === 'PALLETS') return 'Pallet';
    if (normalized === 'KG' || normalized === 'MT') return normalized;
    return undefined;
  };

  const parsePackagingKg = (value) => {
    if (value == null || value === '') return undefined;
    const match = String(value).toUpperCase().match(/1X\s*(\d+(?:\.\d+)?)\s*KG/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const allocateWholeUnits = (total, weights) => {
    const normalizedTotal = parseNum(total);
    if (normalizedTotal == null || normalizedTotal < 0) return [];

    const normalizedWeights = weights.map((weight) => (Number.isFinite(Number(weight)) ? Math.max(Number(weight), 0) : 0));
    const weightSum = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
    if (!weightSum) return [];

    const rawShares = normalizedWeights.map((weight) => (normalizedTotal * weight) / weightSum);
    const baseShares = rawShares.map((share) => Math.floor(share));
    let remainder = Math.round(normalizedTotal - baseShares.reduce((sum, share) => sum + share, 0));

    const byRemainder = rawShares
      .map((share, index) => ({ index, remainder: share - baseShares[index] }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < byRemainder.length && remainder > 0; i += 1) {
      baseShares[byRemainder[i].index] += 1;
      remainder -= 1;
    }

    return baseShares;
  };

  const normalizeItemShape = (itemLike, index = 0, options = {}) => {
    const item = itemLike || {};
    const itemCount = options.itemCount || 1;
    const allowScalarShipmentFallback = itemCount === 1;
    const line = {};

    const lineItemCode = item.item_code ?? item.itemCode ?? getIndexedValue(lpo.item_code, index);
    if (lineItemCode != null && lineItemCode !== '') line.itemCode = String(lineItemCode).trim();

    const lineDescription = item.item ?? item.description ?? item.itemDescription ?? getIndexedValue(lpo.item, index);
    if (lineDescription != null && lineDescription !== '') line.itemDescription = String(lineDescription).trim();

    const lineCommodity = item.commodity ?? getIndexedValue(lpo.commodity, index);
    if (lineCommodity != null && lineCommodity !== '') line.commodity = String(lineCommodity).trim();

    const lineCountry = item.country_of_origin ?? item.countryOfOrigin ?? getIndexedValue(lpo.country_of_origin, index);
    if (lineCountry != null && lineCountry !== '') line.countryOfOrigin = String(lineCountry).trim();

    const linePackaging = item.packaging ?? item.packing ?? getIndexedValue(lpo.packaging, index);
    if (linePackaging != null && linePackaging !== '') line.packagingType = String(linePackaging).trim();

    // Buying unit should not be inferred from shipment-document extraction.
    // Keep shipment extraction consistent by defaulting to MT instead of
    // trusting OCR/model guesses like "Bag".
    line.buyingUnit = 'MT';

    const lineQuantityMt = item.quantity_in_mt
      ?? item.quantityInMt
      ?? getIndexedValue(lpo.quantity_in_mt, index)
      ?? getIndexedValue(lpo.quantity, index);
    const parsedQtyMt = parseNum(lineQuantityMt);
    if (parsedQtyMt != null) {
      line.plannedContainers = parsedQtyMt;
    } else {
      const parsedBagQty = parseNum(item.quantity_in_bags ?? item.quantityInBags ?? getIndexedValue(lpo.quantity_in_bags, index));
      const packagingKg = parsePackagingKg(item.packaging ?? item.packing ?? getIndexedValue(lpo.packaging, index));
      if (parsedBagQty != null && packagingKg != null) {
        line.plannedContainers = Number(((parsedBagQty * packagingKg) / 1000).toFixed(2));
      } else if (allowScalarShipmentFallback) {
        const fallbackQtyMt = parseNum(getIndexedValue(sc.quantity_in_mt, index));
        if (fallbackQtyMt != null) line.plannedContainers = fallbackQtyMt;
      }
    }

    const lineFcl = item.fcl ?? (allowScalarShipmentFallback ? getIndexedValue(sc.fcl, index) : undefined);
    const parsedFcl = parseNum(lineFcl);
    if (parsedFcl != null) line.fcl = parsedFcl;

    const linePallet = item.pallets ?? item.pallet ?? (allowScalarShipmentFallback ? getIndexedValue(sc.pallets, index) : undefined);
    const parsedPallet = parseNum(linePallet);
    if (parsedPallet != null) line.pallet = parsedPallet;

    const lineBags = item.bags ?? item.quantity_in_bags ?? item.quantityInBags ?? getIndexedValue(sc.bags, index) ?? getIndexedValue(lpo.quantity_in_bags, index);
    const parsedBags = parseNum(lineBags);
    if (parsedBags != null) line.bags = parsedBags;

    const lineFclPerUnit = item.fcl_per_unit ?? item.fclPerUnit ?? (allowScalarShipmentFallback ? getIndexedValue(sc.fcl_per_unit, index) : undefined);
    const parsedFclPerUnit = parseNum(lineFclPerUnit);
    if (parsedFclPerUnit != null) line.fclPerUnit = parsedFclPerUnit;

    const linePrice = item.price_per_mt
      ?? item.pricePerMt
      ?? item.unit_price
      ?? item.unitPrice
      ?? item.unit
      ?? (allowScalarShipmentFallback ? getIndexedValue(sc.price_per_mt, index) : undefined)
      ?? getIndexedValue(lpo.price_per_mt, index);
    const parsedPrice = parseNum(linePrice);
    if (parsedPrice != null) line.fcPerUnit = parsedPrice;

    const lineTotal = item.total_amount ?? item.totalAmount ?? item.total_price ?? item.totalPrice ?? item.price ?? getIndexedValue(lpo.total_amount, index);
    const parsedTotal = parseNum(lineTotal);
    if (parsedTotal != null) {
      line.totalUSD = parsedTotal;
      line.totalAED = Math.round(parsedTotal * 3.67 * 100) / 100;
    }

    const lineContainerSize = toContainerSizeValue(item.container_size ?? item.containerSize ?? getIndexedValue(sc.container_size, index));
    if (lineContainerSize) line.containerSize = lineContainerSize;

    const lineNo = parseNum(item.line_no ?? item.lineNo ?? item.s_no ?? index + 1);
    if (lineNo != null) line.lineNo = lineNo;

    return line;
  };

  const inferItemsFromArrays = () => {
    const candidateFields = [
      lpo.item_code,
      lpo.item,
      lpo.commodity,
      lpo.packaging,
      lpo.buying_unit,
      lpo.unit,
      lpo.quantity_in_mt,
      lpo.quantity_in_bags,
      lpo.price_per_mt,
      lpo.total_amount,
      sc.quantity_in_mt,
      sc.fcl,
      sc.pallets,
      sc.bags,
      sc.fcl_per_unit,
      sc.price_per_mt,
      sc.container_size,
    ];

    const inferredLength = candidateFields.reduce((max, value) => (Array.isArray(value) ? Math.max(max, value.length) : max), 0);
    if (!inferredLength) return [];

    return Array.from({ length: inferredLength }, (_, index) => normalizeItemShape({}, index, { itemCount: inferredLength }));
  };

  // Shipment info
  if (lpo.po_number != null && lpo.po_number !== '') out.fpoNo = String(lpo.po_number).trim();
  if (lpo.po_date != null && lpo.po_date !== '') out.purchaseDate = String(lpo.po_date).trim();
  if (lpo.pi_number != null && lpo.pi_number !== '') out.piNo = String(lpo.pi_number).trim();
  if (lpo.pi_date != null && lpo.pi_date !== '') out.piDate = String(lpo.pi_date).trim();
  if (lpo.inco_terms != null && lpo.inco_terms !== '') out.incoTerms = String(lpo.inco_terms).trim();
  if (lpo.port_of_loading != null && lpo.port_of_loading !== '') out.portOfLoading = String(lpo.port_of_loading).trim();
  if (lpo.port_of_discharge != null && lpo.port_of_discharge !== '') out.portOfDischarge = String(lpo.port_of_discharge).trim();
  if (lpo.commodity != null && lpo.commodity !== '') out.commodity = String(lpo.commodity).trim();
  const itemDesc = lpo.item ?? '';
  if (itemDesc !== '') out.itemDescription = String(itemDesc).trim();

  // Supplier (Python returns names only)
  const supplierName = lpo.vendor ?? '';
  if (supplierName !== '') out.supplierName = String(supplierName).trim();

  // Item
  if (lpo.payment_terms != null && lpo.payment_terms !== '') out.paymentTerms = String(lpo.payment_terms).trim();

  // shipment_calculations: pass through and use for quantity, fcl, pallet, bags, containerSize
  if (sc && typeof sc === 'object') {
    if (!Array.isArray(sc.quantity_in_mt) && sc.quantity_in_mt != null) out.plannedContainers = Number(sc.quantity_in_mt);
    if (!Array.isArray(sc.fcl) && sc.fcl != null) out.fcl = Number(sc.fcl);
    if (!Array.isArray(sc.pallets) && sc.pallets != null) out.pallet = Number(sc.pallets);
    if (!Array.isArray(sc.bags) && sc.bags != null) out.bags = Number(sc.bags);
    if (!Array.isArray(sc.fcl_per_unit) && sc.fcl_per_unit != null) out.fclPerUnit = Number(sc.fcl_per_unit);
    if (!Array.isArray(sc.container_size)) {
      const size = toContainerSizeValue(sc.container_size);
      if (size) out.containerSize = size;
    }
    out.shipmentCalculations = {
      fcl: !Array.isArray(sc.fcl) && sc.fcl != null ? Number(sc.fcl) : undefined,
      bags: !Array.isArray(sc.bags) && sc.bags != null ? Number(sc.bags) : undefined,
      quantity_in_mt: !Array.isArray(sc.quantity_in_mt) && sc.quantity_in_mt != null ? Number(sc.quantity_in_mt) : undefined,
      container_size: !Array.isArray(sc.container_size) && sc.container_size != null ? String(sc.container_size) : undefined,
      bags_per_container: !Array.isArray(sc.bags_per_container) && sc.bags_per_container != null ? Number(sc.bags_per_container) : undefined,
      fcl_per_unit: !Array.isArray(sc.fcl_per_unit) && sc.fcl_per_unit != null ? Number(sc.fcl_per_unit) : undefined,
      pallets: !Array.isArray(sc.pallets) && sc.pallets != null ? Number(sc.pallets) : undefined,
      price_per_mt: !Array.isArray(sc.price_per_mt) && sc.price_per_mt != null ? Number(sc.price_per_mt) : undefined,
      is_price_matching: sc.is_price_matching === true,
      lpo_price_per_mt: !Array.isArray(sc.lpo_price_per_mt) && sc.lpo_price_per_mt != null ? Number(sc.lpo_price_per_mt) : undefined,
      pi_price_per_mt: !Array.isArray(sc.pi_price_per_mt) && sc.pi_price_per_mt != null ? Number(sc.pi_price_per_mt) : undefined,
      mt_variation: !Array.isArray(sc.mt_variation) && sc.mt_variation != null ? Number(sc.mt_variation) : undefined,
      diff_percent: !Array.isArray(sc.diff_percent) && sc.diff_percent != null ? Number(sc.diff_percent) : undefined
    };
  }

  const itemCount = Array.isArray(lpo.items) ? lpo.items.length : 0;
  const rawItems = Array.isArray(lpo.items)
    ? lpo.items.map((item, index) => normalizeItemShape(item, index, { itemCount }))
    : inferItemsFromArrays();

  if (rawItems.length > 1) {
    const itemWeights = rawItems.map((item) => item.plannedContainers || 0);

    if (rawItems.some((item) => item.fcl == null)) {
      const allocatedFcl = allocateWholeUnits(sc.fcl, itemWeights);
      if (allocatedFcl.length === rawItems.length) {
        rawItems.forEach((item, index) => {
          if (item.fcl == null) item.fcl = allocatedFcl[index];
        });
      }
    }

    if (rawItems.some((item) => item.pallet == null)) {
      const allocatedPallet = allocateWholeUnits(sc.pallets, itemWeights);
      if (allocatedPallet.length === rawItems.length) {
        rawItems.forEach((item, index) => {
          if (item.pallet == null) item.pallet = allocatedPallet[index];
        });
      }
    }

    rawItems.forEach((item) => {
      if ((item.fclPerUnit == null || item.fclPerUnit === 0) && item.fcl && item.totalUSD) {
        item.fclPerUnit = Number((item.totalUSD / item.fcl).toFixed(2));
      }
    });
  }
  out.items = (rawItems.length ? rawItems : [normalizeItemShape({}, 0)]).map((item, index) => ({
    lineNo: item.lineNo ?? index + 1,
    ...item,
  }));

  const firstItem = out.items[0] || {};
  if (firstItem.itemCode) out.itemCode = firstItem.itemCode;
  if (firstItem.itemDescription) out.itemDescription = firstItem.itemDescription;
  if (firstItem.commodity) out.commodity = firstItem.commodity;
  if (firstItem.countryOfOrigin) out.countryOfOrigin = firstItem.countryOfOrigin;
  if (firstItem.packagingType) out.packagingType = firstItem.packagingType;
  if (firstItem.plannedContainers != null) out.plannedContainers = firstItem.plannedContainers;
  if (firstItem.buyingUnit) out.buyingUnit = firstItem.buyingUnit;
  if (firstItem.fcPerUnit != null) out.fcPerUnit = firstItem.fcPerUnit;
  if (firstItem.totalUSD != null) out.totalUSD = firstItem.totalUSD;
  if (firstItem.totalAED != null) out.totalAED = firstItem.totalAED;
  if (firstItem.fcl != null) out.fcl = firstItem.fcl;
  if (firstItem.pallet != null) out.pallet = firstItem.pallet;
  if (firstItem.bags != null) out.bags = firstItem.bags;
  if (firstItem.fclPerUnit != null) out.fclPerUnit = firstItem.fclPerUnit;
  if (firstItem.containerSize) out.containerSize = firstItem.containerSize;

  // S1 quality report payload from Python extraction response
  // Kept as nested object so frontend can use full extracted structure as needed.
  if (pythonRes.s1_quality_report && typeof pythonRes.s1_quality_report === 'object') {
    out.q1Report = pythonRes.s1_quality_report;
  }

  return out;
}

async function enrichExtractionItemsFromCatalog(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) return data;

  const rawItemCodes = [...new Set(data.items.map((item) => String(item?.itemCode || '').trim()).filter(Boolean))];
  if (!rawItemCodes.length) return data;

  const catalogItems = await Item.find({ itemCode: { $in: rawItemCodes } }).lean();
  const catalogByCode = new Map(catalogItems.map((item) => [normalizeCatalogKey(item.itemCode), item]));

  data.items = data.items.map((item) => {
    const catalogItem = catalogByCode.get(normalizeCatalogKey(item?.itemCode));
    if (!catalogItem) return item;

    return {
      ...item,
      countryOfOrigin: item.countryOfOrigin || catalogItem.countryOfOrigin || '',
      brandName: item.brandName || catalogItem.brand || catalogItem.riceName || '',
      barcode: item.barcode || catalogItem.barcode || '',
      dmBarcode: item.dmBarcode || catalogItem.dmBarcode || '',
      variant: item.variant || catalogItem.variant || '',
      hsCode: item.hsCode || catalogItem.hsCode || '',
      packagingType: item.packagingType || catalogItem.packing || '',
      // Do not backfill buying unit from item master during extraction.
      // If extraction does not return a confident value, default to MT.
      buyingUnit: item.buyingUnit || 'MT',
    };
  });

  const firstItem = data.items[0] || {};
  if (firstItem.countryOfOrigin && !data.countryOfOrigin) data.countryOfOrigin = firstItem.countryOfOrigin;
  if (firstItem.brandName && !data.brandName) data.brandName = firstItem.brandName;
  if (firstItem.barcode && !data.barcode) data.barcode = firstItem.barcode;
  if (firstItem.variant && !data.variant) data.variant = firstItem.variant;
  if (firstItem.hsCode && !data.hsCode) data.hsCode = firstItem.hsCode;
  if (firstItem.packagingType && !data.packagingType) data.packagingType = firstItem.packagingType;
  if (!data.buyingUnit) data.buyingUnit = firstItem.buyingUnit || 'MT';

  return data;
}

// =======================
// EXTRACT FROM DOCUMENTS — calls Python API, maps response to frontend shape
// Frontend sends: document1 = Purchase order (LPO), s1QualityReport
// Python API expects: lpo_invoice, rice_quality_report (with optional inco_terms_list, suppliers)
// =======================
exports.extractFromDocuments = async (req, res) => {
  try {
    const files = req.files;
    // document1 = Purchase order → lpo_invoice, s1QualityReport = quality report → rice_quality_report
    if (!files?.document1?.[0] || !files?.s1QualityReport?.[0]) {
      return res.status(400).json({
        message: 'Purchase order (document1) and S1 Quality Report (s1QualityReport) are required'
      });
    }

    const pythonUrl = process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096';
    const endpoint = `${pythonUrl.replace(/\/$/, '')}/shipment-form`;
    const incoTermsList = process.env.PYTHON_INCO_TERMS_LIST || 'CIF,FOB,EXWORKS';
    const suppliersList = process.env.PYTHON_SUPPLIERS_LIST || '';

    const lpoFile = files.document1[0];
    const qualityFile = files.s1QualityReport[0];

    const FormData = globalThis.FormData;
    const form = new FormData();
    const lpoBlob = new Blob([lpoFile.buffer], { type: lpoFile.mimetype || 'application/octet-stream' });
    const qualityBlob = new Blob([qualityFile.buffer], { type: qualityFile.mimetype || 'application/octet-stream' });
    form.append('lpo_invoice', lpoBlob, lpoFile.originalname || 'lpo.pdf');
    form.append('rice_quality_report', qualityBlob, qualityFile.originalname || 'quality-report.pdf');
    form.append('inco_terms_list', incoTermsList);
    form.append('suppliers', suppliersList);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Python extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    const data = await enrichExtractionItemsFromCatalog(mapPythonResponseToExtraction(pythonRes));

    return res.status(200).json({
      message: 'Data extracted successfully',
      data: data || {}
    });
  } catch (err) {
    console.error('Extract from documents error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

// =======================
// EXTRACT BILL NO — calls Python bill-no endpoint (single file: PDF or image)
// =======================
exports.extractBillNo = async (req, res) => {
  try {
    const files = req.files || {};
    const blFile = files.file?.[0];
    const pkgFile = files.packaging_list_file?.[0];
    const packagingBrand = req.body.packaging_brand || '';

    if (!blFile) {
      return res.status(400).json({ message: 'Bill of Lading file is required' });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096').replace(/\/$/, '');
    const endpoint = `${baseUrl}/purchase-tracker/fetch-details`;

    const FormData = globalThis.FormData;
    const form = new FormData();
    
    // Append BL file
    const blBlob = new Blob([blFile.buffer], { type: blFile.mimetype || 'application/octet-stream' });
    form.append('file', blBlob, blFile.originalname || 'document');
    
    // Append Packaging List file if provided
    if (pkgFile) {
      const pkgBlob = new Blob([pkgFile.buffer], { type: pkgFile.mimetype || 'application/octet-stream' });
      form.append('packaging_list_file', pkgBlob, pkgFile.originalname || 'packaging_list');
    }
    
    // Append Brand
    if (packagingBrand) {
      form.append('packaging_brand', packagingBrand);
    }

    console.log("Calling extraction endpoint:", endpoint);
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    
    // Standardize response for frontend
    return res.status(200).json({
      bill_extracted_data: pythonRes.bill_extracted_data || pythonRes.bill_no_data || {},
      packaging_list: pythonRes.packaging_list || {},
      // Backwards compatibility if needed
      bill_no: pythonRes.bill_extracted_data?.bill_no || '',
      invoice_number: pythonRes.bill_extracted_data?.invoice_number || '',
      metadata: pythonRes.metadata,
      ...pythonRes
    });
  } catch (err) {
    console.error('Extract bill no error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Bill-no extraction service unavailable. Check PYTHON_BILLNO_API_URL/PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

exports.extractArrivalNotice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096').replace(/\/$/, '');
    const endpoint = `${baseUrl}/arrival-notice/extract`;
    const FormData = globalThis.FormData;
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
    form.append('file', blob, req.file.originalname || 'arrival-notice');

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      return res.status(response.status).json({
        message: errJson.detail || errJson.message || `Arrival notice extraction service returned ${response.status}`,
        error: errJson
      });
    }

    const pythonRes = await response.json();
    const rawDays = pythonRes?.free_retension_days ?? pythonRes?.free_retention_days ?? '';
    const freeRetentionDays = Number.parseInt(String(rawDays).match(/\d+/)?.[0] || '0', 10) || 0;

    return res.status(200).json({
      print_date: pythonRes?.print_date || null,
      arrival_on: pythonRes?.arrival_on || null,
      free_retension_days: freeRetentionDays,
      metadata: pythonRes?.metadata || null,
    });
  } catch (err) {
    console.error('Extract arrival notice error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    return res.status(500).json({
      message: isNetwork
        ? 'Arrival notice extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
        : (err.message || 'Server error'),
      error: err.message
    });
  }
};

const normalizeDpwCargoExtraction = (raw = {}, fallbackError = null) => {
  const rawContainers = Array.isArray(raw?.containers) ? raw.containers : [];
  const containers = rawContainers.map((item) => ({
    container: item?.container || item?.containerNo || item?.container_no || null,
    from: item?.from ?? item?.from_date ?? item?.fromDate ?? null,
    to: item?.to ?? item?.to_date ?? item?.toDate ?? null,
  }));
  const totalContainers = Number(raw?.totalContainers ?? raw?.total_containers);

  return {
    date: raw?.date || null,
    receiptNo: raw?.receiptNo || raw?.receipt_no || null,
    pagesProcessed: raw?.pagesProcessed ?? raw?.pages_processed ?? null,
    totalContainers: Number.isFinite(totalContainers) ? totalContainers : containers.length,
    containers,
    metadata: raw?.metadata || null,
    error: typeof raw?.error === 'string' ? raw.error : (fallbackError || null),
  };
};

exports.extractDpwCargo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'File is required',
        ...normalizeDpwCargoExtraction({}, 'File is required'),
      });
    }

    const baseUrl = (process.env.PYTHON_EXTRACTION_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const endpoint = `${baseUrl}/dpw-cargo-extractor`;
    const FormData = globalThis.FormData;
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
    form.append('file', blob, req.file.originalname || 'dpw-cargo-receipt');
    if (process.env.DPW_CARGO_MAX_PAGES) {
      form.append('max_pages', String(process.env.DPW_CARGO_MAX_PAGES));
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { detail: errText }; }
      const message = errJson.detail || errJson.message || errJson.error || `Cargo extraction service returned ${response.status}`;
      return res.status(response.status).json({
        message,
        ...normalizeDpwCargoExtraction(errJson, message),
        serviceError: errJson,
      });
    }

    const pythonRes = await response.json();
    return res.status(200).json(normalizeDpwCargoExtraction(pythonRes));
  } catch (err) {
    console.error('Extract DPW cargo error:', err);
    const isNetwork = err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED';
    const message = isNetwork
      ? 'Cargo extraction service unavailable. Check PYTHON_EXTRACTION_API_URL and that the Python service is running.'
      : (err.message || 'Server error');
    return res.status(500).json({
      message,
      ...normalizeDpwCargoExtraction({}, message),
    });
  }
};

// Update supplier email on a shipment
exports.updateSupplierEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierEmail } = req.body;

    if (!supplierEmail || typeof supplierEmail !== 'string') {
      return res.status(400).json({ message: 'supplierEmail is required' });
    }

    const normalized = supplierEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ message: 'A valid email address is required' });
    }

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const before = { supplierEmail: shipment.supplierEmail };
    shipment.supplierEmail = normalized;
    await shipment.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Shipment',
      entity: 'Shipment',
      entityId: shipment._id,
      action: 'Updated',
      before,
      after: { supplierEmail: normalized },
      remarks: 'Vendor email updated',
    });

    res.json({ message: 'Vendor email updated', supplierEmail: normalized });
  } catch (err) {
    console.error('updateSupplierEmail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update bank name on a shipment
exports.updateBankName = async (req, res) => {
  try {
    const { id } = req.params;
    const bankName = typeof req.body.bankName === 'string' ? req.body.bankName.trim() : '';

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const before = { bankName: shipment.bankName || '' };
    shipment.bankName = bankName;
    await shipment.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Shipment',
      entity: 'Shipment',
      entityId: shipment._id,
      action: 'Updated',
      before,
      after: { bankName },
      remarks: 'Bank name updated',
    });

    res.json({ message: 'Bank name updated', bankName });
  } catch (err) {
    console.error('updateBankName error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Bulk save storage arrival
exports.bulkSaveStorageArrival = async (req, res) => {
  try {
    const { containers } = req.body;

    if (!Array.isArray(containers) || containers.length === 0) {
      return res.status(400).json({ message: 'containers array is required and must not be empty' });
    }

    const bulkOps = [];
    const errors = [];

    for (const containerData of containers) {
      const { containerId, storageSplits } = containerData;

      if (!containerId) {
        errors.push({ containerId: 'missing', error: 'Container ID is required' });
        continue;
      }

      const container = await Container.findById(containerId);
      if (!container) {
        errors.push({ containerId, error: 'Container not found' });
        continue;
      }

      if (Array.isArray(storageSplits) && storageSplits.length > 0) {
        container.actual.storageSplits = storageSplits.map((split, index) => ({
          containerSerialNo: split.containerSerialNo || '',
          bags: Number(split.bags) || 0,
          warehouse: split.warehouse || '',
          storageAvailability: Number(split.storageAvailability) || 0,
          receivedOnDate: toDateOrNull(split.receivedOnDate),
          receivedOnTime: toTimeString(split.receivedOnTime),
          customsInspection: split.customsInspection || '',
          grn: split.grn || '',
          batch: split.batch || '',
          productionDate: toDateOrNull(split.productionDate),
          expiryDate: toDateOrNull(split.expiryDate),
          hsCode: split.hsCode || '',
          grossWeight: split.grossWeight || '',
          netWeight: split.netWeight || '',
          remarks: split.remarks || '',
          documentUrl: split.documentUrl || '',
          documentName: split.documentName || ''
        }));
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: containerId },
          update: { $set: { 'actual.storageSplits': container.actual.storageSplits } }
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation errors', errors });
    }

    if (bulkOps.length > 0) {
      await Container.bulkWrite(bulkOps);
    }

    res.json({ message: 'Storage arrival data saved successfully', savedCount: bulkOps.length });
  } catch (err) {
    console.error('bulkSaveStorageArrival error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Bulk save transportation arranged
exports.bulkSaveTransportationArranged = async (req, res) => {
  try {
    const { containers } = req.body;

    if (!Array.isArray(containers) || containers.length === 0) {
      return res.status(400).json({ message: 'containers array is required and must not be empty' });
    }

    const bulkOps = [];
    const errors = [];

    for (const containerData of containers) {
      const { containerId, transportationBooked } = containerData;

      if (!containerId) {
        errors.push({ containerId: 'missing', error: 'Container ID is required' });
        continue;
      }

      const container = await Container.findById(containerId);
      if (!container) {
        errors.push({ containerId, error: 'Container not found' });
        continue;
      }

      // Validate transport company is present for all records
      if (Array.isArray(transportationBooked) && transportationBooked.length > 0) {
        const missingTransportCompany = transportationBooked.some(
          (booking) => !booking.transportCompanyName || String(booking.transportCompanyName).trim() === ''
        );

        if (missingTransportCompany) {
          errors.push({ 
            containerId, 
            error: 'Transport company name is required for all transportation bookings' 
          });
          continue;
        }

        container.actual.transportationBooked = transportationBooked.map((booking) => ({
          sn: Number(booking.sn) || 0,
          containerSerialNo: booking.containerSerialNo || '',
          transportCompanyName: booking.transportCompanyName,
          bookedDate: toDateOrNull(booking.bookedDate),
          bookingTime: toTimeString(booking.bookingTime),
          transportDate: toDateOrNull(booking.transportDate),
          transportTime: toTimeString(booking.transportTime),
          delayHours: Number(booking.delayHours) || 0,
          storageStartDate: toDateOrNull(booking.storageStartDate),
          storageEndDate: toDateOrNull(booking.storageEndDate),
          tokenReceivedDate: toDateOrNull(booking.tokenReceivedDate)
        }));
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: containerId },
          update: { $set: { 'actual.transportationBooked': container.actual.transportationBooked } }
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation errors', errors });
    }

    if (bulkOps.length > 0) {
      await Container.bulkWrite(bulkOps);
    }

    res.json({ message: 'Transportation data saved successfully', savedCount: bulkOps.length });
  } catch (err) {
    console.error('bulkSaveTransportationArranged error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

if (process.env.NODE_ENV === 'test') {
  exports.__test = {
    buildDashboardRStatusMetrics,
    buildDashboardStatusPivot,
    normalizeDpwCargoExtraction,
    applyCommercialInvoiceDocumentUpload,
  };
}
