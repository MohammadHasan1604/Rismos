/**
 * RISMOS Database V2 — Index Verification Tool
 * 
 * Verifies that all critical indexes, unique constraints, and composite keys
 * exist and match the Database V2 specification for high-throughput retail operations.
 */

import { PrismaClient } from '@prisma/client';

const REQUIRED_INDEXES: Array<{ table: string; indexName: string; isUnique?: boolean }> = [
  { table: 'stores', indexName: 'stores_code_key', isUnique: true },
  { table: 'users', indexName: 'users_email_key', isUnique: true },
  { table: 'user_permission_overrides', indexName: 'user_permission_overrides_user_id_permission_code_key', isUnique: true },
  { table: 'user_sessions', indexName: 'user_sessions_token_hash_key', isUnique: true },
  { table: 'user_store_assignments', indexName: 'user_store_assignments_user_id_store_code_key', isUnique: true },
  { table: 'categories', indexName: 'categories_slug_key', isUnique: true },
  { table: 'products', indexName: 'products_sku_key', isUnique: true },
  { table: 'inventory', indexName: 'inventory_product_id_store_code_key', isUnique: true },
  { table: 'inventory_ledger', indexName: 'inventory_ledger_store_code_created_at_idx' },
  { table: 'stock_transfers', indexName: 'stock_transfers_transfer_no_key', isUnique: true },
  { table: 'customer_store_profiles', indexName: 'customer_store_profiles_customer_id_store_code_key', isUnique: true },
  { table: 'repair_enquiries', indexName: 'repair_enquiries_ticket_no_key', isUnique: true },
  { table: 'vendors', indexName: 'vendors_code_key', isUnique: true },
  { table: 'purchases', indexName: 'purchases_po_no_key', isUnique: true },
  { table: 'purchases', indexName: 'purchases_store_code_created_at_idx' },
  { table: 'sales', indexName: 'sales_order_no_key', isUnique: true },
  { table: 'sales', indexName: 'sales_store_code_created_at_idx' },
  { table: 'expenses', indexName: 'expenses_expense_no_key', isUnique: true },
  { table: 'expenses', indexName: 'expenses_store_code_date_idx' },
  { table: 'financial_ledger', indexName: 'financial_ledger_entry_no_key', isUnique: true },
  { table: 'financial_ledger', indexName: 'financial_ledger_store_code_entry_date_idx' },
  { table: 'idempotency_records', indexName: 'idempotency_records_key_key', isUnique: true },
  { table: 'payment_methods', indexName: 'payment_methods_code_key', isUnique: true },
  { table: 'attendance_days', indexName: 'attendance_days_user_id_local_date_key', isUnique: true },
  { table: 'password_resets', indexName: 'password_resets_token_key', isUnique: true },
  { table: 'step_up_grants', indexName: 'step_up_grants_token_hash_key', isUnique: true },
  { table: 'security_rate_limits', indexName: 'security_rate_limits_key_hash_key', isUnique: true },
];

export async function verifyIndexes(customPrisma?: PrismaClient): Promise<{
  success: boolean;
  totalVerified: number;
  missingIndexes: string[];
}> {
  const db = customPrisma || new PrismaClient();
  console.log('⚡ [INDEX VERIFICATION] Auditing Database V2 indexes and unique constraints...');

  const indexRows: Array<{
    TABLE_NAME: string;
    INDEX_NAME: string;
    NON_UNIQUE: number;
  }> = await db.$queryRaw`
    SELECT 
      TABLE_NAME, 
      INDEX_NAME, 
      NON_UNIQUE 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE()
  `;

  const existingIndexes = new Set(
    indexRows.map((r) => `${r.TABLE_NAME}.${r.INDEX_NAME}`)
  );

  const missingIndexes: string[] = [];
  for (const req of REQUIRED_INDEXES) {
    const key = `${req.table}.${req.indexName}`;
    if (!existingIndexes.has(key)) {
      missingIndexes.push(key);
    }
  }

  if (missingIndexes.length > 0) {
    console.error(`  ❌ Missing ${missingIndexes.length} required indexes/keys:`, missingIndexes);
  } else {
    console.log(`  ✓ All ${REQUIRED_INDEXES.length} critical Database V2 indexes and unique constraints verified`);
  }

  const success = missingIndexes.length === 0;
  console.log(success ? '✅ [INDEX VERIFICATION] Passed!' : '❌ [INDEX VERIFICATION] Incomplete index configuration.');

  return {
    success,
    totalVerified: REQUIRED_INDEXES.length - missingIndexes.length,
    missingIndexes,
  };
}

if (require.main === module) {
  const p = new PrismaClient();
  verifyIndexes(p)
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal index check error:', err);
      process.exit(1);
    })
    .finally(() => p.$disconnect());
}
