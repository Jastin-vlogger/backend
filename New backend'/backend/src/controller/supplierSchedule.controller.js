const SupplierSchedule = require('../models/supplierSchedule.model');
const SupplierAccount = require('../models/supplierAccount.model');
const Notification = require('../models/notification.model');
const logAudit = require('../core/utils/auditLogger');

function formatHistoryValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  return String(value);
}

function appendScheduleHistory(schedule, { action, actorType, actorName = '', changes = [] }) {
  schedule.scheduleHistory = schedule.scheduleHistory || [];
  schedule.scheduleHistory.push({
    action,
    actorType,
    actorName,
    changes,
    createdAt: new Date(),
  });
}

function buildScheduleQuery(queryParams) {
  const query = {};
  if (queryParams.status) {
    query.status = queryParams.status;
  }

  if (queryParams.supplierId) {
    query.supplierId = queryParams.supplierId;
  }

  if (queryParams.search) {
    query.$or = [
      { title: { $regex: queryParams.search, $options: 'i' } },
      { referenceNo: { $regex: queryParams.search, $options: 'i' } },
      { origin: { $regex: queryParams.search, $options: 'i' } },
      { destination: { $regex: queryParams.search, $options: 'i' } },
    ];
  }

  return query;
}

async function createSupplierNotification(schedule, message, type) {
  const supplierAccountId = schedule.supplierAccountId || (
    await SupplierAccount.findOne({ supplierId: schedule.supplierId }).select('_id').lean()
  )?._id;

  if (!supplierAccountId) {
    return;
  }

  await Notification.create({
    recipientType: 'SupplierAccount',
    recipientId: supplierAccountId,
    type,
    title: 'Schedule update',
    message,
    entity: 'SupplierSchedule',
    entityId: schedule._id,
  });

  // REAL-TIME BROADCAST TO ADMINS
  if (global.io) {
    global.io.to('admin').emit('NOTIFICATION', {
      type,
      message,
      title: 'Schedule activity'
    });
  }
}

exports.listSchedules = async (req, res) => {
  try {
    let { page = 1, limit = 20 } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = buildScheduleQuery(req.query);
    const total = await SupplierSchedule.countDocuments(query);
    const schedules = await SupplierSchedule.find(query)
      .populate('supplierId', 'supplierCode name companyName status contactEmail contactPersonName')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      schedules,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getScheduleById = async (req, res) => {
  try {
    const schedule = await SupplierSchedule.findById(req.params.id)
      .populate('supplierId', 'supplierCode name companyName status contactEmail contactPersonName contactPhone country')
      .populate('reviewedBy', 'name email role')
      .lean();

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.approveSchedule = async (req, res) => {
  try {
    const schedule = await SupplierSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const before = {
      status: schedule.status,
      rejectionReason: schedule.rejectionReason,
      adminSuggestion: schedule.adminSuggestion,
    };

    schedule.status = 'Approved';
    schedule.approvedAt = new Date();
    schedule.rejectedAt = null;
    schedule.rejectionReason = '';
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminSuggestion')) {
      schedule.adminSuggestion = req.body.adminSuggestion || '';
    }
    schedule.reviewedBy = req.user._id;
    appendScheduleHistory(schedule, {
      action: 'Schedule approved',
      actorType: 'Admin',
      actorName: req.user?.name || req.user?.email || 'Admin',
      changes: [
        { field: 'status', label: 'Status', previousValue: before.status || '', nextValue: 'Approved' },
      ],
    });
    await schedule.save();

    await createSupplierNotification(schedule, `Schedule "${schedule.title}" has been approved.`, 'supplier_schedule_approved');
    await logAudit({
      userId: req.user._id,
      module: 'Supplier Schedule',
      entity: 'SupplierSchedule',
      entityId: schedule._id,
      action: 'Approved',
      before,
      after: {
        status: schedule.status,
        rejectionReason: schedule.rejectionReason,
        adminSuggestion: schedule.adminSuggestion,
      },
      remarks: 'Supplier schedule approved',
    });

    const populatedSchedule = await SupplierSchedule.findById(schedule._id)
      .populate('supplierId', 'supplierCode name companyName status contactEmail contactPersonName contactPhone country')
      .populate('reviewedBy', 'name email role')
      .lean();

    res.json({ message: 'Schedule approved successfully', schedule: populatedSchedule });

    // REAL-TIME BROADCAST
    if (global.io) {
      const supplierId = populatedSchedule.supplierId?._id || populatedSchedule.supplierId;
      global.io.to(`supplier_${supplierId}`).emit('SCHEDULE_UPDATED', {
        type: 'APPROVED',
        id: populatedSchedule._id,
        title: populatedSchedule.title
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.rejectSchedule = async (req, res) => {
  try {
    const { rejectionReason, adminSuggestion = '' } = req.body;
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const schedule = await SupplierSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const before = {
      status: schedule.status,
      rejectionReason: schedule.rejectionReason,
      adminSuggestion: schedule.adminSuggestion,
    };

    schedule.status = 'Rejected';
    schedule.rejectedAt = new Date();
    schedule.approvedAt = null;
    schedule.rejectionReason = String(rejectionReason).trim();
    schedule.adminSuggestion = adminSuggestion || '';
    schedule.reviewedBy = req.user._id;
    appendScheduleHistory(schedule, {
      action: 'Schedule rejected',
      actorType: 'Admin',
      actorName: req.user?.name || req.user?.email || 'Admin',
      changes: [
        { field: 'status', label: 'Status', previousValue: before.status || '', nextValue: 'Rejected' },
        { field: 'rejectionReason', label: 'Rejection reason', previousValue: before.rejectionReason || '', nextValue: schedule.rejectionReason || '' },
      ],
    });
    await schedule.save();

    await createSupplierNotification(schedule, `Schedule "${schedule.title}" was rejected.`, 'supplier_schedule_rejected');
    await logAudit({
      userId: req.user._id,
      module: 'Supplier Schedule',
      entity: 'SupplierSchedule',
      entityId: schedule._id,
      action: 'Rejected',
      before,
      after: {
        status: schedule.status,
        rejectionReason: schedule.rejectionReason,
        adminSuggestion: schedule.adminSuggestion,
      },
      remarks: 'Supplier schedule rejected',
    });

    const populatedSchedule = await SupplierSchedule.findById(schedule._id)
      .populate('supplierId', 'supplierCode name companyName status contactEmail contactPersonName contactPhone country')
      .populate('reviewedBy', 'name email role')
      .lean();

    res.json({ message: 'Schedule rejected successfully', schedule: populatedSchedule });

    // REAL-TIME BROADCAST
    if (global.io) {
      const supplierId = populatedSchedule.supplierId?._id || populatedSchedule.supplierId;
      global.io.to(`supplier_${supplierId}`).emit('SCHEDULE_UPDATED', {
        type: 'REJECTED',
        id: populatedSchedule._id,
        title: populatedSchedule.title,
        reason: populatedSchedule.rejectionReason
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateSuggestion = async (req, res) => {
  try {
    const { adminSuggestion = '' } = req.body;
    const schedule = await SupplierSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const before = { adminSuggestion: schedule.adminSuggestion };
    schedule.adminSuggestion = adminSuggestion;
    schedule.reviewedBy = req.user._id;
    appendScheduleHistory(schedule, {
      action: 'Admin suggestion updated',
      actorType: 'Admin',
      actorName: req.user?.name || req.user?.email || 'Admin',
      changes: [
        {
          field: 'adminSuggestion',
          label: 'Admin suggestion',
          previousValue: before.adminSuggestion || '',
          nextValue: schedule.adminSuggestion || '',
        },
      ],
    });
    await schedule.save();

    await createSupplierNotification(schedule, `Admin updated suggestions for schedule "${schedule.title}".`, 'supplier_schedule_suggestion_updated');
    await logAudit({
      userId: req.user._id,
      module: 'Supplier Schedule',
      entity: 'SupplierSchedule',
      entityId: schedule._id,
      action: 'Suggestion Updated',
      before,
      after: { adminSuggestion: schedule.adminSuggestion },
      remarks: 'Supplier schedule suggestion updated',
    });

    const populatedSchedule = await SupplierSchedule.findById(schedule._id)
      .populate('supplierId', 'supplierCode name companyName status contactEmail contactPersonName contactPhone country')
      .populate('reviewedBy', 'name email role')
      .lean();

    res.json({ message: 'Suggestion updated successfully', schedule: populatedSchedule });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
