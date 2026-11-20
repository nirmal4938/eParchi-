const express = require("express");
const Parchi = require("../models/Parchi");
const InventoryItem = require("../models/InventoryItem");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const dateInIndia = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    const startOfDay = new Date(`${dateInIndia}T00:00:00+05:30`);
    const lowStockFilter = { tenantId: req.tenantId, trackStock: { $ne: false }, stockQty: { $lte: 5 } };
    const [revenue, totalParchis, lowStockCount, lowStockItems] = await Promise.all([
      Parchi.aggregate([
        { $match: { tenantId: req.tenantId, createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } }
      ]),
      Parchi.countDocuments({ tenantId: req.tenantId }),
      InventoryItem.countDocuments(lowStockFilter),
      InventoryItem.find(lowStockFilter).select("name stockQty unitPrice category").sort({ stockQty: 1, name: 1 }).limit(10).lean()
    ]);

    res.json({
      todayRevenue: revenue[0] ? revenue[0].total : 0,
      totalParchis,
      lowStockCount,
      lowStockItems,
      lowStockThreshold: 5
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
