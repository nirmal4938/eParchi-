const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  skuOrCode: { type: String, trim: true, default: "", maxlength: 100 },
  category: { type: String, trim: true, default: "", maxlength: 100 },
  stockQty: { type: Number, min: 0, default: 0 },
  unitPrice: { type: Number, min: 0, required: true },
  trackStock: { type: Boolean, default: true },
  extraMeta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

inventoryItemSchema.index({ tenantId: 1, skuOrCode: 1 }, { unique: true, partialFilterExpression: { skuOrCode: { $gt: "" } } });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
