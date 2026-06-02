const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema(
  {
    /**
     * Bank name or "Direct" for the default fallback rate.
     * "Direct" is the system default when no bank is selected.
     */
    bankName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    /**
     * Exchange rate: how many AED per 1 USD.
     * e.g. 3.67 means 1 USD = 3.67 AED
     */
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);
