const ExchangeRate = require('../models/exchangeRate.model');

const DEFAULT_RATE = 3.67;

/** Ensure the "Direct" default entry always exists */
async function ensureDirectRate() {
  const existing = await ExchangeRate.findOne({ bankName: 'Direct' });
  if (!existing) {
    await ExchangeRate.create({
      bankName: 'Direct',
      rate: DEFAULT_RATE,
      isDefault: true,
      status: 'Active',
    });
  }
}

exports.getAll = async (req, res) => {
  try {
    await ensureDirectRate();
    const rates = await ExchangeRate.find().sort({ isDefault: -1, bankName: 1 });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getActive = async (req, res) => {
  try {
    await ensureDirectRate();
    const rates = await ExchangeRate.find({ status: 'Active' }).sort({ isDefault: -1, bankName: 1 });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const rate = await ExchangeRate.findById(req.params.id);
    if (!rate) return res.status(404).json({ message: 'Exchange rate not found' });
    res.json(rate);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { bankName, rate, status } = req.body;
    if (!bankName || !String(bankName).trim()) {
      return res.status(400).json({ message: 'Bank name is required' });
    }
    if (rate == null || isNaN(Number(rate)) || Number(rate) <= 0) {
      return res.status(400).json({ message: 'A valid positive exchange rate is required' });
    }
    const existing = await ExchangeRate.findOne({ bankName: String(bankName).trim() });
    if (existing) {
      return res.status(400).json({ message: `An exchange rate for "${bankName}" already exists` });
    }
    const entry = await ExchangeRate.create({
      bankName: String(bankName).trim(),
      rate: Number(rate),
      isDefault: false,
      status: status || 'Active',
    });
    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { bankName, rate, status } = req.body;
    const entry = await ExchangeRate.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Exchange rate not found' });

    if (bankName && !entry.isDefault) {
      entry.bankName = String(bankName).trim();
    }
    if (rate != null && !isNaN(Number(rate)) && Number(rate) > 0) {
      entry.rate = Number(rate);
    }
    if (status) entry.status = status;

    await entry.save();
    res.json(entry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const entry = await ExchangeRate.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Exchange rate not found' });
    if (entry.isDefault) {
      return res.status(400).json({ message: 'The Direct (default) exchange rate cannot be deleted' });
    }
    await ExchangeRate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Exchange rate deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
