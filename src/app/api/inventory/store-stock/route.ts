import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/inventory/store-stock?sku=... or ?productId=...
 * Dynamically fetches the root real-time inventory quantity for every active store
 * from the database, guaranteeing 0-stock stores are included and future stores
 * are automatically supported without hardcoding.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict Cross-Store Isolation: Cross-store inventory breakdown is SUPER ADMIN ONLY
    if (user.role !== 'Super Admin' || user.securityLevel < 100) {
      return NextResponse.json(
        { error: 'Forbidden: Cross-store inventory breakdown is restricted to Super Admin only.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku')?.trim();
    const productId = searchParams.get('productId')?.trim() || searchParams.get('id')?.trim();

    if (!sku && !productId) {
      return NextResponse.json({ error: 'SKU or productId is required' }, { status: 400 });
    }

    // 1. Fetch authoritative product record with all inventory allocations
    const product = await prisma.product.findFirst({
      where: productId ? { id: productId } : { sku: sku! },
      include: {
        inventoryItems: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // 2. Fetch all ACTIVE stores dynamically from the root database
    const activeStores = await prisma.storeHub.findMany({
      where: { status: 'Active' },
    });

    // Sort CENTRAL warehouse to the top, then alphabetically by code
    activeStores.sort((a, b) => {
      if (a.code === 'CENTRAL') return -1;
      if (b.code === 'CENTRAL') return 1;
      return a.code.localeCompare(b.code);
    });

    // 3. Map real-time stock across every active store (including 0-stock locations)
    let totalStock = 0;
    const storeBreakdown = activeStores.map((store) => {
      const inv = product.inventoryItems.find(
        (i) => i.storeCode.toUpperCase() === store.code.toUpperCase()
      );
      const qtyOnHand = inv ? inv.qtyOnHand : 0;
      const qtyReserved = inv ? inv.qtyReserved : 0;
      const reorderPt = inv ? inv.reorderPt : 5;
      const shelfLoc = inv?.shelfLoc || null;
      totalStock += qtyOnHand;

      // Friendly display location name
      let cleanLocationName = store.city || store.name;
      if (store.code === 'CENTRAL') {
        cleanLocationName = 'Central';
      } else if (
        store.name.toLowerCase().includes('bengaluru') ||
        store.name.toLowerCase().includes('bangalore')
      ) {
        cleanLocationName = 'Bangalore';
      } else if (store.name.toLowerCase().includes('hyderabad')) {
        cleanLocationName = 'Hyderabad';
      } else if (store.name.toLowerCase().includes('mumbai')) {
        cleanLocationName = 'Mumbai';
      } else if (store.name.toLowerCase().includes('delhi')) {
        cleanLocationName = 'Delhi';
      }

      return {
        storeId: store.id,
        storeCode: store.code,
        storeName: store.name,
        displayName: cleanLocationName,
        city: store.city,
        address: store.address,
        phone: store.phone,
        qtyOnHand,
        qtyReserved,
        reorderPt,
        shelfLoc,
        status: store.status,
        inStock: qtyOnHand > 0,
        isLowStock: qtyOnHand > 0 && qtyOnHand <= reorderPt,
        updatedAt: inv?.updatedAt || null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        product: {
          id: product.id,
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          baseCostPrice: Number(product.baseCostPrice),
          baseSellingPrice: Number(product.baseSellingPrice),
          mrp: product.mrp !== null ? Number(product.mrp) : null,
          imageUrl: product.imageUrl,
        },
        totalStock,
        activeStoresCount: activeStores.length,
        stores: storeBreakdown,
        timestamp: new Date().toISOString(),
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/inventory/store-stock error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve store stock breakdown' },
      { status: 500 }
    );
  }
}
