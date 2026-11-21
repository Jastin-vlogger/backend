require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');
const AuditLog = require('../src/models/auditLog.model');
const DocumentImportLog = require('../src/models/documentImportLog.model');
const PaymentCostSheet = require('../src/models/paymentCostSheet.model');
const { createSignedGetUrl } = require('../src/core/utils/s3Upload');

// Full, READ-ONLY backup of one shipment before any reset/delete: the shipment document, every
// container (planned + actual), audit and import logs, the cost sheet, and a copy of every uploaded
// document (BL, packing list, ...) from S3. Nothing in the database is changed.
//
// Usage: node scripts/backupShipment.js "RHST-0034/PO01-0622"
// Output: scripts/backups/shipment-<no>-<timestamp>/  (JSON + documents/). Do not commit it: it holds client documents.

const shipmentNo = process.argv[2];

const collectDocs = (value, found = [], trail = '') => {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach((v, i) => collectDocs(v, found, `${trail}[${i}]`)); return found; }
  Object.entries(value).forEach(([k, v]) => {
    if (typeof v === 'string' && /DocumentUrl$|Url$/.test(k) && /^https?:\/\//.test(v) && !found.some((f) => f.url === v)) {
      found.push({ url: v, field: `${trail}.${k}`.replace(/^\./, '') });
    } else if (v && typeof v === 'object') collectDocs(v, found, `${trail}.${k}`);
  });
  return found;
};

async function run() {
  if (!shipmentNo) { console.error('Usage: node scripts/backupShipment.js "<shipmentNo>"'); process.exit(1); }
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not found'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);

  const shipment = await Shipment.findOne({ shipmentNo }).lean();
  if (!shipment) throw new Error(`Shipment ${shipmentNo} not found`);
  const containers = await Container.find({ shipmentId: shipment._id }).lean();
  const ids = [shipment._id, ...containers.map((c) => c._id)];
  const auditLogs = await AuditLog.find({ entityId: { $in: ids } }).lean();
  const importLogs = await DocumentImportLog.find({ shipmentId: shipment._id }).lean();
  const costSheets = await PaymentCostSheet.find({ shipmentId: shipment._id }).lean();
  // Other shipments that share a BL with these containers (they would re-inherit shared data on the next save).
  const blNos = [...new Set(containers.map((c) => String(c.actual?.BLNo || '').trim()).filter(Boolean))];
  const siblings = blNos.length
    ? await Container.find({ 'actual.BLNo': { $in: blNos }, shipmentId: { $ne: shipment._id } }).select('shipmentId status actual.BLNo').lean()
    : [];

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, 'backups', `shipment-${shipmentNo.replace(/[^a-z0-9]+/gi, '_')}-${stamp}`);
  fs.mkdirSync(path.join(dir, 'documents'), { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
  write('shipment.json', shipment);
  write('containers.json', containers);
  write('audit-logs.json', auditLogs);
  write('import-logs.json', importLogs);
  write('cost-sheets.json', costSheets);
  write('same-bl-siblings.json', siblings);

  const docs = collectDocs({ shipment, containers });
  const manifest = [];
  for (const [i, doc] of docs.entries()) {
    const entry = { ...doc, saved: null, error: null };
    try {
      const res = await fetch(await createSignedGetUrl(doc.url, 300));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = `${String(i + 1).padStart(2, '0')}-${path.basename(decodeURIComponent(new URL(doc.url).pathname)).replace(/[^\w.-]+/g, '_')}`;
      fs.writeFileSync(path.join(dir, 'documents', name), Buffer.from(await res.arrayBuffer()));
      entry.saved = name;
    } catch (err) {
      entry.error = err.message;
    }
    manifest.push(entry);
  }
  write('documents-manifest.json', manifest);

  console.log(`Backup written: ${dir}`);
  console.log(`shipment 1 | containers ${containers.length} | audit logs ${auditLogs.length} | import logs ${importLogs.length} | cost sheets ${costSheets.length}`);
  console.log(`documents: ${manifest.filter((m) => m.saved).length} saved, ${manifest.filter((m) => m.error).length} failed`);
  console.log(`BL no(s): ${blNos.join(', ') || '-'} | other containers sharing a BL: ${siblings.length}`);
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
