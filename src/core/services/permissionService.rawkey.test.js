const test = require('node:test');
const assert = require('node:assert/strict');

const RolePermission = require('../../models/rolePermission.model');
const permissionService = require('./permissionService');
const service = permissionService.permissionService || permissionService;

const stubRoles = (map) => {
  RolePermission.aggregate = async (pipeline) => {
    const roleRegex = pipeline[0].$match.roleKey.$regex;
    const role = Object.keys(map).find((r) => new RegExp(roleRegex, 'i').test(r));
    return (map[role] || []).map((permissionKey) => ({ permissionKey }));
  };
  service.rawKeyCache.clear();
};

test('role holding the dotted key passes, role without it does not', async () => {
  stubRoles({ FAS: ['report.shipment_cost.view'], Purchase: ['report.quality_activity.view'] });
  assert.equal(await service.hasPermissionKey({ role: 'FAS' }, 'report.shipment_cost.view'), true);
  assert.equal(await service.hasPermissionKey({ role: 'Purchase' }, 'report.shipment_cost.view'), false);
});

test('custom role with only the key passes (no hard-coded role list needed)', async () => {
  stubRoles({ cost_viewer: ['report.shipment_cost.view', 'menu.reports.view'] });
  assert.equal(await service.hasPermissionKey({ role: 'cost_viewer' }, 'report.shipment_cost.view'), true);
  assert.equal(await service.hasPermissionKey({ role: 'cost_viewer' }, 'shipment.tab.payment_costing.cost_sheet.unlock'), false);
});

test('missing user, role or key is denied', async () => {
  stubRoles({ FAS: ['x.y'] });
  assert.equal(await service.hasPermissionKey(null, 'x.y'), false);
  assert.equal(await service.hasPermissionKey({}, 'x.y'), false);
  assert.equal(await service.hasPermissionKey({ role: 'FAS' }, ''), false);
});

test('results are cached per role until the cache is cleared', async () => {
  let calls = 0;
  RolePermission.aggregate = async () => { calls += 1; return [{ permissionKey: 'a.b' }]; };
  service.rawKeyCache.clear();
  await service.hasPermissionKey({ role: 'FAS' }, 'a.b');
  await service.hasPermissionKey({ role: 'FAS' }, 'a.b');
  assert.equal(calls, 1);
  await service.clearCache();
  await service.hasPermissionKey({ role: 'FAS' }, 'a.b');
  assert.equal(calls, 2);
});
