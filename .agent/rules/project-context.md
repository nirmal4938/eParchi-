# Project Context & Architecture Reference: eParchi2

> Reference guide and architectural blueprint for the eParchi2 multi-tenant billing application.

---

## 1. Tech Stack & Versions

| Layer | Technology | Version | Purpose / Notes |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | v18+ | `"start": "node server.js"`, `"dev": "node --watch server.js"` |
| **Backend Framework** | Express | `^4.21.2` | REST API routing, static file delivery, centralized error handling |
| **Database & ODM** | MongoDB / Mongoose | `^8.9.5` | Multi-tenant schema definitions, ACID transactions for stock updates |
| **Authentication & Crypto** | `jsonwebtoken`<br>`bcryptjs`<br>`crypto` (native) | `^9.0.2`<br>`^2.4.3`<br>Node native | JWT-based auth (HS256, 7-day expiry), 12-round bcrypt hash, secure random token generation |
| **Cookies & Security** | `cookie-parser`<br>`helmet` | `^1.4.7`<br>`^8.0.0` | `eparchi_session` cookie (`httpOnly`, `sameSite: strict`); Helmet CSP with script/style/image whitelists |
| **Configuration** | `dotenv` | `^16.4.7` | Reads root `.env` |
| **Frontend Architecture** | Vanilla JavaScript | ES6+ / IIFE | Strict mode (`"use strict"`), zero build step, DOM-driven single-page architecture |
| **Frontend Styling** | Modern CSS3 | Standard | CSS custom properties (`--teal`, `--canvas`, `--shadow`), CSS Grid, Flexbox, responsive layouts |
| **Client Libraries (CDN)** | `qrcodejs`<br>`html2canvas` | `1.0.0`<br>`1.4.1` | UPI dynamic QR generation (`cdnjs`), DOM-to-PNG receipt rendering for WhatsApp share |
| **Browser APIs** | Canvas, Web Share | Native | Draw/render digital signatures, auto-generate business stamps, mobile native share sheet |

---

## 2. Directory & Architecture Map

```
eParchi2/
├── .agent/
│   └── rules/
│       └── project-context.md       # Project architecture and reference map (this file)
├── middleware/
│   └── auth.js                      # Authentication (authenticate) & RBAC (requireRole)
├── models/
│   ├── User.js                      # User model (Owner & Staff roles)
│   ├── Tenant.js                    # Tenant business profile & branding subdocuments
│   ├── InventoryItem.js             # Inventory & service items with stock tracking
│   └── Parchi.js                    # Digital bill (Parchi) with line items & totals
├── routes/
│   ├── auth.js                      # /api/auth: registration, login, 1-click demo, me, logout
│   ├── tenant.js                    # /api/tenant: settings/branding update, staff management
│   ├── inventory.js                 # /api/inventory: inventory CRUD operations
│   ├── parchis.js                   # /api/parchis: parchi listing & transactional creation
│   └── dashboard.js                 # /api/dashboard: revenue in IST, bill counts, low stock alerts
├── public/
│   ├── index.html                   # Landing & authentication portal
│   ├── auth.css                     # Auth portal styling
│   ├── auth.js                      # Auth page controller & demo stamp/signature generator
│   ├── workspace.html               # Main SPA workspace layout (Dashboard, Create, History, Settings)
│   ├── style.css                    # Workspace design system & components
│   └── app.js                       # Workspace SPA logic, API client, receipt rendering, state
├── .env                             # Environment configuration
├── .gitignore                       # Git ignore list
├── package.json                     # NPM package manifest
├── package-lock.json                # NPM dependency lockfile
└── server.js                        # App initialization, Express setup, routes, static server, MongoDB connect
```

### Module Patterns & Architecture
- **Backend Pattern:** Layered MVC/Service structure using Express Router and Mongoose ODM. CommonJS modules (`require` / `module.exports`).
- **Multi-Tenancy Architecture:** Shared database and shared collections. Every core entity (`User`, `InventoryItem`, `Parchi`) maintains a mandatory `tenantId` reference. Data isolation is enforced strictly in query filters (`{ tenantId: req.tenantId }`).
- **Frontend Pattern:** Pure Vanilla JS SPA using closure IIFEs (`(() => { "use strict"; ... })()`). Views are switched using hidden attributes (`#dashboardView`, `#createView`, `#historyView`, `#settingsView`, `#receiptPage`). State is kept in lightweight module-level caches (`billsCache`, `inventoryCache`, `currentUser`, `currentTenant`).

---

## 3. Database Models & Schemas

### 1. `Tenant` (`models/Tenant.js`)
Stores multi-tenant business profiles and receipt customization settings.
- `demoKey`: `String` (unique, sparse, select: false) — Identifies sample demo tenant (`eparchi-mobile-shop-v1`).
- `businessName`: `String` (required, trim, max 120) — Business name.
- `businessType`: `String` (enum: `["shop", "clinic", "coaching"]`, required) — Dictates client nomenclature and custom fields.
- `phone`: `String` (required, trim, max 30) — Business mobile/contact number.
- `regNumber`: `String` (trim, max 100, default `""`) — GST, MCI, or Trade registration.
- `address`: `String` (trim, max 300, default `""`) — Physical address.
- `upiId`: `String` (trim, max 100, default `""`) — UPI VPA for payment QR code generation.
- `branding`: Subdocument (`_id: false`):
  - `logoUrl`: `String` (max 500,000, HTTPS URL or Base64 data URL).
  - `signatureUrl`: `String` (max 500,000, HTTPS URL or Base64 data URL).
  - `stampUrl`: `String` (max 500,000, HTTPS URL or Base64 data URL).
  - `watermarkText`: `String` (max 100, default `""`).
  - `themeColor`: `String` (hex regex `/^#[0-9a-fA-F]{6}$/`, default `"#0f766e"`).
- Timestamps: `createdAt`, `updatedAt`.

### 2. `User` (`models/User.js`)
User accounts associated with a tenant.
- `tenantId`: `ObjectId` (ref: `Tenant`, required, indexed).
- `name`: `String` (required, trim, max 100).
- `email`: `String` (required, trim, lowercase, unique, max 254).
- `passwordHash`: `String` (required, `select: false`).
- `role`: `String` (enum: `["owner", "staff"]`, required).
- Timestamps: `createdAt`, `updatedAt`.

### 3. `InventoryItem` (`models/InventoryItem.js`)
Products or services offered by the tenant.
- `tenantId`: `ObjectId` (ref: `Tenant`, required, indexed).
- `name`: `String` (required, trim, max 160).
- `skuOrCode`: `String` (trim, default `""`, max 100).
- `category`: `String` (trim, default `""`, max 100).
- `stockQty`: `Number` (min 0, default 0).
- `unitPrice`: `Number` (min 0, required).
- `trackStock`: `Boolean` (default true) — When false, item is treated as a service with no inventory deductions.
- `extraMeta`: `Mixed` (default `{}`) — Auxiliary notes and details.
- Compound Index: `{ tenantId: 1, skuOrCode: 1 }` (unique, `partialFilterExpression: { skuOrCode: { $gt: "" } }`).
- Timestamps: `createdAt`, `updatedAt`.

### 4. `Parchi` (`models/Parchi.js`)
Digital bills/receipts generated for transactions.
- `tenantId`: `ObjectId` (ref: `Tenant`, required, indexed).
- `createdByUserId`: `ObjectId` (ref: `User`, required).
- `parchiNumber`: `String` (required, trim, format: `EP-YYYY-<16-HEX>`).
- `clientName`: `String` (required, trim, max 160).
- `clientPhone`: `String` (trim, max 30, default `""`).
- `clientExtra`: `Mixed` (array of `{ label, value }`, default `[]`).
- `items`: Subdocument array (`parchiItemSchema`, minimum 1 item):
  - `inventoryItemId`: `ObjectId` (ref: `InventoryItem`, default null).
  - `name`: `String` (required, trim, max 160).
  - `quantity`: `Number` (required, min 0.0001).
  - `unitPrice`: `Number` (required, min 0).
- `subtotal`: `Number` (required, min 0).
- `discount`: `Number` (min 0, default 0).
- `grandTotal`: `Number` (required, min 0).
- `paymentMode`: `String` (required, trim, max 60).
- `createdAt`: `Date` (default `Date.now`).
- Compound Index: `{ tenantId: 1, parchiNumber: 1 }` (unique).
- Timestamps: `createdAt`, `updatedAt`.

---

## 4. API Endpoints & Auth Flow

### Authentication Flow
1. Client submits credentials to `/api/auth/login`, `/api/auth/register-tenant`, or `/api/auth/demo`.
2. Backend signs a JWT with payload `{ sub: user._id, tenantId: user.tenantId, role: user.role }` (expires in 7 days).
3. The JWT is attached via `res.cookie("eparchi_session", token, cookieOptions)` with `httpOnly: true`, `sameSite: "strict"`, and `path: "/"`.
4. The `authenticate` middleware inspects `req.cookies.eparchi_session` or `Authorization: Bearer <token>`.
5. It verifies the signature, fetches `User.findById(payload.sub)`, validates that `String(user.tenantId) === payload.tenantId`, and attaches `req.user` and `req.tenantId`.
6. `requireRole(...roles)` ensures the user role has sufficient privileges (e.g. `owner` for settings & team management).

### Endpoints Table

| Method | Path | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Healthcheck and MongoDB connection state |
| `POST` | `/api/auth/register-tenant` | Public | Creates tenant and owner user, issues session cookie |
| `POST` | `/api/auth/login` | Public | Authenticates credentials, issues session cookie |
| `POST` | `/api/auth/demo` | Public | Provisions/logs into demo tenant & seeded user/inventory |
| `GET` | `/api/auth/me` | Authenticated | Fetches current user and tenant details |
| `POST` | `/api/auth/logout` | Authenticated | Clears session cookie (204 No Content) |
| `PATCH` | `/api/tenant` | Auth + Owner | Updates business profile and branding settings |
| `PUT` | `/api/tenant/settings` | Auth + Owner | Alias for tenant settings update |
| `GET` | `/api/tenant/staff` | Auth + Owner | Lists staff members in current tenant |
| `POST` | `/api/tenant/staff` | Auth + Owner | Adds new staff user under current tenant |
| `DELETE`| `/api/tenant/staff/:userId` | Auth + Owner | Removes staff member by ID |
| `GET` | `/api/inventory` | Authenticated | Lists all inventory items for tenant |
| `POST` | `/api/inventory` | Authenticated | Creates a new inventory/service item |
| `PATCH` | `/api/inventory/:itemId` | Authenticated | Updates inventory item fields |
| `DELETE`| `/api/inventory/:itemId` | Authenticated | Deletes inventory item |
| `GET` | `/api/parchis` | Authenticated | Lists latest 500 parchis for tenant |
| `POST` | `/api/parchis` | Authenticated | Creates parchi within transaction, decrements stock atomically |
| `GET` | `/api/dashboard` | Authenticated | Aggregates today's revenue (IST), total count, low stock items |

---

## 5. Frontend Routing & State

### Pages & Navigation
- **`/` (`public/index.html`):** Public portal. Contains Login, Business Registration, and 1-Click Demo buttons. Checks `/api/auth/me` on load and forwards authenticated users to `/workspace.html`.
- **`/workspace.html`:** The primary single-page application.
  - Subviews toggled via `showView(viewName)`:
    - **`dashboardView`:** Displays today's revenue, total bills count, low-stock warnings, and full inventory manager table with search/filtering.
    - **`createView`:** Parchi creation wizard with locked business details, client details, dynamic fields per business type, line item repeater with inventory autofill, and receipt preview (`#receiptPage`).
    - **`historyView`:** Searchable history cards of previous parchis with a "Use client" action to autofill returning customers.
    - **`settingsView`:** Profile and branding configuration (logo, digital signature pad, auto-generated round/rectangular stamp, watermark, theme color) and staff member management.

### Dynamic Business Modes (`MODES` in `app.js`)
Tenant `businessType` configures the terminology and extra client fields:
- **`shop` (General Shop):** Registration: *Reg. / GST No.*, Client: *Customer*. Extra fields: `imei` (IMEI / Serial Number), `clientAddress` (Customer address).
- **`clinic` (Clinic / Doctor):** Registration: *MCI / Reg. No.*, Client: *Patient*. Extra fields: `age` (Age), `gender` (Female/Male/Other), `symptoms` (Symptoms / notes).
- **`institute` (Coaching / Institute):** Registration: *Institute / Reg. No.*, Client: *Student*. Extra fields: `course` (Course), `batch` (Class / Batch).

### Client State & API Wrapper
- State variables: `currentUser`, `currentTenant`, `currentMode`, `latestBill`, `billsCache`, `inventoryCache`, `inventorySearchTerm`.
- Central API client `apiRequest(url, options)`: Automatically handles `credentials: "same-origin"`, sets `Content-Type: application/json`, intercepts `401 Unauthorized` to redirect to `/`, and formats error messages.

---

## 6. Coding Conventions & Gotchas

### Error Handling & Response Formats
- **Success Responses:** JSON objects with root entity keys: `{ user, tenant }`, `{ items }`, `{ parchis }`, `{ parchi }`, `{ item }`, `{ users }`.
- **Error Responses:** Unified format `{ error: "<descriptive message>" }`.
- **Status Codes:**
  - `400`: Validation failures, invalid ObjectIds (`CastError`), malformed JSON bodies.
  - `401`: Missing or invalid session tokens.
  - `403`: Insufficient role permissions (`requireRole`).
  - `404`: Entity or API endpoint not found.
  - `409`: Conflict (duplicate email, duplicate SKU per tenant, insufficient stock).
  - `413`: Payload too large (`entity.too.large` on image assets > 2MB limit).
  - `500`: Unexpected server errors.

### Environment Variables Used
- `PORT`: Network port for Express server (default `3000`).
- `MONGODB_URI`: MongoDB connection string (checked at server launch).
- `JWT_SECRET`: Secret key for JWT signing (enforces minimum length >= 32 characters).
- `NODE_ENV`: Checked in auth cookie settings (`secure: true` when `production`).

### Gotchas & Architecture Considerations
1. **MongoDB Replica Set for Transactions:** `POST /api/parchis` uses Mongoose sessions and `withTransaction(...)` to guarantee atomicity when validating stock and decrementing quantities. Local MongoDB environments running standalone instances without a replica set will reject this transaction.
2. **Branding Assets Base64 Storage:** Logos, stamps, and signatures are stored as Base64 strings directly in the MongoDB `Tenant` document (up to 500 KB per asset). Express limits JSON payloads to `2mb`.
3. **No Pagination on Parchis Query:** `GET /api/parchis` returns up to 500 records in one call.
4. **Timezone in Dashboard Aggregation:** Daily revenue aggregates start from midnight in Indian Standard Time (`Asia/Kolkata`, `+05:30`), regardless of host system time.
5. **Business Type Mode Mapping:** Backend `models/Tenant.js` defines `enum: ["shop", "clinic", "coaching"]`. Frontend `app.js` maps `coaching` to the mode key `institute`.
6. **Express Static Extension:** `express.static` uses `{ extensions: ["html"] }`, so `/workspace` and `/workspace.html` serve the same file.
