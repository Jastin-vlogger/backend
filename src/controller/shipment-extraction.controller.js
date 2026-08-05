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

    // Bill-no/packaging-list extraction is its OWN Python service, separate from the LPO/quality
    // report extraction used by extractFromDocuments — must use its own dedicated env vars, not
    // silently fall back to PYTHON_EXTRACTION_API_URL (a different service on a different port).
    const baseUrl = (process.env.PYTHON_BILLNO_API_URL || process.env.PYTHON_EXTRACTION_API_URL || 'http://localhost:8096').replace(/\/$/, '');
    const path = process.env.PYTHON_BILLNO_PATH || '/purchase-tracker/fetch-details';
    const endpoint = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

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

exports.normalizeDpwCargoExtraction = normalizeDpwCargoExtraction;
