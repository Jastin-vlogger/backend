require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');
const Shipment = require('../src/models/shipment.model');

// RHST-0021/PO01-1242-2's Storage Arrival is currently "Submission Approved"
// (actual.storageArrivalApproval.status = 'approved'), which locks the row-level
// GRN/batch editing to view-only. Reverting it to 'pending_warehouse_manager' so
// it can be edited again, and clearing the approval timestamp/approver that go
// with 'approved' so the state stays internally consistent.
const SHIPMENT_NO_MATCH = /1242/i;
const TARGET_SERIAL = 'ACT02'; // "-2" child

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('🔌 Connected to MongoDB Atlas');

  const shipment = await Shipment.findOne({ shipmentNo: SHIPMENT_NO_MATCH }).select('_id shipmentNo').lean();
  if (!shipment) {
    console.log('No shipment found matching "1242"');
    await mongoose.disconnect();
    return;
  }
  console.log('Matched shipment:', shipment.shipmentNo);

  const containers = await Container.find({ shipmentId: shipment._id });
  const target = containers.find((c) => String(c.actualSerialNo || '').toUpperCase() === TARGET_SERIAL)
    || containers[1]; // fallback: 2nd child by creation order if actualSerialNo isn't set

  if (!target) {
    console.log('Could not find the "-2" container under this shipment');
    await mongoose.disconnect();
    return;
  }

  const before = target.actual?.storageArrivalApproval?.status;
  console.log(`Container ${target._id} (serial ${target.actualSerialNo}) current status: ${before}`);

  if (before !== 'approved') {
    console.log('Status is not "approved" — nothing to revert. Aborting to avoid touching an unexpected record.');
    await mongoose.disconnect();
    return;
  }

  target.actual.storageArrivalApproval.status = 'pending_warehouse_manager';
  target.actual.storageArrivalApproval.warehouseManagerApprovedAt = null;
  target.actual.storageArrivalApproval.warehouseManagerApprovedBy = null;
  target.markModified('actual.storageArrivalApproval');
  await target.save();

  console.log(`✅ Reverted to "pending_warehouse_manager" (Pending for Approval) — editing is unlocked again.`);
  await mongoose.disconnect();
  console.log('🔌 Disconnected');
}

run().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
