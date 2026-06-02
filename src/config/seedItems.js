const fs = require('fs');
const path = require('path');
const Item = require('../models/item.model');

const DEFAULT_ITEM_SEED_PATH = path.join(__dirname, '../data/rice-item-list.csv');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function toSlugMap(headers = []) {
  return headers.map((header) =>
    String(header || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  );
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHsCode(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  return normalized.replace(/:/g, '') || undefined;
}

function normalizeRow(row) {
  const bagWeightKg = parseNumber(row.unit);
  const itemCode = String(row.item_code || '').trim();
  if (!itemCode) return null;

  return {
    itemCode,
    description: String(row.item_name || '').trim(),
    riceName: String(row.brand || '').trim() || undefined,
    brand: String(row.brand || '').trim() || undefined,
    blend: String(row.blend || '').trim() || undefined,
    grainType: String(row.grain_type || '').trim() || undefined,
    processType: String(row.process_type || '').trim() || undefined,
    countryOfOrigin: String(row.coo || '').trim() || undefined,
    barcode: String(row.barcode || '').trim() || undefined,
    dmBarcode: String(row.dm_barcode || '').trim() || undefined,
    hsCode: normalizeHsCode(row.hs_code),
    variant: String(row.variant || '').trim() || undefined,
    category: 'Rice',
    packing: bagWeightKg ? `1X${bagWeightKg}KG` : undefined,
    bagWeightKg,
    unit: 'Bag',
    status: 'Active',
  };
}

async function seedItemsFromCsv() {
  const csvPath = process.env.ITEM_SEED_CSV_PATH || DEFAULT_ITEM_SEED_PATH;

  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️ Item seed file not found at ${csvPath}. Skipping item seeding.`);
    return;
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
  const headerIndex = lines.findIndex((line) => line.includes('Item Code') && line.includes('Item Name'));

  if (headerIndex === -1) {
    console.warn(`⚠️ Item seed header row not found in ${csvPath}. Skipping item seeding.`);
    return;
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const headerMap = toSlugMap(headers);
  const dataLines = lines.slice(headerIndex + 1);

  let seededCount = 0;

  for (const line of dataLines) {
    const values = parseCsvLine(line);
    if (!values.some((value) => value.trim())) continue;

    const row = headerMap.reduce((acc, key, index) => {
      if (key) acc[key] = values[index] ?? '';
      return acc;
    }, {});

    const normalized = normalizeRow(row);
    if (!normalized || !normalized.description) continue;

    await Item.updateOne(
      { itemCode: normalized.itemCode },
      {
        $setOnInsert: { itemCode: normalized.itemCode },
        $set: {
          description: normalized.description,
          riceName: normalized.riceName,
          brand: normalized.brand,
          blend: normalized.blend,
          grainType: normalized.grainType,
          processType: normalized.processType,
          countryOfOrigin: normalized.countryOfOrigin,
          barcode: normalized.barcode,
          dmBarcode: normalized.dmBarcode,
          hsCode: normalized.hsCode,
          variant: normalized.variant,
          category: normalized.category,
          packing: normalized.packing,
          bagWeightKg: normalized.bagWeightKg,
          unit: normalized.unit,
          status: normalized.status,
        },
      },
      { upsert: true }
    );

    seededCount += 1;
  }

  console.log(`✅ Item seeding completed (${seededCount} rows processed)`);
}

module.exports = {
  seedItemsFromCsv,
};
