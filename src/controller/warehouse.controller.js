const Warehouse = require('../models/warehouse.model');
const User = require('../models/auth.model');
const { normalizeRole } = require('../core/utils/roleHelpers');

const WAREHOUSE_POPULATE = {
  path: 'assignedStorekeepers',
  select: '_id name email role isActive',
};

const toWarehouseResponse = (warehouse) => {
  const doc = warehouse?.toObject ? warehouse.toObject() : warehouse;
  return {
    ...doc,
    assignedStorekeepers: Array.isArray(doc?.assignedStorekeepers)
      ? doc.assignedStorekeepers.map((user) => ({
          _id: user?._id,
          name: user?.name || '',
          email: user?.email || '',
          role: user?.role || '',
          isActive: user?.isActive !== false,
        }))
      : [],
  };
};

const sanitizeAssignedStorekeepers = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const buildWarehousePayload = (body = {}) => {
  const payload = { ...body };
  payload.assignedStorekeepers = sanitizeAssignedStorekeepers(body.assignedStorekeepers);
  return payload;
};

exports.createWarehouse = async (req, res) => {
  try {
    const warehouse = new Warehouse(buildWarehousePayload(req.body));
    await warehouse.save();
    await warehouse.populate(WAREHOUSE_POPULATE);
    res.status(201).json(toWarehouseResponse(warehouse));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getAllWarehouses = async (req, res) => {
  try {
    const normalizedRole = normalizeRole(req.user?.role || '');
    const query = {};

    if (normalizedRole === 'storekeeper') {
      query.assignedStorekeepers = req.user?._id;
    }

    const warehouses = await Warehouse.find(query)
      .populate(WAREHOUSE_POPULATE)
      .sort({ name: 1 });

    res.json(warehouses.map(toWarehouseResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).populate(WAREHOUSE_POPULATE);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    res.json(toWarehouseResponse(warehouse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      buildWarehousePayload(req.body),
      { new: true, runValidators: true }
    ).populate(WAREHOUSE_POPULATE);

    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    res.json(toWarehouseResponse(warehouse));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addWarehouseBlock = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    const { name, capacity } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Block name is required' });
    warehouse.blocks.push({ name: String(name).trim(), capacity: capacity ? Number(capacity) : undefined });
    await warehouse.save();
    await warehouse.populate(WAREHOUSE_POPULATE);
    res.json(toWarehouseResponse(warehouse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteWarehouseBlock = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);
    if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
    warehouse.blocks = warehouse.blocks.filter((b) => String(b._id) !== String(req.params.blockId));
    await warehouse.save();
    await warehouse.populate(WAREHOUSE_POPULATE);
    res.json(toWarehouseResponse(warehouse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAssignableStorekeepers = async (_req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('_id name email role isActive')
      .sort({ name: 1 })
      .lean();

    // Both StoreKeeper and Warehouse Manager roles are scoped to their assigned warehouse(s) via
    // this same list on the frontend (see isContainerVisibleForUser) — a Warehouse Manager left
    // out of this picker can never be assigned a warehouse, so they see zero container data
    // regardless of what Access Control permissions/menu access they're granted.
    const assignableRoles = new Set(['storekeeper', 'warehouse']);
    const storekeepers = users.filter((user) => assignableRoles.has(normalizeRole(user.role)));
    res.json({
      users: storekeepers.map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive !== false,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
