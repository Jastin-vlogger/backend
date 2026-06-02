const express = require('express');
const router = express.Router();
const controller = require('../controller/warehouse.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role (warehouses are referenced by multiple teams)
router.get('/storekeepers/options', authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.warehouses.view'] }), controller.getAssignableStorekeepers);
router.get('/',    authMiddleware, authorize({ tag: 'any-active' }), controller.getAllWarehouses);
router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.getWarehouseById);

// Write — admin only
router.post('/',      authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.warehouses.edit'] }), controller.createWarehouse);
router.put('/:id',    authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.warehouses.edit'] }), controller.updateWarehouse);
router.delete('/:id', authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.warehouses.edit'] }), controller.deleteWarehouse);

module.exports = router;
