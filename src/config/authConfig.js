/**
 * Authentication and Authorization Configuration
 * 
 * This configuration system supports the permission-based authorization system
 * with environment-based settings for migration, caching, and performance tuning.
 */

const authConfig = {
  // Migration settings for zero-downtime deployment
  migration: {
    // Enable migration mode (both legacy and permission-based authorization)
    enabled: process.env.AUTH_MIGRATION_MODE === 'true',
    
    // Default authorization mode: 'legacy', 'permissions', or 'dual'
    defaultMode: process.env.AUTH_DEFAULT_MODE || 'legacy',
    
    // Route-specific overrides for gradual migration
    // Format: { "/api/shipments": "permissions", "/api/purchase": "dual" }
    routeOverrides: (() => {
      try {
        return JSON.parse(process.env.AUTH_ROUTE_OVERRIDES || '{}');
      } catch (error) {
        console.warn('Invalid AUTH_ROUTE_OVERRIDES format, using empty object');
        return {};
      }
    })(),
    
    // Enable legacy Manager/Management bypass during migration
    enableLegacyBypass: process.env.AUTH_ENABLE_LEGACY_BYPASS !== 'false'
  },

  // Permission cache configuration
  cache: {
    // Enable/disable permission caching
    enabled: process.env.AUTH_CACHE_ENABLED !== 'false',
    
    // Cache TTL in seconds (default: 5 minutes)
    ttl: parseInt(process.env.AUTH_CACHE_TTL || '300'),
    
    // Maximum cache entries (LRU eviction)
    maxSize: parseInt(process.env.AUTH_CACHE_MAX_SIZE || '1000'),
    
    // Cache refresh interval in seconds (default: 5 minutes)
    refreshInterval: parseInt(process.env.AUTH_CACHE_REFRESH_INTERVAL || '300'),
    
    // Enable cache performance monitoring
    enableMetrics: process.env.AUTH_CACHE_METRICS_ENABLED === 'true'
  },

  // Performance and debugging settings
  performance: {
    // Enable debug logging (automatically enabled in development)
    enableDebugLogging: process.env.AUTH_DEBUG_LOGGING === 'true' || process.env.NODE_ENV === 'development',
    
    // Enable performance metrics collection
    enableMetrics: process.env.AUTH_METRICS_ENABLED === 'true',
    
    // Database query timeout in milliseconds
    dbQueryTimeout: parseInt(process.env.AUTH_DB_QUERY_TIMEOUT || '5000'),
    
    // Maximum concurrent permission checks
    maxConcurrentChecks: parseInt(process.env.AUTH_MAX_CONCURRENT_CHECKS || '100')
  },

  // Permission system settings
  permissions: {
    // Enable wildcard permission support ('shipments:*', '*:read')
    enableWildcards: process.env.AUTH_ENABLE_WILDCARDS !== 'false',
    
    // Enable Manager role automatic read access
    enableManagerAutoRead: process.env.AUTH_ENABLE_MANAGER_AUTO_READ !== 'false',
    
    // Standard actions supported by the system
    standardActions: ['read', 'write', 'delete', 'admin'],
    
    // Permission format validation regex
    permissionFormatRegex: /^[a-z][a-z0-9_]*:[a-z][a-z0-9_*]*$/
  },

  // Security settings
  security: {
    // Enable audit logging for authorization decisions
    enableAuditLogging: process.env.AUTH_ENABLE_AUDIT_LOGGING !== 'false',
    
    // Log failed authorization attempts
    logFailedAttempts: process.env.AUTH_LOG_FAILED_ATTEMPTS !== 'false',
    
    // Maximum permission string length (prevent DoS)
    maxPermissionLength: parseInt(process.env.AUTH_MAX_PERMISSION_LENGTH || '100'),
    
    // Enable input sanitization
    enableInputSanitization: process.env.AUTH_ENABLE_INPUT_SANITIZATION !== 'false'
  }
};

/**
 * Validates the configuration on startup
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateConfig() {
  const errors = [];
  
  // Validate migration settings
  if (authConfig.migration.enabled && !['legacy', 'permissions', 'dual'].includes(authConfig.migration.defaultMode)) {
    errors.push(`Invalid AUTH_DEFAULT_MODE: ${authConfig.migration.defaultMode}. Must be 'legacy', 'permissions', or 'dual'`);
  }
  
  // Validate cache settings
  if (authConfig.cache.ttl < 0 || authConfig.cache.ttl > 3600) {
    errors.push(`Invalid AUTH_CACHE_TTL: ${authConfig.cache.ttl}. Must be between 0 and 3600 seconds`);
  }
  
  if (authConfig.cache.maxSize < 1 || authConfig.cache.maxSize > 10000) {
    errors.push(`Invalid AUTH_CACHE_MAX_SIZE: ${authConfig.cache.maxSize}. Must be between 1 and 10000`);
  }
  
  // Validate performance settings
  if (authConfig.performance.dbQueryTimeout < 1000 || authConfig.performance.dbQueryTimeout > 30000) {
    errors.push(`Invalid AUTH_DB_QUERY_TIMEOUT: ${authConfig.performance.dbQueryTimeout}. Must be between 1000 and 30000 milliseconds`);
  }
  
  if (authConfig.performance.maxConcurrentChecks < 1 || authConfig.performance.maxConcurrentChecks > 1000) {
    errors.push(`Invalid AUTH_MAX_CONCURRENT_CHECKS: ${authConfig.performance.maxConcurrentChecks}. Must be between 1 and 1000`);
  }
  
  // Validate security settings
  if (authConfig.security.maxPermissionLength < 10 || authConfig.security.maxPermissionLength > 500) {
    errors.push(`Invalid AUTH_MAX_PERMISSION_LENGTH: ${authConfig.security.maxPermissionLength}. Must be between 10 and 500`);
  }
  
  // Validate route overrides format
  for (const [route, mode] of Object.entries(authConfig.migration.routeOverrides)) {
    if (!['legacy', 'permissions', 'dual'].includes(mode)) {
      errors.push(`Invalid route override mode for ${route}: ${mode}. Must be 'legacy', 'permissions', or 'dual'`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Gets the authorization mode for a specific route
 * @param {string} route - The route path (e.g., '/api/shipments')
 * @returns {string} The authorization mode: 'legacy', 'permissions', or 'dual'
 */
function getAuthModeForRoute(route) {
  // Check for route-specific override
  if (authConfig.migration.routeOverrides[route]) {
    return authConfig.migration.routeOverrides[route];
  }
  
  // Check for pattern matches (e.g., '/api/shipments/*')
  for (const [pattern, mode] of Object.entries(authConfig.migration.routeOverrides)) {
    if (pattern.endsWith('*') && route.startsWith(pattern.slice(0, -1))) {
      return mode;
    }
  }
  
  // Return default mode
  return authConfig.migration.defaultMode;
}

/**
 * Logs configuration status on startup
 */
function logConfigStatus() {
  const validation = validateConfig();
  
  if (validation.isValid) {
    console.log('✅ Authorization configuration loaded successfully');
    
    if (authConfig.performance.enableDebugLogging) {
      console.log('🔧 Authorization configuration:', {
        migrationEnabled: authConfig.migration.enabled,
        defaultMode: authConfig.migration.defaultMode,
        cacheEnabled: authConfig.cache.enabled,
        cacheTTL: authConfig.cache.ttl,
        debugLogging: authConfig.performance.enableDebugLogging
      });
    }
  } else {
    console.error('❌ Authorization configuration validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid authorization configuration');
  }
}

module.exports = {
  authConfig,
  validateConfig,
  getAuthModeForRoute,
  logConfigStatus
};