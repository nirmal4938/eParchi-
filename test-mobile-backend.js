require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.ok) {
      console.log("Existing server is already active on port 3000.");
      return;
    }
  } catch (e) {
    // start server
    require("./server");
  }
}

const DEMO_STAMP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20LL6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDcbSAABsY+ZAAAAAElFTkSuQmCC";
const DEMO_SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20LL6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDcbSAABsY+ZAAAAAElFTkSuQmCC";

async function request(path, options = {}) {
  const url = `${BASE_URL}/${path.replace(/^\/+/, "")}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function waitForServer(maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch (e) {
      // wait 500ms
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not become ready within timeout.");
}

async function runTests() {
  await ensureServerRunning();
  console.log("Waiting for backend server to connect to MongoDB and start listening...");
  await waitForServer();
  console.log("Backend server is UP and ready!");
  console.log("====================================================");
  console.log("   eParchi Mobile Backend Integration Test Suite    ");
  console.log("====================================================");

  // 1. Healthcheck
  console.log("\n[1] Testing /api/health public endpoint...");
  const health = await request("health");
  assert(health.status === 200, "Health status is 200");
  assert(health.body.status === "ok", "Health body status is 'ok'");

  // 2. Register Tenant & Owner
  const testEmail = `mobile-test-${Date.now()}@eparchi-native.test`;
  console.log(`\n[2] Testing /api/auth/register-tenant for ${testEmail}...`);
  const regRes = await request("auth/register-tenant", {
    method: "POST",
    body: JSON.stringify({
      businessName: "Mobile Native Electronics",
      businessType: "shop",
      phone: "9876543210",
      regNumber: "27AAAAA0000A1Z5",
      address: "101 Native App Lane, Pune",
      upiId: "mobilenative@upi",
      name: "Native Test Owner",
      email: testEmail,
      password: "TestPassword123"
    })
  });

  assert(regRes.status === 201, "Registration returns 201 Created");
  assert(typeof regRes.body.token === "string" && regRes.body.token.length > 20, "Bearer token string returned in body");
  assert(regRes.body.user.role === "owner", "User role is 'owner'");
  const ownerToken = regRes.body.token;
  const ownerAuthHeader = { Authorization: `Bearer ${ownerToken}` };

  // 3. Verify Session via /api/auth/me with Bearer token
  console.log("\n[3] Testing /api/auth/me session verification with Bearer token...");
  const meRes = await request("auth/me", { headers: ownerAuthHeader });
  assert(meRes.status === 200, "Session restoration returns 200 OK");
  assert(meRes.body.user.email === testEmail, "Session matches authenticated owner email");
  assert(meRes.body.tenant.businessName === "Mobile Native Electronics", "Tenant matches registered business");

  // 4. Create Tracked Inventory Item
  console.log("\n[4] Testing /api/inventory item creation with stock tracking...");
  const itemRes = await request("inventory", {
    method: "POST",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      name: "OnePlus 12 256GB",
      skuOrCode: `OP12-${Date.now()}`,
      category: "Mobile phones",
      stockQty: 10,
      unitPrice: 64999,
      trackStock: true,
      extraMeta: { warranty: "1 Year" }
    })
  });
  assert(itemRes.status === 201, "Inventory item created with 201");
  assert(itemRes.body.item.stockQty === 10, "Stock quantity initialized to 10");
  const testItemId = itemRes.body.item._id;

  // 5. Update Inventory Item
  console.log("\n[5] Testing /api/inventory/:id update...");
  const updateRes = await request(`inventory/${testItemId}`, {
    method: "PATCH",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      unitPrice: 62999
    })
  });
  assert(updateRes.status === 200, "Inventory update returns 200");
  assert(updateRes.body.item.unitPrice === 62999, "Unit price successfully updated to 62999");

  // 6. Test Dashboard Stats
  console.log("\n[6] Testing /api/dashboard metrics aggregation in IST...");
  const dashRes = await request("dashboard", { headers: ownerAuthHeader });
  assert(dashRes.status === 200, "Dashboard returns 200");
  assert(typeof dashRes.body.todayRevenue === "number", "todayRevenue is a valid number");
  assert(typeof dashRes.body.lowStockCount === "number", "lowStockCount is a valid number");

  // 7. Transactional Parchi Creation with Stock Deduction
  console.log("\n[7] Testing /api/parchis transactional creation (2 units of item)...");
  const parchiRes = await request("parchis", {
    method: "POST",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      clientName: "Rahul Sharma",
      clientPhone: "9822012345",
      clientExtra: [
        { label: "IMEI / Serial number", value: "869234051234567" },
        { label: "Customer address", value: "Kothrud, Pune" }
      ],
      items: [
        {
          inventoryItemId: testItemId,
          name: "OnePlus 12 256GB",
          quantity: 2,
          unitPrice: 62999
        }
      ],
      discount: 998,
      paymentMode: "UPI / QR"
    })
  });

  assert(parchiRes.status === 201, "Parchi created with 201 Created");
  assert(parchiRes.body.parchi.parchiNumber.startsWith("EP-"), "Parchi number generated in EP- format");
  assert(parchiRes.body.parchi.subtotal === 125998, "Subtotal correctly computed as 125998");
  assert(parchiRes.body.parchi.grandTotal === 125000, "Grand total correctly computed as 125000");
  const createdParchiId = parchiRes.body.parchi._id;

  // 8. Verify Stock Deduction Integrity
  console.log("\n[8] Verifying stock deduction integrity...");
  const invListRes = await request("inventory", { headers: ownerAuthHeader });
  const updatedItem = invListRes.body.items.find((i) => i._id === testItemId);
  assert(updatedItem.stockQty === 8, `Stock decremented from 10 to 8 (Actual: ${updatedItem.stockQty})`);

  // 9. Test Over-allocation Protection (Stock Exhaustion 409)
  console.log("\n[9] Testing stock exhaustion protection (attempting to bill 99 units)...");
  const overRes = await request("parchis", {
    method: "POST",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      clientName: "Greedy Buyer",
      items: [
        {
          inventoryItemId: testItemId,
          name: "OnePlus 12 256GB",
          quantity: 99,
          unitPrice: 62999
        }
      ],
      paymentMode: "Cash"
    })
  });
  assert(overRes.status === 409, "Insufficient stock correctly rejected with 409 Conflict");

  // 10. Fetch Single Parchi by ID
  console.log("\n[10] Testing /api/parchis/:id single bill lookup...");
  const singleParchi = await request(`parchis/${createdParchiId}`, { headers: ownerAuthHeader });
  assert(singleParchi.status === 200, "Lookup returns 200 OK");
  assert(singleParchi.body.parchi.clientName === "Rahul Sharma", "Client name matches created bill");

  // 11. Add Staff Member
  console.log("\n[11] Testing /api/tenant/staff creation...");
  const staffEmail = `staff-${Date.now()}@eparchi-native.test`;
  const staffRes = await request("tenant/staff", {
    method: "POST",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      name: "Staff Operator",
      email: staffEmail,
      password: "StaffPassword123"
    })
  });
  assert(staffRes.status === 201, "Staff account created with 201 Created");
  const staffUserId = staffRes.body.user.id;

  // 12. Login as Staff
  console.log("\n[12] Testing login with staff credentials...");
  const staffLoginRes = await request("auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: staffEmail,
      password: "StaffPassword123"
    })
  });
  assert(staffLoginRes.status === 200, "Staff login returns 200 OK");
  assert(typeof staffLoginRes.body.token === "string", "Staff receives Bearer token");
  assert(staffLoginRes.body.user.role === "staff", "Role is 'staff'");
  const staffAuthHeader = { Authorization: `Bearer ${staffLoginRes.body.token}` };

  // 13. Verify RBAC Isolation (Staff forbidden from managing staff)
  console.log("\n[13] Verifying staff role permissions boundary (RBAC)...");
  const forbiddenRes = await request("tenant/staff", { headers: staffAuthHeader });
  assert(forbiddenRes.status === 403, "Staff is blocked from accessing /api/tenant/staff with 403 Forbidden");

  // 14. Demo Login Verification
  console.log("\n[14] Testing 1-Click interactive demo login...");
  const demoRes = await request("auth/demo", {
    method: "POST",
    body: JSON.stringify({
      role: "owner",
      branding: {
        stampUrl: DEMO_STAMP,
        signatureUrl: DEMO_SIG
      }
    })
  });
  assert(demoRes.status === 200, "Demo login returns 200 OK");
  assert(typeof demoRes.body.token === "string", "Demo login issues Bearer token");
  assert(demoRes.body.demo === true, "Demo flag is true");

  // 15. WhatsApp Cloud API Integration Endpoint
  console.log("\n[15] Testing WhatsApp Cloud API dispatch endpoint...");
  const waRes = await request("whatsapp/send", {
    method: "POST",
    headers: ownerAuthHeader,
    body: JSON.stringify({
      parchiId: createdParchiId,
      phone: "9822012345"
    })
  });
  assert(
    waRes.status === 503 || waRes.status === 200,
    `WhatsApp response valid (503 if unconfigured, 200 if configured): status ${waRes.status}`
  );

  // 16. Cleanup: Delete Staff Member
  console.log("\n[16] Cleaning up test staff member...");
  const delStaff = await request(`tenant/staff/${staffUserId}`, {
    method: "DELETE",
    headers: ownerAuthHeader
  });
  assert(delStaff.status === 204, "Staff deletion returns 204 No Content");

  // 17. Cleanup: Delete Test Inventory Item
  console.log("\n[17] Cleaning up test inventory item...");
  const delItem = await request(`inventory/${testItemId}`, {
    method: "DELETE",
    headers: ownerAuthHeader
  });
  assert(delItem.status === 204, "Inventory deletion returns 204 No Content");

  console.log("\n====================================================");
  console.log("   🎉 ALL 17 INTEGRATION TESTS PASSED PERFECTLY!     ");
  console.log("====================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
