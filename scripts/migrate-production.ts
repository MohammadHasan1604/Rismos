import { prisma } from '../src/lib/db';

/**
 * RISMOS Production-Safe Deterministic & Idempotent Migration Engine
 * 
 * GUARANTEES:
 * 1. Zero data loss: Preserves all existing records, users, stores, sales, purchases, inventory, ledger.
 * 2. Purely additive: Never drops tables or columns.
 * 3. Fully idempotent: Safe to execute repeatedly without error or drift.
 * 4. Backward-compatible backfills: Safely assigns India-era defaults (IN, INR, ₹, GST)
 *    only where fields are currently NULL.
 * 5. Composite indexes & constraints: Adds missing indexes safely.
 */

interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

export async function runProductionMigrations(targetPrisma?: any) {
  const db = targetPrisma || prisma;
  console.log('========================================================================');
  console.log('🚀 RISMOS PRODUCTION DATABASE UPGRADE & MIGRATION ENGINE');
  console.log('========================================================================\n');

  // Helper to check existing tables
  const getExistingTables = async (): Promise<Set<string>> => {
    const rows: any[] = await db.$queryRawUnsafe('SHOW TABLES');
    const tableNames = new Set<string>();
    for (const row of rows) {
      const val = Object.values(row)[0];
      if (typeof val === 'string') tableNames.add(val.toLowerCase());
    }
    return tableNames;
  };

  // Helper to check existing columns on a table
  const getExistingColumns = async (table: string): Promise<Set<string>> => {
    try {
      const rows: any[] = await db.$queryRawUnsafe(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ?
      `, table);
      return new Set(rows.map((r: any) => String(r.COLUMN_NAME).toLowerCase()));
    } catch {
      return new Set();
    }
  };

  // Helper to check existing indexes on a table
  const getExistingIndexes = async (table: string): Promise<Set<string>> => {
    try {
      const rows: any[] = await db.$queryRawUnsafe(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ?
      `, table);
      return new Set(rows.map((r: any) => String(r.INDEX_NAME).toLowerCase()));
    } catch {
      return new Set();
    }
  };

  const existingTables = await getExistingTables();

  // Helper to safely add column if not exists
  const addColumnIfNotExists = async (table: string, column: string, colDef: string) => {
    const tables = await getExistingTables();
    if (!tables.has(table.toLowerCase())) {
      console.log(`  ℹ️ Table \`${table}\` does not exist; skipping column \`${column}\`.`);
      return;
    }
    const cols = await getExistingColumns(table);
    if (!cols.has(column.toLowerCase())) {
      console.log(`  ➕ Adding column \`${table}\`.\`${column}\`...`);
      await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${colDef}`);
      console.log(`  ✅ Added \`${table}\`.\`${column}\``);
    } else {
      console.log(`  ✓ Column \`${table}\`.\`${column}\` exists`);
    }
  };

  // Helper to safely add index if not exists
  const addIndexIfNotExists = async (table: string, indexName: string, indexDef: string) => {
    const tables = await getExistingTables();
    if (!tables.has(table.toLowerCase())) {
      console.log(`  ℹ️ Table \`${table}\` does not exist; skipping index \`${indexName}\`.`);
      return;
    }
    const indexes = await getExistingIndexes(table);
    if (!indexes.has(indexName.toLowerCase())) {
      console.log(`  ➕ Adding index \`${indexName}\` to \`${table}\`...`);
      try {
        await db.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` ${indexDef}`);
        console.log(`  ✅ Added index \`${indexName}\``);
      } catch (err: any) {
        console.warn(`  ⚠️ Could not add index \`${indexName}\`: ${err.message}`);
      }
    } else {
      console.log(`  ✓ Index \`${indexName}\` on \`${table}\` exists`);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Core Tables Verification / Creation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Verifying Core & Remediation Tables ---');

  if (!existingTables.has('sequence_counters')) {
    console.log('Creating `sequence_counters` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sequence_counters (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prefix VARCHAR(32) NOT NULL UNIQUE,
        current_value BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_sequence_counters_prefix (prefix)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `sequence_counters` created.');
  } else {
    console.log('  ✓ Table `sequence_counters` exists.');
  }

  if (!existingTables.has('password_resets')) {
    console.log('Creating `password_resets` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        ip_address VARCHAR(64) NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_password_resets_user_id (user_id),
        INDEX idx_password_resets_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `password_resets` created.');
  } else {
    console.log('  ✓ Table `password_resets` exists.');
  }

  if (!existingTables.has('user_ui_preferences')) {
    console.log('Creating `user_ui_preferences` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_ui_preferences (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL UNIQUE,
        preferences_json TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_user_ui_preferences_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `user_ui_preferences` created.');
  } else {
    console.log('  ✓ Table `user_ui_preferences` exists.');
  }

  if (!existingTables.has('step_up_grants')) {
    console.log('Creating `step_up_grants` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS step_up_grants (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        action_type VARCHAR(64) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_step_up_grants_user_id (user_id),
        INDEX idx_step_up_grants_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `step_up_grants` created.');
  } else {
    console.log('  ✓ Table `step_up_grants` exists.');
  }

  if (!existingTables.has('idempotency_records')) {
    console.log('Creating `idempotency_records` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS idempotency_records (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        \`key\` VARCHAR(128) NOT NULL UNIQUE,
        action VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
        response_code INT NULL,
        response_data LONGTEXT NULL,
        entity_id VARCHAR(64) NULL,
        user_id VARCHAR(64) NULL,
        store_code VARCHAR(16) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        expires_at DATETIME(3) NOT NULL,
        INDEX idx_idempotency_key (\`key\`),
        INDEX idx_idempotency_action (action),
        INDEX idx_idempotency_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `idempotency_records` created.');
  } else {
    console.log('  ✓ Table `idempotency_records` exists.');
  }

  if (!existingTables.has('financial_ledger')) {
    console.log('Creating `financial_ledger` table...');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        entry_no VARCHAR(64) NOT NULL UNIQUE,
        entry_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        store_code VARCHAR(16) NOT NULL,
        account_category VARCHAR(32) NOT NULL,
        account_name VARCHAR(64) NOT NULL,
        debit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        credit DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        amount DECIMAL(15, 2) NOT NULL,
        ref_type VARCHAR(32) NOT NULL,
        ref_id VARCHAR(64) NULL,
        ref_no VARCHAR(64) NOT NULL,
        entity_name VARCHAR(128) NULL,
        description VARCHAR(255) NOT NULL,
        is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
        metadata_json TEXT NULL,
        currency_code VARCHAR(8) NOT NULL DEFAULT 'INR',
        created_by VARCHAR(128) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_financial_ledger_store_code (store_code),
        INDEX idx_financial_ledger_entry_date (entry_date),
        INDEX idx_financial_ledger_account_category (account_category),
        INDEX idx_financial_ledger_ref_type (ref_type),
        INDEX idx_financial_ledger_ref_no (ref_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `financial_ledger` created.');
  } else {
    console.log('  ✓ Table `financial_ledger` exists.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Additive Columns Verification & Creation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Verifying Additive Columns ---');

  // user_sessions
  await addColumnIfNotExists('user_sessions', 'last_seen_at', 'DATETIME(3) NULL');
  await addIndexIfNotExists('user_sessions', 'idx_user_sessions_last_seen_at', '(last_seen_at)');

  // users
  await addColumnIfNotExists('users', 'failed_login_attempts', 'INT NOT NULL DEFAULT 0');
  await addColumnIfNotExists('users', 'locked_until', 'DATETIME(3) NULL');

  // sales
  await addColumnIfNotExists('sales', 'country_code', "VARCHAR(8) NOT NULL DEFAULT 'IN'");
  await addColumnIfNotExists('sales', 'currency_code', "VARCHAR(8) NOT NULL DEFAULT 'INR'");
  await addColumnIfNotExists('sales', 'currency_symbol', "VARCHAR(8) NOT NULL DEFAULT '₹'");
  await addColumnIfNotExists('sales', 'tax_regime', "VARCHAR(32) NOT NULL DEFAULT 'GST'");
  await addColumnIfNotExists('sales', 'tax_inclusive', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumnIfNotExists('sales', 'tax_config_version', 'INT NOT NULL DEFAULT 1');
  await addColumnIfNotExists('sales', 'tax_registration_snapshot', 'VARCHAR(64) NULL');
  await addColumnIfNotExists('sales', 'tax_breakdown_json', 'TEXT NULL');
  await addColumnIfNotExists('sales', 'invoice_template_version', 'INT NOT NULL DEFAULT 1');
  await addColumnIfNotExists('sales', 'invoice_snapshot_json', 'LONGTEXT NULL');
  await addColumnIfNotExists('sales', 'reference_no', 'VARCHAR(64) NULL');
  await addColumnIfNotExists('sales', 'payment_proof_url', 'LONGTEXT NULL');
  await addColumnIfNotExists('sales', 'photos_json', 'TEXT NULL');

  // sale_items
  await addColumnIfNotExists('sale_items', 'tax_rate', 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('sale_items', 'tax_amount', 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00');
  await addColumnIfNotExists('sale_items', 'hsn_sac', 'VARCHAR(32) NULL');

  // purchases
  await addColumnIfNotExists('purchases', 'country_code', "VARCHAR(8) NOT NULL DEFAULT 'IN'");
  await addColumnIfNotExists('purchases', 'currency_code', "VARCHAR(8) NOT NULL DEFAULT 'INR'");
  await addColumnIfNotExists('purchases', 'tax_regime', "VARCHAR(32) NOT NULL DEFAULT 'GST'");
  await addColumnIfNotExists('purchases', 'tax_breakdown_json', 'TEXT NULL');
  await addColumnIfNotExists('purchases', 'subtotal', 'DECIMAL(15, 2) NULL DEFAULT 0.00');
  await addColumnIfNotExists('purchases', 'tax_amount', 'DECIMAL(15, 2) NULL DEFAULT 0.00');
  await addColumnIfNotExists('purchases', 'discount_amount', 'DECIMAL(15, 2) NULL DEFAULT 0.00');

  // purchase_items
  await addColumnIfNotExists('purchase_items', 'tax_rate', 'DECIMAL(5, 2) NULL DEFAULT 0.00');
  await addColumnIfNotExists('purchase_items', 'tax_amount', 'DECIMAL(12, 2) NULL DEFAULT 0.00');
  await addColumnIfNotExists('purchase_items', 'discount', 'DECIMAL(12, 2) NULL DEFAULT 0.00');

  // financial_ledger
  await addColumnIfNotExists('financial_ledger', 'currency_code', "VARCHAR(8) NOT NULL DEFAULT 'INR'");

  // system_settings
  await addColumnIfNotExists('system_settings', 'country_code', "VARCHAR(8) DEFAULT 'IN'");
  await addColumnIfNotExists('system_settings', 'currency_code', "VARCHAR(8) DEFAULT 'INR'");
  await addColumnIfNotExists('system_settings', 'currency_symbol', "VARCHAR(8) DEFAULT '₹'");
  await addColumnIfNotExists('system_settings', 'tax_regime', "VARCHAR(32) DEFAULT 'GST'");
  await addColumnIfNotExists('system_settings', 'tax_inclusive_pricing', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumnIfNotExists('system_settings', 'tax_registration_number', 'VARCHAR(64) NULL');
  await addColumnIfNotExists('system_settings', 'tax_jurisdiction_state', 'VARCHAR(64) NULL');
  await addColumnIfNotExists('system_settings', 'jurisdiction_config', 'TEXT NULL');
  await addColumnIfNotExists('system_settings', 'tax_config_version', 'INT NOT NULL DEFAULT 1');

  // branding_settings
  await addColumnIfNotExists('branding_settings', 'primary_color', "VARCHAR(32) DEFAULT '#002E86'");
  await addColumnIfNotExists('branding_settings', 'secondary_color', "VARCHAR(32) DEFAULT '#009ADF'");
  await addColumnIfNotExists('branding_settings', 'accent_color', "VARCHAR(32) DEFAULT '#2563EB'");
  await addColumnIfNotExists('branding_settings', 'logo_dark_url', 'LONGTEXT NULL');
  await addColumnIfNotExists('branding_settings', 'app_icon_url', 'LONGTEXT NULL');
  await addColumnIfNotExists('branding_settings', 'country', "VARCHAR(64) DEFAULT 'India'");
  await addColumnIfNotExists('branding_settings', 'country_code', "VARCHAR(8) DEFAULT 'IN'");
  await addColumnIfNotExists('branding_settings', 'timezone', "VARCHAR(64) DEFAULT 'Asia/Kolkata'");
  await addColumnIfNotExists('branding_settings', 'locale', "VARCHAR(16) DEFAULT 'en-IN'");

  // stores
  await addColumnIfNotExists('stores', 'owner_name', 'VARCHAR(128) NULL');
  await addColumnIfNotExists('stores', 'manager_name', 'VARCHAR(128) NULL');

  // expenses
  await addColumnIfNotExists('expenses', 'reference_no', 'VARCHAR(64) NULL');
  await addColumnIfNotExists('expenses', 'receipt_url', 'LONGTEXT NULL');
  await addColumnIfNotExists('expenses', 'recorded_by', 'VARCHAR(128) NULL');

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Widen International Formats
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Verifying International Column Widths ---');
  try {
    await db.$executeRawUnsafe('ALTER TABLE `branding_settings` MODIFY COLUMN `pincode` VARCHAR(32) NULL');
    await db.$executeRawUnsafe('ALTER TABLE `system_settings` MODIFY COLUMN `gstin` VARCHAR(32) NULL');
    await db.$executeRawUnsafe('ALTER TABLE `system_settings` MODIFY COLUMN `gst_state_code` VARCHAR(16) NULL');
    console.log('  ✅ Column widths widened for international compatibility.');
  } catch (err: any) {
    console.warn('  ⚠️ Note modifying widths:', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Safe Backfill of Legacy NULLs (India-era Database Support)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Executing Safe Historical Backfills ---');

  const tables = await getExistingTables();

  // Backfill Sales historical snapshots where NULL
  if (tables.has('sales')) {
    const updatedSales = await db.$executeRawUnsafe(`
      UPDATE \`sales\` 
      SET 
        \`country_code\` = COALESCE(NULLIF(\`country_code\`, ''), 'IN'),
        \`currency_code\` = COALESCE(NULLIF(\`currency_code\`, ''), 'INR'),
        \`currency_symbol\` = COALESCE(NULLIF(\`currency_symbol\`, ''), '₹'),
        \`tax_regime\` = COALESCE(NULLIF(\`tax_regime\`, ''), 'GST')
      WHERE \`country_code\` IS NULL 
         OR \`currency_code\` IS NULL 
         OR \`tax_regime\` IS NULL
    `);
    console.log(`  ✅ Verified/backfilled sales international snapshots (affected rows: ${updatedSales})`);
  }

  // Backfill Purchases historical snapshots where NULL
  if (tables.has('purchases')) {
    const updatedPurchases = await db.$executeRawUnsafe(`
      UPDATE \`purchases\` 
      SET 
        \`country_code\` = COALESCE(NULLIF(\`country_code\`, ''), 'IN'),
        \`currency_code\` = COALESCE(NULLIF(\`currency_code\`, ''), 'INR'),
        \`tax_regime\` = COALESCE(NULLIF(\`tax_regime\`, ''), 'GST')
      WHERE \`country_code\` IS NULL 
         OR \`currency_code\` IS NULL 
         OR \`tax_regime\` IS NULL
    `);
    console.log(`  ✅ Verified/backfilled purchase international snapshots (affected rows: ${updatedPurchases})`);
  }

  // Backfill Financial Ledger currency code where NULL
  if (tables.has('financial_ledger')) {
    const updatedLedger = await db.$executeRawUnsafe(`
      UPDATE \`financial_ledger\`
      SET \`currency_code\` = 'INR'
      WHERE \`currency_code\` IS NULL OR \`currency_code\` = ''
    `);
    console.log(`  ✅ Verified/backfilled financial ledger currencies (affected rows: ${updatedLedger})`);
  }

  // Backfill User Sessions lastSeenAt where NULL
  if (tables.has('user_sessions')) {
    const updatedSessions = await db.$executeRawUnsafe(`
      UPDATE \`user_sessions\`
      SET \`last_seen_at\` = \`created_at\`
      WHERE \`last_seen_at\` IS NULL
    `);
    console.log(`  ✅ Verified/backfilled session last_seen_at (affected rows: ${updatedSessions})`);
  }

  // Backfill Store Owner where NULL
  if (tables.has('stores')) {
    await db.$executeRawUnsafe(`
      UPDATE \`stores\` 
      SET \`owner_name\` = \`manager_name\` 
      WHERE \`owner_name\` IS NULL AND \`manager_name\` IS NOT NULL
    `);
  }

  // Ensure standard active payment methods exist idempotently
  console.log('\n--- 4b. Verifying Authoritative Payment Methods ---');
  const defaultMethods = [
    { name: 'Cash', code: 'CASH', type: 'Cash', description: 'Physical cash transactions', isSystem: true, sortOrder: 1 },
    { name: 'Card', code: 'CARD', type: 'Card', description: 'Credit and debit card payments', isSystem: true, sortOrder: 2 },
    { name: 'UPI', code: 'UPI', type: 'Digital', description: 'Instant UPI / QR Code payments', isSystem: false, sortOrder: 3 },
    { name: 'Bank Transfer', code: 'BANK_TRANSFER', type: 'Bank', description: 'Direct Wire / NEFT / RTGS transfer', isSystem: false, sortOrder: 4 },
    { name: 'Credit', code: 'CREDIT', type: 'Credit', description: 'Store credit / Accounts receivable', isSystem: false, sortOrder: 5 },
    { name: 'Other', code: 'OTHER', type: 'Other', description: 'Other instruments', isSystem: true, sortOrder: 6 },
  ];

  for (const m of defaultMethods) {
    const existingM = await (db as any).paymentMethod.findFirst({
      where: { OR: [{ code: m.code }, { name: m.name }] },
    });
    if (!existingM) {
      await (db as any).paymentMethod.create({
        data: {
          name: m.name,
          code: m.code,
          type: m.type,
          description: m.description,
          isSystem: m.isSystem,
          sortOrder: m.sortOrder,
          status: 'Active',
        },
      });
      console.log(`  ✅ Added standard payment method: ${m.name} (${m.code})`);
    } else {
      console.log(`  ✓ Payment method exists: ${m.name}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Composite Performance & Safety Indexes
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Verifying Performance & Composite Indexes ---');
  await addIndexIfNotExists('inventory', 'idx_inventory_storeCode_productId', '(store_code, product_id)');
  await addIndexIfNotExists('sales', 'idx_sales_storeCode_createdAt', '(store_code, created_at)');
  await addIndexIfNotExists('purchases', 'idx_purchases_storeCode_createdAt', '(store_code, created_at)');
  await addIndexIfNotExists('financial_ledger', 'idx_ledger_storeCode_entryDate', '(store_code, entry_date)');

  console.log('\n========================================================================');
  console.log('✅ RISMOS DATABASE MIGRATION ENGINE COMPLETED WITH ZERO DATA LOSS');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runProductionMigrations()
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
