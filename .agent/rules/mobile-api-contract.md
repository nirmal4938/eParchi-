# eParchi Mobile API Contract

## 1. Global Conventions

- **Base URL:** `http://<HOST>:<PORT>/api` (Development: `http://10.0.2.2:3000/api` for Android Emulator or LAN IP for physical device; Production: Configured HTTPS endpoint).
- **Authentication:** Header `Authorization: Bearer <JWT_TOKEN>`.
- **Content-Type:** `application/json` (limits: 2MB max JSON body for branding assets).
- **Standard Error Response Format:**
  ```json
  {
    "error": "Human-readable description of error"
  }
  ```

---

## 2. API Endpoint Specification

### 2.1 Healthcheck
- **Method & Path:** `GET /api/health`
- **Auth:** Public
- **Response 200 OK:**
  ```json
  {
    "status": "ok",
    "database": "connected"
  }
  ```

---

### 2.2 Authentication & Tenant Setup

#### Register Tenant & Owner
- **Method & Path:** `POST /api/auth/register-tenant`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "businessName": "Star Electronics",
    "businessType": "shop",
    "phone": "9876543210",
    "regNumber": "27AAAAA0000A1Z5",
    "address": "Shop 4, Main Market, Mumbai",
    "upiId": "owner@upi",
    "name": "Rajesh Kumar",
    "email": "rajesh@starelectronics.com",
    "password": "Password123"
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "674000000000000000000001",
      "name": "Rajesh Kumar",
      "email": "rajesh@starelectronics.com",
      "role": "owner",
      "tenantId": "674000000000000000000002"
    },
    "tenant": {
      "_id": "674000000000000000000002",
      "businessName": "Star Electronics",
      "businessType": "shop",
      "phone": "9876543210",
      "regNumber": "27AAAAA0000A1Z5",
      "address": "Shop 4, Main Market, Mumbai",
      "upiId": "owner@upi",
      "branding": {
        "logoUrl": "",
        "signatureUrl": "",
        "stampUrl": "",
        "watermarkText": "",
        "themeColor": "#0f766e"
      }
    }
  }
  ```
- **Error Codes:** 400 (validation), 409 (duplicate email).

#### Login
- **Method & Path:** `POST /api/auth/login`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "rajesh@starelectronics.com",
    "password": "Password123"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "674000000000000000000001",
      "name": "Rajesh Kumar",
      "email": "rajesh@starelectronics.com",
      "role": "owner",
      "tenantId": "674000000000000000000002"
    },
    "tenant": {
      "_id": "674000000000000000000002",
      "businessName": "Star Electronics",
      "businessType": "shop",
      "phone": "9876543210",
      "regNumber": "27AAAAA0000A1Z5",
      "address": "Shop 4, Main Market, Mumbai",
      "upiId": "owner@upi",
      "branding": {
        "logoUrl": "",
        "signatureUrl": "",
        "stampUrl": "",
        "watermarkText": "",
        "themeColor": "#0f766e"
      }
    }
  }
  ```
- **Error Codes:** 400 (missing fields), 401 (invalid credentials).

#### Interactive Demo Login
- **Method & Path:** `POST /api/auth/demo`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "role": "owner",
    "branding": {
      "stampUrl": "data:image/png;base64,...",
      "signatureUrl": "data:image/png;base64,..."
    }
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": { ... },
    "tenant": { ... },
    "demo": true
  }
  ```

#### Current Session (`/me`)
- **Method & Path:** `GET /api/auth/me`
- **Auth:** Bearer Token
- **Response 200 OK:**
  ```json
  {
    "user": {
      "id": "6740...",
      "name": "...",
      "email": "...",
      "role": "owner",
      "tenantId": "..."
    },
    "tenant": { ... }
  }
  ```
- **Error Codes:** 401 (session expired / invalid token), 404 (tenant not found).

#### Logout
- **Method & Path:** `POST /api/auth/logout`
- **Auth:** Bearer Token
- **Response 204 No Content**

---

### 2.3 Dashboard Statistics
- **Method & Path:** `GET /api/dashboard`
- **Auth:** Bearer Token
- **Response 200 OK:**
  ```json
  {
    "todayRevenue": 24999.00,
    "totalParchis": 42,
    "lowStockCount": 2,
    "lowStockItems": [
      {
        "_id": "674000000000000000000010",
        "name": "Smartphone X 128 GB",
        "category": "Mobile phones",
        "stockQty": 3,
        "unitPrice": 64999
      }
    ],
    "lowStockThreshold": 5
  }
  ```

---

### 2.4 Inventory Management

#### List Inventory Items
- **Method & Path:** `GET /api/inventory`
- **Auth:** Bearer Token
- **Response 200 OK:**
  ```json
  {
    "items": [
      {
        "_id": "674000000000000000000010",
        "tenantId": "674000000000000000000002",
        "name": "Smartphone X 128 GB",
        "skuOrCode": "PHONE-X128",
        "category": "Mobile phones",
        "stockQty": 8,
        "unitPrice": 64999,
        "trackStock": true,
        "extraMeta": { "notes": "Model 2026" },
        "createdAt": "2026-11-20T10:00:00.000Z",
        "updatedAt": "2026-11-20T10:00:00.000Z"
      }
    ]
  }
  ```

#### Create Inventory Item
- **Method & Path:** `POST /api/inventory`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "name": "Wireless Earbuds",
    "skuOrCode": "EARBUDS-WL",
    "category": "Accessories",
    "stockQty": 15,
    "unitPrice": 1999,
    "trackStock": true,
    "extraMeta": { "notes": "Bluetooth 5.3" }
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "item": { ... }
  }
  ```
- **Error Codes:** 400 (validation error), 409 (duplicate SKU in this business).

#### Update Inventory Item
- **Method & Path:** `PATCH /api/inventory/:itemId`
- **Auth:** Bearer Token
- **Request Body:** Partial object containing any of `name`, `skuOrCode`, `category`, `stockQty`, `unitPrice`, `trackStock`, `extraMeta`.
- **Response 200 OK:**
  ```json
  {
    "item": { ... }
  }
  ```
- **Error Codes:** 400 (validation / invalid ID), 404 (not found), 409 (duplicate SKU).

#### Delete Inventory Item
- **Method & Path:** `DELETE /api/inventory/:itemId`
- **Auth:** Bearer Token
- **Response 204 No Content**
- **Error Codes:** 400 (invalid ID), 404 (not found).

---

### 2.5 Parchi (Bill) Operations

#### List Parchis
- **Method & Path:** `GET /api/parchis`
- **Auth:** Bearer Token
- **Query Parameters (optional backward-compatible):** `limit`, `page`, `search`
- **Response 200 OK:**
  ```json
  {
    "parchis": [
      {
        "_id": "674000000000000000000050",
        "tenantId": "674000000000000000000002",
        "createdByUserId": "674000000000000000000001",
        "parchiNumber": "EP-2026-A1B2C3D4E5F67890",
        "clientName": "Amit Sharma",
        "clientPhone": "9823012345",
        "clientExtra": [
          { "label": "IMEI / Serial number", "value": "862345051234567" },
          { "label": "Customer address", "value": "Model Colony, Pune" }
        ],
        "items": [
          {
            "inventoryItemId": "674000000000000000000010",
            "name": "Smartphone X 128 GB",
            "quantity": 1,
            "unitPrice": 64999
          }
        ],
        "subtotal": 64999,
        "discount": 1000,
        "grandTotal": 63999,
        "paymentMode": "UPI / QR",
        "createdAt": "2026-11-22T14:30:00.000Z"
      }
    ]
  }
  ```

#### Create Parchi (Transactional with Stock Deduction)
- **Method & Path:** `POST /api/parchis`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "clientName": "Amit Sharma",
    "clientPhone": "9823012345",
    "clientExtra": [
      { "label": "IMEI / Serial number", "value": "862345051234567" },
      { "label": "Customer address", "value": "Model Colony, Pune" }
    ],
    "items": [
      {
        "inventoryItemId": "674000000000000000000010",
        "name": "Smartphone X 128 GB",
        "quantity": 1,
        "unitPrice": 64999
      }
    ],
    "discount": 1000,
    "paymentMode": "UPI / QR"
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "parchi": {
      "_id": "674000000000000000000050",
      "parchiNumber": "EP-2026-A1B2C3D4E5F67890",
      "clientName": "Amit Sharma",
      "clientPhone": "9823012345",
      "items": [ ... ],
      "subtotal": 64999,
      "discount": 1000,
      "grandTotal": 63999,
      "paymentMode": "UPI / QR",
      "createdAt": "2026-11-22T14:30:00.000Z"
    }
  }
  ```
- **Error Codes:**
  - 400 (validation: missing required fields, invalid discount > subtotal).
  - 404 (`INVENTORY_ITEM_NOT_FOUND`: selected item does not exist in business).
  - 409 (`INSUFFICIENT_STOCK`: stockQty < quantity for tracked inventory item).

---

### 2.6 Tenant Settings & Staff

#### Update Business Settings / Branding
- **Method & Path:** `PATCH /api/tenant` (or `PUT /api/tenant/settings`)
- **Auth:** Bearer Token + Role `owner`
- **Request Body:**
  ```json
  {
    "businessName": "Star Electronics Pro",
    "businessType": "shop",
    "phone": "9876543210",
    "regNumber": "27AAAAA0000A1Z5",
    "address": "Shop 4-5, Main Market, Mumbai",
    "upiId": "owner@upi",
    "branding": {
      "logoUrl": "data:image/png;base64,...",
      "signatureUrl": "data:image/png;base64,...",
      "stampUrl": "data:image/png;base64,...",
      "watermarkText": "OFFICIAL RECEIPT",
      "themeColor": "#0f766e"
    }
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "tenant": { ... }
  }
  ```
- **Error Codes:** 400 (invalid brand asset format/size > 500KB, invalid color hex), 403 (insufficient role).

#### Staff Management
- `GET /api/tenant/staff` -> `{ users: [ { _id, name, email, role, createdAt } ] }`
- `POST /api/tenant/staff` -> `{ user: { id, name, email, role } }`
- `DELETE /api/tenant/staff/:userId` -> `204 No Content`

---

## 3. Screen-to-API Mapping Matrix

| Mobile Screen | Primary API Endpoints | Trigger Event | Cache Strategy |
| :--- | :--- | :--- | :--- |
| **Splash / Boot** | `GET /api/auth/me` | On app mount | Read SecureStore token; verify session |
| **Login** | `POST /api/auth/login` | Form submit | Store JWT in SecureStore; populate AuthContext |
| **Registration** | `POST /api/auth/register-tenant` | Wizard complete | Store JWT in SecureStore; populate AuthContext |
| **Demo Launch** | `POST /api/auth/demo` | Role selection | Store JWT in SecureStore; populate AuthContext |
| **Dashboard** | `GET /api/dashboard`<br>`GET /api/inventory`<br>`GET /api/auth/me` | Tab focus / Pull-to-refresh | 1-min stale time, pull-to-refresh invalidate |
| **Inventory List** | `GET /api/inventory` | Tab focus / Search input | 5-min stale time, client-side search |
| **Add Product** | `POST /api/inventory` | Modal submit | Invalidate `inventory` & `dashboard` queries |
| **Edit Product** | `PATCH /api/inventory/:id` | Modal submit | Invalidate `inventory` & `dashboard` queries |
| **Delete Product** | `DELETE /api/inventory/:id` | Confirm dialog | Invalidate `inventory` & `dashboard` queries |
| **Create eParchi** | `GET /api/inventory`<br>`POST /api/parchis` | Item picker open<br>Confirm & save bill | Invalidate `parchis`, `inventory`, `dashboard` |
| **Success / Share** | Method A: Local PDF<br>Method B: `POST /api/whatsapp/send` | Button tap | Local cache share sheet / API dispatch |
| **Bill History** | `GET /api/parchis` | Tab focus / Search input | Invalidate on bill creation |
| **Settings** | `PATCH /api/tenant`<br>`GET /api/tenant/staff` | Save settings<br>Tab mount | Invalidate `auth/me` & `tenant/staff` |
