const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Parchi = require("../models/Parchi");
const InventoryItem = require("../models/InventoryItem");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const parchis = await Parchi.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ parchis });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const { clientName, clientPhone, clientExtra, items, discount, paymentMode } = req.body;
  if (!String(clientName || "").trim() || !Array.isArray(items) || items.length === 0 || !String(paymentMode || "").trim()) {
    return res.status(400).json({ error: "Client name, at least one item, and payment mode are required." });
  }
  if (items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    return res.status(400).json({ error: "Every Parchi item must be an object." });
  }

  const normalizedItems = items.map((item) => ({
    inventoryItemId: item.inventoryItemId || null,
    name: String(item.name || item.description || "").trim(),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice === undefined ? item.rate : item.unitPrice)
  }));
  if (normalizedItems.some((item) =>
    !Number.isFinite(item.quantity) || item.quantity <= 0 ||
    (item.inventoryItemId
      ? typeof item.inventoryItemId !== "string" || !mongoose.isValidObjectId(item.inventoryItemId)
      : !item.name || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)
  )) {
    return res.status(400).json({ error: "Each item needs a valid name, quantity, and price; inventory items must have a valid ID." });
  }

  const safeDiscount = discount === undefined ? 0 : Number(discount);
  if (!Number.isFinite(safeDiscount) || safeDiscount < 0) {
    return res.status(400).json({ error: "Discount must be a non-negative amount." });
  }

  let session;
  let createdParchi;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const savedItems = [];
      for (const item of normalizedItems) {
        if (!item.inventoryItemId) {
          savedItems.push({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice });
          continue;
        }

        const inventoryItem = await InventoryItem.findOne({
          _id: item.inventoryItemId,
          tenantId: req.tenantId
        }).session(session);
        if (!inventoryItem) {
          const error = new Error("An inventory item was not found in this business.");
          error.code = "INVENTORY_ITEM_NOT_FOUND";
          throw error;
        }
        if (inventoryItem.trackStock) {
          const deduction = await InventoryItem.updateOne({
            _id: inventoryItem._id,
            tenantId: req.tenantId,
            stockQty: { $gte: item.quantity }
          }, {
            $inc: { stockQty: -item.quantity }
          }, { session });
          if (deduction.matchedCount !== 1) {
            const error = new Error(`${inventoryItem.name} does not have enough stock.`);
            error.code = "INSUFFICIENT_STOCK";
            throw error;
          }
        }
        savedItems.push({
          inventoryItemId: inventoryItem._id,
          name: inventoryItem.name,
          quantity: item.quantity,
          unitPrice: inventoryItem.unitPrice
        });
      }

      const subtotal = savedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      if (!Number.isFinite(subtotal) || safeDiscount > subtotal) {
        const error = new Error("Discount must be a valid amount no greater than the subtotal.");
        error.code = "INVALID_DISCOUNT";
        throw error;
      }

      const now = new Date();
      createdParchi = new Parchi({
        tenantId: req.tenantId,
        createdByUserId: req.user._id,
        parchiNumber: `EP-${now.getFullYear()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
        clientName: String(clientName).trim(),
        clientPhone: String(clientPhone || "").trim(),
        clientExtra: clientExtra === undefined ? [] : clientExtra,
        items: savedItems,
        subtotal,
        discount: safeDiscount,
        grandTotal: Math.max(0, subtotal - safeDiscount),
        paymentMode: String(paymentMode).trim(),
        createdAt: now
      });
      await createdParchi.save({ session });
    });
    res.status(201).json({ parchi: createdParchi });
  } catch (error) {
    if (error.code === "INSUFFICIENT_STOCK") return res.status(409).json({ error: error.message });
    if (error.code === "INVENTORY_ITEM_NOT_FOUND") return res.status(404).json({ error: error.message });
    if (error.code === "INVALID_DISCOUNT" || error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid inventory item ID." });
    next(error);
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
