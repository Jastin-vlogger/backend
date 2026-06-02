const SUPPLIER_PROFILE_FIELDS = [
  'name',
  'companyName',
  'contactPersonName',
  'contactEmail',
  'contactPhone',
  'country',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'registrationNotes',
];

function hasValue(value) {
  return String(value ?? '').trim().length > 0;
}

function calculateSupplierOnboardingState(supplier) {
  const missingFields = SUPPLIER_PROFILE_FIELDS.filter((field) => !hasValue(supplier?.[field]));
  const completedFields = SUPPLIER_PROFILE_FIELDS.length - missingFields.length;
  const profileCompletionPercent =
    completedFields === SUPPLIER_PROFILE_FIELDS.length
      ? 100
      : Math.round((completedFields / SUPPLIER_PROFILE_FIELDS.length) * 100);
  const registrationStage = profileCompletionPercent === 100 ? 'Draft' : 'In Progress';

  return {
    registrationStage,
    profileCompletionPercent,
    profileCompletedAt:
      profileCompletionPercent === 100
        ? supplier?.profileCompletedAt
          ? new Date(supplier.profileCompletedAt)
          : new Date()
        : null,
    missingFields,
  };
}

function normalizeSupplierOnboardingState(supplier) {
  if (
    typeof supplier?.profileCompletionPercent === 'number' &&
    ['In Progress', 'Draft'].includes(supplier?.registrationStage)
  ) {
    return {
      registrationStage: supplier.registrationStage,
      profileCompletionPercent: supplier.profileCompletionPercent,
      profileCompletedAt: supplier.profileCompletedAt ? new Date(supplier.profileCompletedAt) : null,
      missingFields: SUPPLIER_PROFILE_FIELDS.filter((field) => !hasValue(supplier?.[field])),
    };
  }

  if (supplier?.status === 'Active') {
    return {
      registrationStage: 'Draft',
      profileCompletionPercent: 100,
      profileCompletedAt: supplier?.profileCompletedAt ? new Date(supplier.profileCompletedAt) : new Date(),
      missingFields: [],
    };
  }

  return calculateSupplierOnboardingState(supplier);
}

module.exports = {
  SUPPLIER_PROFILE_FIELDS,
  calculateSupplierOnboardingState,
  normalizeSupplierOnboardingState,
};
