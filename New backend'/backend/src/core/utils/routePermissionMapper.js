/**
 * Route Permission Mapper
 * 
 * Utility for mapping existing route authorizations to new permission-based system.
 * Generates permission mappings from current route configurations.
 */

const { validatePermissionFormat } = require('./permissionValidator');

/**
 * Route to permission mapping configuration
 */
const ROUTE_PERMISSION_MAPPINGS = {
  // Shipment routes
  shipments: {
    basePath: '/api/shipments',
    readPermission: 'shipments:read',
    writePermission: 'shipments:write',
    deletePermission: 'shipments:delete',
    adminPermission: 'shipments:admin'
  },
  
  // Purchase routes
  purchase: {
    basePath: '/api/purchase',
    readPermission: 'purchase:read',
    writePermission: 'purchase:write',
    deletePermission: 'purchase:delete',
    adminPermission: 'purchase:admin'
  },
  
  // Supplier routes
  suppliers: {
    basePath: '/api/suppliers',
    readPermission: 'suppliers:read',
    writePermission: 'suppliers:write',
    deletePermission: 'suppliers:delete',
    adminPermission: 'suppliers:admin'
  },
  
  // Warehouse routes
  warehouses: {
    basePath: '/api/warehouses',
    readPermission: 'warehouses:read',
    writePermission: 'warehouses:write',
    deletePermission: 'warehouses:delete',
    adminPermission: 'warehouses:admin'
  },
  
  // Access control routes
  accessControl: {
    basePath: '/api/access-control',
    readPermission: 'admin:access_control',
    writePermission: 'admin:access_control',
    deletePermission: 'admin:access_control',
    adminPermission: 'admin:access_control'
  },
  
  // Reports routes
  reports: {
    basePath: '/api/reports',
    readPermission: 'reports:read',
    writePermission: 'reports:write',
    deletePermission: 'reports:delete',
    adminPermission: 'reports:admin'
  },
  
  // Exchange rate routes
  exchangeRates: {
    basePath: '/api/exchange-rates',
    readPermission: 'exchange_rates:read',
    writePermission: 'exchange_rates:write',
    deletePermission: 'exchange_rates:delete',
    adminPermission: 'exchange_rates:admin'
  },
  
  // Item routes
  items: {
    basePath: '/api/items',
    readPermission: 'items:read',
    writePermission: 'items:write',
    deletePermission: 'items:delete',
    adminPermission: 'items:admin'
  },
  
  // Notification routes
  notifications: {
    basePath: '/api/notifications',
    readPermission: 'notifications:read',
    writePermission: 'notifications:write',
    deletePermission: 'notifications:delete',
    adminPermission: 'notifications:admin'
  },
  
  // Transportation company routes
  transportationCompanies: {
    basePath: '/api/transportation-companies',
    readPermission: 'transportation_companies:read',
    writePermission: 'transportation_companies:write',
    deletePermission: 'transportation_companies:delete',
    adminPermission: 'transportation_companies:admin'
  }
};

/**
 * HTTP method to action mapping
 */
const METHOD_ACTION_MAP = {
  'GET': 'read',
  'POST': 'write',
  'PUT': 'write',
  'PATCH': 'write',
  'DELETE': 'delete'
};

/**
 * Legacy role to permission mapping
 */
const LEGACY_ROLE_PERMISSIONS = {
  'Purchase': [
    'purchase:read', 'purchase:write',
    'shipments:read', 'shipments:write',
    'suppliers:read', 'suppliers:write',
    'items:read', 'items:write',
    'warehouses:read'
  ],
  'FAS': [
    'purchase:read',
    'shipments:read',
    'suppliers:read',
    'exchange_rates:read', 'exchange_rates:write',
    'reports:read'
  ],
  'Logistic': [
    'shipments:read', 'shipments:write',
    'warehouses:read', 'warehouses:write',
    'transportation_companies:read', 'transportation_companies:write',
    'notifications:read', 'notifications:write'
  ],
  'Manager': [
    // Manager gets automatic read access to all resources
    '*:read'
  ],
  'Management': [
    // Management gets automatic read access to all resources
    '*:read'
  ],
  'Admin': [
    // Admin gets full access to everything
    '*:*',
    'admin:access_control'
  ]
};

/**
 * Map route path and method to required permission
 * @param {string} path - Route path (e.g., '/api/shipments')
 * @param {string} method - HTTP method (e.g., 'GET', 'POST')
 * @returns {string|null} Required permission or null if not found
 */
function mapRouteToPermission(path, method) {
  // Normalize path and method
  const normalizedPath = path.toLowerCase();
  const normalizedMethod = method.toUpperCase();
  
  // Find matching resource
  for (const [resourceKey, config] of Object.entries(ROUTE_PERMISSION_MAPPINGS)) {
    if (normalizedPath.startsWith(config.basePath.toLowerCase())) {
      const action = METHOD_ACTION_MAP[normalizedMethod];
      
      if (!action) {
        console.warn(`Unknown HTTP method: ${method}`);
        return null;
      }
      
      // Map action to permission
      switch (action) {
        case 'read':
          return config.readPermission;
        case 'write':
          return config.writePermission;
        case 'delete':
          return config.deletePermission;
        default:
          return config.readPermission; // Default to read
      }
    }
  }
  
  // No mapping found
  console.warn(`No permission mapping found for route: ${path} ${method}`);
  return null;
}

/**
 * Map legacy role array to permission array
 * @param {Array<string>} roles - Legacy roles (e.g., ['Purchase', 'Manager'])
 * @returns {Array<string>} Equivalent permissions
 */
function mapRolesToPermissions(roles) {
  if (!Array.isArray(roles)) {
    return [];
  }
  
  const permissions = new Set();
  
  for (const role of roles) {
    const rolePermissions = LEGACY_ROLE_PERMISSIONS[role];
    if (rolePermissions) {
      rolePermissions.forEach(perm => permissions.add(perm));
    } else {
      console.warn(`No permission mapping found for role: ${role}`);
    }
  }
  
  return Array.from(permissions);
}

/**
 * Generate migration mapping for a route file
 * @param {string} routeFilePath - Path to route file
 * @param {Object} routeConfig - Route configuration object
 * @returns {Object} Migration mapping
 */
function generateRouteMigrationMapping(routeFilePath, routeConfig) {
  const mappings = [];
  
  // This would typically parse the route file to extract authorize() calls
  // For now, we'll provide a template structure
  
  return {
    filePath: routeFilePath,
    mappings: mappings,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Get all permissions for a specific resource
 * @param {string} resource - Resource name (e.g., 'shipments')
 * @returns {Array<string>} All permissions for the resource
 */
function getResourcePermissions(resource) {
  const config = ROUTE_PERMISSION_MAPPINGS[resource];
  if (!config) {
    return [];
  }
  
  return [
    config.readPermission,
    config.writePermission,
    config.deletePermission,
    config.adminPermission
  ].filter(Boolean);
}

/**
 * Get all available permissions in the system
 * @returns {Array<string>} All system permissions
 */
function getAllSystemPermissions() {
  const permissions = new Set();
  
  // Add all resource permissions
  for (const config of Object.values(ROUTE_PERMISSION_MAPPINGS)) {
    [
      config.readPermission,
      config.writePermission,
      config.deletePermission,
      config.adminPermission
    ].filter(Boolean).forEach(perm => permissions.add(perm));
  }
  
  // Add wildcard permissions
  permissions.add('*:read');
  permissions.add('*:write');
  permissions.add('*:delete');
  permissions.add('*:*');
  
  return Array.from(permissions).sort();
}

/**
 * Validate all system permissions
 * @returns {Object} Validation result
 */
function validateSystemPermissions() {
  const allPermissions = getAllSystemPermissions();
  const results = [];
  let validCount = 0;
  
  for (const permission of allPermissions) {
    const validation = validatePermissionFormat(permission);
    results.push({
      permission,
      isValid: validation.isValid,
      error: validation.error
    });
    
    if (validation.isValid) {
      validCount++;
    }
  }
  
  return {
    totalPermissions: allPermissions.length,
    validPermissions: validCount,
    invalidPermissions: allPermissions.length - validCount,
    results: results.filter(r => !r.isValid), // Only return invalid ones
    isAllValid: validCount === allPermissions.length
  };
}

/**
 * Generate permission seeding data for database
 * @returns {Array<Object>} Permission objects for database seeding
 */
function generatePermissionSeedData() {
  const permissions = [];
  
  for (const [resourceKey, config] of Object.entries(ROUTE_PERMISSION_MAPPINGS)) {
    const resourceName = resourceKey.replace(/([A-Z])/g, '_$1').toLowerCase();
    
    // Read permission
    if (config.readPermission) {
      permissions.push({
        key: config.readPermission,
        resource: resourceName,
        action: 'read',
        type: 'action',
        label: `Read ${resourceKey}`,
        description: `Permission to view ${resourceKey} data`,
        isActive: true,
        sortOrder: 1
      });
    }
    
    // Write permission
    if (config.writePermission) {
      permissions.push({
        key: config.writePermission,
        resource: resourceName,
        action: 'write',
        type: 'action',
        label: `Write ${resourceKey}`,
        description: `Permission to create and update ${resourceKey} data`,
        isActive: true,
        sortOrder: 2
      });
    }
    
    // Delete permission
    if (config.deletePermission) {
      permissions.push({
        key: config.deletePermission,
        resource: resourceName,
        action: 'delete',
        type: 'action',
        label: `Delete ${resourceKey}`,
        description: `Permission to delete ${resourceKey} data`,
        isActive: true,
        sortOrder: 3
      });
    }
    
    // Admin permission
    if (config.adminPermission && config.adminPermission !== config.writePermission) {
      permissions.push({
        key: config.adminPermission,
        resource: resourceName,
        action: 'admin',
        type: 'action',
        label: `Administer ${resourceKey}`,
        description: `Full administrative access to ${resourceKey}`,
        isActive: true,
        sortOrder: 4
      });
    }
  }
  
  return permissions;
}

/**
 * Generate role permission seeding data
 * @returns {Array<Object>} RolePermission objects for database seeding
 */
function generateRolePermissionSeedData() {
  const rolePermissions = [];
  
  for (const [roleKey, permissions] of Object.entries(LEGACY_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      // Skip wildcard permissions for now - they'll be handled by the service
      if (!permission.includes('*')) {
        rolePermissions.push({
          roleKey: roleKey,
          permissionKey: permission,
          allowed: true
        });
      }
    }
  }
  
  return rolePermissions;
}

/**
 * Get migration suggestions for a route
 * @param {string} path - Route path
 * @param {string} method - HTTP method
 * @param {Array<string>} currentRoles - Current authorized roles
 * @returns {Object} Migration suggestions
 */
function getMigrationSuggestions(path, method, currentRoles) {
  const suggestedPermission = mapRouteToPermission(path, method);
  const equivalentPermissions = mapRolesToPermissions(currentRoles);
  
  return {
    route: `${method} ${path}`,
    currentRoles,
    suggestedPermission,
    equivalentPermissions,
    migrationStrategy: {
      immediate: suggestedPermission ? [suggestedPermission] : [],
      gradual: {
        legacy: currentRoles,
        permissions: suggestedPermission ? [suggestedPermission] : [],
        mode: 'dual'
      }
    }
  };
}

module.exports = {
  ROUTE_PERMISSION_MAPPINGS,
  LEGACY_ROLE_PERMISSIONS,
  mapRouteToPermission,
  mapRolesToPermissions,
  generateRouteMigrationMapping,
  getResourcePermissions,
  getAllSystemPermissions,
  validateSystemPermissions,
  generatePermissionSeedData,
  generateRolePermissionSeedData,
  getMigrationSuggestions
};