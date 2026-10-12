import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { verifyV2Schema } from './verify-v2-schema';
import { verifyIndexes } from './verify-indexes';

const OLD_DB_URL = process.env.OLD_DATABASE_URL || process.env.V1_DATABASE_URL;
const NEW_DB_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!NEW_DB_URL) {
  throw new Error('CRITICAL: NEW_DATABASE_URL or DATABASE_URL must be set in environment.');
}

async function applyBaselineToNewDb() {
  console.log('============================================================');
  console.log('🚀 [DATABASE V2 CUTOVER] APPLYING BASELINE DDL TO NEW AIVEN DB');
  console.log('============================================================\n');

  if (OLD_DB_URL && NEW_DB_URL === OLD_DB_URL) {
    throw new Error('CRITICAL SAFETY ABORT: Target database URL matches old DATABASE_URL! Refusing to run.');
  }

  if (NEW_DB_URL && !NEW_DB_URL.includes('rismos-rismos.b.aivencloud.com')) {
    console.warn('⚠️ Warning: Target host does not match expected new Aiven host.');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: NEW_DB_URL } },
  });

  try {
    console.log('1. Verifying target database state...');
    const existingTables: Array<{ TABLE_NAME: string }> = await prisma.$queryRaw`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()
    `;

    console.log(`   Discovered ${existingTables.length} tables in target database.`);
    if (existingTables.length > 0) {
      console.log('   Target database already contains tables. Verifying existing schema...');
    } else {
      console.log('   Target database is confirmed EMPTY (0 tables). Applying baseline DDL...\n');

      const ddlPath = path.join(process.cwd(), 'prisma', 'migrations', 'v2_baseline', 'migration.sql');
      const ddlContent = fs.readFileSync(ddlPath, 'utf8');

      // Remove comment lines and split on semicolon
      const cleanSql = ddlContent
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

      const rawStatements = cleanSql.split(';');
      const statements = rawStatements
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.toLowerCase().startsWith('set foreign_key_checks'));

      console.log(`2. Executing ${statements.length} DDL statements...`);
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

      let count = 0;
      for (const stmt of statements) {
        if (stmt.length > 0) {
          count++;
          try {
            await prisma.$executeRawUnsafe(stmt);
          } catch (err: any) {
            console.error(`❌ Failed on statement ${count}:`, stmt.substring(0, 100));
            throw err;
          }
        }
      }

      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
      console.log(`   ✓ Successfully executed ${count} DDL statements.\n`);
    }

    // 3. Schema Verification
    console.log('3. Running Schema Verification against new database...');
    const schemaResult = await verifyV2Schema(prisma);
    console.log(`   Schema Status: ${schemaResult.success ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    if (!schemaResult.success) {
      throw new Error(`Schema verification failed. Missing tables: ${schemaResult.missingTables.join(', ')}`);
    }

    // 4. Index Verification
    console.log('4. Running Index Verification against new database...');
    const indexResult = await verifyIndexes(prisma);
    console.log(`   Index Status: ${indexResult.success ? 'PASSED ✅' : 'FAILED ❌'}\n`);

    console.log('============================================================');
    console.log('🎉 BASELINE DDL APPLIED AND VERIFIED SUCCESSFULLY!');
    console.log('============================================================');
  } finally {
    await prisma.$disconnect();
  }
}

applyBaselineToNewDb().catch((err) => {
  console.error('Fatal error applying baseline DDL:', err);
  process.exit(1);
});
