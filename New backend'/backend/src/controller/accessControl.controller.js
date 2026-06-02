const logAudit = require('../core/utils/auditLogger');
const Role = require('../models/role.model');
const Permission = require('../models/permission.model');
const RolePermission = require('../models/rolePermission.model');
const User = require('../models/auth.model');
const { normalizeRole } = require('../core/utils/roleHelpers');
const { sendInternalUserInviteEmail, sendInternalUserPasswordResetEmail } = require('../services/mail.service');
const roleRegistry = require('../core/utils/roleRegistry');
const BLRowDefinition = require('../models/blRowDefinition.model');
const {
  DEFAULT_BL_ROW_DEFINITIONS,
  normalizeNumericDefault,
  normalizeVisibleTo,
  normalizeDescription,
  slugifyKey,
} = require('../config/blRowDefinitions');
const {
  DEFAULT_ROLES,
  ensureRolesSeeded,
} = require('../config/seedAccessControl');

function roleResponse(role) {
  return {
    _id: role._id,
    key: role.key,
    name: role.name,
    description: role.description || '',
    isActive: role.isActive,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function permissionResponse(permission) {
  return {
    _id: permission._id,
    key: permission.key,
    resource: permission.resource,
    screen: permission.screen || '',
    tab: permission.tab || '',
    field: permission.field || '',
    action: permission.action || '',
    type: permission.type,
    label: permission.label,
    description: permission.description || '',
    isActive: permission.isActive,
    sortOrder: permission.sortOrder || 0,
  };
}

function buildPermissionGroups(permissions, assignedKeys = new Set()) {
  const groups = new Map();

  permissions.forEach((permission) => {
    const groupKey = permission.tab || permission.screen || permission.resource;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        label: permission.tab
          ? permission.tab.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
          : permission.screen
            ? permission.screen.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
            : permission.resource,
        permissions: [],
      });
    }

    groups.get(groupKey).permissions.push({
      ...permissionResponse(permission),
      assigned: assignedKeys.has(permission.key),
    });
  });

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function userResponse(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function generateTemporaryPassword(length = Number(process.env.INVITE_PASSWORD_LENGTH || 10)) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateRoleKey(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function blRowDefinitionResponse(row) {
  return {
    _id: row._id,
    key: row.key,
    sn: row.sn,
    description: row.description,
    visibleTo: normalizeVisibleTo(row.visibleTo),
    defaultQty: normalizeNumericDefault(row.defaultQty, 1),
    defaultRate: normalizeNumericDefault(row.defaultRate, 0),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureBlRowDefinitionsSeeded() {
  const existingRows = await BLRowDefinition.find().sort({ sn: 1 }).lean();
  if (!existingRows.length) {
    await BLRowDefinition.insertMany(
      DEFAULT_BL_ROW_DEFINITIONS.map((row) => ({
        key: row.key,
        sn: row.sn,
        description: row.description,
        visibleTo: normalizeVisibleTo(row.visibleTo),
        defaultQty: normalizeNumericDefault(row.defaultQty, 1),
        defaultRate: normalizeNumericDefault(row.defaultRate, 0),
        isActive: true,
      }))
    );
    return BLRowDefinition.find().sort({ sn: 1 });
  }

  const existingKeys = new Set(existingRows.map((row) => row.key || slugifyKey(row.description)));
  const existingDescriptions = new Set(existingRows.map((row) => normalizeDescription(row.description)));
  let nextSn = Math.max(...existingRows.map((row) => Number(row.sn) || 0), 0) + 1;
  const toInsert = [];

  for (const row of DEFAULT_BL_ROW_DEFINITIONS) {
    const normalizedDescription = normalizeDescription(row.description);
    if (existingKeys.has(row.key) || existingDescriptions.has(normalizedDescription)) continue;
    toInsert.push({
      key: row.key,
      sn: nextSn++,
      description: row.description,
      visibleTo: normalizeVisibleTo(row.visibleTo),
      defaultQty: normalizeNumericDefault(row.defaultQty, 1),
      defaultRate: normalizeNumericDefault(row.defaultRate, 0),
      isActive: true,
    });
    existingKeys.add(row.key);
    existingDescriptions.add(normalizedDescription);
  }

  if (toInsert.length) {
    await BLRowDefinition.insertMany(toInsert);
  }

  return BLRowDefinition.find().sort({ sn: 1 });
}

async function getAssignedPermissionKeys(roleKey) {
  const normalizedRoleKey = normalizeRole(roleKey);
  if (normalizedRoleKey === 'Manager') {
    const allPermissions = await Permission.find({ isActive: true }).select('key').lean();
    return allPermissions.map((permission) => permission.key);
  }

  const roleKeyPattern = `^${String(normalizedRoleKey || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  const assignments = await RolePermission.find({
    roleKey: { $regex: roleKeyPattern, $options: 'i' },
    allowed: true
  }).lean();
  return assignments.map((assignment) => assignment.permissionKey);
}

exports.listRoles = async (req, res) => {
  try {
    await ensureRolesSeeded();
    const roles = await Role.find().sort({ isSystem: -1, name: 1 });
    res.json({ roles: roles.map(roleResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load roles', error: error.message });
  }
};

exports.createRole = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const key = generateRoleKey(req.body.key || name);

    if (!name) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    if (!key) {
      return res.status(400).json({ message: 'Role key could not be generated from the role name' });
    }

    const existing = await Role.findOne({ key });
    if (existing) {
      return res.status(400).json({ message: 'Role key already exists' });
    }

    const role = await Role.create({
      key,
      name,
      description,
      isActive: req.body.isActive !== false,
      isSystem: false,
    });

    // Keep the in-memory role registry in sync immediately
    if (role.isActive) roleRegistry.registerRole(role.key);

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'Role',
      entityId: role._id,
      action: 'Created',
      before: {},
      after: roleResponse(role),
      remarks: `Created RBAC role ${role.key}`,
    });

    res.status(201).json({ message: 'Role created', role: roleResponse(role) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to create role', error: error.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const before = roleResponse(role);

    role.name = String(req.body.name || role.name).trim();
    role.description = String(req.body.description ?? role.description ?? '').trim();
    if (typeof req.body.isActive === 'boolean') {
      role.isActive = req.body.isActive;
    }

    await role.save();

    // Keep the in-memory role registry in sync immediately
    if (role.isActive) {
      roleRegistry.registerRole(role.key);
    } else {
      roleRegistry.unregisterRole(role.key);
    }

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'Role',
      entityId: role._id,
      action: 'Updated',
      before,
      after: roleResponse(role),
      remarks: `Updated RBAC role ${role.key}`,
    });

    res.json({ message: 'Role updated', role: roleResponse(role) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update role', error: error.message });
  }
};

exports.listBlRowDefinitions = async (_req, res) => {
  try {
    const rows = await ensureBlRowDefinitionsSeeded();
    res.json({ rows: rows.map(blRowDefinitionResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load BL row definitions', error: error.message });
  }
};

exports.createBlRowDefinition = async (req, res) => {
  try {
    await ensureBlRowDefinitionsSeeded();

    const description = String(req.body.description || '').trim();
    const visibleTo = normalizeVisibleTo(req.body.visibleTo);
    const defaultQty = normalizeNumericDefault(req.body.defaultQty, 1);
    const defaultRate = normalizeNumericDefault(req.body.defaultRate, 0);
    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    const key = slugifyKey(description);
    const normalizedDescription = normalizeDescription(description);
    const existing = await BLRowDefinition.findOne({
      $or: [
        { key },
        { description: new RegExp(`^${normalizedDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      ],
    });
    if (existing) {
      return res.status(400).json({ message: 'A BL row definition with this description already exists' });
    }

    const last = await BLRowDefinition.findOne().sort({ sn: -1 }).lean();
    const row = await BLRowDefinition.create({
      key,
      sn: (Number(last?.sn) || 0) + 1,
      description,
      visibleTo,
      defaultQty,
      defaultRate,
      isActive: true,
    });

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'BLRowDefinition',
      entityId: row._id,
      action: 'Created',
      before: {},
      after: blRowDefinitionResponse(row),
      remarks: `Created BL row definition ${row.key}`,
    });

    res.status(201).json({ message: 'BL row definition created', row: blRowDefinitionResponse(row) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to create BL row definition', error: error.message });
  }
};

exports.updateBlRowDefinition = async (req, res) => {
  try {
    const row = await BLRowDefinition.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'BL row definition not found' });
    }

    const before = blRowDefinitionResponse(row);
    const description = String(req.body.description || row.description).trim();
    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    const nextKey = slugifyKey(description);
    const normalizedDescription = normalizeDescription(description);
    const duplicate = await BLRowDefinition.findOne({
      _id: { $ne: row._id },
      $or: [
        { key: nextKey },
        { description: new RegExp(`^${normalizedDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      ],
    });
    if (duplicate) {
      return res.status(400).json({ message: 'Another BL row definition with this description already exists' });
    }

    row.description = description;
    row.key = nextKey;
    row.visibleTo = normalizeVisibleTo(req.body.visibleTo);
    row.defaultQty = normalizeNumericDefault(req.body.defaultQty, row.defaultQty ?? 1);
    row.defaultRate = normalizeNumericDefault(req.body.defaultRate, row.defaultRate ?? 0);
    if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
    await row.save();

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'BLRowDefinition',
      entityId: row._id,
      action: 'Updated',
      before,
      after: blRowDefinitionResponse(row),
      remarks: `Updated BL row definition ${row.key}`,
    });

    res.json({ message: 'BL row definition updated', row: blRowDefinitionResponse(row) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update BL row definition', error: error.message });
  }
};

exports.deleteBlRowDefinition = async (req, res) => {
  try {
    const row = await BLRowDefinition.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'BL row definition not found' });
    }

    const before = blRowDefinitionResponse(row);
    await row.deleteOne();

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'BLRowDefinition',
      entityId: row._id,
      action: 'Deleted',
      before,
      after: {},
      remarks: `Deleted BL row definition ${row.key}`,
    });

    res.json({ message: 'BL row definition deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to delete BL row definition', error: error.message });
  }
};

exports.listPermissions = async (req, res) => {
  try {
    const resource = String(req.query.resource || '').trim();
    const query = resource ? { resource } : {};
    const permissions = await Permission.find(query).sort({ sortOrder: 1, label: 1 });
    res.json({ permissions: permissions.map(permissionResponse) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load permissions', error: error.message });
  }
};

exports.getEffectivePermissions = async (req, res) => {
  try {
    const permissionKeys = await getAssignedPermissionKeys(req.user.role);
    const permissions = await Permission.find({ key: { $in: permissionKeys }, isActive: true }).sort({ sortOrder: 1, label: 1 });

    res.json({
      role: normalizeRole(req.user.role),
      permissionKeys,
      permissionGroups: buildPermissionGroups(permissions, new Set(permissionKeys)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load effective permissions', error: error.message });
  }
};

exports.getRolePermissions = async (req, res) => {
  try {
    await ensureRolesSeeded();

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const permissions = await Permission.find().sort({ resource: 1, sortOrder: 1, label: 1 });
    const assignments = await RolePermission.find({ roleKey: role.key, allowed: true });
    const assignedKeys = new Set(assignments.map((assignment) => assignment.permissionKey));

    res.json({
      role: roleResponse(role),
      permissionGroups: buildPermissionGroups(permissions, assignedKeys),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load role permissions', error: error.message });
  }
};

exports.updateRolePermissions = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const permissionKeys = Array.isArray(req.body.permissionKeys)
      ? req.body.permissionKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];

    // ── Auto-include parent permissions ──────────────────────────────────────
    // If any shipment tracker tab/action permission is assigned, automatically
    // include the parent screen permission and the shipments menu item so the
    // user can actually reach the tracker. This prevents the "Tracker access
    // restricted" error for custom roles (Quality, Warehouse, etc.) whose
    // admins only tick tab-level permissions without the parent screen key.
    const TRACKER_TAB_PREFIX = 'shipment.tab.';
    const hasAnyTrackerTab = permissionKeys.some((k) => k.startsWith(TRACKER_TAB_PREFIX));
    if (hasAnyTrackerTab) {
      if (!permissionKeys.includes('shipment.screen.shipment_tracker.view')) {
        permissionKeys.push('shipment.screen.shipment_tracker.view');
      }
      if (!permissionKeys.includes('menu.shipments.view')) {
        permissionKeys.push('menu.shipments.view');
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const validPermissions = await Permission.find({ key: { $in: permissionKeys } });
    const validKeys = new Set(validPermissions.map((permission) => permission.key));

    await RolePermission.deleteMany({ roleKey: role.key });

    if (validKeys.size > 0) {
      await RolePermission.insertMany(
        Array.from(validKeys).map((permissionKey) => ({
          roleKey: role.key,
          permissionKey,
          allowed: true,
        }))
      );
    }

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'RolePermission',
      entityId: role._id,
      action: 'Updated',
      before: {},
      after: { roleKey: role.key, permissionKeys: Array.from(validKeys) },
      remarks: `Updated permissions for role ${role.key}`,
    });

    const permissions = await Permission.find().sort({ resource: 1, sortOrder: 1, label: 1 });
    res.json({
      message: 'Role permissions updated',
      role: roleResponse(role),
      permissionGroups: buildPermissionGroups(permissions, validKeys),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update role permissions', error: error.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const search = String(req.query.search || '').trim();

    const query = {};
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { role:  { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total, roles] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      Role.find({ isActive: true }).sort({ isSystem: -1, name: 1 }).lean(),
    ]);

    res.json({
      users: users.map(userResponse),
      roles: roles.map(roleResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to load users', error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const before = userResponse(user);
    const requestedRole = String(req.body.role || user.role).trim();
    const normalizedRequestedRole = normalizeRole(requestedRole);

    if (requestedRole) {
      const roleExists = await Role.findOne({
        key: { $in: [requestedRole, normalizedRequestedRole].filter(Boolean) },
        isActive: true,
      });
      if (!roleExists) {
        return res.status(400).json({ message: 'Selected role is not available' });
      }
      user.role = roleExists.key;
    }

    if (typeof req.body.isActive === 'boolean') {
      user.isActive = req.body.isActive;
    }

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      user.name = req.body.name.trim();
    }

    await user.save();

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'User',
      entityId: user._id,
      action: 'Updated',
      before,
      after: userResponse(user),
      remarks: `Updated user access for ${user.email}`,
    });

    res.json({ message: 'User updated', user: userResponse(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to update user', error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const requestedRole = String(req.body.role || '').trim();
    const normalizedRequestedRole = normalizeRole(requestedRole);

    if (!name || !email || !requestedRole) {
      return res.status(400).json({ message: 'Name, email, and role are required' });
    }

    const roleExists = await Role.findOne({
      key: { $in: [requestedRole, normalizedRequestedRole].filter(Boolean) },
      isActive: true,
    });
    if (!roleExists) {
      return res.status(400).json({ message: 'Selected role is not available' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = await User.create({
      name,
      email,
      password: temporaryPassword,
      role: roleExists.key,
      isActive: req.body.isActive !== false,
      mustChangePassword: true,
    });

    await sendInternalUserInviteEmail({
      to: email,
      userName: name,
      role: roleExists.key,
      temporaryPassword,
    });

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'User',
      entityId: user._id,
      action: 'Created',
      before: {},
      after: userResponse(user),
      remarks: `Created internal user ${user.email} and sent invite email`,
    });

    res.status(201).json({
      message: 'User created and invite email sent',
      user: userResponse(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to create user', error: error.message });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const before = userResponse(user);

    user.password = temporaryPassword;
    user.mustChangePassword = true;
    await user.save();

    await sendInternalUserPasswordResetEmail({
      to: user.email,
      userName: user.name,
      role: user.role,
      temporaryPassword,
    });

    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'User',
      entityId: user._id,
      action: 'ResetPassword',
      before,
      after: userResponse(user),
      remarks: `Reset password for internal user ${user.email} and sent temporary password by email`,
    });

    res.json({
      message: 'Password reset and email sent',
      user: userResponse(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Unable to reset password', error: error.message });
  }
};
/**
 * Enhanced Permission Management Functions
 * 
 * Additional endpoints to support the new permission-based authorization system
 */

const { permissionService } = require('../core/services/permissionService');
const { permissionCache } = require('../core/cache/permissionCache');
const { 
  getAllSystemPermissions, 
  generatePermissionSeedData,
  generateRolePermissionSeedData,
  mapRolesToPermissions,
  validateSystemPermissions
} = require('../core/utils/routePermissionMapper');

/**
 * Get effective permissions for current user (enhanced version)
 * Includes both legacy and new permission format
 */
exports.getEffectivePermissionsEnhanced = async (req, res) => {
  try {
    const user = req.user;
    
    // Get legacy permissions (existing functionality)
    const legacyPermissionKeys = await getAssignedPermissionKeys(user.role);
    const legacyPermissions = await Permission.find({ 
      key: { $in: legacyPermissionKeys }, 
      isActive: true 
    }).sort({ sortOrder: 1, label: 1 });

    // Get new-style permissions through permission service
    const newPermissions = await permissionService.getUserPermissions(user);
    
    // Get role-based permissions mapping
    const roleMappedPermissions = mapRolesToPermissions([user.role]);
    
    res.json({
      user: {
        id: user._id,
        role: user.role,
        normalizedRole: normalizeRole(user.role)
      },
      legacy: {
        permissionKeys: legacyPermissionKeys,
        permissionGroups: buildPermissionGroups(legacyPermissions, new Set(legacyPermissionKeys))
      },
      enhanced: {
        directPermissions: newPermissions,
        roleMappedPermissions: roleMappedPermissions,
        allEffectivePermissions: [...new Set([...newPermissions, ...roleMappedPermissions])]
      },
      capabilities: {
        canReadShipments: await permissionService.hasPermission(user, 'shipments:read'),
        canWriteShipments: await permissionService.hasPermission(user, 'shipments:write'),
        canReadPurchase: await permissionService.hasPermission(user, 'purchase:read'),
        canWritePurchase: await permissionService.hasPermission(user, 'purchase:write'),
        canAccessAdmin: await permissionService.hasPermission(user, 'admin:access_control'),
        isManager: await permissionService.checkManagerAccess(user, 'shipments:read')
      }
    });
  } catch (error) {
    console.error('Enhanced effective permissions error:', error);
    res.status(500).json({ 
      message: 'Unable to load effective permissions', 
      error: error.message 
    });
  }
};

/**
 * Refresh permission cache for a user
 */
exports.refreshUserPermissions = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    
    await permissionService.refreshUserPermissions(userId);
    
    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'PermissionCache',
      entityId: userId,
      action: 'Refreshed',
      before: {},
      after: { userId, refreshedAt: new Date() },
      remarks: `Refreshed permission cache for user ${userId}`,
    });
    
    res.json({ 
      message: 'User permissions cache refreshed',
      userId,
      refreshedAt: new Date()
    });
  } catch (error) {
    console.error('Refresh user permissions error:', error);
    res.status(500).json({ 
      message: 'Unable to refresh user permissions', 
      error: error.message 
    });
  }
};

/**
 * Refresh permission cache for a role
 */
exports.refreshRolePermissions = async (req, res) => {
  try {
    const roleKey = req.params.roleKey;
    
    if (!roleKey) {
      return res.status(400).json({ message: 'Role key is required' });
    }
    
    await permissionService.refreshRolePermissions(roleKey);
    
    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'PermissionCache',
      entityId: roleKey,
      action: 'Refreshed',
      before: {},
      after: { roleKey, refreshedAt: new Date() },
      remarks: `Refreshed permission cache for role ${roleKey}`,
    });
    
    res.json({ 
      message: 'Role permissions cache refreshed',
      roleKey,
      refreshedAt: new Date()
    });
  } catch (error) {
    console.error('Refresh role permissions error:', error);
    res.status(500).json({ 
      message: 'Unable to refresh role permissions', 
      error: error.message 
    });
  }
};

/**
 * Clear all permission caches
 */
exports.clearAllPermissionCaches = async (req, res) => {
  try {
    await permissionService.clearCache();
    
    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'PermissionCache',
      entityId: 'all',
      action: 'Cleared',
      before: {},
      after: { clearedAt: new Date() },
      remarks: 'Cleared all permission caches',
    });
    
    res.json({ 
      message: 'All permission caches cleared',
      clearedAt: new Date()
    });
  } catch (error) {
    console.error('Clear all caches error:', error);
    res.status(500).json({ 
      message: 'Unable to clear permission caches', 
      error: error.message 
    });
  }
};

/**
 * Get permission cache metrics
 */
exports.getPermissionCacheMetrics = async (req, res) => {
  try {
    const metrics = permissionCache.getMetrics();
    
    res.json({
      message: 'Permission cache metrics',
      metrics,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Get cache metrics error:', error);
    res.status(500).json({ 
      message: 'Unable to get cache metrics', 
      error: error.message 
    });
  }
};

/**
 * Get all system permissions (new format)
 */
exports.getSystemPermissions = async (req, res) => {
  try {
    const allPermissions = getAllSystemPermissions();
    const validation = validateSystemPermissions();
    
    res.json({
      message: 'System permissions',
      permissions: allPermissions,
      validation,
      totalCount: allPermissions.length
    });
  } catch (error) {
    console.error('Get system permissions error:', error);
    res.status(500).json({ 
      message: 'Unable to get system permissions', 
      error: error.message 
    });
  }
};

/**
 * Test user permission
 */
exports.testUserPermission = async (req, res) => {
  try {
    const { permission } = req.body;
    const user = req.user;
    
    if (!permission) {
      return res.status(400).json({ message: 'Permission is required' });
    }
    
    const hasPermission = await permissionService.hasPermission(user, permission);
    const userPermissions = await permissionService.getUserPermissions(user);
    
    res.json({
      message: 'Permission test result',
      user: {
        id: user._id,
        role: user.role
      },
      testedPermission: permission,
      hasPermission,
      userPermissions,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Test user permission error:', error);
    res.status(500).json({ 
      message: 'Unable to test permission', 
      error: error.message 
    });
  }
};

/**
 * Seed new permission system data
 */
exports.seedPermissionSystem = async (req, res) => {
  try {
    const permissionSeedData = generatePermissionSeedData();
    const rolePermissionSeedData = generateRolePermissionSeedData();
    
    // Insert permissions (skip duplicates)
    let permissionsCreated = 0;
    for (const permData of permissionSeedData) {
      const existing = await Permission.findOne({ key: permData.key });
      if (!existing) {
        await Permission.create(permData);
        permissionsCreated++;
      }
    }
    
    // Insert role permissions (skip duplicates)
    let rolePermissionsCreated = 0;
    for (const rolePermData of rolePermissionSeedData) {
      const existing = await RolePermission.findOne({ 
        roleKey: rolePermData.roleKey, 
        permissionKey: rolePermData.permissionKey 
      });
      if (!existing) {
        await RolePermission.create(rolePermData);
        rolePermissionsCreated++;
      }
    }
    
    // Clear cache after seeding
    await permissionService.clearCache();
    
    await logAudit({
      userId: req.user._id,
      module: 'Access Control',
      entity: 'PermissionSystem',
      entityId: 'seed',
      action: 'Seeded',
      before: {},
      after: { 
        permissionsCreated, 
        rolePermissionsCreated,
        seededAt: new Date() 
      },
      remarks: 'Seeded new permission system data',
    });
    
    res.json({
      message: 'Permission system seeded successfully',
      permissionsCreated,
      rolePermissionsCreated,
      totalPermissions: permissionSeedData.length,
      totalRolePermissions: rolePermissionSeedData.length,
      seededAt: new Date()
    });
  } catch (error) {
    console.error('Seed permission system error:', error);
    res.status(500).json({ 
      message: 'Unable to seed permission system', 
      error: error.message 
    });
  }
};

/**
 * Enhanced updateRolePermissions with cache refresh
 */
const originalUpdateRolePermissions = exports.updateRolePermissions;
exports.updateRolePermissions = async (req, res) => {
  try {
    // Call original function
    await originalUpdateRolePermissions(req, res);
    
    // If successful, refresh the role cache
    if (res.statusCode === 200) {
      const role = await Role.findById(req.params.id);
      if (role) {
        await permissionService.refreshRolePermissions(role.key);
      }
    }
  } catch (error) {
    // Error already handled by original function
    throw error;
  }
};
