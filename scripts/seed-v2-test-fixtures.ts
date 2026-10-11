/**
 * RISMOS Database V2 — Isolated Test Fixtures Seed Script
 * 
 * Safety Rule:
 * Use ONLY for isolated test environments, integration tests, or local rehearsal.
 * Seeds a coherent relational graph adhering to all Database V2 constraints:
 * - Restrictive historical transactions
 * - Double-entry ledger balancing (sum(debit) === sum(credit))
 * - Valid store references and active payment methods
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { seedV2Safe } from './seed-v2-safe';

const prisma = new PrismaClient();

export async function seedV2TestFixtures(customPrisma?: PrismaClient) {
  const db = customPrisma || prisma;
  console.log('🧪 [V2 TEST FIXTURES] Initializing coherent relational test data...');

  // Ensure base master data exists first
  await seedV2Safe(db);

  // 1. SAMPLE BRAND
  const brand = await db.brand.upsert({
    where: { code: 'LOGITECH' },
    update: {},
    create: {
      name: 'Logitech',
      code: 'LOGITECH',
      description: 'Computer peripherals and accessories',
      status: 'Active',
    },
  });

  // 2. SAMPLE CATEGORY
  const category = await db.category.upsert({
    where: { slug: 'computer-peripherals' },
    update: {},
    create: {
      name: 'Computer Peripherals',
      slug: 'computer-peripherals',
      categoryType: 'Product',
      status: 'Active',
      sortOrder: 1,
    },
  });

  // 3. SAMPLE PRODUCTS
  const productA = await db.product.upsert({
    where: { sku: 'LOGI-MXM3S' },
    update: {},
    create: {
      sku: 'LOGI-MXM3S',
      barcode: '097855174468',
      name: 'Logitech MX Master 3S Wireless Mouse',
      brand: brand.name,
      category: category.name,
      baseCostPrice: new Prisma.Decimal('7500.00'),
      baseSellingPrice: new Prisma.Decimal('9995.00'),
      mrp: new Prisma.Decimal('10995.00'),
      gstRate: new Prisma.Decimal('18.00'),
      warrantyMonths: 12,
      status: 'active',
    },
  });

  const productB = await db.product.upsert({
    where: { sku: 'LOGI-MXKEYS' },
    update: {},
    create: {
      sku: 'LOGI-MXKEYS',
      barcode: '097855174475',
      name: 'Logitech MX Keys Mini Keyboard',
      brand: brand.name,
      category: category.name,
      baseCostPrice: new Prisma.Decimal('6000.00'),
      baseSellingPrice: new Prisma.Decimal('8495.00'),
      mrp: new Prisma.Decimal('9495.00'),
      gstRate: new Prisma.Decimal('18.00'),
      warrantyMonths: 12,
      status: 'active',
    },
  });

  // 4. INVENTORY IN CENTRAL & BLR
  await db.inventory.upsert({
    where: { productId_storeCode: { productId: productA.id, storeCode: 'BLR' } },
    update: { qtyOnHand: 25 },
    create: {
      productId: productA.id,
      storeCode: 'BLR',
      qtyOnHand: 25,
      reorderPt: 5,
      maxStock: 50,
      shelfLoc: 'A-01-02',
    },
  });

  await db.inventory.upsert({
    where: { productId_storeCode: { productId: productB.id, storeCode: 'BLR' } },
    update: { qtyOnHand: 15 },
    create: {
      productId: productB.id,
      storeCode: 'BLR',
      qtyOnHand: 15,
      reorderPt: 3,
      maxStock: 30,
      shelfLoc: 'A-01-03',
    },
  });

  // 5. SAMPLE VENDOR
  const vendor = await db.vendor.upsert({
    where: { code: 'VEND-TECHDIST' },
    update: {},
    create: {
      code: 'VEND-TECHDIST',
      name: 'TechDist India Pvt Ltd',
      contactPerson: 'Rajesh Sharma',
      email: 'sales@techdist.in',
      phone: '+919876543210',
      city: 'Bengaluru',
      address: 'Outer Ring Road, Marathahalli',
      categories: 'Electronics, Peripherals',
      gstin: '29ABCDE1234F1Z5',
      paymentTerms: 'Net 30',
      storeCode: 'BLR',
      status: 'Active',
    },
  });

  // 6. SAMPLE CUSTOMER & STORE PROFILE
  const customer = await db.customer.upsert({
    where: { id: 'cust-fixture-001' },
    update: {},
    create: {
      id: 'cust-fixture-001',
      name: 'Priya Narayanan',
      phone: '+919123456789',
      normalizedPhone: '+919123456789',
      email: 'priya.n@example.com',
      city: 'Bengaluru',
      status: 'Active',
    },
  });

  await db.customerStoreProfile.upsert({
    where: { customerId_storeCode: { customerId: customer.id, storeCode: 'BLR' } },
    update: { totalOrders: 1, totalSpent: new Prisma.Decimal('9995.00') },
    create: {
      customerId: customer.id,
      storeCode: 'BLR',
      creditBalance: new Prisma.Decimal('0.00'),
      totalSpent: new Prisma.Decimal('9995.00'),
      totalOrders: 1,
    },
  });

  // 7. SAMPLE SALES ORDER WITH FIXED FINANCIAL PRECISION
  const orderNo = 'SO-BLR-FIX-1001';
  const existingOrder = await db.salesOrder.findUnique({ where: { orderNo } });
  if (!existingOrder) {
    const saleOrder = await db.salesOrder.create({
      data: {
        orderNo,
        storeCode: 'BLR',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        subtotal: new Prisma.Decimal('8470.34'),
        taxAmount: new Prisma.Decimal('1524.66'),
        discountAmount: new Prisma.Decimal('0.00'),
        grandTotal: new Prisma.Decimal('9995.00'),
        totalCost: new Prisma.Decimal('7500.00'),
        grossProfit: new Prisma.Decimal('970.34'),
        paymentMethod: 'UPI',
        status: 'Completed',
        cashierName: 'BLR Store Cashier',
        countryCode: 'IN',
        currencyCode: 'INR',
        currencySymbol: '₹',
        taxRegime: 'GST',
        taxInclusive: true,
        taxConfigVersion: 1,
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              sku: productA.sku,
              qty: 1,
              unitPrice: new Prisma.Decimal('9995.00'),
              unitCost: new Prisma.Decimal('7500.0000'),
              discountPercent: new Prisma.Decimal('0.00'),
              lineTotal: new Prisma.Decimal('9995.00'),
              lineProfit: new Prisma.Decimal('970.34'),
              taxRate: new Prisma.Decimal('18.00'),
              taxAmount: new Prisma.Decimal('1524.66'),
              hsnSac: '84716060',
            },
          ],
        },
      },
    });

    // 8. DOUBLE-ENTRY FINANCIAL LEDGER ENTRY (Balanced)
    await db.financialLedgerEntry.create({
      data: {
        entryNo: `LEDG-SL-1001-A`,
        storeCode: 'BLR',
        accountCategory: 'ASSETS',
        accountName: 'Bank / UPI Clearing',
        debit: new Prisma.Decimal('9995.00'),
        credit: new Prisma.Decimal('0.00'),
        amount: new Prisma.Decimal('9995.00'),
        refType: 'SALE',
        refId: saleOrder.id,
        refNo: orderNo,
        entityName: customer.name,
        description: `Cash/UPI receipt for sale ${orderNo}`,
        createdBy: 'system',
      },
    });

    await db.financialLedgerEntry.create({
      data: {
        entryNo: `LEDG-SL-1001-B`,
        storeCode: 'BLR',
        accountCategory: 'REVENUE',
        accountName: 'Sales Revenue',
        debit: new Prisma.Decimal('0.00'),
        credit: new Prisma.Decimal('8470.34'),
        amount: new Prisma.Decimal('8470.34'),
        refType: 'SALE',
        refId: saleOrder.id,
        refNo: orderNo,
        entityName: customer.name,
        description: `Revenue recognition for sale ${orderNo}`,
        createdBy: 'system',
      },
    });

    await db.financialLedgerEntry.create({
      data: {
        entryNo: `LEDG-SL-1001-C`,
        storeCode: 'BLR',
        accountCategory: 'LIABILITIES',
        accountName: 'GST Payable',
        debit: new Prisma.Decimal('0.00'),
        credit: new Prisma.Decimal('1524.66'),
        amount: new Prisma.Decimal('1524.66'),
        refType: 'SALE',
        refId: saleOrder.id,
        refNo: orderNo,
        entityName: customer.name,
        description: `Output GST on sale ${orderNo}`,
        createdBy: 'system',
      },
    });
  }

  console.log('✅ [V2 TEST FIXTURES] Seeded successfully with balanced ledger and strict foreign keys.');
}

if (require.main === module) {
  seedV2TestFixtures()
    .catch((err) => {
      console.error('❌ Test fixtures seed failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
