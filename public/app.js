(() => {
  "use strict";

  const MODES = {
    shop: {
      label: "General Shop",
      registration: "Reg. / GST No.",
      client: "Customer",
      extra: [
        { name: "imei", label: "IMEI / Serial number", placeholder: "Device IMEI or serial number" },
        { name: "clientAddress", label: "Customer address", placeholder: "Street, area, city" }
      ]
    },
    clinic: {
      label: "Clinic / Doctor",
      registration: "MCI / Reg. No.",
      client: "Patient",
      extra: [
        { name: "age", label: "Age", placeholder: "Age in years", type: "number" },
        { name: "gender", label: "Gender", placeholder: "Select gender", options: ["Female", "Male", "Other"] },
        { name: "symptoms", label: "Symptoms / notes", placeholder: "Brief symptoms or notes", wide: true }
      ]
    },
    institute: {
      label: "Coaching / Institute",
      registration: "Institute / Reg. No.",
      client: "Student",
      extra: [
        { name: "course", label: "Course", placeholder: "Course name" },
        { name: "batch", label: "Class / Batch", placeholder: "Class or batch" }
      ]
    }
  };

  const form = document.getElementById("parchiForm");
  const createView = document.getElementById("createView");
  const historyView = document.getElementById("historyView");
  const receiptPage = document.getElementById("receiptPage");
  const dynamicFields = document.getElementById("dynamicFields");
  const lineItems = document.getElementById("lineItems");
  const notice = document.getElementById("appNotice");
  const historySearch = document.getElementById("historySearch");
  const dashboardView = document.getElementById("dashboardView");
  const settingsView = document.getElementById("settingsView");
  const settingsForm = document.getElementById("settingsForm");
  let currentMode = "shop";
  let latestBill = null;
  let currentTenant = null;
  let currentUser = null;
  let billsCache = [];
  let inventoryCache = [];
  let noticeTimer;
  let inventorySearchTerm = "";

  async function apiRequest(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options && options.headers) }
    });
    if (response.status === 401) {
      window.location.replace("/");
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
  }

  function billsFromApiCache() {
    return billsCache;
  }

  function showNotice(message, isError) {
    notice.textContent = message;
    notice.classList.toggle("error", Boolean(isError));
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 6500);
  }

  function money(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(value);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 10);
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    currentMode = mode;
    const config = MODES[mode];
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.getElementById("registrationLabel").firstChild.textContent = config.registration + " ";
    document.getElementById("clientSectionTitle").textContent = config.client + " details";
    document.getElementById("clientNameLabel").firstChild.textContent = config.client + " name ";
    document.querySelector('[name="clientName"]').placeholder = "Enter " + config.client.toLowerCase() + " name";
    renderDynamicFields(config.extra);
  }

  function renderDynamicFields(fields) {
    dynamicFields.replaceChildren();
    fields.forEach((field) => {
      const label = document.createElement("label");
      label.className = "field" + (field.wide ? " field-wide" : "");
      const caption = document.createElement("span");
      caption.textContent = field.label;
      const input = field.options ? document.createElement("select") : document.createElement("input");
      input.name = field.name;
      if (field.options) {
        const prompt = document.createElement("option");
        prompt.value = "";
        prompt.textContent = field.placeholder;
        input.append(prompt);
        field.options.forEach((optionText) => {
          const option = document.createElement("option");
          option.value = optionText;
          option.textContent = optionText;
          input.append(option);
        });
      } else {
        input.placeholder = field.placeholder;
        input.type = field.type || "text";
        if (input.type === "number") {
          input.min = "0";
          input.step = "1";
          input.inputMode = "numeric";
        }
      }
      label.append(caption, input);
      dynamicFields.append(label);
    });
  }

  function createItemRow(description, quantity, rate, inventoryItemId) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.dataset.inventoryItemId = inventoryItemId || "";
    const picker = document.createElement("select");
    picker.className = "item-inventory-picker";
    picker.setAttribute("aria-label", "Pick an item from inventory or enter manually");
    const manualOption = document.createElement("option");
    manualOption.value = "";
    manualOption.textContent = "Select from inventory (or enter manually)";
    picker.append(manualOption);
    inventoryCache.forEach((item) => {
      const option = document.createElement("option");
      option.value = item._id;
      option.textContent = `${item.name} · ${money(item.unitPrice)}${item.trackStock ? ` · ${item.stockQty} in stock` : " · service"}`;
      option.disabled = item.trackStock && item.stockQty <= 0;
      picker.append(option);
    });
    picker.value = inventoryItemId || "";
    const desc = document.createElement("input");
    desc.type = "text";
    desc.name = "itemDescription";
    desc.placeholder = "Item or service";
    desc.setAttribute("aria-label", "Item or service description");
    desc.value = description || "";
    const qty = document.createElement("input");
    qty.type = "number";
    qty.name = "itemQuantity";
    qty.inputMode = "decimal";
    qty.min = "0.01";
    qty.step = "any";
    qty.placeholder = "1";
    qty.value = quantity === undefined ? "1" : quantity;
    qty.setAttribute("aria-label", "Quantity");
    const price = document.createElement("input");
    price.type = "number";
    price.name = "itemRate";
    price.inputMode = "decimal";
    price.min = "0";
    price.step = "any";
    price.placeholder = "0.00";
    price.value = rate || "";
    price.setAttribute("aria-label", "Rate in rupees");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-item";
    remove.setAttribute("aria-label", "Remove item");
    remove.title = "Remove item";
    remove.textContent = "×";
    row.append(picker, desc, qty, price, remove);
    picker.addEventListener("change", () => {
      const selected = inventoryCache.find((item) => item._id === picker.value);
      row.dataset.inventoryItemId = selected ? selected._id : "";
      if (selected) {
        desc.value = selected.name;
        price.value = String(selected.unitPrice);
      } else {
        desc.value = "";
        price.value = "";
      }
      calculateTotals();
    });
    return row;
  }

  function itemValues() {
    return Array.from(lineItems.querySelectorAll(".item-row")).map((row) => {
      const inputs = row.querySelectorAll("input");
      const quantity = Number(inputs[1].value);
      const rate = Number(inputs[2].value);
      return {
        description: inputs[0].value.trim(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
        rate: Number.isFinite(rate) && rate >= 0 ? rate : 0,
        inventoryItemId: row.dataset.inventoryItemId || null,
        hasQuantity: inputs[1].value.trim() !== "",
        hasRate: inputs[2].value.trim() !== ""
      };
    });
  }

  function calculateTotals() {
    const subtotal = itemValues().reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const discountValue = Number(form.elements.discount.value);
    const discount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
    document.getElementById("subtotalAmount").textContent = money(subtotal);
    document.getElementById("grandTotalAmount").textContent = money(Math.max(0, subtotal - discount));
  }

  function vendorDataFromForm() {
    return {
      businessName: form.elements.businessName.value.trim(),
      businessMobile: digitsOnly(form.elements.businessMobile.value),
      registration: form.elements.registration.value.trim(),
      businessAddress: form.elements.businessAddress.value.trim(),
      upiId: form.elements.upiId.value.trim()
    };
  }

  async function saveSettings() {
    try {
      const { tenant } = await apiRequest("/api/tenant/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessName: settingsForm.elements.businessName.value.trim(),
          phone: settingsForm.elements.phone.value.trim(),
          regNumber: settingsForm.elements.regNumber.value.trim(),
          address: settingsForm.elements.address.value.trim(),
          upiId: settingsForm.elements.upiId.value.trim(),
          branding: {
            logoUrl: settingsForm.elements.logoUrl.value.trim(),
            signatureUrl: settingsForm.elements.signatureUrl.value.trim(),
            stampUrl: settingsForm.elements.stampUrl.value.trim(),
            watermarkText: settingsForm.elements.watermarkText.value.trim(),
            themeColor: settingsForm.elements.themeColor.value
          }
        })
      });
      currentTenant = tenant;
      restoreVendor();
      document.getElementById("headerBusinessName").textContent = tenant.businessName;
      showSectionNotice("settingsNotice", "Business settings saved.", false);
    } catch (error) {
      showSectionNotice("settingsNotice", error.message);
    }
  }

  function restoreVendor() {
    if (!currentTenant) return;
    form.elements.businessName.value = currentTenant.businessName || "";
    form.elements.businessMobile.value = currentTenant.phone || "";
    form.elements.registration.value = currentTenant.regNumber || "";
    form.elements.businessAddress.value = currentTenant.address || "";
    form.elements.upiId.value = currentTenant.upiId || "";
    settingsForm.elements.businessName.value = currentTenant.businessName || "";
    settingsForm.elements.phone.value = currentTenant.phone || "";
    settingsForm.elements.regNumber.value = currentTenant.regNumber || "";
    settingsForm.elements.address.value = currentTenant.address || "";
    settingsForm.elements.upiId.value = currentTenant.upiId || "";
    const branding = currentTenant.branding || {};
    ["logoUrl", "signatureUrl", "stampUrl", "watermarkText", "themeColor"].forEach((key) => {
      settingsForm.elements[key].value = branding[key] || (key === "themeColor" ? "#0f766e" : "");
    });
    document.documentElement.style.setProperty("--teal", branding.themeColor || "#0f766e");
    ["logoUrl", "signatureUrl", "stampUrl"].forEach(updateAssetPreview);
  }

  function isSafeImageSource(value) {
    if (!value) return false;
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value.length <= 500000;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function updateAssetPreview(name) {
    const preview = document.getElementById(name.replace("Url", "Preview"));
    if (!preview) return;
    const value = settingsForm.elements[name].value.trim();
    preview.hidden = !isSafeImageSource(value);
    if (!preview.hidden) preview.src = value;
    else preview.removeAttribute("src");
    preview.onerror = () => { preview.hidden = true; };
  }

  function setBrandAsset(name, value) {
    settingsForm.elements[name].value = value;
    updateAssetPreview(name);
  }

  function generateBusinessStamp(shape) {
    const businessName = settingsForm.elements.businessName.value.trim() || "BUSINESS NAME";
    const addressParts = settingsForm.elements.address.value.split(",").map((part) => part.trim()).filter(Boolean);
    const city = addressParts.length ? addressParts[addressParts.length - 1] : "AUTHORIZED BUSINESS";
    const canvas = document.createElement("canvas");
    const round = shape === "round";
    canvas.width = round ? 400 : 560;
    canvas.height = round ? 400 : 280;
    const context = canvas.getContext("2d");
    const ink = "#174f4d";
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (round) {
      context.lineWidth = 9;
      context.beginPath();
      context.arc(200, 200, 178, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = 2;
      context.beginPath();
      context.arc(200, 200, 157, 0, Math.PI * 2);
      context.stroke();
      context.font = "700 20px Arial";
      context.fillText("OFFICIAL BUSINESS SEAL", 200, 145, 275);
      let fontSize = 25;
      context.font = `700 ${fontSize}px Arial`;
      while (context.measureText(businessName.toUpperCase()).width > 270 && fontSize > 14) {
        fontSize -= 1;
        context.font = `700 ${fontSize}px Arial`;
      }
      context.fillText(businessName.toUpperCase(), 200, 200, 280);
      context.font = "600 19px Arial";
      context.fillText(city.toUpperCase(), 200, 250, 260);
    } else {
      context.lineWidth = 8;
      context.strokeRect(12, 12, 536, 256);
      context.lineWidth = 2;
      context.strokeRect(24, 24, 512, 232);
      context.font = "700 18px Arial";
      context.fillText("OFFICIAL BUSINESS STAMP", 280, 76, 460);
      let fontSize = 30;
      context.font = `700 ${fontSize}px Arial`;
      while (context.measureText(businessName.toUpperCase()).width > 460 && fontSize > 16) {
        fontSize -= 1;
        context.font = `700 ${fontSize}px Arial`;
      }
      context.fillText(businessName.toUpperCase(), 280, 142, 470);
      context.font = "600 21px Arial";
      context.fillText(city.toUpperCase(), 280, 198, 450);
    }
    setBrandAsset("stampUrl", canvas.toDataURL("image/png"));
    showSectionNotice("settingsNotice", `${round ? "Round" : "Rectangular"} business stamp generated. Save settings to keep it.`, false);
  }

  function setupSignaturePad() {
    const canvas = document.getElementById("signatureCanvas");
    const context = canvas.getContext("2d");
    let drawing = false;
    context.strokeStyle = "#233e43";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";

    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) * canvas.width / bounds.width,
        y: (event.clientY - bounds.top) * canvas.height / bounds.height
      };
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (!currentUser || currentUser.role !== "owner") return;
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const position = point(event);
      context.beginPath();
      context.moveTo(position.x, position.y);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const position = point(event);
      context.lineTo(position.x, position.y);
      context.stroke();
    });
    const finishStroke = () => {
      if (!drawing) return;
      drawing = false;
      setBrandAsset("signatureUrl", canvas.toDataURL("image/png"));
    };
    canvas.addEventListener("pointerup", finishStroke);
    canvas.addEventListener("pointercancel", finishStroke);
    document.getElementById("clearSignatureButton").addEventListener("click", () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      settingsForm.elements.signatureUrl.value = "";
      updateAssetPreview("signatureUrl");
    });
  }

  function setupBrandAssetInputs() {
    function readImageFile(file, field) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 350 * 1024) {
        showSectionNotice("settingsNotice", "Choose a PNG, JPEG, or WebP image smaller than 350 KB.");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => showSectionNotice("settingsNotice", "The selected image could not be read.");
      reader.onload = () => {
        setBrandAsset(field, String(reader.result));
        if (field === "signatureUrl") {
          const canvas = document.getElementById("signatureCanvas");
          canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        }
      };
      reader.readAsDataURL(file);
    }

    document.querySelectorAll("[data-brand-file]").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files[0];
        if (!file) return;
        readImageFile(file, input.dataset.brandFile);
        input.value = "";
      });
    });
    ["logoUrl", "signatureUrl", "stampUrl"].forEach((name) => {
      const input = settingsForm.elements[name];
      input.addEventListener("input", () => updateAssetPreview(name));
      input.addEventListener("paste", (event) => {
        const clipboardItems = Array.from(event.clipboardData && event.clipboardData.items || []);
        const imageItem = clipboardItems.find((item) => item.type.startsWith("image/"));
        if (!imageItem) return;
        const file = imageItem.getAsFile();
        if (!file) return;
        event.preventDefault();
        readImageFile(file, name);
      });
    });
    document.getElementById("generateRoundStamp").addEventListener("click", () => generateBusinessStamp("round"));
    document.getElementById("generateRectStamp").addEventListener("click", () => generateBusinessStamp("rect"));
  }

  function setReceiptImage(id, source) {
    const image = document.getElementById(id);
    image.hidden = !isSafeImageSource(source || "");
    if (!image.hidden) {
      image.src = source;
      image.onerror = () => { image.hidden = true; };
    } else {
      image.removeAttribute("src");
    }
  }

  function escapeXml(value) {
    return String(value).replace(/[<>&'"]/g, (character) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      "\"": "&quot;"
    })[character]);
  }

  function applyReceiptBranding() {
    const branding = currentTenant.branding || {};
    const logo = branding.logoUrl || "";
    setReceiptImage("receiptLogo", logo);
    document.getElementById("receiptBrandFallback").hidden = isSafeImageSource(logo);
    setReceiptImage("receiptSignature", branding.signatureUrl || "");
    setReceiptImage("receiptStamp", branding.stampUrl || "");
    const watermark = escapeXml((branding.watermarkText || currentTenant.businessName || "eParchi").slice(0, 100));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="290" height="190"><defs><pattern id="w" width="290" height="190" patternTransform="rotate(-28)" patternUnits="userSpaceOnUse"><text x="0" y="100" fill="#466b69" fill-opacity=".09" font-family="Arial,sans-serif" font-size="22" font-weight="700">${watermark}</text></pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`;
    document.getElementById("receipt").style.setProperty(
      "--receipt-watermark-image",
      `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    );
  }

  function fromParchi(parchi) {
    const typeToMode = { shop: "shop", clinic: "clinic", coaching: "institute" };
    const mode = typeToMode[currentTenant.businessType] || "shop";
    return {
      id: parchi.parchiNumber,
      createdAt: parchi.createdAt,
      mode,
      modeLabel: MODES[mode].label,
      vendor: {
        businessName: currentTenant.businessName,
        businessMobile: currentTenant.phone,
        registration: currentTenant.regNumber,
        businessAddress: currentTenant.address,
        upiId: currentTenant.upiId
      },
      client: {
        name: parchi.clientName,
        mobile: parchi.clientPhone,
        extra: Array.isArray(parchi.clientExtra) ? parchi.clientExtra : []
      },
      paymentMode: parchi.paymentMode,
      items: parchi.items.map((item) => ({
        description: item.name,
        quantity: item.quantity,
        rate: item.unitPrice
      })),
      subtotal: parchi.subtotal,
      discount: parchi.discount,
      total: parchi.grandTotal
    };
  }

  function getExtraFields() {
    return MODES[currentMode].extra.map((field) => ({
      label: field.label,
      value: form.elements[field.name] ? form.elements[field.name].value.trim() : ""
    })).filter((field) => field.value);
  }

  function validateAndBuildBill() {
    const vendor = vendorDataFromForm();
    const clientName = form.elements.clientName.value.trim();
    const clientMobile = digitsOnly(form.elements.clientMobile.value);
    const items = itemValues();
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const discountValue = Number(form.elements.discount.value);
    const discount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;

    if (!vendor.businessName || vendor.businessMobile.length !== 10 || !clientName || clientMobile.length !== 10) {
      showNotice("Add the business and client names, plus valid 10-digit mobile numbers.", true);
      return null;
    }
    if (items.length === 0 || items.some((item) => !item.description || !item.hasQuantity || !item.hasRate || item.quantity <= 0 || item.rate < 0)) {
      showNotice("Add at least one item with a description, quantity, and valid rate.", true);
      return null;
    }
    if (!Number.isFinite(discountValue) || discount < 0 || discount > subtotal) {
      showNotice("Discount must be a valid amount no greater than the subtotal.", true);
      return null;
    }
    if (!Number.isFinite(subtotal) || !Number.isFinite(subtotal - discount)) {
      showNotice("The bill total is too large to calculate. Please check the item amounts.", true);
      return null;
    }
    const now = new Date();
    return {
      id: "",
      createdAt: now.toISOString(),
      mode: currentMode,
      modeLabel: MODES[currentMode].label,
      vendor,
      client: {
        name: clientName,
        mobile: clientMobile,
        extra: getExtraFields()
      },
      paymentMode: form.elements.paymentMode.value,
      items: items.map(({ description, quantity, rate, inventoryItemId }) => ({
        description, quantity, rate, inventoryItemId
      })),
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount)
    };
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value || "";
  }

  function renderReceipt(bill) {
    const config = MODES[bill.mode] || MODES.shop;
    applyReceiptBranding();
    setText("receiptModeLabel", config.label.toUpperCase());
    setText("receiptBusinessName", bill.vendor.businessName);
    setText("receiptBusinessAddress", bill.vendor.businessAddress);
    setText("receiptRegistration", bill.vendor.registration ? config.registration + ": " + bill.vendor.registration : "");
    setText("receiptBusinessMobile", bill.vendor.businessMobile ? "+91 " + bill.vendor.businessMobile : "");
    setText("receiptId", bill.id);
    const date = new Date(bill.createdAt);
    setText("receiptDate", Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
    setText("receiptClientLabel", "BILLED TO " + config.client.toUpperCase());
    setText("receiptClientName", bill.client.name);
    setText("receiptClientMobile", "+91 " + bill.client.mobile);
    document.getElementById("receiptExtra").textContent = (bill.client.extra || []).map((field) => field.label + ": " + field.value).join("\n");
    setText("receiptPayment", bill.paymentMode);
    const body = document.getElementById("receiptItems");
    body.replaceChildren();
    bill.items.forEach((item) => {
      const row = document.createElement("tr");
      [item.description, String(item.quantity), money(item.rate), money(item.quantity * item.rate)].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    setText("receiptSubtotal", money(bill.subtotal));
    setText("receiptDiscount", "− " + money(bill.discount));
    document.getElementById("receiptDiscountRow").hidden = bill.discount <= 0;
    setText("receiptTotal", money(bill.total));
    renderQrCode(bill);
  }

  function shareMessage(bill) {
    return [
      "eParchi from " + bill.vendor.businessName,
      "Parchi ID: " + bill.id,
      "For: " + MODES[bill.mode].client + " " + bill.client.name,
      "Date: " + new Date(bill.createdAt).toLocaleString("en-IN"),
      ...bill.items.map((item) => item.description + " × " + item.quantity + " — " + money(item.quantity * item.rate)),
      ...(bill.discount > 0 ? ["Discount: " + money(bill.discount)] : []),
      "Total: " + money(bill.total),
      "Payment: " + bill.paymentMode,
      "Thank you!"
    ].join("\n");
  }

  async function shareReceipt() {
    if (!latestBill) return;
    if (typeof window.html2canvas !== "function") {
      showNotice("Receipt image sharing is unavailable because the renderer did not load. Use Print / Save PDF instead.", true);
      return;
    }
    try {
      const canvas = await window.html2canvas(document.getElementById("receipt"), {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The receipt image could not be created.");
      const file = new File([blob], `${latestBill.id}.png`, { type: "image/png" });
      const message = shareMessage(latestBill);
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `eParchi ${latestBill.id}`, text: message });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const download = document.createElement("a");
      download.href = objectUrl;
      download.download = `${latestBill.id}.png`;
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      const whatsappUrl = "https://wa.me/91" + encodeURIComponent(latestBill.client.mobile) +
        "?text=" + encodeURIComponent(message);
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      showNotice("Receipt image downloaded. Attach it in WhatsApp to share the complete branded layout.");
    } catch (error) {
      if (error.name !== "AbortError") showNotice(error.message || "The receipt could not be shared.", true);
    }
  }

  function renderQrCode(bill) {
    const section = document.getElementById("qrSection");
    const code = document.getElementById("qrCode");
    code.replaceChildren();
    if (!bill.vendor.upiId) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    setText("qrPayAmount", money(bill.total));
    setText("qrUpiLabel", bill.vendor.upiId);
    if (typeof window.QRCode !== "function") {
      const fallback = document.createElement("span");
      fallback.className = "qr-fallback";
      fallback.textContent = "QR unavailable";
      code.append(fallback);
      showNotice("The QR library did not load. The bill is ready, but its payment QR could not be generated.", true);
      return;
    }
    const params = new URLSearchParams({
      pa: bill.vendor.upiId,
      pn: bill.vendor.businessName,
      am: bill.total.toFixed(2),
      cu: "INR",
      tn: bill.id
    });
    try {
      new window.QRCode(code, {
        text: "upi://pay?" + params.toString(),
        width: 84,
        height: 84,
        colorDark: "#173d3c",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch (error) {
      const fallback = document.createElement("span");
      fallback.className = "qr-fallback";
      fallback.textContent = "QR unavailable";
      code.append(fallback);
      showNotice("The payment QR could not be generated. You can still share or print this eParchi.", true);
    }
  }

  function openReceipt(bill) {
    latestBill = bill;
    notice.hidden = true;
    renderReceipt(bill);
    form.hidden = true;
    receiptPage.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clientForBill(bill) {
    return {
      name: bill.client.name,
      mobile: bill.client.mobile,
      mode: bill.mode,
      extra: bill.client.extra || []
    };
  }

  function historyCard(bill) {
    const card = document.createElement("article");
    card.className = "history-card";
    const avatar = document.createElement("div");
    avatar.className = "client-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = (bill.client.name || "?").trim().charAt(0) || "?";
    const main = document.createElement("div");
    main.className = "history-card-main";
    const name = document.createElement("strong");
    name.textContent = bill.client.name || "Client";
    const detail = document.createElement("span");
    const date = new Date(bill.createdAt);
    const dateText = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    detail.textContent = "+91 " + (bill.client.mobile || "") + "  ·  " + bill.id + "  ·  " + dateText;
    main.append(name, detail);
    const side = document.createElement("div");
    side.className = "history-card-side";
    const total = document.createElement("strong");
    total.textContent = money(Number(bill.total) || 0);
    const mode = document.createElement("span");
    mode.textContent = bill.modeLabel || (MODES[bill.mode] || MODES.shop).label;
    side.append(total, mode);
    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "button button-outline";
    useButton.textContent = "Use client";
    useButton.addEventListener("click", () => startReturningClient(bill));
    card.append(avatar, main, side, useButton);
    return card;
  }

  function renderHistory() {
    const bills = billsFromApiCache().sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
    const totalRevenue = bills.reduce((sum, bill) => sum + (Number(bill.total) || 0), 0);
    setText("revenueAmount", money(totalRevenue));
    setText("billCount", String(bills.length));
    const searchTerm = historySearch.value.trim().toLowerCase();
    const filtered = bills.filter((bill) => [
      bill.client && bill.client.name,
      bill.client && bill.client.mobile,
      bill.id,
      bill.vendor && bill.vendor.businessName
    ].some((value) => String(value || "").toLowerCase().includes(searchTerm)));
    const list = document.getElementById("historyList");
    list.replaceChildren(...filtered.map(historyCard));
    setText("historyCountLabel", filtered.length + (filtered.length === 1 ? " bill" : " bills"));
    document.getElementById("emptyHistory").hidden = bills.length > 0;
    document.getElementById("noSearchResults").hidden = bills.length === 0 || filtered.length > 0;
  }

  function inventoryCard(item) {
    const card = document.createElement("article");
    card.className = "inventory-row";
    const details = document.createElement("div");
    details.className = "inventory-row-main";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const metadata = document.createElement("span");
    metadata.textContent = [item.category, item.skuOrCode].filter(Boolean).join(" · ") || "No category or code";
    details.append(name, metadata);
    const stock = document.createElement("div");
    stock.className = "inventory-row-stock";
    stock.textContent = `${item.trackStock ? `${item.stockQty} in stock` : "Stock not tracked"} · ${money(item.unitPrice)}`;
    const actions = document.createElement("div");
    actions.className = "inventory-row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button button-outline";
    edit.textContent = "Edit item";
    const editForm = document.createElement("form");
    editForm.className = "inventory-edit-form";
    editForm.hidden = true;
    const editFields = [
      ["name", "Name", "text", item.name],
      ["skuOrCode", "Code / SKU", "text", item.skuOrCode || ""],
      ["category", "Category", "text", item.category || ""],
      ["stockQty", "Stock quantity", "number", item.stockQty],
      ["unitPrice", "Unit price (₹)", "number", item.unitPrice],
      ["details", "Details", "text", item.extraMeta && item.extraMeta.notes || ""]
    ];
    editFields.forEach(([name, labelText, type, value]) => {
      const label = document.createElement("label");
      label.className = "field";
      label.textContent = labelText;
      const input = document.createElement("input");
      input.name = name;
      input.type = type;
      input.value = String(value);
      if (type === "number") {
        input.min = "0";
        input.step = "any";
        input.required = true;
      }
      label.append(input);
      editForm.append(label);
    });
    const trackLabel = document.createElement("label");
    trackLabel.className = "track-stock-control";
    const trackInput = document.createElement("input");
    trackInput.name = "trackStock";
    trackInput.type = "checkbox";
    trackInput.checked = item.trackStock;
    const trackText = document.createElement("span");
    trackText.textContent = "Track stock and deduct it when billed";
    trackLabel.append(trackInput, trackText);
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "button button-primary";
    save.textContent = "Save changes";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button button-quiet";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => { editForm.hidden = true; });
    editForm.append(trackLabel, save, cancel);
    edit.addEventListener("click", () => { editForm.hidden = !editForm.hidden; });
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(editForm).entries());
      try {
        await apiRequest(`/api/inventory/${encodeURIComponent(item._id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: data.name,
            skuOrCode: data.skuOrCode,
            category: data.category,
            stockQty: Number(data.stockQty),
            unitPrice: Number(data.unitPrice),
            trackStock: editForm.elements.trackStock.checked,
            extraMeta: { notes: data.details }
          })
        });
        await refreshWorkspaceData();
      } catch (error) {
        showSectionNotice("inventoryNotice", error.message);
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-quiet";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
      try {
        await apiRequest(`/api/inventory/${encodeURIComponent(item._id)}`, { method: "DELETE" });
        await refreshWorkspaceData();
      } catch (error) {
        showSectionNotice("inventoryNotice", error.message);
      }
    });
    actions.append(edit, remove);
    card.append(details, stock, actions, editForm);
    return card;
  }

  function showSectionNotice(id, text, isError) {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.toggle("error", isError !== false);
    element.hidden = false;
  }

  function renderInventory() {
    const filtered = inventoryCache.filter((item) => [
      item.name, item.skuOrCode, item.category
    ].some((value) => String(value || "").toLowerCase().includes(inventorySearchTerm)));
    document.getElementById("inventoryList").replaceChildren(...filtered.map(inventoryCard));
    document.getElementById("inventoryCount").textContent =
      `${inventoryCache.length} ${inventoryCache.length === 1 ? "item" : "items"}`;
    document.getElementById("emptyInventory").hidden = filtered.length > 0;
    document.getElementById("emptyInventoryTitle").textContent =
      inventoryCache.length > 0 ? "No matching inventory items" : "No inventory items yet";
    document.getElementById("emptyInventoryCopy").textContent =
      inventoryCache.length > 0 ? "Try a different name, code, or category." : "Add your first product or service above.";
    refreshInventoryPickers();
  }

  function refreshInventoryPickers() {
    document.querySelectorAll(".item-row").forEach((row) => {
      const picker = row.querySelector(".item-inventory-picker");
      if (!picker) return;
      const selectedId = row.dataset.inventoryItemId || "";
      if (selectedId && !inventoryCache.some((item) => item._id === selectedId)) {
        row.dataset.inventoryItemId = "";
      }
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Select from inventory (or enter manually)";
      picker.replaceChildren(option);
      inventoryCache.forEach((item) => {
        const inventoryOption = document.createElement("option");
        inventoryOption.value = item._id;
        inventoryOption.textContent = `${item.name} · ${money(item.unitPrice)}${item.trackStock ? ` · ${item.stockQty} in stock` : " · service"}`;
        inventoryOption.disabled = item.trackStock && item.stockQty <= 0;
        picker.append(inventoryOption);
      });
      picker.value = row.dataset.inventoryItemId;
    });
  }

  function renderLowStock(items) {
    const panel = document.getElementById("lowStockPanel");
    panel.hidden = items.length === 0;
    document.getElementById("lowStockList").replaceChildren(...items.map((item) => {
      const row = document.createElement("div");
      row.className = "low-stock-item";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const category = document.createElement("span");
      category.textContent = item.category || "Inventory item";
      const quantity = document.createElement("b");
      quantity.textContent = `${item.stockQty} left`;
      row.append(name, category, quantity);
      return row;
    }));
  }

  async function loadInventory() {
    try {
      const result = await apiRequest("/api/inventory");
      inventoryCache = result.items;
      renderInventory();
    } catch (error) {
      showSectionNotice("inventoryNotice", error.message);
    }
  }

  async function loadDashboard() {
    try {
      const stats = await apiRequest("/api/dashboard");
      document.getElementById("todayRevenue").textContent = money(stats.todayRevenue);
      document.getElementById("totalParchis").textContent = String(stats.totalParchis);
      document.getElementById("lowStockCount").textContent = String(stats.lowStockCount);
      renderLowStock(stats.lowStockItems);
      document.querySelector(".low-stock-stat small").textContent = `At or below ${stats.lowStockThreshold} units`;
    } catch (error) {
      showSectionNotice("dashboardNotice", error.message);
    }
  }

  async function refreshWorkspaceData() {
    await Promise.all([loadInventory(), loadDashboard()]);
  }

  function renderStaff(users) {
    const list = document.getElementById("staffList");
    const staff = users.filter((user) => user.role === "staff");
    list.replaceChildren(...staff.map((user) => {
      const row = document.createElement("article");
      row.className = "inventory-row";
      const details = document.createElement("div");
      details.className = "inventory-row-main";
      const name = document.createElement("strong");
      name.textContent = user.name;
      const email = document.createElement("span");
      email.textContent = user.email;
      details.append(name, email);
      const role = document.createElement("span");
      role.className = "staff-role";
      role.textContent = "Staff";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Remove ${user.name} from this business?`)) return;
        try {
          await apiRequest(`/api/tenant/staff/${encodeURIComponent(user._id)}`, { method: "DELETE" });
          await loadStaff();
        } catch (error) {
          showSectionNotice("staffNotice", error.message);
        }
      });
      row.append(details, role, remove);
      return row;
    }));
  }

  async function loadStaff() {
    try {
      const result = await apiRequest("/api/tenant/staff");
      renderStaff(result.users);
    } catch (error) {
      showSectionNotice("staffNotice", error.message);
    }
  }

  function showView(name) {
    dashboardView.hidden = name !== "dashboardView";
    createView.hidden = name !== "createView";
    historyView.hidden = name !== "historyView";
    settingsView.hidden = name !== "settingsView";
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      const active = tab.dataset.view === name;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    if (name === "historyView") renderHistory();
    if (name === "dashboardView") refreshWorkspaceData();
    if (name === "settingsView" && currentUser && currentUser.role === "owner") loadStaff();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startReturningClient(bill) {
    const client = clientForBill(bill);
    setMode(client.mode);
    form.elements.clientName.value = client.name;
    form.elements.clientMobile.value = client.mobile;
    form.elements.paymentMode.value = "UPI / QR";
    (client.extra || []).forEach((field) => {
      const configField = MODES[client.mode].extra.find((candidate) => candidate.label === field.label);
      if (configField && form.elements[configField.name]) form.elements[configField.name].value = field.value;
    });
    lineItems.replaceChildren(createItemRow("", 1, ""));
    form.elements.discount.value = "0";
    calculateTotals();
    receiptPage.hidden = true;
    form.hidden = false;
    showView("createView");
    showNotice("Client details filled in. Add the new items and create their eParchi.");
    form.elements.clientName.focus({ preventScroll: true });
  }

  function resetForNewBill() {
    const mode = currentMode;
    form.reset();
    restoreVendor();
    setMode(mode);
    lineItems.replaceChildren(createItemRow("", 1, ""));
    calculateTotals();
    latestBill = null;
    receiptPage.hidden = true;
    form.hidden = false;
    showView("createView");
    form.elements.clientName.focus({ preventScroll: true });
  }

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.view === "createView" && receiptPage.hidden === false) {
        receiptPage.hidden = true;
        form.hidden = false;
      }
      showView(tab.dataset.view);
    });
  });
  document.getElementById("addItemButton").addEventListener("click", () => {
    lineItems.append(createItemRow("", 1, ""));
    lineItems.lastElementChild.querySelector("input").focus();
  });
  lineItems.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-item");
    if (!button) return;
    if (lineItems.children.length === 1) {
      const row = button.closest(".item-row");
      const inputs = row.querySelectorAll("input");
      inputs[0].value = "";
      inputs[1].value = "1";
      inputs[2].value = "";
      row.dataset.inventoryItemId = "";
      row.querySelector(".item-inventory-picker").value = "";
    } else {
      button.closest(".item-row").remove();
    }
    calculateTotals();
  });
  form.addEventListener("input", (event) => {
    if (event.target.name === "businessMobile" || event.target.name === "clientMobile") event.target.value = digitsOnly(event.target.value);
    if (event.target.name === "discount" && Number(event.target.value) < 0) event.target.value = "0";
    if (event.target.closest(".item-row") || event.target.name === "discount") calculateTotals();
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "businessMobile" || event.target.name === "clientMobile") event.target.value = digitsOnly(event.target.value);
    if (event.target.name === "discount") calculateTotals();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const bill = validateAndBuildBill();
    if (!bill) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { parchi } = await apiRequest("/api/parchis", {
        method: "POST",
        body: JSON.stringify({
          clientName: bill.client.name,
          clientPhone: bill.client.mobile,
          clientExtra: bill.client.extra,
          items: bill.items.map((item) => ({
            name: item.description,
            quantity: item.quantity,
            unitPrice: item.rate,
            inventoryItemId: item.inventoryItemId
          })),
          discount: bill.discount,
          paymentMode: bill.paymentMode
        })
      });
      billsCache.unshift(fromParchi(parchi));
      openReceipt(billsCache[0]);
      renderHistory();
      refreshWorkspaceData();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
  document.getElementById("editBillButton").addEventListener("click", () => {
    receiptPage.hidden = true;
    form.hidden = false;
    showView("createView");
  });
  document.getElementById("newParchiButton").addEventListener("click", resetForNewBill);
  document.getElementById("printButton").addEventListener("click", () => window.print());
  document.getElementById("shareButton").addEventListener("click", shareReceipt);
  document.getElementById("historyCreateButton").addEventListener("click", () => {
    resetForNewBill();
  });
  document.getElementById("emptyCreateButton").addEventListener("click", () => showView("createView"));
  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      window.location.replace("/");
    } catch (error) {
      showNotice(error.message, true);
    }
  });
  document.getElementById("inventoryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const item = Object.fromEntries(formData.entries());
    item.stockQty = Number(item.stockQty);
    item.unitPrice = Number(item.unitPrice);
    item.trackStock = formData.has("trackStock");
    item.extraMeta = { notes: item.details || "" };
    delete item.details;
    try {
      await apiRequest("/api/inventory", { method: "POST", body: JSON.stringify(item) });
      form.reset();
      form.elements.stockQty.value = "0";
      document.getElementById("inventoryNotice").hidden = true;
      await refreshWorkspaceData();
    } catch (error) {
      showSectionNotice("inventoryNotice", error.message);
    }
  });
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings();
  });
  document.getElementById("staffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await apiRequest("/api/tenant/staff", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      document.getElementById("staffNotice").hidden = true;
      await loadStaff();
    } catch (error) {
      showSectionNotice("staffNotice", error.message);
    }
  });
  historySearch.addEventListener("input", renderHistory);
  document.getElementById("inventorySearch").addEventListener("input", (event) => {
    inventorySearchTerm = event.target.value.trim().toLowerCase();
    renderInventory();
  });
  document.querySelectorAll("[data-open-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView(link.dataset.openView);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      if (historyView.hidden) showView("historyView");
      historySearch.focus();
    }
  });

  async function initializeWorkspace() {
    try {
      const { user, tenant } = await apiRequest("/api/auth/me");
      currentUser = user;
      currentTenant = tenant;
      document.getElementById("workspaceUser").textContent = user.name;
      document.getElementById("headerBusinessName").textContent = tenant.businessName;
      document.getElementById("roleBadge").textContent = user.role;
      document.getElementById("roleBadge").classList.toggle("owner-role", user.role === "owner");
      document.querySelectorAll(".owner-only").forEach((element) => { element.hidden = user.role !== "owner"; });
      Array.from(settingsForm.elements).forEach((element) => {
        if (element.type !== "submit") element.disabled = user.role !== "owner";
      });
      document.getElementById("signaturePadWrap").classList.toggle("is-readonly", user.role !== "owner");
      document.getElementById("staffSettingsNote").hidden = user.role === "owner";
      restoreVendor();
      const modeForType = { shop: "shop", clinic: "clinic", coaching: "institute" };
      currentMode = modeForType[tenant.businessType] || "shop";
      setMode(currentMode);
      const [result] = await Promise.all([
        apiRequest("/api/parchis"),
        loadInventory(),
        loadDashboard()
      ]);
      billsCache = result.parchis.map(fromParchi);
      lineItems.append(createItemRow("", 1, ""));
      calculateTotals();
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  Array.from(settingsForm.elements).forEach((element) => { element.disabled = true; });
  setupSignaturePad();
  setupBrandAssetInputs();
  initializeWorkspace();
})();
