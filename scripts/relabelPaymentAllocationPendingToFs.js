require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

// The FS Manager approval stage was removed: FS (FAS) approves the Clearing Advance Process directly.
// New submissions are stored as 'pending_fas'; rows submitted earlier still carry the legacy
// 'pending_fas_manager'. The app treats both as "waiting for FS approval", so this relabel is only
// housekeeping. It NEVER approves anything: rows stay pending until FS approves them in the UI.
//
// Run it AFTER the new backend is deployed (an older backend would not recognise 'pending_fas' on
// paymentAllocationApproval). Dry-run by default — pass --apply to write.

const APPLY = process.argv.includes('--apply');
const FIELDS = ['paymentAllocationApproval', 'paymentCostingApproval'];

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  for (const field of FIELDS) {
    const path = `actual.${field}.status`;
    const filter = { [path]: 'pending_fas_manager' };
    const count = await Container.countDocuments(filter);
    console.log(`${field}: ${count} container(s) with legacy pending_fas_manager`);
    if (APPLY && count > 0) {
      const res = await Container.updateMany(filter, { $set: { [path]: 'pending_fas' } });
      console.log(`  relabelled ${res.modifiedCount}`);
    }
  }
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
