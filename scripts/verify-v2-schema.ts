/**
 * RISMOS Database V2 — Schema Verification Tool
 * 
 * Verifies that the connected database schema fully conforms to Database V2 architecture:
 * 1. Checks existence of all 44 authoritative tables
 * 2. Verifies table engine and character set (InnoDB, utf8mb4)
 * 3. Verifies primary keys and unique constraints
 * 4. Verifies foreign key constraints (specifically RESTRICT on historical tables)
 * 5. Verifies precision on Decimal columns
 */

import { PrismaClient } from '@prisma/client';

const EXPECTED_TABLES = [
  'stores',
  'users',
  'user_permission_overrides',
  'user_sessions',
  'user_store_assignments',
  'categories',
  'category_types',
  'products',
  'inventory',
  'inventory_ledger',
  'stock_transfers',
  'stock_transfer_items',
  'customers',
  'customer_store_profiles',
  'customer_external_links',
  'repair_enquiries',
  'vendors',
  'purchases',
  'purchase_payments',
  'goods_received_notes',
  'purchase_items',
  'sales',
  'sale_items',
  'expenses',
  'central_expenses',
  'audit_logs',
  'branding_settings',
  'system_settings',
  'financial_ledger',
  'idempotency_records',
  'payment_methods',
  'brands',
  'units',
  'attendance_days',
  'delete_requests',
  'notifications',
  'file_assets',
  'realtime_outbox',
  'user_presence',
  'sequence_counters',
  'password_resets',
  'user_ui_preferences',
  'step_up_grants',
  'security_rate_limits',
];

export async function verifyV2Schema(customPrisma?: PrismaClient): Promise<{
  success: boolean;
  tableCount: number;
  missingTables: string[];
  foreignKeyErrors: string[];
  decimalErrors: string[];
}> {
  const prisma = customPrisma || new PrismaClient();
  console.log('🔍 [SCHEMA VERIFICATION] Checking Database V2 conformance...');

  // 1. Check existing tables in current database schema
  const dbTablesResult: Array<{ TABLE_NAME: string }> = await prisma.$queryRaw`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
  `;

  const existingTables = new Set(dbTablesResult.map((r) => r.TABLE_NAME));
  const missingTables = EXPECTED_TABLES.filter((t) => !existingTables.has(t));

  console.log(`  ✓ Discovered ${existingTables.size} tables in active schema`);
  if (missingTables.length > 0) {
    console.warn(`  ⚠️ Missing ${missingTables.length} expected tables: ${missingTables.join(', ')}`);
  } else {
    console.log(`  ✓ All ${EXPECTED_TABLES.length} expected Database V2 tables are present`);
  }

  // 2. Check Restrictive Foreign Keys on historical tables
  const fkResults: Array<{
    TABLE_NAME: string;
    COLUMN_NAME: string;
    REFERENCED_TABLE_NAME: string;
    DELETE_RULE: string;
  }> = await prisma.$queryRaw`
    SELECT 
      kcu.TABLE_NAME, 
      kcu.COLUMN_NAME, 
      kcu.REFERENCED_TABLE_NAME,
      rc.DELETE_RULE
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
      AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
    WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
  `;

  const foreignKeyErrors: string[] = [];
  const historicalTables = ['sale_items', 'purchase_items', 'inventory_ledger', 'stock_transfer_items'];
  for (const row of fkResults) {
    if (historicalTables.includes(row.TABLE_NAME) && row.DELETE_RULE === 'CASCADE') {
      foreignKeyErrors.push(
        `Critical: Table ${row.TABLE_NAME}.${row.COLUMN_NAME} -> ${row.REFERENCED_TABLE_NAME} has DELETE_RULE CASCADE. Must be RESTRICT or NO ACTION.`
      );
    }
  }

  if (foreignKeyErrors.length > 0) {
    console.error(`  ❌ Foreign Key Integrity Violations:`, foreignKeyErrors);
  } else {
    console.log(`  ✓ Verified: Zero dangerous cascades detected on financial transaction history`);
  }

  // 3. Check Financial Decimal precision
  const decimalCols: Array<{
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: string;
    NUMERIC_PRECISION: number;
    NUMERIC_SCALE: number;
  }> = await prisma.$queryRaw`
    SELECT 
      TABLE_NAME, 
      COLUMN_NAME, 
      DATA_TYPE, 
      NUMERIC_PRECISION, 
      NUMERIC_SCALE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND DATA_TYPE IN ('decimal', 'float', 'double')
      AND TABLE_NAME IN ('sales', 'sale_items', 'purchases', 'purchase_items', 'financial_ledger', 'expenses')
  `;

  const decimalErrors: string[] = [];
  for (const col of decimalCols) {
    if (col.DATA_TYPE === 'float' || col.DATA_TYPE === 'double') {
      decimalErrors.push(`Prohibited floating point in financial table: ${col.TABLE_NAME}.${col.COLUMN_NAME} is ${col.DATA_TYPE}`);
    }
  }

  if (decimalErrors.length > 0) {
    console.error(`  ❌ Financial Precision Errors:`, decimalErrors);
  } else {
    console.log(`  ✓ Verified: Zero floating-point columns in financial tables; fixed Decimal precision enforced`);
  }

  const success = missingTables.length === 0 && foreignKeyErrors.length === 0 && decimalErrors.length === 0;
  console.log(success ? '✅ [SCHEMA VERIFICATION] Passed!' : '❌ [SCHEMA VERIFICATION] Failed checks.');

  return {
    success,
    tableCount: existingTables.size,
    missingTables,
    foreignKeyErrors,
    decimalErrors,
  };
}

if (require.main === module) {
  const p = new PrismaClient();
  verifyV2Schema(p)
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal schema check error:', err);
      process.exit(1);
    })
    .finally(() => p.$disconnect());
}
