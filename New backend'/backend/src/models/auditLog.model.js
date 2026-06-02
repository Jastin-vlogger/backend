const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  module: { // e.g
    type: String, 
    required: true // e.g., "Purchase", "Logistics", "FAS", "Auth", "Master"
  },
  entity: { 
    type: String, 
    required: true // e.g., "Shipment", "Container", "PO", "Item", "User"
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  },
  action: { 
    type: String, 
    required: true // e.g., "Created", "Updated", "StageChange", "Login"
  },
  before: { type: Object, default: {} }, // optional snapshot of data before change
  after: { type: Object, default: {} },  // optional snapshot of data after change
  remarks: { type: String }              // optional human-readable info
}, { timestamps: true }); // createdAt + updatedAt

module.exports = mongoose.model("AuditLog", auditLogSchema);
