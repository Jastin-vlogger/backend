require('dotenv').config();
const mongoose = require('mongoose');
const Warehouse = require('../src/models/warehouse.model');

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI not found in environment');
    process.exit(1);
  }
  
  await mongoose.connect(mongoUri);
  console.log('🔌 Connected to MongoDB Atlas');

  const warehousesToSeed = [
    { name: 'ADIB Warehouse A', code: 'ADIB-A', status: 'Active', location: 'Dubai, UAE' },
    { name: 'ADIB Warehouse B', code: 'ADIB-B', status: 'Active', location: 'Abu Dhabi, UAE' },
    { name: 'ADIB Warehouse C', code: 'ADIB-C', status: 'Active', location: 'Sharjah, UAE' }
  ];

  for (const wh of warehousesToSeed) {
    const existing = await Warehouse.findOne({ name: wh.name });
    if (!existing) {
      await Warehouse.create(wh);
      console.log(`✅ Created warehouse: ${wh.name}`);
    } else {
      existing.status = 'Active';
      await existing.save();
      console.log(`ℹ️ Warehouse already exists (ensured active): ${wh.name}`);
    }
  }

  await mongoose.disconnect();
  console.log('👋 Seeding complete. Disconnected.');
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
