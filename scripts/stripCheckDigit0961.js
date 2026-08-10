require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

const APPLY = process.argv.includes('--apply');

// User-requested: strip the trailing check digit off 5 container serials for
// RHST-0007/PO01-0961-1 (per their own container list, contra the standard
// ISO 6346 11-char format) across every array that carries the serial:
// transportationBooked/storageSplits (containerSerialNo), packagingList.containerInfo
// (container_number), extractedContainers (containerNo).
const CONTAINER_ID = '6a1e63fa40b1d6ef195ea9a9';
const RENAMES = {
  'DPWU2056090': 'DPWU205609',
  'DPWU2058805': 'DPWU205880',
  'LYGU3197452': 'LYGU319745',
  'LYGU3198037': 'LYGU319803',
  'TIIU2438834': 'TIIU243883',
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const container = await Container.findById(CONTAINER_ID);
  if (!container) { console.log('Container not found'); await mongoose.disconnect(); return; }

  let touched = 0;
  const arrays = [
    { path: 'actual.transportationBooked', list: container.actual?.transportationBooked, field: 'containerSerialNo' },
    { path: 'actual.storageSplits', list: container.actual?.storageSplits, field: 'containerSerialNo' },
    { path: 'actual.packagingList.containerInfo', list: container.actual?.packagingList?.containerInfo, field: 'container_number' },
    { path: 'actual.extractedContainers', list: container.actual?.extractedContainers, field: 'containerNo' },
  ];

  arrays.forEach(({ path, list, field }) => {
    if (!Array.isArray(list)) return;
    list.forEach((row) => {
      const current = row[field];
      if (RENAMES[current]) {
        const next = RENAMES[current];
        console.log(`  ${path} [${field}]: "${current}" -> "${next}"`);
        if (APPLY) row[field] = next;
        touched++;
      }
    });
  });

  if (touched && APPLY) {
    container.markModified('actual.transportationBooked');
    container.markModified('actual.storageSplits');
    container.markModified('actual.packagingList');
    container.markModified('actual.extractedContainers');
    await container.save();
  }
  console.log(`\n${touched} field(s) ${APPLY ? 'updated' : 'would update'} across ${arrays.length} arrays.`);

  await mongoose.disconnect();
}

run().catch((err) => { console.error('Script failed:', err); process.exit(1); });
