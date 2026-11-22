const express = require("express");
const crypto = require("crypto");
const Parchi = require("../models/Parchi");
const Tenant = require("../models/Tenant");
const { authenticate } = require("../middleware/auth");
const {
  default: generateInvoiceBuffer,
} = require("../utils/generateInvoicePdf");
// const { generateInvoiceBuffer } = require("../utils/generateInvoicePdf");

const router = express.Router();

/**
 * METHOD B: Official Meta WhatsApp Business Cloud API Integration
 */

// Webhook challenge verification for Meta App setup
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "eparchi_webhook_secret_token";
  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: "Webhook verification failed." });
});

// Webhook delivery status listener
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.get("X-Hub-Signature-256");
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    if (appSecret && signature) {
      const expected =
        "sha256=" +
        crypto.createHmac("sha256", appSecret).update(req.body).digest("hex");
      if (signature !== expected) {
        return res.status(401).json({ error: "Invalid webhook signature." });
      }
    }

    let event;
    try {
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
      event = {};
    }

    // Acknowledge Meta webhook receipt immediately
    res.status(200).json({ status: "received" });
  },
);

// Authenticated route to trigger official WhatsApp delivery
// router.post("/send", authenticate, async (req, res, next) => {
//   const { parchiId, phone, documentUrl } = req.body;
//   if (!parchiId) {
//     return res.status(400).json({ error: "Parchi ID is required." });
//   }

//   try {
//     const parchi = await Parchi.findOne({
//       _id: parchiId,
//       tenantId: req.tenantId,
//     }).lean();
//     if (!parchi) {
//       return res
//         .status(404)
//         .json({ error: "Bill not found in this business." });
//     }

//     const tenant = await Tenant.findById(req.tenantId).lean();
//     const targetPhone = String(phone || parchi.clientPhone || "").replace(
//       /\D/g,
//       "",
//     );

//     if (targetPhone.length !== 10) {
//       return res
//         .status(400)
//         .json({ error: "A valid 10-digit Indian mobile number is required." });
//     }

//     const token = process.env.WHATSAPP_TOKEN;
//     const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
//     console.log("token, phone numeber", token, phoneNumberId);
//     if (!token || !phoneNumberId) {
//       return res.status(503).json({
//         available: false,
//         method: "cloud_api",
//         error:
//           "WhatsApp Cloud API is not configured on this server. Please use Method A (Native Share Sheet) to send via WhatsApp.",
//       });
//     }

//     const formattedRecipient = `91${targetPhone}`;
//     const payload = {
//       messaging_product: "whatsapp",
//       recipient_type: "individual",
//       to: formattedRecipient,
//       type: "text",
//       text: {
//         body: `Hello ${parchi.clientName},\n\nHere is your eParchi bill from ${tenant.businessName}.\nBill No: ${parchi.parchiNumber}\nAmount: Rs. ${parchi.grandTotal.toFixed(2)}\nPayment: ${parchi.paymentMode}\n\nThank you for your business!`,
//       },
//     };

//     const response = await fetch(
//       `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(payload),
//       },
//     );

//     const result = await response.json();
//     if (!response.ok) {
//       return res.status(502).json({
//         error: result.error
//           ? result.error.message
//           : "WhatsApp Cloud API delivery failed.",
//         details: result,
//       });
//     }

//     res.json({
//       success: true,
//       method: "cloud_api",
//       messageId:
//         result.messages && result.messages[0] ? result.messages[0].id : null,
//       recipient: formattedRecipient,
//     });
//   } catch (error) {
//     next(error);
//   }
// });

router.post("/send", authenticate, async (req, res, next) => {
  const { parchiId, phone, useTemplate } = req.body;
  if (!parchiId) {
    return res.status(400).json({ error: "Parchi ID is required." });
  }

  try {
    const parchi = await Parchi.findOne({
      _id: parchiId,
      tenantId: req.tenantId,
    }).lean();
    if (!parchi) {
      return res
        .status(404)
        .json({ error: "Bill not found in this business." });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    const targetPhone = String(phone || parchi.clientPhone || "").replace(
      /\D/g,
      "",
    );

    if (targetPhone.length !== 10) {
      return res
        .status(400)
        .json({ error: "A valid 10-digit Indian mobile number is required." });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneNumberId) {
      return res.status(503).json({
        available: false,
        method: "cloud_api",
        error: "WhatsApp Cloud API is not configured on this server.",
      });
    }

    // 1. Generate PDF Buffer & Upload to WhatsApp Media API
    const pdfBuffer = await generateInvoiceBuffer(parchi, tenant);
    const fileName = `Invoice_${parchi.parchiNumber}.pdf`;

    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", "application/pdf");
    formData.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      fileName,
    );

    const uploadRes = await fetch(`https://facebook.com{phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.id) {
      return res.status(502).json({
        error: "Failed to upload invoice PDF to WhatsApp.",
        details: uploadData,
      });
    }

    // 2. Build Message Payload
    // Pass { "useTemplate": false } in request body to test directly within 24h window while template is in review
    const isTemplateReady = useTemplate !== false;
    const formattedRecipient = `91${targetPhone}`;

    const payload = isTemplateReady
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedRecipient,
          type: "template",
          template: {
            name: "invoice_receipt",
            language: { code: "en" },
            components: [
              {
                type: "header",
                parameters: [
                  {
                    type: "document",
                    document: {
                      id: uploadData.id,
                      filename: fileName,
                    },
                  },
                ],
              },
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: String(parchi.clientName || "Customer"),
                  },
                  { type: "text", text: String(parchi.parchiNumber) },
                  {
                    type: "text",
                    text: String(tenant?.businessName || "Our Store"),
                  },
                  { type: "text", text: parchi.grandTotal.toFixed(2) },
                  { type: "text", text: String(parchi.paymentMode || "Cash") },
                ],
              },
            ],
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedRecipient,
          type: "document",
          document: {
            id: uploadData.id,
            filename: fileName,
            caption: `Hello ${parchi.clientName}, here is your bill #${parchi.parchiNumber} for Rs. ${parchi.grandTotal.toFixed(2)}.`,
          },
        };

    // 3. Send Message via WhatsApp Cloud API
    const response = await fetch(
      `https://facebook.com{phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      return res.status(502).json({
        error: result.error
          ? result.error.message
          : "WhatsApp Cloud API delivery failed.",
        details: result,
      });
    }

    res.json({
      success: true,
      method: "cloud_api",
      messageId: result.messages?.[0]?.id || null,
      recipient: formattedRecipient,
    });
  } catch (error) {
    next(error);
  }
});

// GET /preview/:parchiId - Preview invoice PDF directly in browser
router.get("/preview/:parchiId", authenticate, async (req, res, next) => {
  try {
    const parchi = await Parchi.findOne({
      _id: req.params.parchiId,
      tenantId: req.tenantId,
    }).lean();

    if (!parchi) {
      return res
        .status(404)
        .json({ error: "Bill not found in this business." });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    const pdfBuffer = await generateInvoiceBuffer(parchi, tenant);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Invoice_${parchi.parchiNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
