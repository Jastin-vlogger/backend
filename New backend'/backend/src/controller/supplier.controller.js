const Supplier = require('../models/supplier.model');
const User = require('../models/auth.model');
const Notification = require('../models/notification.model');
const logAudit = require('../core/utils/auditLogger');
const { normalizeSupplierOnboardingState } = require('../core/utils/supplierOnboarding');

// Create Supplier
exports.createSupplier = async (req, res) => {
  try {
    const { supplierCode, name, country, contactEmail, contactPersonName, contactPhone } = req.body;

    // Check if supplier code already exists
    const existing = await Supplier.findOne({ supplierCode });
    if (existing) return res.status(400).json({ message: "Supplier code already exists" });

    const supplier = await Supplier.create({
      supplierCode,
      name,
      companyName: name,
      country,
      contactEmail,
      contactPersonName,
      contactPhone,
      status: 'Active',
      registrationStage: 'Draft',
      profileCompletionPercent: 100,
      profileCompletedAt: new Date(),
      activatedAt: new Date(),
      activatedBy: req.user._id,
    });

    const activeUsers = await User.find({ isActive: true }).select('_id').lean();
    if (activeUsers.length) {
      await Notification.insertMany(
        activeUsers.map((user) => ({
          userId: user._id,
          type: 'supplier_registered',
          title: 'Supplier registered',
          message: `${name} (${supplierCode}) was registered successfully.`,
          entity: 'Supplier',
          entityId: supplier._id,
        }))
      );
    }

    // Audit log
    await logAudit({
      userId: req.user._id,
      module: "Master",
      entity: "Supplier",
      entityId: supplier._id,
      action: "Created",
      before: {},
      after: {
        supplierCode,
        name,
        country,
        contactEmail,
        contactPersonName,
        contactPhone,
        status: 'Active',
        registrationStage: 'Draft',
        profileCompletionPercent: 100,
      },
      remarks: "Supplier created"
    });

    res.status(201).json({ message: "Supplier created", supplier });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    const onboardingState = normalizeSupplierOnboardingState(supplier);
    res.json({
      ...supplier.toObject(),
      registrationStage: onboardingState.registrationStage,
      profileCompletionPercent: onboardingState.profileCompletionPercent,
      profileCompletedAt: onboardingState.profileCompletedAt,
      missingFields: onboardingState.missingFields,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
