const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    resource: { type: String, required: true, trim: true },
    screen: { type: String, default: '', trim: true },
    tab: { type: String, default: '', trim: true },
    field: { type: String, default: '', trim: true },
    action: { type: String, default: '', trim: true },
    type: {
      type: String,
      enum: ['screen', 'tab', 'field', 'action'],
      required: true,
    },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
