const {
  Container,
  Shipment,
  parseJsonField,
  toDateOrNull,
  addDays,
  toTimeString,
  toPlainObject,
  calculateDelayHours,
  advanceShipmentStage,
  fireAndForgetWorkflowEmail,
  WORKFLOW_NOTIFICATION_ROLE_MAP,
  uploadBufferToS3,
  syncSameBlActualFields,
  SAME_BL_PORT_CUSTOMS_FIELDS,
} = require('./shipment.helper');

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
      doRemarks,
      boePassingDate,
      boePassingRemarks,
      dmBarcode,
      customsClearanceDate,
      customsClearanceRemarks,
      tokenReceivedDate,
      municipalityDate,
      municipalityRemarks,
      municipalityStatus,
      municipalityStatusComment,
      municipalityReleasedDate,
      municipalityResponseRemarks,
      municipalityComments,
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
      municipalityClearanceCertificateName,
      // New Milestone 1 fields
      commercialDocumentReceivedDate,
      freeDetentionDays,
      freeStorageDays,
      clearanceRemarks,
      // New Customer Inspection fields
      customerInspectionRequired,
      customerInspectionDate,
      customerInspectionStatus,
      customerInspectionComments,
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

    // New Milestone 1 fields
    if (commercialDocumentReceivedDate !== undefined) {
      container.actual.commercialDocumentReceivedDate = toDateOrNull(commercialDocumentReceivedDate);
    }
    if (freeDetentionDays !== undefined) {
      container.actual.freeDetentionDays = Number(freeDetentionDays) || 10;
    }
    if (freeStorageDays !== undefined) {
      container.actual.freeStorageDays = Number(freeStorageDays) || 14;
    }
    if (clearanceRemarks !== undefined) {
      container.actual.clearanceRemarks = clearanceRemarks || '';
    }

    // DO Remarks (separate from doReleasedRemarks)
    if (doRemarks !== undefined) {
      container.actual.doRemarks = doRemarks || '';
    }

    // Municipality new fields
    if (municipalityReleasedDate !== undefined) {
      container.actual.municipalityReleasedDate = toDateOrNull(municipalityReleasedDate);
    }
    if (municipalityResponseRemarks !== undefined) {
      container.actual.municipalityResponseRemarks = municipalityResponseRemarks || '';
    }
    if (municipalityComments !== undefined) {
      container.actual.municipalityComments = municipalityComments || '';
    }

    // Customer Inspection fields
    if (customerInspectionRequired !== undefined) {
      container.actual.customerInspectionRequired = String(customerInspectionRequired) === 'true';
    }
    if (customerInspectionDate !== undefined) {
      container.actual.customerInspectionDate = toDateOrNull(customerInspectionDate);
    }
    if (customerInspectionStatus !== undefined) {
      container.actual.customerInspectionStatus = customerInspectionStatus || '';
    }
    if (customerInspectionComments !== undefined) {
      container.actual.customerInspectionComments = customerInspectionComments || '';
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

    const commercialDocument = files?.commercialDocument?.[0];
    const customerInspectionDocument = files?.customerInspectionDocument?.[0];
    const arrivalNoticeDocument = files?.arrivalNoticeDocument?.[0];
    const advanceRequestDocument = files?.advanceRequestDocument?.[0];
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

    if (commercialDocument) {
      const uploaded = await uploadBufferToS3(commercialDocument, 'shipments/logistics/commercial-document');
      container.actual.commercialDocumentDocumentUrl = uploaded.url;
      container.actual.commercialDocumentDocumentName = uploaded.fileName;
    }
    if (customerInspectionDocument) {
      const uploaded = await uploadBufferToS3(customerInspectionDocument, 'shipments/logistics/customer-inspection');
      container.actual.customerInspectionDocumentUrl = uploaded.url;
      container.actual.customerInspectionDocumentName = uploaded.fileName;
    }
    if (arrivalNoticeDocument) {
      const uploaded = await uploadBufferToS3(arrivalNoticeDocument, 'shipments/logistics/arrival-notice');
      container.actual.arrivalNoticeDocumentUrl = uploaded.url;
      container.actual.arrivalNoticeDocumentName = uploaded.fileName;
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

    const shouldValidateBoePassing =
      sectionKey === 'boePassingDate' || (isBulkSave && parsedBulkSectionKeys.includes('boePassingDate'));
    if (shouldValidateBoePassing) {
      if (!container.actual.dpInvoiceDocumentUrl) {
        return res.status(400).json({
          message: 'DP Invoice document is required',
        });
      }
    }

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
          (split) => split.containerSerialNo === row.containerSerialNo
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

    // Propagate customs & clearance details across containers sharing the same BL
    await syncSameBlActualFields({
      ContainerModel: Container,
      sourceContainer: container,
      fields: SAME_BL_PORT_CUSTOMS_FIELDS,
    });

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

    // Auto-generate transaction number
    const year = new Date().getFullYear();
    const existingCount = (container.actual.transportationTransactions || []).length;
    const transactionNo = `TRN-${year}-${String(existingCount + 1).padStart(4, '0')}`;

    if (!Array.isArray(container.actual.transportationTransactions)) {
      container.actual.transportationTransactions = [];
    }

    const newTransaction = {
      transactionNo,
      containerSerials,
      transportCompany,
      warehouse,
      transportDate: toDateOrNull(transportDate),
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
