const express = require("express");
const InventoryItem = require("../models/InventoryItem");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

const editableFields = ["name", "skuOrCode", "category", "stockQty", "unitPrice", "trackStock", "extraMeta"];

router.get("/", async (req, res, next) => {
  try {
    const items = await InventoryItem.find({ tenantId: req.tenantId }).sort({ name: 1 });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const item = await InventoryItem.create({
      tenantId: req.tenantId,
      name: req.body.name,
      skuOrCode: req.body.skuOrCode,
      category: req.body.category,
      stockQty: req.body.stockQty,
      unitPrice: req.body.unitPrice,
      trackStock: req.body.trackStock,
      extraMeta: req.body.extraMeta
    });
    res.status(201).json({ item });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That SKU or code is already used in this business." });
    if (error.name === "ValidationError") return res.status(400).json({ error: error.message });
    next(error);
  }
});

router.patch("/:itemId", async (req, res, next) => {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => editableFields.includes(key))
  );
  try {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.itemId, tenantId: req.tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "Inventory item not found." });
    res.json({ item });
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid inventory item ID." });
    if (error.code === 11000) return res.status(409).json({ error: "That SKU or code is already used in this business." });
    if (error.name === "ValidationError") return res.status(400).json({ error: error.message });
    next(error);
  }
});

router.delete("/:itemId", async (req, res, next) => {
  try {
    const result = await InventoryItem.deleteOne({ _id: req.params.itemId, tenantId: req.tenantId });
    if (!result.deletedCount) return res.status(404).json({ error: "Inventory item not found." });
    res.status(204).end();
  } catch (error) {
    if (error.name === "CastError") return res.status(400).json({ error: "Invalid inventory item ID." });
    next(error);
  }
});

module.exports = router;
