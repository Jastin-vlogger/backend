/**
 * Permission Service
 * 
 * Core permission checking service with caching, fallback mechanisms,
 * and Manager role special handling.
 */

const { authConfig } = require('../../config/authConfig');
const { permissionCache } = require('../cache/permissionCache');
const { normalizeRole } = require('../utils/roleHelpers');

// Import models
const Permission = require('../../models/permission.model');
const Role = require('../../models/role.model');
const RolePermission = require('../../models/rolePermission.model');

/**
 * Permission Service Class
 */
class PermissionService {
  constructor() {
    this.config = authConfig;
    this.cache = permissionCache;
  }

  /**
   * Check if user has a specific permission
   * @param {Object} user - User object with role property
   * @param {string} permission - Permission string in 'resource:action' format
   * @returns {Promise<boolean>} True if user has permission
   */
  async hasPermission(user, permission) {
    try {
      // Input validation
      if (!user || !user.role) {
        this._logDebug('Permission check failed: Invalid user object');
        return false;
      }

      if (!permission || typeof permission !== 'string') {
        this._logDebug('Permission check failed: Invalid permission string');
        return false;
      }

      // Validate permission format
      if (!this._validatePermissionFormat(permission)) {
        this._logDebug(`Permission check failed: Invalid permission format: ${permission}`);
        return false;
      }

      const normalizedRole = normalizeRole(user.role);
      
      // Check Manager role special handling
      if (this._isManagerRole(normalizedRole) && this._isReadPermission(permission)) {
        this._logDebug(`Manager auto-read access granted for: ${permission}`);
        this._logAuditEvent(user, permission, true, 'manager_auto_read');
        return true;
      }

      // Get user permissions (with caching)
      const userPermissions = await this._getUserPermissions(user._id, normalizedRole);
      
      // Check direct permission match
      if (userPermissions.includes(permission)) {
        this._logDebug(`Direct permission match: ${permission}`);
        this._logAuditEvent(user, permission, true, 'direct_match');
        return true;
      }

      // Check wildcard permissions
      if (this.config.permissions.enableWildcards) {
        const hasWildcard = this._checkWildcardPermissions(permission, userPermissions);
        if (hasWildcard) {
          this._logDebug(`Wildcard permission match: ${permission}`);
          this._logAuditEvent(user, permission, true, 'wildcard_match');
          return true;
        }
      }

      // Permission denied
      this._logDebug(`Permission denied: ${permission} for user ${user._id} (role: ${normalizedRole})`);
      this._logAuditEvent(user, permission, false, 'permission_denied');
      return false;

    } catch (error) {
      console.error('Permission check error:', error);
      this._logAuditEvent(user, permission, false, 'system_error', error.message);
      return false;
    }
  }

  /**
   * Check if user has any of the specified permissions
   * @param {Object} user - User object with role property
   * @param {Array<string>} permissions - Array of permission strings
   * @returns {Promise<boolean>} True if user has any permission
   */
  async hasAnyPermission(user, permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return false;
    }

    for (const permission of permissions) {
      if (await this.hasPermission(user, permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has all of the specified permissions
   * @param {Object} user - User object with role property
   * @param {Array<string>} permissions - Array of permission strings
   * @returns {Promise<boolean>} True if user has all permissions
   */
  async hasAllPermissions(user, permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return true; // Empty array means no requirements
    }

    for (const permission of permissions) {
      if (!(await this.hasPermission(user, permission))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all permissions for a user
   * @param {Object} user - User object with role property
   * @returns {Promise<Array<string>>} Array of permission strings
   */
  async getUserPermissions(user) {
    if (!user || !user.role) {
      return [];
    }

    const normalizedRole = normalizeRole(user.role);
    return await this._getUserPermissions(user._id, normalizedRole);
  }

  /**
   * Check Manager role special access
   * @param {Object} user - User object with role property
   * @param {string} permission - Permission string
   * @returns {Promise<boolean>} True if Manager has special access
   */
  async checkManagerAccess(user, permission) {
    if (!user || !user.role) {
      return false;
    }

    const normalizedRole = normalizeRole(user.role);
    
    if (!this._isManagerRole(normalizedRole)) {
      return false;
    }

    // Manager gets automatic read access
    if (this._isReadPermission(permission)) {
      return true;
    }

    // For write/delete permissions, check explicit grants
    return await this.hasPermission(user, permission);
  }

  /**
   * Refresh user permissions cache
   * @param {string} userId - User ID
   */
  async refreshUserPermissions(userId) {
    this.cache.refreshUserPermissions(userId);
    this._logDebug(`Refreshed permissions cache for user: ${userId}`);
  }

  /**
   * Refresh role permissions cache
   * @param {string} roleKey - Role key
   */
  async refreshRolePermissions(roleKey) {
    this.cache.refreshRolePermissions(roleKey);
    this._logDebug(`Refreshed permissions cache for role: ${roleKey}`);
  }

  /**
   * Clear all permission caches
   */
  async clearCache() {
    this.cache.clearAll();
    this._logDebug('Cleared all permission caches');
  }

  /**
   * Get user permissions with caching
   * @param {string} userId - User ID
   * @param {string} roleKey - Normalized role key
   * @returns {Promise<Array<string>>} Array of permission strings
   * @private
   */
  async _getUserPermissions(userId, roleKey) {
    // Try user-specific cache first
    let permissions = this.cache.getUserPermissions(userId);
    if (permissions && !this._isCacheExpired(permissions)) {
      return permissions.permissions;
    }

    // Try role-based cache
    permissions = this.cache.getRolePermissions(roleKey);
    if (permissions) {
      // Cache for this user too
      this.cache.setUserPermissions(userId, permissions);
      return permissions;
    }

    // Fetch from database
    try {
      const dbPermissions = await this._fetchPermissionsFromDB(roleKey);
      
      // Cache the results
      this.cache.setRolePermissions(roleKey, dbPermissions);
      this.cache.setUserPermissions(userId, dbPermissions);
      
      return dbPermissions;
    } catch (error) {
      console.error('Database permission fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch permissions from database using optimized query
   * @param {string} roleKey - Role key
   * @returns {Promise<Array<string>>} Array of permission strings
   * @private
   */
  async _fetchPermissionsFromDB(roleKey) {
    const startTime = Date.now();
    
    try {
      // Optimized aggregation query
      const result = await RolePermission.aggregate([
        {
          $match: {
            roleKey: { $regex: `^${String(roleKey || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
            allowed: true
          }
        },
        { 
          $lookup: {
            from: 'permissions',
            localField: 'permissionKey',
            foreignField: 'key',
            as: 'permission'
          }
        },
        { $unwind: '$permission' },
        { $match: { 'permission.isActive': true } },
        {
          $project: {
            permissionKey: 1,
            'permission.resource': 1,
            'permission.action': 1,
            'permission.type': 1
          }
        }
      ]);

      // Convert to permission strings
      const permissions = result.map(item => {
        const { resource, action, type } = item.permission;
        
        // For new permission format (resource:action)
        if (resource && action && type === 'action') {
          return `${resource}:${action}`;
        }
        
        // For legacy permission keys
        return item.permissionKey;
      }).filter(Boolean);

      const queryTime = Date.now() - startTime;
      this._logDebug(`DB query for role ${roleKey} took ${queryTime}ms, found ${permissions.length} permissions`);

      return permissions;
    } catch (error) {
      console.error('Database aggregation error:', error);
      throw error;
    }
  }

  /**
   * Validate permission format
   * @param {string} permission - Permission string
   * @returns {boolean} True if valid format
   * @private
   */
  _validatePermissionFormat(permission) {
    // Check length limit
    if (permission.length > this.config.security.maxPermissionLength) {
      return false;
    }

    // Input sanitization
    if (this.config.security.enableInputSanitization) {
      if (permission.includes('..') || permission.includes('/') || permission.includes('\\')) {
        return false;
      }
    }

    // Check format: resource:action
    return this.config.permissions.permissionFormatRegex.test(permission);
  }

  /**
   * Check if role is Manager or Management
   * @param {string} roleKey - Normalized role key
   * @returns {boolean} True if Manager role
   * @private
   */
  _isManagerRole(roleKey) {
    return this.config.permissions.enableManagerAutoRead && 
           (roleKey === 'Manager' || roleKey === 'Management');
  }

  /**
   * Check if permission is a read operation
   * @param {string} permission - Permission string
   * @returns {boolean} True if read permission
   * @private
   */
  _isReadPermission(permission) {
    return permission.endsWith(':read') || permission.endsWith(':*');
  }

  /**
   * Check wildcard permissions
   * @param {string} requestedPermission - Requested permission
   * @param {Array<string>} userPermissions - User's permissions
   * @returns {boolean} True if wildcard matches
   * @private
   */
  _checkWildcardPermissions(requestedPermission, userPermissions) {
    const [resource, action] = requestedPermission.split(':');
    
    for (const userPerm of userPermissions) {
      // Check resource:* wildcard
      if (userPerm === `${resource}:*`) {
        return true;
      }
      
      // Check *:action wildcard
      if (userPerm === `*:${action}`) {
        return true;
      }
      
      // Check *:* super wildcard
      if (userPerm === '*:*') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if cache entry is expired
   * @param {Object} cacheEntry - Cache entry with timestamp
   * @returns {boolean} True if expired
   * @private
   */
  _isCacheExpired(cacheEntry) {
    if (!cacheEntry || !cacheEntry.timestamp) {
      return true;
    }
    
    const ttl = this.config.cache.ttl * 1000; // Convert to milliseconds
    return (Date.now() - cacheEntry.timestamp) > ttl;
  }

  /**
   * Log audit event for authorization decisions
   * @param {Object} user - User object
   * @param {string} permission - Permission string
   * @param {boolean} granted - Whether access was granted
   * @param {string} reason - Reason for decision
   * @param {string} error - Error message if applicable
   * @private
   */
  _logAuditEvent(user, permission, granted, reason, error = null) {
    if (!this.config.security.enableAuditLogging) {
      return;
    }

    // Log failed attempts if configured
    if (!granted && !this.config.security.logFailedAttempts) {
      return;
    }

    const auditEvent = {
      timestamp: new Date().toISOString(),
      userId: user._id,
      userRole: user.role,
      permission: permission,
      granted: granted,
      reason: reason,
      error: error
    };

    // In a real system, this would integrate with your audit logging system
    console.log('[AUDIT]', JSON.stringify(auditEvent));
  }

  /**
   * Log debug message if debug logging is enabled
   * @param {string} message - Debug message
   * @private
   */
  _logDebug(message) {
    if (this.config.performance.enableDebugLogging) {
      console.log(`[PermissionService] ${message}`);
    }
  }
}

// Create singleton instance
const permissionService = new PermissionService();

module.exports = {
  PermissionService,
  permissionService
};
