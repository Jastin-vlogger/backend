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

// Whitelisted dot-path shapes writable inside shipment.q1Report via updateQualityReportField.
// q1Report is a Mixed blob (populated once from Python OCR extraction, no Mongoose schema of
// its own) — without this whitelist any arbitrary nested key could be written by a client.
const Q1_REPORT_EDITABLE_PATH_PATTERNS = [
  /^sample_details\.(shipment_no_batch_no|commodity|variety_of_grains|vendor|country_of_origin|purpose)$/,
  /^report_details\.(report_date|report_no)$/,
  /^analysis_details\.(analyzed_by|date|time)$/,
  /^quality_parameters\.\d+\.(criteria|preferred_standard|actual|remark)$/,
];

const isEditableQ1Path = (path) =>
  typeof path === 'string' && Q1_REPORT_EDITABLE_PATH_PATTERNS.some((re) => re.test(path));

// Write one whitelisted dot-path into a q1Report blob in place, creating intermediate
// objects/arrays as needed. Mirrors the single-field setter used by updateQualityReportField.
const setQ1ReportPath = (q1Report, path, value) => {
  const segments = path.split('.');
  const leafKey = segments.pop();
  let cursor = q1Report;
  for (const seg of segments) {
    const isIndex = /^\d+$/.test(seg);
    if (cursor[seg] == null || typeof cursor[seg] !== 'object') {
      cursor[seg] = isIndex ? [] : {};
    }
    cursor = cursor[seg];
  }
  cursor[leafKey] = value;
};

// Update one field inside a shipment's q1Report (S1 quality-report metadata card + Quality
// Parameters table on the Quality step) — path is a dot-path such as "sample_details.commodity"
// or "quality_parameters.2.actual", validated against Q1_REPORT_EDITABLE_PATH_PATTERNS above.
exports.updateQualityReportField = async (req, res) => {
  try {
    const { id } = req.params;
    const { path, value } = req.body;

    if (!isEditableQ1Path(path)) {
      return res.status(400).json({ message: 'That field cannot be edited.' });
    }
    if (typeof value !== 'string') {
      return res.status(400).json({ message: 'value must be a string' });
    }

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const before = { q1Report: shipment.q1Report };

    if (shipment.q1Report == null || typeof shipment.q1Report !== 'object') {
      shipment.q1Report = {};
    }
    setQ1ReportPath(shipment.q1Report, path, value);
    shipment.markModified('q1Report');
    await shipment.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Shipment',
      entity: 'Shipment',
      entityId: shipment._id,
      action: 'Updated',
      before,
      after: { q1Report: shipment.q1Report },
      remarks: `Quality report field updated: ${path}`,
    });

    res.json({ message: 'Quality report field updated', q1Report: shipment.q1Report });
  } catch (err) {
    console.error('updateQualityReportField error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Bulk variant of updateQualityReportField — accepts { fields: [{ path, value }] } and applies
// every whitelisted change in one save. Backs the single "Edit" modal on the Quality step
// (S1 highlights card + Quality Parameters table), replacing the old per-field pencil edits.
exports.updateQualityReportBulk = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Array.isArray(req.body.fields) ? req.body.fields : null;

    if (!fields || fields.length === 0) {
      return res.status(400).json({ message: 'fields must be a non-empty array' });
    }
    for (const f of fields) {
      if (!f || !isEditableQ1Path(f.path)) {
        return res.status(400).json({ message: `Field cannot be edited: ${f && f.path}` });
      }
      if (typeof f.value !== 'string') {
        return res.status(400).json({ message: `value must be a string for ${f.path}` });
      }
    }

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const before = { q1Report: shipment.q1Report };

    if (shipment.q1Report == null || typeof shipment.q1Report !== 'object') {
      shipment.q1Report = {};
    }
    for (const f of fields) {
      setQ1ReportPath(shipment.q1Report, f.path, f.value);
    }
    shipment.markModified('q1Report');
    await shipment.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Shipment',
      entity: 'Shipment',
      entityId: shipment._id,
      action: 'Updated',
      before,
      after: { q1Report: shipment.q1Report },
      remarks: `Quality report fields updated: ${fields.map((f) => f.path).join(', ')}`,
    });

    res.json({ message: 'Quality report updated', q1Report: shipment.q1Report });
  } catch (err) {
    console.error('updateQualityReportBulk error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Refresh a single line item's Brand/Barcode/DM Barcode/Variant/H.S Code/Country of
// Origin/Packing from the Item Master catalog, filling only fields still blank on the
// shipment — same mapping as enrichExtractionItemsFromCatalog, but on-demand for line
// items whose catalog record didn't exist yet at LPO-extraction time.
exports.refreshLineItemFromCatalog = async (req, res) => {
  try {
    const { id, index } = req.params;
    const idx = Number(index);

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    if (!Number.isInteger(idx) || idx < 0 || idx >= shipment.lineItems.length) {
      return res.status(400).json({ message: 'Invalid line item index' });
    }

    const lineItem = shipment.lineItems[idx];
    const itemCode = String(lineItem.itemCode || '').trim();
    if (!itemCode) {
      return res.status(400).json({ message: 'This line item has no item code to look up' });
    }

    const catalogItem = await Item.findOne({ itemCode }).lean();
    if (!catalogItem) {
      return res.status(404).json({ message: `No matching item found in Item Master for code ${itemCode}` });
    }

    const fieldMap = {
      brandName: catalogItem.brand || catalogItem.riceName || '',
      barcode: catalogItem.barcode || '',
      dmBarcode: catalogItem.dmBarcode || '',
      variant: catalogItem.variant || '',
      hsCode: catalogItem.hsCode || '',
      countryOfOrigin: catalogItem.countryOfOrigin || '',
      packagingType: catalogItem.packing || '',
    };

    const changedFields = [];
    Object.entries(fieldMap).forEach(([field, catalogValue]) => {
      if (!lineItem[field] && catalogValue) {
        lineItem[field] = catalogValue;
        changedFields.push(field);
      }
    });

    if (!changedFields.length) {
      return res.json({ message: 'Item Master has no additional data to add', changedFields: [] });
    }

    shipment.markModified('lineItems');
    await shipment.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Shipment',
      entity: 'Shipment',
      entityId: shipment._id,
      action: 'Updated',
      after: { lineItemIndex: idx, changedFields },
      remarks: 'Line item refreshed from Item Master',
    });

    res.json({
      message: `Backfilled ${changedFields.length} field(s) from Item Master`,
      changedFields,
      lineItem,
    });
  } catch (err) {
    console.error('refreshLineItemFromCatalog error:', err);
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
          block: split.block || '',
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
          transactionId: booking.transactionId || '',
          containerSerialNo: booking.containerSerialNo || '',
          transportCompanyName: booking.transportCompanyName,
          warehouse: booking.warehouse || '',
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

exports.uploadAdditionalRepositoryDocument = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: "Container not found" });
    if (!container.actual) return res.status(400).json({ message: "Container has no actual recorded yet" });

    const file = req.files?.[0];
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const { documentType, description } = req.body;
    if (!documentType) return res.status(400).json({ message: "documentType is required" });

    const uploaded = await uploadBufferToS3(file, 'shipments/logistics/repository');

    const newDoc = {
      documentType,
      description: description || '',
      fileUrl: uploaded.url,
      fileName: uploaded.fileName,
      uploadedAt: new Date(),
      uploadedBy: req.user?.name || req.user?.email || 'System User',
    };

    container.actual.additionalDocuments.push(newDoc);
    await container.save();

    // Sync with same BL
    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['additionalDocuments'],
    });

    res.status(200).json({
      message: "Document uploaded successfully",
      container,
      document: container.actual.additionalDocuments[container.actual.additionalDocuments.length - 1]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteAdditionalRepositoryDocument = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: "Container not found" });
    if (!container.actual) return res.status(400).json({ message: "Container has no actual recorded yet" });

    const { docId } = req.params;
    container.actual.additionalDocuments = container.actual.additionalDocuments.filter(
      (doc) => String(doc._id) !== String(docId)
    );
    await container.save();

    // Sync with same BL
    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['additionalDocuments'],
    });

    res.status(200).json({
      message: "Document deleted successfully",
      container,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.createTransportationTransaction = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Container has no actual record' });

    const { containerSerials, transportCompany, warehouse, transportDate } = req.body;

    if (!transportCompany) return res.status(400).json({ message: 'transportCompany is required' });
    if (!warehouse) return res.status(400).json({ message: 'warehouse is required' });
    if (!transportDate) return res.status(400).json({ message: 'transportDate is required' });
    if (!Array.isArray(containerSerials) || containerSerials.length === 0) {
      return res.status(400).json({ message: 'containerSerials must be a non-empty array' });
    }

    const year = new Date().getFullYear();
    const existingCount = (container.actual.transportationTransactions || []).length;
    const transactionNo = `TRN-${year}-${String(existingCount + 1).padStart(4, '0')}`;

    if (!Array.isArray(container.actual.transportationTransactions)) {
      container.actual.transportationTransactions = [];
    }

    const newTransaction = {
      transactionNo,
      containerSerials: containerSerials || [],
      transportCompany,
      warehouse,
      transportDate: transportDate ? new Date(transportDate) : null,
      createdAt: new Date(),
    };

    container.actual.transportationTransactions.push(newTransaction);
    await container.save();

    res.status(201).json({
      message: 'Transportation transaction created successfully',
      transaction: newTransaction,
      container,
    });
  } catch (err) {
    console.error('createTransportationTransaction error:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.deleteTransportationTransaction = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Container has no actual record' });

    const { txnId } = req.params;
    const before = (container.actual.transportationTransactions || []).length;
    container.actual.transportationTransactions = (container.actual.transportationTransactions || []).filter(
      (t) => String(t._id) !== txnId
    );

    if (container.actual.transportationTransactions.length === before) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await container.save();
    res.status(200).json({ message: 'Transportation transaction deleted successfully' });
  } catch (err) {
    console.error('deleteTransportationTransaction error:', err);
    res.status(500).json({ message: err.message });
  }
};

exports.replaceBlDocument = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });

    const newFile = req.file;
    if (!newFile) return res.status(400).json({ message: 'No replacement file provided' });

    const oldUrl = container.actual?.blDocumentUrl;
    if (oldUrl) {
      try { await deleteFromS3(oldUrl); } catch (_) { /* non-fatal */ }
    }

    const uploaded = await uploadBufferToS3(newFile, 'shipments/actual/bl-document');
    container.actual.blDocumentUrl = uploaded.url;
    container.actual.blDocumentName = uploaded.fileName;
    await container.save();

    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: ['blDocumentUrl', 'blDocumentName'],
    });

    res.status(200).json({
      message: 'BL document replaced successfully',
      blDocumentUrl: uploaded.url,
      blDocumentName: uploaded.fileName,
    });
  } catch (err) {
    console.error('replaceBlDocument error:', err);
    res.status(500).json({ message: err.message });
  }
};
