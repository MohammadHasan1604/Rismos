import { prisma } from '../src/lib/db';

export async function migrateRemediationTables() {
  console.log('--- Applying Database Migrations for Remediation Suite ---');

  // 1. Create sequence_counters table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sequence_counters (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prefix VARCHAR(32) NOT NULL UNIQUE,
        current_value BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX sequence_counters_prefix_idx (prefix)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table `sequence_counters` verified/created.');
  } catch (err: any) {
    console.error('Failed to create sequence_counters:', err.message);
    throw err;
  }

  // 2. Create password_resets table
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        ip_address VARCHAR(64) NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX password_resets_user_id_idx (user_id),
        INDEX password_resets_expires_at_idx (expires_at),
        CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table `password_resets` verified/created.');
  } catch (err: any) {
    // If foreign key constraint already exists or different syntax, fallback without failing
    if (err.message?.includes('already exists') || err.message?.includes('Duplicate key')) {
      console.log('ℹ️ Table `password_resets` already exists.');
    } else {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS password_resets (
            id VARCHAR(191) NOT NULL PRIMARY KEY,
            user_id VARCHAR(191) NOT NULL,
            token VARCHAR(128) NOT NULL UNIQUE,
            expires_at DATETIME(3) NOT NULL,
            ip_address VARCHAR(64) NULL,
            used_at DATETIME(3) NULL,
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            INDEX password_resets_user_id_idx (user_id),
            INDEX password_resets_expires_at_idx (expires_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Table `password_resets` created (standalone).');
      } catch (fallbackErr: any) {
        console.warn('Note on password_resets table:', fallbackErr.message);
      }
    }
  }

  // 3. Seed / Backfill initial sequence counters from existing max records
  try {
    // Sales: find max sales order number
    const sales = await prisma.salesOrder.findMany({
      select: { orderNo: true },
      orderBy: { orderNo: 'desc' },
      take: 100,
    });

    let maxSalesNum = 260000n;
    for (const s of sales) {
      const match = s.orderNo?.match(/\d+$/);
      if (match) {
        const val = BigInt(match[0]);
        if (val > maxSalesNum) maxSalesNum = val;
      }
    }

    const defaultCounters = [
      { prefix: 'CS', startVal: maxSalesNum },
      { prefix: 'CS26001', startVal: 10n }, // BLR store prefix
      { prefix: 'CS26002', startVal: 10n }, // HYD store prefix
      { prefix: 'CS26003', startVal: 10n }, // DEL store prefix
      { prefix: 'CS26004', startVal: 10n }, // MUM store prefix
      { prefix: 'PO', startVal: 10000n },
      { prefix: 'PO-2026-', startVal: 100n },
      { prefix: 'EXP', startVal: 5000n },
      { prefix: 'EXP-2026-', startVal: 100n },
      { prefix: 'TRF-2026-', startVal: 10n },
    ];

    for (const c of defaultCounters) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO sequence_counters (prefix, current_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value))`,
        c.prefix,
        c.startVal
      );
    }
    console.log('✅ Sequence counters initialized with baseline values.');
  } catch (seedErr: any) {
    console.warn('Notice while initializing sequence counters:', seedErr.message);
  }

  console.log('Remediation database migration completed successfully!\n');
}

if (require.main === module) {
  migrateRemediationTables()
    .catch((e) => {
      console.error('Migration error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
