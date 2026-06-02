// src/core/utils/auditLogger.js
const AuditLog = require('../../models/auditLog.model');

const logAudit = async ({ userId, module, entity, entityId, action, before, after, remarks }) => {
  try {
    const log = new AuditLog({
      userId,
      module,
      entity,
      entityId,
      action,
      before,
      after,
      remarks
    });
    await log.save();
  } catch (err) {
    console.error("Audit Log Error:", err.message);
  }
};

module.exports = logAudit;
