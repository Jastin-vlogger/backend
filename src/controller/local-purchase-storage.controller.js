// Local Purchase — Storage & Arrival save. Mirrors updateStorageDetails's row-save shape
// (shipment-actions.controller.js) but simplified: storageSplits is embedded directly on the
// LocalPurchase document (no per-container multiplicity, no approval-state workflow — none of
// that was requested for this flow, only the row data shape itself).
const LocalPurchase = require('../models/local-purchase.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { uploadBufferToS3 } = require('../core/utils/s3Upload');

const parseJsonField = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
};
const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeUploadedFiles = (files) => {
  if (!files) return {};
  if (!Array.isArray(files)) return files;
  return files.reduce((acc, file) => {
    if (!file?.fieldname) return acc;
    (acc[file.fieldname] ||= []).push(file);
    return acc;
  }, {});
};

exports.updateLocalPurchaseStorage = async (req, res) => {
  try {
    const localPurchase = await LocalPurchase.findById(req.params.id);
    if (!localPurchase) return res.status(404).json({ message: 'Local Purchase not found' });

    const files = normalizeUploadedFiles(req.files);
    const parsedStorageSplits = parseJsonField(req.body.storageSplits);
    if (!Array.isArray(parsedStorageSplits)) {
      return res.status(400).json({ message: 'storageSplits must be an array' });
    }

    // Incremental arrivals against a fixed ordered quantity (e.g. 10 now, 20 later, up to the
    // plannedQtyMT total) — reject upfront, before any mutation, if the rows being saved would
    // sum past what was ordered. Adapted from shipment-actions.controller.js's
    // createPlannedContainersBulk cap-check (guard -> compare -> explicit 400), but as a single
    // sum-of-the-whole-incoming-array comparison since this endpoint replaces the whole
    // storageSplits array per save rather than appending one row at a time.
    const totalQty = Number(localPurchase.plannedQtyMT) || 0;
    const incomingTotal = parsedStorageSplits.reduce((sum, row) => sum + (Number(row.bags) || 0), 0);
    if (totalQty > 0 && incomingTotal > totalQty) {
      const unit = localPurchase.buyunit || 'units';
      return res.status(400).json({
        message: `Cannot save storage allocation of ${incomingTotal} ${unit}. Total would exceed ordered quantity (${totalQty} ${unit}).`,
      });
    }

    const before = { storageSplits: localPurchase.storageSplits };

    localPurchase.storageSplits = parsedStorageSplits.map((row, index) => {
      const existing = localPurchase.storageSplits?.[index] || {};
      const rowUpload = files[`storageSplits_${index}_document`]?.[0];
      return {
        containerSerialNo: row.containerSerialNo || '',
        bags: Number(row.bags ?? 0) || 0,
        warehouse: row.warehouse || '',
        block: row.block || '',
        storageAvailability: Number(row.storageAvailability) || 0,
        receivedOnDate: toDateOrNull(row.receivedOnDate),
        receivedOnTime: row.receivedOnTime || '',
        customsInspection: row.customsInspection || 'No',
        grn: row.grn || '',
        batch: row.batch || '',
        productionDate: toDateOrNull(row.productionDate),
        expiryDate: toDateOrNull(row.expiryDate),
        hsCode: row.hsCode || '',
        grossWeight: row.grossWeight || '',
        netWeight: row.netWeight || '',
        shortageBags: Number(row.shortageBags ?? existing.shortageBags ?? 0) || 0,
        remarks: row.remarks || '',
        documentUrl: rowUpload ? undefined : (row.documentUrl || existing.documentUrl || ''),
        documentName: rowUpload ? undefined : (row.documentName || existing.documentName || ''),
      };
    });

    for (let index = 0; index < localPurchase.storageSplits.length; index++) {
      const rowUpload = files[`storageSplits_${index}_document`]?.[0];
      if (!rowUpload) continue;
      const uploaded = await uploadBufferToS3(rowUpload, `local-purchase/storage/row-${index + 1}`);
      localPurchase.storageSplits[index].documentUrl = uploaded.url;
      localPurchase.storageSplits[index].documentName = uploaded.fileName;
    }

    // Advance stage once the first real storage row exists — mirrors the shipment flow's
    // "any recorded data promotes the stage" behavior, without an approval-state machine.
    // Checked against both pre-Stage-2 states, since Storage Allocation (added later) now sits
    // between Entry and Storage & Arrival — a save here can arrive from either.
    const isBeforeStorageArrival = localPurchase.currentStage === 'Local Purchase Entry' || localPurchase.currentStage === 'Storage Allocation';
    if (isBeforeStorageArrival && localPurchase.storageSplits.some((s) => s.grn || s.batch || s.receivedOnDate)) {
      localPurchase.currentStage = 'Storage & Arrival';
    }

    await localPurchase.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Local Purchase',
      entity: 'LocalPurchase',
      entityId: localPurchase._id,
      action: 'Updated',
      before,
      after: { storageSplits: localPurchase.storageSplits },
      remarks: 'Storage & Arrival details updated',
    });

    res.status(200).json({ message: 'Storage & Arrival details updated successfully', data: localPurchase });
  } catch (err) {
    console.error('updateLocalPurchaseStorage error:', err);
    res.status(500).json({ message: err.message });
  }
};
