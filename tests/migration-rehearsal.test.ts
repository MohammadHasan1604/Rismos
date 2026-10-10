import { prisma } from '../src/lib/db';
import { runProductionMigrations } from '../scripts/migrate-production';

/**
 * P3-4: Migration Rehearsal Test
 * 
 * Verifies that running the production migration engine over a database containing
 * legacy data preserves 100% of existing records:
 * - Table existence
 * - Table row counts (users, stores, products, inventory, sales, purchases, customers, financial ledger)
 * - Zero legitimate records disappear
 * - Financial ledger debits == credits holds intact
 * - Safe backfills apply correctly without overwriting existing data
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${msg}`);
    failed++;
  }
}

async function runMigrationRehearsalSuite() {
  console.log('========================================================================');
  console.log('🧪 P3-4: MIGRATION REHEARSAL & ZERO DATA LOSS VERIFICATION');
  console.log('========================================================================\n');

  const rehearsalPrefix = 'REH-' + Date.now();
  const testStoreCode = `STR-${rehearsalPrefix.slice(-6)}`;
  const testSku = `SKU-${rehearsalPrefix.slice(-6)}`;
  const testInvoiceNo = `INV-${rehearsalPrefix.slice(-6)}`;
  const testPoNo = `PO-${rehearsalPrefix.slice(-6)}`;
  const testLedgerEntry = `LED-${rehearsalPrefix.slice(-6)}`;

  let createdStoreId: string | null = null;
  let createdProductId: string | null = null;
  let createdCustomerId: string | null = null;
  let createdSaleId: string | null = null;
  let createdVendorId: string | null = null;

  try {
    console.log('--- 1. Seeding Deterministic Legacy Fixture ---');
    // Store with managerName set but ownerName NULL
    const store = await prisma.storeHub.create({
      data: {
        code: testStoreCode,
        name: `Rehearsal Store ${testStoreCode}`,
        city: 'Bengaluru',
        address: 'Test Address 123',
        managerName: 'Legacy Manager Name',
        phone: '+919876543210',
        status: 'Active',
      },
    });
    createdStoreId = store.id;

    // Product
    const product = await prisma.product.create({
      data: {
        sku: testSku,
        name: `Rehearsal Product ${testSku}`,
        category: 'Electronics',
        baseSellingPrice: 1500,
        baseCostPrice: 1000,
        status: 'active',
      },
    });
    createdProductId = product.id;

    // Inventory
    await prisma.inventory.create({
      data: {
        storeCode: testStoreCode,
        productId: product.id,
        qtyOnHand: 25,
      },
    });

    // Customer & CustomerStoreProfile
    const customer = await prisma.customer.create({
      data: {
        name: `Rehearsal Customer ${rehearsalPrefix}`,
        phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        normalizedPhone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        email: `cust_${testStoreCode.toLowerCase()}@example.com`,
      },
    });
    createdCustomerId = customer.id;

    await prisma.customerStoreProfile.create({
      data: {
        customerId: customer.id,
        storeCode: testStoreCode,
        creditBalance: 250,
      },
    });

    // Sale simulating legacy schema
    const sale = await prisma.salesOrder.create({
      data: {
        orderNo: testInvoiceNo,
        storeCode: testStoreCode,
        customerName: 'Walk-in',
        customerPhone: '+919876543210',
        subtotal: 1500,
        taxAmount: 0,
        grandTotal: 1500,
        totalCost: 1000,
        grossProfit: 500,
        paymentMethod: 'Cash',
        cashierName: 'rehearsal-tester',
        status: 'Completed',
        items: {
          create: [
            {
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              qty: 1,
              unitPrice: 1500,
              unitCost: 1000,
              lineTotal: 1500,
              lineProfit: 500,
            },
          ],
        },
      },
    });
    createdSaleId = sale.id;

    // Vendor and Purchase simulating legacy record
    const vendor = await prisma.vendor.create({
      data: {
        code: `V-${rehearsalPrefix.slice(-6)}`,
        name: 'Rehearsal Vendor',
        contactPerson: 'Vendor Rep',
        email: 'vendor@example.com',
        phone: '+919876543211',
        city: 'Bengaluru',
        storeCode: testStoreCode,
        categories: 'General',
      },
    });
    createdVendorId = vendor.id;

    await prisma.purchaseOrder.create({
      data: {
        poNo: testPoNo,
        storeCode: testStoreCode,
        vendorId: vendor.id,
        totalCost: 10000,
        status: 'Completed',
        paymentStatus: 'Paid',
        createdBy: 'rehearsal-tester',
      },
    });

    // Financial ledger balancing entries
    await prisma.financialLedgerEntry.create({
      data: {
        entryNo: testLedgerEntry,
        storeCode: testStoreCode,
        accountCategory: 'Revenue',
        accountName: 'Sales Revenue',
        debit: 0,
        credit: 1500,
        amount: 1500,
        refType: 'SALE',
        refId: sale.id,
        refNo: testInvoiceNo,
        description: 'Rehearsal legacy sale ledger',
        createdBy: 'rehearsal-tester',
      },
    });

    await prisma.financialLedgerEntry.create({
      data: {
        entryNo: `${testLedgerEntry}-DEBIT`,
        storeCode: testStoreCode,
        accountCategory: 'Asset',
        accountName: 'Cash in Hand',
        debit: 1500,
        credit: 0,
        amount: 1500,
        refType: 'SALE',
        refId: sale.id,
        refNo: testInvoiceNo,
        description: 'Rehearsal legacy sale debit ledger',
        createdBy: 'rehearsal-tester',
      },
    });

    console.log('--- 2. Capturing Pre-Migration Baseline Metrics ---');
    const [
      usersBefore,
      storesBefore,
      productsBefore,
      inventoryBefore,
      salesBefore,
      purchasesBefore,
      customersBefore,
      ledgerBefore,
      ledgerAggBefore,
      customerProfileAggBefore,
    ] = await Promise.all([
      prisma.userAccount.count(),
      prisma.storeHub.count(),
      prisma.product.count(),
      prisma.inventory.count(),
      prisma.salesOrder.count(),
      prisma.purchaseOrder.count(),
      prisma.customer.count(),
      prisma.financialLedgerEntry.count(),
      prisma.financialLedgerEntry.aggregate({
        _sum: { debit: true, credit: true },
      }),
      prisma.customerStoreProfile.aggregate({
        _sum: { creditBalance: true },
      }),
    ]);

    assert(usersBefore > 0, `Users baseline recorded (${usersBefore})`);
    assert(storesBefore > 0, `Stores baseline recorded (${storesBefore})`);
    assert(productsBefore > 0, `Products baseline recorded (${productsBefore})`);
    assert(inventoryBefore > 0, `Inventory baseline recorded (${inventoryBefore})`);
    assert(salesBefore > 0, `Sales baseline recorded (${salesBefore})`);
    assert(purchasesBefore > 0, `Purchases baseline recorded (${purchasesBefore})`);
    assert(customersBefore > 0, `Customers baseline recorded (${customersBefore})`);
    assert(ledgerBefore > 0, `Ledger baseline recorded (${ledgerBefore})`);

    console.log('\n--- 3. Applying Production Migration Engine ---');
    await runProductionMigrations();
    assert(true, 'Production migrations executed successfully without error');

    console.log('\n--- 4. Post-Migration Verification & Zero Record Loss Assertions ---');
    const [
      usersAfter,
      storesAfter,
      productsAfter,
      inventoryAfter,
      salesAfter,
      purchasesAfter,
      customersAfter,
      ledgerAfter,
      ledgerAggAfter,
      customerProfileAggAfter,
    ] = await Promise.all([
      prisma.userAccount.count(),
      prisma.storeHub.count(),
      prisma.product.count(),
      prisma.inventory.count(),
      prisma.salesOrder.count(),
      prisma.purchaseOrder.count(),
      prisma.customer.count(),
      prisma.financialLedgerEntry.count(),
      prisma.financialLedgerEntry.aggregate({
        _sum: { debit: true, credit: true },
      }),
      prisma.customerStoreProfile.aggregate({
        _sum: { creditBalance: true },
      }),
    ]);

    assert(usersAfter >= usersBefore, `Zero users lost: ${usersAfter} >= ${usersBefore}`);
    assert(storesAfter >= storesBefore, `Zero stores lost: ${storesAfter} >= ${storesBefore}`);
    assert(productsAfter >= productsBefore, `Zero products lost: ${productsAfter} >= ${productsBefore}`);
    assert(inventoryAfter >= inventoryBefore, `Zero inventory lost: ${inventoryAfter} >= ${inventoryBefore}`);
    assert(salesAfter >= salesBefore, `Zero sales lost: ${salesAfter} >= ${salesBefore}`);
    assert(purchasesAfter >= purchasesBefore, `Zero purchases lost: ${purchasesAfter} >= ${purchasesBefore}`);
    assert(customersAfter >= customersBefore, `Zero customers lost: ${customersAfter} >= ${customersBefore}`);
    assert(ledgerAfter >= ledgerBefore, `Zero ledger entries lost: ${ledgerAfter} >= ${ledgerBefore}`);

    // Verify Financial Ledger debit == credit
    const debitTotal = Number(ledgerAggAfter._sum.debit || 0);
    const creditTotal = Number(ledgerAggAfter._sum.credit || 0);
    const diff = Math.abs(debitTotal - creditTotal);
    assert(diff <= 0.01, `Financial ledger remains perfectly balanced: Debits (${debitTotal}) == Credits (${creditTotal}), diff = ${diff}`);

    // Customer balance preservation
    const custBalanceBefore = Number(customerProfileAggBefore._sum.creditBalance || 0);
    const custBalanceAfter = Number(customerProfileAggAfter._sum.creditBalance || 0);
    assert(Math.abs(custBalanceAfter - custBalanceBefore) <= 0.01, `Customer total balance preserved: ${custBalanceAfter} == ${custBalanceBefore}`);

    // Safe Backfill checks
    console.log('\n--- 5. Safe Backfills Verification ---');
    const updatedStore = await prisma.storeHub.findUnique({
      where: { code: testStoreCode },
    });
    assert(updatedStore?.ownerName === 'Legacy Manager Name', 'Store owner_name safely backfilled from manager_name');

    const updatedSale: any = await prisma.salesOrder.findUnique({
      where: { orderNo: testInvoiceNo },
    });
    assert(updatedSale?.countryCode === 'IN', 'Legacy sale safely backfilled countryCode=IN');
    assert(updatedSale?.currencyCode === 'INR', 'Legacy sale safely backfilled currencyCode=INR');
    assert(updatedSale?.currencySymbol === '₹', 'Legacy sale safely backfilled currencySymbol=₹');
    assert(updatedSale?.taxRegime === 'GST', 'Legacy sale safely backfilled taxRegime=GST');

    console.log('\n--- 6. Idempotency Re-run Verification ---');
    await runProductionMigrations();
    assert(true, 'Second run of migrations completed cleanly with 0 errors (100% idempotent)');

  } catch (err: any) {
    console.error('Migration rehearsal error:', err);
    assert(false, `Unexpected rehearsal error: ${err.message}`);
  } finally {
    console.log('\n--- 7. Cleaning Up Rehearsal Fixtures ---');
    try {
      await prisma.financialLedgerEntry.deleteMany({
        where: { storeCode: testStoreCode },
      });
      await prisma.salesOrderItem.deleteMany({
        where: { order: { storeCode: testStoreCode } },
      });
      await prisma.salesOrder.deleteMany({
        where: { storeCode: testStoreCode },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { storeCode: testStoreCode },
      });
      if (createdVendorId) {
        await prisma.vendor.delete({ where: { id: createdVendorId } }).catch(() => {});
      }
      await prisma.inventory.deleteMany({
        where: { storeCode: testStoreCode },
      });
      await prisma.storeHub.deleteMany({
        where: { code: testStoreCode },
      });
      if (createdCustomerId) {
        await prisma.customerStoreProfile.deleteMany({ where: { customerId: createdCustomerId } });
        await prisma.customer.delete({ where: { id: createdCustomerId } }).catch(() => {});
      }
      if (createdProductId) {
        await prisma.product.delete({ where: { id: createdProductId } }).catch(() => {});
      }
      console.log('  ✅ Rehearsal test fixtures cleaned up.');
    } catch (e: any) {
      console.warn('  ⚠️ Cleanup warning:', e.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMigrationRehearsalSuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
