// LocalPurchase — a fully independent collection for nearby-store purchases (no PO/BL/packing
// list/S1-quality-report — those don't apply, this isn't an overseas shipment). Genuinely
// separate from Shipment/Container: no BL, no FCL/pallet container-split tracking, and
// storage/quality data is embedded directly here (one purchase = one storage/quality record
// set, not 1:many like Container is for Shipment). Mirrors Shipment's creation-relevant fields
// where they overlap, and the storageSplits/qualityRows sub-schemas are copied field-for-field
// from container.model.js (confirmed identical shape per plan) so downstream reporting/export
// logic that already understands that shape can be reused with minimal adaptation.
const mongoose = require('mongoose');

const localPurchaseSchema = new mongoose.Schema({
  lpNumber: { type: String, required: true, unique: true }, // auto-generated, mirrors shipmentNo pattern
  year: { type: Number, required: true },

  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String },
  supplierEmail: { type: String, trim: true, lowercase: true },

  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  itemCode: { type: String },
  itemDescription: { type: String },
  commodity: { type: String },
  countryOfOrigin: { type: String },
  brandName: { type: String },
  barcode: { type: String },
  variant: { type: String },
  hsCode: { type: String },
  packing: { type: String },

  orderDate: { type: Date },
  plannedQtyMT: { type: Number, required: true },
  buyunit: { type: String },

  fcPerUnit: { type: Number },
  totalFC: { type: Number },
  amountAED: { type: Number },
  paymentTerms: { type: String },
  incoterms: { type: String },
  advanceAmount: { type: Number, default: 0 },
  advanceAmountDate: { type: Date },
  bankName: { type: String },

  // Only document required at creation — no PI/BL/commercial doc/S1-quality-report.
  lpoDocumentName: { type: String },
  lpoDocumentUrl: { type: String },
  // Both LPO and S1 Quality Report are uploaded at Local Purchase creation, same as the regular
  // Shipment flow — this is what lets extraction reuse the Python service's real /shipment-form
  // endpoint unmodified (it requires both files; there's no separate LPO-only endpoint).
  s1QualityReportName: { type: String },
  s1QualityReportUrl: { type: String },
  // Optional — not used for extraction (only lpoDocument + s1QualityReport go to the Python
  // service), just stored/attached.
  commercialDocumentName: { type: String },
  commercialDocumentUrl: { type: String },

  payment: {
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Partially Paid', 'Paid'], default: 'Pending' },
  },

  currentStage: {
    type: String,
    enum: ['Local Purchase Entry', 'Storage Allocation', 'Storage & Arrival', 'Quality', 'Completed'],
    default: 'Local Purchase Entry',
  },

  // Stage 2: Storage Allocation — single-destination-warehouse decision (LP is always one
  // item/one quantity, unlike Shipment's per-container/per-item allocation matrix, so this is
  // deliberately just one string, not container.model.js's itemAllocations/warehousesSelected
  // shape). Approval state mirrors container.model.js:30-42's storageAllocationApprovalStateSchema
  // field-for-field.
  storageAllocationDecision: {
    warehouse: { type: String, default: '' },
  },
  storageAllocationApproval: {
    status: { type: String, enum: ['draft', 'pending_warehouse_manager', 'approved'], default: 'draft' },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastUpdatedAt: { type: Date, default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    warehouseManagerApprovedAt: { type: Date, default: null },
    warehouseManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },

  // Copied field-for-field from container.model.js:396-450 (Container.actual.storageSplits) —
  // "model data is the same thing" per plan; embedded directly since there's no per-container
  // multiplicity to track here.
  storageSplits: [{
    containerSerialNo: { type: String },
    bags: { type: Number },
    warehouse: { type: String },
    block: { type: String },
    storageAvailability: { type: Number },
    receivedOnDate: { type: Date },
    receivedOnTime: { type: String },
    customsInspection: { type: String },
    grn: { type: String },
    batch: { type: String },
    productionDate: { type: Date },
    expiryDate: { type: Date },
    hsCode: { type: String },
    grossWeight: { type: String },
    netWeight: { type: String },
    shortageBags: { type: Number, default: 0 },
    remarks: { type: String },
    documentUrl: { type: String },
    documentName: { type: String },
  }],

  // Copied field-for-field from container.model.js:429-450 (Container.actual.qualityRows).
  qualityRows: [{
    sn: { type: Number },
    sampleNo: { type: String },
    phase: { type: String },
    date: { type: Date },
    inhouseReportNo: { type: String },
    inhouseReportDate: { type: Date },
    inhouseReportDocumentUrl: { type: String },
    inhouseReportDocumentName: { type: String },
    strategicReportNo: { type: String },
    strategicReportDate: { type: Date },
    strategicReportDocumentUrl: { type: String },
    strategicReportDocumentName: { type: String },
    thirdPartyReportNo: { type: String },
    thirdPartyReportDate: { type: Date },
    thirdPartyReportDocumentUrl: { type: String },
    thirdPartyReportDocumentName: { type: String },
    remarks: { type: String },
    attachmentDocumentUrl: { type: String },
    attachmentDocumentName: { type: String },
  }],
}, { timestamps: true });

module.exports = mongoose.model('LocalPurchase', localPurchaseSchema);
