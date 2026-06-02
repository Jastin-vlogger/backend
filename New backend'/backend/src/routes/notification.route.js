const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification.controller');
const authMiddleware = require('../core/utils/authMiddleware');

function internalApiGuard(req, res, next) {
  const expectedKey = process.env.INTERNAL_API_KEY || process.env.SUPPLIER_INTERNAL_API_KEY || 'shipment-internal-key';
  const providedKey = req.headers['x-internal-api-key'];

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ message: 'Unauthorized internal request' });
  }

  next();
}

router.get('/', authMiddleware, notificationController.listNotifications);
router.get('/unread-count', authMiddleware, notificationController.getUnreadCount);
router.patch('/:id/read', authMiddleware, notificationController.markAsRead);
router.post('/supplier-shipment-update', internalApiGuard, notificationController.createSupplierShipmentUpdateNotification);

module.exports = router;
