const Supplier = require('../models/supplier.model');
const SupplierAccount = require('../models/supplierAccount.model');
const Notification = require('../models/notification.model');
const logAudit = require('../core/utils/auditLogger');
const {
  calculateSupplierOnboardingState,
  normalizeSupplierOnboardingState,
} = require('../core/utils/supplierOnboarding');

function createSupplierSnapshot(supplier) {
  const onboardingState = normalizeSupplierOnboardingState(supplier);

  return {
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    companyName: supplier.companyName,
    country: supplier.country,
    status: supplier.status,
    contactPersonName: supplier.contactPersonName,
    contactEmail: supplier.contactEmail,
    contactPhone: supplier.contactPhone,
    addressLine1: supplier.addressLine1,
    addressLine2: supplier.addressLine2,
    city: supplier.city,
    state: supplier.state,
    postalCode: supplier.postalCode,
    registrationNotes: supplier.registrationNotes,
    registrationStage: onboardingState.registrationStage,
    profileCompletionPercent: onboardingState.profileCompletionPercent,
    profileCompletedAt: onboardingState.profileCompletedAt,
  };
}

function serializeSupplier(supplier, account = null) {
  const onboardingState = normalizeSupplierOnboardingState(supplier);

  return {
    ...supplier,
    registrationStage: onboardingState.registrationStage,
    profileCompletionPercent: onboardingState.profileCompletionPercent,
    profileCompletedAt: onboardingState.profileCompletedAt,
    missingFields: onboardingState.missingFields,
    account,
  };
}

exports.listSuppliers = async (req, res) => {
  try {
    let { page = 1, limit = 20, search = '', status = '', includeIncomplete = '' } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const showIncomplete = String(includeIncomplete).toLowerCase() === 'true';

    const query = {};
    const andConditions = [];

    if (status) {
      query.status = status;
    }

    if (search) {
      andConditions.push({
        $or: [
        { supplierCode: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (andConditions.length) {
      query.$and = andConditions;
    }

    const suppliers = await Supplier.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const supplierIds = suppliers.map((supplier) => supplier._id);
    const accounts = await SupplierAccount.find({ supplierId: { $in: supplierIds } })
      .select('supplierId email isActive lastLoginAt')
      .lean();

    const accountMap = new Map(accounts.map((account) => [String(account.supplierId), account]));
    const hydratedSuppliers = suppliers
      .map((supplier) => serializeSupplier(supplier, accountMap.get(String(supplier._id)) || null))
      .filter((supplier) => showIncomplete || supplier.registrationStage === 'Draft');
    const total = hydratedSuppliers.length;
    const paginatedSuppliers = hydratedSuppliers.slice((page - 1) * limit, page * limit);

    res.json({
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      suppliers: paginatedSuppliers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const account = await SupplierAccount.findOne({ supplierId: supplier._id })
      .select('supplierId email isActive lastLoginAt createdAt updatedAt')
      .lean();

    res.json(serializeSupplier(supplier, account || null));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const before = createSupplierSnapshot(supplier);
    const allowedFields = [
      'name',
      'companyName',
      'country',
      'contactPersonName',
      'contactEmail',
      'contactPhone',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'registrationNotes',
    ];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        supplier[field] = req.body[field];
      }
    });

    const onboardingState = calculateSupplierOnboardingState(supplier);
    supplier.registrationStage = onboardingState.registrationStage;
    supplier.profileCompletionPercent = onboardingState.profileCompletionPercent;
    supplier.profileCompletedAt = onboardingState.profileCompletedAt;
    supplier.lastProfileUpdatedAt = new Date();
    await supplier.save();

    if (Object.prototype.hasOwnProperty.call(req.body, 'contactEmail')) {
      await SupplierAccount.findOneAndUpdate(
        { supplierId: supplier._id },
        { email: String(req.body.contactEmail || '').trim().toLowerCase() }
      );
    }

    await logAudit({
      userId: req.user._id,
      module: 'Master',
      entity: 'Supplier',
      entityId: supplier._id,
      action: 'Updated',
      before,
      after: createSupplierSnapshot(supplier),
      remarks: 'Supplier profile updated',
    });

    res.json({ message: 'Supplier updated successfully', supplier: serializeSupplier(supplier.toObject()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateSupplierStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const previousStatus = supplier.status;
    supplier.status = status;
    if (status === 'Active') {
      supplier.activatedAt = new Date();
      supplier.activatedBy = req.user._id;
    }
    await supplier.save();

    const account = await SupplierAccount.findOne({ supplierId: supplier._id });
    if (account) {
      account.isActive = status === 'Active';
      account.email = supplier.contactEmail || account.email;
      await account.save();

      await Notification.create({
        recipientType: 'SupplierAccount',
        recipientId: account._id,
        type: 'supplier_status_updated',
        title: 'Supplier account status updated',
        message: `Your supplier account is now ${status}.`,
        entity: 'Supplier',
        entityId: supplier._id,
      });
    }

    await logAudit({
      userId: req.user._id,
      module: 'Master',
      entity: 'Supplier',
      entityId: supplier._id,
      action: 'Status Updated',
      before: { status: previousStatus },
      after: { status },
      remarks: `Supplier status changed from ${previousStatus} to ${status}`,
    });

    res.json({ message: 'Supplier status updated successfully', supplier: serializeSupplier(supplier.toObject()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
