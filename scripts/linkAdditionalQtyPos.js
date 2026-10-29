require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('../src/models/shipment.model');

// Three small Mahavir Rice Mills POs are extra quantity ordered on top of existing Pure Commodity
// POs. They were entered as separate shipments with no link to the PO they top up. This sets
// shipment.additionalAgainstFpoNo on each (an informational link only: no quantity, FCL or
// stage on either shipment is changed, nothing is deleted).
//
// Dry-run by default — pass --apply to write changes.

const APPLY = process.argv.includes('--apply');
const LINKS = [
  { extra: 'PO01/26/00882', base: 'PO01/26/00124' },
  { extra: 'PO01/26/00883', base: 'PO01/26/00125' },
  { extra: 'PO01/26/00822', base: 'PO01/26/00123' },
];

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in environment');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected (${APPLY ? 'APPLY' : 'DRY RUN — pass --apply to write'})`);

  for (const { extra, base } of LINKS) {
    const [extraDocs, baseDocs] = await Promise.all([
      Shipment.find({ fpoNo: extra }).select('shipmentNo fpoNo plannedQtyMT additionalAgainstFpoNo'),
      Shipment.find({ fpoNo: base }).select('shipmentNo fpoNo plannedQtyMT'),
    ]);
    if (extraDocs.length !== 1 || baseDocs.length !== 1) {
      console.log(`SKIP ${extra} -> ${base}: found ${extraDocs.length} extra / ${baseDocs.length} base shipment(s), expected exactly 1 each.`);
      continue;
    }
    const [extraDoc] = extraDocs;
    const [baseDoc] = baseDocs;
    if (extraDoc.additionalAgainstFpoNo === base) {
      console.log(`OK   ${extra} already linked to ${base}`);
      continue;
    }
    console.log(`LINK ${extraDoc.shipmentNo} (${extraDoc.plannedQtyMT} MT) -> ${baseDoc.shipmentNo} (${baseDoc.plannedQtyMT} MT)`);
    if (APPLY) await Shipment.updateOne({ _id: extraDoc._id }, { $set: { additionalAgainstFpoNo: base } });
  }
}

run()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
