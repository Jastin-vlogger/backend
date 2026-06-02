const express = require('express');
const router = express.Router();
const controller = require('../controller/exchangeRate.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read active rates — any active role (needed across all teams for shipment costing)
router.get('/active', authMiddleware, authorize({ tag: 'any-active' }), controller.getActive);

router.get('/',       authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.exchange_rates.view'] }), controller.getAll);
router.get('/:id',    authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.exchange_rates.view'] }), controller.getById);
router.post('/',      authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.exchange_rates.edit'] }), controller.create);
router.put('/:id',    authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.exchange_rates.edit'] }), controller.update);
router.delete('/:id', authMiddleware, authorize({ roles: ['Admin', 'Manager'], permissions: ['settings.tab.exchange_rates.edit'] }), controller.remove);

module.exports = router;
