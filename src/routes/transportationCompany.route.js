const express = require('express');
const router = express.Router();
const controller = require('../controller/transportationCompany.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

// Read — any active role (referenced by logistics and other teams)
router.get('/',    authMiddleware, authorize({ tag: 'any-active' }), controller.getAll);
router.get('/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.getById);

// Write — visible/editable from the frontend only when the matching Settings permission is granted
router.post('/',      authMiddleware, authorize({ tag: 'any-active' }), controller.create);
router.put('/:id',    authMiddleware, authorize({ tag: 'any-active' }), controller.update);
router.delete('/:id', authMiddleware, authorize({ tag: 'any-active' }), controller.remove);

module.exports = router;
