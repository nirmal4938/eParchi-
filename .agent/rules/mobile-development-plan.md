# eParchi Mobile Development Plan

## Roadmap Overview

This document defines the step-by-step engineering roadmap for implementing the native Android application inside `/mobile` and connecting it cleanly with the existing eParchi2 backend without breaking existing web features or data.

---

## Phase Breakdown

### Phase 0 — Audit & Architecture (Completed)
- [x] Full source code inspection (`server.js`, `models/`, `routes/`, `public/`, `.env`).
- [x] Verified authentication, multi-tenancy, transactional stock deduction, dynamic business modes.
- [x] Verified MongoDB connection and replica set transaction support.
- [x] Created `mobile-architecture.md`, `mobile-api-contract.md`, `mobile-development-plan.md`.

### Phase 1 — Mobile Application Foundation (`/mobile`)
- [ ] Initialize `/mobile` with Expo SDK 52 + React Native + TypeScript strict mode.
- [ ] Configure `app.json`, `eas.json`, `tsconfig.json`.
- [ ] Set up directory structure: `app/`, `src/components/`, `src/features/`, `src/services/`, `src/theme/`, `src/utils/`, `src/types/`.
- [ ] Install essential packages:
  - `@tanstack/react-query`
  - `expo-router`
  - `expo-secure-store`
  - `expo-print`
  - `expo-sharing`
  - `expo-file-system`
  - `react-hook-form`
  - `zod`
  - `@hookform/resolvers`
  - `react-native-reanimated`
  - `react-native-safe-area-context`
  - `react-native-svg`
  - `@expo/vector-icons`
- [ ] Verify clean build/compilation and TypeScript type checks.

### Phase 2 — Design System & Tokens
- [ ] Centralized design tokens in `src/theme/`:
  - Primary Teal palette (`#0F766E`, `#115E59`, `#134E4A`, `#CCFBF1`, `#F0FDFA`).
  - Neutral canvas palette (`#F7F9FA`, `#FFFFFF`, `#17212B`, `#64748B`, `#E2E8F0`).
  - Semantic status colors (Success `#16A34A`, Warning `#F59E0B`, Error `#DC2626`).
  - Typography scale (Sizes, weights, line heights, tabular figures).
  - Spacing tokens (4px standard grid), border radii, elevation shadows.
- [ ] Reusable UI components:
  - `Button` (Primary, Outline, Quiet, Danger, with loading spinner).
  - `Input` & `FormInput` (With label, error state, helper text, left/right icons).
  - `Select` & `SegmentedControl`.
  - `Card` (Subtle border, soft elevation, consistent padding).
  - `Badge` (Role, stock status, payment mode).
  - `SkeletonLoader` (Animated shimmer for dashboard, cards, lists).
  - `EmptyState` (Illustration, title, description, action button).

### Phase 3 — Backend Compatibility Layer
- [ ] Ensure `POST /api/auth/login`, `POST /api/auth/register-tenant`, and `POST /api/auth/demo` return the signed `token` string in their JSON body in addition to setting the session cookie.
- [ ] Implement backend WhatsApp Cloud API endpoints (`POST /api/whatsapp/send`, `POST /api/whatsapp/webhook`, `GET /api/whatsapp/webhook`) in `routes/whatsapp.js`.
- [ ] Verify that web application behavior remains 100% unaffected.

### Phase 4 — Authentication & Session Management
- [ ] Auth Service & API client with automatic `Authorization: Bearer <token>` injection.
- [ ] Secure storage wrapper (`src/utils/storage.ts`) using `expo-secure-store`.
- [ ] `AuthContext` with session restoration on splash screen.
- [ ] Login screen (`app/(auth)/login.tsx`) with password toggle, keyboard handling, error feedback.
- [ ] Business registration wizard (`app/(auth)/register.tsx`) with business type selector (`shop`, `clinic`, `coaching`).
- [ ] 1-Click Interactive Demo screen (`app/(auth)/demo.tsx`) with pre-generated stamps and sample mobile store.
- [ ] Logout action with secure token cleanup and query cache clear.

### Phase 5 — Main Navigation & Dashboard
- [ ] Root navigation with Expo Router (`_layout.tsx`, tabs navigation for authenticated workspace).
- [ ] Bottom tabs: Dashboard, Inventory, Create eParchi, History, Settings.
- [ ] Dashboard screen (`app/(app)/dashboard.tsx`):
  - Greeting & Business Name Header.
  - KPI Cards: Today's Revenue (IST format ₹), Today's Bills Count, Total Bills Count.
  - Low-stock warning banner and list with unit counts.
  - Quick action floating/header buttons.
  - Pull-to-refresh support.

### Phase 6 — Inventory Management
- [ ] Inventory list screen (`app/(app)/inventory/index.tsx`):
  - Real-time search by name, SKU/code, or category.
  - Category pill filter.
  - Stock badges: In Stock, Low Stock (<= 5), Out of Stock, Service (no tracking).
- [ ] Add Item modal (`app/(app)/inventory/add.tsx`) with stock tracking toggle.
- [ ] Edit Item modal (`app/(app)/inventory/[id].tsx`).
- [ ] Delete confirmation with safety dialog.

### Phase 7 — Create eParchi Workflow
- [ ] Multi-step / seamless bill creation wizard (`app/(app)/parchis/create.tsx`):
  - **Step 1:** Client / Customer details (Name, 10-digit mobile, plus dynamic fields based on business type: IMEI/Address for shop, Age/Gender/Symptoms for clinic, Course/Batch for coaching).
  - **Step 2:** Product selection (Search existing inventory, view available stock, pick quantity, adjust price if permitted, or add custom manual item/service).
  - **Step 3:** Financial summary (Auto-calculated subtotal, discount with validation <= subtotal, grand total, payment mode selector: Cash, UPI / QR, Card, Other).
  - **Step 4:** Atomic submission calling `POST /api/parchis` with loading state preventing duplicate clicks.
- [ ] Success screen (`app/(app)/parchis/success.tsx`) with instant receipt preview and sharing options.

### Phase 8 — Receipt Generation & WhatsApp Delivery
- [ ] Professional HTML/CSS receipt template matching eParchi branding (logo, signature, round stamp, UPI QR code, items table, tax/note disclaimer).
- [ ] **Method A (WhatsApp Native Sharing):**
  - Render vector PDF using `expo-print`.
  - Share via `expo-sharing` with prefilled WhatsApp message text.
- [ ] **Method B (WhatsApp Business Cloud API):**
  - Trigger backend Cloud API delivery.
  - Display delivery status badge (sent, delivered, read, failed).

### Phase 9 — Bill History & Details
- [ ] Bill listing screen (`app/(app)/parchis/index.tsx`) with search by client name, mobile, or bill number.
- [ ] Date filtering and payment mode filtering.
- [ ] Bill detail modal (`app/(app)/parchis/[id].tsx`):
  - Complete line items breakdown.
  - Action buttons: View Receipt, Download PDF, Resend via WhatsApp, "Use client" for fast new bill.

### Phase 10 — Business Settings & Staff
- [ ] Business profile screen (`app/(app)/settings/index.tsx`):
  - Edit business name, type, phone, registration number, address, UPI ID.
  - Brand assets upload/picker (Logo, digital signature pad, stamp).
- [ ] Staff management (`app/(app)/settings/staff.tsx`):
  - Owner-only view of staff members.
  - Add new staff account.
  - Remove staff account with confirmation.

### Phase 11 — Testing & Verification
- [ ] TypeScript strict mode compilation (`tsc --noEmit`).
- [ ] Unit & integration tests for Parchi calculation, validation schemas, and API service.
- [ ] End-to-end verification against local backend:
  - Auth, Demo login, Session persistence.
  - Stock decrement transaction integrity.
  - Method A & B WhatsApp sharing.

### Phase 12 — Android Build & Release Preparation
- [ ] Configure `app.json` with package `com.eparchi.app`, version `1.0.0`, permissions.
- [ ] Generate Android adaptive icons and splash screens.
- [ ] Set up `eas.json` for development and production AAB / APK builds.
- [ ] Verify Android release compilation.
