process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const User = require('../src/models/auth.model');
const Shipment = require('../src/models/shipment.model');
const Container = require('../src/models/container.model');

// Mock socket.io to prevent any errors during real-time updates
global.io = {
  to: () => ({
    emit: () => {},
  }),
};

async function runE2eTest() {
  console.log('🚀 Starting Storage Allocation splits E2E integration test...');

  // 1. Connect to database
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }
  await mongoose.connect(mongoUri);
  console.log('✅ DB Connected');

  let testUser = null;
  let testShipment = null;
  let testContainer = null;
  let server = null;

  try {
    // Clean up any stale test data first
    await User.deleteMany({ email: 'e2e-test-user@shiplogic.com' });

    // 2. Create a test user with 'Purchase' role
    testUser = await User.create({
      name: 'E2E Test User',
      email: 'e2e-test-user@shiplogic.com',
      password: 'password123',
      role: 'Purchase',
      isActive: true,
    });
    console.log('✅ Created test user:', testUser.email);

    // 3. Generate Auth JWT token
    const token = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET);

    // 4. Create dummy Shipment
    testShipment = await Shipment.create({
      poNumber: 'E2E-TEST-PO-999',
      year: 2026,
      plannedQtyMT: 100,
    });
    console.log('✅ Created test shipment:', testShipment.poNumber);

    // 5. Create dummy Container with initial status
    testContainer = await Container.create({
      shipmentId: testShipment._id,
      status: 'Actual',
      actual: {
        qtyMT: 50.5,
        bags: 1000,
        pallet: 5,
        storageAllocationSplits: [
          { sn: 1, itemName: 'Initial Item', quantity: 50.5, warehouse: '' }
        ]
      }
    });
    console.log('✅ Created test container with ID:', testContainer._id);

    // 6. Spin up Express app on a dynamic port
    server = app.listen(0);
    const port = server.address().port;
    console.log(`✅ Test server listening on port ${port}`);

    // 7. Define storage allocation split payload
    const payload = {
      storageAllocationDecision: {
        similarItems: false,
        splitRequired: true,
        splitQuantity: 2,
      },
      storageAllocationSplits: [
        { sn: 1, itemName: 'Item A', quantity: 20, warehouse: 'Warehouse Alpha' },
        { sn: 2, itemName: 'Item B', quantity: 30.5, warehouse: 'Warehouse Beta' },
      ],
    };

    // 8. Execute HTTP PATCH request
    const response = await fetch(`http://localhost:${port}/api/v1/shipment/container/bl-details/${testContainer._id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Verify response status
    console.log(`📡 Response Status: ${response.status}`);
    assert.equal(response.status, 200, `Expected 200 OK, got ${response.status}`);

    const resBody = await response.json();
    console.log('📡 Response Body Message:', resBody.message);
    assert.equal(resBody.message, 'B/L details updated successfully');

    // 9. Query DB and assert persistence
    const updated = await Container.findById(testContainer._id);
    assert.ok(updated, 'Container should exist in database');

    console.log('🔍 Asserting database values...');
    
    // Assert decision
    assert.equal(updated.actual.storageAllocationDecision.splitRequired, true, 'splitRequired should be true');
    assert.equal(updated.actual.storageAllocationDecision.splitQuantity, 2, 'splitQuantity should be 2');
    assert.equal(updated.actual.storageAllocationDecision.similarItems, false, 'similarItems should be false');

    // Assert split rows list
    assert.equal(updated.actual.storageAllocationSplits.length, 2, 'Should have exactly 2 split rows');

    // Row 1
    assert.equal(updated.actual.storageAllocationSplits[0].sn, 1, 'Row 1 SN should be 1');
    assert.equal(updated.actual.storageAllocationSplits[0].itemName, 'Item A', 'Row 1 itemName should be Item A');
    assert.equal(updated.actual.storageAllocationSplits[0].quantity, 20, 'Row 1 quantity should be 20');
    assert.equal(updated.actual.storageAllocationSplits[0].warehouse, 'Warehouse Alpha', 'Row 1 warehouse should be Warehouse Alpha');

    // Row 2
    assert.equal(updated.actual.storageAllocationSplits[1].sn, 2, 'Row 2 SN should be 2');
    assert.equal(updated.actual.storageAllocationSplits[1].itemName, 'Item B', 'Row 2 itemName should be Item B');
    assert.equal(updated.actual.storageAllocationSplits[1].quantity, 30.5, 'Row 2 quantity should be 30.5');
    assert.equal(updated.actual.storageAllocationSplits[1].warehouse, 'Warehouse Beta', 'Row 2 warehouse should be Warehouse Beta');

    console.log('🎉 E2E assertions passed successfully!');

  } finally {
    // 10. Database Cleanup
    console.log('🧹 Cleaning up test data...');
    if (testContainer) {
      await Container.deleteOne({ _id: testContainer._id });
    }
    if (testShipment) {
      await Shipment.deleteOne({ _id: testShipment._id });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    console.log('✅ Stale test records cleaned');

    // 11. Close Express server and DB Connection
    if (server) {
      server.close();
      console.log('✅ Test server closed');
    }
    await mongoose.connection.close();
    console.log('✅ DB Connection closed');
  }
}

runE2eTest().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
