// Local Purchase — creation. Independent of the Shipment flow: no PO/BL/commercial doc/S1-quality
// document requirements, no lineItems/container-split logic. Mirrors createShipment's overall
// structure (validation -> duplicate guard -> auto-number -> S3 upload -> create -> audit log)
// but stripped down for a single nearby-store purchase document (the LPO only).
const LocalPurchase = require('../models/local-purchase.model');
const Supplier = require('../models/supplier.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { uploadBufferToS3 } = require('../core/utils/s3Upload');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

exports.createLocalPurchase = async (req, res) => {
  try {
    const {
      orderDate,
      supplierId,
      supplierName,
      supplierEmail,
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
      plannedQtyMT,
      buyunit,
      fcPerUnit,
      totalFC,
      amountAED,
      paymentTerms,
      incoterms,
      advanceAmount,
      advanceAmountDate,
      bankName,
    } = req.body;

    const files = req.files || {};
    const lpoDocument = files?.lpoDocument?.[0];
    const s1QualityReport = files?.s1QualityReport?.[0];
    // Optional — not used for extraction, just stored/attached.
    const commercialDocument = files?.commercialDocument?.[0];

    const missingFields = [];
    if (!orderDate) missingFields.push('orderDate');
    if (!(supplierId || supplierName)) missingFields.push('supplierIdOrSupplierName');
    if (!supplierEmail) missingFields.push('supplierEmail');
    if (!plannedQtyMT) missingFields.push('plannedQtyMT');
    if (!buyunit) missingFields.push('buyunit');
    if (!paymentTerms) missingFields.push('paymentTerms');
    if (!lpoDocument) missingFields.push('lpoDocument');
    if (!s1QualityReport) missingFields.push('s1QualityReport');

    if (missingFields.length) {
      return res.status(400).json({ message: 'Required fields missing', missingFields });
    }

    const normalizedSupplierEmail = normalizeEmail(supplierEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSupplierEmail)) {
      return res.status(400).json({ message: 'A valid supplierEmail is required' });
    }

    let supplier = null;
    if (supplierId) {
      supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return res.status(400).json({ message: 'Invalid supplier' });
      }
    }

    const orderDateObj = orderDate ? new Date(orderDate) : new Date();
    if (Number.isNaN(orderDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid orderDate' });
    }
    const yearStr = orderDateObj.getFullYear();
    const yy = String(yearStr).slice(-2);
    const mm = String(orderDateObj.getMonth() + 1).padStart(2, '0');

    // Auto-generate lpNumber: LP + YY + MM + running 3-digit sequence (monthly), same shape as
    // Shipment's poNumber generation, independent counter/collection.
    const monthStart = new Date(orderDateObj.getFullYear(), orderDateObj.getMonth(), 1, 0, 0, 0, 0);
    const nextMonthStart = new Date(orderDateObj.getFullYear(), orderDateObj.getMonth() + 1, 1, 0, 0, 0, 0);
    const monthCount = await LocalPurchase.countDocuments({ orderDate: { $gte: monthStart, $lt: nextMonthStart } });
    let runningNo = monthCount + 1;
    let lpNumber = `LP${yy}${mm}${String(runningNo).padStart(3, '0')}`;
    while (await LocalPurchase.exists({ lpNumber })) {
      runningNo += 1;
      lpNumber = `LP${yy}${mm}${String(runningNo).padStart(3, '0')}`;
    }

    const [lpoUpload, s1Upload, commercialUpload] = await Promise.all([
      uploadBufferToS3(lpoDocument, 'local-purchase/lpo'),
      uploadBufferToS3(s1QualityReport, 'local-purchase/quality/s1'),
      commercialDocument ? uploadBufferToS3(commercialDocument, 'local-purchase/commercial') : Promise.resolve(null),
    ]);

    const qty = Number(plannedQtyMT) || 0;
    const rate = Number(fcPerUnit) || 0;
    const totalAmount = Number(totalFC) || qty * rate;

    const localPurchase = await LocalPurchase.create({
      lpNumber,
      year: yearStr,
      orderDate: orderDateObj,
      supplierId: supplier?._id,
      supplierName: supplierName || supplier?.name || '',
      supplierEmail: normalizedSupplierEmail,
      itemId: itemId || undefined,
      itemCode: itemCode || '',
      itemDescription: itemDescription || '',
      commodity: commodity || '',
      countryOfOrigin: countryOfOrigin || '',
      brandName: brandName || '',
      barcode: barcode || '',
      variant: variant || '',
      hsCode: hsCode || '',
      packing: packing || '',
      plannedQtyMT: qty,
      buyunit,
      fcPerUnit: rate,
      totalFC: totalAmount,
      amountAED: Number(amountAED) || 0,
      paymentTerms,
      incoterms: incoterms || '',
      advanceAmount: Number(advanceAmount) || 0,
      advanceAmountDate: toDateOrNull(advanceAmountDate),
      bankName: bankName || '',
      lpoDocumentName: lpoUpload.fileName,
      lpoDocumentUrl: lpoUpload.url,
      s1QualityReportName: s1Upload.fileName,
      s1QualityReportUrl: s1Upload.url,
      commercialDocumentName: commercialUpload?.fileName || '',
      commercialDocumentUrl: commercialUpload?.url || '',
      payment: {
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        paymentStatus: 'Pending',
      },
    });

    await writeAuditLog({
      userId: req.user._id,
      module: 'Local Purchase',
      entity: 'LocalPurchase',
      entityId: localPurchase._id,
      action: 'Create',
      before: null,
      after: localPurchase.toObject(),
      remarks: 'Local Purchase entry created',
    });

    return res.status(201).json({
      message: 'Local Purchase created successfully.',
      data: localPurchase,
      documents: {
        lpo: { name: lpoUpload.fileName, url: lpoUpload.url },
        s1QualityReport: { name: s1Upload.fileName, url: s1Upload.url },
        commercial: commercialUpload ? { name: commercialUpload.fileName, url: commercialUpload.url } : null,
      },
    });
  } catch (error) {
    console.error('createLocalPurchase error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getLocalPurchaseList = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '' } = req.query;
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 20;
    const normalizedSearch = String(search || '').trim();

    const query = {};
    if (normalizedSearch) {
      query.$or = [
        { lpNumber: { $regex: normalizedSearch, $options: 'i' } },
        { supplierName: { $regex: normalizedSearch, $options: 'i' } },
        { itemDescription: { $regex: normalizedSearch, $options: 'i' } },
      ];
    }

    const [items, totalRecords] = await Promise.all([
      LocalPurchase.find(query)
        .populate('supplierId', 'name')
        .populate('itemId', 'description')
        .sort({ orderDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LocalPurchase.countDocuments(query),
    ]);

    res.json({
      items,
      page,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
    });
  } catch (error) {
    console.error('getLocalPurchaseList error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getLocalPurchaseById = async (req, res) => {
  try {
    const localPurchase = await LocalPurchase.findById(req.params.id)
      .populate('supplierId', 'name email')
      .populate('itemId', 'description')
      .populate('storageAllocationApproval.submittedBy', 'name email')
      .populate('storageAllocationApproval.lastUpdatedBy', 'name email')
      .populate('storageAllocationApproval.warehouseManagerApprovedBy', 'name email');
    if (!localPurchase) return res.status(404).json({ message: 'Local Purchase not found' });
    res.json({ data: localPurchase });
  } catch (error) {
    console.error('getLocalPurchaseById error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
