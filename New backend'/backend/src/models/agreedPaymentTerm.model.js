const mongoose = require('mongoose');

const agreedPaymentTermsSchema = new mongoose.Schema({
  name: { type: String, unique:true, required:true },
}, { timestamps:true });

module.exports = mongoose.model("agreedPaymentTerms", agreedPaymentTermsSchema);