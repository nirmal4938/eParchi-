import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const BUSINESS_MODES = {
  shop: {
    label: "Retail Store",
    client: "Customer",
    registration: "GSTIN",
  },
  clinic: {
    label: "Clinic",
    client: "Patient",
    registration: "Registration No.",
  },
  coaching: {
    label: "Coaching Institute",
    client: "Student",
    registration: "Registration No.",
  },
};

const COLORS = {
  text: "#17212B",
  heading: "#0F172A",
  secondary: "#475569",
  muted: "#64748B",
  light: "#94A3B8",
  border: "#E2E8F0",
  tableHeader: "#F1F5F9",
  alternate: "#F8FAFC",
  discount: "#DC2626",
  success: "#16A34A",
  white: "#FFFFFF",
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
};

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

function formatCurrency(value) {
  const amount = Number(value) || 0;

  return `Rs. ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatISTDateTime(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function normalizeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#0F766E";
}

function toImageBuffer(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    if (value.startsWith("data:image/")) {
      const base64 = value.split(",")[1];

      if (!base64) return null;

      return Buffer.from(base64, "base64");
    }

    return null;
  } catch {
    return null;
  }
}

async function loadImage(value) {
  const base64Buffer = toImageBuffer(value);

  if (base64Buffer) {
    return base64Buffer;
  }

  if (typeof value === "string" && /^https:\/\//i.test(value)) {
    try {
      const response = await fetch(value, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Avoid unexpectedly large image downloads.
      if (buffer.length > 5 * 1024 * 1024) {
        return null;
      }

      return buffer;
    } catch {
      return null;
    }
  }

  return null;
}

function drawWatermark(doc, text) {
  if (!text) return;

  doc.save();

  doc
    .rotate(-30, {
      origin: [PAGE.width / 2, PAGE.height / 2],
    })
    .font("Helvetica-Bold")
    .fontSize(42)
    .fillColor("#0F766E", 0.05)
    .text(String(text).toUpperCase(), 60, PAGE.height / 2, {
      width: PAGE.width - 120,
      align: "center",
      lineBreak: false,
    });

  doc.restore();
}

function drawHeader(doc, parchi, tenant, branding, mode, themeColor, images) {
  const x = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const top = 40;

  const logo = images.logo;

  let businessY = top;

  if (logo) {
    try {
      doc.image(logo, x, top, {
        fit: [100, 55],
        align: "left",
        valign: "center",
      });

      businessY += 62;
    } catch {
      // Continue without an invalid logo.
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(19)
    .fillColor(COLORS.heading)
    .text(tenant.businessName || "Business", x, businessY, {
      width: 330,
    });

  let detailY = doc.y + 5;

  const details = [
    tenant.address || "",
    tenant.phone ? `Phone: +91 ${tenant.phone}` : "",
    tenant.regNumber ? `${mode.registration}: ${tenant.regNumber}` : "",
  ].filter(Boolean);

  details.forEach((detail) => {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.secondary)
      .text(detail, x, detailY, {
        width: 330,
      });

    detailY = doc.y + 3;
  });

  // Business type badge.
  const badgeText = mode.label.toUpperCase();
  const badgeWidth = Math.max(85, doc.widthOfString(badgeText) + 20);

  doc.roundedRect(right - badgeWidth, top, badgeWidth, 22, 5).fill(themeColor);

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.white)
    .text(badgeText, right - badgeWidth, top + 7, {
      width: badgeWidth,
      align: "center",
    });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text("Parchi No.", right - 160, top + 34, {
      width: 160,
      align: "right",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.heading)
    .text(parchi.parchiNumber || "N/A", right - 180, top + 48, {
      width: 180,
      align: "right",
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(formatISTDateTime(parchi.createdAt), right - 180, top + 66, {
      width: 180,
      align: "right",
    });

  const ruleY = Math.max(doc.y, detailY) + 18;

  doc
    .moveTo(x, ruleY)
    .lineTo(right, ruleY)
    .lineWidth(3)
    .strokeColor(themeColor)
    .stroke();

  return ruleY + 18;
}

function drawClientInfo(doc, parchi, mode, startY) {
  const x = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`BILLED TO (${mode.client.toUpperCase()})`, x, startY);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.heading)
    .text(parchi.clientName || "Customer", x, startY + 16, {
      width: 300,
    });

  let clientY = doc.y + 3;

  if (parchi.clientPhone) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.secondary)
      .text(`+91 ${parchi.clientPhone}`, x, clientY);

    clientY = doc.y + 3;
  }

  const extraFields = Array.isArray(parchi.clientExtra)
    ? parchi.clientExtra
    : [];

  extraFields
    .filter((field) => field && field.value)
    .forEach((field) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#1E293B")
        .text(`${field.label || "Details"}: `, x, clientY, {
          continued: true,
        })
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.secondary)
        .text(String(field.value), {
          width: 300,
        });

      clientY = doc.y + 3;
    });

  // Payment information on the right.
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("PAYMENT MODE", right - 170, startY, {
      width: 170,
      align: "right",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.heading)
    .text(parchi.paymentMode || "N/A", right - 170, startY + 17, {
      width: 170,
      align: "right",
    });

  return Math.max(clientY, startY + 45) + 15;
}

function drawTableHeader(doc, y) {
  const x = PAGE.margin;

  doc.rect(x, y, CONTENT_WIDTH, 28).fill(COLORS.tableHeader);

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155");

  doc.text("Item / Service", x + 12, y + 9, {
    width: 205,
  });

  doc.text("Qty", x + 217, y + 9, {
    width: 45,
    align: "center",
  });

  doc.text("Rate", x + 270, y + 9, {
    width: 90,
    align: "right",
  });

  doc.text("Amount", x + 370, y + 9, {
    width: 95,
    align: "right",
  });

  return y + 28;
}

function drawItemsTable(doc, items, startY) {
  const x = PAGE.margin;
  const bottomLimit = PAGE.height - 90;

  let y = drawTableHeader(doc, startY);

  doc.font("Helvetica").fontSize(9);

  items.forEach((item, index) => {
    const name = String(item.name || "Item");

    const lineTotal =
      (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

    const nameHeight = doc.heightOfString(name, {
      width: 195,
      font: "Helvetica",
      fontSize: 9,
    });

    const rowHeight = Math.max(34, nameHeight + 18);

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      drawWatermark(doc, doc._watermarkText);
      y = drawTableHeader(doc, 45);
    }

    if (index % 2 === 1) {
      doc.rect(x, y, CONTENT_WIDTH, rowHeight).fill(COLORS.alternate);
    }

    const textY = y + 10;

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.text)
      .text(name, x + 12, textY, {
        width: 195,
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.secondary)
      .text(String(item.quantity), x + 217, textY, {
        width: 45,
        align: "center",
      });

    doc.text(formatCurrency(item.unitPrice), x + 270, textY, {
      width: 90,
      align: "right",
    });

    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.text)
      .text(formatCurrency(lineTotal), x + 370, textY, {
        width: 95,
        align: "right",
      });

    y += rowHeight;

    doc
      .moveTo(x, y)
      .lineTo(x + CONTENT_WIDTH, y)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();
  });

  return y;
}

function drawTotals(doc, parchi, startY, themeColor) {
  const x = PAGE.width - PAGE.margin - 205;
  const width = 205;

  let y = startY + 15;

  const drawRow = (label, value, color = COLORS.secondary, bold = false) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(color)
      .text(label, x, y, {
        width: 100,
      });

    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .text(value, x + 100, y, {
        width: 105,
        align: "right",
      });

    y += 21;
  };

  drawRow("Subtotal", formatCurrency(parchi.subtotal));

  if (Number(parchi.discount) > 0) {
    drawRow("Discount", `-${formatCurrency(parchi.discount)}`, COLORS.discount);
  }

  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineWidth(1.5)
    .strokeColor(COLORS.border)
    .stroke();

  y += 12;

  drawRow("Grand Total", formatCurrency(parchi.grandTotal), themeColor, true);

  return y;
}

function drawPaymentQR(doc, tenant, qrBuffer, startY, parchi) {
  if (!qrBuffer) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLORS.light)
      .text("Thank you for your business!", PAGE.margin, startY + 10);

    return;
  }

  doc.image(qrBuffer, PAGE.margin, startY, {
    width: 75,
    height: 75,
  });

  const x = PAGE.margin + 88;

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("SCAN TO PAY VIA UPI", x, startY + 8);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.heading)
    .text(tenant.upiId, x, startY + 24, {
      width: 145,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.success)
    .text(formatCurrency(parchi.grandTotal), x, startY + 44);
}

function drawSignatureFooter(doc, images, startY) {
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;

  if (images.stamp) {
    try {
      doc.image(images.stamp, left, startY, {
        fit: [100, 75],
        align: "center",
        valign: "center",
      });
    } catch {
      // Ignore invalid stamp.
    }
  }

  if (images.signature) {
    try {
      doc.image(images.signature, right - 140, startY - 5, {
        fit: [130, 50],
        align: "center",
      });
    } catch {
      // Ignore invalid signature.
    }
  }

  doc
    .moveTo(right - 140, startY + 53)
    .lineTo(right, startY + 53)
    .dash(3, { space: 2 })
    .strokeColor("#CBD5E1")
    .stroke()
    .undash();

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Authorized Signatory", right - 140, startY + 59, {
      width: 140,
      align: "right",
    });
}

function drawFooter(doc) {
  const y = PAGE.height - 38;

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.light)
    .text("Generated digitally via eParchi", PAGE.margin, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
}

async function generateInvoiceBuffer(parchi, tenant) {
  if (!parchi || !tenant) {
    throw new Error("Parchi and tenant are required to generate PDF.");
  }

  if (!Array.isArray(parchi.items) || parchi.items.length === 0) {
    throw new Error("At least one item is required to generate PDF.");
  }

  const branding = tenant.branding || {};

  const mode = BUSINESS_MODES[tenant.businessType] || BUSINESS_MODES.shop;

  const themeColor = normalizeColor(branding.themeColor);

  // Load branding images concurrently.
  const [logo, stamp, signature] = await Promise.all([
    loadImage(branding.logoUrl),
    loadImage(branding.stampUrl),
    loadImage(branding.signatureUrl),
  ]);

  const images = {
    logo,
    stamp,
    signature,
  };

  // Generate UPI QR.
  let qrBuffer = null;

  if (tenant.upiId) {
    try {
      const upiParams = new URLSearchParams({
        pa: tenant.upiId,
        pn: tenant.businessName || "",
        am: Number(parchi.grandTotal || 0).toFixed(2),
        cu: "INR",
        tn: parchi.parchiNumber || "",
      });

      const upiUrl = `upi://pay?${upiParams.toString()}`;

      qrBuffer = await QRCode.toBuffer(upiUrl, {
        type: "png",
        width: 300,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    } catch (error) {
      console.error("UPI QR generation failed:", error.message);
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: {
        top: PAGE.margin,
        bottom: PAGE.margin,
        left: PAGE.margin,
        right: PAGE.margin,
      },
      bufferPages: true,
      compress: true,
    });

    const buffers = [];

    doc._watermarkText = branding.watermarkText || "";

    doc.on("data", (chunk) => buffers.push(chunk));

    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });

    doc.on("error", reject);

    try {
      // Watermark behind the receipt content.
      drawWatermark(doc, branding.watermarkText);

      // Header.
      let y = drawHeader(
        doc,
        parchi,
        tenant,
        branding,
        mode,
        themeColor,
        images,
      );

      // Client information.
      y = drawClientInfo(doc, parchi, mode, y);

      // Items table.
      const tableEndY = drawItemsTable(doc, parchi.items, y);

      let totalsY = tableEndY;

      // Avoid separating totals from the footer.
      if (totalsY > PAGE.height - 230) {
        doc.addPage();
        drawWatermark(doc, branding.watermarkText);
        totalsY = 45;
      }

      // Totals.
      const totalsEndY = drawTotals(doc, parchi, totalsY, themeColor);

      // Payment QR.
      const footerStartY = Math.max(totalsEndY + 12, totalsY + 15);

      // Move payment section to another page if necessary.
      let paymentY = footerStartY;

      if (paymentY + 150 > PAGE.height - 65) {
        doc.addPage();
        drawWatermark(doc, branding.watermarkText);
        paymentY = 50;
      }

      drawPaymentQR(doc, tenant, qrBuffer, paymentY, parchi);

      // Stamp and signature.
      drawSignatureFooter(doc, images, paymentY + 95);

      // Add footer to every page.
      const range = doc.bufferedPageRange();

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc);
      }

      doc.end();
    } catch (error) {
      reject(error);

      if (!doc._ended) {
        doc.end();
      }
    }
  });
}
export default generateInvoiceBuffer;
