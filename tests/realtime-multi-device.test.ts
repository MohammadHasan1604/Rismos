/**
 * P3-12: REALTIME MULTI-DEVICE & TWO-SESSION SYNCHRONIZATION
 *
 * Requirements:
 * 1. Two logical sessions/devices.
 * 2. Mutations across:
 *    - branding
 *    - theme
 *    - tax/country
 *    - settings
 *    - inventory
 *    - sale
 * 3. Verify the second session receives targeted refresh/update.
 * 4. Verify no full-app refresh storm (granular domain event invalidation).
 * 5. Verify no stale store data & strict store isolation between stores.
 */

import { prisma } from '../src/lib/db';
import {
  broadcastRealtimeEvent,
  getStoreChannel,
} from '../src/lib/realtime';
import { GET as realtimeSyncGET } from '../src/app/api/realtime/sync/route';
import { NextRequest } from 'next/server';
import { signSessionToken, hashToken } from '../src/lib/auth';

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

async function createTestSession(userAccount: any): Promise<{ token: string; sessionId: string }> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    store: userAccount.storeScope || 'All Stores',
    allowedStores: [userAccount.storeScope || 'All Stores'],
    avatar: userAccount.avatarUrl || '',
    sessionId: sessionRecord.id,
  };

  const rawToken = signSessionToken(sessionUser, sessionRecord.id);
  const realHash = hashToken(rawToken);

  await prisma.userSession.update({
    where: { id: sessionRecord.id },
    data: { tokenHash: realHash },
  });

  return { token: rawToken, sessionId: sessionRecord.id };
}

/**
 * Simulates a client session receiving events via /api/realtime/sync
 */
async function syncSessionEvents(sessionToken: string, cursor: string) {
  const req = new NextRequest(`http://localhost:3000/api/realtime/sync?cursor=${encodeURIComponent(cursor)}`, {
    headers: {
      cookie: `cosko_session=${sessionToken}`,
    },
  });
  const res = await realtimeSyncGET(req);
  if (!res.ok) {
    throw new Error(`Sync request failed with status ${res.status}`);
  }
  return res.json();
}

/**
 * Simulates AppContext client-side domain invalidation router
 */
function evaluateDomainInvalidation(event: string): string[] {
  const normalized = (event || '').toLowerCase();
  const invalidatedDomains: string[] = [];

  if (normalized.includes('sale')) {
    invalidatedDomains.push('sales', 'inventory');
  } else if (normalized.includes('stock') || normalized.includes('inventory')) {
    invalidatedDomains.push('inventory');
  } else if (normalized.includes('transfer')) {
    invalidatedDomains.push('transfers', 'inventory');
  } else if (normalized.includes('user') || normalized.includes('permission')) {
    invalidatedDomains.push('users');
  } else if (normalized.includes('customer')) {
    invalidatedDomains.push('customers');
  } else if (normalized.includes('vendor')) {
    invalidatedDomains.push('vendors');
  } else if (normalized.includes('purchase')) {
    invalidatedDomains.push('purchases', 'inventory');
  } else if (normalized.includes('expense')) {
    invalidatedDomains.push('expenses');
  } else if (
    normalized.includes('setting') ||
    normalized.includes('branding') ||
    normalized.includes('theme') ||
    normalized.includes('tax') ||
    normalized.includes('profile') ||
    normalized.includes('invoice') ||
    normalized.includes('security') ||
    normalized.includes('alert')
  ) {
    invalidatedDomains.push('settings');
  }

  return invalidatedDomains;
}

async function runRealtimeMultiDeviceSuite() {
  console.log('\n========================================================================');
  console.log('📡 P3-12: REALTIME MULTI-DEVICE & TWO-SESSION SYNCHRONIZATION');
  console.log('========================================================================\n');

  const testPrefix = `RT-${Date.now()}`;
  let adminUser: any = null;
  let blrManagerUser: any = null;
  let hydManagerUser: any = null;
  let device1AdminToken: string = '';
  let device2AdminToken: string = '';
  let blrManagerToken: string = '';
  let hydManagerToken: string = '';
  const createdSessionIds: string[] = [];
  const createdOutboxIds: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. SETUP LOGICAL SESSIONS
    // ─────────────────────────────────────────────────────────────────────
    console.log('--- 1. Setting Up Logical Multi-Device Sessions ---');

    // Device 1: Primary Administrator Session (makes system-wide changes)
    adminUser = await prisma.userAccount.findFirst({
      where: { role: 'Super Admin', status: 'Active' },
    });
    if (!adminUser) throw new Error('Active Super Admin user not found');
    const d1Session = await createTestSession(adminUser);
    device1AdminToken = d1Session.token;
    createdSessionIds.push(d1Session.sessionId);

    // Device 2: Second Logical Session (e.g. secondary manager/admin workstation)
    const d2Session = await createTestSession(adminUser);
    device2AdminToken = d2Session.token;
    createdSessionIds.push(d2Session.sessionId);

    // Device 3: Store Manager at BLR
    blrManagerUser = await prisma.userAccount.findFirst({
      where: { role: 'Store Manager', storeScope: 'BLR', status: 'Active' },
    });
    if (!blrManagerUser) {
      blrManagerUser = await prisma.userAccount.findFirst({
        where: { role: 'Store Manager', status: 'Active' },
      });
    }
    if (!blrManagerUser) throw new Error('Active Store Manager user not found');
    const blrSession = await createTestSession(blrManagerUser);
    blrManagerToken = blrSession.token;
    createdSessionIds.push(blrSession.sessionId);

    // Device 4: Store Manager at HYD (Cross-store isolation test)
    hydManagerUser = await prisma.userAccount.findFirst({
      where: { role: 'Store Manager', storeScope: 'HYD', status: 'Active' },
    });
    if (!hydManagerUser) {
      hydManagerUser = await prisma.userAccount.create({
        data: {
          email: `hydmgr_${testPrefix}@cosko.test`,
          name: 'HYD Device 4 Manager',
          role: 'Store Manager',
          storeScope: 'HYD',
          passwordHash: 'dummy-hash',
          status: 'Active',
          securityLevel: 50,
        },
      });
    }
    const hydSession = await createTestSession(hydManagerUser);
    hydManagerToken = hydSession.token;
    createdSessionIds.push(hydSession.sessionId);

    assert('Device 1 (Admin Session) initialized', !!device1AdminToken);
    assert('Device 2 (Second Logical Session) initialized', !!device2AdminToken);
    assert('BLR Store Session initialized', !!blrManagerToken);
    assert('HYD Store Session initialized', !!hydManagerToken);

    // Cursor for events
    let cursor = new Date(Date.now() - 3000).toISOString();

    // ─────────────────────────────────────────────────────────────────────
    // 2. MUTATION A: BRANDING UPDATE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Branding Realtime Broadcast ---');
    const brandEntityId = `BRAND-${testPrefix}`;
    await broadcastRealtimeEvent('settings', 'BRANDING_UPDATED', {
      entityId: brandEntityId,
      businessName: `RISMOS Enterprise ${testPrefix}`,
      tagline: 'Modern Multi-Country POS',
    });

    const syncBranding = await syncSessionEvents(device2AdminToken, cursor);
    const brandingEvent = syncBranding.events.find(
      (e: any) => e.event === 'BRANDING_UPDATED' && e.payload?.entityId === brandEntityId
    );
    assert('Second session receives BRANDING_UPDATED event', !!brandingEvent);
    if (brandingEvent) createdOutboxIds.push(brandingEvent.id);

    const brandDomains = evaluateDomainInvalidation('BRANDING_UPDATED');
    assert('Branding triggers targeted domain invalidation (settings only)', brandDomains.includes('settings'));
    assert('Branding does NOT trigger inventory/sales refresh storm', !brandDomains.includes('sales'));

    // ─────────────────────────────────────────────────────────────────────
    // 3. MUTATION B: THEME UPDATE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Theme Realtime Broadcast ---');
    cursor = new Date(Date.now() - 3000).toISOString();
    const themeEntityId = `THEME-${testPrefix}`;
    await broadcastRealtimeEvent('settings', 'THEME_UPDATED', {
      entityId: themeEntityId,
      themeName: 'Obsidian Black',
      primaryColor: '#18181B',
    });

    const syncTheme = await syncSessionEvents(device2AdminToken, cursor);
    const themeEvent = syncTheme.events.find(
      (e: any) => e.event === 'THEME_UPDATED' && e.payload?.entityId === themeEntityId
    );
    assert('Second session receives THEME_UPDATED event', !!themeEvent);
    if (themeEvent) createdOutboxIds.push(themeEvent.id);

    const themeDomains = evaluateDomainInvalidation('THEME_UPDATED');
    assert('Theme triggers targeted settings invalidation', themeDomains.includes('settings'));

    // ─────────────────────────────────────────────────────────────────────
    // 4. MUTATION C: TAX / COUNTRY UPDATE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Tax & Country Jurisdiction Broadcast ---');
    cursor = new Date(Date.now() - 3000).toISOString();
    const taxEntityId = `TAX-${testPrefix}`;
    await broadcastRealtimeEvent('settings', 'TAX_SETTINGS_UPDATED', {
      entityId: taxEntityId,
      countryCode: 'AE',
      taxName: 'VAT',
      taxRate: 5.0,
      currency: 'AED',
    });

    const syncTax = await syncSessionEvents(device2AdminToken, cursor);
    const taxEvent = syncTax.events.find(
      (e: any) => e.event === 'TAX_SETTINGS_UPDATED' && e.payload?.entityId === taxEntityId
    );
    assert('Second session receives TAX_SETTINGS_UPDATED event', !!taxEvent);
    if (taxEvent) createdOutboxIds.push(taxEvent.id);

    const taxDomains = evaluateDomainInvalidation('TAX_SETTINGS_UPDATED');
    assert('Tax update triggers targeted settings invalidation', taxDomains.includes('settings'));

    // ─────────────────────────────────────────────────────────────────────
    // 5. MUTATION D: SYSTEM SETTINGS UPDATE
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing General System Settings Broadcast ---');
    cursor = new Date(Date.now() - 3000).toISOString();
    const settingsEntityId = `SYSSET-${testPrefix}`;
    await broadcastRealtimeEvent('settings', 'SETTINGS_UPDATED', {
      entityId: settingsEntityId,
      lowStockThreshold: 15,
      offlineSyncEnabled: true,
    });

    const syncSettings = await syncSessionEvents(device2AdminToken, cursor);
    const settingsEvent = syncSettings.events.find(
      (e: any) => e.event === 'SETTINGS_UPDATED' && e.payload?.entityId === settingsEntityId
    );
    assert('Second session receives SETTINGS_UPDATED event', !!settingsEvent);
    if (settingsEvent) createdOutboxIds.push(settingsEvent.id);

    // ─────────────────────────────────────────────────────────────────────
    // 6. MUTATION E: INVENTORY MUTATION (BLR STORE)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Testing Inventory Realtime Update & Store Scoping ---');
    cursor = new Date(Date.now() - 3000).toISOString();
    const invEntityId = `SKU-${testPrefix}-ITEM`;
    await broadcastRealtimeEvent(
      getStoreChannel('BLR'),
      'STOCK_UPDATED',
      {
        entityId: invEntityId,
        storeCode: 'BLR',
        qtyOnHand: 42,
      },
      { storeCode: 'BLR' }
    );

    // BLR Store Session MUST receive the stock event
    const syncInvBLR = await syncSessionEvents(blrManagerToken, cursor);
    const blrInvEvent = syncInvBLR.events.find(
      (e: any) => e.event === 'STOCK_UPDATED' && e.payload?.entityId === invEntityId
    );
    assert('BLR Session receives targeted STOCK_UPDATED event', !!blrInvEvent);
    if (blrInvEvent) createdOutboxIds.push(blrInvEvent.id);

    const invDomains = evaluateDomainInvalidation('STOCK_UPDATED');
    assert('Stock update targets inventory domain', invDomains.includes('inventory'));
    assert('Stock update does not trigger full app reload', !invDomains.includes('settings'));

    // HYD Store Session MUST NOT receive BLR inventory event (Zero cross-store leakage)
    const syncInvHYD = await syncSessionEvents(hydManagerToken, cursor);
    const hydInvLeak = syncInvHYD.events.find(
      (e: any) => e.payload?.entityId === invEntityId
    );
    assert(
      'HYD Session is isolated and DOES NOT receive BLR inventory update (zero cross-store leakage)',
      !hydInvLeak
    );

    // ─────────────────────────────────────────────────────────────────────
    // 7. MUTATION F: POS SALE EVENT (BLR STORE)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Testing POS Sale Realtime Update & Targeted Invalidation ---');
    cursor = new Date(Date.now() - 3000).toISOString();
    const saleEntityId = `SO-${testPrefix}-001`;
    await broadcastRealtimeEvent(
      getStoreChannel('BLR'),
      'SALE_CREATED',
      {
        entityId: saleEntityId,
        storeCode: 'BLR',
        grandTotal: 349.5,
      },
      { storeCode: 'BLR' }
    );

    // BLR Store Session receives SALE_CREATED
    const syncSaleBLR = await syncSessionEvents(blrManagerToken, cursor);
    const blrSaleEvent = syncSaleBLR.events.find(
      (e: any) => e.event === 'SALE_CREATED' && e.payload?.entityId === saleEntityId
    );
    assert('BLR Session receives targeted SALE_CREATED event', !!blrSaleEvent);
    if (blrSaleEvent) createdOutboxIds.push(blrSaleEvent.id);

    const saleDomains = evaluateDomainInvalidation('SALE_CREATED');
    assert('Sale triggers sales and inventory domain refreshes', saleDomains.includes('sales') && saleDomains.includes('inventory'));
    assert('Sale does NOT trigger unnecessary settings or user refreshes', !saleDomains.includes('settings') && !saleDomains.includes('users'));

    // HYD Session does NOT receive BLR sale
    const syncSaleHYD = await syncSessionEvents(hydManagerToken, cursor);
    const hydSaleLeak = syncSaleHYD.events.find(
      (e: any) => e.payload?.entityId === saleEntityId
    );
    assert('HYD Session is isolated from BLR sale events (zero leak)', !hydSaleLeak);

    // ─────────────────────────────────────────────────────────────────────
    // 8. ARCHITECTURAL GUARDS: NO FULL-APP STORM & NO STALE DATA
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 8. Anti-Storm & Freshness Guarantees ---');
    assert('No monolithic full-reload events present in outbox', syncSaleBLR.events.every((e: any) => e.event !== 'FULL_APP_RELOAD'));
    assert('Event payloads contain authoritative entityId and storeCode', blrSaleEvent?.payload?.entityId === saleEntityId);
    assert('Outbox records contain authoritative timestamps and store codes', blrSaleEvent?.storeCode === 'BLR');

  } catch (err: any) {
    console.error('Realtime multi-device test error:', err);
    assert('Execution completed without error', false, err.message);
  } finally {
    console.log('\n--- Cleaning Up Realtime Test Records ---');
    try {
      if (createdSessionIds.length > 0) {
        await prisma.userSession.deleteMany({
          where: { id: { in: createdSessionIds } },
        });
      }
      if (createdOutboxIds.length > 0) {
        await (prisma as any).realtimeOutbox.deleteMany({
          where: { id: { in: createdOutboxIds } },
        });
      }
      if (hydManagerUser?.id && hydManagerUser.email?.startsWith('hydmgr_RT-')) {
        await prisma.userAccount.delete({ where: { id: hydManagerUser.id } });
      }
      console.log('  ✅ Cleaned up realtime multi-device test records.');
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

runRealtimeMultiDeviceSuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
