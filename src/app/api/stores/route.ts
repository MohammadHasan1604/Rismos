import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, hasPermission, createAuditLog } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';
import { executeWithIdempotency } from '@/lib/idempotency';

let cachedStoresPayload: any = null;
let lastStoresCacheTime = 0;
const STORES_CACHE_TTL = 60_000;

function invalidateStoresCache() {
  cachedStoresPayload = null;
  lastStoresCacheTime = 0;
}

/**
 * GET /api/stores - Retrieve all store hubs (excludes Inactive by default)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const forceFresh = searchParams.get('fresh') === 'true';

    const where: any = {};
    if (!includeInactive) {
      where.status = { not: 'Inactive' };
    }

    // RBAC: Non-Super Admin can ONLY view their assigned store(s)
    if (user.role !== 'Super Admin') {
      const allowed =
        user.allowedStores && user.allowedStores.length > 0 ? user.allowedStores : [user.store];
      where.code = { in: allowed };
    } else if (
      !includeInactive &&
      !forceFresh &&
      cachedStoresPayload &&
      Date.now() - lastStoresCacheTime < STORES_CACHE_TTL
    ) {
      return NextResponse.json(cachedStoresPayload, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const stores = await prisma.storeHub.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const payload = { success: true, stores };

    if (user.role === 'Super Admin' && !includeInactive) {
      cachedStoresPayload = payload;
      lastStoresCacheTime = Date.now();
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('API /api/stores GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve store hubs' }, { status: 500 });
  }
}

/**
 * POST /api/stores - Create or update store hub (Super Admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role !== 'Super Admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const body = await req.json();

    if (!body.code || !body.name || !body.city) {
      return NextResponse.json(
        { error: 'Store Code, Name, and City are required' },
        { status: 400 }
      );
    }

    const upperCode = body.code.toUpperCase().trim();
    if (upperCode === 'ALL' || body.name.toLowerCase().trim() === 'all stores') {
      return NextResponse.json(
        {
          error:
            '"All Stores" is a reporting/aggregation scope only and cannot be created as a physical store.',
        },
        { status: 400 }
      );
    }

    // Protect CENTRAL status: must always remain Active
    const storeStatus = upperCode === 'CENTRAL' ? 'Active' : body.status || 'Active';

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `store_${upperCode}_${Date.now()}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'UPSERT_STORE',
        key: customKey,
        userId: user.id,
        storeCode: upperCode,
        extractEntityId: (d) => d?.store?.id || d?.store?.code,
      },
      async () => {
        const ownerVal =
          body.ownerName !== undefined
            ? body.ownerName
            : body.owner !== undefined
              ? body.owner
              : body.managerName !== undefined
                ? body.managerName
                : body.manager;

        const store = await prisma.storeHub.upsert({
          where: { code: upperCode },
          create: {
            code: upperCode,
            name:
              upperCode === 'CENTRAL'
                ? body.name || 'Central Warehouse & Owner Stock'
                : body.name,
            city: body.city,
            address: body.address || 'Retail Hub',
            ownerName: ownerVal || null,
            managerName: ownerVal || null,
            phone: body.phone || null,
            status: storeStatus,
          },
          update: {
            name: body.name,
            city: body.city,
            address: body.address || undefined,
            ownerName: ownerVal !== undefined ? ownerVal || null : undefined,
            managerName: ownerVal !== undefined ? ownerVal || null : undefined,
            phone: body.phone || undefined,
            status: upperCode === 'CENTRAL' ? 'Active' : body.status || undefined,
          },
        });

        invalidateStoresCache();
        await broadcastRealtimeEvent('stores', 'STORE_UPDATED', {
          code: store.code,
          name: store.name,
          action: 'saved',
        });

        return { status: 201, data: { success: true, store } };
      }
    );
  } catch (error: any) {
    console.error('API /api/stores POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save store hub' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/stores - Update store hub details (delegates to upsert POST)
 */
export async function PUT(req: NextRequest) {
  return POST(req);
}

/**
 * DELETE /api/stores - Safe Deactivate or Permanent Delete for unused store hubs
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role !== 'Super Admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Store ID or Code is required' }, { status: 400 });
    }

    let target = await prisma.storeHub.findUnique({ where: { id } }).catch(() => null);
    if (!target) {
      target = await prisma.storeHub.findFirst({
        where: {
          OR: [{ id }, { code: id }, { code: id.toUpperCase() }],
        },
      });
    }

    if (!target) {
      return NextResponse.json({ success: true, message: 'Store already removed or non-existent' });
    }

    // STRICT PROTECTION: CENTRAL cannot be deleted or deactivated under any circumstances
    if (target.code === 'CENTRAL') {
      return NextResponse.json(
        {
          error:
            'The default Central Warehouse & Owner Store (CENTRAL) is permanent and cannot be deactivated or deleted.',
        },
        { status: 400 }
      );
    }

    // Check store transaction & inventory history
    const [invCount, salesCount, poCount, transferCount] = await Promise.all([
      prisma.inventory.count({ where: { storeCode: target.code } }),
      prisma.salesOrder.count({ where: { storeCode: target.code } }),
      prisma.purchaseOrder.count({ where: { storeCode: target.code } }),
      prisma.stockTransfer.count({
        where: { OR: [{ sourceStore: target.code }, { destStore: target.code }] },
      }),
    ]);

    const hasHistory = invCount > 0 || salesCount > 0 || poCount > 0 || transferCount > 0;

    if (hasHistory || !permanent) {
      const store = await prisma.storeHub.update({
        where: { id: target.id },
        data: { status: 'Inactive' },
      });

      invalidateStoresCache();
      await broadcastRealtimeEvent('stores', 'STORE_UPDATED', {
        code: target.code,
        name: target.name,
        action: 'deactivated',
      });

      return NextResponse.json({
        success: true,
        mode: 'archived',
        store,
        hasHistory,
        message: hasHistory
          ? `Store Hub "${target.name}" (${target.code}) has active business records (${invCount} inventory items, ${salesCount} sales) and was deactivated safely.`
          : `Store Hub "${target.name}" deactivated.`,
      });
    }

    // Hard-delete if 0 history
    await prisma.userStoreAssignment.deleteMany({ where: { storeCode: target.code } });
    await prisma.storeHub.delete({ where: { id: target.id } });

    invalidateStoresCache();
    await broadcastRealtimeEvent('stores', 'STORE_UPDATED', {
      code: target.code,
      name: target.name,
      action: 'deleted',
    });

    return NextResponse.json({
      success: true,
      mode: 'deleted',
      message: `Store Hub "${target.name}" (${target.code}) permanently deleted.`,
    });
  } catch (error: any) {
    console.error('API /api/stores DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate/delete store' },
      { status: 500 }
    );
  }
}
