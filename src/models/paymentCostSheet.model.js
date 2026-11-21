// Payment Costing sheet imported from the Accounts department's Excel cost sheet.
// One sheet per shipment + BL (every container of a BL shows the same sheet). The full structure
// (cells, formulas, merges, number formats, basic styles) is kept as a JSON snapshot so the sheet
// can be shown, downloaded as Excel/PDF and reviewed exactly as imported.
const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, default: '' },
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, enum: ['import', 'reimport', 'submit', 'unlock'], required: true },
  at: { type: Date, default: Date.now },
  by: { type: actorSchema, default: () => ({}) },
  fileName: { type: String, default: '' },
  note: { type: String, default: '' },
}, { _id: false });

const paymentCostSheetSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
  // Normalised BL no (trim + upper-case), or `container:<id>` when the container has no BL no.
  blKey: { type: String, required: true },
  blNo: { type: String, default: '' },
  containerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Container' }],

  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  stats: {
    sheets: { type: Number, default: 0 },
    cells: { type: Number, default: 0 },
  },
  source: {
    fileName: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    size: { type: Number, default: 0 },
    sha256: { type: String, default: '' },
  },

  // 'locked' = submitted after review; only Admin/Manager can unlock. Enforced by the API.
  status: { type: String, enum: ['draft', 'locked'], default: 'draft' },
  importedAt: { type: Date, default: Date.now },
  importedBy: { type: actorSchema, default: () => ({}) },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: actorSchema, default: () => ({}) },
  unlockedAt: { type: Date, default: null },
  unlockedBy: { type: actorSchema, default: () => ({}) },
  unlockReason: { type: String, default: '' },

  history: [historySchema],
}, { timestamps: true });

paymentCostSheetSchema.index({ shipmentId: 1, blKey: 1 }, { unique: true });

module.exports = mongoose.model('PaymentCostSheet', paymentCostSheetSchema);
