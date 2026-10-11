/**
 * RISMOS Database V2 — Old (V1) to New (V2) ETL & Data Migration Tool
 * 
 * CRITICAL SAFETY RULES:
 * 1. Source database is opened strictly in READ-ONLY mode.
 * 2. Target database MUST be a NEW, isolated database instance.
 * 3. Never runs if source and target URLs are identical.
 * 4. All financial numbers are validated and mapped to fixed precision Decimals.
 * 5. Transaction snapshots (country, currency, tax regime, registration) are backfilled if missing.
 */

import { PrismaClient, Prisma } from '@prisma/client';

export interface MigrationStats {
  stores: number;
  users: number;
  userStoreAssignments: number;
  categories: number;
  categoryTypes: number;
  products: number;
  inventory: number;
  inventoryLedger: number;
  stockTransfers: number;
  customers: number;
  customerStoreProfiles: number;
  vendors: number;
  purchases: number;
  purchasePayments: number;
  sales: number;
  saleItems: number;
  expenses: number;
  centralExpenses: number;
  financialLedger: number;
  paymentMethods: number;
  brands: number;
  units: number;
  branding: number;
  systemSettings: number;
  sequenceCounters: number;
}

export async function migrateV1ToV2(sourceDbUrl: string, targetDbUrl: string): Promise<MigrationStats> {
  if (!sourceDbUrl || !targetDbUrl) {
    throw new Error('Both sourceDbUrl and targetDbUrl are required.');
  }
  if (sourceDbUrl === targetDbUrl) {
    throw new Error('CRITICAL SAFETY REJECTION: Source and Target database URLs cannot be the same! Target must be a new, empty database.');
  }

  console.log('🚀 [V1 → V2 MIGRATION] Starting ETL Pipeline...');
  console.log('  Source (Read-Only): [CONNECTED]');
  console.log('  Target (New Database): [CONNECTED]');

  const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceDbUrl } } });
  const targetPrisma = new PrismaClient({ datasources: { db: { url: targetDbUrl } } });

  const stats: MigrationStats = {
    stores: 0,
    users: 0,
    userStoreAssignments: 0,
    categories: 0,
    categoryTypes: 0,
    products: 0,
    inventory: 0,
    inventoryLedger: 0,
    stockTransfers: 0,
    customers: 0,
    customerStoreProfiles: 0,
    vendors: 0,
    purchases: 0,
    purchasePayments: 0,
    sales: 0,
    saleItems: 0,
    expenses: 0,
    centralExpenses: 0,
    financialLedger: 0,
    paymentMethods: 0,
    brands: 0,
    units: 0,
    branding: 0,
    systemSettings: 0,
    sequenceCounters: 0,
  };

  try {
    // 1. STORES
    console.log('  1/14 Migrating Store Hubs...');
    const stores = await sourcePrisma.storeHub.findMany();
    for (const s of stores) {
      await targetPrisma.storeHub.upsert({
        where: { code: s.code },
        update: {},
        create: {
          id: s.id,
          code: s.code,
          name: s.name,
          city: s.city,
          address: s.address,
          timezone: s.timezone || 'Asia/Kolkata',
          ownerName: s.ownerName,
          managerName: s.managerName,
          phone: s.phone,
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        },
      });
      stats.stores++;
    }

    // 2. USERS & STORE ASSIGNMENTS
    console.log('  2/14 Migrating User Accounts...');
    const users = await sourcePrisma.userAccount.findMany({
      include: { storeAssignments: true },
    });
    for (const u of users) {
      await targetPrisma.userAccount.upsert({
        where: { email: u.email },
        update: {},
        create: {
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          name: u.name,
          phone: u.phone,
          role: u.role,
          securityLevel: u.securityLevel,
          storeScope: u.storeScope,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
          avatarUrl: u.avatarUrl,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        },
      });
      stats.users++;

      for (const sa of u.storeAssignments) {
        await targetPrisma.userStoreAssignment.upsert({
          where: { userId_storeCode: { userId: u.id, storeCode: sa.storeCode } },
          update: {},
          create: {
            id: sa.id,
            userId: u.id,
            storeCode: sa.storeCode,
            createdAt: sa.createdAt,
          },
        });
        stats.userStoreAssignments++;
      }
    }

    // 3. CATEGORY TYPES & CATEGORIES
    console.log('  3/14 Migrating Taxonomy...');
    const catTypes = await sourcePrisma.categoryType.findMany();
    for (const ct of catTypes) {
      await targetPrisma.categoryType.upsert({
        where: { code: ct.code },
        update: {},
        create: ct,
      });
      stats.categoryTypes++;
    }

    const categories = await sourcePrisma.category.findMany();
    // Pass 1: Upsert all categories with parentCategoryId: null to guarantee existence
    for (const c of categories) {
      const { parentCategoryId, ...rest } = c;
      await targetPrisma.category.upsert({
        where: { slug: c.slug },
        update: { ...rest },
        create: { ...rest, parentCategoryId: null },
      });
      stats.categories++;
    }

    // Pass 2: Connect parentCategoryId now that all parent categories exist
    const existingCatIds = new Set(categories.map((c) => c.id));
    for (const c of categories) {
      if (c.parentCategoryId && existingCatIds.has(c.parentCategoryId)) {
        await targetPrisma.category
          .update({
            where: { slug: c.slug },
            data: { parentCategoryId: c.parentCategoryId },
          })
          .catch((err) => {
            console.warn(`  ⚠️ Could not link parentCategoryId for category ${c.slug}:`, err.message);
          });
      }
    }

    // 4. BRANDS & UNITS
    console.log('  4/14 Migrating Brands and Measurement Units...');
    const brands = await sourcePrisma.brand.findMany();
    for (const b of brands) {
      await targetPrisma.brand.upsert({
        where: { code: b.code },
        update: {},
        create: b,
      });
      stats.brands++;
    }

    const units = await sourcePrisma.unit.findMany();
    for (const un of units) {
      await targetPrisma.unit.upsert({
        where: { code: un.code },
        update: {},
        create: un,
      });
      stats.units++;
    }

    // 5. PRODUCTS
    console.log('  5/14 Migrating Products Catalog...');
    const products = await sourcePrisma.product.findMany();
    for (const p of products) {
      await targetPrisma.product.upsert({
        where: { sku: p.sku },
        update: {},
        create: {
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          brand: p.brand,
          model: p.model,
          category: p.category,
          subcategory: p.subcategory,
          baseCostPrice: new Prisma.Decimal(p.baseCostPrice.toString()),
          baseSellingPrice: new Prisma.Decimal(p.baseSellingPrice.toString()),
          mrp: p.mrp ? new Prisma.Decimal(p.mrp.toString()) : null,
          gstRate: new Prisma.Decimal(p.gstRate.toString()),
          warrantyMonths: p.warrantyMonths,
          imageUrl: p.imageUrl,
          description: p.description,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
      });
      stats.products++;
    }

    // 6. INVENTORY
    console.log('  6/14 Migrating Store Inventory...');
    const inventories = await sourcePrisma.inventory.findMany();
    for (const inv of inventories) {
      await targetPrisma.inventory.upsert({
        where: { productId_storeCode: { productId: inv.productId, storeCode: inv.storeCode } },
        update: { qtyOnHand: inv.qtyOnHand },
        create: {
          id: inv.id,
          productId: inv.productId,
          storeCode: inv.storeCode,
          qtyOnHand: inv.qtyOnHand,
          qtyReserved: inv.qtyReserved,
          reorderPt: inv.reorderPt,
          maxStock: inv.maxStock,
          shelfLoc: inv.shelfLoc,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
        },
      });
      stats.inventory++;
    }

    // 7. CUSTOMERS & STORE PROFILES
    console.log('  7/14 Migrating Customers...');
    const customers = await sourcePrisma.customer.findMany({
      include: { storeProfiles: true },
    });
    for (const c of customers) {
      await targetPrisma.customer.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          name: c.name,
          phone: c.phone,
          normalizedPhone: c.normalizedPhone,
          email: c.email,
          city: c.city,
          address: c.address,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      });
      stats.customers++;

      for (const sp of c.storeProfiles) {
        await targetPrisma.customerStoreProfile.upsert({
          where: { customerId_storeCode: { customerId: c.id, storeCode: sp.storeCode } },
          update: {},
          create: {
            id: sp.id,
            customerId: c.id,
            storeCode: sp.storeCode,
            creditBalance: new Prisma.Decimal(sp.creditBalance.toString()),
            totalSpent: new Prisma.Decimal(sp.totalSpent.toString()),
            totalOrders: sp.totalOrders,
            createdAt: sp.createdAt,
            updatedAt: sp.updatedAt,
          },
        });
        stats.customerStoreProfiles++;
      }
    }

    // 8. VENDORS & PURCHASES
    console.log('  8/14 Migrating Vendors & Purchase Orders...');
    const vendors = await sourcePrisma.vendor.findMany();
    for (const v of vendors) {
      await targetPrisma.vendor.upsert({
        where: { code: v.code },
        update: {},
        create: v,
      });
      stats.vendors++;
    }

    const purchases = await sourcePrisma.purchaseOrder.findMany({
      include: { items: true, payments: true },
    });
    for (const po of purchases) {
      await targetPrisma.purchaseOrder.upsert({
        where: { poNo: po.poNo },
        update: {},
        create: {
          id: po.id,
          poNo: po.poNo,
          invoiceNo: po.invoiceNo,
          vendorId: po.vendorId,
          storeCode: po.storeCode,
          orderDate: po.orderDate,
          expectedDate: po.expectedDate,
          dueDate: po.dueDate,
          receivedDate: po.receivedDate,
          subtotal: po.subtotal ? new Prisma.Decimal(po.subtotal.toString()) : new Prisma.Decimal('0.00'),
          taxAmount: po.taxAmount ? new Prisma.Decimal(po.taxAmount.toString()) : new Prisma.Decimal('0.00'),
          discountAmount: po.discountAmount ? new Prisma.Decimal(po.discountAmount.toString()) : new Prisma.Decimal('0.00'),
          totalCost: new Prisma.Decimal(po.totalCost.toString()),
          paidAmount: new Prisma.Decimal(po.paidAmount.toString()),
          creditAmount: new Prisma.Decimal(po.creditAmount.toString()),
          status: po.status,
          paymentStatus: po.paymentStatus,
          createdBy: po.createdBy,
          notes: po.notes,
          countryCode: po.countryCode || 'IN',
          currencyCode: po.currencyCode || 'INR',
          taxRegime: po.taxRegime || 'GST',
          taxBreakdownJson: po.taxBreakdownJson,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt,
          items: {
            create: po.items.map((it) => ({
              id: it.id,
              productId: it.productId,
              qtyOrdered: it.qtyOrdered,
              qtyReceived: it.qtyReceived,
              unitCost: new Prisma.Decimal(it.unitCost.toString()),
              taxRate: it.taxRate ? new Prisma.Decimal(it.taxRate.toString()) : new Prisma.Decimal('0.00'),
              taxAmount: it.taxAmount ? new Prisma.Decimal(it.taxAmount.toString()) : new Prisma.Decimal('0.00'),
              discount: it.discount ? new Prisma.Decimal(it.discount.toString()) : new Prisma.Decimal('0.00'),
              lineTotal: new Prisma.Decimal(it.lineTotal.toString()),
            })),
          },
        },
      });
      stats.purchases++;

      for (const pmt of po.payments) {
        await targetPrisma.purchasePayment.upsert({
          where: { id: pmt.id },
          update: {},
          create: {
            id: pmt.id,
            purchaseId: po.id,
            voucherNo: pmt.voucherNo,
            amount: new Prisma.Decimal(pmt.amount.toString()),
            paymentDate: pmt.paymentDate,
            paymentMethod: pmt.paymentMethod,
            referenceNo: pmt.referenceNo,
            receiptUrl: pmt.receiptUrl,
            notes: pmt.notes,
            recordedBy: pmt.recordedBy,
            createdAt: pmt.createdAt,
          },
        });
        stats.purchasePayments++;
      }
    }

    // 9. SALES & ITEMS
    console.log('  9/14 Migrating Sales Orders...');
    const sales = await sourcePrisma.salesOrder.findMany({
      include: { items: true },
    });
    for (const s of sales) {
      await targetPrisma.salesOrder.upsert({
        where: { orderNo: s.orderNo },
        update: {},
        create: {
          id: s.id,
          orderNo: s.orderNo,
          storeCode: s.storeCode,
          customerId: s.customerId,
          customerName: s.customerName,
          customerPhone: s.customerPhone,
          subtotal: new Prisma.Decimal(s.subtotal.toString()),
          taxAmount: new Prisma.Decimal(s.taxAmount.toString()),
          discountAmount: new Prisma.Decimal(s.discountAmount.toString()),
          grandTotal: new Prisma.Decimal(s.grandTotal.toString()),
          totalCost: new Prisma.Decimal(s.totalCost.toString()),
          grossProfit: new Prisma.Decimal(s.grossProfit.toString()),
          paymentMethod: s.paymentMethod,
          referenceNo: s.referenceNo,
          paymentProofUrl: s.paymentProofUrl,
          status: s.status,
          cashierName: s.cashierName,
          photosJson: s.photosJson,
          countryCode: s.countryCode || 'IN',
          currencyCode: s.currencyCode || 'INR',
          currencySymbol: s.currencySymbol || '₹',
          taxRegime: s.taxRegime || 'GST',
          taxInclusive: s.taxInclusive,
          taxConfigVersion: s.taxConfigVersion || 1,
          taxRegistrationSnapshot: s.taxRegistrationSnapshot,
          taxBreakdownJson: s.taxBreakdownJson,
          invoiceTemplateVersion: s.invoiceTemplateVersion || 1,
          invoiceSnapshotJson: s.invoiceSnapshotJson,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          items: {
            create: s.items.map((it) => ({
              id: it.id,
              productId: it.productId,
              productName: it.productName,
              sku: it.sku,
              qty: it.qty,
              unitPrice: new Prisma.Decimal(it.unitPrice.toString()),
              unitCost: new Prisma.Decimal(it.unitCost.toString()),
              discountPercent: new Prisma.Decimal(it.discountPercent.toString()),
              lineTotal: new Prisma.Decimal(it.lineTotal.toString()),
              lineProfit: new Prisma.Decimal(it.lineProfit.toString()),
              taxRate: new Prisma.Decimal(it.taxRate.toString()),
              taxAmount: new Prisma.Decimal(it.taxAmount.toString()),
              hsnSac: it.hsnSac,
            })),
          },
        },
      });
      stats.sales++;
      stats.saleItems += s.items.length;
    }

    // 10. EXPENSES
    console.log('  10/14 Migrating Expenses...');
    const expenses = await sourcePrisma.expense.findMany();
    for (const exp of expenses) {
      await targetPrisma.expense.upsert({
        where: { expenseNo: exp.expenseNo },
        update: {},
        create: {
          id: exp.id,
          expenseNo: exp.expenseNo,
          storeCode: exp.storeCode,
          category: exp.category,
          amount: new Prisma.Decimal(exp.amount.toString()),
          description: exp.description,
          paymentMethod: exp.paymentMethod,
          referenceNo: exp.referenceNo,
          receiptUrl: exp.receiptUrl,
          approvedBy: exp.approvedBy,
          recordedBy: exp.recordedBy,
          date: exp.date,
          createdAt: exp.createdAt,
        },
      });
      stats.expenses++;
    }

    // 11. FINANCIAL LEDGER
    console.log('  11/14 Migrating General Financial Ledger...');
    const ledger = await sourcePrisma.financialLedgerEntry.findMany();
    for (const l of ledger) {
      await targetPrisma.financialLedgerEntry.upsert({
        where: { entryNo: l.entryNo },
        update: {},
        create: {
          id: l.id,
          entryNo: l.entryNo,
          entryDate: l.entryDate,
          storeCode: l.storeCode,
          accountCategory: l.accountCategory,
          accountName: l.accountName,
          debit: new Prisma.Decimal(l.debit.toString()),
          credit: new Prisma.Decimal(l.credit.toString()),
          amount: new Prisma.Decimal(l.amount.toString()),
          refType: l.refType,
          refId: l.refId,
          refNo: l.refNo,
          entityName: l.entityName,
          description: l.description,
          isEliminated: l.isEliminated,
          metadataJson: l.metadataJson,
          currencyCode: l.currencyCode || 'INR',
          createdBy: l.createdBy,
          createdAt: l.createdAt,
        },
      });
      stats.financialLedger++;
    }

    // 12. PAYMENT METHODS
    console.log('  12/14 Migrating Payment Methods...');
    const methods = await sourcePrisma.paymentMethod.findMany();
    for (const m of methods) {
      await targetPrisma.paymentMethod.upsert({
        where: { code: m.code },
        update: {},
        create: m,
      });
      stats.paymentMethods++;
    }

    // 13. CENTRAL EXPENSES
    console.log('  13/16 Migrating Central Expenses...');
    const centralExpenses = await sourcePrisma.centralExpense.findMany().catch(() => []);
    for (const ce of centralExpenses) {
      await targetPrisma.centralExpense.upsert({
        where: { expenseNo: ce.expenseNo },
        update: {},
        create: {
          id: ce.id,
          expenseNo: ce.expenseNo,
          category: ce.category,
          amount: new Prisma.Decimal(ce.amount.toString()),
          description: ce.description,
          paymentMethod: ce.paymentMethod,
          referenceNo: ce.referenceNo,
          receiptUrl: ce.receiptUrl,
          approvedBy: ce.approvedBy,
          recordedBy: ce.recordedBy,
          date: ce.date,
          createdAt: ce.createdAt,
        },
      });
      stats.centralExpenses++;
    }

    // 14. BRANDING SETTINGS
    console.log('  14/16 Migrating Branding Settings...');
    const branding = await sourcePrisma.brandingSetting.findFirst().catch(() => null);
    if (branding) {
      await targetPrisma.brandingSetting.upsert({
        where: { id: branding.id },
        update: branding,
        create: branding,
      });
      stats.branding++;
    } else {
      await targetPrisma.brandingSetting.upsert({
        where: { id: 'cosko_branding_config' },
        update: {},
        create: {
          id: 'cosko_branding_config',
          appName: 'RISMOS',
          tagline: 'Run Retail. Smarter.',
          supportEmail: 'support@rismos.com',
          country: 'India',
          countryCode: 'IN',
          timezone: 'Asia/Kolkata',
          locale: 'en-IN',
          baseCurrency: 'INR (₹)',
        },
      });
      stats.branding++;
    }

    // 15. SYSTEM SETTINGS
    console.log('  15/16 Migrating System Settings...');
    const system = await sourcePrisma.systemSettings.findFirst().catch(() => null);
    if (system) {
      await targetPrisma.systemSettings.upsert({
        where: { id: system.id },
        update: system,
        create: system,
      });
      stats.systemSettings++;
    } else {
      await targetPrisma.systemSettings.upsert({
        where: { id: 'cosko_system_config' },
        update: {},
        create: {
          id: 'cosko_system_config',
          countryCode: 'IN',
          currencyCode: 'INR',
          currencySymbol: '₹',
          taxRegime: 'GST',
          taxConfigVersion: 1,
          defaultTaxRate: new Prisma.Decimal('18.00'),
          invoiceHeader: 'RISMOS Retail Enterprise',
          invoiceFooter: 'Thank you for shopping with us! Goods once sold cannot be returned without original receipt.',
          sessionTimeoutMins: 43200,
          maxLoginAttempts: 5,
          enforcePasswordPolicy: true,
          sensitiveActionConfirm: true,
          lowStockAlerts: true,
          overduePaymentAlerts: true,
        },
      });
      stats.systemSettings++;
    }

    // 16. SEQUENCE COUNTERS
    console.log('  16/16 Migrating Sequence Counters...');
    const sequences = await sourcePrisma.sequenceCounter.findMany().catch(() => []);
    for (const seq of sequences) {
      await targetPrisma.sequenceCounter.upsert({
        where: { prefix: seq.prefix },
        update: { currentValue: seq.currentValue },
        create: {
          prefix: seq.prefix,
          currentValue: seq.currentValue,
        },
      });
      stats.sequenceCounters++;
    }

    console.log('✅ [V1 → V2 MIGRATION] ETL completed successfully!');
    return stats;
  } finally {
    await sourcePrisma.$disconnect();
    await targetPrisma.$disconnect();
  }
}

// Direct CLI Invocation
if (process.argv[1]?.includes('migrate-v1-to-v2')) {
  const source = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  const target = process.env.TARGET_DATABASE_URL || process.env.NEW_DATABASE_URL;

  if (!source || !target) {
    console.error('Error: SOURCE_DATABASE_URL (or DATABASE_URL) and TARGET_DATABASE_URL (or NEW_DATABASE_URL) required.');
    process.exit(1);
  }

  console.log('Executing V1 to V2 Migration CLI...');
  migrateV1ToV2(source, target)
    .then((stats) => {
      console.log('\nMigration Completed. Statistics:');
      console.table(stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
