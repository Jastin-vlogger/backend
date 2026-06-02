const express = require('express');
const supplierScheduleController = require('../controller/supplierSchedule.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize({ tag: 'any-active' }));

router.get('/', supplierScheduleController.listSchedules);
router.get('/:id', supplierScheduleController.getScheduleById);
router.patch('/:id/approve', supplierScheduleController.approveSchedule);
router.patch('/:id/reject', supplierScheduleController.rejectSchedule);
router.patch('/:id/suggestion', supplierScheduleController.updateSuggestion);

module.exports = router;
