const mongoose = require("mongoose");

const brandingSchema = new mongoose.Schema({
  logoUrl: { type: String, trim: true, default: "", maxlength: 500000 },
  signatureUrl: { type: String, trim: true, default: "", maxlength: 500000 },
  stampUrl: { type: String, trim: true, default: "", maxlength: 500000 },
  watermarkText: { type: String, trim: true, default: "", maxlength: 100 },
  themeColor: { type: String, trim: true, default: "#0f766e", match: /^#[0-9a-fA-F]{6}$/ }
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  demoKey: { type: String, unique: true, sparse: true, select: false },
  businessName: { type: String, required: true, trim: true, maxlength: 120 },
  businessType: { type: String, enum: ["shop", "clinic", "coaching"], required: true },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  regNumber: { type: String, trim: true, default: "", maxlength: 100 },
  address: { type: String, trim: true, default: "", maxlength: 300 },
  upiId: { type: String, trim: true, default: "", maxlength: 100 },
  branding: { type: brandingSchema, default: () => ({}) }
}, { timestamps: true });

module.exports = mongoose.model("Tenant", tenantSchema);
