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

// ── Storage Arrival "Report Received" Excel export ───────────────────────────
// Builds one row per received storage split (a split with a GRN) across all
// shipments, matching the RH "Shipment Status Summary" layout.
const STORAGE_ARRIVAL_REPORT_COLUMNS = [
  { header: 'Sl No', key: 'slNo', width: 8 },
  { header: 'Shipment No.', key: 'shipmentNo', width: 18 },
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Supplier', key: 'supplier', width: 20 },
  { header: 'Country', key: 'country', width: 14 },
  { header: 'Item description', key: 'itemDescription', width: 28 },
  { header: 'FCL', key: 'fcl', width: 8 },
  { header: 'Bag', key: 'bag', width: 10 },
  { header: 'Ton', key: 'ton', width: 10 },
  { header: 'ETA', key: 'eta', width: 12 },
  { header: 'COM IN NO', key: 'comInNo', width: 18 },
  { header: 'BLNo', key: 'blNo', width: 20 },
  { header: 'GRN', key: 'grn', width: 18 },
  { header: 'Qty', key: 'qty', width: 10 },
  { header: 'WH', key: 'wh', width: 12 },
  { header: 'BATCH', key: 'batch', width: 12 },
  { header: 'P.Date', key: 'pDate', width: 12 },
  { header: 'E.Date', key: 'eDate', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Shortage Bag', key: 'shortageBags', width: 12 },
  { header: 'Remarks', key: 'remarks', width: 22 },
];

const buildStorageArrivalReportRows = async (user = null) => {
  let labelSet = null;
  let isStorekeeperUser = false;
  if (user && normalizeRole(user.role || '') === 'storekeeper') {
    isStorekeeperUser = true;
    const assignedWarehouses = await Warehouse.find({ assignedStorekeepers: user._id, status: 'Active' })
      .select('name code').lean();
    const labels = assignedWarehouses.map((w) => {
      const code = String(w.code || '').trim();
      const name = String(w.name || '').trim();
      return code ? `${name} - ${code}` : name;
    });
    labelSet = new Set(labels);
  }

  const shipments = await Shipment.find({})
    .populate('supplierId', 'name')
    .populate('itemId', 'description')
    .sort({ createdAt: -1, orderDate: -1 })
    .lean();

  const shipmentIds = shipments.map((shipment) => shipment._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .sort({ createdAt: 1 })
    .lean();

  const containersByShipment = new Map();
  containers.forEach((container) => {
    const key = String(container.shipmentId);
    if (!containersByShipment.has(key)) containersByShipment.set(key, []);
    containersByShipment.get(key).push(container);
  });

  const normalizeSerial = (value) =>
    String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

  const rows = [];
  let slNo = 0;

  shipments.forEach((shipment) => {
    const shipmentContainers = containersByShipment.get(String(shipment._id)) || [];
    shipmentContainers.forEach((container) => {
      const actual = container?.actual || {};
      const planned = container?.planned || {};

      if (isStorekeeperUser) {
        const approval = actual.storageAllocationApproval;
        const approvalStatus = approval ? (approval.status || 'draft') : null;
        if (approvalStatus !== null && approvalStatus !== 'pending_warehouse_manager' && approvalStatus !== 'approved') return;
      }

      const splits = Array.isArray(actual.storageSplits) ? actual.storageSplits : [];
      const allocations = Array.isArray(actual.storageAllocations) ? actual.storageAllocations : [];

      const baseRows = allocations.length ? allocations : splits;
      if (!baseRows.length) return;

      baseRows.forEach((base, index) => {
        const whName = String(base?.warehouse || '').trim();
        if (isStorekeeperUser && labelSet && !labelSet.has(whName)) return;

        const key = normalizeSerial(base?.containerSerialNo);
        const split = (key && splits.find((s) => normalizeSerial(s?.containerSerialNo) === key)) || splits[index] || {};
        const alloc = allocations.length ? base : {};

        const received = !!(String(split.grn || '').trim() || String(split.batch || '').trim() || split.receivedOnDate);

        slNo += 1;
        rows.push({
          slNo,
          shipmentNo: shipment.shipmentNo || shipment.poNumber || '',
          date: formatDateValue(shipment.orderDate) || '',
          supplier: shipment.supplierId?.name || shipment.supplierName || '',
          country: shipment.countryOfOrigin || '',
          itemDescription: shipment.itemId?.description || shipment.itemDescription || '',
          fcl: actual.FCL ?? planned.FCL ?? '',
          bag: alloc.bags ?? split.bags ?? actual.bags ?? planned.bags ?? shipment.bags ?? '',
          ton: actual.qtyMT ?? planned.qtyMT ?? '',
          eta: formatDateValue(actual.updatedETA || planned.eta || shipment.plannedETA) || '',
          comInNo: actual.commercialInvoiceNo || '',
          blNo: actual.BLNo || '',
          grn: split.grn || '',
          qty: received ? (split.bags ?? '') : '',
          wh: split.warehouse || alloc.warehouse || '',
          batch: split.batch || '',
          pDate: formatDateValue(split.productionDate) || '',
          eDate: formatDateValue(split.expiryDate) || '',
          status: received ? 'Arrived' : 'Pending',
          shortageBags: split.shortageBags ?? 0,
          remarks: split.remarks || '',
        });
      });
    });
  });

  return rows;
};

exports.getStorageArrivalReportData = async (req, res) => {
  try {
    const rows = await buildStorageArrivalReportRows(req.user);
    const generatedAt = new Date();
    return res.json({
      rows,
      generatedAt: generatedAt.toISOString(),
    });
  } catch (err) {
    console.error('getStorageArrivalReportData error:', err);
    return res.status(500).json({ message: 'Unable to fetch storage arrival report data' });
  }
};

// ── FAS Document Tracking report (Point 2) ───────────────────────────────────
const buildFasDocumentTrackingRows = async () => {
  const shipments = await Shipment.find({})
    .populate('supplierId', 'name')
    .sort({ createdAt: -1, orderDate: -1 })
    .lean();
  const shipmentIds = shipments.map((s) => s._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .sort({ createdAt: 1 })
    .lean();
  const byShipment = new Map();
  containers.forEach((c) => {
    const key = String(c.shipmentId);
    if (!byShipment.has(key)) byShipment.set(key, []);
    byShipment.get(key).push(c);
  });

  const rows = [];
  let slNo = 0;
  shipments.forEach((shipment) => {
    const shipmentContainers = byShipment.get(String(shipment._id)) || [];
    const status = getShipmentOverallStatus(shipment, shipmentContainers);
    // Point 20: list every shipment in the FAS Activity Status report (previously only
    // "On Transit" or later shipments were included, which hid most of them).
    // One row per container with document-tracking data; fall back to a single row.
    const tracked = shipmentContainers.filter((c) => c?.actual);
    const source = tracked.length ? tracked : [{ actual: {} }];
    source.forEach((container) => {
      slNo += 1;
      rows.push(
        mapFasDocumentTrackingRow({
          slNo,
          shipment,
          actual: container.actual || {},
          status,
          formatDate: (d) => formatDateValue(d) || '',
        })
      );
    });
  });
  return rows;
};

exports.getFasDocumentTrackingData = async (req, res) => {
  try {
    const rows = await buildFasDocumentTrackingRows();
    return res.json({ rows, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('getFasDocumentTrackingData error:', err);
    return res.status(500).json({ message: 'Unable to fetch FAS document tracking data' });
  }
};

exports.downloadFasDocumentTrackingReport = async (req, res) => {
  try {
    const rows = await buildFasDocumentTrackingRows();
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const totalColumns = FAS_DOC_TRACKING_COLUMNS.length;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('FAS Document Tracking', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    const border = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const fullBorder = { top: border, bottom: border, left: border, right: border };

    worksheet.columns = FAS_DOC_TRACKING_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    const titleRow = worksheet.addRow(['Royal Horizon Group']);
    const subtitleRow = worksheet.addRow(['FAS Department - Document Tracking Summary']);
    const metaRow = worksheet.addRow([
      `Downloaded By: ${downloadedBy}`,
      ...Array.from({ length: totalColumns - 2 }, () => ''),
      `Downloaded At: ${downloadedAt}`,
    ]);
    const headerRow = worksheet.addRow(FAS_DOC_TRACKING_COLUMNS.map((c) => c.header));

    worksheet.mergeCells(1, 1, 1, totalColumns);
    worksheet.mergeCells(2, 1, 2, totalColumns);
    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(2, 1).font = { name: 'Calibri', size: 12, bold: true };
    titleRow.height = 20; subtitleRow.height = 18; metaRow.height = 16; headerRow.height = 22;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = fullBorder;
    });
    rows.forEach((row) => {
      const dataRow = worksheet.addRow(FAS_DOC_TRACKING_COLUMNS.map((c) => row[c.key] ?? ''));
      dataRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = fullBorder;
      });
    });

    const filename = `fas-document-tracking-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('downloadFasDocumentTrackingReport error:', err);
    return res.status(500).json({ message: 'Unable to generate FAS document tracking report' });
  }
};

// ── Shipment Status Summary RH report ─────────────────────────────────────────
// Row mapping/columns live in ./rh-status-summary.helpers.js — this just fetches the
// data and reuses the same Excel-export layout as the other reports above.
const buildRhStatusSummaryReportRows = async () => {
  const shipments = await Shipment.find({})
    .populate('supplierId', 'name')
    .populate('itemId', 'description')
    .sort({ createdAt: -1, orderDate: -1 })
    .lean();
  const shipmentIds = shipments.map((s) => s._id);
  const containers = await Container.find({ shipmentId: { $in: shipmentIds } })
    .sort({ createdAt: 1 })
    .lean();
  const containersByShipment = new Map();
  containers.forEach((c) => {
    const key = String(c.shipmentId);
    if (!containersByShipment.has(key)) containersByShipment.set(key, []);
    containersByShipment.get(key).push(c);
  });
  return buildRhStatusSummaryRows(shipments, containersByShipment, (d) => formatDateValue(d) || '');
};

exports.getRhStatusSummaryData = async (req, res) => {
  try {
    const rows = await buildRhStatusSummaryReportRows();
    return res.json({ rows, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('getRhStatusSummaryData error:', err);
    return res.status(500).json({ message: 'Unable to fetch shipment status summary RH data' });
  }
};

exports.downloadRhStatusSummaryReport = async (req, res) => {
  try {
    const rows = await buildRhStatusSummaryReportRows();
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const totalColumns = RH_STATUS_SUMMARY_COLUMNS.length;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shipment Status Summary RH', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    const border = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const fullBorder = { top: border, bottom: border, left: border, right: border };

    worksheet.columns = RH_STATUS_SUMMARY_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    const titleRow = worksheet.addRow(['Royal Horizon Group']);
    const subtitleRow = worksheet.addRow(['Shipment Status Summary RH']);
    const metaRow = worksheet.addRow([
      `Downloaded By: ${downloadedBy}`,
      ...Array.from({ length: totalColumns - 2 }, () => ''),
      `Downloaded At: ${downloadedAt}`,
    ]);
    const headerRow = worksheet.addRow(RH_STATUS_SUMMARY_COLUMNS.map((c) => c.header));

    worksheet.mergeCells(1, 1, 1, totalColumns);
    worksheet.mergeCells(2, 1, 2, totalColumns);
    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(2, 1).font = { name: 'Calibri', size: 12, bold: true };
    titleRow.height = 20; subtitleRow.height = 18; metaRow.height = 16; headerRow.height = 22;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = fullBorder;
    });
    rows.forEach((row) => {
      const dataRow = worksheet.addRow(RH_STATUS_SUMMARY_COLUMNS.map((c) => row[c.key] ?? ''));
      dataRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = fullBorder;
      });
    });

    const filename = `shipment-status-summary-rh-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('downloadRhStatusSummaryReport error:', err);
    return res.status(500).json({ message: 'Unable to generate shipment status summary RH report' });
  }
};

exports.downloadStorageArrivalReport = async (req, res) => {
  try {
    const rows = await buildStorageArrivalReportRows(req.user);
    const downloadedBy = req.user?.name || 'Royal Horizon User';
    const downloadedAt = formatDateTimeValue(new Date());
    const totalColumns = STORAGE_ARRIVAL_REPORT_COLUMNS.length;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report Received', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    const border = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const fullBorder = { top: border, bottom: border, left: border, right: border };

    worksheet.columns = STORAGE_ARRIVAL_REPORT_COLUMNS.map((column) => ({
      key: column.key,
      width: column.width,
    }));

    const titleRow = worksheet.addRow(['Royal Horizon Group']);
    const subtitleRow = worksheet.addRow(['Report Received']);
    const metaRow = worksheet.addRow([
      `Downloaded By: ${downloadedBy}`,
      ...Array.from({ length: totalColumns - 2 }, () => ''),
      `Downloaded At: ${downloadedAt}`,
    ]);
    const headerRow = worksheet.addRow(STORAGE_ARRIVAL_REPORT_COLUMNS.map((column) => column.header));

    worksheet.mergeCells(1, 1, 1, totalColumns);
    worksheet.mergeCells(2, 1, 2, totalColumns);

    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(2, 1).font = { name: 'Calibri', size: 12, bold: true };
    titleRow.height = 20;
    subtitleRow.height = 18;
    metaRow.height = 16;
    headerRow.height = 22;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = fullBorder;
    });

    rows.forEach((row) => {
      const dataRow = worksheet.addRow(STORAGE_ARRIVAL_REPORT_COLUMNS.map((column) => row[column.key] ?? ''));
      dataRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = fullBorder;
      });
    });

    const filename = `report-received-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('downloadStorageArrivalReport error:', err);
    return res.status(500).json({ message: 'Unable to generate storage arrival report' });
  }
};

// Generic Excel export for any dashboard chart/card. Two shapes, both optional but at least one
// required: { imageBase64 } — a PNG data URL of the actual rendered Chart.js canvas, embedded
// directly so the workbook shows the SAME graphic the user sees on screen (not just its numbers);
// { columns, rows } — plain table data (used alone for table-only cards like Status Snapshot
// that have no canvas, or underneath the image for chart cards that have both).
exports.exportDashboardChart = async (req, res) => {
  try {
    const { title, columns, rows, imageBase64 } = req.body || {};
    const hasTable = Array.isArray(columns) && columns.length && Array.isArray(rows);
    if (!title || (!hasTable && !imageBase64)) {
      return res.status(400).json({ message: 'title and either (columns[] + rows[]) or imageBase64 are required' });
    }
    const totalColumns = hasTable ? columns.length : 6;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(String(title).slice(0, 31) || 'Chart', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    const border = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const fullBorder = { top: border, bottom: border, left: border, right: border };

    if (hasTable) worksheet.columns = columns.map(() => ({ width: 22 }));

    const titleRow = worksheet.addRow(['Royal Horizon Group']);
    const subtitleRow = worksheet.addRow([String(title)]);

    worksheet.mergeCells(1, 1, 1, totalColumns);
    worksheet.mergeCells(2, 1, 2, totalColumns);
    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true };
    worksheet.getCell(2, 1).font = { name: 'Calibri', size: 12, bold: true };
    titleRow.height = 20;
    subtitleRow.height = 18;

    let nextRow = 3;
    if (imageBase64) {
      const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(imageBase64);
      if (match) {
        const extension = match[1] === 'jpeg' ? 'jpeg' : 'png';
        const imageId = workbook.addImage({ base64: imageBase64, extension });
        // Fixed 720x400px placement (~19 rows tall at default row height) — table (if any)
        // resumes after it so both the picture and its numbers are in one sheet.
        worksheet.addImage(imageId, { tl: { col: 0, row: nextRow }, ext: { width: 720, height: 400 } });
        nextRow += 21;
      }
    }

    if (hasTable) {
      const headerRow = worksheet.getRow(nextRow + 1);
      columns.forEach((col, i) => { headerRow.getCell(i + 1).value = col; });
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = fullBorder;
      });
      headerRow.commit();

      rows.forEach((row, rIdx) => {
        const dataRow = worksheet.getRow(nextRow + 2 + rIdx);
        const values = Array.isArray(row) ? row : columns.map((c) => row?.[c] ?? '');
        values.forEach((v, i) => { dataRow.getCell(i + 1).value = v; });
        dataRow.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 11 };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = fullBorder;
        });
        dataRow.commit();
      });
    }

    const filename = `${String(title).replace(/[^a-z0-9_-]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('exportDashboardChart error:', err);
    return res.status(500).json({ message: 'Unable to export chart' });
  }
};
