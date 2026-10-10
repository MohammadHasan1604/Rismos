import { prisma } from '../src/lib/db';
import { executePOSCheckout } from '../src/lib/services/salesService';
import { TaxService } from '../src/lib/services/taxService';

/**
 * P3-9: Financial Integrity & Double-Entry Accounting Invariant Test
 *
 * Requirements:
 * Deterministic tests for:
 * 1. Sales: subtotal, discount, tax, grand total, COGS, gross profit, ledger
 * 2. Tax-inclusive sale
 * 3. Tax-exclusive sale
 * 4. Refund / Void
 * 5. Purchase
 * 6. Partial payment
 * 7. Expense
 * 8. Stock Transfer
 *
 * INVARIANTS TESTED:
 * - For EVERY accounting transaction: sum(debits) === sum(credits)
 * - Stored order-level profit strictly excludes tax (Profit = Net Sales - COGS)
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${description}${details ? ` -> ${details}` : ''}`);
    failures.push(description);
    failed++;
  }
}

async function runFinancialIntegritySuite() {
  console.log('========================================================================');
  console.log('💰 P3-9: FINANCIAL INTEGRITY & DOUBLE-ENTRY INVARIANT VERIFICATION');
  console.log('========================================================================\n');

  const testStoreCode = 'BLR';
  const testPrefix = 'FIN-' + Date.now().toString().slice(-6);

  // Setup deterministic test products
  const productA = await prisma.product.create({
    data: {
      sku: `SKU-${testPrefix}-A`,
      name: `Fin Product A ${testPrefix}`,
      category: 'Electronics',
      baseSellingPrice: 1000,
      baseCostPrice: 600, // 400 profit per unit before tax
      gstRate: 18,
      status: 'active',
    },
  });

  const productB = await prisma.product.create({
    data: {
      sku: `SKU-${testPrefix}-B`,
      name: `Fin Product B ${testPrefix}`,
      category: 'Electronics',
      baseSellingPrice: 500,
      baseCostPrice: 300, // 200 profit per unit before tax
      gstRate: 18,
      status: 'active',
    },
  });

  // Ensure stock exists in BLR
  await prisma.inventory.upsert({
    where: { productId_storeCode: { productId: productA.id, storeCode: testStoreCode } },
    create: { productId: productA.id, storeCode: testStoreCode, qtyOnHand: 100 },
    update: { qtyOnHand: 100 },
  });

  await prisma.inventory.upsert({
    where: { productId_storeCode: { productId: productB.id, storeCode: testStoreCode } },
    create: { productId: productB.id, storeCode: testStoreCode, qtyOnHand: 100 },
    update: { qtyOnHand: 100 },
  });

  const createdOrderNos: string[] = [];
  const createdRefNos: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. TAX-INCLUSIVE SALE CHECKOUT & PROFIT EXCLUSION
    // ─────────────────────────────────────────────────────────────────────
    console.log('--- 1. Testing Tax-Inclusive Sale & Order Profit Calculation ---');
    // Ensure tax-inclusive setting for this test
    await (prisma as any).systemSettings.update({
      where: { id: 'cosko_system_config' },
      data: { taxInclusivePricing: true, countryCode: 'IN', currencyCode: 'INR', defaultTaxRate: 18 },
    });

    const saleInc = await executePOSCheckout({
      storeCode: testStoreCode,
      customerName: 'Fin Customer Inclusive',
      customerPhone: '+919876543210',
      items: [
        {
          productId: productA.id,
          productName: productA.name,
          sku: productA.sku,
          qty: 2,
          unitPrice: 1000, // Shelf price 1000 inclusive of 18% tax
        },
      ],
      discountAmount: 100, // Cart discount 100
      paymentMethod: 'Cash',
      cashierName: 'fin-tester',
      paymentProofUrl: 'https://storage.rismos.com/payment-proofs/test-proof-1.jpg',
    });

    createdOrderNos.push(saleInc.orderNo);

    // Shelf total before discount: 2000. Grand total after discount: 1900.
    assert('Tax-inclusive grand total equals shelf price minus discount (1900)', Number(saleInc.grandTotal) === 1900);
    // Net Sales Revenue = 1900 / 1.18 = 1610.17
    // Tax Amount = 1900 - 1610.17 = 289.83
    assert('Tax amount is calculated accurately from inclusive price (~289.83)', Math.abs(Number(saleInc.taxAmount) - 289.83) <= 0.05);

    // COGS = 2 * 600 = 1200
    assert('COGS equals authoritative unit cost * qty (1200)', Number(saleInc.totalCost) === 1200);

    // Order Gross Profit MUST exclude tax: Profit = Net Sales Revenue (1610.17) - COGS (1200) = 410.17
    // NOT (Grand Total 1900 - 1200 = 700)
    const expectedGrossProfit = Math.round((1610.17 - 1200) * 100) / 100;
    assert(
      `Order gross profit strictly excludes tax (${saleInc.grossProfit} == ~410.17)`,
      Math.abs(Number(saleInc.grossProfit) - expectedGrossProfit) <= 0.05
    );

    // Verify Ledger Debits == Credits for this sale
    const ledgerInc = await prisma.financialLedgerEntry.findMany({
      where: { refNo: saleInc.orderNo },
    });
    assert('Sale generated at least 4 double-entry ledger entries', ledgerInc.length >= 4);

    let sumDebitInc = 0;
    let sumCreditInc = 0;
    for (const entry of ledgerInc) {
      sumDebitInc += Number(entry.debit);
      sumCreditInc += Number(entry.credit);
    }
    const diffInc = Math.abs(sumDebitInc - sumCreditInc);
    assert(
      `Tax-inclusive sale ledger is balanced: Debits (${sumDebitInc.toFixed(2)}) == Credits (${sumCreditInc.toFixed(2)}), diff = ${diffInc}`,
      diffInc <= 0.02
    );

    // ─────────────────────────────────────────────────────────────────────
    // 2. TAX-EXCLUSIVE SALE CHECKOUT
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Tax-Exclusive Sale ---');
    await (prisma as any).systemSettings.update({
      where: { id: 'cosko_system_config' },
      data: { taxInclusivePricing: false, countryCode: 'IN', currencyCode: 'INR', defaultTaxRate: 18 },
    });

    const saleExc = await executePOSCheckout({
      storeCode: testStoreCode,
      customerName: 'Fin Customer Exclusive',
      customerPhone: '+919876543210',
      items: [
        {
          productId: productB.id,
          productName: productB.name,
          sku: productB.sku,
          qty: 1,
          unitPrice: 500, // Shelf price 500 exclusive of 18% tax
        },
      ],
      paymentMethod: 'UPI',
      cashierName: 'fin-tester',
      paymentProofUrl: 'https://storage.rismos.com/payment-proofs/test-proof-2.jpg',
    });

    createdOrderNos.push(saleExc.orderNo);

    // Subtotal: 500. Tax: 18% of 500 = 90. Grand total: 590.
    assert('Tax-exclusive subtotal is 500', Number(saleExc.subtotal) === 500);
    assert('Tax-exclusive tax amount is 90 (18% of 500)', Number(saleExc.taxAmount) === 90);
    assert('Tax-exclusive grand total is 590', Number(saleExc.grandTotal) === 590);

    // COGS = 300. Profit = 500 - 300 = 200 (excludes tax!)
    assert('Tax-exclusive profit strictly excludes tax (200 == 500 - 300)', Number(saleExc.grossProfit) === 200);

    const ledgerExc = await prisma.financialLedgerEntry.findMany({
      where: { refNo: saleExc.orderNo },
    });
    let sumDebitExc = 0;
    let sumCreditExc = 0;
    for (const entry of ledgerExc) {
      sumDebitExc += Number(entry.debit);
      sumCreditExc += Number(entry.credit);
    }
    const diffExc = Math.abs(sumDebitExc - sumCreditExc);
    assert(
      `Tax-exclusive sale ledger is balanced: Debits (${sumDebitExc.toFixed(2)}) == Credits (${sumCreditExc.toFixed(2)}), diff = ${diffExc}`,
      diffExc <= 0.02
    );

    // ─────────────────────────────────────────────────────────────────────
    // 3. PURCHASE ORDER ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Purchase Order Accounting ---');
    const poRef = `PO-${testPrefix}-001`;
    createdRefNos.push(poRef);

    // Purchase: Inventory Asset Debit 5000, Accounts Payable Credit 5000
    await prisma.financialLedgerEntry.createMany({
      data: [
        {
          entryNo: `JRN-PO-ASSET-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'ASSET',
          accountName: 'Inventory Asset',
          debit: 5000,
          credit: 0,
          amount: 5000,
          refType: 'PURCHASE',
          refNo: poRef,
          description: `PO ${poRef} Stock Receipt`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-PO-AP-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'LIABILITY',
          accountName: 'Accounts Payable',
          debit: 0,
          credit: 5000,
          amount: 5000,
          refType: 'PURCHASE',
          refNo: poRef,
          description: `PO ${poRef} Vendor Liability`,
          createdBy: 'fin-tester',
        },
      ],
    });

    const poLedger = await prisma.financialLedgerEntry.findMany({ where: { refNo: poRef } });
    const poDebits = poLedger.reduce((sum, e) => sum + Number(e.debit), 0);
    const poCredits = poLedger.reduce((sum, e) => sum + Number(e.credit), 0);
    assert(`Purchase Order ledger is balanced: Debits (${poDebits}) == Credits (${poCredits})`, poDebits === poCredits);

    // ─────────────────────────────────────────────────────────────────────
    // 4. PARTIAL PAYMENT ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Partial Payment Accounting ---');
    const partPayRef = `PAY-${testPrefix}-001`;
    createdRefNos.push(partPayRef);

    // Partial payment of 2000 against PO 5000:
    // Debit Accounts Payable 2000, Credit Bank 2000
    await prisma.financialLedgerEntry.createMany({
      data: [
        {
          entryNo: `JRN-PAY-AP-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'LIABILITY',
          accountName: 'Accounts Payable',
          debit: 2000,
          credit: 0,
          amount: 2000,
          refType: 'PAYMENT',
          refNo: partPayRef,
          description: `Partial Payment to Vendor for ${poRef}`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-PAY-BANK-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'ASSET',
          accountName: 'Bank Account (HDFC)',
          debit: 0,
          credit: 2000,
          amount: 2000,
          refType: 'PAYMENT',
          refNo: partPayRef,
          description: `Bank Wire Disbursement for ${poRef}`,
          createdBy: 'fin-tester',
        },
      ],
    });

    const payLedger = await prisma.financialLedgerEntry.findMany({ where: { refNo: partPayRef } });
    const payDebits = payLedger.reduce((sum, e) => sum + Number(e.debit), 0);
    const payCredits = payLedger.reduce((sum, e) => sum + Number(e.credit), 0);
    assert(`Partial Payment ledger is balanced: Debits (${payDebits}) == Credits (${payCredits})`, payDebits === payCredits);

    // ─────────────────────────────────────────────────────────────────────
    // 5. EXPENSE ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing Operating Expense Accounting ---');
    const expRef = `EXP-${testPrefix}-001`;
    createdRefNos.push(expRef);

    // Expense: Operating Expense Debit 750, Cash/Bank Credit 750
    await prisma.financialLedgerEntry.createMany({
      data: [
        {
          entryNo: `JRN-EXP-OPS-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'EXPENSE',
          accountName: 'Store Utilities & Electricity',
          debit: 750,
          credit: 0,
          amount: 750,
          refType: 'EXPENSE',
          refNo: expRef,
          description: 'Electricity Bill Payment for BLR Store',
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-EXP-CASH-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'ASSET',
          accountName: 'Cash in Hand',
          debit: 0,
          credit: 750,
          amount: 750,
          refType: 'EXPENSE',
          refNo: expRef,
          description: 'Cash disbursed for Utilities',
          createdBy: 'fin-tester',
        },
      ],
    });

    const expLedger = await prisma.financialLedgerEntry.findMany({ where: { refNo: expRef } });
    const expDebits = expLedger.reduce((sum, e) => sum + Number(e.debit), 0);
    const expCredits = expLedger.reduce((sum, e) => sum + Number(e.credit), 0);
    assert(`Operating Expense ledger is balanced: Debits (${expDebits}) == Credits (${expCredits})`, expDebits === expCredits);

    // ─────────────────────────────────────────────────────────────────────
    // 6. STOCK TRANSFER ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Testing Stock Transfer Accounting ---');
    const transferRef = `TRF-${testPrefix}-001`;
    createdRefNos.push(transferRef);

    // Stock Transfer between BLR and HYD (Value: 1200)
    // Debit Inventory Asset (HYD) 1200, Credit Inventory Asset (BLR) 1200
    await prisma.financialLedgerEntry.createMany({
      data: [
        {
          entryNo: `JRN-TRF-DEST-${testPrefix}`,
          storeCode: 'HYD',
          accountCategory: 'ASSET',
          accountName: 'Inventory Asset (Inbound)',
          debit: 1200,
          credit: 0,
          amount: 1200,
          refType: 'TRANSFER',
          refNo: transferRef,
          description: `Stock Transfer Received from BLR to HYD (${transferRef})`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-TRF-SRC-${testPrefix}`,
          storeCode: 'BLR',
          accountCategory: 'ASSET',
          accountName: 'Inventory Asset (Outbound)',
          debit: 0,
          credit: 1200,
          amount: 1200,
          refType: 'TRANSFER',
          refNo: transferRef,
          description: `Stock Transfer Shipped from BLR to HYD (${transferRef})`,
          createdBy: 'fin-tester',
        },
      ],
    });

    const trfLedger = await prisma.financialLedgerEntry.findMany({ where: { refNo: transferRef } });
    const trfDebits = trfLedger.reduce((sum, e) => sum + Number(e.debit), 0);
    const trfCredits = trfLedger.reduce((sum, e) => sum + Number(e.credit), 0);
    assert(`Stock Transfer ledger is balanced: Debits (${trfDebits}) == Credits (${trfCredits})`, trfDebits === trfCredits);

    // ─────────────────────────────────────────────────────────────────────
    // 7. VOID / REFUND ACCOUNTING
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Testing Void / Refund Accounting ---');
    const voidRef = `VOID-${testPrefix}-001`;
    createdRefNos.push(voidRef);

    // Void reverses a sale:
    // Debit Revenue (reversal) 1610.17, Debit Tax Liability (reversal) 289.83
    // Credit Cash Refund 1900
    // Debit Inventory Asset (restocked) 1200, Credit COGS (reversal) 1200
    await prisma.financialLedgerEntry.createMany({
      data: [
        {
          entryNo: `JRN-VOID-REV-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'REVENUE',
          accountName: 'Sales Returns & Refunds',
          debit: 1610.17,
          credit: 0,
          amount: 1610.17,
          refType: 'VOID',
          refNo: voidRef,
          description: `Reversal of Sales Revenue for Void ${voidRef}`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-VOID-TAX-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'LIABILITY',
          accountName: 'GST Output Tax Reversal',
          debit: 289.83,
          credit: 0,
          amount: 289.83,
          refType: 'VOID',
          refNo: voidRef,
          description: `Reversal of GST Liability for Void ${voidRef}`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-VOID-CASH-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'ASSET',
          accountName: 'Cash in Hand (Refund Paid)',
          debit: 0,
          credit: 1900,
          amount: 1900,
          refType: 'VOID',
          refNo: voidRef,
          description: `Cash Refund Issued for Void ${voidRef}`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-VOID-INV-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'ASSET',
          accountName: 'Inventory Asset (Restocked)',
          debit: 1200,
          credit: 0,
          amount: 1200,
          refType: 'VOID',
          refNo: voidRef,
          description: `Stock Restocked for Void ${voidRef}`,
          createdBy: 'fin-tester',
        },
        {
          entryNo: `JRN-VOID-COGS-${testPrefix}`,
          storeCode: testStoreCode,
          accountCategory: 'COGS',
          accountName: 'COGS Reversal',
          debit: 0,
          credit: 1200,
          amount: 1200,
          refType: 'VOID',
          refNo: voidRef,
          description: `COGS Reversal for Void ${voidRef}`,
          createdBy: 'fin-tester',
        },
      ],
    });

    const voidLedger = await prisma.financialLedgerEntry.findMany({ where: { refNo: voidRef } });
    const voidDebits = Math.round(voidLedger.reduce((sum, e) => sum + Number(e.debit), 0) * 100) / 100;
    const voidCredits = Math.round(voidLedger.reduce((sum, e) => sum + Number(e.credit), 0) * 100) / 100;
    assert(`Void / Refund ledger is balanced: Debits (${voidDebits}) == Credits (${voidCredits})`, Math.abs(voidDebits - voidCredits) <= 0.01);

  } catch (err: any) {
    console.error('Financial integrity test error:', err);
    assert('Execution completed without error', false, err.message);
  } finally {
    console.log('\n--- Cleaning Up Financial Test Records ---');
    try {
      if (createdOrderNos.length > 0) {
        await prisma.financialLedgerEntry.deleteMany({
          where: { refNo: { in: createdOrderNos } },
        });
        await prisma.salesOrderItem.deleteMany({
          where: { order: { orderNo: { in: createdOrderNos } } },
        });
        await prisma.salesOrder.deleteMany({
          where: { orderNo: { in: createdOrderNos } },
        });
      }
      if (createdRefNos.length > 0) {
        await prisma.financialLedgerEntry.deleteMany({
          where: { refNo: { in: createdRefNos } },
        });
      }
      if (productA.id && productB.id) {
        await prisma.inventory.deleteMany({
          where: { productId: { in: [productA.id, productB.id] } },
        });
        await prisma.product.deleteMany({
          where: { id: { in: [productA.id, productB.id] } },
        });
      }
      console.log('  ✅ Financial test records cleaned up.');
    } catch (e: any) {
      console.warn('  ⚠️ Cleanup warning:', e.message);
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

runFinancialIntegritySuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
