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

// Edits the Cheque No / Cheque Date / Payment Voucher No / Transaction ID shown in the
// "Clearing Advance Information" modal, after the fact — restricted to FAS-tier roles.
exports.updateClearingAdvancePaymentDetails = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.bl_details.clearing_advance.edit_payment_details',
      ['FAS', 'FasManager', 'Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to edit clearing advance payment details.' });
    }

    const beforeUpdate = cloneForAudit(container.toObject());
    const { chequeNo, chequeDate, paymentVoucherNo, transactionId } = req.body;
    const existing = container.actual.clearingAdvancePaymentDetails?.toObject
      ? container.actual.clearingAdvancePaymentDetails.toObject()
      : container.actual.clearingAdvancePaymentDetails || {};

    container.actual.clearingAdvancePaymentDetails = {
      ...existing,
      chequeNo: chequeNo !== undefined ? String(chequeNo).trim() : (existing.chequeNo || ''),
      chequeDate: chequeDate !== undefined ? toDateOrNull(chequeDate) : (existing.chequeDate || null),
      paymentVoucherNo: paymentVoucherNo !== undefined ? String(paymentVoucherNo).trim() : (existing.paymentVoucherNo || ''),
      transactionId: transactionId !== undefined ? String(transactionId).trim() : (existing.transactionId || ''),
    };

    await container.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'Container',
      entityId: container._id,
      action: 'UpdateClearingAdvancePaymentDetails',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Clearing advance payment details (cheque/voucher/transaction) updated',
    });

    res.json({
      message: 'Payment details updated successfully.',
      clearingAdvancePaymentDetails: container.actual.clearingAdvancePaymentDetails,
    });
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

    // Reject approval if no warehouse has been assigned
    const splitRows = container.actual.storageAllocationSplits || [];
    const legacyRows = container.actual.storageAllocations || [];
    const hasWarehouse =
      splitRows.some((r) => String(r?.warehouse || '').trim()) ||
      legacyRows.some((r) => String(r?.warehouse || '').trim());
    if (!hasWarehouse) {
      return res.status(400).json({ message: 'A destination warehouse must be selected before approving storage allocation.' });
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

exports.resetStorageAllocations = async (req, res) => {
  try {
    const container = await Container.findById(req.params.id);
    if (!container) return res.status(404).json({ message: 'Container not found' });
    if (!container.actual) return res.status(400).json({ message: 'Actual not created yet' });

    const allowed = await hasRoleOrPermission(
      req.user,
      'shipment.tab.bl_details.storage_allocations.edit',
      ['Admin', 'Manager', 'Management']
    );
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to reset storage allocations.' });
    }

    const beforeUpdate = cloneForAudit(container.toObject());

    container.actual.storageAllocations = [];
    container.actual.storageAllocationDecision = null;
    container.actual.storageAllocationSplits = [];
    container.actual.storageAllocationApproval = { status: STORAGE_ALLOCATION_APPROVAL_STATUSES.draft };

    await container.save();

    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: SAME_BL_STORAGE_ALLOCATION_FIELDS,
    });

    await writeAuditLog({
      userId: req.user._id,
      module: 'Warehouse',
      entity: 'Container',
      entityId: container._id,
      action: 'ResetStorageAllocations',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: 'Storage allocations reset by admin',
    });

    return res.json({ message: 'Storage allocations reset successfully', container });
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

    await container.populate([
      { path: 'actual.storageArrivalApproval.submittedBy', select: 'name email role' },
      { path: 'actual.storageArrivalApproval.warehouseManagerApprovedBy', select: 'name email role' },
    ]);

    return res.json({ message: 'Storage arrival approved successfully', container });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
