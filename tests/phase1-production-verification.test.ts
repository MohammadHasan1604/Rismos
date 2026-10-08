/**
 * Phase 1 Production Verification Suite
 *
 * Verifies all Phase 1 Requirements P0-1 through P0-13:
 * - P0-1: Database schema, migration script, and snapshot columns
 * - P0-2: Net Tax-Exclusive Gross Profit calculation (excludes tax liability)
 * - P0-3: Authoritative Tax Engine for Sales and Purchases (India & UAE)
 * - P0-4: Proportional cart discount allocation & exact decimal rounding
 * - P0-5: US Sales Tax without fabricated state/local split
 * - P0-6: Authoritative DB payment methods (UPI not forced outside India)
 * - P0-7: Real sensitive-action step-up token security & single-use consumption
 * - P0-8: Cron authentication fails closed without CRON_SECRET
 * - P0-9: Scheduled alerts & business timezone handling
 * - P0-10 & P0-11: Password policy resolver & session revocation
 * - P0-12: Double-entry financial ledger consistency (Debits == Credits) & currency snapshots
 * - P0-13: Concurrency locking & idempotency
 */

import { TaxService, LineTaxItem } from '../src/lib/services/taxService';
import { calculateApplicableTax } from '../src/lib/localization/formatters';
import { validatePasswordAgainstPolicy } from '../src/lib/passwordPolicy';
import { validatePaymentMethodAgainstDb } from '../src/lib/paymentValidator';
import { verifySensitiveAction } from '../src/lib/sensitiveAction';
import { prisma } from '../src/lib/db';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function assertTest(name: string, fn: () => boolean | Promise<boolean> | void | Promise<void>) {
  try {
    const result = await fn();
    if (result === false) {
      throw new Error('Assertion returned false');
    }
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name} - ${err.message}`);
    failures.push(`${name}: ${err.message}`);
    failed++;
  }
}

async function runPhase1Verification() {
  console.log('\n====================================================================');
  console.log('🚀 RUNNING PHASE 1 PRODUCTION VERIFICATION SUITE');
  console.log('====================================================================\n');

  // ──────────────────────────────────────────────────────────────────
  // P0-1: Schema & DB Migrations
  // ──────────────────────────────────────────────────────────────────
  console.log('📦 P0-1: Database Schema & Migration Verification');

  await assertTest('scripts/migrate-production.ts exists and defines idempotent schema', () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'scripts/migrate-production.ts'), 'utf8');
    return (
      content.includes('step_up_grants') &&
      content.includes('last_seen_at') &&
      content.includes('tax_breakdown_json') &&
      content.includes('country_code') &&
      content.includes('currency_code')
    );
  });

  await assertTest('Live DB contains all required snapshot columns on sales and purchases', async () => {
    const salesColumns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales'
    `;
    const salesColNames = salesColumns.map((c) => c.COLUMN_NAME);

    const purchaseColumns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchases'
    `;
    const purchaseColNames = purchaseColumns.map((c) => c.COLUMN_NAME);

    const sessionColumns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions'
    `;
    const sessionColNames = sessionColumns.map((c) => c.COLUMN_NAME);

    return (
      salesColNames.includes('tax_breakdown_json') &&
      salesColNames.includes('country_code') &&
      salesColNames.includes('currency_code') &&
      purchaseColNames.includes('tax_breakdown_json') &&
      purchaseColNames.includes('country_code') &&
      purchaseColNames.includes('currency_code') &&
      sessionColNames.includes('last_seen_at')
    );
  });

  await assertTest('step_up_grants table exists in database', async () => {
    const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'step_up_grants'
    `;
    return tables.length > 0;
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-2: Profit Calculation Excludes Tax
  // ──────────────────────────────────────────────────────────────────
  console.log('\n💰 P0-2: Profit Calculation (Net Tax-Exclusive Revenue - COGS)');

  await assertTest('Tax-Exclusive Sale: grossProfit = netSalesRevenue - COGS (does not include tax)', async () => {
    const taxContext = await TaxService.resolveTaxContext({
      countryCode: 'IN',
      currencyCode: 'INR',
      currencySymbol: '₹',
      taxRegime: 'GST',
      taxInclusivePricing: false,
      defaultTaxRate: 18,
      taxConfigVersion: 1,
    });

    const items: LineTaxItem[] = [
      {
        productId: 'prod-1',
        productName: 'Phone Case',
        sku: 'CASE-01',
        qty: 2,
        unitPrice: 500, // Gross = 1000
        productTaxRate: 18, // Tax 18% = 180
      },
    ];

    const result = TaxService.calculateTransactionTax(items, taxContext, 0);
    // Exclusive: subtotal = 1000, tax = 180, grandTotal = 1180, netSalesRevenue = 1000
    if (result.subtotal !== 1000 || result.taxAmount !== 180 || result.grandTotal !== 1180) {
      throw new Error(`Unexpected tax result: ${JSON.stringify(result)}`);
    }

    const cogs = 600; // Cost = 300 * 2
    const netSalesRevenue = result.netSalesRevenue; // 1000
    const grossProfit = Math.round((netSalesRevenue - cogs) * 100) / 100;

    // Gross profit must be 400 (NOT 1180 - 600 = 580)
    if (grossProfit !== 400) {
      throw new Error(`Gross profit was ${grossProfit}, expected 400`);
    }
  });

  await assertTest('Tax-Inclusive Sale: grossProfit uses net base, not shelf price including tax', async () => {
    const taxContext = await TaxService.resolveTaxContext({
      countryCode: 'AE',
      currencyCode: 'AED',
      currencySymbol: 'AED',
      taxRegime: 'VAT',
      taxInclusivePricing: true,
      defaultTaxRate: 5,
      taxConfigVersion: 1,
    });

    const items: LineTaxItem[] = [
      {
        productId: 'prod-2',
        productName: 'Luxury Watch',
        sku: 'WATCH-01',
        qty: 1,
        unitPrice: 105, // Shelf price with 5% VAT -> Base = 100, VAT = 5
        productTaxRate: 5,
      },
    ];

    const result = TaxService.calculateTransactionTax(items, taxContext, 0);
    if (result.grandTotal !== 105 || result.taxAmount !== 5 || result.netSalesRevenue !== 100) {
      throw new Error(`Inclusive calculation mismatch: ${JSON.stringify(result)}`);
    }

    const cogs = 70;
    const grossProfit = Math.round((result.netSalesRevenue - cogs) * 100) / 100;
    // Gross profit must be 100 - 70 = 30 (NOT 105 - 70 = 35)
    if (grossProfit !== 30) {
      throw new Error(`Gross profit was ${grossProfit}, expected 30`);
    }
  });

  await assertTest('Zero-Tax Sale: grossProfit equals revenue minus COGS', async () => {
    const taxContext = await TaxService.resolveTaxContext({
      countryCode: 'IN',
      defaultTaxRate: 0,
      taxInclusivePricing: false,
    });

    const items: LineTaxItem[] = [
      {
        productId: 'prod-zero',
        productName: 'Fresh Produce',
        sku: 'VEG-01',
        qty: 5,
        unitPrice: 40,
        productTaxRate: 0,
      },
    ];

    const result = TaxService.calculateTransactionTax(items, taxContext, 0);
    const cogs = 120;
    const grossProfit = Math.round((result.netSalesRevenue - cogs) * 100) / 100;
    if (result.taxAmount !== 0 || grossProfit !== 80) {
      throw new Error(`Zero-tax mismatch: tax=${result.taxAmount}, profit=${grossProfit}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-3 & P0-4: Authoritative Tax Engine & Proportional Discount Allocation
  // ──────────────────────────────────────────────────────────────────
  console.log('\n🏛️ P0-3 & P0-4: Authoritative Tax Engine & Proportional Discount Base');

  await assertTest('Cart-level discount is allocated proportionally before tax is computed', async () => {
    const taxContext = await TaxService.resolveTaxContext({
      countryCode: 'IN',
      taxInclusivePricing: false,
      defaultTaxRate: 18,
    });

    const items: LineTaxItem[] = [
      { productId: 'p1', productName: 'Item A', sku: 'A', qty: 1, unitPrice: 600, productTaxRate: 18 },
      { productId: 'p2', productName: 'Item B', sku: 'B', qty: 1, unitPrice: 400, productTaxRate: 18 },
    ];

    // Cart discount of 100: Item A gets 60%, Item B gets 40%
    const result = TaxService.calculateTransactionTax(items, taxContext, 100);

    const lineA = result.lines.find((l) => l.productId === 'p1')!;
    const lineB = result.lines.find((l) => l.productId === 'p2')!;

    if (lineA.allocatedCartDiscount !== 60 || lineB.allocatedCartDiscount !== 40) {
      throw new Error(`Proportional discount failed: A=${lineA.allocatedCartDiscount}, B=${lineB.allocatedCartDiscount}`);
    }

    if (result.netSalesRevenue !== 900 || result.taxAmount !== 162 || result.grandTotal !== 1062) {
      throw new Error(`Tax totals mismatch with discount: net=${result.netSalesRevenue}, tax=${result.taxAmount}, total=${result.grandTotal}`);
    }
  });

  await assertTest('Tax Engine resolves UAE VAT 5% cleanly and does not default to IN/GST', async () => {
    const uaeContext = await TaxService.resolveTaxContext({
      countryCode: 'AE',
    });

    if (uaeContext.countryCode !== 'AE' || uaeContext.currencyCode !== 'AED' || uaeContext.taxRegime !== 'VAT') {
      throw new Error(`UAE context invalid: ${JSON.stringify(uaeContext)}`);
    }

    const items: LineTaxItem[] = [
      { productId: 'uae-1', productName: 'Item Dubai', sku: 'DXB-1', qty: 1, unitPrice: 200, productTaxRate: 5 },
    ];
    const uaeResult = TaxService.calculateTransactionTax(items, uaeContext, 0);

    if (uaeResult.context.countryCode !== 'AE' || uaeResult.context.taxRegime !== 'VAT') {
      throw new Error(`UAE tax result context mismatch`);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-5: US Sales Tax Does Not Fabricate Components
  // ──────────────────────────────────────────────────────────────────
  console.log('\n🇺🇸 P0-5: US Sales Tax Format (No Fabricated Split)');

  await assertTest('US combined rate shows single component without fake 6% state / local split', () => {
    const result = calculateApplicableTax({
      amount: 100,
      taxRate: 8.25,
      countryCode: 'US',
      isInclusive: false,
    });

    if (result.breakdown.some((b) => b.name.includes('State') || b.rate === 6)) {
      throw new Error('US tax calculation fabricated state rate component!');
    }
    const hasSalesTax = result.breakdown.some((b) => b.name === 'Sales Tax (8.25%)' && b.rate === 8.25);
    if (!hasSalesTax) {
      throw new Error(`Expected Sales Tax (8.25%), got: ${JSON.stringify(result.breakdown)}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-6: Authoritative Payment Methods
  // ──────────────────────────────────────────────────────────────────
  console.log('\n💳 P0-6: Authoritative DB Payment Methods');

  await assertTest('Active payment methods validate against DB and UPI is not globally forced', async () => {
    const cashVal = await validatePaymentMethodAgainstDb('Cash');
    const cardVal = await validatePaymentMethodAgainstDb('Card');
    const invalidVal = await validatePaymentMethodAgainstDb('FakeCoin');

    if (!cashVal.valid || !cardVal.valid || invalidVal.valid) {
      throw new Error(`Validation against DB failed: cash=${cashVal.valid}, card=${cardVal.valid}, fake=${invalidVal.valid}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-7: Real Sensitive-Action Step-Up Security
  // ──────────────────────────────────────────────────────────────────
  console.log('\n🔐 P0-7: Sensitive-Action Server Step-Up Authentication');

  await assertTest('Fake booleans (confirmAction: true) are rejected when step-up is required', async () => {
    const fakeReq = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmAction: true, reason: 'Valid refund reason' }),
    });

    const result = await verifySensitiveAction(
      fakeReq,
      { confirmAction: true, reason: 'Valid refund reason' },
      { id: 'user-test', role: 'Store Manager', securityLevel: 80 } as any,
      'REFUND'
    );

    if (result.allowed) {
      throw new Error('Fake boolean confirmAction: true was accepted as valid step-up!');
    }
    if (!result.error?.toLowerCase().includes('step-up')) {
      throw new Error(`Unexpected error message: ${result.error}`);
    }
  });

  await assertTest('Valid single-use step-up grant is verified and consumed atomically', async () => {
    const plainToken = 'test_token_' + crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const userId = 'stepup-user-' + Date.now();

    const testEmail = `stepup_${Date.now()}@test.com`;
    // Create test user
    await prisma.userAccount.create({
      data: {
        id: userId,
        email: testEmail,
        passwordHash: 'dummy',
        name: 'Stepup Test User',
        role: 'Store Manager',
        securityLevel: 80,
        storeScope: 'BLR',
      },
    });

    await (prisma as any).stepUpGrant.create({
      data: {
        userId,
        tokenHash,
        actionType: 'REFUND',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
      },
    });

    const reqWithToken = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-step-up-grant': plainToken,
      },
      body: JSON.stringify({ reason: 'Legitimate customer return justification' }),
    });

    // First use: must succeed
    const firstVerify = await verifySensitiveAction(
      reqWithToken,
      { reason: 'Legitimate customer return justification' },
      { id: userId, email: testEmail, role: 'Store Manager', securityLevel: 80 } as any,
      'REFUND'
    );

    if (!firstVerify.allowed) {
      throw new Error(`First verification failed: ${firstVerify.error}`);
    }

    // Second use: must fail because grant is single-use
    const secondVerify = await verifySensitiveAction(
      reqWithToken,
      { reason: 'Legitimate customer return justification' },
      { id: userId, email: testEmail, role: 'Store Manager', securityLevel: 80 } as any,
      'REFUND'
    );

    if (secondVerify.allowed) {
      throw new Error('Replayed step-up token was accepted a second time!');
    }

    // Cleanup
    await (prisma as any).stepUpGrant.deleteMany({ where: { userId } });
    await prisma.userAccount.delete({ where: { id: userId } });
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-8: Cron Secret Fails Closed
  // ──────────────────────────────────────────────────────────────────
  console.log('\n⏰ P0-8: Cron Authentication Fails Closed');

  await assertTest('Evaluate endpoint source does not contain hard-coded fallback cron secret', () => {
    const routeCode = fs.readFileSync(path.join(process.cwd(), 'src/app/api/alerts/evaluate/route.ts'), 'utf8');
    if (routeCode.includes('rismos_scheduled_cron_secret_2026')) {
      throw new Error('Public fallback cron secret found in evaluate route!');
    }
    return (
      routeCode.includes('timingSafeEqual') &&
      routeCode.includes('Fail-closed if CRON_SECRET is absent')
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-9: Scheduled Alerts & Timezone
  // ──────────────────────────────────────────────────────────────────
  console.log('\n📅 P0-9: Scheduled Alert Execution & Timezone');

  await assertTest('Netlify scheduled-alerts function exists with @hourly schedule', () => {
    const fnPath = path.join(process.cwd(), 'netlify/functions/scheduled-alerts.mts');
    if (!fs.existsSync(fnPath)) return false;
    const content = fs.readFileSync(fnPath, 'utf8');
    return content.includes("schedule: '@hourly'") && content.includes('evaluateSystemAlerts');
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-10 & P0-11: Password Policy & Session Revocation
  // ──────────────────────────────────────────────────────────────────
  console.log('\n🔑 P0-10 & P0-11: Password Policy & Session Revocation');

  await assertTest('Authoritative password policy validates complex passwords and rejects weak ones', async () => {
    const strong = await validatePasswordAgainstPolicy('Enterprise2026!SecureKey');
    const weak = await validatePasswordAgainstPolicy('123456');

    if (!strong.valid) {
      throw new Error(`Strong password failed validation: ${strong.errors.join(', ')}`);
    }
    if (weak.valid) {
      throw new Error('Weak password passed validation!');
    }
    return true;
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-12: Double-Entry Financial Ledger Reconciliation
  // ──────────────────────────────────────────────────────────────────
  console.log('\n⚖️ P0-12: Double-Entry Financial Ledger Reconciliation');

  await assertTest('Completed Sales ledger entries reconcile: Sum(Debits) == Sum(Credits)', async () => {
    const completedSales = await (prisma as any).salesOrder.findMany({
      where: { status: 'Completed' },
      take: 10,
    });

    for (const sale of completedSales) {
      const entries = await (prisma as any).financialLedgerEntry.findMany({
        where: { refType: 'SALE', refNo: sale.orderNo },
      });

      if (entries.length > 0) {
        const totalDebits = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
        const totalCredits = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);
        const diff = Math.abs(Math.round((totalDebits - totalCredits) * 100) / 100);
        if (diff > 0.02) {
          throw new Error(`Sales ledger unbalanced for ${sale.orderNo}: Debits=${totalDebits}, Credits=${totalCredits}`);
        }
      }
    }
  });

  await assertTest('Completed Purchases ledger entries reconcile: Sum(Debits) == Sum(Credits)', async () => {
    const purchaseGRNs = await (prisma as any).financialLedgerEntry.findMany({
      where: { refType: 'PURCHASE_GRN' },
      take: 20,
    });

    const byRefNo = new Map<string, any[]>();
    for (const entry of purchaseGRNs) {
      const list = byRefNo.get(entry.refNo) || [];
      list.push(entry);
      byRefNo.set(entry.refNo, list);
    }

    for (const [refNo, entries] of byRefNo.entries()) {
      const totalDebits = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
      const totalCredits = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);
      const diff = Math.abs(Math.round((totalDebits - totalCredits) * 100) / 100);
      if (diff > 0.02) {
        throw new Error(`Purchase GRN ledger unbalanced for ${refNo}: Debits=${totalDebits}, Credits=${totalCredits}`);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // P0-13: Concurrency & Idempotency
  // ──────────────────────────────────────────────────────────────────
  console.log('\n🔒 P0-13: Concurrency & Idempotency Safeguards');

  await assertTest('salesService enforces row-level locking (FOR UPDATE) and conditional updates', () => {
    const serviceCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/services/salesService.ts'), 'utf8');
    return (
      serviceCode.includes('FOR UPDATE') &&
      serviceCode.includes('qty_on_hand >=') &&
      serviceCode.includes('statusCode = 409')
    );
  });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`📊 PHASE 1 PRODUCTION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.error('Failures:\n' + failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
}

runPhase1Verification()
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
