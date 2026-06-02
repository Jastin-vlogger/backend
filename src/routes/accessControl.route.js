const express = require('express');
const router = express.Router();
const accessControlController = require('../controller/accessControl.controller');
const authMiddleware = require('../core/utils/authMiddleware');
const authorize = require('../core/utils/authorize');

router.use(authMiddleware);

// Public endpoints (all authenticated users)
router.get('/effective-permissions', accessControlController.getEffectivePermissions);
router.get('/effective-permissions-enhanced', accessControlController.getEffectivePermissionsEnhanced);
router.post('/test-permission', accessControlController.testUserPermission);

// Cache management endpoints (all authenticated users can refresh their own cache)
router.post('/cache/refresh-user', accessControlController.refreshUserPermissions);
router.post('/cache/refresh-user/:userId', accessControlController.refreshUserPermissions);
router.get('/cache/metrics', accessControlController.getPermissionCacheMetrics);

// Admin and Manager only endpoints
router.use(authorize({ tag: 'admin-only' }));

// Existing endpoints
router.get('/roles', accessControlController.listRoles);
router.post('/roles', accessControlController.createRole);
router.patch('/roles/:id', accessControlController.updateRole);
router.get('/bl-row-definitions', accessControlController.listBlRowDefinitions);
router.post('/bl-row-definitions', accessControlController.createBlRowDefinition);
router.patch('/bl-row-definitions/:id', accessControlController.updateBlRowDefinition);
router.delete('/bl-row-definitions/:id', accessControlController.deleteBlRowDefinition);
router.get('/permissions', accessControlController.listPermissions);
router.get('/roles/:id/permissions', accessControlController.getRolePermissions);
router.put('/roles/:id/permissions', accessControlController.updateRolePermissions);
router.get('/users', accessControlController.listUsers);
router.post('/users', accessControlController.createUser);
router.patch('/users/:id', accessControlController.updateUser);
router.patch('/users/:id/reset-password', accessControlController.resetUserPassword);

// New permission system endpoints
router.get('/system-permissions', accessControlController.getSystemPermissions);
router.post('/cache/refresh-role/:roleKey', accessControlController.refreshRolePermissions);
router.post('/cache/clear-all', accessControlController.clearAllPermissionCaches);
router.post('/seed-permission-system', accessControlController.seedPermissionSystem);

module.exports = router;
