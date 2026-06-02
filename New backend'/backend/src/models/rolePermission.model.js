const mongoose = require('mongoose');

const rolePermissionSchema = new mongoose.Schema(
  {
    roleKey: { type: String, required: true, trim: true, index: true },
    permissionKey: { type: String, required: true, trim: true, index: true },
    allowed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

rolePermissionSchema.index({ roleKey: 1, permissionKey: 1 }, { unique: true });

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
