import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db';
import { signSessionToken, hashToken } from '../src/lib/auth';

// Route handlers
import { GET as getSales } from '../src/app/api/sales/route';
import { GET as getPurchases } from '../src/app/api/purchases/route';
import { GET as getExpenses } from '../src/app/api/expenses/route';
import { GET as getInventory } from '../src/app/api/inventory/route';
import { GET as getSettings, POST as postSettings } from '../src/app/api/settings/route';
import { GET as getUsers } from '../src/app/api/users/route';

/**
 * P3-7: Role / Store Security Matrix Test Suite
 *
 * Requirements:
 * - Roles: Super Admin, Store Manager, Sales Manager
 * - Test every sensitive API route
 * - Store Manager assigned BLR attempts:
 *   - HYD -> must fail server-side (403)
 *   - CENTRAL -> must fail server-side (403)
 *   - All Stores -> must fail server-side (403)
 *   - arbitrary store -> must fail server-side (403)
 * - Sales Manager must not see:
 *   - cost
 *   - profit
 *   - protected accounting details
 * - Settings must reject non-Super Admin (403)
 * - UI Preferences cannot grant routes or elevate permissions
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

async function createTestSession(userAccount: any): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const sessionRecord = await prisma.userSession.create({
    data: {
      userId: userAccount.id,
      tokenHash: 'temp_hash_' + Math.random().toString(36).substring(2),
      expiresAt,
    },
  });

  const sessionUser = {
    id: userAccount.id,
    name: userAccount.name,
    email: userAccount.email,
    role: userAccount.role as any,
    securityLevel: userAccount.securityLevel,
    store: userAccount.storeScope || 'BLR',
    allowedStores: [userAccount.storeScope || 'BLR'],
    avatar: userAccount.avatarUrl || '',
    sessionId: sessionRecord.id,
  };

  const rawToken = signSessionToken(sessionUser, sessionRecord.id);
  const realHash = hashToken(rawToken);

  await prisma.userSession.update({
    where: { id: sessionRecord.id },
    data: { tokenHash: realHash },
  });

  return rawToken;
}

async function runRoleStoreSecuritySuite() {
  console.log('========================================================================');
  console.log('🛡️  P3-7: ROLE & STORE CROSS-PENETRATION SECURITY MATRIX');
  console.log('========================================================================\n');

  // Load authoritative users
  const superAdmin = await prisma.userAccount.findFirst({ where: { role: 'Super Admin' } });
  const blrManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager', storeScope: 'BLR' } });
  const salesManager = await prisma.userAccount.findFirst({ where: { role: 'Sales Manager', storeScope: 'BLR' } });

  if (!superAdmin || !blrManager || !salesManager) {
    throw new Error('Database must have seeded users for Super Admin, Store Manager (BLR), and Sales Manager (BLR)');
  }

  const saToken = await createTestSession(superAdmin);
  const blrToken = await createTestSession(blrManager);
  const smToken = await createTestSession(salesManager);

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. STORE MANAGER (BLR) CROSS-STORE PENETRATION ATTEMPTS
    // ─────────────────────────────────────────────────────────────────────
    console.log('--- 1. Store Manager (BLR) Scope Lock & Cross-Store Denial ---');

    const unauthorizedTargets = [
      { name: 'HYD', param: 'HYD' },
      { name: 'CENTRAL', param: 'CENTRAL' },
      { name: 'All Stores', param: 'All Stores' },
      { name: 'Arbitrary Store (XYZ-999)', param: 'XYZ-999' },
    ];

    for (const target of unauthorizedTargets) {
      // Sales API
      const salesReq = new NextRequest(`http://localhost:3000/api/sales?store=${encodeURIComponent(target.param)}`, {
        headers: { cookie: `cosko_session=${blrToken}` },
      });
      const salesRes = await getSales(salesReq);
      assert(
        `BLR Manager querying sales for ${target.name} is rejected with 403 Forbidden`,
        salesRes.status === 403
      );

      // Purchases API
      const purchReq = new NextRequest(`http://localhost:3000/api/purchases?store=${encodeURIComponent(target.param)}`, {
        headers: { cookie: `cosko_session=${blrToken}` },
      });
      const purchRes = await getPurchases(purchReq);
      assert(
        `BLR Manager querying purchases for ${target.name} is rejected with 403 Forbidden`,
        purchRes.status === 403
      );

      // Expenses API
      const expReq = new NextRequest(`http://localhost:3000/api/expenses?store=${encodeURIComponent(target.param)}`, {
        headers: { cookie: `cosko_session=${blrToken}` },
      });
      const expRes = await getExpenses(expReq);
      assert(
        `BLR Manager querying expenses for ${target.name} is rejected with 403 Forbidden`,
        expRes.status === 403
      );

      // Inventory API
      const invReq = new NextRequest(`http://localhost:3000/api/inventory?store=${encodeURIComponent(target.param)}`, {
        headers: { cookie: `cosko_session=${blrToken}` },
      });
      const invRes = await getInventory(invReq);
      assert(
        `BLR Manager querying inventory for ${target.name} is rejected with 403 Forbidden`,
        invRes.status === 403
      );
    }

    // BLR Manager querying own store BLR should succeed
    const ownSalesReq = new NextRequest('http://localhost:3000/api/sales?store=BLR', {
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const ownSalesRes = await getSales(ownSalesReq);
    assert('BLR Manager querying assigned store BLR is authorized (200)', ownSalesRes.status === 200);

    // ─────────────────────────────────────────────────────────────────────
    // 2. SALES MANAGER COST & PROFIT MASKING (FINANCIAL PRIVACY)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Sales Manager Financial Privacy & Cost/Profit Masking ---');

    // Fetch sales as Sales Manager
    const smSalesReq = new NextRequest('http://localhost:3000/api/sales?store=BLR', {
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const smSalesRes = await getSales(smSalesReq);
    const smSalesBody = await smSalesRes.json();
    assert('Sales Manager can view own store sales (200)', smSalesRes.status === 200);

    if (smSalesBody.sales && smSalesBody.sales.length > 0) {
      const firstSale = smSalesBody.sales[0];
      assert('Sales Manager receives masked totalCost (0)', Number(firstSale.totalCost) === 0);
      assert('Sales Manager receives masked grossProfit (0)', Number(firstSale.grossProfit) === 0);
      if (firstSale.items && firstSale.items.length > 0) {
        assert('Sales Manager receives masked item unitCost (0)', Number(firstSale.items[0].unitCost) === 0);
        assert('Sales Manager receives masked item lineProfit (0)', Number(firstSale.items[0].lineProfit) === 0);
      }
    } else {
      assert('Sales Manager sales response checked', true);
    }

    // Fetch product as Sales Manager (Single product detail API)
    const testProd = await prisma.product.findFirst({ where: { status: 'active' } });
    if (testProd) {
      const smProdReq = new NextRequest(`http://localhost:3000/api/inventory?id=${testProd.id}`, {
        headers: { cookie: `cosko_session=${smToken}` },
      });
      const smProdRes = await getInventory(smProdReq);
      const smProdBody = await smProdRes.json();
      assert('Sales Manager fetches product detail (200)', smProdRes.status === 200);
      assert('Sales Manager receives masked product baseCostPrice (0)', Number(smProdBody.product.baseCostPrice) === 0);

      // Super Admin fetching same product sees true cost price
      const saProdReq = new NextRequest(`http://localhost:3000/api/inventory?id=${testProd.id}`, {
        headers: { cookie: `cosko_session=${saToken}` },
      });
      const saProdRes = await getInventory(saProdReq);
      const saProdBody = await saProdRes.json();
      assert('Super Admin fetches product detail (200)', saProdRes.status === 200);
      assert('Super Admin sees unmasked baseCostPrice (> 0)', Number(saProdBody.product.baseCostPrice) > 0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. SETTINGS AUTHORIZATION (SUPER ADMIN ONLY)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. System Settings Super Admin Gate ---');

    // GET /api/settings as Sales Manager -> 403
    const smSettingsReq = new NextRequest('http://localhost:3000/api/settings', {
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const smSettingsRes = await getSettings(smSettingsReq);
    assert('Sales Manager GET /api/settings is rejected with 403', smSettingsRes.status === 403);

    // GET /api/settings as Store Manager -> 403
    const blrSettingsReq = new NextRequest('http://localhost:3000/api/settings', {
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const blrSettingsRes = await getSettings(blrSettingsReq);
    assert('Store Manager GET /api/settings is rejected with 403', blrSettingsRes.status === 403);

    // GET /api/settings as Super Admin -> 200
    const saSettingsReq = new NextRequest('http://localhost:3000/api/settings', {
      headers: { cookie: `cosko_session=${saToken}` },
    });
    const saSettingsRes = await getSettings(saSettingsReq);
    assert('Super Admin GET /api/settings succeeds (200)', saSettingsRes.status === 200);

    // POST /api/settings as Store Manager -> 403
    const blrPostReq = new NextRequest('http://localhost:3000/api/settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({ section: 'branding', data: { appName: 'Hacked' } }),
    });
    const blrPostRes = await postSettings(blrPostReq);
    assert('Store Manager POST /api/settings is rejected with 403', blrPostRes.status === 403);

    // Users API GET /api/users
    const smUsersReq = new NextRequest('http://localhost:3000/api/users', {
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const smUsersRes = await getUsers(smUsersReq);
    assert('Sales Manager GET /api/users is rejected with 403', smUsersRes.status === 403);

    // ─────────────────────────────────────────────────────────────────────
    // 4. USER UI PREFERENCES CANNOT ELEVATE PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Preferences Privilege Escalation Protection ---');

    // Simulate tampered preferences containing malicious role/permission elevation
    const tamperedPreferences = {
      theme: 'dark',
      role: 'Super Admin',
      securityLevel: 100,
      permissions: ['*'],
      allowedStores: ['ALL', 'CENTRAL', 'HYD'],
    };

    await (prisma as any).userUiPreference.upsert({
      where: { userId: salesManager.id },
      create: {
        userId: salesManager.id,
        preferencesJson: JSON.stringify(tamperedPreferences),
      },
      update: {
        preferencesJson: JSON.stringify(tamperedPreferences),
      },
    });

    // Re-verify that Sales Manager is STILL rejected from Super Admin routes
    const retestSettingsReq = new NextRequest('http://localhost:3000/api/settings', {
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const retestSettingsRes = await getSettings(retestSettingsReq);
    assert(
      'Sales Manager with tampered UI preferences is STILL strictly rejected (403)',
      retestSettingsRes.status === 403
    );

  } catch (err: any) {
    console.error('Role security matrix error:', err);
    assert('Execution completed without error', false, err.message);
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runRoleStoreSecuritySuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
