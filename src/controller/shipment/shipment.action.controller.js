const {
  Shipment,
  Container,
  AuditLog,
  writeAuditLog,
  uploadBufferToS3,
  parseJsonField,
  toDateOrNull,
  normalizeEmail,
  formatDateValue,
  getScheduledShipmentId,
  ensureSupplierPortalAccessForShipment,
  notifyShipmentScheduledRolesByEmail,
  hydrateMissingSameBlActualFields,
  syncSameBlActualFields,
  SAME_BL_INHERIT_FIELDS,
  SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
} = require('./shipment.helper');

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
      q1Report,
      itemsJson
    } = req.body;

    const files = req.files || {};
    const lpoDocument = files?.lpoDocument?.[0];
    const proformaDocument = files?.proformaDocument?.[0];
    const s1QualityReport = files?.s1QualityReport?.[0];

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
      return cleaned.length === 1 ? cleaned[0] : `Multiple (${cleaned.length})`;
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

    const purchaseSuffix = extractPurchaseSuffix(trackerSourceValue);
    
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

    const shipmentNo = trackerSerial;
    const yearStr = orderDateObj.getFullYear();
    const qty = derivedQty;
    const rate = derivedRate;
    const totalAmount = derivedTotalAmount != null ? derivedTotalAmount : qty * rate;

    const uploads = await Promise.all([
      uploadBufferToS3(lpoDocument, 'shipments/lpo'),
      proformaDocument ? uploadBufferToS3(proformaDocument, 'shipments/proforma') : Promise.resolve(null),
      uploadBufferToS3(s1QualityReport, 'shipments/quality/s1')
    ]);
    const [lpoUpload, proformaUpload, s1Upload] = uploads;

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
        ? `Multiple Items (${derivedLineItems.length})`
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
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        paymentStatus: "Pending"
      },
      incoterms,
      buyunit: uniqueJoin(derivedLineItems.map((item) => item.buyingUnit), buyunit || ''),
      totalSplitQtyMT,
      containersize: Number(uniqueJoin(derivedLineItems.map((item) => item.containerSize), estimatedContainerSize || '')) || Number(estimatedContainerSize) || 0
    });

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

    await Container.deleteMany({ shipmentId, status: "Planned" });

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

    shipment.plannedQtyMT = currentPlannedMT;
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

    const billOrLadingNo = BLNo ?? CLNo;

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
