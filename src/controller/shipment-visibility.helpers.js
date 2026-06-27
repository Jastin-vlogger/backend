// Pure, unit-testable helpers for role-based shipment-list visibility.

// Pre-transit statuses that should be HIDDEN from FAS users. These are the only
// stages before a shipment is "On Transit"; everything else (On Transit, At Port of
// Discharge, Reached/Delivered WH, GRN Completed, Completed) is visible.
// Matching is done loosely on "yet to" so both the ETD and ETA pre-transit variants
// ("ETD yet to be confirmed", "ETD yet to Due", "ETA yet to due") are excluded.
const isOnTransitOrLaterStatus = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false; // unknown / not yet scheduled => pre-transit, hide from FAS
  if (s.includes('yet to')) return false;
  return true;
};

module.exports = { isOnTransitOrLaterStatus };
