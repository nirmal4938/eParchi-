const PDFDocument = require("pdfkit");

function generateInvoiceBuffer(parchi, tenant) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // --- Header (Business Details) ---
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(tenant.businessName || "INVOICE", { align: "left" });

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text(tenant.address || "", { align: "left" })
      .text(tenant.phone ? `Phone: ${tenant.phone}` : "", { align: "left" })
      .text(tenant.gstNumber ? `GSTIN: ${tenant.gstNumber}` : "", {
        align: "left",
      });

    doc.moveDown(1.5);

    // --- Invoice & Client Meta ---
    const metaTop = doc.y;
    doc
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Billed To:", 40, metaTop)
      .font("Helvetica")
      .text(parchi.clientName, 40, metaTop + 16)
      .text(
        parchi.clientPhone ? `Phone: +91 ${parchi.clientPhone}` : "",
        40,
        metaTop + 32,
      );

    doc
      .font("Helvetica-Bold")
      .text(`Invoice #: ${parchi.parchiNumber}`, 350, metaTop, {
        align: "right",
      })
      .font("Helvetica")
      .text(
        `Date: ${new Date(parchi.createdAt).toLocaleDateString("en-IN")}`,
        350,
        metaTop + 16,
        { align: "right" },
      )
      .text(`Payment Mode: ${parchi.paymentMode}`, 350, metaTop + 32, {
        align: "right",
      });

    doc.moveDown(3);

    // --- Items Table Header ---
    const tableTop = doc.y;
    doc
      .rect(40, tableTop, 515, 22)
      .fill("#f2f4f7")
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .fontSize(10);

    doc.text("#", 48, tableTop + 6);
    doc.text("Item Description", 75, tableTop + 6);
    doc.text("Qty", 330, tableTop + 6, { width: 50, align: "right" });
    doc.text("Rate (Rs.)", 390, tableTop + 6, { width: 70, align: "right" });
    doc.text("Amount (Rs.)", 470, tableTop + 6, { width: 75, align: "right" });

    // --- Items Rows ---
    let y = tableTop + 28;
    doc.font("Helvetica").fontSize(10);

    parchi.items.forEach((item, index) => {
      const lineTotal = item.quantity * item.unitPrice;
      doc.text(index + 1, 48, y);
      doc.text(item.name, 75, y, { width: 245 });
      doc.text(item.quantity.toString(), 330, y, { width: 50, align: "right" });
      doc.text(item.unitPrice.toFixed(2), 390, y, {
        width: 70,
        align: "right",
      });
      doc.text(lineTotal.toFixed(2), 470, y, { width: 75, align: "right" });

      y += 22;
      doc
        .moveTo(40, y - 5)
        .lineTo(555, y - 5)
        .strokeColor("#eeeeee")
        .stroke();
    });

    // --- Totals Section ---
    y += 10;
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text("Subtotal:", 380, y, { width: 80, align: "right" });
    doc.text(`Rs. ${parchi.subtotal.toFixed(2)}`, 470, y, {
      width: 75,
      align: "right",
    });

    if (parchi.discount > 0) {
      y += 18;
      doc.text("Discount:", 380, y, { width: 80, align: "right" });
      doc.text(`- Rs. ${parchi.discount.toFixed(2)}`, 470, y, {
        width: 75,
        align: "right",
      });
    }

    y += 22;
    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Grand Total:", 360, y, { width: 100, align: "right" });
    doc.text(`Rs. ${parchi.grandTotal.toFixed(2)}`, 470, y, {
      width: 75,
      align: "right",
    });

    // --- Footer ---
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#777777")
      .text(
        "Thank you for your business! This is a computer-generated invoice.",
        40,
        750,
        {
          align: "center",
        },
      );

    doc.end();
  });
}

module.exports = { generateInvoiceBuffer };
