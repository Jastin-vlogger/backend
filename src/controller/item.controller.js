const Item = require('../models/item.model');
const mongoose = require('mongoose');
const logAudit = require('../core/utils/auditLogger');

// =======================
// CREATE ITEM - Purchase or FAS
// =======================
exports.createItem = async (req, res) => {
  try {
    const { itemCode, description, packing, bagWeightKg, unit } = req.body;

    // Check if item code exists
    const existing = await Item.findOne({ itemCode });
    if (existing) return res.status(400).json({ message: "Item code already exists" });

    const conversionToMT = bagWeightKg ? bagWeightKg / 1000 : null; // optional auto conversion

    const item = await Item.create({ itemCode, description, packing, bagWeightKg, unit, conversionToMT });

    // Audit log
    await logAudit({
      userId: req.user._id,
      module: "Master",
      entity: "Item",
      entityId: item._id,
      action: "Created",
      before: {},
      after: { itemCode, description, packing, bagWeightKg, unit, conversionToMT },
      remarks: "Item created"
    });

    res.status(201).json({ message: "Item created", item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ITEMS - Pagination & Search
// =======================
exports.getItems = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const query = {};
    if (search) {
      query.$or = [
        { itemCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Item.countDocuments(query);
    const items = await Item.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// GET ITEM BY ID
// =======================
exports.getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// UPDATE ITEM
// =======================
exports.updateItem = async (req, res) => {
  try {
    const itemId = req.params.id;
    const updates = { ...req.body };

    if (updates.itemCode) {
      const exists = await Item.findOne({ itemCode: updates.itemCode, _id: { $ne: itemId } });
      if (exists) {
        return res.status(400).json({ message: 'Item code already exists' });
      }
    }

    const before = await Item.findById(itemId);
    if (!before) return res.status(404).json({ message: 'Item not found' });

    const item = await Item.findByIdAndUpdate(itemId, updates, { new: true, runValidators: true });

    await logAudit({
      userId: req.user._id,
      module: 'Master',
      entity: 'Item',
      entityId: item._id,
      action: 'Updated',
      before,
      after: item,
      remarks: 'Item updated',
    });

    res.json({ message: 'Item updated', item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// =======================
// DELETE ITEM
// =======================
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    await Item.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      module: 'Master',
      entity: 'Item',
      entityId: item._id,
      action: 'Deleted',
      before: item,
      after: {},
      remarks: 'Item deleted',
    });

    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// =======================
// GET ITEM LIST ENTRY BY ITEM CODE
// =======================
exports.getItemListByCode = async (req, res) => {
  try {
    const rawCode = String(req.params.itemCode || '').trim();
    if (!rawCode) {
      return res.status(400).json({ message: 'itemCode is required' });
    }

    const collection = mongoose.connection.collection('item_list');
    const escapedCode = rawCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const item = await collection.findOne({
      item_code: { $regex: `^${escapedCode}$`, $options: 'i' }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
