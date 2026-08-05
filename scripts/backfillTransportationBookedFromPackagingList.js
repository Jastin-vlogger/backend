require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

// Historical gap: actual.transportationBooked only ever grows via updatePackagingBags'
// "append new row" path (shipment.controller.js) — correct for containers added going forward,
// but some existing containers predate that sync (or a container was added before the sync
// logic existed), leaving them in packagingList.containerInfo without a matching
// transportationBooked row. Confirmed cases this session:
//   - RHST-0014/PO01-1026-4: transportationBooked entirely empty, 10 real containers in
//     packagingList never synced.
//   - RHST-0014/PO01-1026-3: transportationBooked has 9/10 rows — the 10th container
//     (DPWU2033432) was added later and never got a matching row pushed.
//
// This script finds every packagingList.containerInfo entry whose container_number has no
// matching containerSerialNo in transportationBooked, and appends a new row for it — mirroring
// exactly the shape/fields the existing "append" code path already uses. It NEVER touches or
// removes an existing transportationBooked row; only adds missing ones. Purely additive, so this
// is a one-time historical cleanup — the forward path (adding containers via the UI going
// forward) already syncs correctly on its own, this does not change that.
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
    'actual.packagingList.containerInfo.0': { $exists: true },
  });
  console.log(`Scanning ${containers.length} containers with packaging list data...`);

  let touched = 0;
  let totalRowsAdded = 0;

  for (const container of containers) {
    const packagingList = Array.isArray(container.actual?.packagingList?.containerInfo)
      ? container.actual.packagingList.containerInfo
      : [];
    if (!packagingList.length) continue;

    container.actual.transportationBooked = Array.isArray(container.actual.transportationBooked)
      ? container.actual.transportationBooked
      : [];
    const booked = container.actual.transportationBooked;
    const bookedSerials = new Set(booked.map((row) => normalizeSerial(row?.containerSerialNo)));

    const missing = packagingList.filter((row) => {
      const serial = normalizeSerial(row?.container_number);
      return serial && !bookedSerials.has(serial);
    });
    if (!missing.length) continue;

    touched++;
    totalRowsAdded += missing.length;
    console.log(`\nContainer ${container._id} (shipmentId ${container.shipmentId}): ${booked.length} existing -> +${missing.length} missing`);
    console.log('  adding:', missing.map((row) => row.container_number).join(', '));

    if (APPLY) {
      missing.forEach((row) => {
        booked.push({
          sn: booked.length + 1,
          transactionId: '',
          containerSerialNo: row.container_number || '',
          transportCompanyName: '',
          warehouse: '',
        });
      });
      container.markModified('actual.transportationBooked');
      await container.save();
    }
  }

  console.log(`\n${touched} container(s) ${APPLY ? 'backfilled' : 'would be backfilled'}, ${totalRowsAdded} row(s) ${APPLY ? 'added' : 'would be added'}.`);
  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
