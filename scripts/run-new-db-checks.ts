import { PrismaClient } from '@prisma/client';
import { verifyV2Schema } from './verify-v2-schema';
import { verifyIndexes } from './verify-indexes';
import { checkDataIntegrity } from './check-data-integrity';

const targetUrl = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!targetUrl) {
  throw new Error('DATABASE_URL or NEW_DATABASE_URL must be set in environment.');
}

async function runNewDbChecks() {
  console.log('============================================================');
  console.log('🔍 [NEW AIVEN DB VERIFICATION] RUNNING FULL AUDIT SUITE');
  console.log('============================================================\n');
  console.log('Target URL: rismos-rismos.b.aivencloud.com:22427/defaultdb\n');

  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    // 1. Schema Check
    console.log('1. SCHEMA VERIFICATION:');
    const schemaRes = await verifyV2Schema(prisma);
    console.log(`Schema Passed: ${schemaRes.success}\n`);

    // 2. Index Check
    console.log('2. INDEX & CONSTRAINT VERIFICATION:');
    const indexRes = await verifyIndexes(prisma);
    console.log(`Indexes Passed: ${indexRes.success}\n`);

    // 3. Data Integrity & Financial Invariants Check
    console.log('3. DATA INTEGRITY & INVARIANTS:');
    const integrityRes = await checkDataIntegrity(prisma);
    console.log(`Integrity Passed: ${integrityRes.passed}\n`);

    // 4. Record Counts Summary
    console.log('4. ACTIVE RECORDS AUDIT:');
    const counts = {
      stores: await prisma.storeHub.count(),
      users: await prisma.userAccount.count(),
      products: await prisma.product.count(),
      inventory: await prisma.inventory.count(),
      sales: await prisma.salesOrder.count(),
      purchases: await prisma.purchaseOrder.count(),
      customers: await prisma.customer.count(),
      vendors: await prisma.vendor.count(),
      categories: await prisma.category.count(),
      brands: await prisma.brand.count(),
      units: await prisma.unit.count(),
      paymentMethods: await prisma.paymentMethod.count(),
      ledgerEntries: await prisma.financialLedgerEntry.count(),
      sequenceCounters: await (prisma as any).sequenceCounter.count(),
    };
    console.table(counts);

    const allPassed = schemaRes.success && indexRes.success && integrityRes.passed;
    if (allPassed) {
      console.log('============================================================');
      console.log('🎉 ALL NEW DATABASE AUDITS PASSED WITH 100% SUCCESS!');
      console.log('============================================================');
      process.exit(0);
    } else {
      console.error('❌ Some audit checks failed.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runNewDbChecks().catch((err) => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
