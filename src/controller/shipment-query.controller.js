const {
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
} = require('./shipment-preamble.helpers');

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

const buildShipmentListQuery = ({
  search = '',
  status = '',
  shipmentIds = null,
  commercialInvoiceShipmentIds = null,
  blNoShipmentIds = null,
  isLocal = false,
}) => {
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

    if (Array.isArray(blNoShipmentIds) && blNoShipmentIds.length) {
      query.$or.push({ _id: { $in: blNoShipmentIds } });
    }

    // Shipment Tracker search — the ID shown per row (e.g. "RHST-0021/PO01-1242-1") is a
    // computed label (base LPO shipmentNo + split index), not a stored field, so searching
    // the exact displayed tracker number won't match shipmentNo directly. Strip a trailing
    // "-<N>" split suffix and match the base too, as a first-class condition rather than a
    // separate zero-results-only retry, so it works alongside every other search term here.
    const splitSuffixMatch = /^(.*)-(\d+)$/.exec(normalizedSearch);
    if (splitSuffixMatch) {
      const baseSearch = splitSuffixMatch[1].trim();
      if (baseSearch) {
        query.$or.push({ shipmentNo: { $regex: baseSearch, $options: 'i' } });
      }
    }
  }

  if (normalizedStatus) {
    query.currentStage = normalizedStatus;
  }

  // All-Shipments "Local Purchases" filter — regular shipments explicitly tagged local at
  // creation (Feature B: isLocal flag). Only applied when truthy; the default "All Shipments"
  // view is unaffected (no isLocal condition added at all).
  if (isLocal) {
    query.isLocal = true;
  }

  return query;
};


// "rice" -> "Rice", "basmati rice" -> "Basmati Rice" — display-only casing for free-text fields
// like Commodity in exports; comma-joined multi-values are each title-cased independently.
const toTitleCase = (value) => {
  if (!value) return value;
  return String(value)
    .split(', ')
    .map((part) => part.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()))
    .join(', ');
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

// B/L-wise search — the B/L number lives on the container's actual data, not the Shipment
// document itself, so it needs the same "find matching containers, resolve to shipmentIds"
// pattern already used for the commercial invoice number search above.
const getBlNoShipmentIds = async (search = '') => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) return [];

  const containers = await Container.find({
    'actual.BLNo': { $regex: normalizedSearch, $options: 'i' },
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

// Point 1: FAS users only see shipments that are "On Transit" or later. We compute the
// allowed shipment IDs by evaluating each shipment's computed status against the
// pure isOnTransitOrLaterStatus predicate.
const getOnTransitOrLaterShipmentIds = async () => {
  const shipments = await Shipment.find({}).lean();
  const shipmentIds = shipments.map((s) => s._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .select('shipmentId actual planned')
    .lean();
  const byShipment = new Map();
  containers.forEach((c) => {
    const key = String(c.shipmentId);
    if (!byShipment.has(key)) byShipment.set(key, []);
    byShipment.get(key).push(c);
  });
  return shipments
    .filter((s) => isOnTransitOrLaterStatus(getShipmentReportStatus(s, byShipment.get(String(s._id)) || [])))
    .map((s) => String(s._id));
};

// Warehouse managers only see shipments at "At Port of Discharge" or later.
const getAtPortOrLaterShipmentIds = async () => {
  const shipments = await Shipment.find({}).lean();
  const shipmentIds = shipments.map((s) => s._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .select('shipmentId actual planned')
    .lean();
  const byShipment = new Map();
  containers.forEach((c) => {
    const key = String(c.shipmentId);
    if (!byShipment.has(key)) byShipment.set(key, []);
    byShipment.get(key).push(c);
  });
  return shipments
    .filter((s) => isAtPortOrLaterStatus(getShipmentReportStatus(s, byShipment.get(String(s._id)) || [])))
    .map((s) => String(s._id));
};

const shouldRestrictShipmentListForPendingBlRoles = (user) =>
  normalizeRole(user?.role || '') === 'Logistic';

const shouldRestrictShipmentListToOnTransit = (user) =>
  normalizeRole(user?.role || '') === 'FAS';

const shouldRestrictShipmentListToAtPort = (user) =>
  normalizeRole(user?.role || '') === 'warehouse';

const isStorekeeper = (user) =>
  normalizeRole(user?.role || '') === 'storekeeper';


// Maps a Shipment document to the Order/Shipment list row shape.
const mapShipmentListRow = (s, shipmentContainers = [], precomputedStatus = null) => ({
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
  status: precomputedStatus ?? getShipmentOverallStatus(s, shipmentContainers),
});

// Builds a Map<shipmentId, container[]> from a flat container array.
const groupContainersByShipment = (containers = []) => {
  const containerMap = new Map();
  containers.forEach((container) => {
    const key = String(container.shipmentId);
    if (!containerMap.has(key)) containerMap.set(key, []);
    containerMap.get(key).push(container);
  });
  return containerMap;
};

// Normalizes a comma-separated / array status-filter input into a lowercase Set (or null).
const buildStatusFilterSet = (statuses) => {
  const list = Array.isArray(statuses)
    ? statuses
    : String(statuses || '').split(',');
  const normalized = list.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean);
  return normalized.length ? new Set(normalized) : null;
};

const fetchShipmentList = async ({ page = 1, limit = 20, search = '', status = '', statuses = null, user = null }) => {
  let restrictedShipmentIds = null;
  if (shouldRestrictShipmentListForPendingBlRoles(user)) {
    restrictedShipmentIds = await getActualWorkflowShipmentIds();
  } else if (shouldRestrictShipmentListToOnTransit(user)) {
    restrictedShipmentIds = await getOnTransitOrLaterShipmentIds();
  } else if (shouldRestrictShipmentListToAtPort(user)) {
    restrictedShipmentIds = await getAtPortOrLaterShipmentIds();
  } else if (isStorekeeper(user)) {
    const assignedWarehouses = await Warehouse.find({ assignedStorekeepers: user._id, status: 'Active' })
      .select('name code').lean();
    const labels = assignedWarehouses.map((w) => {
      const code = String(w.code || '').trim();
      const name = String(w.name || '').trim();
      return code ? `${name} - ${code}` : name;
    });
    // A storekeeper shouldn't see a shipment until transportation is complete — same
    // "at port or later" gate the warehouse-manager role already gets, so a warehouse match
    // alone (which can occur while a shipment is still On Transit) isn't enough on its own.
    const warehouseMatchedIds = await getStorekeeperShipmentIds(labels);
    const atPortOrLaterIds = new Set(await getAtPortOrLaterShipmentIds());
    restrictedShipmentIds = warehouseMatchedIds.filter((id) => atPortOrLaterIds.has(id));
  }
  const commercialInvoiceShipmentIds = await getCommercialInvoiceShipmentIds(search);
  const blNoShipmentIds = await getBlNoShipmentIds(search);
  const query = buildShipmentListQuery({
    search,
    status,
    shipmentIds: restrictedShipmentIds,
    commercialInvoiceShipmentIds,
    blNoShipmentIds,
  });

  // Point 3: multi-select status filter. The row's DISPLAYED status stays the shipment's
  // overall/worst-container status (getShipmentOverallStatus, accurate single-label summary).
  // But MATCHING a filter checkbox uses "does ANY container hit this status" (same per-container
  // classification the dashboard drill-down uses) — otherwise a shipment whose worst container is
  // e.g. fully unscheduled would never surface for "ETA Yet To Due" even though it genuinely has
  // containers sitting in that state, which is what a user picking that filter wants to find.
  const statusFilterSet = buildStatusFilterSet(statuses);
  if (statusFilterSet) {
    const allShipments = await Shipment.find(query)
      .populate("supplierId", "name")
      .populate("itemId", "description")
      .sort({ orderDate: -1, createdAt: -1 });
    const allIds = allShipments.map((s) => s._id);
    const allContainers = await Container.find({ shipmentId: { $in: allIds } }).lean();
    const containerMap = groupContainersByShipment(allContainers);

    const matched = allShipments
      .map((s) => {
        const shipmentContainers = containerMap.get(String(s._id)) || [];
        const overallStatus = getShipmentOverallStatus(s, shipmentContainers);
        const containerStatuses = shipmentContainers.length
          ? shipmentContainers.map((container) => getComputedContainerShipmentStatus(s, container))
          : [overallStatus];
        const matchesFilter = containerStatuses.some((status) =>
          statusFilterSet.has(String(status || '').trim().toLowerCase())
        );
        return { row: mapShipmentListRow(s, [], overallStatus), matchesFilter };
      })
      .filter(({ matchesFilter }) => matchesFilter)
      .map(({ row }) => row);

    const total = matched.length;
    const start = (page - 1) * limit;
    return {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      shipments: matched.slice(start, start + limit),
    };
  }

  const total = await Shipment.countDocuments(query);

  const shipments = await Shipment.find(query)
    .populate("supplierId", "name")
    .populate("itemId", "description")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ orderDate: -1, createdAt: -1 });

  const shipmentIds = shipments.map((shipment) => shipment._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } }).lean();
  const containerMap = groupContainersByShipment(containers);

  const formatted = shipments.map((s) => mapShipmentListRow(s, containerMap.get(String(s._id)) || []));

  return {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
    shipments: formatted
  };
};

// Point 4: flat list of every individual shipment (one row per container/split) across all
// LPOs. Reuses the same role restrictions, search and status computation as the Order list.
const fetchFlatShipmentList = async ({ page = 1, limit = 20, search = '', statuses = null, user = null, isLocal = false }) => {
  let restrictedShipmentIds = null;
  let storekeeperLabelSet = null;
  if (shouldRestrictShipmentListForPendingBlRoles(user)) {
    restrictedShipmentIds = await getActualWorkflowShipmentIds();
  } else if (shouldRestrictShipmentListToOnTransit(user)) {
    restrictedShipmentIds = await getOnTransitOrLaterShipmentIds();
  } else if (shouldRestrictShipmentListToAtPort(user)) {
    restrictedShipmentIds = await getAtPortOrLaterShipmentIds();
  } else if (isStorekeeper(user)) {
    const assignedWarehouses = await Warehouse.find({ assignedStorekeepers: user._id, status: 'Active' })
      .select('name code').lean();
    const labels = assignedWarehouses.map((w) => {
      const code = String(w.code || '').trim();
      const name = String(w.name || '').trim();
      return code ? `${name} - ${code}` : name;
    });
    storekeeperLabelSet = new Set(labels.map(normalizeWarehouseLabelForMatch));
    // A storekeeper shouldn't see a shipment until transportation is complete — same
    // "at port or later" gate the warehouse-manager role already gets, so a warehouse match
    // alone (which can occur while a shipment is still On Transit) isn't enough on its own.
    const warehouseMatchedIds = await getStorekeeperShipmentIds(labels);
    const atPortOrLaterIds = new Set(await getAtPortOrLaterShipmentIds());
    restrictedShipmentIds = warehouseMatchedIds.filter((id) => atPortOrLaterIds.has(id));
  }

  const commercialInvoiceShipmentIds = await getCommercialInvoiceShipmentIds(search);
  const blNoShipmentIds = await getBlNoShipmentIds(search);
  // Shipment Tracker search (e.g. "RHST-0021/PO01-1242-3") and B/L search are both handled
  // as first-class conditions inside buildShipmentListQuery — see its split-suffix handling
  // and blNoShipmentIds param — so a single query covers every search term here.
  const query = buildShipmentListQuery({
    search,
    status: '',
    shipmentIds: restrictedShipmentIds,
    commercialInvoiceShipmentIds,
    blNoShipmentIds,
    isLocal,
  });

  const shipments = await Shipment.find(query)
    .populate("supplierId", "name")
    .populate("itemId", "description")
    .sort({ orderDate: -1, createdAt: -1 });

  const allIds = shipments.map((s) => s._id);
  const allContainers = await Container.find({ shipmentId: { $in: allIds } }).lean();
  const containerMap = groupContainersByShipment(allContainers);

  const statusFilterSet = buildStatusFilterSet(statuses);
  const rows = [];

  shipments.forEach((s) => {
    const shipmentContainers = containerMap.get(String(s._id)) || [];
    // Always show every container that actually exists in the DB — `noOfShipments` (via
    // getShipmentSplitCount) is a manually-set count that can go stale (e.g. a container
    // gets added after the last time someone clicked "Confirm"), and must never truncate
    // real rows out of this list. Same reasoning as the Dashboard's `dashboardContainers`.
    const splitCount = getShipmentSplitCount(s, shipmentContainers);
    const effectiveContainers = shipmentContainers;
    const base = String(s.shipmentNo || '').replace(/\([^)]*\)/g, '').trim();
    const supplier = s.supplierId?.name || s.supplierName || null;
    const lineItems = Array.isArray(s.lineItems) ? s.lineItems : [];
    const description = s.itemId?.description
      || joinDistinctLineItemValues(lineItems, 'itemDescription')
      || s.itemDescription
      || null;

    const buildRow = (childIndex, container) => {
      const actual = container?.actual || {};
      const planned = container?.planned || {};
      const clearingApproval = actual.clearingAdvanceApproval || {};
      const clearingPayment = actual.clearingAdvancePaymentDetails || {};
      const storageDecision = actual.storageAllocationDecision || {};
      const storageApproval = actual.storageAllocationApproval || {};
      const paymentAllocationApproval = actual.paymentAllocationApproval || {};
      const costSheetBookings = Array.isArray(actual.costSheetBookings) ? actual.costSheetBookings : [];
      const transportationBooked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];
      const paymentAllocations = Array.isArray(actual.paymentAllocations) ? actual.paymentAllocations : [];
      const storageSplits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];

      // "Planned (Containers)" = containers already assigned to a warehouse per the
      // storage allocation decision; "Not Planned" is whatever's left of noOfContainers.
      const itemAllocations = Array.isArray(storageDecision.itemAllocations) ? storageDecision.itemAllocations : [];
      const plannedContainers = itemAllocations.reduce(
        (sum, item) => sum + (Array.isArray(item.allocations) ? item.allocations : [])
          .reduce((inner, a) => inner + (Number(a?.containersAssigned) || 0), 0),
        0
      );
      const totalContainersForRow = Number(actual.noOfContainers) || 0;
      const notPlannedContainers = Math.max(totalContainersForRow - plannedContainers, 0);

      // "Containers Received" = storage split rows that have actually been received at the warehouse.
      const containersReceived = storageSplits.filter((row) => !!row?.receivedOnDate).length;
      const containersRemaining = Math.max(totalContainersForRow - containersReceived, 0);
      const shortageBags = storageSplits.reduce((sum, row) => sum + (Number(row?.shortageBags) || 0), 0);

      const paymentReceivedAmount = paymentAllocations.reduce((sum, row) => sum + (Number(row?.paidAmount) || 0), 0);
      const paymentRequestAmount = paymentAllocations.reduce((sum, row) => sum + (Number(row?.requestAmount) || 0), 0);

      // Direct receiver: bank/murabaha submission fields are handled in Document Tracker, so
      // they show as N/A in this export.
      const isDirectReceiver = String(actual.receiver || '').trim().toLowerCase() === 'direct';
      const naIfDirect = (value) => (isDirectReceiver ? 'N/A' : value);

      return {
        shipmentId: base ? `${base}-${childIndex + 1}` : `${String(s._id)}-${childIndex + 1}`,
        parentId: s._id,
        childIndex,
        shipmentNo: s.shipmentNo,
        orderNumber: s.orderNumber,
        orderDate: s.orderDate,
        supplier,
        description,
        blNo: actual.BLNo || '',
        commercialInvoiceNo: actual.commercialInvoiceNo || '',
        buyingQty: container ? getDashboardChildQuantity(s, container, splitCount) : (s.plannedQtyMT || s.totalOrderedQtyMT || 0),
        fcl: container ? getDashboardChildFcl(s, container, splitCount) : (s.fcl || 0),
        status: container ? getDashboardStatusColumn(s, container) : getShipmentOverallStatus(s, []),

        // ===== Full-detail export columns, matching the "Final Data.xlsx" reference format =====
        // Purchase Department
        itemCode: joinDistinctLineItemValues(lineItems, 'itemCode') || s.itemCode || '',
        commodity: toTitleCase(joinDistinctLineItemValues(lineItems, 'commodity') || s.commodity || ''),
        brandName: joinDistinctLineItemValues(lineItems, 'brandName') || s.brandName || '',
        packing: joinDistinctLineItemValues(lineItems, 'packagingType') || s.packing || '',
        variant: joinDistinctLineItemValues(lineItems, 'variant') || s.variant || '',
        barcode: joinDistinctLineItemValues(lineItems, 'barcode') || s.barcode || '',
        countryOfOrigin: joinDistinctLineItemValues(lineItems, 'countryOfOrigin') || s.countryOfOrigin || '',
        hsCode: joinDistinctLineItemValues(lineItems, 'hsCode') || s.hsCode || '',
        bags: actual.bags ?? planned.bags ?? s.bags ?? 0,
        pallet: actual.pallet ?? planned.pallet ?? s.pallet ?? 0,
        portOfLoading: actual.portOfLoading || s.portOfLoading || '',
        portOfDischarge: actual.portOfDischarge || s.portOfDischarge || '',
        bankName: actual.bankName || s.bankName || '',
        incoterms: s.incoterms || '',
        etd: actual.updatedETD || planned.etd || null,
        eta: actual.updatedETA || planned.eta || null,
        shipOnBoardDate: actual.shipOnBoardDate || null,
        shippingLine: actual.shippingLine || '',
        noOfContainers: actual.noOfContainers ?? '',
        freeDetentionDays: actual.freeDetentionDays ?? '',
        maximumDetentionDays: actual.maximumDetentionDays ?? '',
        shipmentArrived: actual.shipmentArrived || 'No',
        courierTrackNo: actual.courierTrackNo || '',
        provider: actual.courierServiceProvider || '',
        receiver: actual.receiver || '',
        expectedDocDate: actual.expectedDocDate || null,
        arrivalDocumentReceived: actual.arrivalDocumentUrl ? 'Yes' : 'No',

        // Logistics Department (Clearing Advance request)
        clearingAdvanceRequestDate: clearingApproval.submittedAt || null,
        clearingAdvanceAmount: costSheetBookings.reduce((sum, row) => sum + (Number(row?.requestAmount) || 0), 0),

        // FAS Department (Clearing Advance approval)
        clearingAdvanceApprovedDate: clearingApproval.fasApprovedAt || null,
        chequeNo: clearingPayment.chequeNo || '',
        chequeDate: clearingPayment.chequeDate || null,

        // Warehouse Department (Warehouse Manager)
        storageAllocationDate: storageApproval.submittedAt || null,
        allocateSameWarehouse: storageDecision.allocateSameWarehouse === true ? 'Yes' : storageDecision.allocateSameWarehouse === false ? 'No' : '',
        destinationWarehouses: Array.isArray(storageDecision.warehousesSelected)
          ? storageDecision.warehousesSelected.map(dedupeWarehouseLabel).join(', ')
          : '',

        // FAS Department (Bank / Murabaha submission) — N/A for Direct receiver (Document Tracker
        // owns these). Submission Date is also N/A once DA Submitted To Bank is No (nothing was
        // submitted, so there's no date). Likewise all 3 Murabaha detail fields go N/A once
        // Skip Murabaha is Yes (murabaha isn't happening for this shipment at all).
        daSubmittedToBank: naIfDirect(actual.daSubmittedToBank ? 'Yes' : 'No'),
        submissionDate: naIfDirect(actual.daSubmittedToBank ? (actual.daSubmittedToBankDate || null) : 'N/A'),
        skipMurabaha: naIfDirect(actual.skipMurabaha ? 'Yes' : 'No'),
        murabahaReleasedDate: naIfDirect(actual.skipMurabaha ? 'N/A' : (actual.documentsReleasedDate || null)),
        murabahaSubmittedToBank: naIfDirect(actual.skipMurabaha ? 'N/A' : (actual.murabahaSubmittedToBank ? 'Yes' : 'No')),
        murabahaSubmissionDate: naIfDirect(actual.skipMurabaha ? 'N/A' : (actual.daSubmittedToBankDate || null)),
        finalContractReceivedDate: naIfDirect(actual.documentsReleasedDate || null),

        // Logistics Department (Port & Clearance)
        commercialDocumentReceivedDate: actual.commercialDocumentReceivedDate || null,
        arrivalDate: actual.arrivalOn || actual.shipmentArrivedOn || null,
        shippingLineFreeDetentionDays: actual.freeDetentionDays ?? '',
        portFreeStorageDays: actual.freeStorageDays ?? '',
        doDate: actual.doReleasedDate || null,
        boeNumber: actual.dmBarcode || '',
        boeDate: actual.boePassingDate || null,
        customsInspectionRequired: actual.customerInspectionRequired ? 'Yes' : 'No',
        municipalityApplicable: actual.municipalityApplicable === true ? 'Yes' : actual.municipalityApplicable === false ? 'No' : '',
        // Municipality not applicable -> related fields N/A.
        municipalityRefNo: actual.municipalityApplicable === false ? 'N/A' : (actual.municipalityRemarks || ''),
        municipalityInspectionDate: actual.municipalityApplicable === false ? 'N/A' : (actual.municipalityDate || null),
        municipalityStatus: actual.municipalityApplicable === false ? 'N/A' : (actual.municipalityStatus || ''),
        municipalityReleasedDate: actual.municipalityApplicable === false ? 'N/A' : (actual.municipalityReleasedDate || null),
        transportationArrangement: transportationBooked.length ? 'Yes' : 'No',
        transportCompany: [...new Set(transportationBooked.map((t) => t.transportCompanyName).filter(Boolean))].join('; '),
        selectedCompaniesCount: new Set(transportationBooked.map((t) => t.transportCompanyName).filter(Boolean)).size,
        plannedContainers,
        notPlannedContainers,

        // FAS / Warehouse (Storekeepers) — Payment
        paymentAllocationRequestDate: paymentAllocationApproval.submittedAt || null,
        paymentReceivedAmount,
        paymentApprovedDate: paymentAllocationApproval.fasManagerApprovedAt || null,
        differenceAmount: paymentRequestAmount - paymentReceivedAmount,
        containersReceived,
        containersRemaining,
        shortageBags,
      };
    };

    if (!effectiveContainers.length) {
      rows.push({ row: buildRow(0, null), container: null });
      return;
    }
    effectiveContainers.forEach((container, idx) => rows.push({ row: buildRow(idx, container), container }));
  });

  // The shipment-level "at port or later" / warehouse-match gates above (restrictedShipmentIds)
  // only decide whether the PARENT shipment qualifies — a shipment with one container already
  // matching (right warehouse, at port or later) can have OTHER sibling containers still On
  // Transit or not yet allocated at all, and those rows would otherwise leak through since this
  // list is flattened to one row per container. Re-check each row's OWN status and warehouse
  // for storekeepers specifically — never admit a row just because a sibling matched.
  const storekeeperFiltered = isStorekeeper(user)
    ? rows.filter(({ row, container }) =>
        isAtPortOrLaterStatus(row.status) &&
        (!storekeeperLabelSet || containerMatchesWarehouseLabelSet(container, storekeeperLabelSet))
      ).map(({ row }) => row)
    : rows.map(({ row }) => row);

  const filtered = statusFilterSet
    ? storekeeperFiltered.filter((row) => statusFilterSet.has(String(row.status || '').trim().toLowerCase()))
    : storekeeperFiltered;

  const total = filtered.length;
  const start = (page - 1) * limit;
  return {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
    shipments: filtered.slice(start, start + limit),
  };
};

exports.getAllShipmentsFlat = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', q = '', statuses = '', isLocal = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const result = await fetchFlatShipmentList({
      page,
      limit,
      search: String(search || q || ''),
      statuses,
      user: req.user,
      isLocal: isLocal === 'true' || isLocal === true,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', status = '', statuses = '' } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const result = await fetchShipmentList({ page, limit, search, status, statuses, user: req.user });
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.searchShipments = async (req, res) => {
  try {
    let { page = 1, limit = 20, q = '', status = '', statuses = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const result = await fetchShipmentList({ page, limit, search: q, status, statuses, user: req.user });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getShipmentReportExportData = async (req, res) => {
  try {
    const rows = await buildShipmentReportRows(req.query, req.user);

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
    const rows = await buildShipmentReportRows(req.query, req.user);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const title = 'Royal Horizon Group';
    const subtitle = 'Shipment Master Data';
    const totalColumns = Math.max(parentColumns.length, childColumns.length + 1);
    const childExcelStartCol = 2;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shipment Master Data', {
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
    const filename = `royal-horizon-shipment-master-data-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
    const rows = await buildShipmentReportRows(req.query, req.user);
    const parentColumns = selectReportColumns(SHIPMENT_REPORT_COLUMNS, req.query.columns);
    const childColumns = selectReportColumns(SHIPMENT_REPORT_CHILD_COLUMNS, req.query.childColumns);
    const flattenedRows = buildShipmentReportExportRows(rows, parentColumns, childColumns);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const filename = `royal-horizon-shipment-master-data-${new Date().toISOString().slice(0, 10)}.pdf`;

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
      doc.font('Helvetica-Bold').fontSize(18).text('Shipment Master Data', startX, 56, { align: 'center', width: usableWidth });
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
