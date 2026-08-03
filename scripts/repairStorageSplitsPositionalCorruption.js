require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

// Historical bug: single-row Storage Arrival saves (PATCH /container/storage-row/:id/:rowIndex)
// and the frontend's post-save patch-back both used the UI's canonical row index as a raw
// position into `actual.storageSplits`, instead of matching by container serial. Once a
// shipment's canonical row order drifted from storageSplits' own array order (e.g. a container
// added later shifts canonical positions), this wrote a row's data into an unrelated array slot —
// producing duplicate entries for one serial and leftover empty `{}` placeholder slots.
// This script is a data-only cleanup; the write-path bug itself is already fixed in
// shipment.controller.js (updateStorageArrivalRow) and shipment-storage.component.ts
// (patchStorageArrivalFromActual), both now matching by serial.
//
// For every container's storageSplits array:
//   - group entries by normalized containerSerialNo
//   - drop entries with no serial and no other real data (grn/batch/receivedOnDate/documentUrl) — dead placeholders
//   - for duplicate serials, keep the most complete entry (most non-empty fields; ties broken by latest receivedOnDate)
//
// Dry-run by default — pass --apply to write changes.

const APPLY = process.argv.includes('--apply');

const normalizeSerial = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');

const hasRealData = (row) =>
  !!(row?.grn || row?.batch || row?.receivedOnDate || row?.documentUrl || row?.warehouse);

const completeness = (row) => {
  let score = 0;
  for (const key of ['grn', 'batch', 'receivedOnDate', 'receivedOnTime', 'warehouse', 'block', 'documentUrl', 'productionDate', 'expiryDate']) {
    if (row?.[key]) score++;
  }
  return score;
};

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB Atlas (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const containers = await Container.find({ 'actual.storageSplits.1': { $exists: true } });
  console.log(`Scanning ${containers.length} containers with 2+ storageSplits entries...`);

  let touched = 0;
  for (const container of containers) {
    const splits = Array.isArray(container.actual?.storageSplits) ? container.actual.storageSplits : [];
    if (splits.length < 2) continue;

    const bySerial = new Map();
    const kept = [];
    let changed = false;

    for (const row of splits) {
      const serial = normalizeSerial(row?.containerSerialNo);
      if (!serial) {
        if (hasRealData(row)) {
          // No serial but has real data — keep as-is, can't dedupe safely without a key.
          kept.push(row);
        } else {
          changed = true; // dropping a dead empty placeholder
        }
        continue;
      }
      const prior = bySerial.get(serial);
      if (!prior) {
        bySerial.set(serial, row);
      } else {
        changed = true;
        const priorScore = completeness(prior);
        const rowScore = completeness(row);
        let winner = prior;
        if (rowScore > priorScore) winner = row;
        else if (rowScore === priorScore) {
          const priorDate = prior?.receivedOnDate ? new Date(prior.receivedOnDate).getTime() : 0;
          const rowDate = row?.receivedOnDate ? new Date(row.receivedOnDate).getTime() : 0;
          if (rowDate > priorDate) winner = row;
        }
        bySerial.set(serial, winner);
      }
    }

    const finalRows = [...kept, ...bySerial.values()];
    if (!changed) continue;

    touched++;
    console.log(`\nContainer ${container._id} (shipmentId ${container.shipmentId}): ${splits.length} -> ${finalRows.length} rows`);
    console.log('  before:', splits.map((r) => r?.containerSerialNo || '(blank)').join(', '));
    console.log('  after: ', finalRows.map((r) => r?.containerSerialNo || '(blank)').join(', '));

    if (APPLY) {
      container.actual.storageSplits = finalRows;
      container.markModified('actual.storageSplits');
      await container.save();
    }
  }

  console.log(`\n${touched} container(s) ${APPLY ? 'repaired' : 'would be repaired'}.`);
  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
