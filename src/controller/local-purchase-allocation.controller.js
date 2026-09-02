// Local Purchase — Stage 2: Storage Allocation. Single-destination-warehouse decision + a
// draft/pending_warehouse_manager/approved workflow, mirroring the real Shipment flow's BL
// Details Storage Allocation approval state (container.model.js's
// storageAllocationApprovalStateSchema, shipment-approvals.controller.js's
// approveStorageAllocations) but simplified: one warehouse string, no item/container matrix.
const LocalPurchase = require('../models/local-purchase.model');
const writeAuditLog = require('../core/utils/auditLogger');
const { permissionService } = require('../core/services/permissionService');
const { normalizeRole } = require('../core/utils/roleHelpers');

const APPROVE_PERMISSION_KEY = 'local_purchase.tab.storage_allocation.approve_warehouse_manager';
const APPROVE_ALLOWED_ROLES = ['warehouse', 'Admin', 'Manager', 'Management'];

const hasRoleOrPermission = async (user, permissionKey, allowedRoles = []) => {
  if (!user) return false;
  if (allowedRoles.includes(normalizeRole(user.role))) return true;
  return permissionService.hasPermission(user, permissionKey);
};

// PATCH /local-purchase/:id/storage-allocation — save the destination warehouse. First save
// moves draft -> pending_warehouse_manager; any further edit (including one made after
// approval) resets to pending_warehouse_manager, since an edited decision is no longer the one
// that was signed off.
exports.updateLocalPurchaseAllocation = async (req, res) => {
  try {
    const localPurchase = await LocalPurchase.findById(req.params.id);
    if (!localPurchase) return res.status(404).json({ message: 'Local Purchase not found' });

    const warehouse = String(req.body.warehouse || '').trim();
    if (!warehouse) {
      return res.status(400).json({ message: 'A destination warehouse must be selected.' });
    }

    const before = {
      storageAllocationDecision: localPurchase.storageAllocationDecision,
      storageAllocationApproval: localPurchase.storageAllocationApproval,
    };

    const now = new Date();
    const approval = localPurchase.storageAllocationApproval || { status: 'draft' };

    localPurchase.storageAllocationDecision = { warehouse };

    if (approval.status === 'draft') {
      localPurchase.storageAllocationApproval = {
        ...approval,
        status: 'pending_warehouse_manager',
        submittedAt: now,
        submittedBy: req.user._id,
      };
    } else {
      // pending_warehouse_manager (re-edit before approval) or approved (re-edit after
      // approval) both reset to pending — an edited decision needs re-sign-off either way.
      localPurchase.storageAllocationApproval = {
        ...approval,
        status: 'pending_warehouse_manager',
        lastUpdatedAt: now,
        lastUpdatedBy: req.user._id,
      };
    }

    if (localPurchase.currentStage === 'Local Purchase Entry') {
      localPurchase.currentStage = 'Storage Allocation';
    }

    await localPurchase.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Local Purchase',
      entity: 'LocalPurchase',
      entityId: localPurchase._id,
      action: 'UpdateStorageAllocation',
      before,
      after: {
        storageAllocationDecision: localPurchase.storageAllocationDecision,
        storageAllocationApproval: localPurchase.storageAllocationApproval,
      },
      remarks: 'Storage allocation saved',
    });

    res.status(200).json({ message: 'Storage allocation saved successfully', data: localPurchase });
  } catch (err) {
    console.error('updateLocalPurchaseAllocation error:', err);
    res.status(500).json({ message: err.message });
  }
};

// PATCH /local-purchase/:id/storage-allocation/approve — warehouse-manager-role-gated.
exports.approveLocalPurchaseAllocation = async (req, res) => {
  try {
    const localPurchase = await LocalPurchase.findById(req.params.id);
    if (!localPurchase) return res.status(404).json({ message: 'Local Purchase not found' });

    const approval = localPurchase.storageAllocationApproval || { status: 'draft' };
    if (approval.status !== 'pending_warehouse_manager') {
      if (approval.status === 'approved') {
        return res.status(400).json({ message: 'Storage allocation is already approved.' });
      }
      return res.status(400).json({ message: 'Storage allocation must be saved before it can be approved.' });
    }

    if (!localPurchase.storageAllocationDecision?.warehouse) {
      return res.status(400).json({ message: 'A destination warehouse must be selected before approving.' });
    }

    const allowed = await hasRoleOrPermission(req.user, APPROVE_PERMISSION_KEY, APPROVE_ALLOWED_ROLES);
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to approve storage allocation.' });
    }

    const before = { storageAllocationApproval: localPurchase.storageAllocationApproval };

    localPurchase.storageAllocationApproval = {
      ...approval,
      status: 'approved',
      warehouseManagerApprovedAt: new Date(),
      warehouseManagerApprovedBy: req.user._id,
    };

    await localPurchase.save();

    await writeAuditLog({
      userId: req.user._id,
      module: 'Local Purchase',
      entity: 'LocalPurchase',
      entityId: localPurchase._id,
      action: 'ApproveStorageAllocation',
      before,
      after: { storageAllocationApproval: localPurchase.storageAllocationApproval },
      remarks: 'Storage allocation approved by warehouse manager',
    });

    res.status(200).json({ message: 'Storage allocation approved successfully', data: localPurchase });
  } catch (err) {
    console.error('approveLocalPurchaseAllocation error:', err);
    res.status(500).json({ message: err.message });
  }
};
