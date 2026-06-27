// Pure, side-effect-free helpers for the logistics (Port & Clearance / Regulatory)
// save flow. Kept in their own module so they can be unit-tested without loading the
// full shipment controller (which has heavy import-time side effects).

const toLogisticsDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Assigns the Port & Clearance / Regulatory scalar fields that the logistics save
// previously dropped. Only assigns fields present in `body` (i.e. !== undefined) so a
// partial section save never clobbers unrelated, already-saved values.
// Returns the mutated `target` for convenience.
const applyLogisticsScalarFields = (target, body = {}) => {
  if (!target) return target;
  if (body.commercialDocumentReceivedDate !== undefined) {
    target.commercialDocumentReceivedDate = toLogisticsDate(body.commercialDocumentReceivedDate);
  }
  if (body.freeDetentionDays !== undefined) {
    target.freeDetentionDays = Number(body.freeDetentionDays) || 0;
  }
  if (body.freeStorageDays !== undefined) {
    target.freeStorageDays = Number(body.freeStorageDays) || 0;
  }
  if (body.clearanceRemarks !== undefined) {
    target.clearanceRemarks = body.clearanceRemarks || '';
  }
  if (body.doRemarks !== undefined) {
    target.doRemarks = body.doRemarks || '';
  }
  if (body.customerInspectionRequired !== undefined) {
    target.customerInspectionRequired = String(body.customerInspectionRequired) === 'true';
  }
  if (body.municipalityReleasedDate !== undefined) {
    target.municipalityReleasedDate = toLogisticsDate(body.municipalityReleasedDate);
  }
  if (body.municipalityResponseRemarks !== undefined) {
    target.municipalityResponseRemarks = body.municipalityResponseRemarks || '';
  }
  if (body.municipalityComments !== undefined) {
    target.municipalityComments = body.municipalityComments || '';
  }
  return target;
};

module.exports = { toLogisticsDate, applyLogisticsScalarFields };
