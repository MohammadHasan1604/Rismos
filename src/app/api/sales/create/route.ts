import { NextRequest, NextResponse } from 'next/server';
import { executePOSCheckout, CreateSaleInput } from '@/lib/services/salesService';
import { authenticateRequest, hasPermission, validatePhysicalStore } from '@/lib/authPipeline';

/**
 * POST /api/sales/create
 * Backward-compatibility adapter delegating to the single canonical executePOSCheckout engine.
 * Never independently calculates tax, cost, profit, inventory or sequence.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'sales.create')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const effectiveStore = (body.storeCode || user.store || 'BLR').toUpperCase();

    // Store scope enforcement
    if (user.role !== 'Super Admin' && effectiveStore !== user.store) {
      return NextResponse.json(
        {
          error: `Store Scope Lock: Cannot execute sales for store ${effectiveStore}. Assigned store is ${user.store}.`,
        },
        { status: 403 }
      );
    }

    if (user.role === 'Super Admin') {
      const storeVal = await validatePhysicalStore(effectiveStore);
      if (!storeVal.valid) {
        return NextResponse.json({ error: storeVal.error }, { status: 400 });
      }
    }

    const checkoutInput: CreateSaleInput = {
      storeCode: effectiveStore,
      customerId: body.customerId,
      customerName: body.customerName || 'Walk-in Customer',
      customerPhone: body.customerPhone || '9999999999',
      items: Array.isArray(body.items)
        ? body.items.map((it: any) => ({
            productId: it.productId || it.id,
            productName: it.productName || it.name || 'Product',
            sku: it.sku || `SKU-${it.productId || it.id}`,
            qty: Number(it.qty || 1),
            unitPrice: Number(it.unitPrice || it.price || 0),
            discountPercent: Number(it.discountPercent || 0),
          }))
        : [],
      taxAmount: body.taxAmount,
      discountAmount: body.discountAmount || 0,
      paymentMethod: body.paymentMethod || 'Cash',
      referenceNo: body.referenceNo,
      paymentProofUrl: body.paymentProofUrl,
      cashierName: user.name || body.cashierName || 'POS Cashier',
      photos: body.photos,
      idempotencyKey: body.idempotencyKey,
    };

    const sale = await executePOSCheckout(checkoutInput);

    return NextResponse.json({
      success: true,
      invoiceNumber: sale.orderNo,
      salesOrderNo: sale.orderNo,
      saleId: sale.id,
      sale,
    });
  } catch (error: any) {
    console.error('[SALES-CREATE] Adapter delegation failed:', error);
    const statusCode = error.statusCode || 500;
    return NextResponse.json(
      { error: error.message || 'Checkout failed', details: error?.message || 'Internal error' },
      { status: statusCode }
    );
  }
}
