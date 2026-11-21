require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');

// READ-ONLY audit of extracted container numbers (writes nothing).
//
// Per container record it checks: duplicate numbers inside one record, numbers failing the
// ISO 6346 check digit (possible OCR misread), record size vs the BL's declared container count,
// and the same container number claimed by more than one record. Shared BLs are grouped so
// "20 of 60" style gaps can be told apart from real errors.
//
// Usage: node scripts/auditContainerExtraction.js [--only 0635,0622,0124,0123,0115,0634] [--json]

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const ONLY = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
const AS_JSON = args.includes('--json');

const norm = (v) => String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const LETTERS = {};
(() => { let v = 10; for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (v % 11 === 0) v += 1; LETTERS[ch] = v; v += 1; } })();
// true / false, or null when the value is not in the 4 letters + 7 digits shape
const checkDigitOk = (value) => {
  const n = norm(value);
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(n)) return null;
  let total = 0;
  for (let i = 0; i < 10; i += 1) total += (/[A-Z]/.test(n[i]) ? LETTERS[n[i]] : Number(n[i])) * (2 ** i);
  return ((total % 11) % 10) === Number(n[10]);
};

async function run() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not found'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);

  const shipments = await Shipment.find({}).select('shipmentNo fpoNo fcl').lean();
  const shipmentById = new Map(shipments.map((s) => [String(s._id), s]));
  const containers = await Container.find({ 'actual.BLNo': { $exists: true, $ne: null } })
    .select('shipmentId status planned.FCL actual.BLNo actual.noOfContainers actual.packagingList.containerInfo actual.extractedContainers')
    .lean();

  const records = containers.map((c) => {
    const info = (c.actual?.packagingList?.containerInfo || []).map((x) => x.container_number);
    const extracted = (c.actual?.extractedContainers || []).map((x) => x.containerNo || x.container_number);
    const numbers = (info.length ? info : extracted).map(norm).filter(Boolean);
    const ship = shipmentById.get(String(c.shipmentId)) || {};
    return {
      id: String(c._id).slice(-6),
      shipmentNo: ship.shipmentNo || '?',
      fpoNo: ship.fpoNo || '',
      status: c.status,
      bl: norm(c.actual?.BLNo),
      declared: Number(c.actual?.noOfContainers) || 0,
      plannedFcl: Number(c.planned?.FCL) || 0,
      numbers,
    };
  });

  const owner = new Map();
  records.forEach((r) => r.numbers.forEach((n) => { if (!owner.has(n)) owner.set(n, []); owner.get(n).push(r); }));

  const findings = [];
  records.forEach((r) => {
    const issues = [];
    const dupInside = r.numbers.length - new Set(r.numbers).size;
    if (dupInside > 0) issues.push(`${dupInside} duplicate number(s) inside the record`);
    const bad = r.numbers.filter((n) => checkDigitOk(n) === false);
    if (bad.length) issues.push(`${bad.length} fail ISO 6346 check digit: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ' ...' : ''}`);
    const shared = [...new Set(r.numbers)].filter((n) => (owner.get(n) || []).some((o) => o !== r));
    if (shared.length) {
      const others = [...new Set(shared.flatMap((n) => owner.get(n).filter((o) => o !== r).map((o) => `${o.shipmentNo} [${o.id}]`)))];
      issues.push(`${shared.length} number(s) also held by: ${others.join('; ')}`);
    }
    if (r.declared && r.numbers.length && r.numbers.length !== r.declared) issues.push(`BL declares ${r.declared}, record holds ${r.numbers.length}`);
    if (r.plannedFcl && r.numbers.length && r.numbers.length !== r.plannedFcl) issues.push(`planned FCL ${r.plannedFcl}, record holds ${r.numbers.length}`);
    if (issues.length) findings.push({ ...r, issues, count: r.numbers.length });
  });

  const wanted = (r) => !ONLY.length || ONLY.some((tag) => r.shipmentNo.includes(tag));
  const shown = findings.filter(wanted);

  if (AS_JSON) {
    console.log(JSON.stringify(shown, null, 2));
  } else {
    console.log(`Records with BL data: ${records.length} | with findings: ${findings.length}${ONLY.length ? ` | shown for ${ONLY.join(',')}: ${shown.length}` : ''}`);
    shown.sort((a, b) => a.shipmentNo.localeCompare(b.shipmentNo)).forEach((r) => {
      console.log(`\n${r.shipmentNo} [${r.id}] ${r.status} | BL ${r.bl} | holds ${r.count}`);
      r.issues.forEach((i) => console.log(`   - ${i}`));
    });
  }
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
