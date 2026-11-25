// Payment Costing lines: the numbered cost rows of the Accounts cost sheet, stored as real fields.
// The number of lines is dynamic (taken from the imported sheet); nothing here assumes 36.
//
// line: { sn, description, costDh, billRefNo, billRefParty, paymentReference, remarks, borneByRhgt, borneBySilal }

const MAX_LINES = 500;
const TOLERANCE = 0.01;
const TEXT_LIMITS = { description: 300, billRefNo: 200, billRefParty: 200, paymentReference: 200, remarks: 500 };
const TEXT_FIELDS = Object.keys(TEXT_LIMITS);
const AMOUNT_FIELDS = ['costDh', 'borneByRhgt', 'borneBySilal'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

class CostLinesError extends Error {}

const toAmount = (raw, label) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw.replace(/,/g, '').trim()) : Number(raw);
  if (!Number.isFinite(n)) throw new CostLinesError(`${label} must be a number.`);
  return round2(n);
};

const toText = (raw, limit) => (raw == null ? '' : String(raw).trim().slice(0, limit));

const n0 = (v) => (v == null ? 0 : Number(v));

// Validates and normalises lines sent by the client. `expectedCount` (when given) pins the number of
// lines to the stored sheet: the count always comes from the imported file, never from the client.
function sanitiseLines(input, expectedCount) {
  if (!Array.isArray(input)) throw new CostLinesError('Lines must be a list.');
  if (input.length > MAX_LINES) throw new CostLinesError(`At most ${MAX_LINES} lines are supported.`);
  if (typeof expectedCount === 'number' && input.length !== expectedCount) {
    throw new CostLinesError('The number of lines cannot be changed here. Re-import the Excel file to change it.');
  }
  return input.map((raw, index) => {
    const sn = Number(raw?.sn);
    if (!Number.isInteger(sn) || sn < 1) throw new CostLinesError(`Line ${index + 1}: SN must be a whole number.`);
    const line = { sn };
    TEXT_FIELDS.forEach((f) => { line[f] = toText(raw?.[f], TEXT_LIMITS[f]); });
    AMOUNT_FIELDS.forEach((f) => { line[f] = toAmount(raw?.[f], `Line ${sn}: ${f}`); });
    const hasSplit = line.borneByRhgt != null || line.borneBySilal != null;
    if (hasSplit && Math.abs(n0(line.costDh) - (n0(line.borneByRhgt) + n0(line.borneBySilal))) > TOLERANCE) {
      throw new CostLinesError(`Line ${sn}: Borne By RHGT + Borne by Silal must equal Cost DH.`);
    }
    return line;
  });
}

function computeTotals(lines) {
  const sum = (field) => round2((lines || []).reduce((acc, l) => acc + n0(l[field]), 0));
  return { count: (lines || []).length, costDh: sum('costDh'), borneByRhgt: sum('borneByRhgt'), borneBySilal: sum('borneBySilal') };
}

// SNs of lines whose content differs between two saved versions.
function changedLineSns(before, after) {
  const prev = new Map((before || []).map((l) => [l.sn, l]));
  const fields = [...TEXT_FIELDS, ...AMOUNT_FIELDS];
  return (after || []).filter((l) => {
    const old = prev.get(l.sn);
    return !old || fields.some((f) => (old[f] ?? (TEXT_FIELDS.includes(f) ? '' : null)) !== l[f]);
  }).map((l) => l.sn);
}

module.exports = { MAX_LINES, round2, sanitiseLines, computeTotals, changedLineSns, CostLinesError };
