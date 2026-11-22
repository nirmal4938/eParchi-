const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const InventoryItem = require("../models/InventoryItem");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const DEMO_TENANT_KEY = "eparchi-mobile-shop-v1";
const DEMO_USERS = {
  owner: { name: "Demo Owner", email: "demo-owner@eparchi.test" },
  staff: { name: "Demo Staff", email: "demo-staff@eparchi.test" }
};
const DEMO_INVENTORY = [
  { name: "Smartphone X 128 GB", skuOrCode: "DEMO-PHONE-X128", category: "Mobile phones", stockQty: 8, unitPrice: 64999, trackStock: true },
  { name: "Android Pro 256 GB", skuOrCode: "DEMO-ANDROID-PRO256", category: "Mobile phones", stockQty: 6, unitPrice: 42999, trackStock: true },
  { name: "USB-C Fast Charger 30 W", skuOrCode: "DEMO-CHARGER-30W", category: "Accessories", stockQty: 15, unitPrice: 1499, trackStock: true },
  { name: "Protective Phone Case", skuOrCode: "DEMO-CASE-CLEAR", category: "Accessories", stockQty: 20, unitPrice: 799, trackStock: true },
  { name: "Wireless Earbuds", skuOrCode: "DEMO-EARBUDS-WL", category: "Accessories", stockQty: 10, unitPrice: 2499, trackStock: true }
];
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function issueSession(user, res) {
  const token = jwt.sign(
    { sub: String(user._id), tenantId: String(user.tenantId), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("eparchi_session", token, cookieOptions);
  return token;
}

function safeUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId };
}

function validDemoImage(value) {
  return typeof value === "string" && value.length <= 500000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

router.post("/register-tenant", async (req, res, next) => {
  const { businessName, businessType, phone, regNumber, address, upiId, name, email, password } = req.body;
  if (!businessName || !name || !email || !password || !phone || !["shop", "clinic", "coaching"].includes(businessType)) {
    return res.status(400).json({ error: "Business name, type, phone, owner name, email, and password are required." });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (Object.values(DEMO_USERS).some((demoUser) => demoUser.email === String(email).trim().toLowerCase())) {
    return res.status(409).json({ error: "That email address is reserved for the eParchi demo." });
  }

  let tenant;
  let user;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    tenant = await Tenant.create({ businessName, businessType, phone, regNumber, address, upiId });
    user = await User.create({
      tenantId: tenant._id,
      name,
      email,
      passwordHash,
      role: "owner"
    });
    const token = issueSession(user, res);
    res.status(201).json({ token, user: safeUser(user), tenant });
  } catch (error) {
    if (tenant) {
      try {
        if (user) await User.deleteOne({ _id: user._id });
        await Tenant.deleteOne({ _id: tenant._id });
      } catch (cleanupError) {
        return next(cleanupError);
      }
    }
    if (error.code === 11000) return res.status(409).json({ error: "An account with that email already exists." });
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    if (!email || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const user = await User.findOne({ email }).select("+passwordHash");
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Email or password is incorrect." });
    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant) return res.status(401).json({ error: "This business account is unavailable." });
    const token = issueSession(user, res);
    res.json({ token, user: safeUser(user), tenant });
  } catch (error) {
    next(error);
  }
});

router.post("/demo", async (req, res, next) => {
  const { role, branding } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(DEMO_USERS, role)) {
    return res.status(400).json({ error: "Choose the demo owner or staff workspace." });
  }
  if (!branding || !validDemoImage(branding.stampUrl) || !validDemoImage(branding.signatureUrl)) {
    return res.status(400).json({ error: "The demo stamp and signature images are required." });
  }

  try {
    let tenant;
    try {
      tenant = await Tenant.findOneAndUpdate(
        { demoKey: DEMO_TENANT_KEY },
        {
          $setOnInsert: {
            demoKey: DEMO_TENANT_KEY,
            businessName: "eParchi Demo Mobile Shop",
            businessType: "shop",
            phone: "9000000000",
            regNumber: "DEMO-GST-000",
            address: "21 Market Road, Pune, Maharashtra",
            upiId: "",
            branding: {
              signatureUrl: branding.signatureUrl,
              stampUrl: branding.stampUrl,
              watermarkText: "DEMO SAMPLE - NOT A TAX INVOICE",
              themeColor: "#0f766e"
            }
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      tenant = await Tenant.findOne({ demoKey: DEMO_TENANT_KEY });
      if (!tenant) throw error;
    }

    const brandingUpdates = {};
    if (!tenant.branding.signatureUrl) brandingUpdates["branding.signatureUrl"] = branding.signatureUrl;
    if (!tenant.branding.stampUrl) brandingUpdates["branding.stampUrl"] = branding.stampUrl;
    if (!tenant.branding.watermarkText) brandingUpdates["branding.watermarkText"] = "DEMO SAMPLE - NOT A TAX INVOICE";
    if (Object.keys(brandingUpdates).length) {
      tenant = await Tenant.findByIdAndUpdate(tenant._id, { $set: brandingUpdates }, { new: true, runValidators: true });
    }

    const demoUser = DEMO_USERS[role];
    let user = await User.findOne({ email: demoUser.email });
    if (!user) {
      try {
        user = await User.create({
          tenantId: tenant._id,
          name: demoUser.name,
          email: demoUser.email,
          passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12),
          role
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ email: demoUser.email });
      }
    }
    if (!user || String(user.tenantId) !== String(tenant._id) || user.role !== role) {
      return res.status(409).json({ error: "The demo account is unavailable. Contact the administrator." });
    }

    for (const item of DEMO_INVENTORY) {
      try {
        await InventoryItem.updateOne(
          { tenantId: tenant._id, skuOrCode: item.skuOrCode },
          { $setOnInsert: { tenantId: tenant._id, ...item, extraMeta: { demo: true } } },
          { upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await InventoryItem.exists({ tenantId: tenant._id, skuOrCode: item.skuOrCode });
        if (!existing) throw error;
      }
    }

    const token = issueSession(user, res);
    res.json({ token, user: safeUser(user), tenant, demo: true });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ error: "Business account not found." });
    res.json({ user: safeUser(req.user), tenant });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("eparchi_session", { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

module.exports = router;
