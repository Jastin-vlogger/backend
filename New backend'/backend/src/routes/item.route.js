const express = require('express');
const router = express.Router();
const itemController = require('../controller/item.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role
router.get('/all',              authMiddleware, authorize({ tag: 'any-active' }), itemController.getItems);
router.get('/by-code/:itemCode',authMiddleware, authorize({ tag: 'any-active' }), itemController.getItemListByCode);
router.get('/:id',              authMiddleware, authorize({ tag: 'any-active' }), itemController.getItemById);

// Write — Purchase, FAS, and Admin (intentional business rule)
router.post('/create', authMiddleware, authorize({ tag: 'any-active' }), itemController.createItem);
router.put('/:id',     authMiddleware, authorize({ tag: 'any-active' }), itemController.updateItem);
router.delete('/:id',  authMiddleware, authorize({ tag: 'any-active' }), itemController.deleteItem);

module.exports = router;
