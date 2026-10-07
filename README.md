# Rismos — Enterprise Multi-Store Retail Management & POS Platform

> **Run Retail. Smarter.**  
> **Copyright © 2026 Mohammad Hasan — All Rights Reserved.**  
> **Proprietary & Confidential Software.** Unauthorized copying, modification, distribution, sublicensing, reverse engineering, or commercial use without prior written consent from Mohammad Hasan is strictly prohibited.

---

**Rismos** is a high-performance, white-label enterprise retail platform, point-of-sale (POS) terminal, multi-store inventory distribution system, and double-entry accounting engine. Built on **Next.js 15 (App Router)**, **React 19**, **TypeScript 5 (Strict Mode)**, **Tailwind CSS**, and **MySQL 8+** with **Prisma ORM**, Rismos delivers true store isolation, an authoritative 3-role RBAC security matrix, global international tax localization (IN, AE, SA, GB, US, AU, ZA), a field-mapped invoice template engine with dedicated `@media print` output, Cloudflare R2 financial proof storage, and distributed Pusher realtime synchronization.

---

## Table of Contents

1. [System Overview & Key Features](#system-overview--key-features)
2. [Rismos White-Label Architecture](#rismos-white-label-architecture)
3. [Technology Stack](#technology-stack)
4. [Exact 3-Role Architecture & Security Clearances](#exact-3-role-architecture--security-clearances)
5. [Multi-Store Topology & Store Isolation](#multi-store-topology--store-isolation)
6. [International Tax, Currency & Localization Engine](#international-tax-currency--localization-engine)
7. [Structured Invoice Template & Dedicated Print Engine](#structured-invoice-template--dedicated-print-engine)
8. [Core Business Modules](#core-business-modules)
   - [POS / Sales Terminal & Direct Logo Navigation](#1-pos--sales-terminal--direct-logo-navigation)
   - [Inventory & Multi-Store Stock Tracking](#2-inventory--multi-store-stock-tracking)
   - [Purchases, Multi-Product Orders & Supplier Payments](#3-purchases-multi-product-orders--supplier-payments)
   - [Customer Management & Store Association](#4-customer-management--store-association)
   - [Vendor Directory & Procurement](#5-vendor-directory--procurement)
   - [Expenses & Receipt Verification](#6-expenses--receipt-verification)
   - [Double-Entry Accounting & Financial Reports](#7-double-entry-accounting--financial-reports)
   - [Attendance & Live Work Activity Monitoring](#8-attendance--live-work-activity-monitoring)
   - [Delete Request Approval Workflow](#9-delete-request-approval-workflow)
9. [Mobile Experience & Touch-Friendly Navigation](#mobile-experience--touch-friendly-navigation)
10. [Single Source of Truth Forms (SSTF)](#single-source-of-truth-forms-sstf)
11. [Cloudflare R2 / S3 Object Storage](#cloudflare-r2--s3-object-storage)
12. [Distributed Pusher Realtime & Event Outbox](#distributed-pusher-realtime--event-outbox)
13. [Authentication & Enterprise Security Settings](#authentication--enterprise-security-settings)
14. [Real Alert Evaluation Service](#real-alert-evaluation-service)
15. [Local Development & Installation](#local-development--installation)
16. [Complete `.env` Environment Variables Guide](#complete-env-environment-variables-guide)
17. [Database Setup, Additive Migrations & Seeding](#database-setup-additive-migrations--seeding)
18. [Super Admin Bootstrap Setup](#super-admin-bootstrap-setup)
19. [Development, Testing & Verification Commands](#development-testing--verification-commands)
20. [Production Deployment Guide](#production-deployment-guide)
21. [Project Folder Structure](#project-folder-structure)
22. [Troubleshooting & FAQ](#troubleshooting--faq)
23. [Proprietary License & Intellectual Property](#proprietary-license--intellectual-property)

---

## System Overview & Key Features

- **Strict Multi-Tenant Store Isolation**: Each physical store operates as an isolated operational silo. Cross-store data leaks are prohibited at the API, database query, and WebSocket layer.
- **Authoritative 3-Role Hierarchy**: Super Admin (Level 100), Store Manager (Level 80), and Sales Manager (Level 40). Zero ambiguous or custom roles.
- **Dynamic White-Label System**: Fully customizable brand identity configured from Settings (App Name, Tagline, Primary/Secondary/Accent Colors, Logos, Favicon, Support information) with instant realtime cross-tab synchronization.
- **International Localization Engine**: Pre-configured launch profiles for India (GST/CGST/SGST/IGST/HSN), UAE (VAT 5%/TRN), Saudi Arabia (VAT 15%/ZATCA), United Kingdom (HMRC VAT/£), United States (State & Local Sales Tax abstraction), Australia (ATO GST 10%/ABN), and South Africa (SARS VAT 15%).
- **Universal Money & Tax Formatter**: Automated localized number grouping (`en-IN` lakhs/crores, `en-US`/`en-GB` thousands comma), currency symbols, and inclusive/exclusive calculation.
- **Field-Mapped Invoice Template Engine**: Visual 0-100% normalized percentage coordinates for invoice fields with dedicated `@media print` CSS rendering.
- **Viewport-Safe Authentication**: Redesigned sign-in container (`100dvh`, zero unwanted document scroll, mobile keyboard-safe) with public cached branding endpoint and direct post-login route to `/sales`.
- **Fail-Closed Session Model**: Configurable database-backed sessions with SHA-256 token hashing, single-token binding, dynamic inactivity timeout, and atomic revocation on password change or logout.
- **Atomic Multi-Item POS Terminal**: Rapid barcode/SKU checkout, multi-tender split payment, cash change calculation, and oversell protection via MySQL row-level transaction locks.
- **Double-Entry Financial Accounting**: Automated General Ledger posting on all financial events (sales, purchases, payments, expenses, voids), guaranteeing debits equal credits.
- **Cloudflare R2 Financial Storage**: S3-compatible private object storage with signed URL delivery, strict store ownership tagging, and deletion protection on financial evidence.

---

## Rismos White-Label Architecture

Rismos provides a single source of truth for branding stored in MySQL and persisted across object storage:

```
Super Admin -> Settings -> Branding
   │
   ├── App Name & Tagline ("Rismos" · "Run Retail. Smarter.")
   ├── Primary Brand Color (e.g. #002E86)
   ├── Secondary Brand Color (e.g. #009ADF)
   ├── Accent Brand Color (e.g. #2563EB)
   ├── Light Logo & Dark Mode Logo (R2 Object Storage)
   ├── Compact App Icon & Browser Favicon
   └── Support Email & Business Phone
   │
   ▼
[API: /api/settings/route.ts]
   │  ├── Server-Side Input Validation
   │  ├── Uploads Assets to Cloudflare R2
   │  ├── Persists Canonical State to MySQL (branding_settings)
   │  ├── Invalidates Safe Public Cache (/api/settings/branding)
   │  ├── Updates Active AppContext State
   │  └── Emits Pusher Realtime Event ('settings-updated')
   ▼
Instant Worldwide UI Synchronization Across All Open Tabs & Devices
```

All runtime UI surfaces (Sidebar, Topbar, Sign-in screen, Print invoices, Dialogs, Store selector) consume dynamic branding via the centralized `<AppLogo />` component.

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
| **Form Validation** | React Hook Form, Custom International Phone & Tax Validators |
| **Analytics & Charts**| Recharts 2.15+ (Dynamic client-side rendering with SSR bypass) |
| **Notifications** | Sonner toast system + In-app evaluation alert service |
| **Testing** | Automated TSX integration test suites covering security, RBAC, and business logic |

---

## Exact 3-Role Architecture & Security Clearances

Rismos enforces a strict 3-role security hierarchy. No intermediate or arbitrary roles exist:

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

| Permission / Clearance Matrix | Super Admin (100) | Store Manager (80) | Sales Manager (40) |
|---|:---:|:---:|:---:|
| **Access All Physical Stores** | ✅ Full Access | ❌ Assigned Store Only | ❌ Assigned Store Only |
| **Switch Active Store Context** | ✅ Global Switcher | ❌ Locked to Store | ❌ Locked to Store |
| **Configure System Branding & Logos** | ✅ Full Access | ❌ Prohibited | ❌ Prohibited |
| **Configure Country, Tax & Currency** | ✅ Full Access | ❌ Prohibited | ❌ Prohibited |
| **Configure Security Policies & Timeouts** | ✅ Full Access | ❌ Prohibited | ❌ Prohibited |
| **Create / Update Physical Stores** | ✅ Full Access | ❌ Prohibited | ❌ Prohibited |
| **User Management** | ✅ All Stores & Roles | ✅ Sales Managers (Own Store) | ❌ Read-Only Directory |
| **Manage Inventory & Cost Prices** | ✅ Full Access | ✅ Assigned Store | ❌ Read-Only Qty On Hand |
| **Purchase Orders & Supplier Invoices** | ✅ Full Access | ✅ Assigned Store | ❌ Prohibited |
| **POS Terminal & Customer Billing** | ✅ All Terminals | ✅ Assigned Terminal | ✅ Assigned Terminal |
| **Void Sale / Issue Refunds** | ✅ Direct Approval | ⚠️ Requires Confirmation | ❌ Request Only |
| **General Ledger & Double-Entry Accounting** | ✅ Full Access | ❌ Prohibited | ❌ Prohibited |
| **Approve Delete Requests** | ✅ Sole Authority | ❌ Submit Requests Only | ❌ Prohibited |

---

## Multi-Store Topology & Store Isolation

Rismos implements strict physical and logical store isolation across all business modules:

- **Store Scope Enforcement**: Every database query for transactions, sales, inventory, and procurement is automatically scoped by `storeId` on the server.
- **Super Admin Mobile Switcher**: Super Admins can toggle between **All Stores**, **Central**, or individual retail outlets directly from the mobile Topbar.
- **Nested Store Creation Flow**: In user management, Super Admins can click **"+ Add Store"** directly within the searchable assigned store combobox without losing any entered user form data.

---

## International Tax, Currency & Localization Engine

Rismos removes hardcoded tax assumptions and introduces an extensible jurisdiction engine (`src/lib/localization/jurisdictions.ts`):

| Country | Code | Currency | Tax Regime | Tax ID Label | Default Slabs / Notes |
|---|:---:|:---:|:---:|:---:|---|
| **India** | `IN` | INR (`₹`) | GST | GSTIN | 0%, 5%, 12%, 18%, 28% · CGST/SGST intrastate split, IGST interstate |
| **United Arab Emirates** | `AE` | AED (`AED`) | VAT | TRN | 5% standard rate · Federal Tax Authority (FTA) compliant |
| **Saudi Arabia** | `SA` | SAR (`SAR`) | VAT | VAT Number | 15% standard rate · ZATCA e-invoicing ready |
| **United Kingdom** | `GB` | GBP (`£`) | VAT | VAT Reg Number | 20% standard, 5% reduced, 0% zero-rated · HMRC compliant |
| **United States** | `US` | USD (`$`) | Sales Tax | State Tax ID | Modular State & Local Sales Tax abstraction (no fake national VAT) |
| **Australia** | `AU` | AUD (`A$`) | GST | ABN | 10% standard rate · ATO compliant |
| **South Africa** | `ZA` | ZAR (`R`) | VAT | VAT Number | 15% standard rate · SARS compliant |

---

## Structured Invoice Template & Dedicated Print Engine

Rismos upgrades template management from simple background images to a full visual field mapper:

- **Normalized Percentage Coordinates**: Field positions (`xPercent`, `yPercent`) range from 0 to 100%, ensuring deterministic placement on A4, Letter, and thermal receipt formats.
- **Interactive Visual Mapper**: Tune field positions, visibility, font sizes, alignments, and styling with live preview in Settings.
- **Dedicated `@media print` CSS**: Built into `src/components/invoice/InvoicePrintRenderer.tsx` with clean pagination, no clipped fields, and complete exclusion of web application chrome during browser print.

---

## Mobile Experience & Touch-Friendly Navigation

- **Touch Target Standard**: Minimum 44px tap targets across buttons, links, inputs, and comboboxes.
- **Customizable Mobile "More" Menu**: Users can tap **Edit** on the mobile More navigation sheet to reorder modules via up/down controls. User preferences persist per user in `user_ui_preferences` and are strictly filtered against authoritative RBAC permissions.
- **Keyboard Safe**: Form inputs, modals, and login containers adapt dynamically to software keyboards on iOS and Android devices without clipping controls or triggering page scrolling.

---

## Authentication & Enterprise Security Settings

Every security setting in Super Admin -> Settings -> Security controls real server behavior:

1. **Configurable Brute-Force Lockout**: `/api/auth/login` reads `maxLoginAttempts` dynamically from the database. Repeated failures lock the account and generate in-app security alerts.
2. **Session Inactivity Timeout**: Session cookie lifetime (`sessionCookieMaxAgeSecs`) is dynamically governed by `sessionTimeoutMins`.
3. **NIST SP 800-63B Enterprise Password Policy**: Enforces 12+ characters, uppercase, lowercase, digits, special characters, and rejects guessable sequences including `rismos`, `cosko`, `admin`, and `password`. Enforced on user creation and updates.

---

## Real Alert Evaluation Service

Located in `src/lib/services/alertService.ts` and triggered via `/api/alerts/evaluate`:

- **Low Stock Alerts**: Automatically triggers in-app notifications when on-hand quantities fall below `lowStockThreshold`.
- **Overdue Supplier Bills**: Identifies unpaid purchase invoices past `overdueThresholdDays`.
- **Security Event Notifications**: Automatically logs high-risk events (lockouts, permission modifications) into the in-app notification ledger.
- **Transparent Email Provider Status**: Correctly flags `"PROVIDER_NOT_CONFIGURED"` when SMTP/SendGrid credentials are not supplied, preventing false success states.

---

## Local Development & Installation

### Prerequisites

- Node.js 20.x or 22.x LTS
- MySQL 8.0+ running locally or on cloud provider (Aiven, PlanetScale, AWS RDS)
- Cloudflare R2 bucket credentials (or AWS S3)
- Git 2.30+

### Clone & Install

```bash
git clone https://github.com/MohammadHasan1604/Rismos.git
cd Rismos

npm install
```

### Environment Configuration

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

### Run Additive Migration & Seed

```bash
npx tsx scripts/migrate-rismos-whitelabel.ts
npx prisma generate
```

### Start Development Server

```bash
npm run dev
```

Visit [http://localhost:4028](http://localhost:4028) in your browser.

---

## Development, Testing & Verification Commands

| Command | Description |
|---|---|
| `npm run dev` | Launch local Next.js development server on port 4028 |
| `npm run build` | Generate Prisma client and create production bundle |
| `npm run start` | Start production Next.js server on port 4028 |
| `npm run lint` | Execute ESLint static analysis |
| `npx tsc --noEmit` | Run complete TypeScript typecheck across all files |
| `npx tsx tests/rismos-whitelabel.test.ts` | Run full 38-test Rismos white-label verification suite |
| `npx tsx scripts/migrate-rismos-whitelabel.ts` | Run idempotent additive MySQL schema migration |

---

## Project Folder Structure

```
├── prisma/
│   └── schema.prisma            # Declarative MySQL schema & relational model
├── public/                      # Static assets, icons, and fallback brand marks
├── scripts/
│   ├── bootstrap-superadmin.ts  # CLI Super Admin bootstrapping utility
│   ├── migrate-rismos-whitelabel.ts # Additive white-label database migration
│   └── seed-mysql.ts            # Development demo seeder
├── src/
│   ├── app/                     # Next.js 15 App Router pages & API route handlers
│   │   ├── api/
│   │   │   ├── alerts/          # Alert evaluation endpoints
│   │   │   ├── auth/            # Authentication & session route handlers
│   │   │   ├── settings/        # System, profile, tax & branding endpoints
│   │   │   └── users/           # User management & UI preferences
│   │   ├── sales/               # POS Terminal & transaction ledger
│   │   ├── settings/            # White-label settings dashboard tabs
│   │   └── sign-up-login/       # Viewport-safe Rismos authentication screen
│   ├── components/              # Modular UI components & design system
│   │   ├── forms/               # Single Source of Truth Forms (User, Store, Product)
│   │   ├── invoice/             # InvoicePrintRenderer & print engine
│   │   └── ui/                  # Dynamic AppLogo, Modal, Buttons, Comboboxes
│   ├── context/
│   │   └── AppContext.tsx       # Global store state, session, and realtime binding
│   ├── lib/
│   │   ├── branding.ts          # Public branding cache & synchronization
│   │   ├── db.ts                # Prisma MySQL connection pool singleton
│   │   ├── invoice/             # Invoice template schemas & coordinate parsers
│   │   ├── localization/        # Multi-jurisdiction profiles & money formatters
│   │   ├── passwordPolicy.ts    # Enterprise password policy & entropy scorer
│   │   └── services/            # AlertService, Accounting, and domain engines
├── tailwind.config.js           # Tailwind design tokens & breakpoints
└── tests/
    └── rismos-whitelabel.test.ts # Comprehensive test suite covering all 18 phases
```

---

## Proprietary License & Intellectual Property

**Copyright © 2026 Mohammad Hasan — All Rights Reserved.**

This repository, source code, system architecture, database design, user interface components, and all accompanying documentation (collectively, the "Software") are the exclusive intellectual property and proprietary assets of **Mohammad Hasan** ("Author", "Licensor", "Owner").

### Proprietary Terms & Restrictions

1. **Exclusive Ownership & IP Retention**: Sole legal and equitable ownership, title, copyright, patent rights, trade secrets, and all other intellectual property rights in and to the Software remain perpetually and exclusively with **Mohammad Hasan**.
2. **Prohibited Actions**: Without express, prior written authorization executed by Mohammad Hasan, copying, duplicating, distributing, commercial reselling, or reverse engineering any part of this software is strictly prohibited.
3. **Official Repository**: [https://github.com/MohammadHasan1604/Rismos](https://github.com/MohammadHasan1604/Rismos)

For commercial licensing or enterprise inquiries:  
**Mohammad Hasan** — [mohammadhasan16114@gmail.com](mailto:mohammadhasan16114@gmail.com)