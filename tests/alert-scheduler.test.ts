/**
 * P3-11: REAL ALERT SCHEDULER & CRON SECURITY TEST
 *
 * Requirements:
 * 1. Verify scheduled infrastructure exists.
 * 2. Test authenticated scheduler invocation using secret:
 *    - missing secret configuration
 *    - wrong secret
 *    - correct secret (Authorization: Bearer and x-cron-key)
 * 3. Missing CRON_SECRET must NOT fall back to a known/default credential.
 * 4. Verify deduplication of low-stock, overdue bill, and daily digest notifications.
 */

import { prisma } from '../src/lib/db';
import { POST as evaluateAlertsPOST } from '../src/app/api/alerts/evaluate/route';
import { evaluateSystemAlerts } from '../src/lib/services/alertService';
import { NextRequest } from 'next/server';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, extraInfo?: any) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    const errMsg = extraInfo ? `${description} -> ${JSON.stringify(extraInfo)}` : description;
    failures.push(errMsg);
    console.error(`  ❌ FAIL: ${errMsg}`);
  }
}

async function runAlertSchedulerSuite() {
  console.log('\n========================================================================');
  console.log('⏰ P3-11: REAL ALERT SCHEDULER & CRON SECURITY VERIFICATION');
  console.log('========================================================================\n');

  const originalCronSecret = process.env.CRON_SECRET;
  const testCronSecret = 'test_production_cron_secret_' + Math.random().toString(36).substring(2, 12);
  const createdNotificationIds: string[] = [];
  const testPrefix = `SCHED-${Date.now()}`;
  let testProductId: string | null = null;
  let testPoId: string | null = null;
  let testVendorId: string | null = null;

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. INFRASTRUCTURE & HANDLER EXISTENCE
    // ─────────────────────────────────────────────────────────────────────
    console.log('--- 1. Scheduled Infrastructure Existence ---');
    assert('Alert evaluation endpoint handler (POST) exists', typeof evaluateAlertsPOST === 'function');
    assert('evaluateSystemAlerts core engine function exists', typeof evaluateSystemAlerts === 'function');

    // ─────────────────────────────────────────────────────────────────────
    // 2. CRON AUTHENTICATION SECURITY MATRIX
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Cron Authentication Security Tests ---');

    // Scenario A: Missing CRON_SECRET in environment -> Fail-Closed
    delete process.env.CRON_SECRET;

    // Unauthenticated request
    const reqNoAuth = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
    });
    const resNoAuth = await evaluateAlertsPOST(reqNoAuth);
    const jsonNoAuth = await resNoAuth.json();
    assert(
      'Missing CRON_SECRET: Unauthenticated request rejected (401)',
      resNoAuth.status === 401,
      { status: resNoAuth.status, body: jsonNoAuth }
    );

    // Hardcoded fallback token attempt (must NOT succeed)
    const reqFallbackToken = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer rismos_scheduled_cron_secret_2026',
      },
    });
    const resFallbackToken = await evaluateAlertsPOST(reqFallbackToken);
    assert(
      'Missing CRON_SECRET: Fallback token attempt strictly rejected (no default bypass)',
      resFallbackToken.status === 401
    );

    // Empty string CRON_SECRET in environment -> Fail-Closed
    process.env.CRON_SECRET = '   ';
    const reqEmptySecret = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer    ',
      },
    });
    const resEmptySecret = await evaluateAlertsPOST(reqEmptySecret);
    assert(
      'Whitespace-only CRON_SECRET rejected (fails closed)',
      resEmptySecret.status === 401
    );

    // Scenario B: Configured CRON_SECRET with wrong credentials
    process.env.CRON_SECRET = testCronSecret;

    const reqWrongBearer = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid_secret_token_123',
      },
    });
    const resWrongBearer = await evaluateAlertsPOST(reqWrongBearer);
    assert(
      'Configured CRON_SECRET: Invalid Bearer token rejected (401)',
      resWrongBearer.status === 401
    );

    const reqWrongHeader = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        'x-cron-key': 'invalid_secret_token_123',
      },
    });
    const resWrongHeader = await evaluateAlertsPOST(reqWrongHeader);
    assert(
      'Configured CRON_SECRET: Invalid x-cron-key rejected (401)',
      resWrongHeader.status === 401
    );

    // Scenario C: Configured CRON_SECRET with VALID credentials
    const reqValidBearer = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testCronSecret}`,
      },
    });
    const resValidBearer = await evaluateAlertsPOST(reqValidBearer);
    const jsonValidBearer = await resValidBearer.json();
    assert(
      'Configured CRON_SECRET: Valid Bearer token accepted (200)',
      resValidBearer.status === 200 && jsonValidBearer.success === true,
      { status: resValidBearer.status }
    );

    const reqValidCronHeader = new NextRequest('http://localhost:3000/api/alerts/evaluate', {
      method: 'POST',
      headers: {
        'x-cron-key': testCronSecret,
      },
    });
    const resValidCronHeader = await evaluateAlertsPOST(reqValidCronHeader);
    const jsonValidCronHeader = await resValidCronHeader.json();
    assert(
      'Configured CRON_SECRET: Valid x-cron-key accepted (200)',
      resValidCronHeader.status === 200 && jsonValidCronHeader.success === true,
      { status: resValidCronHeader.status }
    );

    // ─────────────────────────────────────────────────────────────────────
    // 3. ALERT EVALUATION & DEDUPLICATION VERIFICATION
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Notification Deduplication Verification ---');

    // Ensure SystemSettings has alert toggles enabled
    let settings = await (prisma as any).systemSettings.findFirst();
    if (!settings) {
      settings = await (prisma as any).systemSettings.create({
        data: {
          lowStockAlerts: true,
          lowStockThreshold: 10,
          overduePaymentAlerts: true,
          overdueThresholdDays: 5,
          dailySalesDigest: true,
        },
      });
    } else {
      await (prisma as any).systemSettings.update({
        where: { id: settings.id },
        data: {
          lowStockAlerts: true,
          lowStockThreshold: 10,
          overduePaymentAlerts: true,
          overdueThresholdDays: 5,
          dailySalesDigest: true,
        },
      });
    }

    // A. Low Stock Deduplication
    const lowStockProduct = await prisma.product.create({
      data: {
        sku: `SKU-${testPrefix}-LOW`,
        name: `Low Stock Deduplication Product ${testPrefix}`,
        category: 'Hardware',
        baseSellingPrice: 50,
        baseCostPrice: 25,
        status: 'Active',
      },
    });
    testProductId = lowStockProduct.id;

    const lowStockInv = await prisma.inventory.create({
      data: {
        productId: lowStockProduct.id,
        storeCode: 'BLR',
        qtyOnHand: 3, // <= 10 threshold
      },
    });

    // Run first evaluation
    const summary1 = await evaluateSystemAlerts();
    console.log(`  Initial evaluation generated: ${summary1.lowStockAlertsCreated} low-stock alerts`);
    assert(
      'Initial evaluation generates low-stock alert for qualifying item',
      summary1.lowStockAlertsCreated >= 1
    );

    // Track created notification
    const lowNotif = await prisma.notification.findFirst({
      where: {
        relatedEntityType: 'Inventory',
        relatedEntityId: lowStockInv.id,
      },
    });
    if (lowNotif) createdNotificationIds.push(lowNotif.id);
    assert('Low stock notification persisted to database', !!lowNotif);

    // Run immediate second evaluation
    const summary2 = await evaluateSystemAlerts();
    console.log(`  Immediate second evaluation generated: ${summary2.lowStockAlertsCreated} low-stock alerts`);
    assert(
      'Second evaluation deduplicates low-stock alert within 24h window (0 duplicate created)',
      summary2.lowStockAlertsCreated === 0
    );

    // B. Overdue PO Deduplication
    const vendor = await prisma.vendor.create({
      data: {
        code: `VEND-${testPrefix}`,
        name: `Vendor Deduplication ${testPrefix}`,
        contactPerson: 'Contact Person',
        email: `vendor-${testPrefix}@example.com`,
        phone: '1234567890',
        city: 'Bangalore',
        categories: JSON.stringify(['General']),
        storeCode: 'BLR',
      },
    });
    testVendorId = vendor.id;

    const pastDueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago (> 5 threshold)
    const overduePO = await prisma.purchaseOrder.create({
      data: {
        poNo: `PO-${testPrefix}-OVD`,
        storeCode: 'BLR',
        vendorId: vendor.id,
        totalCost: 1500,
        paidAmount: 0,
        paymentStatus: 'Unpaid',
        status: 'Ordered',
        dueDate: pastDueDate,
        createdBy: 'system-test',
      },
    });
    testPoId = overduePO.id;

    // Run evaluation for overdue PO
    const summaryPO1 = await evaluateSystemAlerts();
    assert(
      'Evaluation generates overdue vendor bill notification',
      summaryPO1.overdueBillAlertsCreated >= 1
    );

    const poNotif = await prisma.notification.findFirst({
      where: {
        relatedEntityType: 'PurchaseOrder',
        relatedEntityId: overduePO.id,
      },
    });
    if (poNotif) createdNotificationIds.push(poNotif.id);
    assert('Overdue bill notification persisted to database', !!poNotif);

    // Run immediate repeat evaluation
    const summaryPO2 = await evaluateSystemAlerts();
    assert(
      'Repeat evaluation deduplicates overdue vendor bill alert within 48h window (0 duplicate created)',
      summaryPO2.overdueBillAlertsCreated === 0
    );

    // C. Daily Digest Deduplication
    // Count digest notifications created
    const superAdmin = await prisma.userAccount.findFirst({
      where: { role: 'Super Admin', status: 'Active' },
    });
    if (superAdmin) {
      const digestCountBefore = await prisma.notification.count({
        where: { userId: superAdmin.id, category: 'DIGEST' },
      });
      const summaryDigest = await evaluateSystemAlerts();
      const digestCountAfter = await prisma.notification.count({
        where: { userId: superAdmin.id, category: 'DIGEST' },
      });
      assert(
        'Digest evaluation does not create redundant digests within 12h window',
        summaryDigest.dailyDigestCreated === 0 || digestCountAfter === digestCountBefore + 1
      );

      // Subsequent call must generate 0 digests
      const summaryDigest2 = await evaluateSystemAlerts();
      assert(
        'Second digest evaluation creates 0 new digests (12h cooldown respected)',
        summaryDigest2.dailyDigestCreated === 0
      );
    }

  } catch (err: any) {
    console.error('Alert scheduler test error:', err);
    assert('Execution completed without unhandled exceptions', false, err.message);
  } finally {
    // Restore environment
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }

    console.log('\n--- Cleaning Up Alert Scheduler Test Records ---');
    try {
      if (createdNotificationIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { id: { in: createdNotificationIds } },
        });
      }
      if (testPoId) {
        await prisma.notification.deleteMany({
          where: { relatedEntityType: 'PurchaseOrder', relatedEntityId: testPoId },
        });
        await prisma.purchaseOrder.deleteMany({ where: { id: testPoId } });
      }
      if (testVendorId) {
        await prisma.vendor.deleteMany({ where: { id: testVendorId } });
      }
      if (testProductId) {
        await prisma.notification.deleteMany({
          where: { relatedEntityType: 'Inventory', relatedEntityId: { in: createdNotificationIds } },
        });
        await prisma.inventory.deleteMany({ where: { productId: testProductId } });
        await prisma.product.deleteMany({ where: { id: testProductId } });
      }
      console.log('  ✅ Cleaned up alert scheduler test records.');
    } catch (cleanupErr: any) {
      console.warn('  ⚠️ Cleanup warning:', cleanupErr.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runAlertSchedulerSuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
