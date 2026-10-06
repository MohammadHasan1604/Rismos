import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getNextSequenceNumber } from '@/lib/atomicSequence';
import { authenticateRequest } from '@/lib/authPipeline';

/**
 * POST /api/sales/create
 * High-concurrency atomic checkout endpoint with zero sequence collision.
 * Uses MySQL row-locking via `getNextSequenceNumber('CS')`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const authUser = auth.user;

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { items, paymentMethod, storeCode, customerName, customerPhone, referenceNo, paymentProofUrl } = body;

    const effectiveStore = storeCode || authUser?.store || 'BLR';
    const effectiveCashier = authUser?.name || 'POS Cashier';

    // Atomic race-condition proof sequence generation
    const salesOrderNo = await getNextSequenceNumber('CS');

    const subtotal = Array.isArray(items)
      ? items.reduce((acc: number, it: any) => acc + Number(it.unitPrice || it.price || 0) * Number(it.qty || 1), 0)
      : 0;
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
    const grandTotal = subtotal + taxAmount;

    // Create sale in MySQL with guaranteed unique invoice number
    const sale = await prisma.salesOrder.create({
      data: {
        orderNo: salesOrderNo,
        storeCode: effectiveStore,
        customerName: customerName || 'Walk-in Customer',
        customerPhone: customerPhone || '9999999999',
        subtotal,
        taxAmount,
        discountAmount: 0,
        grandTotal,
        totalCost: Math.round(subtotal * 0.7 * 100) / 100,
        grossProfit: Math.round((grandTotal - subtotal * 0.7) * 100) / 100,
        paymentMethod: paymentMethod || 'Cash',
        referenceNo: referenceNo || null,
        paymentProofUrl: paymentProofUrl || null,
        status: 'Completed',
        cashierName: effectiveCashier,
        items: Array.isArray(items) && items.length > 0
          ? {
              create: items.map((it: any) => ({
                productId: it.productId || it.id,
                productName: it.productName || it.name || 'Retail Item',
                sku: it.sku || `SKU-${Date.now().toString().slice(-4)}`,
                qty: Number(it.qty || 1),
                unitPrice: Number(it.unitPrice || it.price || 0),
                unitCost: Number(it.unitCost || (it.unitPrice || 0) * 0.7),
                lineTotal: Number(it.unitPrice || it.price || 0) * Number(it.qty || 1),
                lineProfit: (Number(it.unitPrice || it.price || 0) - Number(it.unitCost || 0)) * Number(it.qty || 1),
              })),
            }
          : undefined,
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json({
      success: true,
      invoiceNumber: salesOrderNo,
      salesOrderNo,
      saleId: sale.id,
      sale,
    });
  } catch (error: any) {
    console.error('[SALES] Atomic creation failed:', error);
    return NextResponse.json(
      { error: 'Checkout failed', details: error?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
