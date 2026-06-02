const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true },
  location: { type: String },
  managerName: { type: String },
  capacity: { type: Number },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  assignedStorekeepers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
