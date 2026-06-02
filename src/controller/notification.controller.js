const Notification = require('../models/notification.model');
const User = require('../models/auth.model');

exports.listNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      $or: [
        { userId: req.user._id },
        { recipientId: req.user._id }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const unreadCount = await Notification.countDocuments({
      $or: [
        { userId: req.user._id },
        { recipientId: req.user._id }
      ],
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      $or: [
        { userId: req.user._id },
        { recipientId: req.user._id }
      ],
      isRead: false,
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id, 
        $or: [
          { userId: req.user._id },
          { recipientId: req.user._id }
        ]
      },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.json({ message: 'Notification marked as read', notification, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createSupplierShipmentUpdateNotification = async (req, res) => {
  try {
    const {
      shipmentId,
      shipmentNo,
      supplierName,
      plannedDepartureDate,
      plannedArrivalDate,
    } = req.body || {};

    if (!shipmentId || !shipmentNo || !supplierName) {
      return res.status(400).json({ message: 'shipmentId, shipmentNo, and supplierName are required.' });
    }

    const etd = plannedDepartureDate ? new Date(plannedDepartureDate) : null;
    const eta = plannedArrivalDate ? new Date(plannedArrivalDate) : null;
    const formatDate = (value) => {
      if (!value || Number.isNaN(value.getTime())) return '—';
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(value);
    };

    const message = `${supplierName} updated ETA / ETD for ${shipmentNo}. ETD: ${formatDate(etd)}. ETA: ${formatDate(eta)}.`;
    const activeAdmins = await User.find({ isActive: true }).select('_id').lean();

    if (activeAdmins.length) {
      const notifications = activeAdmins.map((admin) => ({
        userId: admin._id,
        type: 'supplier_eta_etd_updated',
        title: 'Supplier ETA / ETD Updated',
        message,
        entity: 'Shipment',
        entityId: shipmentId,
      }));
      await Notification.insertMany(notifications);
    }

    if (global.io) {
      global.io.to('admin').emit('NOTIFICATION', {
        type: 'supplier_eta_etd_updated',
        title: 'Supplier ETA / ETD Updated',
        message,
        entity: 'Shipment',
        entityId: shipmentId,
      });
    }

    res.json({ message: 'Notification created successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
