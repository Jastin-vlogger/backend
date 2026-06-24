const express = require('express');
const router = express.Router();
const controller = require('../controller/warehouse.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role (frontend permissions decide whether Settings tabs/actions are visible)
router.get('/storekeepers/options', authMiddleware, authorize({ tag: 'any-active' }), controller.getAssignableStorekeepers);
router.get('/',    authMiddleware, authorize({ tag: 'any-active' }), controller.getAllWarehouses);
router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.getWarehouseById);

// Write — visible/editable from the frontend only when the matching Settings permission is granted
router.post('/',                         authMiddleware, authorize({ tag: 'any-active' }), controller.createWarehouse);
router.put('/:id',                       authMiddleware, authorize({ tag: 'any-active' }), controller.updateWarehouse);
router.delete('/:id',                    authMiddleware, authorize({ tag: 'any-active' }), controller.deleteWarehouse);
router.post('/:id/blocks',               authMiddleware, authorize({ tag: 'any-active' }), controller.addWarehouseBlock);
router.delete('/:id/blocks/:blockId',    authMiddleware, authorize({ tag: 'any-active' }), controller.deleteWarehouseBlock);

module.exports = router;
