// Adds one TEST user per role (plus a custom "cost_viewer" role that can only open the Shipment Cost
// Report) to the LOCAL COPY database. Never runs against anything but localhost.
// Password for all of them: LOCAL_TEST_PASSWORD below (local copy only; never used on a real database).
const mongoose = require('mongoose');
const User = require('../src/models/auth.model');
const Role = require('../src/models/role.model');
const RolePermission = require('../src/models/rolePermission.model');

const LOCAL_URI = process.env.LOCAL_COPY_MONGO_URI || 'mongodb://127.0.0.1:27018/haseeb_copy';
const LOCAL_TEST_PASSWORD = 'LocalCopy#Test2026';
const ROLES = ['Admin', 'FAS', 'FasManager', 'Purchase', 'Logistic', 'Management', 'StoreKeeper', 'cost_viewer'];

async function run() {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(LOCAL_URI)) {
    console.error('Refusing to run: the database must be localhost.');
    process.exit(1);
  }
  await mongoose.connect(LOCAL_URI);

  if (!(await Role.findOne({ key: 'cost_viewer' }))) {
    await Role.create({ key: 'cost_viewer', name: 'Cost Viewer (test)', description: 'Test role: Shipment Cost Report only', isActive: true });
  }
  await RolePermission.deleteMany({ roleKey: 'cost_viewer' });
  await RolePermission.insertMany(['menu.reports.view', 'report.shipment_cost.view'].map((permissionKey) => ({ roleKey: 'cost_viewer', permissionKey, allowed: true })));

  for (const role of ROLES) {
    const email = `test.${role.toLowerCase()}@local.invalid`;
    const existing = await User.findOne({ email });
    if (existing) { existing.password = LOCAL_TEST_PASSWORD; existing.role = role; existing.isActive = true; existing.mustChangePassword = false; await existing.save(); }
    else await User.create({ name: `Test ${role}`, email, password: LOCAL_TEST_PASSWORD, role, isActive: true, mustChangePassword: false });
    console.log(`user ${email} (${role})`);
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
