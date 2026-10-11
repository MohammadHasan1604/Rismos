# RISMOS PHASE 2 — CLEANUP MANIFEST

This manifest provides a comprehensive audit of obsolete scripts, legacy migration hacks, dangerous reset routines, duplicate seed files, and deprecated compatibility modules identified during the Phase 2 Database V2 re-architecture.

Per Section 15 safety guidelines, **no files are deleted immediately**; instead, they are inventoried, classified by risk, and scheduled for staged decommissioning once the new Database V2 is cut over.

---

## 1. Dangerous Reset & Destructive Scripts (HIGH RISK)

These scripts execute unconditional `deleteMany({})`, `TRUNCATE`, or destructive operations against whichever database is targeted by `DATABASE_URL`. In production, these represent critical data-loss hazards.

| File Path | Description / Hazard | Recommendation |
| :--- | :--- | :--- |
| [`scripts/clean-database-reset.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/clean-database-reset.ts) | Executes cascading `deleteMany({})` across all tables. | **Quarantine / Deprecate**. Replace with isolated test runners. |
| [`scripts/empty-db-keep-superadmin.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/empty-db-keep-superadmin.ts) | Wipes all business records and drops tables, preserving only super admin. | **Quarantine / Deprecate**. Dangerous in production. |
| [`scripts/reset-production-clean.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/reset-production-clean.ts) | Destructive deletion of sales, inventory, and purchases. | **Quarantine / Deprecate**. Replaced by safe test seeders. |
| [`scripts/reseed-production-full.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/reseed-production-full.ts) | Overwrites data with synthetic demo entities. | **Quarantine / Deprecate**. Replaced by `scripts/seed-v2-safe.ts`. |

---

## 2. Legacy Migration Hacks & Piecemeal DDL Scripts (OBSOLETE)

These scripts were created to apply one-off schema patches prior to the Database V2 baseline. With the creation of `prisma/migrations/v2_baseline/migration.sql`, all of these individual DDL scripts are obsolete.

| File Path | Original Purpose | Replacement in V2 |
| :--- | :--- | :--- |
| [`scripts/alter-vendor-gstin.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/alter-vendor-gstin.ts) | Altered vendor table to add GSTIN column. | Included in V2 baseline DDL. |
| [`scripts/migrate-production.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-production.ts) | Ad-hoc `ALTER TABLE` statements on production. | Superceded by deterministic V2 baseline DDL. |
| [`scripts/migrate-and-backfill-ledger.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-and-backfill-ledger.ts) | Backfilled inventory ledger from transfers. | Standardized in V2 `InventoryLedger` model. |
| [`scripts/migrate-auth-lockout-and-session.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-auth-lockout-and-session.ts) | Added `locked_until` and session tables. | Native in V2 `users` and `user_sessions`. |
| [`scripts/migrate-auth-pipeline.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-auth-pipeline.ts) | Created rate limits and step-up grant tables. | Native in V2 `security_rate_limits` and `step_up_grants`. |
| [`scripts/migrate-payment-proof-schema.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-payment-proof-schema.ts) | Added `payment_proof_url` to sales. | Native in V2 `sales` table. |
| [`scripts/migrate-purchase-multiproduct.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-purchase-multiproduct.ts) | Split purchase orders into multi-item table. | Native in V2 `purchase_items`. |
| [`scripts/migrate-remediation-tables.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-remediation-tables.ts) | Added idempotency, sequence counters, and rate limits. | Native in V2 baseline DDL. |
| [`scripts/migrate-rismos-whitelabel.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-rismos-whitelabel.ts) | Added branding settings table. | Native in V2 `branding_settings`. |
| [`scripts/migrate-work-activity-and-store-owner.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/migrate-work-activity-and-store-owner.ts) | Added user presence and store owner fields. | Native in V2 `user_presence` and `stores`. |

---

## 3. Duplicate & Legacy Seed Scripts

| File Path | Status | Action |
| :--- | :--- | :--- |
| [`scripts/seed-mysql.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/seed-mysql.ts) | Legacy seed script containing hardcoded COSKO naming. | Kept as historical reference; replace execution with `scripts/seed-v2-safe.ts`. |
| [`scripts/seed-settings-defaults.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/seed-settings-defaults.ts) | Seeds partial settings defaults. | Unified into `scripts/seed-v2-safe.ts`. |
| [`scripts/bootstrap-superadmin.ts`](file:///c:/Users/admin/Downloads/storecommand/scripts/bootstrap-superadmin.ts) | Redundant super admin creator. | Superseded by `scripts/seed-v2-safe.ts`. |

---

## 4. Schema Redundancies & Legacy Models

| Schema Element | Finding & Context | V2 Architecture Decision |
| :--- | :--- | :--- |
| `central_expenses` | Duplicate of `expenses`. Active application uses `expenses` with `storeCode = 'CENTRAL'` or logistics category. | Preserved in V2 DDL for backward compatibility with zero regressions, but marked deprecated in favor of canonical `expenses`. |
| `customer_external_links` | Legacy matching table for external MySQL databases. | Preserved as read-only audit entity; new customers link directly to `customers`. |
| `repair_enquiries` | Read-only historical repair records. | Retained as read-only historical model with `onDelete: SetNull`. |
| `UserAccount.storeScope` | Text string (`"BLR"`, `"ALL"`) duplicating `UserStoreAssignment`. | Retained for backwards compatibility, with `UserStoreAssignment` designated as the canonical relational authority. |

---

## 5. Decommissioning Protocol

1. **Phase 2 Status:** All listed files remain in the codebase so no external tools, historical tests, or existing workflows are broken.
2. **Post-Cutover:** Once the new Database V2 is live and verified for 30 days:
   - Archive legacy migration scripts into `archive/migrations_v1/`.
   - Remove destructive reset scripts from deployment bundles.
   - Clean up deprecated seed files.
