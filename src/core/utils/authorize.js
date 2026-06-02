/**
 * Enhanced Authorization Middleware
 *
 * Supports three authorization styles:
 *
 *   1. Legacy role array  — authorize(['Purchase', 'Admin'])
 *      Checks the user's role against the supplied list.
 *
 *   2. Semantic tags      — authorize({ tag: 'any-active' })
 *      Resolves the allowed set dynamically from the DB-backed RoleRegistry:
 *        'any-active'   – any role that exists and is active in the DB
 *        'admin-only'   – only Admin / Manager / Management
 *        'authenticated'– any authenticated user (no role check)
 *
 *   3. Permission keys    — authorize(['shipments:read'])
 *      Delegates to the permission service (existing behaviour).
 *
 * Mixing styles in one call is not supported; pick one per route.
 */

const { normalizeRole } = require('./roleHelpers');
const { authConfig, getAuthModeForRoute } = require('../../config/authConfig');
const { permissionService } = require('../services/permissionService');
const roleRegistry = require('./roleRegistry');

/**
 * Main authorize function
 * @param {Array|string|Object} requirements
 * @returns {Function} Express middleware
 */
module.exports = function authorize(requirements) {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Authentication required',
                });
            }

            // ── Semantic tag shorthand ──────────────────────────────────────
            if (requirements && typeof requirements === 'object' && !Array.isArray(requirements) && requirements.tag) {
                const authorized = _checkTagAuthorization(user, requirements.tag);
                if (authorized) return next();
                _logAuthFailure(user, req, requirements, { authorized: false, message: `Tag '${requirements.tag}' not satisfied` });
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Insufficient permissions for this resource',
                    code: 'PERMISSION_DENIED',
                });
            }

            // ── Existing legacy / permission / dual modes ───────────────────
            const authMode = getAuthModeForRoute(req.path);
            const parsedRequirements = _parseRequirements(requirements);

            let authorized = false;
            let authResult = null;

            switch (authMode) {
                case 'legacy':
                    authResult = await _checkLegacyAuthorization(user, parsedRequirements);
                    authorized = authResult.authorized;
                    break;
                case 'permissions':
                    authResult = await _checkPermissionAuthorization(user, parsedRequirements);
                    authorized = authResult.authorized;
                    break;
                case 'dual':
                    authResult = await _checkDualAuthorization(user, parsedRequirements);
                    authorized = authResult.authorized;
                    break;
                default:
                    console.error(`Invalid auth mode: ${authMode}`);
                    return res.status(500).json({
                        error: 'Internal Server Error',
                        message: 'Invalid authorization configuration',
                    });
            }

            if (authorized) {
                _logDebug(`Authorization granted for user ${user._id} on ${req.path} (mode: ${authMode})`);
                return next();
            }

            _logAuthFailure(user, req, parsedRequirements, authResult);
            return res.status(403).json({
                error: 'Forbidden',
                message: authResult.message || 'Insufficient permissions for this resource',
                required: authResult.required,
                userPermissions: authResult.userPermissions,
                code: 'PERMISSION_DENIED',
            });

        } catch (error) {
            console.error('Authorization middleware error:', error);

            if (authConfig.migration.enableLegacyBypass) {
                try {
                    const fallbackResult = await _checkLegacyAuthorizationFallback(req.user, requirements);
                    if (fallbackResult.authorized) {
                        console.warn('Authorization system fallback activated', {
                            userId: req.user._id,
                            route: req.path,
                            error: error.message,
                        });
                        return next();
                    }
                } catch (fallbackError) {
                    console.error('Fallback authorization also failed:', fallbackError);
                }
            }

            return res.status(500).json({
                error: 'Authorization Error',
                message: 'Authorization system temporarily unavailable',
                code: 'AUTH_SYSTEM_ERROR',
            });
        }
    };
};

// ─── Tag-based authorization ────────────────────────────────────────────────

/**
 * Resolve a semantic tag against the live role registry.
 * @param {Object} user
 * @param {string} tag
 * @returns {boolean}
 */
function _checkTagAuthorization(user, tag) {
    const userRole = normalizeRole(user.role || '');

    switch (tag) {
        case 'authenticated':
            // Any logged-in user passes.
            return true;

        case 'any-active':
            // The user's role must exist in the DB as an active role.
            return roleRegistry.isActiveRole(userRole);

        case 'admin-only':
            // Only Admin / Manager / Management.
            return roleRegistry.isAdminRole(userRole);

        default:
            // Unknown tag — deny by default.
            console.warn(`[Authorize] Unknown tag: '${tag}' — denying access`);
            return false;
    }
}

// ─── Existing helpers (unchanged) ───────────────────────────────────────────

function _parseRequirements(requirements) {
    if (Array.isArray(requirements)) {
        const isLegacyRoles = requirements.every(
            (req) => typeof req === 'string' && !req.includes(':')
        );
        if (isLegacyRoles) {
            return { type: 'legacy', roles: requirements, permissions: [] };
        }
        return { type: 'permissions', roles: [], permissions: requirements };
    }

    if (typeof requirements === 'string') {
        if (requirements.includes(':')) {
            return { type: 'permissions', roles: [], permissions: [requirements] };
        }
        return { type: 'legacy', roles: [requirements], permissions: [] };
    }

    if (typeof requirements === 'object' && requirements !== null) {
        return {
            type: requirements.mode || 'dual',
            roles: requirements.legacy || requirements.roles || [],
            permissions: requirements.permissions || [],
        };
    }

    return { type: 'legacy', roles: [], permissions: [] };
}

async function _checkLegacyAuthorization(user, requirements) {
    const normalizedUserRole = normalizeRole(user.role);

    // Admin-level bypass
    if (authConfig.migration.enableLegacyBypass && roleRegistry.isAdminRole(normalizedUserRole)) {
        return { authorized: true, method: 'legacy_bypass', message: 'Admin/Manager role bypass' };
    }

    // Normalise the allowed list and also expand any 'any-active' sentinel
    let allowedRoles = requirements.roles.map(normalizeRole);

    // If the route still passes a plain role array, also accept any active DB role
    // when the list contains the special sentinel string 'any-active'.
    if (allowedRoles.includes('any-active')) {
        const authorized = roleRegistry.isActiveRole(normalizedUserRole);
        return {
            authorized,
            method: 'legacy_any_active',
            message: authorized ? 'Active role authorized' : 'Role not active in DB',
            userRole: normalizedUserRole,
        };
    }

    const authorized = allowedRoles.includes(normalizedUserRole);
    return {
        authorized,
        method: 'legacy_roles',
        message: authorized ? 'Role authorized' : 'Role not in allowed list',
        required: requirements.roles,
        userRole: normalizedUserRole,
    };
}

async function _checkPermissionAuthorization(user, requirements) {
    if (requirements.permissions.length === 0) {
        return { authorized: true, method: 'permissions_empty', message: 'No permissions required' };
    }
    const authorized = await permissionService.hasAllPermissions(user, requirements.permissions);
    const userPermissions = await permissionService.getUserPermissions(user);
    return {
        authorized,
        method: 'permissions',
        message: authorized ? 'All permissions granted' : 'Missing required permissions',
        required: requirements.permissions,
        userPermissions,
    };
}

async function _checkDualAuthorization(user, requirements) {
    const legacyResult = await _checkLegacyAuthorization(user, requirements);
    const permissionResult = await _checkPermissionAuthorization(user, requirements);
    const authorized = legacyResult.authorized || permissionResult.authorized;
    return {
        authorized,
        method: 'dual',
        message: authorized
            ? `Authorized via ${legacyResult.authorized ? 'legacy' : 'permissions'}`
            : 'Neither legacy nor permission authorization succeeded',
        required: [...(requirements.roles || []), ...(requirements.permissions || [])],
        userRole: normalizeRole(user.role),
        userPermissions: permissionResult.userPermissions,
        legacyResult,
        permissionResult,
    };
}

async function _checkLegacyAuthorizationFallback(user, originalRequirements) {
    try {
        let roles = [];
        if (Array.isArray(originalRequirements)) {
            roles = originalRequirements.filter((r) => typeof r === 'string' && !r.includes(':'));
        } else if (typeof originalRequirements === 'string' && !originalRequirements.includes(':')) {
            roles = [originalRequirements];
        } else if (typeof originalRequirements === 'object' && originalRequirements.legacy) {
            roles = originalRequirements.legacy;
        }
        return await _checkLegacyAuthorization(user, { roles, permissions: [] });
    } catch (error) {
        console.error('Fallback authorization error:', error);
        return { authorized: false, method: 'fallback_failed' };
    }
}

function _logAuthFailure(user, req, requirements, authResult) {
    if (authConfig.security.logFailedAttempts) {
        console.warn('Authorization failed', {
            userId: user._id,
            userRole: user.role,
            route: req.path,
            method: req.method,
            requirements,
            authResult,
            timestamp: new Date().toISOString(),
        });
    }
}

function _logDebug(message) {
    if (authConfig.performance.enableDebugLogging) {
        console.log(`[Authorize] ${message}`);
    }
}

// ─── Utility exports (unchanged API) ────────────────────────────────────────

function requireAllPermissions(permissions) {
    return module.exports(permissions);
}

function requireAnyPermission(permissions) {
    return async (req, res, next) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
            }
            const hasAny = await permissionService.hasAnyPermission(user, permissions);
            if (hasAny) return next();
            const userPermissions = await permissionService.getUserPermissions(user);
            _logAuthFailure(user, req, { permissions }, {
                authorized: false,
                message: 'User does not have any of the required permissions',
                required: permissions,
                userPermissions,
            });
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You need at least one of the required permissions',
                required: permissions,
                userPermissions,
                code: 'INSUFFICIENT_PERMISSIONS',
            });
        } catch (error) {
            console.error('Authorization middleware error (any permission):', error);
            return res.status(500).json({
                error: 'Authorization Error',
                message: 'Authorization system temporarily unavailable',
                code: 'AUTH_SYSTEM_ERROR',
            });
        }
    };
}

function requireCustomAuthorization(customCheck, errorMessage = 'Access denied') {
    return async (req, res, next) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
            }
            const authorized = await customCheck(user, req);
            if (authorized) return next();
            _logAuthFailure(user, req, { custom: true }, { authorized: false, message: errorMessage });
            return res.status(403).json({
                error: 'Forbidden',
                message: errorMessage,
                code: 'CUSTOM_AUTHORIZATION_FAILED',
            });
        } catch (error) {
            console.error('Custom authorization middleware error:', error);
            return res.status(500).json({
                error: 'Authorization Error',
                message: 'Authorization system temporarily unavailable',
                code: 'AUTH_SYSTEM_ERROR',
            });
        }
    };
}

module.exports.requireAllPermissions = requireAllPermissions;
module.exports.requireAnyPermission = requireAnyPermission;
module.exports.requireCustomAuthorization = requireCustomAuthorization;