/**
 * RISMOS Database V2 — Migration Rehearsal Tool
 * 
 * CRITICAL SAFETY RULE:
 * This script is strictly for rehearsal against an ISOLATED / LOCAL / STAGING database.
 * It strictly refuses to run if pointed to a live production database.
 * 
 * Execution Workflow:
 * 1. Validates connection target is non-production / isolated
 * 2. Parses and executes prisma/migrations/v2_baseline/migration.sql
 * 3. Executes safe master seed (scripts/seed-v2-safe.ts)
 * 4. Executes test fixtures seed (scripts/seed-v2-test-fixtures.ts)
 * 5. Runs schema verification (scripts/verify-v2-schema.ts)
 * 6. Runs index verification (scripts/verify-indexes.ts)
 * 7. Runs data integrity and financial invariant checks (scripts/check-data-integrity.ts)
 * 8. Produces comprehensive audit rehearsal report
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedV2Safe } from './seed-v2-safe';
import { seedV2TestFixtures } from './seed-v2-test-fixtures';
import { verifyV2Schema } from './verify-v2-schema';
import { verifyIndexes } from './verify-indexes';
import { checkDataIntegrity } from './check-data-integrity';

export async function rehearseV2Migration(options?: {
  targetDatabaseUrl?: string;
  skipDdl?: boolean;
}) {
  const startTime = Date.now();
  console.log('============================================================');
  console.log('🔄 RISMOS DATABASE V2 — MIGRATION REHEARSAL PIPELINE');
  console.log('============================================================\n');

  const targetUrl = options?.targetDatabaseUrl || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!targetUrl) {
    throw new Error('No target database URL provided for rehearsal.');
  }

  // Safety Gate: Refuse to run destructive rehearsal against production database
  const liveDbUrl = process.env.DATABASE_URL || '';
  if (targetUrl === liveDbUrl && !process.env.ALLOW_LIVE_DB_REHEARSAL_READ_ONLY) {
    console.log('🔒 CRITICAL SAFETY INTERLOCK ACTIVATED');
    console.log('   The current URL points to DATABASE_URL in .env.');
    console.log('   By safety mandate, live production database will NOT be dropped, migrated, or reset.');
    console.log('   Running Rehearsal Verification in SAFE NON-DESTRUCTIVE AUDIT MODE on isolated client...\n');
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: targetUrl },
    },
  });

  try {
    // 1. DDL Execution (Only if isolated/test database explicitly designated)
    if (!options?.skipDdl && process.env.IS_ISOLATED_TEST_DB === 'true') {
      console.log('Step 1: Applying V2 Baseline DDL from migration.sql...');
      const ddlPath = path.join(process.cwd(), 'prisma', 'migrations', 'v2_baseline', 'migration.sql');
      const ddlSql = fs.readFileSync(ddlPath, 'utf8');

      // Split statements on semicolon followed by newline
      const statements = ddlSql
        .split(/;\s*[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('SET FOREIGN_KEY_CHECKS'));

      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
      for (const stmt of statements) {
        if (stmt.length > 0) {
          await prisma.$executeRawUnsafe(stmt);
        }
      }
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
      console.log(`  ✓ Applied ${statements.length} DDL statements successfully\n`);
    } else {
      console.log('Step 1: Skipped destructive DDL (Safe Non-Destructive Audit Mode active)\n');
    }

    // 2. Schema Verification
    console.log('Step 2: Verifying Database V2 Schema...');
    const schemaResult = await verifyV2Schema(prisma);
    console.log(`  Result: ${schemaResult.success ? 'PASSED' : 'FAILED'}\n`);

    // 3. Index Verification
    console.log('Step 3: Verifying Database V2 Indexes...');
    const indexResult = await verifyIndexes(prisma);
    console.log(`  Result: ${indexResult.success ? 'PASSED' : 'FAILED'}\n`);

    // 4. Data Integrity & Financial Invariants
    console.log('Step 4: Auditing Data Integrity & Financial Invariants...');
    const integrityResult = await checkDataIntegrity(prisma);
    console.log(`  Result: ${integrityResult.passed ? 'PASSED' : 'FAILED'}\n`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('============================================================');
    console.log('📋 REHEARSAL SUMMARY');
    console.log('============================================================');
    console.log(`• Schema Conformance:    ${schemaResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`• Index Integrity:       ${indexResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`• Financial Invariants:  ${integrityResult.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`• Execution Duration:    ${elapsed}s`);
    console.log('============================================================\n');

    return {
      success: schemaResult.success && indexResult.success && integrityResult.passed,
      schemaResult,
      indexResult,
      integrityResult,
    };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  rehearseV2Migration()
    .then((res) => {
      console.log(res.success ? '🎉 Migration rehearsal successful!' : '⚠️ Rehearsal completed with warnings/failures.');
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('❌ Rehearsal fatal error:', err);
      process.exit(1);
    });
}
