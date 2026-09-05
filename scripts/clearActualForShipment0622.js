require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');

const APPLY = process.argv.includes('--apply');

// User-requested one-off: wipe container.actual for shipment RHST-0034/PO01-0622 only.
// Confirmed by inspection (2026-09-03): of its 4 containers, exactly one
// (6a8e8acda3c347418cd40e05, status "Arrived") carries an `actual` object; the other 3 are
// "Planned" with no `actual`. That container's BLNo (BOMS26030622) is shared with one container
// on a different shipment — the app's same-BL sync can re-copy BL/clearing-advance/storage-
// allocation/port-customs fields from that sibling back onto this container on a later
// save/read, so the wipe may not stay fully empty if that sibling is touched afterward.
const SHIPMENT_NO = 'RHST-0034/PO01-0622';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const shipment = await Shipment.findOne({ shipmentNo: SHIPMENT_NO }).lean();
  if (!shipment) { console.log(`Shipment ${SHIPMENT_NO} not found`); await mongoose.disconnect(); return; }
  console.log(`Shipment: ${shipment.shipmentNo} (${shipment._id})`);

  const containers = await Container.find({ shipmentId: shipment._id });
  console.log(`Containers: ${containers.length}`);

  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  for (const container of containers) {
    if (!container.actual) {
      console.log(`  ${container._id}: no actual — skip`);
      continue;
    }

    const backupPath = path.join(
      backupDir,
      `container-${container._id}-actual-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(backupPath, JSON.stringify(container.actual, null, 2));
    console.log(`  ${container._id}: backed up actual (${Object.keys(container.actual.toObject ? container.actual.toObject() : container.actual).length} keys) -> ${backupPath}`);

    if (APPLY) {
      container.actual = undefined;
      await container.save();
      console.log(`  ${container._id}: actual cleared`);
    } else {
      console.log(`  ${container._id}: would clear actual`);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => { console.error('Script failed:', err); process.exit(1); });
