/**
 * Authorization Error Handler
 * 
 * Centralized error handling and logging for the authorization system
 */

const { authConfig } = require('../../config/authConfig');
const logAudit = require('./auditLogger');

/**
 * Authorization error types
 */
const AUTH_ERROR_TYPES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  INVALID_PERMISSION_FORMAT: 'INVALID_PERMISSION_FORMAT',
  AUTH_SYSTEM_ERROR: 'AUTH_SYSTEM_ERROR',
  AUTH_SYSTEM_FALLBACK: 'AUTH_SYSTEM_FALLBACK',
  CUSTOM_AUTHORIZATION_FAILED: 'CUSTOM_AUTHORIZATION_FAILED',
  CACHE_ERROR: 'CACHE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
};

/**
 * Create standardized error response
 * @param {string} type - Error type from AUTH_ERROR_TYPES
 * @param {string} message - Human-readable error message
 * @param {Object} details - Additional error details
 * @returns {Object} Standardized error response
 */
function createErrorResponse(type, message, details = {}) {
  const baseResponse = {
    error: type,
    message: message,
    code: type,
    timestamp: new Date().toISOString()
  };

  // Add specific details based on error type
  switch (type) {
    case AUTH_ERROR_TYPES.PERMISSION_DENIED:
    case AUTH_ERROR_TYPES.INSUFFICIENT_PERMISSIONS:
      return {
        ...baseResponse,
        required: details.required || [],
        userPermissions: details.userPermissions || [],
        userRole: details.userRole,
        suggestions: details.suggestions || []
      };

    case AUTH_ERROR_TYPES.INVALID_PERMISSION_FORMAT:
      return {
        ...baseResponse,
        invalidPermission: details.permission,
        expectedFormat: 'resource:action',
        examples: ['shipments:read', 'purchase:write', 'admin:access_control']
      };

    case AUTH_ERROR_TYPES.AUTH_SYSTEM_FALLBACK:
      return {
        ...baseResponse,
        fallback: true,
        originalError: details.originalError,
        fallbackMethod: details.fallbackMethod
      };

    case AUTH_ERROR_TYPES.AUTH_SYSTEM_ERROR:
      return {
        ...baseResponse,
        systemError: true,
        errorId: details.errorId || generateErrorId()
      };

    default:
      return baseResponse;
  }
}

/**
 * Log authorization failure with detailed context
 * @param {Object} user - User object
 * @param {Object} req - Express request object
 * @param {Object} authContext - Authorization context
 * @param {Object} errorDetails - Error details
 */
function logAuthorizationFailure(user, req, authContext, errorDetails) {
  if (!authConfig.security.logFailedAttempts) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'WARN',
    event: 'AUTHORIZATION_FAILED',
    user: {
      id: user?._id,
      role: user?.role,
      email: user?.email
    },
    request: {
      path: req?.path,
      method: req?.method,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent'),
      sessionId: req?.sessionID
    },
    authorization: {
      type: authContext?.type,
      required: authContext?.required,
      mode: authContext?.mode
    },
    error: {
      type: errorDetails?.type,
      message: errorDetails?.message,
      code: errorDetails?.code
    }
  };

  console.warn('[AUTH_FAILURE]', JSON.stringify(logEntry));

  // Also log to audit system if available
  if (user && typeof logAudit === 'function') {
    logAudit({
      userId: user._id,
      module: 'Authorization',
      entity: 'AccessControl',
      entityId: req?.path,
      action: 'Access Denied',
      before: {},
      after: logEntry,
      remarks: `Authorization failed: ${errorDetails?.message}`
    }).catch(err => {
      console.error('Audit logging failed:', err);
    });
  }
}

/**
 * Log authorization success for audit purposes
 * @param {Object} user - User object
 * @param {Object} req - Express request object
 * @param {Object} authContext - Authorization context
 */
function logAuthorizationSuccess(user, req, authContext) {
  if (!authConfig.security.enableAuditLogging) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'AUTHORIZATION_SUCCESS',
    user: {
      id: user?._id,
      role: user?.role
    },
    request: {
      path: req?.path,
      method: req?.method,
      ip: req?.ip || req?.connection?.remoteAddress
    },
    authorization: {
      type: authContext?.type,
      method: authContext?.method,
      mode: authContext?.mode
    }
  };

  if (authConfig.performance.enableDebugLogging) {
    console.log('[AUTH_SUCCESS]', JSON.stringify(logEntry));
  }

  // Log to audit system for sensitive operations
  if (user && _isSensitiveOperation(req) && typeof logAudit === 'function') {
    logAudit({
      userId: user._id,
      module: 'Authorization',
      entity: 'AccessControl',
      entityId: req?.path,
      action: 'Access Granted',
      before: {},
      after: logEntry,
      remarks: `Authorized access to ${req?.path}`
    }).catch(err => {
      console.error('Audit logging failed:', err);
    });
  }
}

/**
 * Log system errors in authorization
 * @param {Error} error - The error object
 * @param {Object} context - Error context
 */
function logSystemError(error, context = {}) {
  const errorId = generateErrorId();
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    event: 'AUTH_SYSTEM_ERROR',
    errorId: errorId,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context: context
  };

  console.error('[AUTH_SYSTEM_ERROR]', JSON.stringify(logEntry));

  return errorId;
}

/**
 * Log cache-related events
 * @param {string} event - Cache event type
 * @param {Object} details - Event details
 */
function logCacheEvent(event, details = {}) {
  if (!authConfig.performance.enableDebugLogging) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'DEBUG',
    event: `CACHE_${event.toUpperCase()}`,
    details: details
  };

  console.log('[AUTH_CACHE]', JSON.stringify(logEntry));
}

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
function logPerformanceMetric(operation, duration, metadata = {}) {
  if (!authConfig.performance.enableMetrics) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'PERFORMANCE_METRIC',
    operation: operation,
    duration: duration,
    metadata: metadata
  };

  console.log('[AUTH_PERFORMANCE]', JSON.stringify(logEntry));

  // Alert on slow operations
  if (duration > 1000) { // More than 1 second
    console.warn('[AUTH_SLOW_OPERATION]', `${operation} took ${duration}ms`, metadata);
  }
}

/**
 * Create Express error handler middleware
 * @returns {Function} Express error handler
 */
function createAuthErrorHandler() {
  return (error, req, res, next) => {
    const errorId = logSystemError(error, {
      path: req.path,
      method: req.method,
      user: req.user?._id
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const errorResponse = createErrorResponse(
      AUTH_ERROR_TYPES.AUTH_SYSTEM_ERROR,
      isDevelopment ? error.message : 'Internal authorization error',
      { errorId }
    );

    res.status(500).json(errorResponse);
  };
}

/**
 * Generate unique error ID for tracking
 * @returns {string} Unique error ID
 */
function generateErrorId() {
  return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if operation is sensitive and requires audit logging
 * @param {Object} req - Express request object
 * @returns {boolean} True if sensitive operation
 * @private
 */
function _isSensitiveOperation(req) {
  const sensitivePaths = [
    '/api/access-control',
    '/api/users',
    '/api/roles',
    '/api/permissions'
  ];

  const sensitiveActions = ['POST', 'PUT', 'PATCH', 'DELETE'];

  return sensitivePaths.some(path => req.path.startsWith(path)) ||
         sensitiveActions.includes(req.method);
}

/**
 * Validate error response format
 * @param {Object} errorResponse - Error response object
 * @returns {boolean} True if valid format
 */
function validateErrorResponse(errorResponse) {
  const requiredFields = ['error', 'message', 'code', 'timestamp'];
  return requiredFields.every(field => errorResponse.hasOwnProperty(field));
}

/**
 * Get error statistics for monitoring
 * @returns {Object} Error statistics
 */
function getErrorStatistics() {
  // This would typically integrate with a monitoring system
  // For now, return a placeholder structure
  return {
    totalErrors: 0,
    errorsByType: {},
    recentErrors: [],
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  AUTH_ERROR_TYPES,
  createErrorResponse,
  logAuthorizationFailure,
  logAuthorizationSuccess,
  logSystemError,
  logCacheEvent,
  logPerformanceMetric,
  createAuthErrorHandler,
  generateErrorId,
  validateErrorResponse,
  getErrorStatistics
};