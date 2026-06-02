const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, unique:true, required:true },
  year: { type: Number, required:true },
  orderDate: { type: Date, required:true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref:"Supplier", required:true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref:"Item", required:true },
  totalOrderedQtyMT: { type: Number, required:true },
  status: { type: String, enum:["Open","Closed","Cancelled"], default:"Open" }
}, { timestamps:true });

module.exports = mongoose.model("PurchaseOrder", purchaseOrderSchema);
