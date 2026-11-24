const express = require("express");
const crypto = require("crypto");
const Parchi = require("../models/Parchi");
const Tenant = require("../models/Tenant");
const { authenticate } = require("../middleware/auth");
const {
  default: generateInvoiceBuffer,
} = require("../utils/generateInvoicePdf");
const { default: mongoose } = require("mongoose");
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

async function safeParseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawResponse: text };
  }
}

// Helper: Normalize 10-digit Indian mobile numbers (strips +91, 91, or leading 0)
function normalizeIndianPhone(rawPhone) {
  let digits = String(rawPhone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? digits : null;
}

router.post("/send", authenticate, async (req, res, next) => {
  const { parchiId, phone, useTemplate } = req.body;

  // 1. Validate Request Input
  if (!parchiId || !mongoose.Types.ObjectId.isValid(parchiId)) {
    return res.status(400).json({
      success: false,
      step: "validation",
      error: "A valid Parchi ID is required.",
    });
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  if (!token || !phoneNumberId) {
    console.error(
      "[WhatsApp Config Error] Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID",
    );
    return res.status(503).json({
      success: false,
      available: false,
      method: "cloud_api",
      error: "WhatsApp Cloud API is not configured on this server.",
    });
  }

  const baseUrl = `https://facebook.com{apiVersion}/${phoneNumberId}`;

  try {
    // 2. Fetch Bill & Tenant Data
    const [parchi, tenant] = await Promise.all([
      Parchi.findOne({ _id: parchiId, tenantId: req.tenantId }).lean(),
      Tenant.findById(req.tenantId).lean(),
    ]);

    if (!parchi) {
      return res.status(404).json({
        success: false,
        step: "database_lookup",
        error: "Bill not found in this business.",
      });
    }

    // 3. Validate Recipient Phone Number
    const targetPhone = normalizeIndianPhone(phone || parchi.clientPhone);
    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        step: "phone_validation",
        error: "A valid 10-digit Indian mobile number is required.",
      });
    }

    const formattedRecipient = `91${targetPhone}`;

    // 4. Generate PDF Buffer
    let pdfBuffer;
    try {
      pdfBuffer = await generateInvoiceBuffer(parchi, tenant);
    } catch (pdfErr) {
      console.error(`[WhatsApp PDF Error] parchiId=${parchiId}:`, pdfErr);
      return res.status(500).json({
        success: false,
        step: "pdf_generation",
        error: "Failed to generate invoice PDF.",
      });
    }

    const safeParchiNum = String(parchi.parchiNumber || "NA").trim();
    const fileName = `Invoice_${safeParchiNum}.pdf`;

    // 5. Upload PDF to WhatsApp Media API
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", "application/pdf");
    formData.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      fileName,
    );

    const uploadRes = await fetch(`${baseUrl}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const uploadData = await safeParseJson(uploadRes);

    if (!uploadRes.ok || !uploadData.id) {
      console.error(
        `[WhatsApp Media Upload Error] parchiId=${parchiId} status=${uploadRes.status}:`,
        uploadData,
      );
      return res.status(502).json({
        success: false,
        step: "media_upload",
        error:
          uploadData.error?.message ||
          "Failed to upload invoice PDF to WhatsApp.",
        metaCode: uploadData.error?.code || null,
        details: uploadData,
      });
    }

    // 6. Build Message Payload (Ensure no empty strings for Meta template params)
    const isTemplateReady = useTemplate !== false;
    const clientName =
      String(parchi.clientName || "Customer").trim() || "Customer";
    const businessName =
      String(tenant?.businessName || "Our Store").trim() || "Our Store";
    const formattedTotal = Number(parchi.grandTotal || 0).toFixed(2);
    const paymentMode = String(parchi.paymentMode || "Cash").trim() || "Cash";

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
                  { type: "text", text: clientName },
                  { type: "text", text: safeParchiNum },
                  { type: "text", text: businessName },
                  { type: "text", text: formattedTotal },
                  { type: "text", text: paymentMode },
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
            caption: `Hello ${clientName}, here is your bill #${safeParchiNum} for Rs. ${formattedTotal}.`,
          },
        };

    // 7. Send Message via WhatsApp Cloud API
    const sendRes = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const sendData = await safeParseJson(sendRes);

    if (!sendRes.ok) {
      console.error(
        `[WhatsApp Message Send Error] parchiId=${parchiId} to=${formattedRecipient} status=${sendRes.status}:`,
        sendData,
      );
      return res.status(502).json({
        success: false,
        step: "message_send",
        error: sendData.error?.message || "WhatsApp Cloud API delivery failed.",
        metaCode: sendData.error?.code || null,
        details: sendData,
      });
    }

    // 8. Success Response
    return res.json({
      success: true,
      method: "cloud_api",
      messageId: sendData.messages?.[0]?.id || null,
      mediaId: uploadData.id,
      recipient: formattedRecipient,
    });
  } catch (error) {
    // Handle fetch network/timeout errors cleanly instead of generic 500
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      console.error(`[WhatsApp Timeout Error] parchiId=${parchiId}:`, error);
      return res.status(504).json({
        success: false,
        step: "network_timeout",
        error: "WhatsApp API request timed out. Please try again.",
      });
    }

    if (
      error.cause?.code === "ENOTFOUND" ||
      error.cause?.code === "ECONNREFUSED"
    ) {
      console.error(
        `[WhatsApp Network Error] parchiId=${parchiId}:`,
        error.cause,
      );
      return res.status(502).json({
        success: false,
        step: "network_connection",
        error: `Unable to reach WhatsApp servers (${error.cause.code}).`,
      });
    }

    console.error(`[WhatsApp Unexpected Error] parchiId=${parchiId}:`, error);
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
