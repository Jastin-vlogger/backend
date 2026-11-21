require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');
const Warehouse = require('../src/models/warehouse.model');

// READ-ONLY audit of warehouse allocation consistency (writes nothing).
//
// For each container with storage data it cross-checks the four per-container lists that should
// agree: packing list containers (P), planned storage allocation (A), transport booked (T) and
// received storage rows (S): same container serials, same warehouse per serial, warehouse names
// that exist, blocks that belong to that warehouse, bags, and item allocation totals.
//
// Usage: node scripts/auditWarehouseAllocation.js [--json]

const AS_JSON = process.argv.includes('--json');
const serial = (v) => String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
// "AL AIN - AL AIN" is shown as "AL AIN"; compare labels without that suffix, case-insensitively.
const labelKey = (v) => String(v || '').trim().replace(/^(.*?)\s*-\s*\1$/i, '$1').replace(/\s+/g, ' ').toLowerCase();

async function run() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not found'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);

  const warehouses = await Warehouse.find({}).lean();
  const byLabel = new Map();
  warehouses.forEach((w) => {
    [w.name, w.code, `${w.name} - ${w.code}`].filter(Boolean).forEach((l) => byLabel.set(labelKey(l), w));
  });
  const byCode = new Map(warehouses.filter((w) => w.code).map((w) => [labelKey(w.code), w]));
  // A label is resolved by name first, then by code ("SHARJAH - SAJAH" -> warehouse with code SAJAH:
  // the warehouse was renamed, the old name is still stored on containers = a stale name).
  const resolve = (label) => {
    const exact = byLabel.get(labelKey(label));
    if (exact) return { w: exact, stale: false };
    const code = labelKey(String(label || '').split(' - ').pop());
    const viaCode = byCode.get(code);
    return viaCode ? { w: viaCode, stale: true } : { w: null, stale: false };
  };
  const staleNames = new Map();
  const shipments = await Shipment.find({}).select('shipmentNo').lean();
  const shipNo = new Map(shipments.map((s) => [String(s._id), s.shipmentNo]));

  const containers = await Container.find({
    $or: [
      { 'actual.storageAllocations.0': { $exists: true } },
      { 'actual.storageSplits.0': { $exists: true } },
      { 'actual.transportationBooked.0': { $exists: true } },
    ],
  }).select('shipmentId status actual.BLNo actual.packagingList.containerInfo actual.storageAllocations actual.transportationBooked actual.storageSplits actual.storageAllocationDecision').lean();

  const findings = [];
  const add = (c, kind, detail) => findings.push({ shipmentNo: shipNo.get(String(c.shipmentId)) || '?', container: String(c._id).slice(-6), bl: c.actual?.BLNo || '', kind, detail });

  containers.forEach((c) => {
    const a = c.actual || {};
    const P = (a.packagingList?.containerInfo || []).map((x) => ({ s: serial(x.container_number), bags: Number(x.no_of_bags) || 0 }));
    const A = (a.storageAllocations || []).map((x) => ({ s: serial(x.containerSerialNo), w: x.warehouse, bags: Number(x.bags) || 0 }));
    const T = (a.transportationBooked || []).map((x) => ({ s: serial(x.containerSerialNo), w: x.warehouse }));
    const S = (a.storageSplits || []).map((x) => ({ s: serial(x.containerSerialNo), w: x.warehouse, block: x.block, bags: Number(x.bags) || 0, short: Number(x.shortageBags) || 0 }));

    const lists = { packing: P, allocation: A, transport: T, received: S };
    Object.entries(lists).forEach(([name, list]) => {
      const blanks = list.filter((x) => !x.s).length;
      const dups = list.length - new Set(list.map((x) => x.s).filter(Boolean)).size - blanks;
      if (blanks) add(c, 'blank-serial', `${blanks} row(s) without a container serial in ${name}`);
      if (dups > 0) add(c, 'duplicate-serial', `${dups} duplicate serial(s) in ${name}`);
    });

    const diff = (nameX, X, nameY, Y, { partialOk = false } = {}) => {
      if (!X.length || !Y.length) return;
      const sx = new Set(X.map((x) => x.s)); const sy = new Set(Y.map((y) => y.s));
      let onlyX = [...sx].filter((v) => v && !sy.has(v)); let onlyY = [...sy].filter((v) => v && !sx.has(v));
      // same container, check digit dropped on one side (e.g. DPWU205609 vs DPWU2056090)
      const stripped = onlyX.filter((x) => onlyY.some((y) => y.length === 10 && x.length === 11 && x.startsWith(y)) || onlyY.some((y) => x.length === 10 && y.length === 11 && y.startsWith(x)));
      if (stripped.length) add(c, 'check-digit-missing', `${nameX} vs ${nameY}: ${stripped.length} serial(s) differ only by the last (check) digit, e.g. ${stripped[0]}`);
      onlyX = onlyX.filter((x) => !stripped.includes(x));
      onlyY = onlyY.filter((y) => !stripped.some((x) => x.startsWith(y) || y.startsWith(x)));
      if (partialOk && !onlyX.length) {
        if (onlyY.length) add(c, 'partial-receipt (info)', `${nameX}(${X.length}) of ${nameY}(${Y.length}) received so far`);
        return;
      }
      if (onlyX.length || onlyY.length) {
        add(c, 'serial-mismatch', `${nameX}(${X.length}) vs ${nameY}(${Y.length}): only in ${nameX}: ${onlyX.slice(0, 3).join(',') || '-'}${onlyX.length > 3 ? '..' : ''} | only in ${nameY}: ${onlyY.slice(0, 3).join(',') || '-'}${onlyY.length > 3 ? '..' : ''}`);
      }
    };
    diff('allocation', A, 'packing', P);
    diff('transport', T, 'packing', P);
    diff('received', S, 'transport', T, { partialOk: true });

    const wOf = (list) => new Map(list.map((x) => [x.s, x.w]));
    const aw = wOf(A); const tw = wOf(T);
    const sameWarehouse = (x, y) => {
      const rx = resolve(x); const ry = resolve(y);
      return rx.w && ry.w ? String(rx.w._id) === String(ry.w._id) : labelKey(x) === labelKey(y);
    };
    S.forEach((row) => {
      const planned = tw.get(row.s) ?? aw.get(row.s);
      if (planned && row.w && !sameWarehouse(planned, row.w)) add(c, 'received-in-other-warehouse', `${row.s}: planned "${planned}" but received in "${row.w}"`);
    });
    // allocation != transport is usually a deliberate re-route (transport booked is the live destination).
    A.forEach((row) => { const t = tw.get(row.s); if (t && row.w && !sameWarehouse(t, row.w)) add(c, 'rerouted (info)', `${row.s}: allocation "${row.w}" -> transport "${t}"`); });

    [...A, ...T, ...S].forEach((row) => {
      if (!row.w) return;
      const r = resolve(row.w);
      if (!r.w) add(c, 'unknown-warehouse', `"${row.w}" matches no warehouse`);
      else if (r.stale) { staleNames.set(row.w, (staleNames.get(row.w) || 0) + 1); }
    });
    S.forEach((row) => {
      const w = resolve(row.w).w;
      if (w && row.block && !(w.blocks || []).some((b) => labelKey(b.name) === labelKey(row.block))) add(c, 'unknown-block', `block "${row.block}" is not in warehouse "${w.name}"`);
    });

    const pbags = new Map(P.map((p) => [p.s, p.bags]));
    S.forEach((row) => {
      const expected = pbags.get(row.s);
      if (expected && row.bags && row.bags !== expected && row.bags + row.short !== expected) add(c, 'bags-mismatch', `${row.s}: received ${row.bags} (shortage ${row.short}) vs packing list ${expected}`);
    });

    (a.storageAllocationDecision?.itemAllocations || []).forEach((item) => {
      const assigned = (item.allocations || []).reduce((sum, x) => sum + (Number(x.containersAssigned) || 0), 0);
      if (Number(item.expectedContainers) && assigned !== Number(item.expectedContainers)) add(c, 'item-allocation-total', `${item.itemName}: assigned ${assigned} of ${item.expectedContainers} containers`);
    });
  });

  if (AS_JSON) { console.log(JSON.stringify(findings, null, 2)); return; }
  const byKind = {};
  findings.forEach((f) => { byKind[f.kind] = (byKind[f.kind] || 0) + 1; });
  console.log(`Containers with storage data: ${containers.length} | findings: ${findings.length} | containers affected: ${new Set(findings.map((f) => f.container)).size}`);
  console.log('By kind:', JSON.stringify(byKind));
  console.log('Stale warehouse names (renamed warehouse still stored on containers):', JSON.stringify(Object.fromEntries(staleNames)));
  findings.sort((x, y) => x.shipmentNo.localeCompare(y.shipmentNo) || x.kind.localeCompare(y.kind)).forEach((f) => {
    console.log(`${f.shipmentNo} [${f.container}] ${f.kind}: ${f.detail}`);
  });
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
