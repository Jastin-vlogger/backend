/**
 * Role Registry
 *
 * Loads all active roles from the database at startup and caches them in
 * memory. The authorize middleware uses this cache so that any role added
 * through the Access Control UI is automatically recognised — no code
 * changes required.
 *
 * Roles tagged as "admin-only" are identified by the ADMIN_ROLE_KEYS list
 * below. Add a role key here if it should have the same elevated access as
 * the built-in Admin role.
 */

const Role = require('../../models/role.model');

// Role keys that are treated as "admin-level" (full access, bypass checks).
// This list is intentionally small — it is NOT the full list of roles.
const ADMIN_ROLE_KEYS = new Set(['Admin', 'Manager', 'Management']);

// In-memory cache: Set of active role keys loaded from DB.
let _activeRoleKeys = new Set();
let _activeRoleKeysLower = new Set();
let _initialized = false;
let _refreshTimer = null;

// How often to refresh the cache from DB (default: 5 minutes).
const REFRESH_INTERVAL_MS = parseInt(process.env.ROLE_REGISTRY_REFRESH_MS || '300000', 10);

/**
 * Load all active role keys from the database into the in-memory cache.
 * Safe to call multiple times — subsequent calls just refresh the cache.
 */
async function initialize() {
  try {
    const roles = await Role.find({ isActive: true }).select('key').lean();
    _activeRoleKeys = new Set(roles.map((r) => r.key));
    _activeRoleKeysLower = new Set(roles.map((r) => String(r.key || '').toLowerCase()));
    _initialized = true;
    console.log(`✅ RoleRegistry: loaded ${_activeRoleKeys.size} active role(s): [${[..._activeRoleKeys].join(', ')}]`);
  } catch (err) {
    console.error('❌ RoleRegistry: failed to load roles from DB:', err.message);
    // Keep whatever was cached before — do not wipe it on a transient error.
  }
}

/**
 * Start the periodic background refresh.
 * Call this once after the DB connection is established.
 */
function startAutoRefresh() {
  if (_refreshTimer) return; // already running
  _refreshTimer = setInterval(async () => {
    await initialize();
  }, REFRESH_INTERVAL_MS);
  // Allow the process to exit even if this timer is still running.
  if (_refreshTimer.unref) _refreshTimer.unref();
}

/**
 * Stop the background refresh (useful in tests).
 */
function stopAutoRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

/**
 * Returns all currently cached active role keys.
 * @returns {string[]}
 */
function getAllActiveRoleKeys() {
  return [..._activeRoleKeys];
}

/**
 * Returns true if the given role key is in the active cache.
 * Falls back to true when the registry has not been initialised yet
 * (e.g. during the very first request before DB is ready) so that
 * legitimate users are not locked out during a cold start.
 * @param {string} roleKey
 * @returns {boolean}
 */
function isActiveRole(roleKey) {
  if (!_initialized) return true; // fail-open during cold start
  return _activeRoleKeys.has(roleKey) || _activeRoleKeysLower.has(String(roleKey || '').toLowerCase());
}

/**
 * Returns true if the role key is considered admin-level.
 * @param {string} roleKey
 * @returns {boolean}
 */
function isAdminRole(roleKey) {
  return ADMIN_ROLE_KEYS.has(roleKey);
}

/**
 * Manually add a role key to the cache (called after a new role is created
 * via the Access Control API so the cache stays in sync without waiting for
 * the next refresh cycle).
 * @param {string} roleKey
 */
function registerRole(roleKey) {
  _activeRoleKeys.add(roleKey);
  _activeRoleKeysLower.add(String(roleKey || '').toLowerCase());
}

/**
 * Manually remove a role key from the cache (called when a role is
 * deactivated via the Access Control API).
 * @param {string} roleKey
 */
function unregisterRole(roleKey) {
  _activeRoleKeys.delete(roleKey);
  _activeRoleKeysLower.delete(String(roleKey || '').toLowerCase());
}

module.exports = {
  initialize,
  startAutoRefresh,
  stopAutoRefresh,
  getAllActiveRoleKeys,
  isActiveRole,
  isAdminRole,
  registerRole,
  unregisterRole,
  ADMIN_ROLE_KEYS,
};
