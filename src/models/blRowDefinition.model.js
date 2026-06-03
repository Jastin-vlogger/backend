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
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BLRowDefinition', blRowDefinitionSchema);
