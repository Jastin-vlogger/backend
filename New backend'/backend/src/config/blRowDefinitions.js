const normalizeVisibleTo = (value) => {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((entry) => String(entry || '').trim().toLowerCase())
    .map((entry) => (entry === 'logistics' ? 'logistic' : entry))
    .filter(Boolean);

  return normalized.length ? Array.from(new Set(normalized)) : ['logistic', 'fas'];
};

const normalizeNumericDefault = (value, fallback) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const slugifyKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const normalizeDescription = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const RAW_BL_ROW_DEFINITIONS = [
  { sn: 1, description: 'Invoice Attestation - MOFAIC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 2, description: 'DO Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 3, description: 'DO Extension', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 4, description: 'Air Cargo Clearing Charge', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 5, description: 'Labour Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 6, description: 'Other Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 7, description: 'BOE', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 8, description: 'Custom Duty 5%', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 9, description: 'Custom Pay Service Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 10, description: 'DP Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 11, description: 'TLUC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 12, description: 'THC', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 13, description: 'DP Storage Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 14, description: 'DP Storage Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 15, description: 'Mun Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 16, description: 'Addi Gate Token', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 17, description: 'DP Gate Token', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 18, description: 'Transportation Single @rate (ALAIN)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 19, description: 'Transportation Single @rate (AD)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 20, description: 'Transportation Single/Couple @rate (DIC)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 21, description: 'Transportation Single/Couple @rate (Location)', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 22, description: 'Inspection Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 23, description: 'Inspection Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 24, description: 'Offloading Charges 01', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 25, description: 'Offloading Charges 02', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 26, description: 'Mecrec Charges', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 27, description: 'Open & Close Fees with Sales at Customs', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 28, description: 'Other', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'Murabaha Profit', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'Document Processing Charge', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'EXCES ATM Payment', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'DO ONLINE PAYMENT SERVICE CHARGE 1.5%', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'DO ONLINE PAYMENT SERVICE CHARGE 5% VAT', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
  { sn: 29, description: 'MOFA INVOICE & CCO ATTESTATION FEES', visibleTo: ['logistic', 'fas'], defaultQty: 1, defaultRate: 0 },
];

const dedupeAndRenumber = (rows) => {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const description = String(row?.description || '').trim();
    if (!description) continue;
    const normalizedDescription = normalizeDescription(description);
    if (seen.has(normalizedDescription)) continue;
    seen.add(normalizedDescription);
    result.push({
      key: slugifyKey(description),
      sn: result.length + 1,
      description,
      visibleTo: normalizeVisibleTo(row?.visibleTo),
      defaultQty: normalizeNumericDefault(row?.defaultQty, 1),
      defaultRate: normalizeNumericDefault(row?.defaultRate, 0),
    });
  }

  return result;
};

const DEFAULT_BL_ROW_DEFINITIONS = dedupeAndRenumber(RAW_BL_ROW_DEFINITIONS);

module.exports = {
  DEFAULT_BL_ROW_DEFINITIONS,
  normalizeNumericDefault,
  normalizeVisibleTo,
  normalizeDescription,
  slugifyKey,
};
