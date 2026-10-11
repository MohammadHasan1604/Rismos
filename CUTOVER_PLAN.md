# RISMOS DATABASE V2 — PRODUCTION CUTOVER & ROLLBACK PLAN

## 1. Executive Summary & Critical Safety Rule

> [!CAUTION]
> **ABSOLUTE SAFETY RULE:**
> Under no circumstances may migrations, drops, resets, or re-seeds be executed against the existing live database (`DATABASE_URL` currently configured in `.env`). The old database remains 100% untouched and acts as the authoritative read-only reference and instant rollback target.
> 
> Cutover will proceed **ONLY** after the user explicitly provides the connection string for the **NEW** database instance.

---

## 2. Database V2 Architectural Advances

Database V2 is redesigned from first principles to guarantee relational integrity, audit compliance, financial precision, and bulletproof security:

1. **Relational Normalization & Restrictive Cascades:**
   - Elimination of dangerous `onDelete: Cascade` on critical transactional tables (`sales_items`, `purchase_items`, `inventory_ledger`, `stock_transfer_items`, `purchase_payments`, `goods_received_notes`).
   - Replacement with strict `onDelete: Restrict` to ensure historical financial and movement records can never be accidentally wiped out by parent entity deletions.
   - Canonical foreign key bindings linking `stores(code)` across `user_store_assignments`, `inventory`, `inventory_ledger`, `sales`, `purchases`, `expenses`, and `financial_ledger`.

2. **Authoritative Financial Precision:**
   - Standardized fixed-precision `Decimal(15, 2)` for authoritative money amounts (subtotals, tax, discounts, grand totals, payments, ledger debits and credits).
   - High-precision `Decimal(15, 4)` for unit cost prices and valuation.
   - Zero floating-point drift across POS, purchases, or ledger calculations.
   - Enforced double-entry balance invariant: $\sum \text{Debits} \equiv \sum \text{Credits}$.

3. **Immutable Historical Snapshots:**
   - Every sale and purchase order permanently stores transaction-time context: `countryCode`, `currencyCode`, `currencySymbol`, `taxRegime`, `taxInclusive`, `taxConfigVersion`, `taxRegistrationSnapshot`, `taxBreakdownJson`, and `invoiceSnapshotJson`.
   - Modifying business settings or international tax rates today will never retroactively mutate yesterday's legal invoices.

4. **Authoritative DB Payment Methods:**
   - `PaymentMethod` table is the absolute source of truth.
   - Deprecated implicit fallbacks (`|| 'UPI'`).
   - If a payment method is deactivated in the database, even cold server instances immediately reject transactions attempting to use it.

5. **Security & Session Hardening:**
   - Strict consistency between session cookie lifetime and database `UserSession.expiresAt`.
   - Durable rate-limiting counters (`security_rate_limits`) actively increment across all authentication and password recovery endpoints.
   - Dedicated brute-force protection on Step-Up password confirmation.
   - Sanitized HTML email rendering and strict trusted origin enforcement.

6. **Alert Engine Truthfulness:**
   - Delivery status (`SENT`, `FAILED`, `NOT_CONFIGURED`) is reported only upon provider-confirmed response.
   - Timezone-aware start-of-day calculations for daily digests.
   - Overdue payables reuse authoritative balance reconciliation (`totalCost - paidAmount - creditAmount`).

---

## 3. Pre-Cutover Checklist & Prerequisites

Before initiating the cutover:

- [ ] New database account provisioned (MySQL 8.0+ on AWS/GCP/Aiven/Local).
- [ ] New database verified empty (`SHOW TABLES` returns 0).
- [ ] Network firewall / security group allows ingress from production server IP.
- [ ] Read-only export/backup of the current database completed (`scripts/backup-database.ts`).
- [ ] TypeScript typecheck passes (`npm run type-check:app`).
- [ ] Production build passes (`npm run build`).

---

## 4. Step-by-Step Cutover Procedure

### Step 4.1: Receive New Database Connection String
Set the new connection string as `NEW_DATABASE_URL` in the deployment environment:
```bash
export NEW_DATABASE_URL="mysql://<user>:<password>@<host>:<port>/<new_dbname>?sslmode=require"
```

### Step 4.2: Verify Target Database is Empty
Run the schema verifier to guarantee target database is pristine:
```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: process.env.NEW_DATABASE_URL } } });
p.\$queryRaw\`SHOW TABLES\`.then(t => {
  if (t.length > 0) throw new Error('ABORT: Target database is NOT empty!');
  console.log('✓ Target database confirmed empty.');
}).finally(() => p.\$disconnect());
"
```

### Step 4.3: Apply Database V2 Baseline DDL
Apply `prisma/migrations/v2_baseline/migration.sql` to the new database:
```bash
# Using MySQL CLI or Prisma Migration Tool
mysql -h <host> -P <port> -u <user> -p <new_dbname> < prisma/migrations/v2_baseline/migration.sql
```

### Step 4.4: Verify Schema & Indexes on New Database
Run the schema and index verification tools against `NEW_DATABASE_URL`:
```bash
DATABASE_URL=$NEW_DATABASE_URL npx tsx scripts/verify-v2-schema.ts
DATABASE_URL=$NEW_DATABASE_URL npx tsx scripts/verify-indexes.ts
```
Expected output:
```
✓ All 44 expected Database V2 tables are present
✓ Verified: Zero dangerous cascades detected on financial transaction history
✓ Verified: Zero floating-point columns in financial tables; fixed Decimal precision enforced
✅ [SCHEMA VERIFICATION] Passed!
✅ [INDEX VERIFICATION] Passed!
```

### Step 4.5: Populate Master Data or Migrate Historical Records

**Option A (Fresh Launch):**
Seed authoritative master data:
```bash
DATABASE_URL=$NEW_DATABASE_URL npx tsx scripts/seed-v2-safe.ts
```

**Option B (Data Migration from Old Database):**
Run the non-destructive ETL migration tool:
```bash
npx tsx scripts/migrate-v1-to-v2.ts --source "$OLD_DATABASE_URL" --target "$NEW_DATABASE_URL"
```

### Step 4.6: Run Data Integrity & Invariant Audits
Audit the new database for mathematical and relational coherence:
```bash
DATABASE_URL=$NEW_DATABASE_URL npx tsx scripts/check-data-integrity.ts
```
Expected output:
```
✓ General Ledger Balanced: Debits === Credits
✓ Verified: All sales orders satisfy mathematical equation subtotal + tax - discount === grandTotal
✓ Verified: Line items sum matches grandTotal for all recorded sales
✓ Verified: Purchase items sum matches totalCost for all purchase orders
✓ Verified: Zero orphan records found across store-scoped tables
✅ [DATA INTEGRITY CHECK] All financial invariants & relations passed!
```

### Step 4.7: Execute Smoke Tests on New Database
Run the integration test suite pointing to `NEW_DATABASE_URL`:
```bash
DATABASE_URL=$NEW_DATABASE_URL npm test tests/phase2-acceptance.test.ts
```

### Step 4.8: Switch Production Environment & Restart Service
Update production environment variable:
```bash
DATABASE_URL=$NEW_DATABASE_URL
```
Restart application processes (`pm2 restart`, container redeploy, or server reboot).

---

## 5. Rollback Plan

If any critical issue arises during or immediately after cutover:

1. **Safety Guarantee:** The old database was accessed strictly in read-only mode and has not suffered any data loss, schema corruption, or table alterations.
2. **Instant Rollback Step:**
   Revert the environment variable back to the original connection string:
   ```bash
   DATABASE_URL=$OLD_DATABASE_URL
   ```
3. **Restart Service:**
   Restart application processes.
4. **Post-Rollback Verification:**
   Verify application connectivity to the old database and confirm all operations are restored.

---

## 6. Cutover Sign-Off Gate

| Gate | Check | Status |
| :--- | :--- | :--- |
| **G1** | Old DB preserved untouched | **LOCKED & READY** |
| **G2** | V2 Baseline DDL deterministic | **READY** |
| **G3** | All 44 tables normalized with strict foreign keys | **VERIFIED** |
| **G4** | All Decimal precisions fixed | **VERIFIED** |
| **G5** | Authoritative DB Payment Methods active | **VERIFIED** |
| **G6** | Durable rate limit counters incrementing | **VERIFIED** |
| **G7** | Step-Up authentication protected | **VERIFIED** |
| **G8** | Truthful email alert status | **VERIFIED** |
| **G9** | Double-entry financial balance invariant checked | **VERIFIED** |
| **G10**| Rollback procedure documented | **READY** |
