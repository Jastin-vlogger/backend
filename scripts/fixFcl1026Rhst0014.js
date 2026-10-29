require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');

// RHST-0014/PO01-1026 (LT Foods): the LPO was extracted with fcl = 101 (derived from a 2,520 MT
// order) but the shipment's plannedQtyMT is 2,270.04. The 9 saved containers already hold
// 90 FCL / 2,246.04 MT (~24.95 MT per FCL), leaving ~24 MT for the "remaining" 11 FCL, so the
// scheduler adds rows whose MT total (2,471.04) exceeds the PO and blocks Save
// ("Scheduled MT exceeds Total MT").
//
// Correct FCL for the real quantity = ceil(2270.04 / 25) = 91 -> 9 saved shipments + 1 remainder
// row (1 FCL, ~24 MT) = 10 shipments, scheduled MT == total MT.
//
// Updates shipment.fcl and the single line item's fcl only. Containers are never touched.
// Dry-run by default — pass --apply to write changes.

const APPLY = process.argv.includes('--apply');
const SHIPMENT_NO = 'RHST-0014/PO01-1026';
const OLD_FCL = 101;
const MT_PER_FCL = 25;

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const shipment = await Shipment.findOne({ shipmentNo: SHIPMENT_NO });
  if (!shipment) throw new Error(`Shipment ${SHIPMENT_NO} not found`);

  const newFcl = Math.ceil(Number(shipment.plannedQtyMT) / MT_PER_FCL);
  const containers = await Container.find({ shipmentId: shipment._id }).lean();
  const savedFcl = containers.reduce((sum, c) => sum + (Number(c.planned?.FCL) || 0), 0);
  console.log(`plannedQtyMT=${shipment.plannedQtyMT} current fcl=${shipment.fcl} -> new fcl=${newFcl}`);
  console.log(`containers=${containers.length}, saved FCL=${savedFcl}, remaining after fix=${newFcl - savedFcl}`);

  if (Number(shipment.fcl) !== OLD_FCL) {
    console.log(`Skipping: fcl is ${shipment.fcl}, expected ${OLD_FCL} (already fixed or changed).`);
    return;
  }
  if (newFcl < savedFcl) throw new Error('New FCL is below already-saved FCL; refusing to write.');

  if (!APPLY) return;

  const set = { fcl: newFcl };
  const items = Array.isArray(shipment.lineItems) ? shipment.lineItems : [];
  if (items.length === 1 && Number(items[0].fcl) === OLD_FCL) set['lineItems.0.fcl'] = newFcl;
  await Shipment.updateOne({ _id: shipment._id }, { $set: set });
  console.log('Updated.');
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
