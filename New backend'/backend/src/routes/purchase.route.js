const express = require('express');
const router = express.Router();
const controller = require('../controller/purchase.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role
router.get('/',    authMiddleware, authorize({ tag: 'any-active' }), controller.getPurchaseOrders);
router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.getPurchaseOrderById);

// Write — Purchase team only (intentional business rule)
router.post('/create', authMiddleware, authorize({ tag: 'any-active' }), controller.createPurchaseOrder);
router.patch('/:id',   authMiddleware, authorize({ tag: 'any-active' }), controller.updatePurchaseOrder);

module.exports = router;
