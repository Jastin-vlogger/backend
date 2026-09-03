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

// Shared by getShipmentSummary's "Average FC per Unit by Supplier" chart (rowKeyFn = item
// description) and its PO-wise sibling (rowKeyFn = PO number) — columns by supplier, value =
// average fcPerUnit across whatever shipments are passed in (no container data needed).
const buildSupplierAvgFcRows = (shipments, rowKeyFn) => {
  const supplierAvgFcMap = new Map();
  shipments.forEach((s) => {
    const rowKey = rowKeyFn(s);
    const supplierName = s.supplierId?.name || s.supplierName || 'Unknown Supplier';
    const fcPerUnit = Number(s.fcPerUnit || 0);

    if (!supplierAvgFcMap.has(rowKey)) supplierAvgFcMap.set(rowKey, { rowLabel: rowKey });
    const supAvg = supplierAvgFcMap.get(rowKey);
    if (!supAvg[`${supplierName}_sum`]) {
      supAvg[`${supplierName}_sum`] = 0;
      supAvg[`${supplierName}_count`] = 0;
    }
    supAvg[`${supplierName}_sum`] += fcPerUnit;
    supAvg[`${supplierName}_count`] += 1;
  });

  return Array.from(supplierAvgFcMap.values()).map((row) => {
    const newRow = { rowLabel: row.rowLabel };
    Object.keys(row).forEach((k) => {
      if (k.endsWith('_sum')) {
        const supplier = k.replace('_sum', '');
        newRow[supplier] = Number((row[`${supplier}_sum`] / row[`${supplier}_count`]).toFixed(2));
      }
    });
    return newRow;
  });
};

const buildSupplierAvgFcRowsByItem = (shipments) => buildSupplierAvgFcRows(shipments, (s) => {
  const sLineItems = Array.isArray(s.lineItems) ? s.lineItems : [];
  return s.itemId?.description
    || joinDistinctLineItemValues(sLineItems, 'itemDescription')
    || s.itemDescription
    || 'Unknown Item';
});

const buildSupplierAvgFcRowsByPo = (shipments) =>
  buildSupplierAvgFcRows(shipments, (s) => String(s.poNumber || '').trim() || 'Unknown PO');

exports.getShipmentSummary = async (req, res) => {
  try {
    // Local purchases (shipments tagged isLocal at creation) are excluded from every dashboard
    // tile, KPI and chart — including FAS, Logistics and the Provider breakdown.
    const shipments = await Shipment.find({ isLocal: { $ne: true } })
      .populate('supplierId', 'name country')
      .populate('itemId', 'description itemCode')
      .sort({ orderDate: -1, createdAt: -1 })
      .lean();

    const poNumbers = Array.from(new Set(shipments.map((s) => String(s.poNumber || '').trim()).filter(Boolean))).sort();

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
      const stage = getShipmentOverallStatus(s, containerMap.get(String(s._id)) || []);
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
      status: getShipmentOverallStatus(s, containerMap.get(String(s._id)) || []),
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
    // Legend/dataset-key labels shown directly on the Dynamic Metrics Explorer chart — must go
    // through displayDashboardStatusColumn() same as the pivot charts, or the unconfirmed bucket
    // leaks the raw internal constant ('ETD yet to be confirmed') instead of the renamed
    // "Shipment Not Scheduled" label used everywhere else on the dashboard.
    const mapStageToStatus = (status) => {
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      if (status === 'On Transit') return 'On Transit';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'Shipment Entry' || status === REPORT_STATUS_ETD_UNCONFIRMED) return displayDashboardStatusColumn(REPORT_STATUS_ETD_UNCONFIRMED);
      return String(status || displayDashboardStatusColumn(REPORT_STATUS_ETD_UNCONFIRMED));
    };

    const mapStageToYearlyStatus = (status) => {
      if (status === 'Reached WH' || status === 'Delivered WH') return 'Delivered WH';
      if (status === 'At Port of Discharge') return 'At the Port';
      if (status === 'On Transit') return 'On Transit';
      if (status === 'ETD yet to due' || status === 'ETA yet to due' || status === REPORT_STATUS_ETD_DUE) return REPORT_STATUS_ETD_DUE;
      if (status === 'Shipment Entry' || status === REPORT_STATUS_ETD_UNCONFIRMED) return displayDashboardStatusColumn(REPORT_STATUS_ETD_UNCONFIRMED);
      return String(status || displayDashboardStatusColumn(REPORT_STATUS_ETD_UNCONFIRMED));
    };

    const qtyMappingMap = new Map();
    const valueMappingMap = new Map();
    const yearlyQtyMappingMap = new Map();
    const supplierAvgFcMap = new Map();
    const supplierYearlyQtyMap = new Map();

    shipments.forEach(s => {
      const sLineItems = Array.isArray(s.lineItems) ? s.lineItems : [];
      const itemDesc = s.itemId?.description
        || joinDistinctLineItemValues(sLineItems, 'itemDescription')
        || s.itemDescription
        || 'Unknown Item';
      // Separate from itemDesc (which stays combined — it also feeds supplierAvgFcMap, out of
      // scope): each distinct line-item description gets its own row instead of one combo-string
      // row, same fix pattern as getDashboardPivotLabels in shipment-preamble.helpers.js.
      const distinctItemDescs = [...new Set(
        sLineItems.map((item) => String(item?.itemDescription || '').trim()).filter(Boolean)
      )];
      const itemDescsForCharts = distinctItemDescs.length ? distinctItemDescs : [itemDesc];
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

        itemDescsForCharts.forEach((desc) => {
          // 1. Qty Mapping
          if (!qtyMappingMap.has(desc)) qtyMappingMap.set(desc, { rowLabel: desc });
          qtyMappingMap.get(desc)[status] = (qtyMappingMap.get(desc)[status] || 0) + qty;

          // 2. Value Mapping
          if (!valueMappingMap.has(desc)) valueMappingMap.set(desc, { rowLabel: desc });
          valueMappingMap.get(desc)[status] = (valueMappingMap.get(desc)[status] || 0) + valueShare;

          // 3. Yearly Qty Mapping
          if (!yearlyQtyMappingMap.has(desc)) yearlyQtyMappingMap.set(desc, { rowLabel: desc });
          yearlyQtyMappingMap.get(desc)[yearlyStatus] = (yearlyQtyMappingMap.get(desc)[yearlyStatus] || 0) + qty;
        });

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

    // Department-specific chart buckets (Warehouse / FAS / Logistics) — computed
    // from the already-loaded containers, no extra query needed.
    const departmentCharts = (() => {
      const warehouse = { arrived: 0, pending: 0, inTransit: 0 };
      const fas = { submitted: 0, pending: 0, approved: 0 };
      const logistics = { cleared: 0, notCleared: 0 };

      containers.forEach((container) => {
        // Warehouse — arrival status: reached vs awaiting receipt vs still in transit
        if (hasSavedStorageArrivalData(container)) {
          warehouse.arrived += 1;
        } else if (hasAssignedWarehouse(container)) {
          warehouse.pending += 1;
        } else {
          warehouse.inTransit += 1;
        }

        // Clearing advance flow drives both FAS (document approvals) and Logistics (clearance) lenses
        const caStatus = container?.actual?.clearingAdvanceApproval?.status || null;
        const hasClearingAdvance = !!caStatus || hasSavedClearingAdvanceData(container);
        if (hasClearingAdvance) {
          // FAS lens — submitted (awaiting FAS) vs pending (draft) vs approved
          if (caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.approved) {
            fas.approved += 1;
          } else if (
            caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas ||
            caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFasManager
          ) {
            fas.submitted += 1;
          } else {
            fas.pending += 1;
          }

          // Logistics lens — cleared (approved) vs not cleared (everything else)
          if (caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.approved) {
            logistics.cleared += 1;
          } else {
            logistics.notCleared += 1;
          }
        }
      });

      return { warehouse, fas, logistics };
    })();

    const fasDashboard = (() => {
      let bankReceiver = 0;
      let directReceiver = 0;

      let statusCompleted = 0;
      let statusInProgress = 0;
      let statusPending = 0;
      let statusOverdue = 0;

      let stageCadCompleted = 0;
      let stageCadPending = 0;
      let stageMurabahaCompleted = 0;
      let stageMurabahaPending = 0;
      let stageFinalContract = 0;
      const cadPendingShipments = [];
      const murabahaPendingShipments = [];
      const finalContractPendingShipments = [];
      // shipmentId -> shipment, for the pending-shipment lists above (eye-icon drill-downs).
      const stageShipmentLookupById = new Map(shipments.map((s) => [String(s._id), s]));
      const pushStagePending = (list, container) => {
        const shipment = stageShipmentLookupById.get(String(container.shipmentId));
        if (!shipment) return;
        const containerId = String(container._id);
        if (list.some((s) => s.containerId === containerId)) return;
        const shipmentContainers = containerMap.get(String(container.shipmentId)) || [];
        const childIndex = shipmentContainers.findIndex((c) => String(c._id) === containerId);
        const shipmentNo = childIndex >= 0 ? `${shipment.shipmentNo}-${childIndex + 1}` : shipment.shipmentNo;
        list.push({
          _id: shipment._id,
          containerId,
          shipmentNo,
          shipmentIndex: childIndex >= 0 ? childIndex : null,
          supplier: shipment.supplierId?.name || shipment.supplierName || null,
          status: getDashboardStatusColumn(shipment, container),
          commercialInvoiceNo: container?.actual?.commercialInvoiceNo || null,
        });
      };

      // Provider Wise is grouped dynamically by the real free-text courierServiceProvider
      // value (not a fixed DHL/Aramex/UPS/TNT set) — see below, "4. Provider Wise".
      const providerCounts = new Map();

      let pendingPaymentRequested = 0;
      let paymentAllocationPending = 0;

      containers.forEach((container) => {
        const actual = container.actual || {};
        const receiver = String(actual.receiver || '').trim().toLowerCase();

        // 1. Receiver Type — Direct counts when there is document activity even if the
        // receiver field was never set (see classifyFasReceiver).
        const receiverClass = classifyFasReceiver(actual);
        const isBank = receiverClass === 'bank';
        if (receiverClass === 'bank') {
          bankReceiver++;
        } else if (receiverClass === 'direct') {
          directReceiver++;
        }

        // 2. Status Breakdown
        const isCompleted = ['Cleared', 'GRN', 'Paid'].includes(container.status) || !!actual.clearedOn;
        if (isCompleted) {
          statusCompleted++;
        } else if (container.status === 'Planned') {
          statusPending++;
        } else {
          const eta = container.planned?.eta ? new Date(container.planned.eta) : null;
          if (eta && eta < startOfToday) {
            statusOverdue++;
          } else {
            statusInProgress++;
          }
        }

        // 3. Document Stage (Bank Receiver Only) — CAD vs Murabaha Through, each split into
        // its own completed/pending by whether the final contract has been received.
        if (isBank) {
          const finalContractReceived = !!(actual.documentsReleasedDocumentUrl || actual.documentsReleasedDate);
          const murabahaSkipped = actual.skipMurabaha === true || actual.skipMurabaha === 'true';
          if (murabahaSkipped) {
            if (finalContractReceived) stageCadCompleted++;
            else { stageCadPending++; pushStagePending(cadPendingShipments, container); }
          } else {
            if (finalContractReceived) stageMurabahaCompleted++;
            else { stageMurabahaPending++; pushStagePending(murabahaPendingShipments, container); }
          }
          if (finalContractReceived) {
            stageFinalContract++;
          } else {
            pushStagePending(finalContractPendingShipments, container);
          }
        }

        // 4. Provider Wise — grouped by the real free-text courierServiceProvider value.
        const providerRaw = String(actual.courierServiceProvider || '').trim();
        if (providerRaw) {
          const providerKey = providerRaw.toLowerCase();
          const existing = providerCounts.get(providerKey);
          if (existing) {
            existing.value++;
          } else {
            providerCounts.set(providerKey, { label: providerRaw, value: 1 });
          }
        }

        // 5. Approvals
        const caStatus = actual.clearingAdvanceApproval?.status || null;
        if (caStatus === 'pending_fas') {
          pendingPaymentRequested++;
        }
        const paStatus = actual.paymentAllocationApproval?.status || null;
        if (paStatus === 'pending_fas_manager') {
          paymentAllocationPending++;
        }
      });

      return {
        receiverType: { bank: bankReceiver, direct: directReceiver, total: bankReceiver + directReceiver },
        statusBreakdown: { completed: statusCompleted, inProgress: statusInProgress, pending: statusPending, overdue: statusOverdue, total: statusCompleted + statusInProgress + statusPending + statusOverdue },
        stageOverview: {
          totalBank: bankReceiver,
          cadCompleted: stageCadCompleted,
          cadPending: stageCadPending,
          cadPendingShipments,
          murabahaCompleted: stageMurabahaCompleted,
          murabahaPending: stageMurabahaPending,
          murabahaPendingShipments,
          finalContract: stageFinalContract,
          finalContractPendingShipments
        },
        providerWise: Array.from(providerCounts.values()).sort((a, b) => b.value - a.value),
        pendingPaymentRequested,
        paymentAllocationPending
      };
    })();

    const activeWarehouses = await Warehouse.find({ status: 'Active' }).select('name code').lean();
    const warehouseContainers = containers.filter((container) => {
      const shipment = shipments.find((s) => String(s._id) === String(container.shipmentId));
      return isAtPortOrLaterStatus(getDashboardStatusColumn(shipment, container));
    });
    const warehouseDashboard = buildWarehouseDashboard(warehouseContainers, activeWarehouses);

    // ── Storekeeper dashboard ────────────────────────────────────────────────
    const storekeeperDashboard = await (async () => {
      const normalizedRole = normalizeRole(req.user?.role || '');
      const isAdmin = normalizedRole === 'Admin' || normalizedRole === 'Manager';
      if (normalizedRole !== 'storekeeper' && !isAdmin) return null;

      const myWarehouses = isAdmin
        ? await Warehouse.find({ status: 'Active' }).select('name code').lean()
        : await Warehouse.find({ assignedStorekeepers: req.user._id, status: 'Active' }).select('name code').lean();

      const emptyDashboard = {
        warehouseNames: [],
        receivingStatus: { allocated: 0, received: 0, pendingReceiving: 0, receivedPct: 0, pendingPct: 0 },
        receivingTimeline: [],
        byWarehouse: [],
      };
      if (!myWarehouses.length) return emptyDashboard;
      const myLabels = myWarehouses.map((w) => {
        const code = String(w.code || '').trim();
        const name = String(w.name || '').trim();
        return code ? `${name} - ${code}` : name;
      });
      const labelSet = new Set(myLabels.map(normalizeWarehouseLabelForMatch));

      const storekeeperContainers = containers.filter((container) => {
        const actual = container?.actual || {};
        const approval = actual.storageAllocationApproval;
        const approvalStatus = approval ? (approval.status || 'draft') : null;
        // A container already booked to transportation is real, current allocation data — the
        // old storageAllocationApproval status (still 'draft' if a warehouse manager never
        // formally re-approved after a reroute) shouldn't hide it from the storekeeper who's
        // actually waiting to receive it. Only apply the approval gate to containers with no
        // transportation booking at all (the older workflow this gate was built for).
        const hasTransportationBooked = Array.isArray(actual.transportationBooked) && actual.transportationBooked.length > 0;
        if (!hasTransportationBooked && approvalStatus !== null && approvalStatus !== 'pending_warehouse_manager' && approvalStatus !== 'approved') return false;

        const shipment = shipments.find((s) => String(s._id) === String(container.shipmentId));
        return isAtPortOrLaterStatus(getDashboardStatusColumn(shipment, container));
      });

      // Aggregate allocation & receiving for assigned warehouses only.
      let totalAllocated = 0;
      let totalReceived = 0;
      const receivedByDate = new Map(); // "DD-Mon" -> { received, pending }
      // A container's storageSplits can hold more than one row for the same physical
      // container — dedupe by serial so "received" counts distinct containers, not raw rows
      // (this is what let Received exceed Allocated).
      const normalizeSerialForDashboard = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');
      const receivedKeysSeen = new Set();
      const allocatedKeysSeen = new Set();

      storekeeperContainers.forEach((container) => {
        const actual = container?.actual || {};
        const decision = actual.storageAllocationDecision || {};
        const itemAllocs = Array.isArray(decision.itemAllocations) ? decision.itemAllocations : [];
        const allocationRows = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
        const transportationBooked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];
        const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
        // Fallback for transportationBooked rows with no warehouse recorded (a real data gap —
        // a container can be physically received/recorded at a warehouse via the storage-arrival
        // flow even though its own transport-arrangement row was left blank).
        const splitWarehouseBySerial = new Map(
          splits
            .filter((s) => normalizeSerialForDashboard(s?.containerSerialNo) && String(s?.warehouse || '').trim())
            .map((s) => [normalizeSerialForDashboard(s.containerSerialNo), String(s.warehouse).trim()])
        );

        // Allocated is recalculated from transportationBooked — each container's CURRENT
        // warehouse (accounts for reroutes after transport is arranged) — falling back to the
        // frozen allocation plan only for containers that haven't reached that stage yet.
        if (transportationBooked.length) {
          transportationBooked.forEach((row, rowIndex) => {
            const bookedWarehouse = String(row?.warehouse || '').trim();
            const warehouse = bookedWarehouse || splitWarehouseBySerial.get(normalizeSerialForDashboard(row?.containerSerialNo)) || '';
            if (!warehouse || !labelSet.has(normalizeWarehouseLabelForMatch(warehouse))) return;
            const serialKey = normalizeSerialForDashboard(row.containerSerialNo);
            const dedupeKey = serialKey || (row?._id ? String(row._id) : `${container._id}-${rowIndex}`);
            if (allocatedKeysSeen.has(dedupeKey)) return;
            allocatedKeysSeen.add(dedupeKey);
            totalAllocated += 1;
          });
        } else if (itemAllocs.length) {
          itemAllocs.forEach((item) => {
            (Array.isArray(item.allocations) ? item.allocations : []).forEach((a) => {
              if (labelSet.has(normalizeWarehouseLabelForMatch(a.warehouse))) {
                totalAllocated += Number(a.containersAssigned) || 0;
              }
            });
          });
        } else {
          allocationRows.forEach((row) => {
            if (labelSet.has(normalizeWarehouseLabelForMatch(row.warehouse))) totalAllocated += 1;
          });
        }

        splits.forEach((split, splitIndex) => {
          if (!labelSet.has(normalizeWarehouseLabelForMatch(split.warehouse))) return;
          const isReceived = !!(
            String(split.grn || '').trim() ||
            String(split.batch || '').trim() ||
            split.receivedOnDate
          );
          if (!isReceived) return;
          const serialKey = normalizeSerialForDashboard(split.containerSerialNo);
          const dedupeKey = serialKey || (split?._id ? String(split._id) : `${container._id}-${splitIndex}`);
          if (receivedKeysSeen.has(dedupeKey)) return;
          receivedKeysSeen.add(dedupeKey);
          totalReceived += 1;
          if (split.receivedOnDate) {
            const d = new Date(split.receivedOnDate);
            if (!Number.isNaN(d.getTime())) {
              const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(' ', '-');
              const existing = receivedByDate.get(label) || { received: 0, date: d };
              existing.received += 1;
              receivedByDate.set(label, existing);
            }
          }
        });
      });

      // Build timeline: sort by date, compute cumulative pending.
      const timelineEntries = [...receivedByDate.entries()]
        .map(([label, v]) => ({ label, received: v.received, _date: v.date }))
        .sort((a, b) => a._date - b._date);

      let cumulativeReceived = 0;
      const receivingTimeline = timelineEntries.map(({ label, received }) => {
        cumulativeReceived += received;
        return {
          label,
          received: cumulativeReceived,
          pending: Math.max(totalAllocated - cumulativeReceived, 0),
        };
      });

      const pendingReceiving = Math.max(totalAllocated - totalReceived, 0);
      const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

      return {
        warehouseNames: myLabels,
        receivingStatus: {
          allocated: totalAllocated,
          received: totalReceived,
          pendingReceiving,
          receivedPct: pct(totalReceived, totalAllocated),
          pendingPct: pct(pendingReceiving, totalAllocated),
        },
        receivingTimeline,
        byWarehouse: myLabels.map((label) => {
          const normalizedLabel = normalizeWarehouseLabelForMatch(label);
          const whContainers = storekeeperContainers.filter((c) => {
            const actual = c?.actual || {};
            const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
            return splits.some((s) => normalizeWarehouseLabelForMatch(s.warehouse) === normalizedLabel);
          });
          let alloc = 0;
          let recv = 0;
          const whReceivedKeysSeen = new Set();
          const whAllocatedKeysSeen = new Set();
          // Track which container each allocated serial came from, so pending (allocated but
          // not yet received) entries can be resolved to a real shipment for the drill-down.
          const allocatedContainerBySerial = new Map();
          storekeeperContainers.forEach((c) => {
            const actual = c?.actual || {};
            const decision = actual.storageAllocationDecision || {};
            const itemAllocs = Array.isArray(decision.itemAllocations) ? decision.itemAllocations : [];
            const allocationRows = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];
            const transportationBooked = Array.isArray(actual.transportationBooked) ? actual.transportationBooked : [];
            const cSplits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
            const cSplitWarehouseBySerial = new Map(
              cSplits
                .filter((s) => normalizeSerialForDashboard(s?.containerSerialNo) && String(s?.warehouse || '').trim())
                .map((s) => [normalizeSerialForDashboard(s.containerSerialNo), String(s.warehouse).trim()])
            );
            if (transportationBooked.length) {
              transportationBooked.forEach((row, rowIndex) => {
                const bookedWarehouse = String(row?.warehouse || '').trim();
                const warehouse = bookedWarehouse || cSplitWarehouseBySerial.get(normalizeSerialForDashboard(row?.containerSerialNo)) || '';
                if (!warehouse || normalizeWarehouseLabelForMatch(warehouse) !== normalizedLabel) return;
                const serialKey = normalizeSerialForDashboard(row.containerSerialNo);
                const dedupeKey = serialKey || (row?._id ? String(row._id) : `${c._id}-${rowIndex}`);
                if (whAllocatedKeysSeen.has(dedupeKey)) return;
                whAllocatedKeysSeen.add(dedupeKey);
                if (serialKey) allocatedContainerBySerial.set(serialKey, c);
                alloc += 1;
              });
            } else if (itemAllocs.length) {
              itemAllocs.forEach((item) => {
                (Array.isArray(item.allocations) ? item.allocations : []).forEach((a) => {
                  if (normalizeWarehouseLabelForMatch(a.warehouse) === normalizedLabel)
                    alloc += Number(a.containersAssigned) || 0;
                });
              });
            } else {
              allocationRows.forEach((row) => {
                if (normalizeWarehouseLabelForMatch(row.warehouse) === normalizedLabel) alloc += 1;
              });
            }
            (Array.isArray(actual.storageSplits) ? actual.storageSplits : []).forEach((s, sIndex) => {
              if (normalizeWarehouseLabelForMatch(s.warehouse) !== normalizedLabel) return;
              if (!(String(s.grn || '').trim() || String(s.batch || '').trim() || s.receivedOnDate)) return;
              const serialKey = normalizeSerialForDashboard(s.containerSerialNo);
              const dedupeKey = serialKey || (s?._id ? String(s._id) : `${c._id}-${sIndex}`);
              if (whReceivedKeysSeen.has(dedupeKey)) return;
              whReceivedKeysSeen.add(dedupeKey);
              recv += 1;
            });
          });
          const pending = Math.max(alloc - recv, 0);

          // Pending shipments = allocated containers not yet received, resolved to a real
          // shipment reference (with the same container-level "-N" numbering used elsewhere)
          // for the drill-down modal. A single container DOCUMENT can hold many physical
          // containers (serials) — dedupe by document so a doc with e.g. 3 pending serials
          // shows once in the list, not 3 identical-looking rows that all link to the same page.
          const pendingShipments = [];
          const pendingContainerDocsSeen = new Set();
          allocatedContainerBySerial.forEach((c, serialKey) => {
            if (whReceivedKeysSeen.has(serialKey)) return;
            const containerDocId = String(c._id);
            if (pendingContainerDocsSeen.has(containerDocId)) return;
            pendingContainerDocsSeen.add(containerDocId);
            const shipment = shipments.find((s) => String(s._id) === String(c.shipmentId));
            if (!shipment) return;
            const shipmentContainers = containerMap.get(String(c.shipmentId)) || [];
            const childIndex = shipmentContainers.findIndex((sc) => String(sc._id) === containerDocId);
            const childShipmentNo = childIndex >= 0 ? `${shipment.shipmentNo}-${childIndex + 1}` : shipment.shipmentNo;
            pendingShipments.push({
              _id: shipment._id,
              containerId: c._id,
              shipmentNo: childShipmentNo,
              supplier: shipment.supplierId?.name || shipment.supplierName || null,
            });
          });

          return { warehouse: label, allocated: alloc, received: recv, pendingReceiving: pending, progress: pct(recv, alloc), pendingShipments };
        })
        .filter((w) => w.allocated > 0 || w.received > 0),
      };
    })();

    // ── Department Wise Job Pending Report ──────────────────────────────────
    // Counts containers with an unresolved action per department, reusing the same
    // status fields each department's own workflow screens already gate on.
    const departmentJobPending = (() => {
      let warehousePending = 0;
      let fasPending = 0;

      containers.forEach((container) => {
        const actual = container.actual || {};

        const allocationPending = actual.storageAllocationApproval?.status === 'pending_warehouse_manager';
        const arrivalPending = actual.storageArrivalApproval?.status === 'pending_warehouse_manager';
        if (allocationPending || arrivalPending) warehousePending++;

        const caStatus = actual.clearingAdvanceApproval?.status || null;
        const clearingAdvancePending =
          caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas ||
          caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFasManager;
        const additionalClearingAdvancePending = (actual.additionalClearingAdvanceRequests || []).some(
          (req) => req?.status === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas
        );
        const paymentAllocationPendingRow = actual.paymentAllocationApproval?.status === 'pending_fas_manager';
        if (clearingAdvancePending || additionalClearingAdvancePending || paymentAllocationPendingRow) fasPending++;
      });

      return [
        { department: 'Logistics', label: 'Logistics Department', pendingCount: logisticsPendingCount },
        { department: 'Warehouse', label: 'Warehouse Department (Storekeepers)', pendingCount: warehousePending },
        { department: 'FAS', label: 'FAS Department', pendingCount: fasPending },
      ];
    })();

    // shipmentId -> { shipmentNo, supplier } lookup, reused by both drill-down dashboards below
    // so each tile can list which real shipments make up its pending count.
    const shipmentLookupById = new Map(
      shipments.map((s) => [
        String(s._id),
        {
          _id: s._id,
          shipmentNo: s.shipmentNo,
          supplier: s.supplierId?.name || s.supplierName || null,
          plannedETD: s.plannedETD,
          fcl: s.fcl,
          noOfShipments: s.noOfShipments,
          assumedContainerCount: s.assumedContainerCount,
        },
      ])
    );
    const addPendingShipment = (tile, container) => {
      const info = shipmentLookupById.get(String(container.shipmentId));
      if (!info) return;
      const containerId = String(container._id);
      if (tile.pendingShipments.some((s) => s.containerId === containerId)) return;
      // Precise, container-level shipment number (e.g. "RHST-0001/PO01-2696-1") — matches
      // the child-numbering shown throughout the shipment tracker UI. A shipment with multiple
      // pending containers now lists each one separately instead of collapsing to one parent row.
      const shipmentContainers = containerMap.get(String(container.shipmentId)) || [];
      const childIndex = shipmentContainers.findIndex((c) => String(c._id) === containerId);
      const childShipmentNo = childIndex >= 0 ? `${info.shipmentNo}-${childIndex + 1}` : info.shipmentNo;
      tile.pendingShipments.push({
        _id: info._id,
        containerId,
        shipmentNo: childShipmentNo,
        shipmentIndex: childIndex >= 0 ? childIndex : null,
        supplier: info.supplier,
        status: getDashboardStatusColumn({ plannedETD: info.plannedETD }, container),
        commercialInvoiceNo: container?.actual?.commercialInvoiceNo || null,
      });
    };

    // Shipment Movement Tracker card: real per-container shipments currently "At the Port" or
    // "On Transit" (not the Status Snapshot's aggregate counts) — shipment no + commercial
    // invoice no per row, same shape/child-numbering as the drill-down lists above.
    const shipmentMovement = { atPort: [], onTransit: [] };
    containers.forEach((container) => {
      const info = shipmentLookupById.get(String(container.shipmentId));
      if (!info) return;
      const status = getDashboardStatusColumn({ plannedETD: info.plannedETD }, container);
      if (status !== 'At the Port' && status !== 'On Transit') return;
      const containerId = String(container._id);
      const shipmentContainers = containerMap.get(String(container.shipmentId)) || [];
      const childIndex = shipmentContainers.findIndex((c) => String(c._id) === containerId);
      const childShipmentNo = childIndex >= 0 ? `${info.shipmentNo}-${childIndex + 1}` : info.shipmentNo;
      const splitCount = getShipmentSplitCount(info, shipmentContainers);
      const entry = {
        _id: info._id,
        containerId,
        shipmentNo: childShipmentNo,
        shipmentIndex: childIndex >= 0 ? childIndex : null,
        commercialInvoiceNo: container?.actual?.commercialInvoiceNo || null,
        supplier: info.supplier,
        fcl: getDashboardChildFcl(info, container, splitCount),
      };
      if (status === 'At the Port') shipmentMovement.atPort.push(entry);
      else shipmentMovement.onTransit.push(entry);
    });

    // ── FAS Dashboard: Pending vs Completed per sub-process ─────────────────
    const fasPendingCompletedDashboard = (() => {
      const tiles = {
        pendingDocuments: { key: 'pendingDocuments', label: 'Pending Documents', pending: 0, completed: 0, pendingShipments: [] },
        pendingAdvanceRequestApproval: { key: 'pendingAdvanceRequestApproval', label: 'Pending Advance Request Approval', pending: 0, completed: 0, pendingShipments: [] },
        pendingClearingAdvanceProcessApproval: { key: 'pendingClearingAdvanceProcessApproval', label: 'Pending Clearing Advance Process Approval', pending: 0, completed: 0, pendingShipments: [] },
        pendingPaymentCosting: { key: 'pendingPaymentCosting', label: 'Pending Payment Costing', pending: 0, completed: 0, pendingShipments: [] },
      };

      containers.forEach((container) => {
        const actual = container.actual || {};

        // Pending Documents: receiver is bank AND final contract not yet received.
        if (classifyFasReceiver(actual) === 'bank') {
          const finalContractReceived = !!(actual.documentsReleasedDate || actual.documentsReleasedDocumentUrl);
          if (finalContractReceived) tiles.pendingDocuments.completed++;
          else {
            tiles.pendingDocuments.pending++;
            addPendingShipment(tiles.pendingDocuments, container);
          }
        }

        // Clearance Advance, gated to containers with an actual request on file.
        const caStatus = actual.clearingAdvanceApproval?.status || null;
        const hasClearingAdvance = !!caStatus || hasSavedClearingAdvanceData(container);
        if (hasClearingAdvance) {
          const isApproved = caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.approved;

          // Pending Advance Request Approval: request submitted, FAS review not yet done (first stage).
          if (caStatus === CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas) {
            tiles.pendingAdvanceRequestApproval.pending++;
            addPendingShipment(tiles.pendingAdvanceRequestApproval, container);
          }
          if (isApproved) tiles.pendingAdvanceRequestApproval.completed++;

          // Pending Clearing Advance Process Approval: request submitted, FAS Manager hasn't
          // given final approval yet — spans the whole pipeline (both review stages).
          if (!isApproved) {
            tiles.pendingClearingAdvanceProcessApproval.pending++;
            addPendingShipment(tiles.pendingClearingAdvanceProcessApproval, container);
          } else {
            tiles.pendingClearingAdvanceProcessApproval.completed++;
          }
        }

        // Pending Payment Costing: payment allocation submitted, FAS Manager hasn't approved yet.
        const paStatus = actual.paymentAllocationApproval?.status || null;
        if (paStatus === 'pending_fas_manager') {
          tiles.pendingPaymentCosting.pending++;
          addPendingShipment(tiles.pendingPaymentCosting, container);
        }
        if (paStatus === 'approved') tiles.pendingPaymentCosting.completed++;
      });

      return Object.values(tiles);
    })();

    // ── Logistics Dashboard: Pending vs Completed per sub-process ───────────
    const logisticsPendingCompletedDashboard = (() => {
      const tiles = {
        documentWaiting: { key: 'documentWaiting', label: 'Awaiting Commercial Document', pending: 0, completed: 0, pendingShipments: [] },
        pendingAdvanceClearance: { key: 'pendingAdvanceClearance', label: 'Clearing Advance Pending', pending: 0, completed: 0, pendingShipments: [] },
        pendingClearanceAdvanceProcess: { key: 'pendingClearanceAdvanceProcess', label: 'Clearance Advance Allocation Pending', pending: 0, completed: 0, pendingShipments: [] },
        pendingTransportationArrangement: { key: 'pendingTransportationArrangement', label: 'Transportation Pending', pending: 0, completed: 0, pendingShipments: [] },
      };

      containers.forEach((container) => {
        const actual = container.actual || {};

        // Document Waiting — same condition as FAS "Pending Documents": receiver is bank AND
        // final contract not yet received.
        if (classifyFasReceiver(actual) === 'bank') {
          const finalContractReceived = !!(actual.documentsReleasedDate || actual.documentsReleasedDocumentUrl);
          if (finalContractReceived) tiles.documentWaiting.completed++;
          else {
            tiles.documentWaiting.pending++;
            addPendingShipment(tiles.documentWaiting, container);
          }
        }

        // Pending Advance Clearance — shipment has arrived but clearance advance hasn't been
        // requested yet. Uses clearingAdvanceApproval.submittedAt (the actively-used workflow
        // field) rather than the legacy advanceRequestDate, which is never populated in real
        // data (confirmed 0/102 containers) and made this tile permanently 100% pending.
        const clearingAdvanceRequested = !!actual.clearingAdvanceApproval?.submittedAt;
        if (hasExplicitShipmentArrival(container)) {
          if (clearingAdvanceRequested) tiles.pendingAdvanceClearance.completed++;
          else {
            tiles.pendingAdvanceClearance.pending++;
            addPendingShipment(tiles.pendingAdvanceClearance, container);
          }
        }

        // Pending Clearance Advance Process — advance requested, final contract not yet received.
        // Same "final contract received" definition as Document Waiting above (line ~1010) —
        // documentsReleasedDate OR documentsReleasedDocumentUrl, not date alone. A container
        // whose release was recorded via document upload without the date field would otherwise
        // never register as received here, keeping it stuck "pending" forever.
        if (clearingAdvanceRequested) {
          const finalContractReceived = !!(actual.documentsReleasedDate || actual.documentsReleasedDocumentUrl);
          if (finalContractReceived) tiles.pendingClearanceAdvanceProcess.completed++;
          else {
            tiles.pendingClearanceAdvanceProcess.pending++;
            addPendingShipment(tiles.pendingClearanceAdvanceProcess, container);
          }
        }

        // Pending Transportation Arrangement — final contract received, transportation not yet
        // arranged. Uses transportationBooked (the actively-used array, 44/102 containers) rather
        // than the legacy transportArrangedDate single field, which is never populated (0/102).
        // Same OR gate as above — documentsReleasedDate alone previously excluded containers
        // released via documentsReleasedDocumentUrl only, dropping them out of this tile entirely
        // (counted as neither pending nor completed).
        if (actual.documentsReleasedDate || actual.documentsReleasedDocumentUrl) {
          const transportationArranged = Array.isArray(actual.transportationBooked) && actual.transportationBooked.length > 0;
          if (transportationArranged) tiles.pendingTransportationArrangement.completed++;
          else {
            tiles.pendingTransportationArrangement.pending++;
            addPendingShipment(tiles.pendingTransportationArrangement, container);
          }
        }
      });

      return Object.values(tiles);
    })();

    res.status(200).json({
      kpis: {
        totalShipments: total,
        completedShipments: completed,
        inProgressShipments: inProgress,
        underClearanceShipments: underClearance,
        totalPaymentExposure: paymentSummary.balanceAmount
      },
      departmentCharts,
      departmentJobPending,
      fasPendingCompletedDashboard,
      logisticsPendingCompletedDashboard,
      fasDashboard,
      warehouseDashboard,
      storekeeperDashboard,
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
        supplierAvgFcByPo: buildSupplierAvgFcRowsByPo(shipments),
        supplierYearlyQty: Array.from(supplierYearlyQtyMap.values())
      },
      statusPivot,
      statusPivotByItem,
      poNumbers,
      shipmentMovement
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
