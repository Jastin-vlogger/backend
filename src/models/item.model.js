const mongoose = require('mongoose');
const { type } = require('os');

const itemSchema = new mongoose.Schema({
  itemCode: { type: String, unique:true, required:true },
  description: { type: String, required:true },
  riceName:{type:String},
  brand: { type: String },
  blend: { type: String },
  grainType: { type: String },
  processType: { type: String },
  countryOfOrigin: { type: String },
  barcode: { type: String },
  dmBarcode: { type: String },
  hsCode: { type: String },
  variant: { type: String },
  category: { type: String, default: 'Rice' },
  packing: { type: String },
  bagWeightKg: { type: Number },
  unit: { type: String, default:"MT" },
  status: { type: String, enum:["Active","Inactive"], default:"Active" }
}, { timestamps:true });

module.exports = mongoose.model("Item", itemSchema);
