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
      return cleaned.join(', ');
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
        ? uniqueJoin(derivedLineItems.map((item) => item.itemDescription), itemDescription || '')
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

    // 3️⃣ Recalculate shipment totals and save noOfShipments.
    // plannedQtyMT must reflect every real container on the shipment, not just whichever
    // subset was submitted in this save — callers now correctly omit rows that already
    // have real actual/BL data (status !== "Planned"), so summing only `currentPlannedMT`
    // would silently drop those containers' quantity from the shipment total.
    const retainedQtyMT = existingAllContainers
      .filter((container) => container.status !== "Planned")
      .reduce((sum, container) => sum + (Number(container.planned?.qtyMT) || 0), 0);
    shipment.plannedQtyMT = retainedQtyMT + currentPlannedMT;
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

// Deletes a single scheduled ("Planned") container. Only allowed while the row is still
// "ETA yet to due" (status === "Planned", no real BL/actual data attached) — once a row
// has been actualized it must never be deletable from here. Recomputes noOfShipments from
// the real remaining container count so it can never drift, unlike a manual DB delete.
exports.deletePlannedContainer = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: "Container not found" });

    if (container.status !== "Planned" || hasMeaningfulActualData(container)) {
      return res.status(400).json({
        message: "This shipment has already progressed past scheduling and cannot be deleted here."
      });
    }

    const shipmentId = container.shipmentId;
    await Container.deleteOne({ _id: container._id });

    const shipment = await Shipment.findById(shipmentId);
    if (shipment) {
      const remainingCount = await Container.countDocuments({ shipmentId });
      shipment.noOfShipments = remainingCount;
      shipment.assumedContainerCount = remainingCount;
      await shipment.save();
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'Purchase',
      entity: 'Container',
      entityId: container._id,
      action: 'DeletePlannedContainer',
      before: cloneForAudit(container.toObject()),
      after: {},
      remarks: 'Scheduled (Planned) container deleted before actualization',
    });

    res.json({
      message: 'Scheduled shipment deleted successfully.',
      noOfShipments: shipment?.noOfShipments ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message, error: err.message });
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
      submitClearingAdvanceForApproval,
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
        singleItem: parsedStorageAllocationDecision.singleItem !== false,
        allocateSameWarehouse: parsedStorageAllocationDecision.allocateSameWarehouse !== false,
        warehousesSelected: Array.isArray(parsedStorageAllocationDecision.warehousesSelected)
          ? parsedStorageAllocationDecision.warehousesSelected
          : [],
        itemAllocations: Array.isArray(parsedStorageAllocationDecision.itemAllocations)
          ? parsedStorageAllocationDecision.itemAllocations.map((item) => ({
              itemName: item.itemName || '',
              expectedContainers: Number(item.expectedContainers) || 0,
              allocations: Array.isArray(item.allocations)
                ? item.allocations.map((a) => ({
                    warehouse: a.warehouse || '',
                    containersAssigned: Number(a.containersAssigned) || 0,
                  }))
                : [],
            }))
          : [],
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
      // A plain Save by whoever entered the cost sheet (Logistic) is the real "submitted for
      // FAS review" event — FAS needs to know who to hold accountable, and that person is the
      // one who saved the data, not whoever eventually clicks Approve. Record it here, once,
      // the first time this container has real cost sheet data — never overwrite an existing
      // submission (that would credit a later editor/approver for someone else's submission).
      if (
        (container.actual.clearingAdvanceApproval?.status || CLEARING_ADVANCE_APPROVAL_STATUSES.draft) ===
          CLEARING_ADVANCE_APPROVAL_STATUSES.draft &&
        hasSavedClearingAdvanceData(container)
      ) {
        container.actual.clearingAdvanceApproval = buildClearingAdvancePendingApproval(req.user);
      }

      // Cheque/voucher details are only REQUIRED, and the approval status only advances to
      // "pending FAS", when this save is an explicit submit-for-approval (now triggered from
      // the Approve button, not every row edit). A plain edit of cost sheet rows should just
      // save the rows and leave whatever payment details/approval state already exist alone.
      const isSubmittingForApproval = submitClearingAdvanceForApproval === true || submitClearingAdvanceForApproval === 'true';
      const hasPaymentDetailsInPayload =
        clearingAdvancePaymentDetails !== undefined ||
        chequeNo !== undefined || chequeDate !== undefined || paymentVoucherNo !== undefined || transactionId !== undefined;

      if (isSubmittingForApproval || hasPaymentDetailsInPayload) {
        const normalizedPaymentDetails = {
          chequeNo: String(chequeNo ?? parsedClearingAdvancePaymentDetails.chequeNo ?? '').trim(),
          chequeDate: chequeDate ?? parsedClearingAdvancePaymentDetails.chequeDate ?? null,
          paymentVoucherNo: String(paymentVoucherNo ?? parsedClearingAdvancePaymentDetails.paymentVoucherNo ?? '').trim(),
          transactionId: String(transactionId ?? parsedClearingAdvancePaymentDetails.transactionId ?? '').trim(),
        };

        if (isSubmittingForApproval) {
          const missingPaymentFields = [];
          if (!normalizedPaymentDetails.chequeNo) missingPaymentFields.push('Cheque No');
          if (!normalizedPaymentDetails.chequeDate) missingPaymentFields.push('Cheque Date');
          if (!normalizedPaymentDetails.paymentVoucherNo) missingPaymentFields.push('Payment Voucher No');
          if (missingPaymentFields.length) {
            return res.status(400).json({
              message: `Please provide ${missingPaymentFields.join(', ')} before submitting clearing advance.`,
            });
          }
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
      }

      if (isSubmittingForApproval) {
        // Never overwrite a submission that already happened (e.g. the combined "submit then
        // approve" flow, triggered from the Approve button when cheque/voucher details are
        // still missing, hits this same code path as the FAS approver — it must not steal
        // credit for a submission the Logistic user already made when they saved the rows).
        const existingApproval = container.actual.clearingAdvanceApproval?.toObject
          ? container.actual.clearingAdvanceApproval.toObject()
          : container.actual.clearingAdvanceApproval || {};
        const alreadySubmitted =
          existingApproval.status && existingApproval.status !== CLEARING_ADVANCE_APPROVAL_STATUSES.draft;
        container.actual.clearingAdvanceApproval = alreadySubmitted
          ? { ...existingApproval, status: CLEARING_ADVANCE_APPROVAL_STATUSES.pendingFas }
          : buildClearingAdvancePendingApproval(req.user);
      }
    }

    if (isStorageAllocationSave) {
      container.actual.storageAllocationApproval = buildStorageAllocationPendingApproval(req.user, container.actual.storageAllocationApproval);
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
      const wasSubmittedForApproval = submitClearingAdvanceForApproval === true || submitClearingAdvanceForApproval === 'true';
      await writeAuditLog({
        userId: req.user._id,
        module: 'Logistics',
        entity: 'Container',
        entityId: container._id,
        action: wasSubmittedForApproval ? 'SubmitClearingAdvance' : 'UpdateClearingAdvanceCostSheet',
        before: beforeUpdate,
        after: cloneForAudit(container.toObject()),
        remarks: wasSubmittedForApproval ? 'Clearing advance submitted for FAS approval' : 'Clearing advance cost sheet updated'
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

    await container.populate([
      { path: 'actual.storageAllocationApproval.submittedBy', select: 'name email role' },
      { path: 'actual.storageAllocationApproval.lastUpdatedBy', select: 'name email role' },
      { path: 'actual.storageAllocationApproval.warehouseManagerApprovedBy', select: 'name email role' },
      { path: 'actual.clearingAdvanceApproval.submittedBy', select: 'name email role' },
      { path: 'actual.clearingAdvanceApproval.fasApprovedBy', select: 'name email role' },
    ]);

    res.status(200).json({
      message: 'B/L details updated successfully',
      container
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Point 9: lightweight, isolated update of the editable "No of Bags" values on the
// BL Details → Packing List Confirmation tab. Kept separate from updateBLDetails so a
// bag edit never triggers clearing-advance / storage-allocation approval side effects.
exports.updatePackagingBags = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) {
      return res.status(404).json({ message: 'Container not found' });
    }
    if (!container.actual || !container.actual.packagingList) {
      return res.status(400).json({ message: 'No packaging list available to update' });
    }

    const bags = parseJsonField(req.body.bags) ?? req.body.bags;
    if (!Array.isArray(bags)) {
      return res.status(400).json({ message: 'bags must be an array of { index, no_of_bags }' });
    }

    const containerInfo = container.actual.packagingList.containerInfo;
    if (!Array.isArray(containerInfo) || !containerInfo.length) {
      return res.status(400).json({ message: 'Packaging list has no container rows to update' });
    }

    const beforeUpdate = cloneForAudit(container.toObject());

    bags.forEach(({ index, no_of_bags, container_number }) => {
      const idx = Number(index);
      if (!Number.isInteger(idx) || idx < 0) return;
      const parsedBags = no_of_bags === '' || no_of_bags == null ? null : Number(no_of_bags);
      const safeBags = Number.isFinite(parsedBags) && parsedBags >= 0 ? parsedBags : 0;

      if (idx === containerInfo.length) {
        // Appending a brand-new container row (e.g. "Add Container" — the actual container
        // count can exceed what the original packing list extraction/upload produced).
        containerInfo.push({
          container_number: container_number || '',
          no_of_bags: safeBags,
        });
        // Bulk Update Transportation reads from actual.transportationBooked, which is only
        // ever sized off the original BL extraction — without this it silently never grows
        // when a container is added here later, and the new container can't be booked.
        if (Array.isArray(container.actual.transportationBooked)) {
          container.actual.transportationBooked.push({
            sn: container.actual.transportationBooked.length + 1,
            transactionId: '',
            containerSerialNo: container_number || '',
            transportCompanyName: '',
            warehouse: '',
          });
        }
        return;
      }
      if (idx < containerInfo.length) {
        containerInfo[idx].no_of_bags = no_of_bags === undefined ? (containerInfo[idx].no_of_bags || 0) : safeBags;
        if (container_number !== undefined) {
          const oldNumber = String(containerInfo[idx].container_number || '').trim();
          const newNumber = String(container_number || '').trim();
          containerInfo[idx].container_number = newNumber;

          // Bulk Update Transportation reads container names from actual.transportationBooked —
          // a rename here must propagate there too, or the old (now-wrong) number keeps showing
          // in that modal. Match by the OLD serial first (safer than a blind positional index,
          // since these two arrays can drift apart); fall back to position only when the old
          // number was never set on that transportationBooked row either.
          if (newNumber && newNumber !== oldNumber && Array.isArray(container.actual.transportationBooked)) {
            const booked = container.actual.transportationBooked;
            let matched = oldNumber
              ? booked.filter((row) => String(row?.containerSerialNo || '').trim() === oldNumber)
              : [];
            if (!matched.length && booked[idx] && !String(booked[idx].containerSerialNo || '').trim()) {
              matched = [booked[idx]];
            }
            matched.forEach((row) => { row.containerSerialNo = newNumber; });
          }
        }
      }
    });

    // Keep the packaging summary total consistent with the edited rows.
    container.actual.packagingList.totalBags = containerInfo.reduce(
      (sum, ci) => sum + (Number(ci.no_of_bags) || 0),
      0
    );
    container.markModified('actual.packagingList');
    container.markModified('actual.transportationBooked');
    await container.save();

    await writeAuditLog({
      userId: req.user?._id,
      module: 'Logistics',
      entity: 'Container',
      entityId: container._id,
      action: 'UpdatePackagingBags',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Packing list bag counts updated',
    });

    return res.status(200).json({
      message: 'Packaging bags updated successfully',
      packagingList: container.actual.packagingList,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateFASContainer = async (req, res) => {
  try {
    const files = req.files || {};
    const inwardCollectionAdviceDocument = files?.inwardCollectionAdviceDocument?.[0];
    const daSignedDocument = files?.daSignedDocument?.[0];
    const dnSignedDocument = files?.dnSignedDocument?.[0];
    const murabahaContractDocument = files?.murabahaContractDocument?.[0];
    const murabahaContractSubmittedDocument = files?.murabahaContractSubmittedDocument?.[0];
    const submissionPackageDocument = files?.submissionPackageDocument?.[0];
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
      docToBeReleasedOn,
      bankSubmittedToBank,
      daSignedDocumentUrl,
      daSignedDocumentName,
      dnSignedDocumentUrl,
      dnSignedDocumentName,
      skipMurabaha,
      murabahaContractDocumentUrl,
      murabahaContractDocumentName,
      daSubmittedToBank,
      daSubmittedToBankDate,
      murabahaSubmittedToBank,
      submissionPackageDocumentUrl,
      submissionPackageDocumentName
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
    if (bankSubmittedToBank !== undefined) {
      container.actual.bankSubmittedToBank = bankSubmittedToBank === 'true' || bankSubmittedToBank === true;
      addDocumentTrackerSyncField('bankSubmittedToBank');
    }
    if (skipMurabaha !== undefined) {
      container.actual.skipMurabaha = skipMurabaha === 'true' || skipMurabaha === true;
      addDocumentTrackerSyncField('skipMurabaha');
    }
    if (daSubmittedToBank !== undefined) {
      container.actual.daSubmittedToBank = daSubmittedToBank === 'true' || daSubmittedToBank === true;
      addDocumentTrackerSyncField('daSubmittedToBank');
    }
    if (daSubmittedToBankDate !== undefined) {
      container.actual.daSubmittedToBankDate = toDateOrNull(daSubmittedToBankDate);
      addDocumentTrackerSyncField('daSubmittedToBankDate');
    }
    if (murabahaSubmittedToBank !== undefined) {
      container.actual.murabahaSubmittedToBank = murabahaSubmittedToBank === 'true' || murabahaSubmittedToBank === true;
      addDocumentTrackerSyncField('murabahaSubmittedToBank');
    }
    if (daSignedDocumentUrl !== undefined) {
      container.actual.daSignedDocumentUrl = daSignedDocumentUrl || '';
      addDocumentTrackerSyncField('daSignedDocumentUrl');
    }
    if (daSignedDocumentName !== undefined) {
      container.actual.daSignedDocumentName = daSignedDocumentName || '';
      addDocumentTrackerSyncField('daSignedDocumentName');
    }
    if (dnSignedDocumentUrl !== undefined) {
      container.actual.dnSignedDocumentUrl = dnSignedDocumentUrl || '';
      addDocumentTrackerSyncField('dnSignedDocumentUrl');
    }
    if (dnSignedDocumentName !== undefined) {
      container.actual.dnSignedDocumentName = dnSignedDocumentName || '';
      addDocumentTrackerSyncField('dnSignedDocumentName');
    }
    if (murabahaContractDocumentUrl !== undefined) {
      container.actual.murabahaContractDocumentUrl = murabahaContractDocumentUrl || '';
      addDocumentTrackerSyncField('murabahaContractDocumentUrl');
    }
    if (murabahaContractDocumentName !== undefined) {
      container.actual.murabahaContractDocumentName = murabahaContractDocumentName || '';
      addDocumentTrackerSyncField('murabahaContractDocumentName');
    }
    if (submissionPackageDocumentUrl !== undefined) {
      container.actual.submissionPackageDocumentUrl = submissionPackageDocumentUrl || '';
      addDocumentTrackerSyncField('submissionPackageDocumentUrl');
    }
    if (submissionPackageDocumentName !== undefined) {
      container.actual.submissionPackageDocumentName = submissionPackageDocumentName || '';
      addDocumentTrackerSyncField('submissionPackageDocumentName');
    }

    if (inwardCollectionAdviceDocument) {
      const uploaded = await uploadBufferToS3(inwardCollectionAdviceDocument, 'shipments/document-tracker/inward-advice');
      container.actual.inwardCollectionAdviceDocumentUrl = uploaded.url;
      container.actual.inwardCollectionAdviceDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('inwardCollectionAdviceDocumentUrl', 'inwardCollectionAdviceDocumentName');
    }
    if (daSignedDocument) {
      const uploaded = await uploadBufferToS3(daSignedDocument, 'shipments/document-tracker/da-signed');
      container.actual.daSignedDocumentUrl = uploaded.url;
      container.actual.daSignedDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('daSignedDocumentUrl', 'daSignedDocumentName');
    }
    if (dnSignedDocument) {
      const uploaded = await uploadBufferToS3(dnSignedDocument, 'shipments/document-tracker/dn-signed');
      container.actual.dnSignedDocumentUrl = uploaded.url;
      container.actual.dnSignedDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('dnSignedDocumentUrl', 'dnSignedDocumentName');
    }
    if (murabahaContractDocument) {
      const uploaded = await uploadBufferToS3(murabahaContractDocument, 'shipments/document-tracker/murabaha-contract');
      container.actual.murabahaContractDocumentUrl = uploaded.url;
      container.actual.murabahaContractDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('murabahaContractDocumentUrl', 'murabahaContractDocumentName');
    }
    if (murabahaContractSubmittedDocument) {
      const uploaded = await uploadBufferToS3(murabahaContractSubmittedDocument, 'shipments/document-tracker/murabaha-submitted');
      container.actual.murabahaContractSubmittedDocumentUrl = uploaded.url;
      container.actual.murabahaContractSubmittedDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('murabahaContractSubmittedDocumentUrl', 'murabahaContractSubmittedDocumentName');
    }
    if (submissionPackageDocument) {
      const uploaded = await uploadBufferToS3(submissionPackageDocument, 'shipments/document-tracker/submission-package');
      container.actual.submissionPackageDocumentUrl = uploaded.url;
      container.actual.submissionPackageDocumentName = uploaded.fileName;
      addDocumentTrackerSyncField('submissionPackageDocumentUrl', 'submissionPackageDocumentName');
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
      municipalityApplicable,
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
    if (municipalityApplicable !== undefined) {
      container.actual.municipalityApplicable = municipalityApplicable === '' ? null : String(municipalityApplicable) === 'true';
    }
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

    // Persist Port & Clearance / Regulatory scalar fields that were previously dropped
    // (commercial document received date, free storage days, clearance/DO remarks,
    // customer inspection flag, municipality released date / response / comments).
    applyLogisticsScalarFields(container.actual, req.body);

    const arrivalNoticeDocument = files?.arrivalNoticeDocument?.[0];
    const advanceRequestDocument = files?.advanceRequestDocument?.[0];
    const commercialDocument = files?.commercialDocument?.[0] || files?.commercialDocumentDocument?.[0];
    const arrivalDocument = files?.arrivalDocument?.[0];
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
    if (commercialDocument) {
      const uploaded = await uploadBufferToS3(commercialDocument, 'shipments/logistics/commercial-document');
      container.actual.commercialDocumentDocumentUrl = uploaded.url;
      container.actual.commercialDocumentDocumentName = uploaded.fileName;
    }
    if (arrivalDocument) {
      const uploaded = await uploadBufferToS3(arrivalDocument, 'shipments/logistics/arrival-document');
      container.actual.arrivalDocumentUrl = uploaded.url;
      container.actual.arrivalDocumentName = uploaded.fileName;
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

    // Note: DP Invoice is no longer collected in the Bill Of Entry (BOE) UI, so it is
    // not a mandatory field for saving the boePassingDate section.

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
        transactionId: row.transactionId || '',
        containerSerialNo: row.containerSerialNo || '',
        transportCompanyName: row.transportCompanyName || '',
        warehouse: row.warehouse || '',
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
          (split) => split && split.containerSerialNo === row.containerSerialNo
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
        block: row.block || '',
        storageAvailability: Number(row.storageAvailability) || 0,
        receivedOnDate: toDateOrNull(row.receivedOnDate),
        receivedOnTime: toTimeString(row.receivedOnTime),
        customsInspection: row.customsInspection || 'No',
        grn: row.grn || '',
        batch: row.batch || '',
        productionDate: toDateOrNull(row.productionDate),
        expiryDate: toDateOrNull(row.expiryDate),
        shortageBags: Number(row.shortageBags ?? existing.shortageBags ?? 0) || 0,
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
          (split) => split && split.containerSerialNo === row.containerSerialNo
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

    touchStorageArrivalLastUpdated(container, req.user);

    // Only promote to "Pending Warehouse Manager Approval" once EVERY container in the split
    // has actually been recorded — a single row save must never lock out the remaining rows
    // (the frontend hides Edit and only allows View while status !== draft).
    if (
      (container.actual.storageArrivalApproval?.status || STORAGE_ARRIVAL_APPROVAL_STATUSES.draft) === STORAGE_ARRIVAL_APPROVAL_STATUSES.draft &&
      hasSavedStorageArrivalData(container)
    ) {
      container.actual.storageArrivalApproval = buildStorageArrivalPendingApproval(req.user, container.actual.storageArrivalApproval);
    }

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

    await container.populate([
      { path: 'actual.storageArrivalApproval.submittedBy', select: 'name email role' },
      { path: 'actual.storageArrivalApproval.warehouseManagerApprovedBy', select: 'name email role' },
    ]);

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

    // `rowIndex` is the row's position in the FRONTEND'S canonical display order (derived from
    // transportationBooked), which can drift from this array's own storage order once containers
    // are added/reordered over the shipment's life — writing at raw `storageSplits[rowIndex]`
    // then silently overwrites an unrelated row's data. Identify the target row by container
    // serial instead, which stays correct regardless of either array's order/length.
    const submittedSerial = String(req.body.containerSerialNo || '').trim().toUpperCase();
    let targetIndex = submittedSerial
      ? container.actual.storageSplits.findIndex(
          (split) => String(split?.containerSerialNo || '').trim().toUpperCase() === submittedSerial
        )
      : -1;
    if (targetIndex === -1) {
      targetIndex = container.actual.storageSplits.length;
    }

    // Mongoose persists unset array slots as explicit `null` entries, which then crash any
    // later `.find()`/`.forEach()` reader that assumes every element is an object.
    while (container.actual.storageSplits.length <= targetIndex) {
      container.actual.storageSplits.push({});
    }

    const existing = container.actual.storageSplits[targetIndex] || {};
    container.actual.storageSplits[targetIndex] = {
      containerSerialNo: req.body.containerSerialNo || existing.containerSerialNo || '',
      bags: Number(req.body.bags ?? existing.bags ?? 0) || 0,
      warehouse: req.body.warehouse || existing.warehouse || '',
      block: req.body.block !== undefined ? (req.body.block || '') : (existing.block || ''),
      storageAvailability: Number(req.body.storageAvailability ?? existing.storageAvailability ?? 0) || 0,
      receivedOnDate: req.body.receivedOnDate !== undefined ? toDateOrNull(req.body.receivedOnDate) : existing.receivedOnDate || null,
      receivedOnTime: req.body.receivedOnTime !== undefined ? toTimeString(req.body.receivedOnTime) : existing.receivedOnTime || '',
      customsInspection: req.body.customsInspection || existing.customsInspection || 'No',
      grn: req.body.grn || existing.grn || '',
      batch: req.body.batch || existing.batch || '',
      productionDate: req.body.productionDate !== undefined ? toDateOrNull(req.body.productionDate) : existing.productionDate || null,
      expiryDate: req.body.expiryDate !== undefined ? toDateOrNull(req.body.expiryDate) : existing.expiryDate || null,
      shortageBags: req.body.shortageBags !== undefined ? (Number(req.body.shortageBags) || 0) : (existing.shortageBags || 0),
      remarks: req.body.remarks || existing.remarks || '',
      documentUrl: req.body.documentUrl || existing.documentUrl || '',
      documentName: req.body.documentName || existing.documentName || '',
    };

    const rowUpload = files?.storageRowDocument?.[0];
    if (rowUpload) {
      const uploaded = await uploadBufferToS3(rowUpload, `shipments/storage/row-${targetIndex + 1}`);
      container.actual.storageSplits[targetIndex].documentUrl = uploaded.url;
      container.actual.storageSplits[targetIndex].documentName = uploaded.fileName;
    }

    if (Array.isArray(container.actual.transportationBooked)) {
      container.actual.transportationBooked = container.actual.transportationBooked.map((row) => {
        const matchingStorage = container.actual.storageSplits.find(
          (split) => split && split.containerSerialNo === row.containerSerialNo
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

    touchStorageArrivalLastUpdated(container, req.user);

    // Only promote to "Pending Warehouse Manager Approval" once EVERY container in the split
    // has actually been recorded — a single row save must never lock out the remaining rows
    // (the frontend hides Edit and only allows View while status !== draft).
    if (
      (container.actual.storageArrivalApproval?.status || STORAGE_ARRIVAL_APPROVAL_STATUSES.draft) === STORAGE_ARRIVAL_APPROVAL_STATUSES.draft &&
      hasSavedStorageArrivalData(container)
    ) {
      container.actual.storageArrivalApproval = buildStorageArrivalPendingApproval(req.user, container.actual.storageArrivalApproval);
    }

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
    await container.populate([
      { path: 'actual.storageArrivalApproval.submittedBy', select: 'name email role' },
      { path: 'actual.storageArrivalApproval.warehouseManagerApprovedBy', select: 'name email role' },
    ]);

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
