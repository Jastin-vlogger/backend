const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeBlNo = (value) => String(value || '').trim().toUpperCase();

const getActual = (container) => container?.actual || {};

const toPlain = (value) => {
  if (value && typeof value.toObject === 'function') return value.toObject();
  return value;
};

const cloneSyncValue = (value) => {
  const plain = toPlain(value);
  if (plain == null) return plain;
  if (plain instanceof Date) return new Date(plain.getTime());
  if (plain && typeof plain.toHexString === 'function') return plain;
  if (Array.isArray(plain)) return plain.map((item) => cloneSyncValue(item));
  if (typeof plain === 'object') {
    return Object.fromEntries(Object.entries(plain).map(([key, entry]) => [key, cloneSyncValue(entry)]));
  }
  return plain;
};

const hasSyncValue = (value) => {
  const plain = toPlain(value);
  if (plain == null) return false;
  if (Array.isArray(plain)) return plain.length > 0;
  if (plain instanceof Date) return !Number.isNaN(plain.getTime());
  if (typeof plain === 'object') return Object.keys(plain).length > 0;
  return String(plain).trim().length > 0;
};

const isMissingSyncValue = (value) => !hasSyncValue(value);

const buildSameBlQuery = (sourceContainer, matchBlNo) => {
  const normalizedBl = normalizeBlNo(matchBlNo ?? getActual(sourceContainer).BLNo);
  if (!normalizedBl) return null;

  return {
    _id: { $ne: sourceContainer._id },
    'actual.BLNo': { $regex: `^\\s*${escapeRegex(normalizedBl)}\\s*$`, $options: 'i' },
  };
};

const buildSameBlOrSameShipmentQuery = (sourceContainer, matchBlNo) => {
  const normalizedBl = normalizeBlNo(matchBlNo ?? getActual(sourceContainer).BLNo);
  const clauses = [];

  if (normalizedBl) {
    clauses.push({ 'actual.BLNo': { $regex: `^\\s*${escapeRegex(normalizedBl)}\\s*$`, $options: 'i' } });
  }

  if (sourceContainer?.shipmentId) {
    clauses.push({
      shipmentId: sourceContainer.shipmentId,
      status: { $ne: 'Planned' },
    });
  }

  if (!clauses.length) return null;

  return {
    _id: { $ne: sourceContainer._id },
    $or: clauses,
  };
};

const buildActualSetFromSource = (sourceContainer, fields) => {
  const actual = getActual(sourceContainer);
  return fields.reduce((set, field) => {
    if (actual[field] !== undefined) {
      set[`actual.${field}`] = cloneSyncValue(actual[field]);
    }
    return set;
  }, {});
};

const applyActualSet = (targetContainer, actualSet) => {
  if (!targetContainer.actual) targetContainer.actual = {};
  Object.entries(actualSet).forEach(([path, value]) => {
    const field = path.replace(/^actual\./, '');
    targetContainer.actual[field] = cloneSyncValue(value);
  });
  return targetContainer;
};

const syncSameBlActualFields = async ({ ContainerModel, sourceContainer, fields, matchBlNo }) => {
  const query = buildSameBlQuery(sourceContainer, matchBlNo);
  const actualSet = buildActualSetFromSource(sourceContainer, fields);
  if (!query || Object.keys(actualSet).length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const result = await ContainerModel.updateMany(query, { $set: actualSet });
  return {
    matchedCount: result?.matchedCount ?? result?.n ?? 0,
    modifiedCount: result?.modifiedCount ?? result?.nModified ?? 0,
  };
};

const syncSameBlOrSameShipmentActualFields = async ({ ContainerModel, sourceContainer, fields, matchBlNo }) => {
  const query = buildSameBlOrSameShipmentQuery(sourceContainer, matchBlNo);
  const actualSet = buildActualSetFromSource(sourceContainer, fields);
  if (!query || Object.keys(actualSet).length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const result = await ContainerModel.updateMany(query, { $set: actualSet });
  return {
    matchedCount: result?.matchedCount ?? result?.n ?? 0,
    modifiedCount: result?.modifiedCount ?? result?.nModified ?? 0,
  };
};

const hydrateMissingSameBlActualFields = async ({ ContainerModel, targetContainer, fields }) => {
  const query = buildSameBlQuery(targetContainer);
  if (!query) return { hydrated: false, fields: [] };

  const peer = await ContainerModel.findOne(query);
  if (!peer?.actual) return { hydrated: false, fields: [] };

  if (!targetContainer.actual) targetContainer.actual = {};
  const hydratedFields = [];

  fields.forEach((field) => {
    const peerValue = peer.actual[field];
    if (isMissingSyncValue(targetContainer.actual[field]) && hasSyncValue(peerValue)) {
      targetContainer.actual[field] = cloneSyncValue(peerValue);
      hydratedFields.push(field);
    }
  });

  if (hydratedFields.length && typeof targetContainer.save === 'function') {
    await targetContainer.save();
  }

  return { hydrated: hydratedFields.length > 0, fields: hydratedFields };
};

const syncSameBlActualFieldsInMemory = ({ containers, sourceId, fields, matchBlNo }) => {
  const source = containers.find((container) => String(container._id) === String(sourceId));
  const query = buildSameBlQuery(source, matchBlNo);
  const normalizedBl = normalizeBlNo(matchBlNo ?? getActual(source).BLNo);
  const actualSet = buildActualSetFromSource(source, fields);
  if (!query || Object.keys(actualSet).length === 0) return [];

  return containers
    .filter((container) => String(container._id) !== String(sourceId))
    .filter((container) => normalizeBlNo(getActual(container).BLNo) === normalizedBl)
    .map((container) => applyActualSet(container, actualSet));
};

const syncSameBlOrSameShipmentActualFieldsInMemory = ({ containers, sourceId, fields, matchBlNo }) => {
  const source = containers.find((container) => String(container._id) === String(sourceId));
  const normalizedBl = normalizeBlNo(matchBlNo ?? getActual(source).BLNo);
  const sourceShipmentId = source?.shipmentId ? String(source.shipmentId) : '';
  const actualSet = buildActualSetFromSource(source, fields);
  if (!source || Object.keys(actualSet).length === 0 || (!normalizedBl && !sourceShipmentId)) return [];

  return containers
    .filter((container) => String(container._id) !== String(sourceId))
    .filter((container) => {
      const sameBl = normalizedBl && normalizeBlNo(getActual(container).BLNo) === normalizedBl;
      const sameShipment = sourceShipmentId &&
        String(container.shipmentId || '') === sourceShipmentId &&
        container.status !== 'Planned';
      return sameBl || sameShipment;
    })
    .map((container) => applyActualSet(container, actualSet));
};

const hydrateMissingSameBlActualFieldsInMemory = ({ containers, targetId, fields }) => {
  const target = containers.find((container) => String(container._id) === String(targetId));
  const normalizedBl = normalizeBlNo(getActual(target).BLNo);
  if (!target || !normalizedBl) return [];

  const peer = containers.find((container) =>
    String(container._id) !== String(targetId) &&
    normalizeBlNo(getActual(container).BLNo) === normalizedBl
  );
  if (!peer?.actual) return [];

  if (!target.actual) target.actual = {};
  const hydratedFields = [];
  fields.forEach((field) => {
    const peerValue = peer.actual[field];
    if (isMissingSyncValue(target.actual[field]) && hasSyncValue(peerValue)) {
      target.actual[field] = cloneSyncValue(peerValue);
      hydratedFields.push(field);
    }
  });
  return hydratedFields;
};

const SAME_BL_CLEARING_ADVANCE_FIELDS = [
  'costSheetBookings',
  'costSheetBookingDocumentUrl',
  'costSheetBookingDocumentName',
  'clearingAdvancePaymentDetails',
  'clearingAdvanceApproval',
  'additionalClearingAdvanceRequests',
];

const SAME_BL_PAYMENT_ALLOCATION_FIELDS = [
  'paymentAllocations',
  'paymentAllocationApproval',
];

const SAME_BL_DOCUMENT_TRACKER_FIELDS = [
  'BLNo',
  'CLNo',
  'DHL',
  'courierTrackNo',
  'courierServiceProvider',
  'expectedDocDate',
  'receiver',
  'bankName',
  'docArrivalNotes',
  'inwardCollectionAdviceDate',
  'inwardCollectionAdviceReceivedAt',
  'inwardCollectionAdviceSubmittedAt',
  'inwardCollectionAdviceDocumentUrl',
  'inwardCollectionAdviceDocumentName',
  'murabahaContractReleasedDate',
  'murabahaContractApprovedDate',
  'murabahaContractSubmittedDate',
  'murabahaContractSubmittedDocumentUrl',
  'murabahaContractSubmittedDocumentName',
  'documentsReleasedDate',
  'documentsReleasedDocumentUrl',
  'documentsReleasedDocumentName',
  'bankAdvanceAmountDocumentUrl',
  'bankAdvanceApprovedDocumentUrl',
  'bankAdvanceSubmittedOn',
  'docToBeReleasedOn',
];

const SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS = [
  'BLNo',
  'CLNo',
  'blDocumentUrl',
  'blDocumentName',
];

const SAME_BL_INHERIT_FIELDS = [
  ...SAME_BL_CLEARING_ADVANCE_FIELDS,
  ...SAME_BL_PAYMENT_ALLOCATION_FIELDS,
];

module.exports = {
  normalizeBlNo,
  buildSameBlQuery,
  buildSameBlOrSameShipmentQuery,
  buildActualSetFromSource,
  syncSameBlActualFields,
  syncSameBlOrSameShipmentActualFields,
  hydrateMissingSameBlActualFields,
  syncSameBlActualFieldsInMemory,
  syncSameBlOrSameShipmentActualFieldsInMemory,
  hydrateMissingSameBlActualFieldsInMemory,
  SAME_BL_CLEARING_ADVANCE_FIELDS,
  SAME_BL_PAYMENT_ALLOCATION_FIELDS,
  SAME_BL_DOCUMENT_TRACKER_FIELDS,
  SAME_BL_ACTUAL_BL_DOCUMENT_FIELDS,
  SAME_BL_INHERIT_FIELDS,
};
