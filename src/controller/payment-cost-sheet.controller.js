// Payment Costing: Excel cost-sheet import with import log and submit-lock.
//
// Workflow: FS imports the Accounts cost sheet (draft) -> reviews it on screen -> submits, which
// LOCKS it. While locked nothing can change it (import / re-import / submit return 409); only
// Admin/Manager can unlock (with a reason), after which FS can correct by re-importing.
// All of this is enforced here, not only in the UI.
const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentCostSheet = require('../models/paymentCostSheet.model');
const Container = require('../models/container.model');
const Shipment = require('../models/shipment.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { uploadBufferToS3 } = require('../core/utils/s3Upload');
const { recordDocumentImports } = require('../core/utils/importLog');
const { parseCostSheetWorkbook, buildWorkbookFromSnapshot, CostSheetParseError } = require('../core/utils/costSheetExcel');
const { hasRoleOrPermission } = require('./shipment-preamble.helpers');

const KEYS = {
  view: 'shipment.tab.payment_costing.cost_sheet.view',
  import: 'shipment.tab.payment_costing.cost_sheet.import',
  submit: 'shipment.tab.payment_costing.cost_sheet.submit',
  unlock: 'shipment.tab.payment_costing.cost_sheet.unlock',
};
// Role fallbacks next to the permission keys. Only FS (FAS) imports/submits; Admin/Manager hold every key.
const ROLES = {
  view: ['FAS', 'FasManager', 'Management', 'Admin', 'Manager'],
  import: ['FAS', 'Admin', 'Manager'],
  submit: ['FAS', 'Admin', 'Manager'],
  unlock: ['Admin', 'Manager'],
};

const actorOf = (user) => ({ id: user?._id || null, name: user?.name || user?.email || '' });

const normaliseBlKey = (container) => {
  const bl = String(container?.actual?.BLNo || '').trim().toUpperCase();
  return bl || `container:${container._id}`;
};

const loadTarget = async (containerId) => {
  if (!mongoose.Types.ObjectId.isValid(containerId)) return { error: { code: 400, message: 'Invalid container id' } };
  const container = await Container.findById(containerId).select('shipmentId actual.BLNo').lean();
  if (!container) return { error: { code: 404, message: 'Container not found' } };
  return {
    container,
    shipmentId: container.shipmentId,
    blKey: normaliseBlKey(container),
    blNo: String(container.actual?.BLNo || '').trim(),
  };
};

const permissionsFor = async (user) => ({
  canImport: await hasRoleOrPermission(user, KEYS.import, ROLES.import),
  canSubmit: await hasRoleOrPermission(user, KEYS.submit, ROLES.submit),
  canUnlock: await hasRoleOrPermission(user, KEYS.unlock, ROLES.unlock),
});

const toResponse = (sheet) => {
  if (!sheet) return null;
  return {
    _id: sheet._id,
    status: sheet.status,
    blNo: sheet.blNo,
    snapshot: sheet.snapshot,
    stats: sheet.stats,
    source: { fileName: sheet.source?.fileName || '', size: sheet.source?.size || 0 },
    importedAt: sheet.importedAt,
    importedBy: sheet.importedBy?.name || '',
    lockedAt: sheet.lockedAt,
    lockedBy: sheet.lockedBy?.name || '',
    unlockedAt: sheet.unlockedAt,
    unlockedBy: sheet.unlockedBy?.name || '',
    unlockReason: sheet.unlockReason || '',
    history: (sheet.history || []).map((h) => ({
      action: h.action,
      at: h.at,
      by: h.by?.name || '',
      fileName: h.fileName || '',
      note: h.note || '',
    })).reverse(),
  };
};

const LOCKED_MESSAGE = 'This cost sheet is locked. Only an Admin can unlock it.';

exports.getPaymentCostSheet = async (req, res) => {
  try {
    if (!(await hasRoleOrPermission(req.user, KEYS.view, ROLES.view))) {
      return res.status(403).json({ message: 'You do not have permission to view the Payment Costing sheet.' });
    }
    const target = await loadTarget(req.params.containerId);
    if (target.error) return res.status(target.error.code).json({ message: target.error.message });

    const sheet = await PaymentCostSheet.findOne({ shipmentId: target.shipmentId, blKey: target.blKey }).lean();
    return res.json({ sheet: toResponse(sheet), permissions: await permissionsFor(req.user) });
  } catch (err) {
    console.error('getPaymentCostSheet error:', err);
    return res.status(500).json({ message: 'Unable to load the Payment Costing sheet' });
  }
};

exports.importPaymentCostSheet = async (req, res) => {
  try {
    if (!(await hasRoleOrPermission(req.user, KEYS.import, ROLES.import))) {
      return res.status(403).json({ message: 'Only FS users can import a Payment Costing sheet.' });
    }
    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ message: 'Choose an Excel (.xlsx) cost sheet to import.' });

    const target = await loadTarget(req.params.containerId);
    if (target.error) return res.status(target.error.code).json({ message: target.error.message });

    const existing = await PaymentCostSheet.findOne({ shipmentId: target.shipmentId, blKey: target.blKey });
    if (existing?.status === 'locked') return res.status(409).json({ message: LOCKED_MESSAGE });

    let parsed;
    try {
      parsed = await parseCostSheetWorkbook(file.buffer);
    } catch (err) {
      if (err instanceof CostSheetParseError) return res.status(400).json({ message: err.message });
      throw err;
    }

    let fileUrl = '';
    try {
      fileUrl = (await uploadBufferToS3(file, 'shipments/payment-costing/cost-sheet')).url || '';
    } catch (err) {
      console.error('Cost sheet original upload warning:', err.message); // the snapshot is the source of truth
    }

    const actor = actorOf(req.user);
    const action = existing ? 'reimport' : 'import';
    const fileName = file.originalname || 'cost-sheet.xlsx';
    const source = {
      fileName,
      fileUrl,
      size: file.size || file.buffer.length,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    };
    const entry = { action, at: new Date(), by: actor, fileName, note: '' };

    let sheet;
    if (existing) {
      existing.snapshot = parsed.snapshot;
      existing.stats = parsed.stats;
      existing.source = source;
      existing.importedAt = new Date();
      existing.importedBy = actor;
      existing.blNo = target.blNo;
      existing.status = 'draft';
      if (!existing.containerIds.some((id) => String(id) === String(target.container._id))) existing.containerIds.push(target.container._id);
      existing.markModified('snapshot');
      existing.history.push(entry);
      sheet = await existing.save();
    } else {
      sheet = await PaymentCostSheet.create({
        shipmentId: target.shipmentId,
        blKey: target.blKey,
        blNo: target.blNo,
        containerIds: [target.container._id],
        snapshot: parsed.snapshot,
        stats: parsed.stats,
        source,
        status: 'draft',
        importedAt: new Date(),
        importedBy: actor,
        history: [entry],
      });
    }

    await recordDocumentImports({
      shipmentId: target.shipmentId,
      containerId: target.container._id,
      source: 'cost_sheet',
      action,
      fileName,
      fileUrl,
      summary: { blNo: target.blNo, sheets: parsed.stats.sheets, cells: parsed.stats.cells },
    }, req.user);
    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'PaymentCostSheet',
      entityId: sheet._id,
      action: action === 'import' ? 'ImportCostSheet' : 'ReimportCostSheet',
      before: {},
      after: { fileName, sheets: parsed.stats.sheets, cells: parsed.stats.cells, blKey: target.blKey },
      remarks: `Payment costing sheet ${action === 'import' ? 'imported' : 're-imported'} from ${fileName}`,
    });

    return res.status(existing ? 200 : 201).json({
      message: existing ? 'Cost sheet re-imported.' : 'Cost sheet imported. Review it, then submit to lock it.',
      sheet: toResponse(sheet.toObject()),
      permissions: await permissionsFor(req.user),
    });
  } catch (err) {
    console.error('importPaymentCostSheet error:', err);
    return res.status(500).json({ message: 'Unable to import the cost sheet' });
  }
};

exports.submitPaymentCostSheet = async (req, res) => {
  try {
    if (!(await hasRoleOrPermission(req.user, KEYS.submit, ROLES.submit))) {
      return res.status(403).json({ message: 'Only FS users can submit a Payment Costing sheet.' });
    }
    const target = await loadTarget(req.params.containerId);
    if (target.error) return res.status(target.error.code).json({ message: target.error.message });

    const sheet = await PaymentCostSheet.findOne({ shipmentId: target.shipmentId, blKey: target.blKey });
    if (!sheet) return res.status(400).json({ message: 'Import a cost sheet before submitting.' });
    if (sheet.status === 'locked') return res.status(409).json({ message: LOCKED_MESSAGE });

    const actor = actorOf(req.user);
    sheet.status = 'locked';
    sheet.lockedAt = new Date();
    sheet.lockedBy = actor;
    sheet.history.push({ action: 'submit', at: new Date(), by: actor, fileName: sheet.source?.fileName || '', note: '' });
    await sheet.save();

    await recordDocumentImports({
      shipmentId: target.shipmentId,
      containerId: target.container._id,
      source: 'cost_sheet',
      action: 'submit',
      fileName: sheet.source?.fileName || '',
      summary: { blNo: target.blNo },
    }, req.user);
    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'PaymentCostSheet',
      entityId: sheet._id,
      action: 'SubmitCostSheet',
      before: { status: 'draft' },
      after: { status: 'locked' },
      remarks: 'Payment costing sheet submitted and locked',
    });

    return res.json({ message: 'Cost sheet submitted and locked.', sheet: toResponse(sheet.toObject()), permissions: await permissionsFor(req.user) });
  } catch (err) {
    console.error('submitPaymentCostSheet error:', err);
    return res.status(500).json({ message: 'Unable to submit the cost sheet' });
  }
};

exports.unlockPaymentCostSheet = async (req, res) => {
  try {
    if (!(await hasRoleOrPermission(req.user, KEYS.unlock, ROLES.unlock))) {
      return res.status(403).json({ message: 'Only an Admin can unlock a Payment Costing sheet.' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3) return res.status(400).json({ message: 'Enter a reason for unlocking the sheet.' });

    const target = await loadTarget(req.params.containerId);
    if (target.error) return res.status(target.error.code).json({ message: target.error.message });

    const sheet = await PaymentCostSheet.findOne({ shipmentId: target.shipmentId, blKey: target.blKey });
    if (!sheet) return res.status(404).json({ message: 'No cost sheet found for this shipment.' });
    if (sheet.status !== 'locked') return res.status(400).json({ message: 'The cost sheet is not locked.' });

    const actor = actorOf(req.user);
    sheet.status = 'draft';
    sheet.unlockedAt = new Date();
    sheet.unlockedBy = actor;
    sheet.unlockReason = reason;
    sheet.history.push({ action: 'unlock', at: new Date(), by: actor, fileName: sheet.source?.fileName || '', note: reason });
    await sheet.save();

    await recordDocumentImports({
      shipmentId: target.shipmentId,
      containerId: target.container._id,
      source: 'cost_sheet',
      action: 'unlock',
      fileName: sheet.source?.fileName || '',
      summary: { blNo: target.blNo, reason },
    }, req.user);
    await writeAuditLog({
      userId: req.user._id,
      module: 'FAS',
      entity: 'PaymentCostSheet',
      entityId: sheet._id,
      action: 'UnlockCostSheet',
      before: { status: 'locked' },
      after: { status: 'draft', reason },
      remarks: `Payment costing sheet unlocked: ${reason}`,
    });

    return res.json({ message: 'Cost sheet unlocked. FS can now correct it.', sheet: toResponse(sheet.toObject()), permissions: await permissionsFor(req.user) });
  } catch (err) {
    console.error('unlockPaymentCostSheet error:', err);
    return res.status(500).json({ message: 'Unable to unlock the cost sheet' });
  }
};

exports.downloadPaymentCostSheetExcel = async (req, res) => {
  try {
    if (!(await hasRoleOrPermission(req.user, KEYS.view, ROLES.view))) {
      return res.status(403).json({ message: 'You do not have permission to view the Payment Costing sheet.' });
    }
    const target = await loadTarget(req.params.containerId);
    if (target.error) return res.status(target.error.code).json({ message: target.error.message });

    const sheet = await PaymentCostSheet.findOne({ shipmentId: target.shipmentId, blKey: target.blKey }).lean();
    if (!sheet) return res.status(404).json({ message: 'No cost sheet has been imported yet.' });

    const shipment = await Shipment.findById(target.shipmentId).select('shipmentNo').lean();
    const stem = String(shipment?.shipmentNo || sheet.blNo || 'shipment').replace(/[^a-z0-9_-]/gi, '_');
    const workbook = buildWorkbookFromSnapshot(sheet.snapshot);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payment-costing-${stem}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('downloadPaymentCostSheetExcel error:', err);
    return res.status(500).json({ message: 'Unable to download the cost sheet' });
  }
};
