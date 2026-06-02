const express = require('express');
const supplierAdminController = require('../controller/supplierAdmin.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize({ tag: 'any-active' }));

router.get('/', supplierAdminController.listSuppliers);
router.get('/:id', supplierAdminController.getSupplierById);
router.patch('/:id', supplierAdminController.updateSupplier);
router.patch('/:id/status', supplierAdminController.updateSupplierStatus);

module.exports = router;
