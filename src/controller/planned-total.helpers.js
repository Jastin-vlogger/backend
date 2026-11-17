// Rule for the shipment's ORDERED total (plannedQtyMT) when scheduled rows are saved.
// The PO total is the quantity ordered, so saving a schedule must never shrink it: a save that
// carried a small remainder row used to overwrite 2,520 MT with the sum of the rows (2,270.04).
// It only grows if the rows somehow add up to more than the stored total.

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const resolvePlannedQtyMT = (existingTotalMT, rowsTotalMT) =>
  round2(Math.max(toNumber(existingTotalMT), toNumber(rowsTotalMT)));

module.exports = { resolvePlannedQtyMT };
