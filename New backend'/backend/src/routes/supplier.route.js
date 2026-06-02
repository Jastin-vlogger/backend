const express = require('express');
const router = express.Router();
const Supplier = require('../models/supplier.model');
const supplierController = require('../controller/supplier.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role
router.get('/all', authMiddleware, authorize({ tag: 'any-active' }), async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const query = {};
    if (search) {
      query.$or = [
        { supplierCode: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Supplier.countDocuments(query);
    const suppliers = await Supplier.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      suppliers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), supplierController.getSupplierById);

// Write — Purchase, FAS, and Admin (intentional business rule)
router.post('/create', authMiddleware, authorize({ tag: 'any-active' }), supplierController.createSupplier);

module.exports = router;
