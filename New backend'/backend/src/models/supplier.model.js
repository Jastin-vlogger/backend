const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  supplierCode: { type: String, unique:true, required:true },
  name: { type: String, required:true },
  companyName: { type: String, trim: true },
  country: { type: String, required:true },
  status: { type: String, enum:["Pending", "Active", "Inactive"], default:"Pending" },
  contactPersonName: { type: String, trim: true },
  contactEmail: { type: String, trim: true, lowercase: true, index: true },
  contactPhone: { type: String, trim: true },
  addressLine1: { type: String, trim: true },
  addressLine2: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  registrationNotes: { type: String, trim: true },
  registrationStage: { type: String, enum: ['In Progress', 'Draft'], default: 'Draft' },
  profileCompletionPercent: { type: Number, default: 100 },
  profileCompletedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
  activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastProfileUpdatedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Supplier", supplierSchema);
