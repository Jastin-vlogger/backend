/**
 * Permission Validation Utilities
 * 
 * Standalone validation functions for permission format checking,
 * wildcard expansion, and security validation.
 */

const { authConfig } = require('../../config/authConfig');

/**
 * Validate permission format
 * @param {string} permission - Permission string to validate
 * @returns {Object} Validation result with isValid flag and error message
 */
function validatePermissionFormat(permission) {
    // Basic type check
    if (!permission || typeof permission !== 'string') {
        return {
            isValid: false,
            error: 'Permission must be a non-empty string'
        };
    }

    // Length check
    if (permission.length > authConfig.security.maxPermissionLength) {
        return {
            isValid: false,
            error: `Permission exceeds maximum length of ${authConfig.security.maxPermissionLength} characters`
        };
    }

    // Security sanitization
    if (authConfig.security.enableInputSanitization) {
        if (permission.includes('..') || permission.includes('/') || permission.includes('\\')) {
            return {
                isValid: false,
                error: 'Permission contains unsafe characters'
            };
        }
    }

    // Format validation: resource:action
    if (!authConfig.permissions.permissionFormatRegex.test(permission)) {
        return {
            isValid: false,
            error: 'Permission must follow format "resource:action" (e.g., "shipments:read")'
        };
    }

    // Validate action against standard actions
    const [resource, action] = permission.split(':');
    
    if (!resource || !action) {
        return {
            isValid: false,
            error: 'Permission must have both resource and action parts'
        };
    }

    // Check if action is standard or wildcard
    const isWildcard = action === '*';
    const isStandardAction = authConfig.permissions.standardActions.includes(action);
    
    if (!isWildcard && !isStandardAction) {
        return {
            isValid: false,
            error: `Action "${action}" is not a standard action. Use one of: ${authConfig.permissions.standardActions.join(', ')} or "*"`
        };
    }

    return {
        isValid: true,
        resource,
        action,
        isWildcard
    };
}

/**
 * Validate multiple permissions
 * @param {Array<string>} permissions - Array of permission strings
 * @returns {Object} Validation result with details for each permission
 */
function validatePermissions(permissions) {
    if (!Array.isArray(permissions)) {
        return {
            isValid: false,
            error: 'Permissions must be an array'
        };
    }

    const results = [];
    let allValid = true;

    for (let i = 0; i < permissions.length; i++) {
        const result = validatePermissionFormat(permissions[i]);
        results.push({
            index: i,
            permission: permissions[i],
            ...result
        });

        if (!result.isValid) {
            allValid = false;
        }
    }

    return {
        isValid: allValid,
        results,
        validCount: results.filter(r => r.isValid).length,
        invalidCount: results.filter(r => !r.isValid).length
    };
}

/**
 * Expand wildcard permissions to specific permissions
 * @param {string} wildcardPermission - Wildcard permission (e.g., "shipments:*")
 * @param {Array<string>} availablePermissions - All available permissions
 * @returns {Array<string>} Expanded permissions
 */
function expandWildcardPermission(wildcardPermission, availablePermissions) {
    if (!authConfig.permissions.enableWildcards) {
        return [wildcardPermission];
    }

    const [resource, action] = wildcardPermission.split(':');
    
    if (action !== '*') {
        return [wildcardPermission]; // Not a wildcard
    }

    // Expand resource:* to all actions for that resource
    return availablePermissions.filter(perm => {
        const [permResource] = perm.split(':');
        return permResource === resource;
    });
}

/**
 * Check if a permission matches a wildcard pattern
 * @param {string} permission - Specific permission to check
 * @param {string} wildcardPattern - Wildcard pattern
 * @returns {boolean} True if permission matches pattern
 */
function matchesWildcardPattern(permission, wildcardPattern) {
    if (!authConfig.permissions.enableWildcards) {
        return permission === wildcardPattern;
    }

    const [permResource, permAction] = permission.split(':');
    const [patternResource, patternAction] = wildcardPattern.split(':');

    // Check *:* (super wildcard)
    if (patternResource === '*' && patternAction === '*') {
        return true;
    }

    // Check resource:* (resource wildcard)
    if (patternResource === permResource && patternAction === '*') {
        return true;
    }

    // Check *:action (action wildcard)
    if (patternResource === '*' && patternAction === permAction) {
        return true;
    }

    // Exact match
    return permission === wildcardPattern;
}

/**
 * Generate permission suggestions based on resource
 * @param {string} resource - Resource name
 * @returns {Array<string>} Suggested permissions
 */
function generatePermissionSuggestions(resource) {
    if (!resource || typeof resource !== 'string') {
        return [];
    }

    const suggestions = [];
    
    // Add standard actions
    for (const action of authConfig.permissions.standardActions) {
        suggestions.push(`${resource}:${action}`);
    }

    // Add wildcard if enabled
    if (authConfig.permissions.enableWildcards) {
        suggestions.push(`${resource}:*`);
    }

    return suggestions;
}

/**
 * Parse permission string into components
 * @param {string} permission - Permission string
 * @returns {Object} Parsed components
 */
function parsePermission(permission) {
    const validation = validatePermissionFormat(permission);
    
    if (!validation.isValid) {
        return {
            isValid: false,
            error: validation.error
        };
    }

    const [resource, action] = permission.split(':');
    
    return {
        isValid: true,
        resource,
        action,
        isWildcard: action === '*',
        isStandardAction: authConfig.permissions.standardActions.includes(action),
        fullPermission: permission
    };
}

/**
 * Normalize permission string (lowercase, trim)
 * @param {string} permission - Permission string
 * @returns {string} Normalized permission
 */
function normalizePermission(permission) {
    if (!permission || typeof permission !== 'string') {
        return '';
    }

    return permission.toLowerCase().trim();
}

/**
 * Get all standard permissions for a resource
 * @param {string} resource - Resource name
 * @returns {Array<string>} All standard permissions for the resource
 */
function getStandardPermissionsForResource(resource) {
    if (!resource || typeof resource !== 'string') {
        return [];
    }

    return authConfig.permissions.standardActions.map(action => `${resource}:${action}`);
}

module.exports = {
    validatePermissionFormat,
    validatePermissions,
    expandWildcardPermission,
    matchesWildcardPattern,
    generatePermissionSuggestions,
    parsePermission,
    normalizePermission,
    getStandardPermissionsForResource
};