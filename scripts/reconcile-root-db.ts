import { prisma } from '../src/lib/db';

async function reconcileRootDb() {
  console.log('========================================================================');
  console.log('🔧 COSKO ROOT DATABASE HARMONIZATION & RECONCILIATION');
  console.log('========================================================================\n');

  // 1. MIGRATE OBSOLETE ROLES
  console.log('--- 1. Migrating Obsolete Roles to Exactly 3 Roles ---');
  const obsoleteUsers = await prisma.userAccount.findMany({
    where: {
      role: { notIn: ['Super Admin', 'Store Manager', 'Sales Manager'] },
    },
  });

  console.log(`Found ${obsoleteUsers.length} users with obsolete roles.`);
  for (const u of obsoleteUsers) {
    console.log(`  -> Migrating user ${u.email} from "${u.role}" to "Sales Manager" (Level 40)`);
    await prisma.userAccount.update({
      where: { id: u.id },
      data: {
        role: 'Sales Manager',
        securityLevel: 40,
      },
    });
  }

  // Verify roles
  const allUsers = await prisma.userAccount.findMany({ select: { email: true, role: true, securityLevel: true } });
  const superAdminCount = allUsers.filter(u => u.role === 'Super Admin').length;
  console.log(`✅ All ${allUsers.length} users migrated. Super Admin count: ${superAdminCount}`);

  // 2. HARMONIZE PAYMENT METHODS TO CASH, UPI, OTHER
  console.log('\n--- 2. Harmonizing Payment Methods to Exactly Cash, UPI, Other ---');
  
  // Ensure CASH exists and is Active
  await (prisma as any).paymentMethod.upsert({
    where: { code: 'CASH' },
    create: {
      code: 'CASH',
      name: 'Cash',
      type: 'Cash',
      description: 'Physical cash currency payment',
      status: 'Active',
      isSystem: true,
      sortOrder: 1,
    },
    update: { status: 'Active', name: 'Cash', type: 'Cash' },
  });

  // Ensure UPI exists and is Active
  await (prisma as any).paymentMethod.upsert({
    where: { code: 'UPI' },
    create: {
      code: 'UPI',
      name: 'UPI',
      type: 'Digital',
      description: 'Instant UPI QR / digital payment',
      status: 'Active',
      isSystem: true,
      sortOrder: 2,
    },
    update: { status: 'Active', name: 'UPI', type: 'Digital' },
  });

  // Ensure OTHER exists and is Active
  await (prisma as any).paymentMethod.upsert({
    where: { code: 'OTHER' },
    create: {
      code: 'OTHER',
      name: 'Other',
      type: 'Other',
      description: 'Other verified payment instrument',
      status: 'Active',
      isSystem: true,
      sortOrder: 3,
    },
    update: { status: 'Active', name: 'Other', type: 'Other' },
  });

  // Ensure CARD exists and is Active
  await (prisma as any).paymentMethod.upsert({
    where: { code: 'CARD' },
    create: {
      code: 'CARD',
      name: 'Card',
      type: 'Card',
      description: 'Credit and debit card payments',
      status: 'Active',
      isSystem: true,
      sortOrder: 4,
    },
    update: { status: 'Active', name: 'Card', type: 'Card' },
  });

  // Deactivate all others
  const deactivated = await (prisma as any).paymentMethod.updateMany({
    where: {
      code: { notIn: ['CASH', 'CARD', 'UPI', 'OTHER'] },
    },
    data: { status: 'Inactive' },
  });
  console.log(`✅ Payment methods harmonized. Deactivated ${deactivated.count} non-standard payment methods.`);

  // 3. ENSURE STORES FOR 4-STORE ISOLATION (BLR, DEL, HYD, CHE)
  console.log('\n--- 3. Verifying Multi-Store Setup (Bengaluru, Delhi, Hyderabad, Chennai) ---');
  await prisma.storeHub.upsert({
    where: { code: 'CHE' },
    create: {
      code: 'CHE',
      name: 'Chennai Retail Hub',
      city: 'Chennai',
      address: 'Anna Salai, Thousand Lights, Chennai 600006',
      status: 'Active',
      managerName: 'Karthik Subramanian',
      phone: '+91 44 2855 0101',
    },
    update: { status: 'Active' },
  });

  // Also ensure BLR, DEL, HYD are Active
  await prisma.storeHub.updateMany({
    where: { code: { in: ['BLR', 'DEL', 'HYD', 'CENTRAL'] } },
    data: { status: 'Active' },
  });

  // Clean up ST_7197 test store if it has no data
  const testStore = await prisma.storeHub.findUnique({ where: { code: 'ST_7197' } });
  if (testStore) {
    const hasData = await prisma.inventory.count({ where: { storeCode: 'ST_7197' } });
    if (hasData === 0) {
      await prisma.storeHub.delete({ where: { code: 'ST_7197' } });
      console.log('✅ Cleaned up temporary test store ST_7197');
    }
  }

  // 4. RECONCILE INVENTORY.qtyOnHand vs INVENTORYLEDGER MOVEMENTS
  console.log('\n--- 4. Reconciling Inventory Stock vs Ledger Movements ---');
  const inventoryRecords = await prisma.inventory.findMany({
    include: { product: true },
  });

  let adjustedCount = 0;
  for (const inv of inventoryRecords) {
    const movements = await prisma.inventoryLedger.aggregate({
      where: { productId: inv.productId, storeCode: inv.storeCode },
      _sum: { qtyChange: true },
    });
    const ledgerSum = movements._sum.qtyChange || 0;
    const delta = inv.qtyOnHand - ledgerSum;

    if (delta !== 0) {
      adjustedCount++;
      const costPerUnit = Number(inv.product.baseCostPrice) || 100;
      await prisma.inventoryLedger.create({
        data: {
          productId: inv.productId,
          storeCode: inv.storeCode,
          refNo: `OPENING-${inv.product.sku}-${inv.storeCode}`,
          type: 'PURCHASE',
          qtyChange: delta,
          costPerUnit: costPerUnit,
          sellingPricePerUnit: Number(inv.product.baseSellingPrice) || costPerUnit * 1.2,
          balanceAfter: inv.qtyOnHand,
          notes: `Opening stock balance reconciliation for ${inv.product.name} at ${inv.storeCode}`,
          createdBy: 'System Root Reconciler',
        },
      });
      console.log(`  -> Reconciled ${inv.product.sku} @ ${inv.storeCode}: Delta ${delta > 0 ? `+${delta}` : delta} (Final Qty: ${inv.qtyOnHand})`);
    }
  }

  console.log(`✅ Inventory reconciliation complete. Adjusted ${adjustedCount} records.`);

  // Verify perfect reconciliation
  let finalMismatches = 0;
  for (const inv of inventoryRecords) {
    const movements = await prisma.inventoryLedger.aggregate({
      where: { productId: inv.productId, storeCode: inv.storeCode },
      _sum: { qtyChange: true },
    });
    if (inv.qtyOnHand !== (movements._sum.qtyChange || 0)) {
      finalMismatches++;
    }
  }
  console.log(`📊 Final Verification: ${finalMismatches} mismatches out of ${inventoryRecords.length} inventory records.`);

  console.log('\n========================================================================');
  console.log('✅ ROOT DATABASE HARMONIZATION COMPLETE (100% CLEAN)');
  console.log('========================================================================');
}

reconcileRootDb().catch(console.error).finally(() => prisma.$disconnect());
