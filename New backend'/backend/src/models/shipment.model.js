const mongoose = require('mongoose');
const { type } = require('os');

const shipmentSchema = new mongoose.Schema({

  poNumber: { type: String, required: true },
  year: { type: Number, required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: false },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
  supplierName: { type: String },
  supplierEmail: { type: String, trim: true, lowercase: true },
  itemCode: { type: String },
  itemDescription: { type: String },
  commodity: { type: String },
  countryOfOrigin: { type: String },
  brandName: { type: String },
  barcode: { type: String },
  variant: { type: String },
  hsCode: { type: String },
  packing: { type: String },
  portOfLoading: { type: String },
  portOfDischarge: { type: String },
  piDate: { type: Date },
  fcl: { type: Number, default: 0 },
  pallet: { type: Number, default: 0 },
  bags: { type: Number, default: 0 },
  bankName: { type: String },
  q1Report: { type: mongoose.Schema.Types.Mixed },
  lineItems: [{
    lineNo: { type: Number },
    itemCode: { type: String },
    itemDescription: { type: String },
    commodity: { type: String },
    countryOfOrigin: { type: String },
    brandName: { type: String },
    barcode: { type: String },
    dmBarcode: { type: String },
    variant: { type: String },
    hsCode: { type: String },
    packagingType: { type: String },
    containerSize: { type: String },
    plannedContainers: { type: Number, default: 0 },
    fcl: { type: Number, default: 0 },
    pallet: { type: Number, default: 0 },
    bags: { type: Number, default: 0 },
    buyingUnit: { type: String },
    fclPerUnit: { type: Number, default: 0 },
    fcPerUnit: { type: Number, default: 0 },
    totalUSD: { type: Number, default: 0 },
    totalAED: { type: Number, default: 0 },
    expectedETD: { type: Date },
    expectedETA: { type: Date }
  }],

  shipmentNo: { type: String, unique: true },
  plannedQtyMT: { type: Number, required: true },
  piNo:{type:String},
  fpoNo:{type:String},
  // 🔹 Assumed / Planned split
  assumedContainerCount: { type: Number },
  assumedQtyPerContainer: { type: Number },

  // 🔹 Actual split tracking
  totalSplitQtyMT: { type: Number, default: 0 },
  actualContainerCount: { type: Number, default: 0 },
  isFullySplit: { type: Boolean, default: false },
  orderDate:Date,
  plannedETD: Date,
  plannedETA: Date,
  actualArrivalDate: Date,

  fcPerUnit: { type: Number }, 
  totalFC: { type: Number},        
  amountAED: { type: Number },      
  paymentTerms: { type: String},   
  advanceAmount: { type: Number, default: 0 }, 
  incoterms:{type:String},
  buyunit:{type:String},
  lpoDocumentName: { type: String },
  lpoDocumentUrl: { type: String },
  proformaDocumentName: { type: String },
  proformaDocumentUrl: { type: String },
  s1QualityReportName: { type: String },
  s1QualityReportUrl: { type: String },
  containersize:{type:Number, default: 0 },
  payment: {
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partially Paid", "Paid"],
    default: "Pending"
  },
  
},
      
  advanceAmountDate: { type: Date },   

  noOfShipments: { type: Number, default: null },
  currentStage: {
    type: String,
    enum: [
      "Shipment Entry",
      "Planned Split",
      "Shipment Split",
      "B/L Details",
      "Documentation",
      "Port & Customs",
      "Storage",
      "Quality",
      "Payment Costing",
      "Completed"
    ],
    default: "Shipment Entry"
  }

}, { timestamps: true });

module.exports = mongoose.model("Shipment", shipmentSchema);
