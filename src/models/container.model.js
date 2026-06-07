const mongoose = require('mongoose');
const { type } = require('os');

const approvalStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['draft', 'pending_fas', 'pending_fas_manager', 'approved'],
    default: 'draft',
  },
  submittedAt: { type: Date, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fasApprovedAt: { type: Date, default: null },
  fasApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fasManagerApprovedAt: { type: Date, default: null },
  fasManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const paymentCostingApprovalStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['draft', 'pending_fas_manager', 'approved'],
    default: 'draft',
  },
  submittedAt: { type: Date, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fasManagerApprovedAt: { type: Date, default: null },
  fasManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const storageAllocationApprovalStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['draft', 'pending_warehouse_manager', 'approved'],
    default: 'draft',
  },
  submittedAt: { type: Date, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  warehouseManagerApprovedAt: { type: Date, default: null },
  warehouseManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const storageArrivalApprovalStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['draft', 'pending_warehouse_manager', 'approved'],
    default: 'draft',
  },
  submittedAt: { type: Date, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  warehouseManagerApprovedAt: { type: Date, default: null },
  warehouseManagerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const actualContainerSchema = new mongoose.Schema({
  actualSerialNo: { type: String },
  commercialInvoiceNo: { type: String },
  blDetailsRemarks: { type: String },
  shipOnBoardDate: { type: Date },
  size: { type: String },
  FCL: { type: Number },
  qtyMT: { type: Number, required: true },
  bags: { type: Number, default: 0 },
  pallet: { type: Number, default: 0 },
  weekWiseShipment: { type: String },
  buyingUnit: { type: String, default: "MT" },
  receivedOn: { type: Date, default: Date.now },
  updatedETD: { type: Date },
  updatedETA: { type: Date },
  CLNo: { type: String },
  // FAS fields
  DHL: { type: String },
  courierTrackNo: { type: String },
  courierServiceProvider: { type: String },
  docArrivalNotes: { type: String },
  BLNo: { type: String },
  expectedDocDate: { type: Date },
  receiver: { type: String },
  bankName: { type: String },
  bankAdvanceAmountDocumentUrl: { type: String },
  bankAdvanceApprovedDocumentUrl: { type: String },
  bankAdvanceSubmittedOn: { type: Date },
  docToBeReleasedOn: { type: Date },
  inwardCollectionAdviceDate: { type: Date },
  inwardCollectionAdviceDocumentUrl: { type: String },
  inwardCollectionAdviceDocumentName: { type: String },
  murabahaContractReleasedDate: { type: Date },
  murabahaContractApprovedDate: { type: Date },
  murabahaContractSubmittedDate: { type: Date },
  murabahaContractSubmittedDocumentUrl: { type: String },
  murabahaContractSubmittedDocumentName: { type: String },
  documentsReleasedDate: { type: Date },
  documentsReleasedDocumentUrl: { type: String },
  documentsReleasedDocumentName: { type: String },

  shipmentArrivedOn: { type: Date },
  clearExpectedOn: { type: Date },
  clearedOn: { type: Date },

  arrivalOn: { type: Date },
  shipmentFreeRetentionDate: { type: Date },
  portRetentionWithPenaltyDate: { type: Date },
  maximumRetentionDate: { type: Date },
  arrivalNoticeDate: { type: Date },
  arrivalNoticeFreeRetentionDays: { type: Number, default: 0 },
  arrivalNoticeDocumentUrl: { type: String },
  arrivalNoticeDocumentName: { type: String },
  advanceRequestDate: { type: Date },
  advanceRequestDocumentUrl: { type: String },
  advanceRequestDocumentName: { type: String },
  doReleasedDate: { type: Date },
  doReleasedDocumentUrl: { type: String },
  doReleasedDocumentName: { type: String },
  doReleasedRemarks: { type: String },
  boePassingDate: { type: Date },
  boePassingDocumentUrl: { type: String },
  boePassingDocumentName: { type: String },
  boePassingRemarks: { type: String },
  dmBarcode: { type: String },
  customsClearanceRemarks: { type: String },
  tokenReceivedDate: { type: Date },
  municipalityDate: { type: Date },
  municipalityDocumentUrl: { type: String },
  municipalityDocumentName: { type: String },
  municipalityRemarks: { type: String },
  municipalityStatus: { type: String, enum: ['open', 'closed'], default: 'open' },
  municipalityStatusComment: { type: String },
  lockedLogisticsSections: [{ type: String }],

  // Customs Original Document Submission
  customsOriginalDocuments: {
    boeSubmissionDate: { type: Date },
    boeDocumentUrl: { type: String },
    boeDocumentName: { type: String },
    doSubmissionDate: { type: Date },
    doDocumentUrl: { type: String },
    doDocumentName: { type: String },
    blOriginalSubmissionDate: { type: Date },
    blOriginalDocumentUrl: { type: String },
    blOriginalDocumentName: { type: String },
    invoiceSubmissionDate: { type: Date },
    invoiceDocumentUrl: { type: String },
    invoiceDocumentName: { type: String },
    packingListSubmissionDate: { type: Date },
    packingListDocumentUrl: { type: String },
    packingListDocumentName: { type: String },
    cooSubmissionDate: { type: Date },
    cooDocumentUrl: { type: String },
    cooDocumentName: { type: String }
  },

  // Step 4 – Shipment Clearing Tracker (doc + date pairs; URLs for S3 later)
  deliveryOrderDocumentUrl: { type: String },
  deliveryOrderDate: { type: Date },
  tokenDocumentUrl: { type: String },
  tokenDate: { type: Date },
  transportArrangedDocumentUrl: { type: String },
  transportArrangedDate: { type: Date },
  customsClearanceDocumentUrl: { type: String },
  customsClearanceDate: { type: Date },
  municipalityClearanceDocumentUrl: { type: String },
  municipalityClearanceDate: { type: Date },

  deliverySchedules: [{
    deliveryDate: { type: Date },
    deliveryNo: { type: String },
    noOfFCL: { type: Number },
    time: { type: String },
    location: { type: String }
  }],
  warehouseSchedules: [{
    deliveryDate: { type: Date },
    deliveryNo: { type: String },
    noOfFCL: { type: Number },
    time: { type: String },
    location: { type: String },
    grn: { type: String }
  }],

  paid_amount :{ type: Number, default: 0 },
  paidOn: { type: Date },
  remarks:{type:String},

  clearance: {
    clearedOn: Date,       // when the container was cleared
    remarks: String,       // remarks from logistics
    warehouse: String      // warehouse where container is stored
  },

  grn: {
    grnNo: String,
    grnDate: Date,
    statusRemarks: String
  },

  noOfContainers: { type: Number },
  noOfBags: { type: Number },
  quantityByMt: { type: Number },
  portOfLoading: { type: String },
  portOfDischarge: { type: String },
  shippingLine: { type: String },
  freeDetentionDays: { type: Number },
  maximumDetentionDays: { type: Number },
  freightPrepared: { type: String, enum: ['Yes', 'No'] },
  billExtractionData: { type: mongoose.Schema.Types.Mixed },
  blDocumentUrl: { type: String },
  blDocumentName: { type: String },
  extractedContainers: [{
    containerNo: { type: String },
    pkgCt: { type: Number }
  }],
  packagingList: {
    brand: { type: String },
    productionDate: { type: String },
    expiryDate: { type: String },
    packingDescription: { type: String },
    totalBags: { type: Number },
    totalGrossWeight: { type: String },
    totalNetWeight: { type: String },
    containerInfo: [{
      container_number: { type: String },
      no_of_bags: { type: Number },
      gross_weight: { type: String },
      net_weight: { type: String }
    }]
  },
  packagingListDocumentUrl: { type: String },
  packagingListDocumentName: { type: String },
  actualBags: { type: Number },
  expiryDate: { type: Date },
  hsCode: { type: String },
  packagingDate: { type: Date },
  grossWeight: { type: String },
  netWeight: { type: String },
  costSheetBookingDocumentUrl: { type: String },
  costSheetBookingDocumentName: { type: String },
  costSheetBookings: [{
    sn: { type: Number },
    description: { type: String },
    visibleTo: [{ type: String }],
    defaultQty: { type: Number, default: 0 },
    defaultRate: { type: Number, default: 0 },
    requestAmount: { type: Number },
    paymentTo: { type: String, default: '' },
    paymentTerm: { type: String, default: '' },
    // POINT 5: paidAmount removed, replaced with remarks
    remarks: { type: String, default: '' },
    attachmentDocumentUrl: { type: String },
    attachmentDocumentName: { type: String }
  }],
  clearingAdvanceApproval: {
    type: approvalStateSchema,
    default: () => ({
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      fasApprovedAt: null,
      fasApprovedBy: null,
      fasManagerApprovedAt: null,
      fasManagerApprovedBy: null,
    }),
  },
  storageAllocations: [{
    sn: { type: Number },
    containerSerialNo: { type: String },
    bags: { type: Number },
    warehouse: { type: String },
    storageAvailability: { type: Number }
  }],
  storageAllocationApproval: {
    type: storageAllocationApprovalStateSchema,
    default: () => ({
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      warehouseManagerApprovedAt: null,
      warehouseManagerApprovedBy: null,
    }),
  },
  maximumRetentionDate: { type: Date },
  transportationBooked: [{
    sn: { type: Number },
    containerSerialNo: { type: String },
    transportCompanyName: { type: String, default: '' },
    bookedDate: { type: Date },
    bookingTime: { type: String },
    transportDate: { type: Date },
    transportTime: { type: String },
    delayHours: { type: Number }
  }],
  storageSplits: [{
    containerSerialNo: { type: String },
    bags: { type: Number },
    warehouse: { type: String },
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
    remarks: { type: String },
    documentUrl: { type: String },
    documentName: { type: String }
  }],
  storageDocumentUrl: { type: String },
  storageDocumentName: { type: String },
  storageArrivalApproval: {
    type: storageArrivalApprovalStateSchema,
    default: () => ({
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      warehouseManagerApprovedAt: null,
      warehouseManagerApprovedBy: null,
    }),
  },
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
    thirdPartyReportDocumentName: { type: String }
    ,
    remarks: { type: String },
    attachmentDocumentUrl: { type: String },
    attachmentDocumentName: { type: String }
  }],
  qualityReports: [{
    phase: { type: String },
    reportDate: { type: Date },
    remarks: { type: String },
    documentUrl: { type: String },
    documentName: { type: String }
  }],
  paymentAllocations: [{
    sn: { type: Number },
    description: { type: String },
    visibleTo: [{ type: String }],
    requestAmount: { type: Number },
    paidAmount: { type: Number },
    paymentTo: { type: String, default: '' },
    paymentTerm: { type: String, default: '' },
    reference: { type: String },
    attachmentDocumentUrl: { type: String },
    attachmentDocumentName: { type: String }
  }],
  paymentCostings: [{
    sn: { type: Number },
    description: { type: String },
    visibleTo: [{ type: String }],
    requestAmount: { type: Number },
    paidAmount: { type: Number },
    // POINT 7: actualPaid removed — difference is now paidAmount - requestAmount
    refBillNo: { type: String },
    refBillDate: { type: Date },
    refBillVendor: { type: String },
    refBillDocumentUrl: { type: String },
    refBillDocumentName: { type: String }
  }],
  paymentCostingApproval: {
    type: paymentCostingApprovalStateSchema,
    default: () => ({
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      fasManagerApprovedAt: null,
      fasManagerApprovedBy: null,
    }),
  },
  packagingExpenses: [{
    sn: { type: Number },
    item: { type: String },
    packing: { type: String },
    qty: { type: Number },
    uom: { type: String },
    unitCostFC: { type: Number },
    unitCostDH: { type: Number },
    totalCostFC: { type: Number },
    totalCostDH: { type: Number },
    expenseAllocationFactor: { type: Number },
    expensesAllocated: { type: Number },
    totalValueWithExpenses: { type: Number },
    landedCostPerUnit: { type: Number },
    reference: { type: String }
  }],
  paymentCostingDocumentUrl: { type: String },
  paymentCostingDocumentName: { type: String }

}, { timestamps: true });

const containerSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Shipment", required: true },

  // Planned container info
  planned: {
    size: { type: String },
    qtyMT: { type: Number, default: 0 },
    bags: { type: Number, default: 0 },
    FCL: { type: Number },
    etd: { type: Date },
    eta: { type: Date },
    weekWiseShipment: { type: String },
    buyingUnit: { type: String, default: "MT" }
  },

  // Multiple actual entries per planned container
  actual: actualContainerSchema,

  status: { type: String, enum: ["Planned", "Actual","Documented", "Arrived","Paid", "Cleared","GRN"], default: "Planned" }

}, { timestamps: true });

module.exports = mongoose.model("Container", containerSchema);
