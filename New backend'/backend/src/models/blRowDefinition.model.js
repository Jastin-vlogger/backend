const mongoose = require('mongoose');

const blRowDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    sn: { type: Number, required: true, unique: true },
    description: { type: String, required: true, trim: true },
    visibleTo: [{ type: String }],
    defaultQty: { type: Number, default: 1 },
    defaultRate: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BLRowDefinition', blRowDefinitionSchema);
