require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

// Storage Arrival's BAGS column used to fall back to `source.pkgCt`, which for any shipment
// with transportationBooked populated (i.e. anything that reached Storage Arrival) was always
// undefined — transportationBooked rows carry no bag count at all. So every row ever saved via
// the Edit modal or Save All persisted `bags: 0` into storageSplits, even when the real count
// (entered by a user in the "Packing List Confirmation" table, actual.packagingList.containerInfo)
// was known and correct.
//
// The read-path fix (shipment-form.component.ts) now sources bags from packagingList.containerInfo
// by serial — but storageMatch.bags (already persisted, non-null 0) still wins over that fallback
// once a row has been saved once, so already-recorded rows stay stuck at 0.
//
// This script backfills storageSplits[].bags from packagingList.containerInfo by serial, only when
// the currently stored bags is falsy (0/null/undefined) and a real (>0) count exists in
// packagingList for that serial. Never overwrites a genuinely non-zero saved value.
//
// Dry-run by default — pass --apply to write changes.

const APPLY = process.argv.includes('--apply');

const normalizeSerial = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB Atlas (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const containers = await Container.find({
    'actual.storageSplits.0': { $exists: true },
    'actual.packagingList.containerInfo.0': { $exists: true },
  });
  console.log(`Scanning ${containers.length} containers with both storageSplits and packagingList data...`);

  let touched = 0;
  for (const container of containers) {
    const splits = Array.isArray(container.actual?.storageSplits) ? container.actual.storageSplits : [];
    const packInfo = Array.isArray(container.actual?.packagingList?.containerInfo)
      ? container.actual.packagingList.containerInfo
      : [];
    if (!splits.length || !packInfo.length) continue;

    const bagsBySerial = new Map(
      packInfo.map((p) => [normalizeSerial(p?.container_number), Number(p?.no_of_bags) || 0])
    );

    let changed = false;
    const changes = [];
    for (const row of splits) {
      const serial = normalizeSerial(row?.containerSerialNo);
      const currentBags = Number(row?.bags) || 0;
      const realBags = bagsBySerial.get(serial);
      if (currentBags === 0 && realBags && realBags > 0) {
        changes.push({ serial, from: currentBags, to: realBags });
        row.bags = realBags;
        changed = true;
      }
    }

    if (!changed) continue;
    touched++;
    console.log(`\nContainer ${container._id} (shipmentId ${container.shipmentId}): ${changes.length} row(s)`);
    changes.forEach((c) => console.log(`  ${c.serial}: ${c.from} -> ${c.to}`));

    if (APPLY) {
      container.markModified('actual.storageSplits');
      await container.save();
    }
  }

  console.log(`\n${touched} container(s) ${APPLY ? 'backfilled' : 'would be backfilled'}.`);
  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
