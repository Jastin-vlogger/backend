require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');
const Shipment = require('../src/models/shipment.model');

// LPO 1242 was completed before the Shortage Bags field existed. The rows already carry
// "SHORTAGE OF 19 Bags" in their Remarks (entered manually at the time), but that text was
// never structured data — this backfills shortageBags = 19 on every storageSplits row whose
// remarks mention it, so the Shortage Bags column/stat cards report correctly for this LPO.
const SHORTAGE_VALUE = 19;

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('🔌 Connected to MongoDB Atlas');

  const shipments = await Shipment.find({ shipmentNo: /1242/i }).select('_id shipmentNo').lean();
  if (!shipments.length) {
    console.log('No shipment found matching "1242"');
    await mongoose.disconnect();
    return;
  }
  console.log('Matched shipments:', shipments.map((s) => s.shipmentNo));

  const containers = await Container.find({ shipmentId: { $in: shipments.map((s) => s._id) } });
  let updatedRows = 0;

  for (const container of containers) {
    const splits = container.actual?.storageSplits;
    if (!Array.isArray(splits) || !splits.length) continue;

    let changed = false;
    splits.forEach((split, idx) => {
      if (!split) return;
      const remarks = String(split.remarks || '');
      if (/shortage/i.test(remarks) && Number(split.shortageBags) !== SHORTAGE_VALUE) {
        console.log(
          `  Container ${container._id} row ${idx} (${split.containerSerialNo}): "${remarks}" -> shortageBags ${split.shortageBags ?? 0} => ${SHORTAGE_VALUE}`
        );
        split.shortageBags = SHORTAGE_VALUE;
        changed = true;
        updatedRows++;
      }
    });

    if (changed) {
      container.markModified('actual.storageSplits');
      await container.save();
    }
  }

  console.log(`✅ Updated ${updatedRows} storageSplits row(s) to shortageBags = ${SHORTAGE_VALUE}`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
