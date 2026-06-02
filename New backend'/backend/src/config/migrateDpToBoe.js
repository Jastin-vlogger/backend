const mongoose = require('mongoose');
const Container = require('../models/container.model');
require('dotenv').config();

/**
 * Migration script to rename dpApprovalDate to boePassingDate
 * and related document fields
 */
async function migrateDpToBoe() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await Container.updateMany(
      {
        $or: [
          { 'actual.dpApprovalDate': { $exists: true } },
          { 'actual.dpApprovalDocumentUrl': { $exists: true } },
          { 'actual.dpApprovalDocumentName': { $exists: true } },
          { 'actual.dpApprovalRemarks': { $exists: true } }
        ]
      },
      {
        $rename: {
          'actual.dpApprovalDate': 'actual.boePassingDate',
          'actual.dpApprovalDocumentUrl': 'actual.boePassingDocumentUrl',
          'actual.dpApprovalDocumentName': 'actual.boePassingDocumentName',
          'actual.dpApprovalRemarks': 'actual.boePassingRemarks'
        }
      }
    );

    console.log(`Migration completed. Modified ${result.modifiedCount} containers.`);
    
    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateDpToBoe();
}

module.exports = migrateDpToBoe;
