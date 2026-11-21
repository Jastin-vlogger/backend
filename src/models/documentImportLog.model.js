// One row per document import (OCR extraction saved into a shipment, or a cost-sheet Excel import).
// The extraction endpoints themselves are stateless; this log is written where the imported data is
// actually persisted, so "when was this imported, by whom, from which file" can always be answered.
const mongoose = require('mongoose');

const documentImportLogSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
  containerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Container', index: true },
  source: {
    type: String,
    required: true,
    enum: ['bl', 'packing_list', 'arrival_notice', 'dpw_cargo', 'cost_sheet'],
  },
  action: { type: String, default: 'import' }, // import | reimport | submit | unlock
  fileName: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  importedAt: { type: Date, default: Date.now, index: true },
  importedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, default: '' },
  },
  // Small, human-readable facts about the import (container count, sheet count, reason, ...).
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('DocumentImportLog', documentImportLogSchema);
