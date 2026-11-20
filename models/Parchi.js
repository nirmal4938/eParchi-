const mongoose = require("mongoose");

const parchiItemSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", default: null },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  quantity: { type: Number, required: true, min: 0.0001 },
  unitPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const parchiSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  parchiNumber: { type: String, required: true, trim: true },
  clientName: { type: String, required: true, trim: true, maxlength: 160 },
  clientPhone: { type: String, trim: true, default: "", maxlength: 30 },
  clientExtra: { type: mongoose.Schema.Types.Mixed, default: [] },
  items: { type: [parchiItemSchema], validate: [(items) => items.length > 0, "At least one item is required"] },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, required: true, trim: true, maxlength: 60 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

parchiSchema.index({ tenantId: 1, parchiNumber: 1 }, { unique: true });

module.exports = mongoose.model("Parchi", parchiSchema);
