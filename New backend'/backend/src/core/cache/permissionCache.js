/**
 * Permission Cache Manager
 * 
 * Multi-tier caching system for permission data with LRU eviction,
 * automatic refresh, and performance monitoring.
 */

const { authConfig } = require('../../config/authConfig');

/**
 * Simple LRU Cache implementation
 */
class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.accessCount = 0;
  }

  get(key) {
    if (this.cache.has(key)) {
      // Update access order
      this.accessOrder.set(key, ++this.accessCount);
      return this.cache.get(key);
    }
    return null;
  }

  set(key, value) {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this._evictLRU();
    }

    this.cache.set(key, value);
    this.accessOrder.set(key, ++this.accessCount);
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCount = 0;
  }

  size() {
    return this.cache.size;
  }

  _evictLRU() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  getMemoryUsage() {
    // Rough estimate of memory usage
    let size = 0;
    for (const [key, value] of this.cache) {
      size += JSON.stringify(key).length + JSON.stringify(value).length;
    }
    return size;
  }
}

/**
 * Permission Cache Manager with multi-tier architecture
 */
class PermissionCacheManager {
  constructor() {
    this.config = authConfig.cache;
    
    // Tier 1: User-specific permission cache (fastest)
    this.userPermissionCache = new LRUCache(this.config.maxSize);
    
    // Tier 2: Role-based permission cache (shared across users)
    this.rolePermissionCache = new LRUCache(100); // Smaller cache for roles
    
    // Tier 3: Global permission definitions (rarely changes)
    this.globalPermissionCache = new LRUCache(1);
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      refreshCount: 0,
      lastRefresh: null,
      averageResponseTime: 0,
      responseTimeSum: 0
    };
    
    // Auto-refresh timer
    this.refreshTimer = null;
    
    // Initialize auto-refresh if enabled
    if (this.config.enabled && this.config.refreshInterval > 0) {
      this._startAutoRefresh();
    }
  }

  /**
   * Get user permissions from cache
   * @param {string} userId - User ID
   * @returns {Array|null} User permissions or null if not cached
   */
  getUserPermissions(userId) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    const cacheKey = `user:${userId}:permissions`;
    const cached = this.userPermissionCache.get(cacheKey);
    
    const responseTime = Date.now() - startTime;
    this._updateResponseTimeMetrics(responseTime);
    
    if (cached) {
      this.metrics.hits++;
      this._logDebug(`Cache HIT for user permissions: ${userId}`);
      return cached;
    } else {
      this.metrics.misses++;
      this._logDebug(`Cache MISS for user permissions: ${userId}`);
      return null;
    }
  }

  /**
   * Set user permissions in cache
   * @param {string} userId - User ID
   * @param {Array} permissions - User permissions array
   */
  setUserPermissions(userId, permissions) {
    if (!this.config.enabled) return;
    
    const cacheKey = `user:${userId}:permissions`;
    const cacheValue = {
      permissions,
      timestamp: Date.now(),
      ttl: this.config.ttl * 1000 // Convert to milliseconds
    };
    
    this.userPermissionCache.set(cacheKey, cacheValue);
    this._logDebug(`Cached user permissions: ${userId} (${permissions.length} permissions)`);
  }

  /**
   * Get role permissions from cache
   * @param {string} roleKey - Role key
   * @returns {Array|null} Role permissions or null if not cached
   */
  getRolePermissions(roleKey) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    const cacheKey = `role:${roleKey}:permissions`;
    const cached = this.rolePermissionCache.get(cacheKey);
    
    const responseTime = Date.now() - startTime;
    this._updateResponseTimeMetrics(responseTime);
    
    if (cached && !this._isExpired(cached)) {
      this.metrics.hits++;
      this._logDebug(`Cache HIT for role permissions: ${roleKey}`);
      return cached.permissions;
    } else {
      this.metrics.misses++;
      this._logDebug(`Cache MISS for role permissions: ${roleKey}`);
      return null;
    }
  }

  /**
   * Set role permissions in cache
   * @param {string} roleKey - Role key
   * @param {Array} permissions - Role permissions array
   */
  setRolePermissions(roleKey, permissions) {
    if (!this.config.enabled) return;
    
    const cacheKey = `role:${roleKey}:permissions`;
    const cacheValue = {
      permissions,
      timestamp: Date.now(),
      ttl: this.config.ttl * 1000
    };
    
    this.rolePermissionCache.set(cacheKey, cacheValue);
    this._logDebug(`Cached role permissions: ${roleKey} (${permissions.length} permissions)`);
  }

  /**
   * Get global permissions from cache
   * @returns {Array|null} All permissions or null if not cached
   */
  getGlobalPermissions() {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    const cached = this.globalPermissionCache.get('all:permissions');
    
    const responseTime = Date.now() - startTime;
    this._updateResponseTimeMetrics(responseTime);
    
    if (cached && !this._isExpired(cached)) {
      this.metrics.hits++;
      this._logDebug('Cache HIT for global permissions');
      return cached.permissions;
    } else {
      this.metrics.misses++;
      this._logDebug('Cache MISS for global permissions');
      return null;
    }
  }

  /**
   * Set global permissions in cache
   * @param {Array} permissions - All system permissions
   */
  setGlobalPermissions(permissions) {
    if (!this.config.enabled) return;
    
    const cacheValue = {
      permissions,
      timestamp: Date.now(),
      ttl: this.config.ttl * 1000
    };
    
    this.globalPermissionCache.set('all:permissions', cacheValue);
    this._logDebug(`Cached global permissions (${permissions.length} permissions)`);
  }

  /**
   * Refresh user permissions cache
   * @param {string} userId - User ID to refresh
   */
  refreshUserPermissions(userId) {
    const cacheKey = `user:${userId}:permissions`;
    this.userPermissionCache.delete(cacheKey);
    this._logDebug(`Refreshed user permissions cache: ${userId}`);
  }

  /**
   * Refresh role permissions cache
   * @param {string} roleKey - Role key to refresh
   */
  refreshRolePermissions(roleKey) {
    const cacheKey = `role:${roleKey}:permissions`;
    this.rolePermissionCache.delete(cacheKey);
    
    // Also refresh all users with this role
    this._refreshUsersWithRole(roleKey);
    this._logDebug(`Refreshed role permissions cache: ${roleKey}`);
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this.userPermissionCache.clear();
    this.rolePermissionCache.clear();
    this.globalPermissionCache.clear();
    
    this.metrics.refreshCount++;
    this.metrics.lastRefresh = new Date();
    
    this._logDebug('Cleared all permission caches');
  }

  /**
   * Get cache performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const hitRate = this.metrics.totalRequests > 0 
      ? (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2)
      : 0;
    
    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      memoryUsage: {
        userCache: this.userPermissionCache.getMemoryUsage(),
        roleCache: this.rolePermissionCache.getMemoryUsage(),
        globalCache: this.globalPermissionCache.getMemoryUsage()
      },
      cacheSize: {
        userCache: this.userPermissionCache.size(),
        roleCache: this.rolePermissionCache.size(),
        globalCache: this.globalPermissionCache.size()
      }
    };
  }

  /**
   * Get cache hit rate
   * @returns {number} Hit rate as percentage
   */
  getHitRate() {
    return this.metrics.totalRequests > 0 
      ? (this.metrics.hits / this.metrics.totalRequests * 100)
      : 0;
  }

  /**
   * Get average response time
   * @returns {number} Average response time in milliseconds
   */
  getAvgResponseTime() {
    return this.metrics.averageResponseTime;
  }

  /**
   * Get total requests count
   * @returns {number} Total requests processed
   */
  getTotalRequests() {
    return this.metrics.totalRequests;
  }

  /**
   * Start automatic cache refresh
   * @private
   */
  _startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      this._performAutoRefresh();
    }, this.config.refreshInterval * 1000);
    
    this._logDebug(`Started auto-refresh with interval: ${this.config.refreshInterval}s`);
  }

  /**
   * Perform automatic cache refresh
   * @private
   */
  _performAutoRefresh() {
    // Clear expired entries
    this._clearExpiredEntries();
    
    this.metrics.refreshCount++;
    this.metrics.lastRefresh = new Date();
    
    this._logDebug('Performed automatic cache refresh');
  }

  /**
   * Clear expired cache entries
   * @private
   */
  _clearExpiredEntries() {
    // Clear expired user permissions
    for (const [key, value] of this.userPermissionCache.cache) {
      if (this._isExpired(value)) {
        this.userPermissionCache.delete(key);
      }
    }
    
    // Clear expired role permissions
    for (const [key, value] of this.rolePermissionCache.cache) {
      if (this._isExpired(value)) {
        this.rolePermissionCache.delete(key);
      }
    }
    
    // Clear expired global permissions
    for (const [key, value] of this.globalPermissionCache.cache) {
      if (this._isExpired(value)) {
        this.globalPermissionCache.delete(key);
      }
    }
  }

  /**
   * Check if cache entry is expired
   * @param {Object} cacheEntry - Cache entry with timestamp and ttl
   * @returns {boolean} True if expired
   * @private
   */
  _isExpired(cacheEntry) {
    if (!cacheEntry || !cacheEntry.timestamp || !cacheEntry.ttl) {
      return true;
    }
    
    return (Date.now() - cacheEntry.timestamp) > cacheEntry.ttl;
  }

  /**
   * Refresh all users with a specific role
   * @param {string} roleKey - Role key
   * @private
   */
  _refreshUsersWithRole(roleKey) {
    // This is a simplified approach - in a real system you might want to
    // track which users have which roles for more efficient cache invalidation
    const keysToDelete = [];
    
    for (const [key] of this.userPermissionCache.cache) {
      if (key.startsWith('user:')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.userPermissionCache.delete(key));
  }

  /**
   * Update response time metrics
   * @param {number} responseTime - Response time in milliseconds
   * @private
   */
  _updateResponseTimeMetrics(responseTime) {
    this.metrics.responseTimeSum += responseTime;
    this.metrics.averageResponseTime = this.metrics.responseTimeSum / this.metrics.totalRequests;
  }

  /**
   * Log debug message if debug logging is enabled
   * @param {string} message - Debug message
   * @private
   */
  _logDebug(message) {
    if (authConfig.performance.enableDebugLogging) {
      console.log(`[PermissionCache] ${message}`);
    }
  }

  /**
   * Stop auto-refresh timer
   */
  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Create singleton instance
const permissionCache = new PermissionCacheManager();

module.exports = {
  PermissionCacheManager,
  permissionCache
};