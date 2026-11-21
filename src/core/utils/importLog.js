const DocumentImportLog = require('../../models/documentImportLog.model');

// Best-effort: an import log failure must never break the save that triggered it.
const recordDocumentImports = async (entries, user) => {
  try {
    const rows = (Array.isArray(entries) ? entries : [entries])
      .filter(Boolean)
      .map((entry) => ({
        shipmentId: entry.shipmentId || null,
        containerId: entry.containerId || null,
        source: entry.source,
        action: entry.action || 'import',
        fileName: entry.fileName || '',
        fileUrl: entry.fileUrl || '',
        importedAt: new Date(),
        importedBy: { id: user?._id || null, name: user?.name || user?.email || '' },
        summary: entry.summary || {},
      }));
    if (!rows.length) return;
    await DocumentImportLog.insertMany(rows);
  } catch (err) {
    console.error('Document import log warning:', err.message);
  }
};

module.exports = { recordDocumentImports };
