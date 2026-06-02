const TransportationCompany = require('../models/transportationCompany.model');

exports.getAll = async (req, res) => {
  try {
    const companies = await TransportationCompany.find().sort({ name: 1 });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const company = await TransportationCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Transportation company not found' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, contactPerson, phone, status } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Company name is required' });
    }
    const existing = await TransportationCompany.findOne({ name: String(name).trim() });
    if (existing) {
      return res.status(400).json({ message: 'A company with this name already exists' });
    }
    const company = await TransportationCompany.create({
      name: String(name).trim(),
      contactPerson: String(contactPerson || '').trim(),
      phone: String(phone || '').trim(),
      status: status || 'Active',
    });
    res.status(201).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, contactPerson, phone, status } = req.body;
    const company = await TransportationCompany.findById(req.params.id);
    if (!company) return res.status(404).json({ message: 'Transportation company not found' });

    if (name) company.name = String(name).trim();
    if (contactPerson !== undefined) company.contactPerson = String(contactPerson).trim();
    if (phone !== undefined) company.phone = String(phone).trim();
    if (status) company.status = status;

    await company.save();
    res.json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const company = await TransportationCompany.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ message: 'Transportation company not found' });
    res.json({ message: 'Transportation company deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
