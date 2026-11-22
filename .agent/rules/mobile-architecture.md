# eParchi Mobile Architecture Document

## 1. System Overview

eParchi is a multi-tenant digital billing and inventory management application designed for Indian micro, small, and medium businesses (MSMEs). The target architecture introduces a premium native Android application inside `/mobile`, operating alongside the existing Vanilla JavaScript single-page web application (`/public`) while sharing a single Node.js + Express backend and MongoDB database.

```
┌─────────────────────────────────┐      ┌───────────────────────────────────┐
│     Existing Web Client         │      │     New Android Mobile Client     │
│   (Vanilla JS SPA in /public)   │      │  (React Native + Expo in /mobile) │
└────────────────┬────────────────┘      └─────────────────┬─────────────────┘
                 │                                         │
       Cookie / Same-Origin                     Authorization: Bearer <JWT>
                 │                                         │
                 ▼                                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       Express 4.x REST Backend (server.js)                 │
│  - /api/auth        - /api/tenant       - /api/inventory                   │
│  - /api/parchis     - /api/dashboard    - /api/whatsapp                    │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                         Mongoose 8.x ODM Connection
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas Replica Set (Database)                    │
│  - Multi-tenant shared collections: Tenants, Users, InventoryItems, Parchis│
│  - ACID Multi-Document Transactions for atomic stock deductions            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Selection for Mobile

| Category | Library / Tool | Version Target | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Framework** | React Native + Expo | SDK ~52 | Modern Android runtime, battle-tested native modules, unified workflow |
| **Language** | TypeScript | `^5.3.0` | Strict type safety (`"strict": true`), shared types with backend entities |
| **Routing** | Expo Router | `^4.0.0` | File-system-based routing with native navigation, nested tabs, typed routes |
| **State & Cache** | TanStack React Query | `^5.60.0` | Server-state caching, automatic background revalidation, optimistic updates |
| **Secure Storage** | `expo-secure-store` | Latest Expo | Hardware-backed encrypted storage for JWT session tokens and user credentials |
| **Form Management** | React Hook Form + Zod | `^7.53.0` / `^3.23.0` | Performant non-re-rendering form controls with strict schema validation |
| **Animations** | React Native Reanimated | `^3.16.0` | 60/120fps UI thread animations for modals, transitions, skeleton loaders |
| **PDF Generation** | `expo-print` + HTML templates | Latest Expo | Deterministic client-side vector PDF generation matching official branded receipt |
| **File & Sharing** | `expo-file-system` + `expo-sharing` | Latest Expo | Safe scoped sandbox file storage and Android native intent sharing sheet |
| **Network Client** | Axios / Typed Fetch | Custom Client | Bearer token injection, unified error parsing, retry and timeout handling |

---

## 3. Directory Structure (`/mobile`)

```
mobile/
├── app/                              # Expo Router file-system routes
│   ├── _layout.tsx                   # Root layout (QueryProvider, AuthProvider, ThemeProvider)
│   ├── index.tsx                     # Entry splash & session restoration
│   ├── (auth)/                       # Authentication route group
│   │   ├── _layout.tsx               # Auth stack layout
│   │   ├── login.tsx                 # Owner/Staff login screen
│   │   ├── register.tsx              # Business registration wizard
│   │   └── demo.tsx                  # 1-Click interactive demo launcher
│   └── (app)/                        # Authenticated workspace route group
│       ├── _layout.tsx               # Bottom tabs navigator with custom styling
│       ├── dashboard.tsx             # Business metrics & quick actions
│       ├── inventory/                # Inventory management stack
│       │   ├── index.tsx             # Inventory list with live search and filter
│       │   ├── add.tsx               # Add product/service modal
│       │   └── [id].tsx              # Edit product/service modal
│       ├── parchis/                  # Bill generation & history
│       │   ├── index.tsx             # Bill history list with filters
│       │   ├── create.tsx            # Multi-step eParchi creation wizard
│       │   ├── [id].tsx              # Bill detail & receipt viewer
│       │   └── success.tsx           # Bill creation success & WhatsApp sharing
│       └── settings/                 # Business settings & team
│           ├── index.tsx             # Business profile & branding settings
│           └── staff.tsx             # Staff management (Owner only)
├── src/
│   ├── components/
│   │   ├── common/                   # Button, Input, Select, Card, Badge, Modal, Header
│   │   ├── forms/                    # Controlled FormInput, CurrencyInput, StepperInput
│   │   ├── loaders/                  # SkeletonDashboard, SkeletonCard, LoadingSpinner
│   │   └── feedback/                 # ErrorBanner, EmptyState, Toast
│   ├── features/
│   │   ├── auth/                     # Auth context, useLogin, useRegister, useDemo
│   │   ├── dashboard/                # useDashboardStats, RevenueChart, LowStockList
│   │   ├── inventory/                # useInventoryList, useInventoryMutations, ProductCard
│   │   ├── parchis/                  # useCreateParchi, useParchiList, ParchiCalculator
│   │   ├── receipt/                  # generateReceiptHtml, generateReceiptPdf, ReceiptView
│   │   ├── whatsapp/                 # shareViaWhatsApp, sendCloudWhatsAppMessage
│   │   └── settings/                 # useUpdateBranding, useStaffMembers
│   ├── services/
│   │   ├── api.ts                    # Base HTTP client with Bearer auth injection
│   │   ├── auth.service.ts           # Auth endpoints wrapper
│   │   ├── inventory.service.ts      # Inventory endpoints wrapper
│   │   ├── parchis.service.ts        # Parchi endpoints wrapper
│   │   ├── tenant.service.ts         # Tenant & staff endpoints wrapper
│   │   └── whatsapp.service.ts       # WhatsApp delivery wrapper
│   ├── theme/
│   │   ├── colors.ts                 # eParchi Teal, Slate, Emerald, Coral palette
│   │   ├── typography.ts             # Font families, sizes, line heights, weights
│   │   ├── spacing.ts                # 4px grid spacing system
│   │   └── shadows.ts                # Android elevation tokens
│   ├── utils/
│   │   ├── formatters.ts             # Indian currency (₹), IST dates, phone numbers
│   │   ├── validation.ts             # Zod validation schemas
│   │   └── storage.ts                # SecureStore wrappers with error handling
│   └── types/
│       ├── api.types.ts              # API request & response types
│       ├── models.types.ts           # Tenant, User, InventoryItem, Parchi
│       └── navigation.types.ts       # Typed route parameters
├── assets/                           # App icons, splash image, vector graphics
├── app.json                          # Expo configuration & Android package details
├── eas.json                          # Expo Application Services build configuration
├── package.json                      # Mobile-isolated dependencies
└── tsconfig.json                     # Strict TypeScript configuration
```

---

## 4. Authentication & Security Architecture

1. **Dual Auth Mechanism**:
   - The backend `authenticate` middleware (`middleware/auth.js`) checks:
     `const token = req.cookies.eparchi_session || bearer;`
   - Mobile sends `Authorization: Bearer <token>` in every authenticated request.
   - Session tokens are stored in Android KeyStore via `expo-secure-store`.
   - On 401 response, the mobile client intercepts the error, clears `SecureStore`, resets QueryClient, and redirects to `/(auth)/login`.

2. **Strict Multi-Tenancy & Trust Boundaries**:
   - The mobile application **never** submits `tenantId` to query or mutate business resources.
   - The backend validates the JWT, decodes `payload.tenantId`, queries the database for the active user, and binds `req.tenantId = user.tenantId`.
   - All database queries filter strictly on `{ tenantId: req.tenantId }`.

3. **No Secrets in Bundle**:
   - The mobile bundle contains only public configuration (`API_BASE_URL`).
   - WhatsApp Cloud API credentials, database URIs, and JWT signing keys reside exclusively on the server in `.env`.

---

## 5. Offline & Network Strategy

- Mobile billing in eParchi must guarantee inventory consistency via ACID transactions.
- Offline creation is deliberately disallowed because atomic stock decrement requires an active database session.
- TanStack Query provides resilient caching for:
  - Inventory list (cached with 5-minute stale time; invalidated on add/edit/delete/parchi creation).
  - Business profile & branding (cached with 1-hour stale time).
  - Dashboard metrics (cached with 1-minute stale time; refetched on pull-to-refresh).
- Network timeouts are set to 15 seconds with intelligent retry on idempotent GET requests.

---

## 6. Receipt Generation & WhatsApp Architecture

### Method A — Native Share Sheet (Direct Client Generation)
1. Bill confirmation creates the parchi on the backend and receives the authoritative `parchi` object with the unique `parchiNumber`.
2. Mobile generates an HTML string with complete branding (business name, logo/stamp base64, UPI payment QR code, line items, totals).
3. `expo-print.printToFileAsync()` converts the HTML to a vector PDF in the app's cache directory.
4. `expo-sharing.shareAsync()` opens the native Android Intent sharing sheet with MIME type `application/pdf` and prefilled message text.
5. User selects WhatsApp (or any sharing target) and sends the document directly to the client's phone number.

### Method B — Meta WhatsApp Business Cloud API (Server-Side Automated Delivery)
1. Backend route `POST /api/whatsapp/send` accepts `{ parchiId, phone }`.
2. Backend verifies tenant ownership of the bill, formats the official Meta WhatsApp Cloud API template payload or media message with signed receipt URL.
3. Meta webhook endpoint `POST /api/whatsapp/webhook` verifies signature (`X-Hub-Signature-256`) and processes message status callbacks (`sent`, `delivered`, `read`, `failed`).
4. Mobile displays real-time delivery status indicator when available.
