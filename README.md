# COSKO — Multi-Store Enterprise Retail & POS Platform

> **Copyright © 2026 Mohammad Hasan — All Rights Reserved.**  
> **Proprietary & Confidential Software.** Unauthorized copying, modification, distribution, sublicensing, reverse engineering, or commercial use without prior written consent from Mohammad Hasan is strictly prohibited.

---

COSKO is an enterprise-grade, multi-store retail management, point-of-sale (POS), inventory distribution, and double-entry accounting platform. Engineered on **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, and **MySQL 8+** with **Prisma ORM**, COSKO delivers complete store isolation, strict 3-role role-based access control (RBAC), atomic multi-product procurement, Cloudflare R2 object storage for financial payment proofs, and distributed Pusher realtime synchronization.

---

## Table of Contents

1. [System Overview & Key Features](#system-overview--key-features)
2. [Technology Stack](#technology-stack)
3. [Exact 3-Role Architecture & Security Clearances](#exact-3-role-architecture--security-clearances)
4. [Multi-Store Topology & Store Isolation](#multi-store-topology--store-isolation)
5. [Core Business Modules](#core-business-modules)
   - [POS / Sales Terminal & WhatsApp Invoices](#1-pos--sales-terminal--whatsapp-invoices)
   - [Inventory & Multi-Store Stock Tracking](#2-inventory--multi-store-stock-tracking)
   - [Purchases, Multi-Product Orders & Supplier Payments](#3-purchases-multi-product-orders--supplier-payments)
   - [Customer Management & Service Store Association](#4-customer-management--service-store-association)
   - [Vendor Directory & Procurement](#5-vendor-directory--procurement)
   - [Expenses & Receipt Verification](#6-expenses--receipt-verification)
   - [Double-Entry Accounting & Financial Reports](#7-double-entry-accounting--financial-reports)
   - [Attendance & Live Work Activity Monitoring](#8-attendance--live-work-activity-monitoring)
   - [Delete Request Approval Workflow](#9-delete-request-approval-workflow)
6. [Single Source of Truth Forms (SSTF)](#single-source-of-truth-forms-sstf)
7. [Cloudflare R2 / S3 Object Storage](#cloudflare-r2--s3-object-storage)
8. [Distributed Pusher Realtime & Event Outbox](#distributed-pusher-realtime--event-outbox)
9. [Authentication & Session Security Architecture](#authentication--session-security-architecture)
10. [Local Development & Installation](#local-development--installation)
11. [Complete `.env` Environment Variables Guide](#complete-env-environment-variables-guide)
12. [Database Setup, Migrations & Seeding](#database-setup-migrations--seeding)
13. [Super Admin Bootstrap Setup](#super-admin-bootstrap-setup)
14. [Development, Testing & Verification Commands](#development-testing--verification-commands)
15. [Production Deployment Guide](#production-deployment-guide)
    - [Self-Hosted VPS / Dedicated Server (Ubuntu, PM2, Nginx)](#a-self-hosted-vps--dedicated-server-pm2--nginx)
    - [Netlify Serverless Deployment](#b-netlify-serverless-deployment)
16. [Security & Backup Best Practices](#security--backup-best-practices)
17. [Critical Production Warnings](#critical-production-warnings)
18. [Project Folder Structure](#project-folder-structure)
19. [Troubleshooting & FAQ](#troubleshooting--faq)
20. [Proprietary License & Intellectual Property](#proprietary-license--intellectual-property)

---

## System Overview & Key Features

- **Strict Multi-Tenant Store Isolation**: Each physical store operates as an isolated operational silo. Cross-store data leaks are prohibited at the API, database query, and WebSocket layer.
- **Authoritative 3-Role Hierarchy**: Super Admin (Level 100), Store Manager (Level 80), and Sales Manager (Level 40). Zero ambiguous or custom roles.
- **Fail-Closed Session Model**: 30-day database-backed sessions with SHA-256 token hashing, single-token binding, and atomic revocation on password change or logout.
- **Atomic Multi-Item POS Terminal**: Rapid barcode/SKU checkout, multi-tender split payment, cash change calculation, and oversell protection via MySQL row-level transaction locks.
- **Clean WhatsApp Digital Receipts**: Instant click-to-chat WhatsApp invoice generation formatted directly for customer communication without exposing internal application URLs or login screens.
- **Full Procurement & Payable Reconciliations**: Purchase orders with multi-line item grids, dynamic HSN/tax calculations, partial payment schedules, and mandatory payment proof attachments.
- **Cloudflare R2 Private Financial Storage**: S3-compatible private object storage with signed URL delivery, strict store ownership tagging, and deletion protection on financial evidence.
- **Double-Entry Financial Accounting**: Automated General Ledger posting on all financial events (sales, purchases, payments, expenses, voids), guaranteeing debits equal credits.
- **Single Source of Truth Forms (SSTF)**: Every business entity is bound to a single master responsive modal component across desktop, tablet, and mobile with keyboard-aware safe viewport scrolling.
- **Live Realtime Collaboration**: Distributed Pusher channels with authenticated store-level authorization (`private-store-<code\>`) and MySQL outbox fallback sync.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Framework** | Next.js 15.5+ (App Router, Server Components & Route Handlers) |
| **Language** | TypeScript 5 (Strict Mode, 100% type coverage across app, tests, scripts) |
| **Runtime & Styling** | React 19, Tailwind CSS 3.4+, PostCSS, Lucide Icons, Heroicons |
| **Database & ORM** | MySQL 8.0+ (InnoDB, Foreign Key Constraints), Prisma ORM 5.22+ |
| **Object Storage** | AWS S3 SDK v3 (Cloudflare R2, AWS S3, MinIO) with Presigned URLs |
| **Realtime Engine** | Pusher Channels (`pusher` server, `pusher-js` client) + MySQL Outbox |
| **Authentication** | Cryptographic JWT (`jsonwebtoken`), Salted `bcryptjs` (Cost Factor 12) |
| **Form Validation** | React Hook Form, Custom Indian GSTIN & Phone Normalization Validators |
| **Analytics & Charts**| Recharts 2.15+ (Dynamic client-side rendering with SSR bypass) |
| **Notifications** | Sonner toast system |
| **Testing** | Automated TSX integration test suites covering security, RBAC, and business logic |

---

## Exact 3-Role Architecture & Security Clearances

COSKO enforces a strict 3-role security hierarchy. No intermediate or arbitrary roles exist:

```
  ┌────────────────────────────────────────────────────────┐
  │                 SUPER ADMIN (Level 100)                │
  │     Enterprise Scope · Full Authority · System Root    │
  └───────────────────────────┬────────────────────────────┘
                              │ Creates & Manages
  ┌───────────────────────────▼────────────────────────────┐
  │                STORE MANAGER (Level 80)                │
  │     Single Store Scope · Inventory · POs · Expenses    │
  └───────────────────────────┬────────────────────────────┘
                              │ Creates & Manages
  ┌───────────────────────────▼────────────────────────────┐
  │                SALES MANAGER (Level 40)                │
  │     Single Store Scope · POS Checkout · Customer 360   │
  └────────────────────────────────────────────────────────┘
```

### 1. Super Admin (Security Level 100)
- **Scope**: Enterprise-wide (`All Stores`).
- **Permissions**: Full unrestricted access to all modules, financial ledgers, audit logs, and settings.
- **Exclusive Privileges**:
  - Store Hub provisioning and management (`/stores`).
  - Inter-store stock transfer authorization and Central Profit recognition (`/central-profit`, `/stock-transfers`).
  - System-wide user administration across all roles (`/users`).
  - Review and execution of entity delete approval requests (`/delete-requests`).
  - Company-wide attendance records and live employee work activity inspection (`/work-activity`, `/attendance`).
  - System settings and corporate branding customization (`/settings`).
- **Invariants**: Protected single account. The active Super Admin cannot delete or deactivate their own session.

### 2. Store Manager (Security Level 80)
- **Scope**: Strictly locked to their single assigned physical store (e.g., `BLR`).
- **Permissions**:
  - Full local store inventory management, store stock levels, and stock adjustments (`/inventory-management`).
  - Local purchase order creation, vendor bill management, and supplier payments (`/purchases`, `/vendors`).
  - Store operational expenses and mandatory receipt uploads (`/expenses`).
  - Local store customer directory and store profile assignment (`/customers`).
  - Full POS sale execution and local store sales history (`/sales`).
  - Local Store P&L and General Ledger inspection (`/accounting`).
  - Staff management: Can create and manage **Sales Managers only** for their assigned store.
- **Restrictions**:
  - Cannot access Central Profit, Store Hub administration, System Settings, or Audit Logs.
  - Cannot create other Store Managers or Super Admins (Level Ceiling enforcement).
  - Cannot view, mutate, or query data from any other store.
  - Hard deletions require submitting a request to the Super Admin via the Delete Approval workflow.

### 3. Sales Manager (Security Level 40)
- **Scope**: Strictly locked to their single assigned physical store (e.g., `BLR`).
- **Permissions**:
  - POS Checkout execution (`/sales`).
  - Sales order history for their assigned store.
  - Customer directory lookup and customer creation (`/customers`).
  - Operational inventory search (cost prices are masked to 0; selling prices visible only).
- **Restrictions**:
  - Strictly blocked from: Purchases, Vendors, Expenses, Accounting, User Management, Stock Transfers, Attendance Management, and Settings.
  - Cannot see product cost prices (`baseCostPrice`) anywhere in the application.

---

## Multi-Store Topology & Store Isolation

COSKO is architected around a multi-node retail network:

1. **Central Warehouse (`CENTRAL`)**:
   - The central distribution and warehousing hub.
   - Primary recipient of bulk manufacturer purchases.
   - Origin of inter-store stock transfers.
   - Tracks corporate gross margin through the Central Profit engine (`/central-profit`).
2. **Physical Retail Stores (e.g., `BLR`, `HYD`, `DEL`, `MUM`, `CHE`)**:
   - Customer-facing retail storefronts.
   - Receive inventory via inter-store transfers from `CENTRAL`.
   - Execute POS sales, track local expenses, manage local supplier invoices, and service walk-in customers.

### Enforcement Invariants
- **Database Level**: Foreign key constraints and compound unique indexes (`productId_storeCode`, `userId_storeCode`) prevent duplicate allocations.
- **API Level**: All `/api/...` endpoints invoke `authPipeline.authenticateRequest()`. If a user with Level < 100 submits a request containing an unauthorized `storeCode`, the server responds with `HTTP 403 Forbidden` and records an audit warning.
- **Query Scoping**: Prisma queries for Store Managers and Sales Managers automatically inject `{ storeCode: caller.storeScope }` into the `where` clause.

---

## Core Business Modules

### 1. POS / Sales Terminal & WhatsApp Invoices
- **Route**: `/sales`
- **Capabilities**:
  - Live product search by SKU, barcode, brand, or model with instant inventory checks.
  - Prevents overselling: Throws `HTTP 409 Insufficient Stock` if requested quantity exceeds store quantity on hand.
  - Multi-tender payment methods: Cash, UPI, Card, Net Banking, and custom tenders.
  - Automated invoice sequencing: Generates sequential bill numbers (e.g., `CS260012`).
  - **WhatsApp Direct Receipt Sharing**: Generates a clean customer summary containing customer name, invoice number, store branch, payment tender, and purchased line items. The message intentionally contains **no internal application URLs** or credentials, protecting customer privacy and internal security.

### 2. Inventory & Multi-Store Stock Tracking
- **Route**: `/inventory-management`, `/stock-transfers`
- **Capabilities**:
  - Multi-store inventory balances tracked in the `Inventory` table per store and SKU.
  - Immutable movement tracking in `InventoryLedger` (FIFO tracking on initial stock, POS sales, refunds, purchase receipts, and transfers).
  - Inter-store stock transfer engine (`/stock-transfers`): Atomic two-phase transfers (Dispatch from source -> Receive at destination) with transfer pricing and margin recognition.
  - Stock adjustments with audit reason codes (Damage, Theft, Stocktake Recalibration, Expired).

### 3. Purchases, Multi-Product Orders & Supplier Payments
- **Route**: `/purchases`, `/vendors`
- **Capabilities**:
  - Purchase Orders with multi-product dynamic item tables, per-item quantity, cost price, GST rate, and HSN code.
  - Automatic payment status management: `Unpaid`, `Partial`, and `Paid`.
  - Reconciled payable formula:
    $$\text{Remaining Balance} = \text{Total Cost} - \text{Paid Amount} - \text{Credit Amount}$$
  - Mandatory payment proof upload (Cloudflare R2 / S3) and UTR / Reference tracking for all payments.
  - Protection against overpayment: Rejects payments exceeding the remaining net balance.

### 4. Customer Management & Service Store Association
- **Route**: `/customers`
- **Capabilities**:
  - Global customer directory with normalized 10-digit mobile numbers (automatically stripping `+91`, leading `0`, and formatting characters).
  - Multi-store customer association: Tracks customer interaction history across multiple stores without duplicating master customer records.
  - Customer 360 overview: Aggregates lifetime purchases, customer tier, total spend, credit balance, and repair tickets.

### 5. Vendor Directory & Procurement
- **Route**: `/vendors`
- **Capabilities**:
  - Supplier master records with contact information, payment terms, and 15-character Indian GSTIN validation.
  - Live payables drill-down: Inspect pending purchase orders, paid vouchers, and outstanding balances per vendor.

### 6. Expenses & Receipt Verification
- **Route**: `/expenses`
- **Capabilities**:
  - Operating expenses categorized by type (Rent, Electricity, Supplies, Logistics, Maintenance).
  - Mandatory invoice/receipt proof upload to Cloudflare R2 object storage.
  - Automatic double-entry posting to the General Ledger upon creation.

### 7. Double-Entry Accounting & Financial Reports
- **Route**: `/accounting`, `/reports`, `/central-profit`
- **Capabilities**:
  - Automated General Ledger: Every transaction writes balanced Debit and Credit rows.
  - Store-level Profit & Loss (P&L) statements: Computes Revenue, Cost of Goods Sold (COGS), Gross Profit, Operating Expenses, and Net Operating Income.
  - Consolidated enterprise P&L and Central Profit reporting for the Super Admin.
  - Double-entry balance invariant: Verifies that Total Debits equal Total Credits across all store ledgers.

### 8. Attendance & Live Work Activity Monitoring
- **Route**: `/attendance`, `/work-activity`
- **Capabilities**:
  - Daily shift check-in and check-out with unique date constraints per user (`userId_localDate`).
  - Automated work activity tracking: Client heartbeats sent every 30 seconds with server-side delta clamping (maximum 45-second cap per heartbeat) to prevent artificial time inflation.
  - Idle detection: Gaps exceeding 2 minutes are separated into distinct work activity intervals.
  - Midnight split calculations: Shift hours crossing 00:00:00 are allocated to their respective calendar days.

### 9. Delete Request Approval Workflow
- **Route**: `/delete-requests`
- **Capabilities**:
  - Store Managers cannot delete business records permanently. Instead, they create a `DeleteRequest` with a stated business reason.
  - Super Admin reviews pending requests with dependency analysis and financial impact warnings.
  - Approved requests execute transactional soft/hard deletes with full audit logging; rejected requests record reviewer notes.

---

## Single Source of Truth Forms (SSTF)

COSKO strictly enforces the **Single Source of Truth Forms (SSTF)** architecture (`docs/ARCHITECTURE_FORMS.md`). Every business entity is managed by exactly **one** master modal component under `@/components/forms/`:

```typescript
import {
  ProductFormModal,
  CustomerFormModal,
  VendorFormModal,
  StoreFormModal,
  PurchaseOrderFormModal,
  SupplierPaymentModal,
  ExpenseFormModal,
  StockTransferModal,
  StockAdjustmentModal,
  UserFormModal,
  CategoryFormModal,
  CategoryTypeModal,
  CategoryTypeManagerModal,
  PaymentMethodModal,
  BrandModal,
  UnitModal,
} from '@/components/forms';
```

### Architectural Invariants
1. **Zero Duplicate / Mini Modals**: Creating inline forms or cut-down "quick modals" is prohibited.
2. **Identical Field Surfaces**: All forms render full validation fields unconditionally.
3. **Viewport Portal & Keyboard Safety**: Modals render through `document.body` portals with dynamic viewport height (`dvh`), ensuring submit buttons remain visible when virtual mobile keyboards open.
4. **Nested Modal Hierarchy**: Parent modals render at `zIndex = 100`. Child modals opened via `+ Add New` (e.g., adding a Category inside a Product modal) render at `zIndex = 110` with automatic focus retention and return.

---

## Cloudflare R2 / S3 Object Storage

File storage is implemented in `src/lib/objectStorage.ts` via the AWS S3 SDK v3:

- **Supported Providers**: Cloudflare R2 (recommended), AWS S3, MinIO, or S3-compatible endpoints.
- **Stored Assets**:
  - Payment proof screenshots (`payment-proofs/YYYY/MM/DD/...`)
  - Expense receipts (`expense-receipts/YYYY/MM/DD/...`)
  - Product catalog images (`products/...`)
  - User avatars and branding logos
- **Security Features**:
  - **MIME & Magic Bytes Validation**: Inspects binary file headers before upload to prevent malicious file uploads.
  - **Private Signed Access**: Private documents are streamed through authorized endpoints (`/api/files/[...key]`) verifying the requester's store ownership.
  - **Financial Immutability**: The storage service strictly refuses delete operations targeting payment proofs and expense receipts to maintain financial audit integrity.
  - **Local Development Fallback**: If S3 credentials are not configured, files are saved locally to `public/uploads/` during development.

---

## Distributed Pusher Realtime & Event Outbox

Realtime state propagation is implemented in `src/lib/realtime.ts` and `src/lib/realtimeClient.ts`:

- **WebSocket Engine**: Pusher Channels.
- **Store-Scoped Private Channels**:
  - `private-store-<storeCode>`: Store-specific POS sales, stock changes, and customer updates.
  - `private-user-<userId>`: User password changes, session revocations, and notifications.
  - `private-enterprise`: Corporate-wide alerts (Super Admin only).
  - `private-attendance`: Shift events and presence updates (Super Admin only).
  - `private-work-activity`: Heartbeats and live telemetry (Super Admin only).
- **Channel Authorization (`/api/realtime/auth`)**:
  - Rejects unauthenticated requests with `HTTP 401`.
  - Rejects cross-store subscription attempts by Store Managers or Sales Managers with `HTTP 403`.
- **Durable Event Outbox**: Every mutation writes an event to the `RealtimeOutbox` MySQL table before broadcasting. If a client temporarily loses WebSocket connectivity, it synchronizes via `/api/realtime/sync` using monotonic sequence cursors.

---

## Authentication & Session Security Architecture

Implemented in `src/lib/authPipeline.ts`, `src/lib/auth.ts`, and `middleware.ts`:

- **Passwords**: Salted bcrypt hashes (12 rounds). Plaintext passwords are never logged or stored.
- **Session Tokens**: JWT containing `userId`, `role`, `securityLevel`, `storeScope`, and a unique session ID (`sid`).
- **Database Session Validation**: Every non-public API request validates the token against the active `UserSession` table in MySQL using SHA-256 token hashes.
- **Single-Token Model**: Sessions can be revoked instantly. If a user logs out or changes their password, all active database sessions are terminated.
- **CSRF Protection**: All state-changing requests validate `Origin` and `Referer` headers against `NEXT_PUBLIC_APP_URL`.
- **Rate Limiting**: Brute-force login protection limits repeated invalid attempts by IP and account.

---

## Local Development & Installation

### Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **npm**: v10.x or higher
- **MySQL**: 8.0+ running locally or on a remote host

### Step-by-Step Setup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/hasanudyavar/Cosko.git
   cd Cosko
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your MySQL credentials, a 32+ character `AUTH_SECRET`, and object storage / Pusher keys (see the next section for full details).

4. **Initialize Database Schema**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Seed Default Data**:
   ```bash
   npm run seed
   ```

6. **Bootstrap Super Admin Account**:
   ```bash
   npx tsx scripts/bootstrap-superadmin.ts admin@cosko.com SuperAdminPassword123!
   ```

7. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Access the application at [http://localhost:4028](http://localhost:4028).

---

## Complete `.env` Environment Variables Guide

| Variable Name | Required | Default / Format | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `mysql://user:pass@host:3306/db?sslaccept=strict` | Authoritative MySQL 8+ connection string. |
| `AUTH_SECRET` | **Yes** | 32+ random characters | Secret key used for signing JWT session tokens. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `http://localhost:4028` | Public URL of the app for CSRF validation and assets. |
| `STORAGE_ENDPOINT` | Optional | `https://<account-id>.r2.cloudflarestorage.com` | S3-compatible storage endpoint URL. |
| `STORAGE_REGION` | Optional | `auto` | Storage bucket region. |
| `STORAGE_BUCKET` | Optional | `cosko-assets` | Target bucket name for file uploads. |
| `STORAGE_ACCESS_KEY` | Optional | S3 Access Key ID | S3 authentication access key. |
| `STORAGE_SECRET_KEY` | Optional | S3 Secret Access Key | S3 authentication secret key. |
| `R2_ACCOUNT_ID` | Optional | Cloudflare Account ID | Native Cloudflare R2 account identifier alias. |
| `R2_BUCKET_NAME` | Optional | R2 Bucket Name | Native Cloudflare R2 bucket name alias. |
| `R2_ACCESS_KEY_ID` | Optional | R2 Access Key | Native Cloudflare R2 access key alias. |
| `R2_SECRET_ACCESS_KEY`| Optional | R2 Secret Key | Native Cloudflare R2 secret key alias. |
| `PUSHER_APP_ID` | Optional | Pusher App ID | Server-side Pusher application ID. |
| `PUSHER_KEY` | Optional | Pusher Key | Server-side Pusher app key. |
| `PUSHER_SECRET` | Optional | Pusher Secret | Server-side Pusher secret key. |
| `PUSHER_CLUSTER` | Optional | `ap2` (or cluster code) | Pusher cluster name. |
| `NEXT_PUBLIC_PUSHER_KEY` | Optional | Pusher Key | Client-side Pusher app key. |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Optional | `ap2` | Client-side Pusher cluster name. |

---

## Database Setup, Migrations & Seeding

### Prisma Commands

- **Validate Schema**:
  ```bash
  npx prisma validate
  ```
- **Generate Client**:
  ```bash
  npx prisma generate
  ```
- **Push Schema Changes to MySQL**:
  ```bash
  npx prisma db push
  ```
- **Inspect Database via GUI**:
  ```bash
  npx prisma studio
  ```

### Database Maintenance Scripts (`scripts/`)
- `npm run seed`: Populates default store hubs (`CENTRAL`, `BLR`, `HYD`, `DEL`, `MUM`), default categories, payment methods, and initial catalog.
- `npx tsx scripts/backup-database.ts`: Creates a JSON snapshot of database records.
- `npx tsx scripts/check-db-state.ts`: Performs a health check on tables, record counts, and relations.
- `npx tsx scripts/clean-database-reset.ts`: Resets transactional data cleanly while preserving store hubs and configuration.
- `npx tsx scripts/empty-db-keep-superadmin.ts`: Purges operational data while preserving the Level 100 Super Admin account.

---

## Super Admin Bootstrap Setup

To create or reset the authoritative Super Admin account on a fresh database:

```bash
npx tsx scripts/bootstrap-superadmin.ts <email> <password>
```

**Requirements**:
- `<email>`: Must be a valid email address.
- `<password>`: Must be at least 12 characters.

**What the script executes**:
1. Creates or updates the user account with `role = 'Super Admin'` and `securityLevel = 100`.
2. Sets `storeScope = 'All Stores'`.
3. Binds the user to all active store hubs in the database.
4. Generates a bcrypt password hash (cost factor 12).
5. Revokes all existing active sessions.
6. Flags `forcePasswordChange = true` so the admin is prompted to set their permanent password upon initial login.

---

## Development, Testing & Verification Commands

All scripts are verified with strict TypeScript compilation:

```bash
# 1. Start development server on port 4028
npm run dev

# 2. Run complete TypeScript type checks (app, tests, scripts)
npm run type-check:all

# 3. Run individual type checks
npm run type-check:app
npm run type-check:tests
npm run type-check:scripts

# 4. Run ESLint across codebase
npm run lint

# 5. Automatically fix ESLint and Prettier formatting
npm run lint:fix
npm run format

# 6. Execute all automated test suites (11 suites, 100% pass)
npm test

# 7. Run individual security and verification test suites
npm run test:security      # 34-layer RBAC and security audit suite
npm run test:phase1        # Phase 1 session, lockout, and password test suite
npm run test:matrix        # Phase 1 direct backend RBAC penetration matrix
npm run test:phase2        # Phase 2 CRUD and delete approval lifecycle tests
npm run test:phase2-realtime # Phase 2 Pusher WebSocket isolation test suite
npm run test:phase3        # Phase 3 object storage & MySQL CRUD test suite
npm run test:deep          # Phase 3 deep penetration & multi-store isolation suite
npm run test:phase4        # Phase 4 root security closure matrix
npm run test:final-phase2  # Final phase 2 verification suite
npm run test:responsive    # Responsive forms & modal portal regression suite
npm run test:hotfix        # Four-issue hotfix verification suite
npm run test:closure       # Final payment proof ownership & WhatsApp verification

# 8. Create production build
npm run build

# 9. Start production server locally
npm start
```

---

## Production Deployment Guide

### A. Self-Hosted VPS / Dedicated Server (PM2 + Nginx)

For high-volume retail deployments on an Ubuntu 22.04+ VPS:

1. **System Prerequisites**:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm nginx mysql-server git
   sudo npm install -g pm2
   ```

2. **Clone and Install**:
   ```bash
   git clone https://github.com/hasanudyavar/Cosko.git /var/www/cosko
   cd /var/www/cosko
   npm install --production=false
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Configure `DATABASE_URL`, a strong `AUTH_SECRET`, and your storage credentials.

4. **Prepare Database**:
   ```bash
   npx prisma generate
   npx prisma db push
   npm run seed
   npx tsx scripts/bootstrap-superadmin.ts admin@yourdomain.com StrongPassword2026!
   ```

5. **Build Application**:
   ```bash
   npm run build
   ```

6. **Configure PM2 Process Manager**:
   Create an ecosystem configuration `ecosystem.config.cjs`:
   ```javascript
   module.exports = {
     apps: [
       {
         name: 'cosko-app',
         script: 'node_modules/next/dist/bin/next',
         args: 'start -p 4028',
         cwd: '/var/www/cosko',
         instances: 'max',
         exec_mode: 'cluster',
         env: {
           NODE_ENV: 'production',
         },
       },
     ],
   };
   ```
   Start the application:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

7. **Configure Nginx Reverse Proxy with SSL**:
   ```nginx
   server {
       listen 80;
       server_name store.yourdomain.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name store.yourdomain.com;

       ssl_certificate /etc/letsencrypt/live/store.yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/store.yourdomain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:4028;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

---

### B. Netlify Serverless Deployment

COSKO is configured for zero-configuration Netlify deployments via `@netlify/plugin-nextjs`.

1. **Remote MySQL Requirement**:
   - Serverless functions on Netlify **cannot** connect to `localhost:3306`.
   - You **must** use an internet-accessible hosted MySQL database (e.g., Aiven, AWS RDS, PlanetScale, DigitalOcean, or Railway).
   - Ensure the connection string includes `?sslaccept=strict` or appropriate SSL query parameters.

2. **Netlify Build Settings**:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `.next`
   - **Plugin**: Configured in `netlify.toml` (`@netlify/plugin-nextjs`).

3. **Netlify Environment Variables**:
   In your Netlify Site Configuration (`Site configuration > Environment variables`), set:
   - `DATABASE_URL`: Hosted MySQL connection string.
   - `AUTH_SECRET`: 32+ character random production secret.
   - `NEXT_PUBLIC_APP_URL`: Your production Netlify domain (e.g., `https://cosko.netlify.app`).
   - `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` (or Cloudflare R2 variables).
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`.

---

## Security & Backup Best Practices

1. **Automated MySQL Dumps**: Schedule daily automated backups:
   ```bash
   mysqldump -u cosko_user -p cosko_db --single-transaction --quick > /backups/cosko_backup_$(date +%F).sql
   ```
2. **Object Storage Retention**: Cloudflare R2 buckets should be configured with Object Lock or lifecycle rules preventing deletion of files under `payment-proofs/` and `expense-receipts/`.
3. **Secret Rotation**: Rotate `AUTH_SECRET` periodically. Rotating this secret immediately invalidates all active sessions across all devices.
4. **HTTPS Everywhere**: Never run production retail POS terminals over unencrypted HTTP. Web Crypto and Secure Cookie flags require HTTPS.

---

## Critical Production Warnings

> [!CAUTION]
> **Do NOT use `localhost` for MySQL on Netlify**: Netlify edge functions execute on a distributed cloud network and cannot reach local databases running on a laptop or workstation. Always use a hosted cloud database for cloud deployments.

> [!WARNING]
> **Do NOT use default `AUTH_SECRET` in production**: The system will log severe security warnings if deployed with the development fallback secret. Always generate a cryptographically strong secret with `openssl rand -hex 32`.

> [!IMPORTANT]
> **Financial Proof Retention Policy**: Payment proofs and expense receipts serve as authoritative legal evidence for tax audits (GSTIN). The application intentionally blocks deletion calls on these objects.

---

## Project Folder Structure

```
├── .env.example                 # Example environment variables
├── .eslintrc.json               # ESLint configuration
├── .gitignore                   # Git ignore rules
├── .prettierrc                  # Prettier code formatting rules
├── README.md                    # Authoritative platform documentation
├── docs/
│   └── ARCHITECTURE_FORMS.md    # Single Source of Truth Forms (SSTF) standard
├── image-hosts.config.mjs       # Authorized remote image domains
├── middleware.ts                # Next.js middleware (JWT auth, CSRF validation)
├── netlify.toml                 # Netlify deployment configuration
├── next.config.mjs              # Next.js build and security headers configuration
├── package.json                 # Project dependencies and npm scripts
├── prisma/
│   └── schema.prisma            # Authoritative MySQL database schema
├── public/
│   ├── assets/images/           # Static brand assets and fallback images
│   ├── cosko-logo.svg           # Vector brand logo
│   └── robots.txt               # Search engine crawler policies
├── scripts/
│   ├── activate-stores.ts       # Store operational initialization
│   ├── backup-database.ts       # Database backup snapshot utility
│   ├── bootstrap-superadmin.ts  # Super Admin bootstrap and password reset tool
│   ├── check-db-state.ts        # Database health check utility
│   ├── clean-database-reset.ts  # Clean database reset utility
│   ├── empty-db-keep-superadmin.ts # Purge demo data while keeping Super Admin
│   ├── run-security-tests.ts    # Automated security test runner
│   ├── seed-mysql.ts            # Default data seeder
│   └── (module verification & migration scripts)
├── src/
│   ├── app/
│   │   ├── (routes: accounting, attendance, audit-logs, categories,
│   │   │    central-profit, customers, dashboard, delete-requests,
│   │   │    employees, expenses, inventory-management, purchases,
│   │   │    reports, sales, settings, sign-up-login, stock-transfers,
│   │   │    stores, users, vendors, work-activity)
│   │   └── api/                 # REST endpoints with authPipeline & store isolation
│   ├── components/
│   │   ├── forms/               # SSTF master form modals (Product, Customer, PO, etc.)
│   │   ├── ui/                  # Design system primitives (Modal, CustomSelect, etc.)
│   │   └── (Layout: AppLayout, Sidebar, Topbar, BottomNav, ActivityTracker)
│   ├── context/
│   │   └── AppContext.tsx       # Global application state and realtime subscriber
│   ├── lib/
│   │   ├── auth.ts              # Password hashing & JWT token signatures
│   │   ├── authPipeline.ts      # Authoritative request authentication pipeline
│   │   ├── db.ts                # PrismaClient singleton
│   │   ├── envValidation.ts     # Environment validation helper
│   │   ├── gstUtils.ts          # Indian GSTIN validation & tax calculation
│   │   ├── idempotency.ts       # Transaction idempotency protection
│   │   ├── mysqlSync.ts         # Frontend API integration layer
│   │   ├── objectStorage.ts     # Cloudflare R2 / S3 file storage client
│   │   ├── paymentValidator.ts  # Purchase order & sale financial validation
│   │   ├── phoneUtils.ts        # Indian 10-digit mobile number normalization
│   │   ├── rateLimit.ts         # Brute-force protection & request throttling
│   │   ├── rbacEngine.ts        # 3-role permission matrix & navigation grouping
│   │   ├── realtime.ts          # Pusher broadcaster & MySQL outbox writer
│   │   ├── realtimeClient.ts    # Pusher client-side subscription manager
│   │   ├── sequenceUtils.ts     # Sequential order and invoice numbering
│   │   ├── services/            # Domain services (Accounting, Activity, Sales, etc.)
│   │   └── whatsappInvoice.ts   # WhatsApp click-to-chat invoice generator
│   └── styles/
│       ├── index.css            # Global theme variables, typography, and scrollbars
│       └── tailwind.css         # Tailwind directives
├── tailwind.config.js           # Tailwind CSS design system configuration
└── tests/                       # Automated regression, security & integration test suites
```

---

## Troubleshooting & FAQ

### 1. "401 Unauthorized" on API Routes
- **Cause**: Missing, expired, or revoked session cookie (`cosko_session`).
- **Solution**: Log in at `/sign-up-login`. If using automated scripts or curl, supply `Cookie: cosko_session=<token>` or `Authorization: Bearer <token>`.

### 2. "403 Forbidden" on Store Operations
- **Cause**: User attempted to access, query, or mutate an entity belonging to a store other than their assigned `storeScope`.
- **Solution**: Store Managers and Sales Managers are strictly locked to their assigned store. To view data across all stores, log in as **Super Admin**.

### 3. Netlify Build Fails with "Database Connection Error"
- **Cause**: `DATABASE_URL` is pointing to `localhost` or an unreachable IP.
- **Solution**: Configure a publicly accessible cloud MySQL instance (e.g., Aiven, PlanetScale, AWS RDS) with proper firewall/allowlist rules (`0.0.0.0/0` or Netlify IP ranges).

### 4. Images or Payment Proofs Fail to Upload
- **Cause**: Cloudflare R2 / S3 credentials missing or invalid in `.env`.
- **Solution**: Check `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, and `STORAGE_SECRET_KEY`. Ensure the bucket exists and permissions permit `s3:PutObject` and `s3:GetObject`.

### 5. Super Admin Password Lost or Inaccessible
- **Solution**: Execute the bootstrap script directly from the server CLI:
  ```bash
  npx tsx scripts/bootstrap-superadmin.ts admin@cosko.com NewSecurePassword123!
  ```

---

## Proprietary License & Intellectual Property

**Copyright © 2026 Mohammad Hasan (@hasanudyavar) — All Rights Reserved.**

This repository, source code, system architecture, database design, user interface components, and all accompanying documentation (collectively, the "Software") are the exclusive intellectual property and proprietary assets of **Mohammad Hasan** ("Author", "Licensor", "Owner").

### Proprietary Terms & Restrictions

1. **Exclusive Ownership & IP Retention**:
   Sole legal and equitable ownership, title, copyright, patent rights, trade secrets, and all other intellectual property rights in and to the Software remain perpetually and exclusively with **Mohammad Hasan**. No ownership or intellectual property rights are transferred to any party by granting access to this repository.

2. **Prohibited Actions**:
   Without express, prior written authorization executed by Mohammad Hasan, you are strictly prohibited from:
   - **Copying & Reproduction**: Copying, duplicating, cloning, mirroring, or reproducing the source code or any portion of the platform.
   - **Modification & Derivative Works**: Modifying, altering, adapting, translating, or creating derivative works of this codebase or its database structures.
   - **Redistribution & Sublicensing**: Distributing, publishing, transferring, broadcasting, sublicensing, leasing, renting, assigning, or making the Software available to third parties.
   - **Reselling & Commercial Exploitation**: Reselling, charging fees for, white-labeling, or hosting the Software as a service (SaaS) or managed service.
   - **Reverse Engineering**: Decompiling, reverse engineering, disassembling, decrypting, or attempting to reconstruct the source algorithms or architecture.

3. **Client & Enterprise Usage**:
   Client deployment, institutional utilization, or operational installation of the Software is permitted **strictly and exclusively** through a separate, executed written commercial license agreement with Mohammad Hasan. Any installation, staging, deployment, or runtime execution outside an active written commercial agreement constitutes willful intellectual property infringement.

4. **No Implied Rights**:
   No license, immunity, or right is granted, whether by implication, estoppel, or otherwise, except as expressly stated in a valid written contract executed by Mohammad Hasan.

For commercial licensing, enterprise deployment inquiries, or authorization requests, please contact:  
**Mohammad Hasan** — [mohammadhasan16114@gmail.com](mailto:mohammadhasan16114@gmail.com)  
**Official Repository**: [https://github.com/hasanudyavar/Cosko](https://github.com/hasanudyavar/Cosko)

*Refer to the root [`LICENSE`](file:///c:/Users/admin/Downloads/storecommand/LICENSE) file for the full legal terms and conditions.*