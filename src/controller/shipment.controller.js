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
  getDashboardPivotLabel,
  getDashboardStatusColumn,
  getDisplayStageName,
  getMeaningfulNumber,
  getPaymentAllocationSummaryLines,
  getPaymentCostingSummaryLines,
  getReportMonthFilterValues,
  getScheduleActorLabel,
  getScheduledShipmentId,
  getShipmentMonthLabel,
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

Object.assign(exports, require('./shipment-actions.controller.js'));



Object.assign(exports, require('./shipment-approvals.controller.js'));



Object.assign(exports, require('./shipment-query.controller.js'));


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
      const sLineItems = Array.isArray(s.lineItems) ? s.lineItems : [];
      const itemDesc = s.itemId?.description
        || joinDistinctLineItemValues(sLineItems, 'itemDescription')
        || s.itemDescription
        || 'Unknown Item';
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
        list.push({ _id: shipment._id, containerId, shipmentNo, supplier: shipment.supplierId?.name || shipment.supplierName || null });
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
          transportationBooked.forEach((row) => {
            const bookedWarehouse = String(row?.warehouse || '').trim();
            const warehouse = bookedWarehouse || splitWarehouseBySerial.get(normalizeSerialForDashboard(row?.containerSerialNo)) || '';
            if (!warehouse || !labelSet.has(normalizeWarehouseLabelForMatch(warehouse))) return;
            const serialKey = normalizeSerialForDashboard(row.containerSerialNo);
            if (serialKey) {
              if (allocatedKeysSeen.has(serialKey)) return;
              allocatedKeysSeen.add(serialKey);
            }
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

        splits.forEach((split) => {
          if (!labelSet.has(normalizeWarehouseLabelForMatch(split.warehouse))) return;
          const isReceived = !!(
            String(split.grn || '').trim() ||
            String(split.batch || '').trim() ||
            split.receivedOnDate
          );
          if (!isReceived) return;
          const serialKey = normalizeSerialForDashboard(split.containerSerialNo);
          if (serialKey) {
            if (receivedKeysSeen.has(serialKey)) return;
            receivedKeysSeen.add(serialKey);
          }
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
              transportationBooked.forEach((row) => {
                const bookedWarehouse = String(row?.warehouse || '').trim();
                const warehouse = bookedWarehouse || cSplitWarehouseBySerial.get(normalizeSerialForDashboard(row?.containerSerialNo)) || '';
                if (!warehouse || normalizeWarehouseLabelForMatch(warehouse) !== normalizedLabel) return;
                const serialKey = normalizeSerialForDashboard(row.containerSerialNo);
                if (serialKey) {
                  if (whAllocatedKeysSeen.has(serialKey)) return;
                  whAllocatedKeysSeen.add(serialKey);
                  allocatedContainerBySerial.set(serialKey, c);
                }
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
            (Array.isArray(actual.storageSplits) ? actual.storageSplits : []).forEach((s) => {
              if (normalizeWarehouseLabelForMatch(s.warehouse) !== normalizedLabel) return;
              if (!(String(s.grn || '').trim() || String(s.batch || '').trim() || s.receivedOnDate)) return;
              const serialKey = normalizeSerialForDashboard(s.containerSerialNo);
              if (serialKey) {
                if (whReceivedKeysSeen.has(serialKey)) return;
                whReceivedKeysSeen.add(serialKey);
              }
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
        { _id: s._id, shipmentNo: s.shipmentNo, supplier: s.supplierId?.name || s.supplierName || null },
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
      tile.pendingShipments.push({ _id: info._id, containerId, shipmentNo: childShipmentNo, supplier: info.supplier });
    };

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
        if (clearingAdvanceRequested) {
          const finalContractReceived = !!actual.documentsReleasedDate;
          if (finalContractReceived) tiles.pendingClearanceAdvanceProcess.completed++;
          else {
            tiles.pendingClearanceAdvanceProcess.pending++;
            addPendingShipment(tiles.pendingClearanceAdvanceProcess, container);
          }
        }

        // Pending Transportation Arrangement — final contract received, transportation not yet
        // arranged. Uses transportationBooked (the actively-used array, 44/102 containers) rather
        // than the legacy transportArrangedDate single field, which is never populated (0/102).
        if (actual.documentsReleasedDate) {
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
      .populate('actual.paymentCostingApproval.fasManagerApprovedBy', 'name email role')
      .populate('actual.storageAllocationApproval.submittedBy', 'name email role')
      .populate('actual.storageAllocationApproval.warehouseManagerApprovedBy', 'name email role')
      .populate('actual.storageArrivalApproval.submittedBy', 'name email role')
      .populate('actual.storageArrivalApproval.warehouseManagerApprovedBy', 'name email role');
    const containerIds = containers.map((container) => container._id);

    // Containers sharing the same B/L No (even under a different parent Shipment/PO) are
    // automatically treated as one group — no manual merge action needed. Look up siblings
    // by B/L No once so each container's actualData can show the combined container count.
    const blNosInPlay = [...new Set(
      containers.map((c) => String(c.actual?.BLNo || '').trim()).filter(Boolean)
    )];
    const siblingsByBlNo = new Map();
    if (blNosInPlay.length) {
      const blSiblingContainers = await Container.find({
        'actual.BLNo': { $in: blNosInPlay.map((bl) => new RegExp(`^${bl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      }).populate('shipmentId', 'shipmentNo poNumber');
      blNosInPlay.forEach((bl) => {
        siblingsByBlNo.set(
          bl.toUpperCase(),
          blSiblingContainers.filter((sc) => String(sc.actual?.BLNo || '').trim().toUpperCase() === bl.toUpperCase())
        );
      });
    }

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
            freeStorageDays: a.freeStorageDays,
            commercialDocumentReceivedDate: a.commercialDocumentReceivedDate,
            clearanceRemarks: a.clearanceRemarks,
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
            bankSubmittedToBank: a.bankSubmittedToBank || false,
            daSignedDocumentUrl: a.daSignedDocumentUrl,
            daSignedDocumentName: a.daSignedDocumentName,
            dnSignedDocumentUrl: a.dnSignedDocumentUrl,
            dnSignedDocumentName: a.dnSignedDocumentName,
            skipMurabaha: a.skipMurabaha || false,
            murabahaContractDocumentUrl: a.murabahaContractDocumentUrl,
            murabahaContractDocumentName: a.murabahaContractDocumentName,
            daSubmittedToBank: a.daSubmittedToBank || false,
            daSubmittedToBankDate: a.daSubmittedToBankDate,
            murabahaSubmittedToBank: a.murabahaSubmittedToBank || false,
            submissionPackageDocumentUrl: a.submissionPackageDocumentUrl,
            submissionPackageDocumentName: a.submissionPackageDocumentName,
            bankAdvanceAmountDocumentUrl: a.bankAdvanceAmountDocumentUrl,
            bankAdvanceApprovedDocumentUrl: a.bankAdvanceApprovedDocumentUrl,
            bankAdvanceSubmittedOn: a.bankAdvanceSubmittedOn,
            docToBeReleasedOn: a.docToBeReleasedOn,
            arrivalOn: a.arrivalOn,
            arrivalDocumentUrl: a.arrivalDocumentUrl,
            arrivalDocumentName: a.arrivalDocumentName,
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
            doRemarks: a.doRemarks,
            boePassingDate: a.boePassingDate,
            boePassingDocumentUrl: a.boePassingDocumentUrl,
            boePassingDocumentName: a.boePassingDocumentName,
            boePassingRemarks: a.boePassingRemarks,
            customerInspectionRequired: a.customerInspectionRequired || false,
            dmBarcode: a.dmBarcode,
            dpApprovalDate: a.dpApprovalDate,
            dpApprovalDocumentUrl: a.dpApprovalDocumentUrl,
            dpApprovalDocumentName: a.dpApprovalDocumentName,
            dpApprovalRemarks: a.dpApprovalRemarks,
            tokenReceivedDate: a.tokenReceivedDate,
            municipalityApplicable: a.municipalityApplicable ?? null,
            municipalityDate: a.municipalityDate,
            municipalityDocumentUrl: a.municipalityDocumentUrl,
            municipalityDocumentName: a.municipalityDocumentName,
            municipalityRemarks: a.municipalityRemarks,
            municipalityStatus: a.municipalityStatus || 'open',
            municipalityStatusComment: a.municipalityStatusComment || '',
            municipalityReleasedDate: a.municipalityReleasedDate,
            municipalityResponseRemarks: a.municipalityResponseRemarks,
            municipalityComments: a.municipalityComments,
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
            additionalDocuments: a.additionalDocuments || [],
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

          const blKey = String(a.BLNo || '').trim().toUpperCase();
          const blSiblings = blKey
            ? (siblingsByBlNo.get(blKey) || []).filter((sc) => String(sc._id) !== String(c._id))
            : [];
          if (blSiblings.length) {
            // The B/L Details form's own "No of Containers" field is often re-entered from the
            // shared B/L document itself (so it can read the SAME full total on every item that
            // shares that B/L, not that item's own split) — unreliable for a per-item count.
            // planned.FCL is the item's actual assigned split and is what sizes its own
            // Transportation Arrangement row count, so use that as the trustworthy per-item count.
            const ownCount = Number(c.planned?.FCL) || Number(a.noOfContainers) || 0;
            actualData.mergedTotalContainers =
              ownCount +
              blSiblings.reduce((sum, sc) => sum + (Number(sc.planned?.FCL) || Number(sc.actual?.noOfContainers) || 0), 0);
            actualData.mergedWithShipments = blSiblings.map((sc) => ({
              containerId: sc._id,
              shipmentNo: sc.shipmentId?.shipmentNo || sc.shipmentId?.poNumber || '',
              blNo: sc.actual?.BLNo || '',
              noOfContainers: Number(sc.planned?.FCL) || sc.actual?.noOfContainers || 0,
              // Read-only container serials from the sibling shipment, so the "Manage Shipments"
              // modal can list all containers across the merged B/L group, not just this one's own.
              // Prefer real serials wherever they've been recorded (transportation booking,
              // storage splits, packing list); fall back to numbered placeholders so the
              // merged list always reflects the sibling's actual container count, even before
              // any of its own container-level detail has been saved.
              containerSerials: (() => {
                const fromTransport = (Array.isArray(sc.actual?.transportationBooked) ? sc.actual.transportationBooked : [])
                  .map((row) => row?.containerSerialNo)
                  .filter(Boolean);
                if (fromTransport.length) return fromTransport;
                const fromStorage = (Array.isArray(sc.actual?.storageSplits) ? sc.actual.storageSplits : [])
                  .map((row) => row?.containerSerialNo)
                  .filter(Boolean);
                if (fromStorage.length) return fromStorage;
                const fromPacking = (sc.actual?.packagingList?.containerInfo || [])
                  .map((row) => row?.container_number)
                  .filter(Boolean);
                if (fromPacking.length) return fromPacking;
                const count = Number(sc.planned?.FCL) || Number(sc.actual?.noOfContainers) || 0;
                return Array.from({ length: count }, (_, idx) => `Container ${idx + 1}`);
              })(),
            }));
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
        signedArrivalDocument,
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
        signedDaSigned,
        signedDnSigned,
        signedMurabahaContract,
        signedSubmissionPackage,
      ] = await Promise.all([
        toSignedDocument(row.costSheetBookingDocumentUrl, row.costSheetBookingDocumentName),
        toSignedDocument(row.blDocumentUrl, row.blDocumentName),
        toSignedDocument(row.commercialInvoiceDocumentUrl, row.commercialInvoiceDocumentName),
        toSignedDocument(row.packagingListDocumentUrl, row.packagingListDocumentName),
        toSignedDocument(row.inwardCollectionAdviceDocumentUrl, row.inwardCollectionAdviceDocumentName),
        toSignedDocument(row.murabahaContractSubmittedDocumentUrl, row.murabahaContractSubmittedDocumentName),
        toSignedDocument(row.documentsReleasedDocumentUrl, row.documentsReleasedDocumentName),
        toSignedDocument(row.arrivalNoticeDocumentUrl, row.arrivalNoticeDocumentName),
        toSignedDocument(row.arrivalDocumentUrl, row.arrivalDocumentName),
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
        toSignedDocument(row.daSignedDocumentUrl, row.daSignedDocumentName),
        toSignedDocument(row.dnSignedDocumentUrl, row.dnSignedDocumentName),
        toSignedDocument(row.murabahaContractDocumentUrl, row.murabahaContractDocumentName),
        toSignedDocument(row.submissionPackageDocumentUrl, row.submissionPackageDocumentName),
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
      row.arrivalDocumentUrl = signedArrivalDocument.url;
      row.arrivalDocumentName = signedArrivalDocument.name;
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
      row.daSignedDocumentUrl = signedDaSigned.url;
      row.daSignedDocumentName = signedDaSigned.name;
      row.dnSignedDocumentUrl = signedDnSigned.url;
      row.dnSignedDocumentName = signedDnSigned.name;
      row.murabahaContractDocumentUrl = signedMurabahaContract.url;
      row.murabahaContractDocumentName = signedMurabahaContract.name;
      row.submissionPackageDocumentUrl = signedSubmissionPackage.url;
      row.submissionPackageDocumentName = signedSubmissionPackage.name;
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

      const [costSheetBookings, additionalClearingAdvanceRequests, qualityRows, qualityReports, paymentAllocations, paymentCostings, storageSplits, additionalDocuments] = await Promise.all([
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
        Promise.all((row.additionalDocuments || []).map(async (doc) => {
          const plainDoc = toPlainObject(doc);
          const signed = await toSignedDocument(doc.fileUrl, doc.fileName);
          return {
            ...plainDoc,
            fileUrl: signed.url,
            fileName: signed.name,
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
      row.additionalDocuments = additionalDocuments;
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

Object.assign(exports, require('./shipment-extraction.controller.js'));
const { normalizeDpwCargoExtraction } = require('./shipment-extraction.controller.js');


Object.assign(exports, require('./shipment-misc.controller.js'));


Object.assign(exports, require('./shipment-reports.controller.js'));

if (process.env.NODE_ENV === 'test') {
  exports.__test = {
    buildDashboardRStatusMetrics,
    buildDashboardStatusPivot,
    normalizeDpwCargoExtraction,
    applyCommercialInvoiceDocumentUpload,
    applyLogisticsScalarFields,
  };
}
