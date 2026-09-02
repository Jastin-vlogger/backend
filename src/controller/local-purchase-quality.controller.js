// Local Purchase — Quality save. Mirrors updateQualityDetails's qualityRows shape
// (shipment-actions.controller.js) — qualityRows embedded directly on the LocalPurchase
// document, same field-for-field shape, no qualityReports/S1-report-card side (Local Purchase
// never has an S1 quality report at creation, unlike a real overseas shipment).
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

exports.updateLocalPurchaseQuality = async (req, res) => {
  try {
    const localPurchase = await LocalPurchase.findById(req.params.id);
    if (!localPurchase) return res.status(404).json({ message: 'Local Purchase not found' });

    const files = normalizeUploadedFiles(req.files);
    const parsedQualityRows = parseJsonField(req.body.qualityRows);
    if (!Array.isArray(parsedQualityRows)) {
      return res.status(400).json({ message: 'qualityRows must be an array' });
    }

    const uploadedByField = {};
    for (const [field, list] of Object.entries(files)) {
      const file = Array.isArray(list) ? list[0] : null;
      if (!file) continue;
      const uploaded = await uploadBufferToS3(file, `local-purchase/quality/${field}`);
      uploadedByField[field] = uploaded;
    }

    const before = { qualityRows: localPurchase.qualityRows };

    localPurchase.qualityRows = parsedQualityRows.map((row, index) => {
      const existing = localPurchase.qualityRows?.[index] || {};
      const inhouseUpload = uploadedByField[`qualityRows_${index}_inhouse`];
      const strategicUpload = uploadedByField[`qualityRows_${index}_strategic`];
      const thirdPartyUpload = uploadedByField[`qualityRows_${index}_thirdParty`];
      const attachmentUpload = uploadedByField[`qualityRows_${index}_attachment`];
      return {
        sn: Number(row.sn) || index + 1,
        sampleNo: row.sampleNo || '',
        phase: row.phase || 'S1',
        date: toDateOrNull(row.date),
        inhouseReportNo: row.inhouseReportNo || '',
        inhouseReportDate: toDateOrNull(row.inhouseReportDate),
        inhouseReportDocumentUrl: inhouseUpload?.url || row.inhouseReportDocumentUrl || existing.inhouseReportDocumentUrl || '',
        inhouseReportDocumentName: inhouseUpload?.fileName || row.inhouseReportDocumentName || existing.inhouseReportDocumentName || '',
        strategicReportNo: row.strategicReportNo || '',
        strategicReportDate: toDateOrNull(row.strategicReportDate),
        strategicReportDocumentUrl: strategicUpload?.url || row.strategicReportDocumentUrl || existing.strategicReportDocumentUrl || '',
        strategicReportDocumentName: strategicUpload?.fileName || row.strategicReportDocumentName || existing.strategicReportDocumentName || '',
        thirdPartyReportNo: row.thirdPartyReportNo || '',
        thirdPartyReportDate: toDateOrNull(row.thirdPartyReportDate),
        thirdPartyReportDocumentUrl: thirdPartyUpload?.url || row.thirdPartyReportDocumentUrl || existing.thirdPartyReportDocumentUrl || '',
        thirdPartyReportDocumentName: thirdPartyUpload?.fileName || row.thirdPartyReportDocumentName || existing.thirdPartyReportDocumentName || '',
        remarks: row.remarks || existing.remarks || '',
        // Attachment is optional here too, same fix already applied to the real Quality step
        // this session — no required-field check on it.
        attachmentDocumentUrl: attachmentUpload?.url || row.attachmentDocumentUrl || existing.attachmentDocumentUrl || '',
        attachmentDocumentName: attachmentUpload?.fileName || row.attachmentDocumentName || existing.attachmentDocumentName || '',
      };
    });

    if (localPurchase.currentStage !== 'Completed') {
      localPurchase.currentStage = 'Quality';
    }

    await localPurchase.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Local Purchase',
      entity: 'LocalPurchase',
      entityId: localPurchase._id,
      action: 'Updated',
      before,
      after: { qualityRows: localPurchase.qualityRows },
      remarks: 'Quality details updated',
    });

    res.status(200).json({ message: 'Quality details updated successfully', data: localPurchase });
  } catch (err) {
    console.error('updateLocalPurchaseQuality error:', err);
    res.status(500).json({ message: err.message });
  }
};
