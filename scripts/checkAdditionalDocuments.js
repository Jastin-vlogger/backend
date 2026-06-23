/**
 * Diagnostic script to check additionalDocuments in the database
 * Run with: node scripts/checkAdditionalDocuments.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Container = require('../src/models/container.model');

async function checkDocuments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/royal-horizon');
    console.log('✅ Connected to MongoDB');

    // Find all containers with actual data
    const containers = await Container.find({ 
      actual: { $exists: true, $ne: null } 
    }).select('_id actual.actualSerialNo actual.commercialInvoiceNo actual.additionalDocuments').lean();

    console.log(`\n📦 Found ${containers.length} containers with actual data\n`);

    let totalWithDocs = 0;
    let totalDocuments = 0;

    containers.forEach((container, index) => {
      const docs = container.actual?.additionalDocuments || [];
      const serialNo = container.actual?.actualSerialNo || container.actual?.commercialInvoiceNo || 'Unknown';
      
      if (docs.length > 0) {
        totalWithDocs++;
        totalDocuments += docs.length;
        console.log(`Container ${index + 1} (${serialNo}): ${docs.length} document(s)`);
        docs.forEach((doc, docIndex) => {
          console.log(`  - Doc ${docIndex + 1}: ${doc.documentType || 'Unknown'} - ${doc.description || 'No description'}`);
          console.log(`    File: ${doc.fileName || 'No filename'}`);
          console.log(`    Uploaded: ${doc.uploadedAt || 'Unknown date'} by ${doc.uploadedBy || 'Unknown user'}`);
        });
      }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total containers: ${containers.length}`);
    console.log(`   Containers with documents: ${totalWithDocs}`);
    console.log(`   Containers without documents: ${containers.length - totalWithDocs}`);
    console.log(`   Total documents: ${totalDocuments}`);

    if (totalWithDocs === 0) {
      console.log('\n⚠️  No containers have additionalDocuments uploaded.');
      console.log('   This explains why "No documents uploaded yet" appears in the UI.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDocuments();
