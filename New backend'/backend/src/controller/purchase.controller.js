const PurchaseOrder = require('../models/purchase.model');
const Supplier = require('../models/supplier.model');
const Item = require('../models/item.model');
const logAudit = require('../core/utils/auditLogger');


// ===============================
// CREATE PURCHASE ORDER
// ===============================
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { poNumber, year, orderDate, supplierId, itemId, totalOrderedQtyMT } = req.body;

    // Check duplicate PO number
    const existing = await PurchaseOrder.findOne({ poNumber });
    if (existing) {
      return res.status(400).json({ message: "PO number already exists" });
    }

    // Validate supplier
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(400).json({ message: "Invalid supplier" });
    }

    // Validate item
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(400).json({ message: "Invalid item" });
    }

    const po = await PurchaseOrder.create({
      poNumber,
      year,
      orderDate,
      supplierId,
      itemId,
      totalOrderedQtyMT
    });

    // Audit log
    await logAudit({
      userId: req.user._id,
      module: "Purchase",
      entity: "PurchaseOrder",
      entityId: po._id,
      action: "Created",
      before: {},
      after: po.toObject(),
      remarks: "Purchase Order created"
    });

    res.status(201).json({
      message: "Purchase Order created successfully",
      po
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



// ===============================
// GET ALL PURCHASE ORDERS
// Pagination + Search + Filters
// ===============================
exports.getPurchaseOrders = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', year, status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const query = {};

    if (search) {
      query.poNumber = { $regex: search, $options: 'i' };
    }

    if (year) {
      query.year = parseInt(year);
    }

    if (status) {
      query.status = status;
    }

    const total = await PurchaseOrder.countDocuments(query);

    const data = await PurchaseOrder.find(query)
      .populate("supplierId", "name country")
      .populate("itemId", "description packing")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      purchaseOrders: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



// ===============================
// GET SINGLE PURCHASE ORDER
// ===============================
exports.getPurchaseOrderById = async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id)
      .populate("supplierId")
      .populate("itemId");

    if (!po) return res.status(404).json({ message: "PO not found" });

    res.json(po);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



// ===============================
// UPDATE PURCHASE ORDER
// ===============================
exports.updatePurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });

    const beforeData = po.toObject();

    Object.assign(po, req.body);
    await po.save();

    // Audit log
    await logAudit({
      userId: req.user._id,
      module: "Purchase",
      entity: "PurchaseOrder",
      entityId: po._id,
      action: "Updated",
      before: beforeData,
      after: po.toObject(),
      remarks: "Purchase Order updated"
    });

    res.json({ message: "Purchase Order updated", po });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
