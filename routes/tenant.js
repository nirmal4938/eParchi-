const express = require("express");
const bcrypt = require("bcryptjs");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

function isAllowedBrandAsset(value) {
  if (typeof value !== "string" || value.length > 500000) return false;
  if (!value) return true;
  if (value.startsWith("data:")) {
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch (error) {
    return false;
  }
}

async function updateTenantSettings(req, res, next) {
  const fields = ["businessName", "businessType", "phone", "regNumber", "address", "upiId"];
  const updates = {};
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
  });
  if (updates.businessType && !["shop", "clinic", "coaching"].includes(updates.businessType)) {
    return res.status(400).json({ error: "Business type must be shop, clinic, or coaching." });
  }
  if (req.body.branding !== undefined) {
    if (!req.body.branding || typeof req.body.branding !== "object" || Array.isArray(req.body.branding)) {
      return res.status(400).json({ error: "Branding must be an object." });
    }
    const allowed = ["logoUrl", "signatureUrl", "stampUrl", "watermarkText", "themeColor"];
    updates.branding = Object.fromEntries(
      Object.entries(req.body.branding).filter(([key]) => allowed.includes(key))
    );
    for (const key of ["logoUrl", "signatureUrl", "stampUrl"]) {
      if (updates.branding[key] !== undefined && !isAllowedBrandAsset(updates.branding[key])) {
        return res.status(400).json({ error: `${key} must be an HTTPS image URL or a PNG, JPEG, or WebP image data URL (maximum 500 KB).` });
      }
    }
  }
  try {
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, { $set: updates }, {
      new: true,
      runValidators: true
    });
    res.json({ tenant });
  } catch (error) {
    if (error.name === "ValidationError") return res.status(400).json({ error: error.message });
    next(error);
  }
}

router.patch("/", requireRole("owner"), updateTenantSettings);
router.put("/settings", requireRole("owner"), updateTenantSettings);

router.get("/staff", requireRole("owner"), async (req, res, next) => {
  try {
    const users = await User.find({ tenantId: req.tenantId }).select("name email role createdAt").sort({ createdAt: 1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post("/staff", requireRole("owner"), async (req, res, next) => {
  const { name, email, password } = req.body;
  if (!name || !email || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Name, valid email, and a password of at least 8 characters are required." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ tenantId: req.tenantId, name, email, passwordHash, role: "staff" });
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with that email already exists." });
    if (error.name === "ValidationError") return res.status(400).json({ error: error.message });
    next(error);
  }
});

router.delete("/staff/:userId", requireRole("owner"), async (req, res, next) => {
  try {
    const result = await User.deleteOne({
      _id: req.params.userId,
      tenantId: req.tenantId,
      role: "staff"
    });
    if (!result.deletedCount) return res.status(404).json({ error: "Staff member not found in this business." });
    res.status(204).end();
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid staff member ID." });
    next(error);
  }
});

module.exports = router;
