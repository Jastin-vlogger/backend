/**
 * Cache Management Service
 * 
 * Centralized service for managing permission cache lifecycle,
 * automatic refresh, and manual cache operations.
 */

const { permissionCache } = require('../cache/permissionCache');
const { authConfig } = require('../../config/authConfig');
const { logCacheEvent, logPerformanceMetric } = require('../utils/authErrorHandler');

/**
 * Cache Management Service Class
 */
class CacheManagementService {
  constructor() {
    this.cache = permissionCache;
    this.config = authConfig.cache;
    this.refreshInProgress = false;
    this.lastFullRefresh = null;
    this.refreshQueue = new Set();
    
    // Start automatic refresh if enabled
    if (this.config.enabled && this.config.refreshInterval > 0) {
      this._startAutomaticRefresh();
    }
  }

  /**
   * Manually refresh cache for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Refresh result
   */
  async refreshUserCache(userId) {
    const startTime = Date.now();
    
    try {
      logCacheEvent('refresh_user_start', { userId });
      
      this.cache.refreshUserPermissions(userId);
      
      const duration = Date.now() - startTime;
      logPerformanceMetric('cache_refresh_user', duration, { userId });
      logCacheEvent('refresh_user_success', { userId, duration });
      
      return {
        success: true,
        userId,
        refreshedAt: new Date(),
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logCacheEvent('refresh_user_error', { userId, error: error.message, duration });
      
      return {
        success: false,
        userId,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Manually refresh cache for a specific role
   * @param {string} roleKey - Role key
   * @returns {Promise<Object>} Refresh result
   */
  async refreshRoleCache(roleKey) {
    const startTime = Date.now();
    
    try {
      logCacheEvent('refresh_role_start', { roleKey });
      
      this.cache.refreshRolePermissions(roleKey);
      
      const duration = Date.now() - startTime;
      logPerformanceMetric('cache_refresh_role', duration, { roleKey });
      logCacheEvent('refresh_role_success', { roleKey, duration });
      
      return {
        success: true,
        roleKey,
        refreshedAt: new Date(),
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logCacheEvent('refresh_role_error', { roleKey, error: error.message, duration });
      
      return {
        success: false,
        roleKey,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Clear all caches
   * @returns {Promise<Object>} Clear result
   */
  async clearAllCaches() {
    const startTime = Date.now();
    
    try {
      logCacheEvent('clear_all_start');
      
      this.cache.clearAll();
      
      const duration = Date.now() - startTime;
      logPerformanceMetric('cache_clear_all', duration);
      logCacheEvent('clear_all_success', { duration });
      
      return {
        success: true,
        clearedAt: new Date(),
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logCacheEvent('clear_all_error', { error: error.message, duration });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Perform full cache refresh (all users and roles)
   * @returns {Promise<Object>} Refresh result
   */
  async performFullRefresh() {
    if (this.refreshInProgress) {
      return {
        success: false,
        message: 'Refresh already in progress',
        inProgress: true
      };
    }

    const startTime = Date.now();
    this.refreshInProgress = true;
    
    try {
      logCacheEvent('full_refresh_start');
      
      // Clear all caches first
      await this.clearAllCaches();
      
      // Mark as refreshed
      this.lastFullRefresh = new Date();
      
      const duration = Date.now() - startTime;
      logPerformanceMetric('cache_full_refresh', duration);
      logCacheEvent('full_refresh_success', { duration });
      
      return {
        success: true,
        refreshedAt: this.lastFullRefresh,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logCacheEvent('full_refresh_error', { error: error.message, duration });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    } finally {
      this.refreshInProgress = false;
    }
  }

  /**
   * Queue a cache refresh operation
   * @param {string} type - Refresh type ('user' or 'role')
   * @param {string} identifier - User ID or role key
   */
  queueRefresh(type, identifier) {
    const refreshKey = `${type}:${identifier}`;
    this.refreshQueue.add(refreshKey);
    
    logCacheEvent('refresh_queued', { type, identifier });
    
    // Process queue after a short delay to batch operations
    setTimeout(() => this._processRefreshQueue(), 1000);
  }

  /**
   * Get cache statistics and health information
   * @returns {Object} Cache statistics
   */
  getCacheStatistics() {
    const metrics = this.cache.getMetrics();
    
    return {
      ...metrics,
      config: {
        enabled: this.config.enabled,
        ttl: this.config.ttl,
        maxSize: this.config.maxSize,
        refreshInterval: this.config.refreshInterval
      },
      status: {
        refreshInProgress: this.refreshInProgress,
        lastFullRefresh: this.lastFullRefresh,
        queueSize: this.refreshQueue.size
      },
      health: {
        hitRate: this.cache.getHitRate(),
        avgResponseTime: this.cache.getAvgResponseTime(),
        isHealthy: this._isHealthy()
      }
    };
  }

  /**
   * Warm up cache with commonly accessed permissions
   * @param {Array<string>} userIds - User IDs to warm up
   * @param {Array<string>} roleKeys - Role keys to warm up
   * @returns {Promise<Object>} Warmup result
   */
  async warmUpCache(userIds = [], roleKeys = []) {
    const startTime = Date.now();
    let warmedUsers = 0;
    let warmedRoles = 0;
    
    try {
      logCacheEvent('warmup_start', { userCount: userIds.length, roleCount: roleKeys.length });
      
      // Warm up user caches
      for (const userId of userIds) {
        try {
          await this.refreshUserCache(userId);
          warmedUsers++;
        } catch (error) {
          console.warn(`Failed to warm up cache for user ${userId}:`, error.message);
        }
      }
      
      // Warm up role caches
      for (const roleKey of roleKeys) {
        try {
          await this.refreshRoleCache(roleKey);
          warmedRoles++;
        } catch (error) {
          console.warn(`Failed to warm up cache for role ${roleKey}:`, error.message);
        }
      }
      
      const duration = Date.now() - startTime;
      logPerformanceMetric('cache_warmup', duration, { warmedUsers, warmedRoles });
      logCacheEvent('warmup_success', { warmedUsers, warmedRoles, duration });
      
      return {
        success: true,
        warmedUsers,
        warmedRoles,
        totalRequested: userIds.length + roleKeys.length,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logCacheEvent('warmup_error', { error: error.message, duration });
      
      return {
        success: false,
        error: error.message,
        warmedUsers,
        warmedRoles,
        duration
      };
    }
  }

  /**
   * Start automatic cache refresh
   * @private
   */
  _startAutomaticRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(async () => {
      try {
        await this._performScheduledRefresh();
      } catch (error) {
        console.error('Scheduled cache refresh failed:', error);
      }
    }, this.config.refreshInterval * 1000);
    
    logCacheEvent('automatic_refresh_started', { 
      interval: this.config.refreshInterval 
    });
  }

  /**
   * Perform scheduled automatic refresh
   * @private
   */
  async _performScheduledRefresh() {
    logCacheEvent('scheduled_refresh_start');
    
    // Only clear expired entries, don't do full refresh
    this.cache._clearExpiredEntries();
    
    // Process any queued refreshes
    await this._processRefreshQueue();
    
    logCacheEvent('scheduled_refresh_complete');
  }

  /**
   * Process queued refresh operations
   * @private
   */
  async _processRefreshQueue() {
    if (this.refreshQueue.size === 0) {
      return;
    }
    
    const queueItems = Array.from(this.refreshQueue);
    this.refreshQueue.clear();
    
    logCacheEvent('processing_refresh_queue', { itemCount: queueItems.length });
    
    for (const item of queueItems) {
      const [type, identifier] = item.split(':');
      
      try {
        if (type === 'user') {
          await this.refreshUserCache(identifier);
        } else if (type === 'role') {
          await this.refreshRoleCache(identifier);
        }
      } catch (error) {
        console.warn(`Failed to process queued refresh for ${item}:`, error.message);
      }
    }
  }

  /**
   * Check if cache is healthy
   * @returns {boolean} True if cache is healthy
   * @private
   */
  _isHealthy() {
    const hitRate = this.cache.getHitRate();
    const avgResponseTime = this.cache.getAvgResponseTime();
    
    // Consider cache healthy if:
    // - Hit rate is above 80% (if we have enough requests)
    // - Average response time is below 10ms
    const totalRequests = this.cache.getTotalRequests();
    const hitRateOk = totalRequests < 10 || hitRate >= 80;
    const responseTimeOk = avgResponseTime < 10;
    
    return hitRateOk && responseTimeOk;
  }

  /**
   * Stop automatic refresh
   */
  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.cache.destroy();
    
    logCacheEvent('cache_management_destroyed');
  }
}

// Create singleton instance
const cacheManagementService = new CacheManagementService();

module.exports = {
  CacheManagementService,
  cacheManagementService
};