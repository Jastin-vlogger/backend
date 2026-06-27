const {
  Container,
  Shipment,
  uploadBufferToS3,
  toDateOrNull,
  SAME_BL_DOCUMENT_TRACKER_FIELDS,
  syncSameBlActualFields,
  advanceShipmentStage,
  fireAndForgetWorkflowEmail,
  WORKFLOW_NOTIFICATION_ROLE_MAP,
  writeAuditLog,
} = require('./shipment.helper');

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
