const {
  Container,
  Shipment,
  cloneForAudit,
  writeAuditLog,
  syncSameBlActualFields,
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_STORAGE_ALLOCATION_FIELDS,
  CLEARING_ADVANCE_APPROVAL_STATUSES,
  STORAGE_ALLOCATION_APPROVAL_STATUSES,
  hasRoleOrPermission,
  notifyClearingAdvanceRolesByEmail,
  notifyStorageAllocationRolesByEmail,
  notifyActualContainerSavedRolesByEmail,
  advanceShipmentStage,
  parseJsonField,
  normalizeUploadedFiles,
  buildClearingAdvancePendingApproval,
  buildStorageAllocationPendingApproval,
  hasSavedClearingAdvanceData,
  hasSavedStorageAllocationData,
} = require('./shipment.helper');

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

    let costSheetBookingsDocUrl = container.actual.costSheetBookingDocumentUrl;
    let costSheetBookingsDocName = container.actual.costSheetBookingDocumentName;
    if (costSheetBookingDocument) {
      const uploaded = await uploadBufferToS3(costSheetBookingDocument, 'shipments/bl/cost-sheets');
      costSheetBookingsDocUrl = uploaded.url;
      costSheetBookingsDocName = uploaded.fileName;
    }

    let commercialInvoiceDocUrl = container.actual.commercialInvoiceDocumentUrl;
    let commercialInvoiceDocName = container.actual.commercialInvoiceDocumentName;
    if (commercialInvoiceDocument) {
      const uploaded = await uploadBufferToS3(commercialInvoiceDocument, 'shipments/bl/commercial-invoices');
      commercialInvoiceDocUrl = uploaded.url;
      commercialInvoiceDocName = uploaded.fileName;
    }

    const isFirstBlSave = !container.actual.blFirstSavedAt;

    container.actual = {
      ...container.actual,
      blNo: blNo !== undefined ? blNo : container.actual.blNo,
      commercialInvoiceNo: commercialInvoiceNo !== undefined ? commercialInvoiceNo : container.actual.commercialInvoiceNo,
      blDetailsRemarks: blDetailsRemarks !== undefined ? blDetailsRemarks : container.actual.blDetailsRemarks,
      shippedOnBoard: shippedOnBoard !== undefined ? (shippedOnBoard ? new Date(shippedOnBoard) : null) : container.actual.shippedOnBoard,
      portOfLoading: portOfLoading !== undefined ? portOfLoading : container.actual.portOfLoading,
      portOfDischarge: portOfDischarge !== undefined ? portOfDischarge : container.actual.portOfDischarge,
      shipmentArrived: shipmentArrived !== undefined ? (shipmentArrived ? new Date(shipmentArrived) : null) : container.actual.shipmentArrived,
      noOfContainers: noOfContainers !== undefined ? (noOfContainers !== '' ? Number(noOfContainers) : null) : container.actual.noOfContainers,
      noOfBags: noOfBags !== undefined ? (noOfBags !== '' ? Number(noOfBags) : null) : container.actual.noOfBags,
      quantityByMt: quantityByMt !== undefined ? (quantityByMt !== '' ? Number(quantityByMt) : null) : container.actual.quantityByMt,
      shippingLine: shippingLine !== undefined ? shippingLine : container.actual.shippingLine,
      freeDetentionDays: freeDetentionDays !== undefined ? (freeDetentionDays !== '' ? Number(freeDetentionDays) : null) : container.actual.freeDetentionDays,
      maximumDetentionDays: maximumDetentionDays !== undefined ? (maximumDetentionDays !== '' ? Number(maximumDetentionDays) : null) : container.actual.maximumDetentionDays,
      freightPrepared: freightPrepared !== undefined ? freightPrepared : container.actual.freightPrepared,
      costSheetBookings: Array.isArray(parsedCostSheetBookings) ? parsedCostSheetBookings : container.actual.costSheetBookings,
      costSheetBookingDocumentUrl: costSheetBookingsDocUrl,
      costSheetBookingDocumentName: costSheetBookingsDocName,
      commercialInvoiceDocumentUrl: commercialInvoiceDocUrl,
      commercialInvoiceDocumentName: commercialInvoiceDocName,
      storageAllocations: Array.isArray(parsedStorageAllocations) ? parsedStorageAllocations : container.actual.storageAllocations,
      storageAllocationDecision: parsedStorageAllocationDecision !== null ? parsedStorageAllocationDecision : container.actual.storageAllocationDecision,
      storageAllocationSplits: Array.isArray(parsedStorageAllocationSplits) ? parsedStorageAllocationSplits : container.actual.storageAllocationSplits,
      clearingAdvancePaymentDetails: {
        ...container.actual.clearingAdvancePaymentDetails,
        ...parsedClearingAdvancePaymentDetails,
        chequeNo: chequeNo !== undefined ? chequeNo : (parsedClearingAdvancePaymentDetails.chequeNo !== undefined ? parsedClearingAdvancePaymentDetails.chequeNo : container.actual.clearingAdvancePaymentDetails?.chequeNo),
        chequeDate: chequeDate !== undefined ? (chequeDate ? new Date(chequeDate) : null) : (parsedClearingAdvancePaymentDetails.chequeDate !== undefined ? (parsedClearingAdvancePaymentDetails.chequeDate ? new Date(parsedClearingAdvancePaymentDetails.chequeDate) : null) : container.actual.clearingAdvancePaymentDetails?.chequeDate),
        paymentVoucherNo: paymentVoucherNo !== undefined ? paymentVoucherNo : (parsedClearingAdvancePaymentDetails.paymentVoucherNo !== undefined ? parsedClearingAdvancePaymentDetails.paymentVoucherNo : container.actual.clearingAdvancePaymentDetails?.paymentVoucherNo),
        transactionId: transactionId !== undefined ? transactionId : (parsedClearingAdvancePaymentDetails.transactionId !== undefined ? parsedClearingAdvancePaymentDetails.transactionId : container.actual.clearingAdvancePaymentDetails?.transactionId)
      },
      actualBags: actualBags !== undefined ? (actualBags !== '' ? Number(actualBags) : null) : container.actual.actualBags,
      expiryDate: expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : container.actual.expiryDate,
      hsCode: hsCode !== undefined ? hsCode : container.actual.hsCode,
      packagingDate: packagingDate !== undefined ? (packagingDate ? new Date(packagingDate) : null) : container.actual.packagingDate,
      grossWeight: grossWeight !== undefined ? (grossWeight !== '' ? Number(grossWeight) : null) : container.actual.grossWeight,
      netWeight: netWeight !== undefined ? (netWeight !== '' ? Number(netWeight) : null) : container.actual.netWeight,
      packagingList: Array.isArray(parsedPackagingList) ? parsedPackagingList : container.actual.packagingList,
      blFirstSavedAt: container.actual.blFirstSavedAt || new Date(),
    };

    if (isClearingAdvanceSave) {
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

    if (isStorageAllocationSave) {
      await syncSameBlActualFields({
        ContainerModel: Container,
        sourceContainer: container,
        fields: SAME_BL_STORAGE_ALLOCATION_FIELDS,
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
          approvalStage: 'Saved'
        }).catch((error) => {
          console.error(`Storage allocation notification warning for ${shipmentForBL.shipmentNo || shipmentForBL._id}:`, error.message);
        });
      } else if (isClearingAdvanceSave) {
        notifyClearingAdvanceRolesByEmail({
          roles: ['FAS'],
          shipment: shipmentForBL,
          container,
          actor: req.user,
          approvalStage: 'Saved'
        }).catch((error) => {
          console.error(`Clearing advance notification warning for ${shipmentForBL.shipmentNo || shipmentForBL._id}:`, error.message);
        });
      }
    }

    await writeAuditLog({
      userId: req.user._id,
      module: 'Logistics',
      entity: 'Container',
      entityId: container._id,
      action: hadExistingBlTabSave ? 'UpdateBLDetails' : 'SaveBLDetails',
      before: beforeUpdate,
      after: cloneForAudit(container.toObject()),
      remarks: hadExistingBlTabSave ? 'B/L details updated' : 'B/L details saved'
    });

    res.status(200).json({
      message: 'B/L details updated successfully',
      container
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
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
