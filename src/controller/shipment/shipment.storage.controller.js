const {
  Container,
  Shipment,
  normalizeUploadedFiles,
  parseJsonField,
  toDateOrNull,
  toTimeString,
  uploadBufferToS3,
  toPlainObject,
  calculateDelayHours,
  buildStorageArrivalPendingApproval,
  advanceShipmentStage,
  fireAndForgetWorkflowEmail,
  cloneForAudit,
  normalizeVisibleTo,
  buildPaymentAllocationPendingApproval,
  buildPaymentCostingPendingApproval,
  syncSameBlActualFields,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  notifyPaymentAllocationRolesByEmail,
  notifyPaymentCostingRolesByEmail,
  writeAuditLog,
  WORKFLOW_NOTIFICATION_ROLE_MAP,
  PAYMENT_COSTING_APPROVAL_STATUSES,
  hasSavedPaymentAllocationData,
  hasSavedPaymentCostingData,
  hasRoleOrPermission,
  STORAGE_ARRIVAL_APPROVAL_STATUSES,
  hasSavedStorageArrivalData,
} = require('./shipment.helper');

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
