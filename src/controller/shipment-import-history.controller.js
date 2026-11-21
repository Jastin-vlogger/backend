// Import history: when each document (BL, packing list, arrival notice, DPW cargo, cost sheet) was
// imported into a shipment, by whom and from which file. Read-only; entries are written where the
// imported data is saved (see core/utils/importLog.js).
const mongoose = require('mongoose');
const DocumentImportLog = require('../models/documentImportLog.model');

exports.getShipmentImportHistory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid shipment id' });
    }
    const rows = await DocumentImportLog.find({ shipmentId: id })
      .sort({ importedAt: -1 })
      .limit(300)
      .lean();

    res.json({
      items: rows.map((row) => ({
        _id: row._id,
        containerId: row.containerId || null,
        source: row.source,
        action: row.action || 'import',
        fileName: row.fileName || '',
        importedAt: row.importedAt || row.createdAt,
        importedBy: row.importedBy?.name || '',
        summary: row.summary || {},
      })),
    });
  } catch (err) {
    console.error('getShipmentImportHistory error:', err);
    res.status(500).json({ message: 'Unable to load import history' });
  }
};
