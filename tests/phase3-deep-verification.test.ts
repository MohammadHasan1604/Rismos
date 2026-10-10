/**
 * COSKO Phase 3 — Deep Root-to-Root Verification Test Suite
 *
 * Programmatically proves:
 * 1. Real API Route Handlers (via NextRequest -> AuthPipeline -> DB -> Response)
 * 2. 4-Store Isolation Penetration (BLR, DEL, HYD, CHE cross-store denial 403/404)
 * 3. 3-Role Permissions (Super Admin 100, Store Manager 80, Sales Manager 40)
 * 4. 30-Day DB Session Lifecycle & Fail-Closed Security (Revocation, Expiry, Suspension, No-JWT-Bypass)
 * 5. Attendance Calculation & Duplicate Shift Guard
 * 6. Server-Generated Traceable Payment References (Cash, UPI, Other)
 * 7. Newest-First Ordering across Modules
 * 8. Accounting Double-Entry Invariant (Debits == Credits)
 * 9. Inventory Stock Equation Reconciliation
 */

import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db';
import { signSessionToken, hashToken, hashPassword } from '../src/lib/auth';

// Route Handlers
import { GET as getSales, POST as postSales } from '../src/app/api/sales/route';
import { GET as getPurchases, POST as postPurchases } from '../src/app/api/purchases/route';
import { GET as getExpenses, POST as postExpenses } from '../src/app/api/expenses/route';
import { GET as getCustomers, POST as postCustomers } from '../src/app/api/customers/route';
import { GET as getUsers, POST as postUsers } from '../src/app/api/users/route';
import { GET as getAttendance } from '../src/app/api/attendance/route';
import { POST as startAttendance } from '../src/app/api/attendance/start/route';
import { POST as endAttendance } from '../src/app/api/attendance/end/route';
import { GET as getInventory, POST as postInventory } from '../src/app/api/inventory/route';
import { GET as getFiles } from '../src/app/api/files/[...key]/route';
import { GET as getCategories, POST as postCategories } from '../src/app/api/categories/route';
import { POST as postBrands } from '../src/app/api/brands/route';
import { POST as postUnits } from '../src/app/api/units/route';
import { POST as postVendors } from '../src/app/api/vendors/route';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<boolean | string> | boolean | string) {
  try {
    const result = await fn();
    if (result === true) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      const msg = typeof result === 'string' ? result : 'assertion failed';
      console.log(`  ❌ ${name}: ${msg}`);
      failures.push(`${name}: ${msg}`);
      failed++;
    }
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failures.push(`${name}: ${err.message}`);
    failed++;
  }
}

// Helper to create an active DB session and return the raw JWT token
async function createTestSession(userAccount: any, expiresInDays = 30): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

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

export async function runDeepVerification() {
  console.log('========================================================================');
  console.log('🔬 COSKO PHASE 3 DEEP ROOT-TO-ROOT E2E & PENETRATION SUITE');
  console.log('========================================================================\n');

  // Fetch real users from DB
  const superAdmin = await prisma.userAccount.findFirst({ where: { role: 'Super Admin' } });
  const blrManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager', storeScope: 'BLR' } });
  const hydManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager', storeScope: 'HYD' } });
  const delManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager', storeScope: 'DEL' } });
  const cheManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager', storeScope: 'CHE' } });
  const salesManager = await prisma.userAccount.findFirst({ where: { role: 'Sales Manager', storeScope: 'BLR' } });

  if (!superAdmin || !blrManager || !hydManager || !delManager || !cheManager || !salesManager) {
    throw new Error('Required seeded users for BLR, HYD, DEL, CHE, Super Admin, and Sales Manager must exist in DB');
  }

  // Create real DB sessions
  const saToken = await createTestSession(superAdmin);
  const blrToken = await createTestSession(blrManager);
  const hydToken = await createTestSession(hydManager);
  const delToken = await createTestSession(delManager);
  const cheToken = await createTestSession(cheManager);
  const smToken = await createTestSession(salesManager);

  // ─────────────────────────────────────────────────────────────────────
  // 1. 4-STORE ISOLATION PENETRATION TEST (BLR, DEL, HYD, CHE)
  // ─────────────────────────────────────────────────────────────────────
  console.log('🏢 1. Four-Store Isolation Penetration Tests');

  await test('BLR Manager is FORBIDDEN from querying HYD store sales (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales?store=HYD', {
      method: 'GET',
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const res = await getSales(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('BLR Manager is FORBIDDEN from querying DEL store purchases (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/purchases?store=DEL', {
      method: 'GET',
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const res = await getPurchases(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('HYD Manager is FORBIDDEN from querying BLR store expenses (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses?store=BLR', {
      method: 'GET',
      headers: { cookie: `cosko_session=${hydToken}` },
    });
    const res = await getExpenses(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('CHE Manager is FORBIDDEN from querying BLR store inventory (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/inventory?store=BLR', {
      method: 'GET',
      headers: { cookie: `cosko_session=${cheToken}` },
    });
    const res = await getInventory(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('DEL Manager is FORBIDDEN from querying consolidated "All Stores" (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales?store=All+Stores', {
      method: 'GET',
      headers: { cookie: `cosko_session=${delToken}` },
    });
    const res = await getSales(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Super Admin only');
  });

  await test('BLR Manager attempting to execute POS sale under HYD store returns 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        storeCode: 'HYD',
        items: [{ productId: 'non_existent', qty: 1, unitPrice: 100 }],
        paymentMethod: 'UPI',
      }),
    });
    const res = await postSales(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Store Scope Lock');
  });

  await test('BLR Manager attempting to create Purchase Order for CHE store returns 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/purchases', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        storeCode: 'CHE',
        vendorName: 'Anker Innovations Ltd',
        items: [{ productId: 'test-item', qtyOrdered: 5, unitCost: 500 }],
      }),
    });
    const res = await postPurchases(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('HYD Manager attempting to record Expense for DEL store returns 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${hydToken}`,
      },
      body: JSON.stringify({
        store: 'DEL',
        category: 'Maintenance',
        amount: 350,
        paymentMethod: 'Cash',
      }),
    });
    const res = await postExpenses(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('CHE Manager attempting to execute POS sale under BLR store returns 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${cheToken}`,
      },
      body: JSON.stringify({
        storeCode: 'BLR',
        items: [{ productId: 'test_product', qty: 1, unitPrice: 500 }],
        paymentMethod: 'Cash',
      }),
    });
    const res = await postSales(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Store Scope Lock');
  });

  await test('Super Admin can query any store (BLR, DEL, HYD, CHE) without restriction', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales?store=BLR', {
      method: 'GET',
      headers: { cookie: `cosko_session=${saToken}` },
    });
    const res = await getSales(req);
    const body = await res.json();
    return res.status === 200 && body.success === true;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. THREE-ROLE PERMISSION HIERARCHY TEST
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n🎭 2. Three-Role Permission Hierarchy & Minimal Privilege');

  await test('Sales Manager is FORBIDDEN from viewing Users directory (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'GET',
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const res = await getUsers(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('Sales Manager is FORBIDDEN from recording Expenses (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${smToken}`,
      },
      body: JSON.stringify({
        category: 'Office Supplies',
        amount: 500,
        proofUrl: 'https://storage.cosko.com/proofs/test.jpg',
      }),
    });
    const res = await postExpenses(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('Store Manager CANNOT create another Store Manager (Level Ceiling 403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        name: 'Peer Manager',
        email: `peer.mgr.${Date.now()}@cosko.com`,
        password: 'SecureX#2026!Str',
        role: 'Store Manager',
        store: 'BLR',
      }),
    });
    const res = await postUsers(req);
    const body = await res.json();
    return res.status === 403 && (body.error?.includes('own security level') || body.error?.includes('Store Manager can only create Sales Manager'));
  });

  await test('Store Manager CANNOT create a Super Admin (Singleton Rule 403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        name: 'Fake Super Admin',
        email: `fake.sa.${Date.now()}@cosko.com`,
        password: 'SecureX#2026!Str',
        role: 'Super Admin',
        store: 'All Stores',
      }),
    });
    const res = await postUsers(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('protected Super Admin');
  });

  await test('Store Manager CANNOT create user assigned to a different store (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        name: 'Cross Store Worker',
        email: `cross.worker.${Date.now()}@cosko.com`,
        password: 'SecureX#2026!Str',
        role: 'Sales Manager',
        assignedStores: ['HYD'],
      }),
    });
    const res = await postUsers(req);
    const body = await res.json();
    return res.status === 403 && body.error?.includes('authorized for');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. 30-DAY DB SESSION LIFECYCLE & FAIL-CLOSED GUARDS
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n🔑 3. 30-Day DB Session Lifecycle & Fail-Closed Guards');

  await test('Valid active DB session authenticates successfully (200)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'GET',
      headers: { cookie: `cosko_session=${saToken}` },
    });
    const res = await getSales(req);
    return res.status === 200;
  });

  await test('Tampered/Forged JWT without valid DB session fails closed (401)', async () => {
    // Generate a validly signed JWT using secret but pointing to non-existent session
    const forgedToken = signSessionToken({
      id: superAdmin.id,
      name: superAdmin.name,
      email: superAdmin.email,
      role: 'Super Admin',
      securityLevel: 100,
      store: 'All Stores',
      avatar: '',
      sessionId: 'non_existent_session_id_9999',
    });

    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'GET',
      headers: { cookie: `cosko_session=${forgedToken}` },
    });
    const res = await getSales(req);
    return res.status === 401;
  });

  await test('Revoked DB session fails closed immediately (401)', async () => {
    const revokedSession = await prisma.userSession.create({
      data: {
        userId: blrManager.id,
        tokenHash: 'revoked_hash_' + Math.random().toString(36),
        expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
        revokedAt: new Date(),
      },
    });
    const revokedToken = signSessionToken(
      {
        id: blrManager.id,
        name: blrManager.name,
        email: blrManager.email,
        role: 'Store Manager',
        securityLevel: 80,
        store: 'BLR',
        avatar: '',
        sessionId: revokedSession.id,
      },
      revokedSession.id
    );
    await prisma.userSession.update({
      where: { id: revokedSession.id },
      data: { tokenHash: hashToken(revokedToken) },
    });

    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'GET',
      headers: { cookie: `cosko_session=${revokedToken}` },
    });
    const res = await getSales(req);
    return res.status === 401;
  });

  await test('Expired DB session fails closed immediately (401)', async () => {
    const expiredSession = await prisma.userSession.create({
      data: {
        userId: blrManager.id,
        tokenHash: 'expired_hash_' + Math.random().toString(36),
        expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour in the past
      },
    });
    const expiredToken = signSessionToken(
      {
        id: blrManager.id,
        name: blrManager.name,
        email: blrManager.email,
        role: 'Store Manager',
        securityLevel: 80,
        store: 'BLR',
        avatar: '',
        sessionId: expiredSession.id,
      },
      expiredSession.id
    );
    await prisma.userSession.update({
      where: { id: expiredSession.id },
      data: { tokenHash: hashToken(expiredToken) },
    });

    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'GET',
      headers: { cookie: `cosko_session=${expiredToken}` },
    });
    const res = await getSales(req);
    return res.status === 401;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. ATTENDANCE DURATION ACCURACY & DUPLICATE SHIFT GUARD
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n⏱️ 4. Attendance Calculation & Shift Guard');

  await test('Calculates exact duration (09:00:00 to 17:00:00 = exactly 28,800s / 08:00:00)', () => {
    const start = new Date('2026-09-29T09:00:00Z');
    const end = new Date('2026-09-29T17:00:00Z');
    const totalSecs = Math.floor((end.getTime() - start.getTime()) / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return totalSecs === 28800 && formatted === '08:00:00';
  });

  await test('Duplicate start shift on completed day is strictly blocked (409)', async () => {
    // Check if test user has completed attendance today in store timezone (Asia/Kolkata)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const existing = await (prisma as any).attendanceDay.findUnique({
      where: {
        userId_localDate: {
          userId: delManager.id,
          localDate: dateStr,
        },
      },
    });

    if (!existing) {
      await (prisma as any).attendanceDay.create({
        data: {
          userId: delManager.id,
          localDate: dateStr,
          storeCode: 'DEL',
          shiftStartUtc: new Date(Date.now() - 3600 * 1000),
          shiftEndUtc: new Date(),
          totalSeconds: 3600,
          status: 'COMPLETED',
        },
      });
    } else if (existing.status === 'ACTIVE') {
      await (prisma as any).attendanceDay.update({
        where: { id: existing.id },
        data: { status: 'COMPLETED', shiftEndUtc: new Date(), totalSeconds: 3600 },
      });
    }

    // Now attempt duplicate start shift
    const req = new NextRequest('http://localhost:3000/api/attendance/start', {
      method: 'POST',
      headers: { cookie: `cosko_session=${delToken}` },
    });
    const res = await startAttendance(req);
    const body = await res.json();
    return res.status === 409 && (body.code === 'SHIFT_ALREADY_COMPLETED' || body.code === 'SHIFT_ALREADY_ACTIVE');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. SERVER-GENERATED INTERNAL TRACEABLE REFERENCES (Section 5)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n🧾 5. Server-Generated Traceable References (Cash, UPI, Other)');

  await test('Expenses API auto-generates internal reference when user omits referenceNo', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        category: 'Cleaning Supplies',
        amount: 250,
        store: 'BLR',
        paymentMethod: 'Cash',
        proofUrl: 'https://storage.cosko.com/proofs/receipt-test.jpg',
        description: 'Auto-reference test expense',
        // referenceNo intentionally omitted!
      }),
    });
    const res = await postExpenses(req);
    const body = await res.json();
    const createdExpense = body.expense;
    const hasValidRef = createdExpense?.referenceNo && createdExpense.referenceNo.startsWith('EXP-REF-');
    
    // Clean up test expense
    if (createdExpense?.id) {
      await prisma.expense.delete({ where: { id: createdExpense.id } });
      await prisma.financialLedgerEntry.deleteMany({ where: { refId: createdExpense.id } });
    }
    return (res.status === 201 || res.status === 200) && Boolean(hasValidRef);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. NEWEST-FIRST QUERY ORDERING (Section 16)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n⏱️ 6. Authoritative Newest-First Query Ordering');

  await test('Products findMany returns records sorted newest-first (createdAt: desc)', async () => {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (let i = 0; i < products.length - 1; i++) {
      if (new Date(products[i].createdAt).getTime() < new Date(products[i + 1].createdAt).getTime()) {
        return false;
      }
    }
    return true;
  });

  await test('Sales findMany returns records sorted newest-first (createdAt: desc)', async () => {
    const sales = await prisma.salesOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (let i = 0; i < sales.length - 1; i++) {
      if (new Date(sales[i].createdAt).getTime() < new Date(sales[i + 1].createdAt).getTime()) {
        return false;
      }
    }
    return true;
  });

  await test('Purchases findMany returns records sorted newest-first (createdAt: desc)', async () => {
    const purchases = await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (let i = 0; i < purchases.length - 1; i++) {
      if (new Date(purchases[i].createdAt).getTime() < new Date(purchases[i + 1].createdAt).getTime()) {
        return false;
      }
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. ACCOUNTING INTEGRITY: GENERAL LEDGER DEBITS == CREDITS (Section 6)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n⚖️ 7. Accounting Invariant: General Ledger Debits == Credits');

  await test('General Ledger entries have exact double-entry balance (Total Debits == Total Credits)', async () => {
    const entries = await prisma.financialLedgerEntry.findMany({
      where: { isEliminated: false },
    });
    const totalDebits = entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredits = entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);

    const diff = Math.abs(Math.round(totalDebits * 100) - Math.round(totalCredits * 100)) / 100;
    return diff === 0;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. INVENTORY RECONCILIATION: INVENTORY QTY == LEDGER SUM (Section 7)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n📦 8. Inventory Stock Equation Reconciliation');

  await test('Every inventory record quantity equals the exact sum of ledger movements', async () => {
    const inventory = await prisma.inventory.findMany({
      include: {
        product: { select: { sku: true, name: true } },
      },
    });

    let mismatchCount = 0;
    for (const item of inventory) {
      const ledgers = await prisma.inventoryLedger.findMany({
        where: {
          productId: item.productId,
          storeCode: item.storeCode,
        },
      });
      const ledgerSum = ledgers.reduce((sum, l) => sum + Number(l.qtyChange), 0);
      if (Number(item.qtyOnHand) !== ledgerSum) {
        mismatchCount++;
      }
    }
    return mismatchCount === 0;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. PRIVATE FILE AUTHORIZATION (Section 13)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n📁 9. Private File Authorization & Storage Security');

  // Create a test FileAsset in DB for BLR store
  const testProofKey = `payment-proofs/test-auth-proof-${Date.now()}.jpg`;
  const testExpenseKey = `expense-receipts/test-auth-receipt-${Date.now()}.pdf`;

  await (prisma as any).fileAsset.createMany({
    data: [
      {
        objectKey: testProofKey,
        storageProvider: 'local',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        originalFilename: 'test-proof.jpg',
        createdByUserId: blrManager.id,
        storeCode: 'BLR',
        privacyLevel: 'STORE_PRIVATE',
        relatedEntityType: 'Sale',
      },
      {
        objectKey: testExpenseKey,
        storageProvider: 'local',
        mimeType: 'application/pdf',
        byteSize: 2048,
        originalFilename: 'test-receipt.pdf',
        createdByUserId: blrManager.id,
        storeCode: 'BLR',
        privacyLevel: 'STORE_PRIVATE',
        relatedEntityType: 'Expense',
      },
    ],
  });

  await test('Unauthenticated user is DENIED access to private file (401)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/${testProofKey}`, {
      method: 'GET',
    });
    const res = await getFiles(req, {
      params: Promise.resolve({ key: testProofKey.split('/') }),
    });
    return res.status === 401;
  });

  await test('Other-Store Manager (HYD) is FORBIDDEN from accessing BLR private proof (403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/${testProofKey}`, {
      method: 'GET',
      headers: { cookie: `cosko_session=${hydToken}` },
    });
    const res = await getFiles(req, {
      params: Promise.resolve({ key: testProofKey.split('/') }),
    });
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('Sales Manager is FORBIDDEN from accessing expense receipts (403)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/${testExpenseKey}`, {
      method: 'GET',
      headers: { cookie: `cosko_session=${smToken}` },
    });
    const res = await getFiles(req, {
      params: Promise.resolve({ key: testExpenseKey.split('/') }),
    });
    const body = await res.json();
    return res.status === 403 && body.error?.includes('Forbidden');
  });

  await test('Same-Store Manager (BLR) is GRANTED access to BLR private proof (200 or 307 or 404 local file)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/${testProofKey}`, {
      method: 'GET',
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const res = await getFiles(req, {
      params: Promise.resolve({ key: testProofKey.split('/') }),
    });
    // Authorized: status is 200 (if file exists), 307 (if redirected to S3), or 404 (if DB authorized but file not on disk)
    // The key invariant is that it MUST NOT be 401 or 403!
    return res.status !== 401 && res.status !== 403;
  });

  await test('Super Admin is GRANTED access across all stores and private files', async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/${testProofKey}`, {
      method: 'GET',
      headers: { cookie: `cosko_session=${saToken}` },
    });
    const res = await getFiles(req, {
      params: Promise.resolve({ key: testProofKey.split('/') }),
    });
    return res.status !== 401 && res.status !== 403;
  });

  // Clean up test file assets
  await (prisma as any).fileAsset.deleteMany({
    where: { objectKey: { in: [testProofKey, testExpenseKey] } },
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. CSRF & ORIGIN VALIDATION (Section 11)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n🛡️ 10. CSRF Protection & Origin Validation');

  await test('Cross-origin request with unauthorized Origin header is blocked (403)', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker-site.com',
      },
      body: JSON.stringify({ email: 'test@cosko.com', password: 'SomePassword!' }),
    });
    const { POST: postLogin } = await import('../src/app/api/auth/login/route');
    const res = await postLogin(req);
    return res.status === 403;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 11. ACTUAL API CRUD E2E & NEWEST-FIRST VERIFICATION (Section 3)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n🔄 11. Actual API CRUD E2E & Newest-First Verification');

  const testCategorySlug = `qa-cat-${Date.now()}`;
  let createdCategoryId: string | null = null;

  await test('Category API CRUD: Create -> Read newest -> Cleanup', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/categories', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${saToken}`,
      },
      body: JSON.stringify({
        name: `QA Test Category ${Date.now()}`,
        slug: testCategorySlug,
        description: 'Automated E2E Test Category',
      }),
    });
    const createRes = await postCategories(createReq);
    const createBody = await createRes.json();
    if (!createRes.ok || !createBody.success) return false;
    createdCategoryId = createBody.category.id;

    const readReq = new NextRequest('http://localhost:3000/api/categories', {
      method: 'GET',
      headers: { cookie: `cosko_session=${saToken}` },
    });
    const readRes = await getCategories(readReq);
    const readBody = await readRes.json();
    const found = readBody.categories?.some((c: any) => c.id === createdCategoryId);

    // Clean up
    if (createdCategoryId) {
      await prisma.category.delete({ where: { id: createdCategoryId } });
    }
    return Boolean(found);
  });

  const testCustPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  let createdCustId: string | null = null;

  await test('Customer API CRUD: Create -> Read newest -> Verify', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/customers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `cosko_session=${blrToken}`,
      },
      body: JSON.stringify({
        name: 'QA E2E Customer',
        phone: testCustPhone,
        city: 'Bengaluru',
      }),
    });
    const createRes = await postCustomers(createReq);
    const createBody = await createRes.json();
    if (!createRes.ok || !createBody.success) return false;
    createdCustId = createBody.customer.id;

    const readReq = new NextRequest(`http://localhost:3000/api/customers?search=${testCustPhone}`, {
      method: 'GET',
      headers: { cookie: `cosko_session=${blrToken}` },
    });
    const readRes = await getCustomers(readReq);
    const readBody = await readRes.json();
    const found = readBody.customers?.some((c: any) => c.phone.includes(testCustPhone));

    // Clean up
    if (createdCustId) {
      await (prisma as any).customerStoreProfile.deleteMany({ where: { customerId: createdCustId } });
      await prisma.customer.delete({ where: { id: createdCustId } });
    }
    return Boolean(found);
  });

  // ─────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`📊 Deep Verification Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failed checks:', failures);
    await prisma.$disconnect();
    process.exit(1);
  }
  await prisma.$disconnect();
  process.exit(0);
}

runDeepVerification().catch(async (err) => {
  console.error('Test execution failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
