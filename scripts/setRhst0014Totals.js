require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');

// RHST-0014/PO01-1026 (LT Foods): 10 shipments of 10 containers each = 100 FCL.
//
// History: the baseline was 2,520 MT / 10 shipments until a save on 2026-10-20 overwrote the PO
// total with the sum of the saved rows (2,270.04 MT) and left a stray 11th "remainder" row.
// scripts/fixFcl1026Rhst0014.js then set fcl 101 -> 91, which was the wrong premise (the PO is
// 100 containers) and capped the last shipment at 1 FCL. This script supersedes it.
//
// Target: fcl 100, plannedQtyMT 2,496.04 (= 9 saved shipments 2,246.04 MT + last shipment
// 10 FCL x 25 MT), noOfShipments 10. With these figures the 10th row auto-fills 10 FCL,
// scheduled MT stays <= total MT, and no remainder row is generated.
//
// Containers are never touched. Dry-run by default — pass --apply to write changes.

const APPLY = process.argv.includes('--apply');
const SHIPMENT_NO = 'RHST-0014/PO01-1026';
const EXPECTED = { fcl: 91, plannedQtyMT: 2270.04 };
const TARGET = { fcl: 100, plannedQtyMT: 2496.04, noOfShipments: 10 };

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  const shipment = await Shipment.findOne({ shipmentNo: SHIPMENT_NO });
  if (!shipment) throw new Error(`Shipment ${SHIPMENT_NO} not found`);

  const containers = await Container.find({ shipmentId: shipment._id }).lean();
  const savedFcl = containers.reduce((sum, c) => sum + (Number(c.planned?.FCL) || 0), 0);
  const savedMT = containers.reduce((sum, c) => sum + (Number(c.planned?.qtyMT) || 0), 0);
  console.log(`before: fcl=${shipment.fcl} plannedQtyMT=${shipment.plannedQtyMT} noOfShipments=${shipment.noOfShipments} lineItem.fcl=${shipment.lineItems?.[0]?.fcl}`);
  console.log(`after:  fcl=${TARGET.fcl} plannedQtyMT=${TARGET.plannedQtyMT} noOfShipments=${TARGET.noOfShipments}`);
  console.log(`containers=${containers.length}, saved FCL=${savedFcl}, saved MT=${savedMT.toFixed(2)}, FCL left for last shipment=${TARGET.fcl - savedFcl}`);

  if (Number(shipment.fcl) !== EXPECTED.fcl || Number(shipment.plannedQtyMT) !== EXPECTED.plannedQtyMT) {
    console.log(`Skipping: expected fcl ${EXPECTED.fcl} / plannedQtyMT ${EXPECTED.plannedQtyMT} (already changed?).`);
    return;
  }
  if (savedFcl > TARGET.fcl || savedMT > TARGET.plannedQtyMT) throw new Error('Saved containers exceed the target totals; refusing to write.');
  if (!APPLY) return;

  const set = { fcl: TARGET.fcl, plannedQtyMT: TARGET.plannedQtyMT, noOfShipments: TARGET.noOfShipments };
  if (Array.isArray(shipment.lineItems) && shipment.lineItems.length === 1) set['lineItems.0.fcl'] = TARGET.fcl;
  await Shipment.updateOne({ _id: shipment._id }, { $set: set });
  console.log('Updated.');
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
