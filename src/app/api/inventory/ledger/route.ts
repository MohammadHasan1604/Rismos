import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/inventory/ledger - Retrieve authoritative inventory movement ledger records
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const store = searchParams.get('store');
    const productId = searchParams.get('productId');
    const refNo = searchParams.get('refNo');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    const where: any = {};

    // Store isolation for non-Super Admin users
    if (user.role !== 'Super Admin') {
      if (store && store !== user.store && !user.allowedStores?.includes(store)) {
        return NextResponse.json(
          {
            error: `Forbidden: You do not have permission to view inventory ledger for store "${store}"`,
          },
          { status: 403 }
        );
      }
      where.storeCode = user.store;
    } else if (store && store !== 'All Stores') {
      where.storeCode = store;
    }

    if (productId) where.productId = productId;
    if (refNo) where.refNo = { contains: refNo };

    const ledgerEntries = await prisma.inventoryLedger.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            brand: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return NextResponse.json(
      { success: true, ledger: ledgerEntries },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/inventory/ledger GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve inventory ledger' }, { status: 500 });
  }
}
