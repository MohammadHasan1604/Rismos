import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executePOSCheckout, CreateSaleInput } from '@/lib/services/salesService';
import { broadcastRealtimeEvent, getStoreChannel } from '@/lib/realtime';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  requireStoreScope,
  validatePhysicalStore,
} from '@/lib/authPipeline';
import { validatePaymentMethod } from '@/lib/paymentValidator';
import { verifySensitiveAction } from '@/lib/sensitiveAction';

/**
 * GET /api/sales - Retrieve sales orders with store isolation and financial privacy
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const requestedStore = searchParams.get('store');

    // Authoritative Store Scope Enforcement
    const storeScope = requireStoreScope(user, requestedStore, {
      allowAllStoresForSuperAdmin: true,
    });
    if (!storeScope.authorized) {
      return NextResponse.json({ error: storeScope.error }, { status: storeScope.status });
    }

    const whereClause: any = {};
    if (!storeScope.isAllStores && storeScope.physicalStoreCode) {
      whereClause.storeCode = storeScope.physicalStoreCode;
    }

    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    const sales = await prisma.salesOrder.findMany({
      where: whereClause,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Financial Privacy: Non-Super-Admin and Sales Manager must NOT see cost prices or profit margins
    const isSalesManager = user.role === 'Sales Manager' || user.securityLevel <= 40;
    const sanitizedSales = isSalesManager
      ? sales.map((sale) => ({
          ...sale,
          totalCost: 0,
          grossProfit: 0,
          items: sale.items?.map((item) => ({
            ...item,
            unitCost: 0,
            lineProfit: 0,
          })),
        }))
      : sales;

    return NextResponse.json(
      { success: true, sales: sanitizedSales },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/sales GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve sales records' }, { status: 500 });
  }
}

import { executeWithIdempotency } from '@/lib/idempotency';

/**
 * POST /api/sales - Execute POS Checkout atomically with database-backed idempotency
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'sales.create')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body: CreateSaleInput = await req.json();

    if (body.storeCode === 'All Stores' || body.storeCode === 'ALL') {
      return NextResponse.json(
        {
          error:
            '"All Stores" is a reporting scope only. Sales must be processed under a real store outlet or Central Warehouse.',
        },
        { status: 400 }
      );
    }

    // Authoritative cashier store authorization
    if (user.role !== 'Super Admin') {
      if (body.storeCode !== user.store) {
        return NextResponse.json(
          {
            error: `Store Scope Lock: Cashier cannot execute sales for store ${body.storeCode}. Assigned store is ${user.store}.`,
          },
          { status: 403 }
        );
      }
    } else {
      const storeVal = await validatePhysicalStore(body.storeCode);
      if (!storeVal.valid) {
        return NextResponse.json({ error: storeVal.error }, { status: 400 });
      }
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'Cart cannot be empty' }, { status: 400 });
    }

    // Validate item quantities and required fields
    for (const item of body.items) {
      if (!item.productId || typeof item.qty !== 'number' || item.qty <= 0) {
        return NextResponse.json(
          { error: `Invalid cart item: Product ID and positive quantity are required.` },
          { status: 400 }
        );
      }
    }

    // Strict Canonical Payment Method Enforcement (Cash, UPI, Other)
    const paymentValidation = validatePaymentMethod(body.paymentMethod);
    if (!paymentValidation.valid) {
      return NextResponse.json({ error: paymentValidation.error }, { status: 400 });
    }
    body.paymentMethod = paymentValidation.normalized!;

    // MANDATORY PROOF & REFERENCE VALIDATION (ROOT FIX - ZERO BYPASS)
    const effectiveProofUrl =
      body.paymentProofUrl || (body.photos && body.photos.length > 0 ? body.photos[0] : null);
    if (!effectiveProofUrl || !String(effectiveProofUrl).trim()) {
      return NextResponse.json(
        {
          error:
            'Payment proof is mandatory! Please upload a receipt or transaction screenshot before completing sale checkout.',
        },
        { status: 400 }
      );
    }
    // Auto-generate internal transaction audit reference if omitted
    if (!body.referenceNo || !String(body.referenceNo).trim()) {
      body.referenceNo = `TXN-${body.storeCode}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    const itemFingerprint = body.items
      .map((i) => `${i.productId}:${i.qty}:${i.unitPrice}`)
      .join('|');
    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `${user.id}_${body.storeCode}_${itemFingerprint}_${Math.floor(Date.now() / 4000)}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'POS_CHECKOUT',
        key: customKey,
        userId: user.id,
        storeCode: body.storeCode,
        extractEntityId: (data) => data?.sale?.id || data?.sale?.orderNo,
      },
      async () => {
        // Pre-resolve customerId if missing to keep interactive transaction fast
        if (!body.customerId && body.customerPhone && body.customerPhone.trim()) {
          try {
            const existingCust = await prisma.customer.findFirst({
              where: { phone: body.customerPhone },
              select: { id: true },
            });
            if (existingCust) {
              body.customerId = existingCust.id;
            }
          } catch (custErr) {
            console.warn('[POST /api/sales] Customer pre-resolution notice:', custErr);
          }
        }

        const sale = await executePOSCheckout({
          ...body,
          cashierName: user.name,
        });

        const storeCode = (sale as any)?.storeCode || body.storeCode;
        const salePayload = {
          orderId: (sale as any)?.id,
          orderNo: (sale as any)?.orderNo,
          storeCode,
          grandTotal: (sale as any)?.total,
          cashierName: (sale as any)?.cashierName,
        };

        // Broadcast sale event to global and store-scoped channels (skipOutbox since committed in tx)
        await broadcastRealtimeEvent('sales', 'SALE_CREATED', salePayload, { skipOutbox: true });
        if (storeCode) {
          await broadcastRealtimeEvent(getStoreChannel(storeCode), 'SALE_CREATED', salePayload, {
            skipOutbox: true,
          });
        }

        // Broadcast stock update event so devices invalidate/refetch inventory (skipOutbox since committed in tx)
        const stockPayload = {
          storeCode,
          reason: 'SALE_CHECKOUT',
          orderNo: (sale as any)?.orderNo,
        };
        await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', stockPayload, {
          skipOutbox: true,
        });
        if (storeCode) {
          await broadcastRealtimeEvent(getStoreChannel(storeCode), 'STOCK_UPDATED', stockPayload, {
            skipOutbox: true,
          });
        }

        const isSalesManager = user.role === 'Sales Manager' || user.securityLevel <= 40;
        const sanitizedSale = isSalesManager
          ? {
              ...sale,
              totalCost: 0,
              grossProfit: 0,
              items: (sale as any)?.items?.map((it: any) => ({
                ...it,
                unitCost: 0,
                lineProfit: 0,
              })),
            }
          : sale;

        return { status: 201, data: { success: true, sale: sanitizedSale } };
      }
    );
  } catch (error: any) {
    console.error('API /api/sales POST error:', error);
    const status =
      error.statusCode ||
      error.status ||
      (error.message?.includes('Insufficient stock') ? 409 : 500);
    return NextResponse.json(
      { error: error.message || 'Failed to process checkout transaction' },
      { status }
    );
  }
}

/**
 * PUT /api/sales - Update sales order status (e.g. Void/Refund) and restock inventory
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'sales.cancel') && !hasPermission(user, 'sales.refund')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to modify sales orders' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status, notes, paymentMethod } = body;

    if (!id) {
      return NextResponse.json({ error: 'Sales Order ID is required' }, { status: 400 });
    }

    if (paymentMethod) {
      const pmName = String(paymentMethod).trim();
      const pmRecord = await prisma.paymentMethod.findFirst({
        where: { name: pmName },
      });
      if (pmRecord && pmRecord.status === 'Inactive') {
        return NextResponse.json(
          {
            error: `Payment method "${pmName}" is currently deactivated. Please select an active payment method.`,
          },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Sales order not found' }, { status: 404 });
    }

    // Check store scope
    if (user.role !== 'Super Admin' && user.store !== existing.storeCode) {
      return NextResponse.json(
        { error: 'Store Scope Lock: You cannot modify orders from another store' },
        { status: 403 }
      );
    }

    const isVoidingOrRefunding =
      existing.status === 'Completed' &&
      (status === 'Cancelled' || status === 'Refunded' || status === 'Voided');

    // 🔒 Enforce Server-Authoritative Step-Up Authentication for Void/Refund
    if (isVoidingOrRefunding) {
      const stepUp = await verifySensitiveAction(
        req,
        body,
        user,
        status === 'Refunded' ? 'REFUND' : 'VOID_SALE'
      );
      if (!stepUp.allowed) {
        return NextResponse.json(
          { error: stepUp.error, stepUpRequired: stepUp.stepUpRequired },
          { status: stepUp.status || 403 }
        );
      }
    }

    const updatedSale = await prisma.$transaction(
      async (tx: any) => {
        // If voiding or refunding a completed sale, restock inventory and revert customer totals
        if (isVoidingOrRefunding && existing.items && existing.items.length > 0) {
          const productIds = existing.items.map((it: any) => it.productId);
          const invRecords = await tx.inventory.findMany({
            where: { storeCode: existing.storeCode, productId: { in: productIds } },
          });
          const invMap = new Map<string, any>(invRecords.map((r: any) => [r.productId, r]));

          // Concurrently upsert inventory balances with atomic increment
          await Promise.all(
            existing.items.map((item: any) => {
              const prev = invMap.get(item.productId);
              const newQty = (prev?.qtyOnHand || 0) + item.qty;
              return tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: item.productId, storeCode: existing.storeCode },
                },
                create: {
                  productId: item.productId,
                  storeCode: existing.storeCode,
                  qtyOnHand: newQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: { increment: item.qty } },
              });
            })
          );

          // Batch create inventory ledger entries
          await tx.inventoryLedger.createMany({
            data: existing.items.map((item: any) => {
              const prev = invMap.get(item.productId);
              const newQty = (prev?.qtyOnHand || 0) + item.qty;
              return {
                productId: item.productId,
                storeCode: existing.storeCode,
                refNo: existing.orderNo,
                type: 'POS Sale Refund / Void In',
                qtyChange: item.qty,
                costPerUnit: item.unitCost,
                sellingPricePerUnit: item.unitPrice,
                balanceAfter: newQty,
                notes: `Order ${existing.orderNo} ${status} by ${user.name}`,
                createdBy: user.name,
              };
            }),
          });

          // Decrement customer total spend if linked
          if (existing.customerId) {
            const profile = await tx.customerStoreProfile.findUnique({
              where: {
                customerId_storeCode: {
                  customerId: existing.customerId,
                  storeCode: existing.storeCode,
                },
              },
            });
            if (profile) {
              await tx.customerStoreProfile.update({
                where: { id: profile.id },
                data: {
                  totalSpent: Math.max(0, Number(profile.totalSpent) - Number(existing.grandTotal)),
                  totalOrders: Math.max(0, (profile.totalOrders || 1) - 1),
                },
              });
            }
          }

          // Record Financial Ledger Reversal Entries in a single batched query
          const netRev = Number(existing.subtotal) - Number(existing.discountAmount || 0);
          const taxAmt = Number(existing.taxAmount || 0);
          const gTotal = Number(existing.grandTotal);
          const cogsAmt = Number(existing.totalCost);

          const saleCurrency = (existing as any).currencyCode || 'INR';

          const financialEntries: any[] = [
            {
              entryNo: `JRN-VOID-REV-${existing.orderNo}-${Date.now().toString().slice(-4)}`,
              entryDate: new Date(),
              storeCode: existing.storeCode,
              accountCategory: 'REVENUE',
              accountName: 'Sales Returns & Refunds',
              debit: netRev,
              credit: 0,
              amount: -netRev,
              refType: 'SALE',
              refId: existing.id,
              refNo: existing.orderNo,
              currencyCode: saleCurrency,
              entityName: existing.customerName || 'Customer',
              description: `Order ${existing.orderNo} ${status} reversal by ${user.name}`,
              createdBy: user.name,
            },
            {
              entryNo: `JRN-VOID-ASST-${existing.orderNo}-${Date.now().toString().slice(-4)}`,
              entryDate: new Date(),
              storeCode: existing.storeCode,
              accountCategory: 'ASSET',
              accountName: `Cash / Bank Refund (${existing.paymentMethod})`,
              debit: 0,
              credit: gTotal,
              amount: -gTotal,
              refType: 'SALE',
              refId: existing.id,
              refNo: existing.orderNo,
              currencyCode: saleCurrency,
              entityName: existing.customerName || 'Customer',
              description: `Refund payout for Order ${existing.orderNo}`,
              createdBy: user.name,
            },
          ];

          if (taxAmt > 0) {
            financialEntries.push({
              entryNo: `JRN-VOID-TAX-${existing.orderNo}-${Date.now().toString().slice(-4)}`,
              entryDate: new Date(),
              storeCode: existing.storeCode,
              accountCategory: 'LIABILITY',
              accountName: 'GST Output Tax Liability (Reversal)',
              debit: taxAmt,
              credit: 0,
              amount: -taxAmt,
              refType: 'SALE',
              refId: existing.id,
              refNo: existing.orderNo,
              currencyCode: saleCurrency,
              entityName: existing.customerName || 'Customer',
              description: `GST Reversal on Order ${existing.orderNo} ${status}`,
              createdBy: user.name,
            });
          }

          if (cogsAmt > 0) {
            financialEntries.push(
              {
                entryNo: `JRN-VOID-COGS-${existing.orderNo}-${Date.now().toString().slice(-4)}`,
                entryDate: new Date(),
                storeCode: existing.storeCode,
                accountCategory: 'COGS',
                accountName: 'Cost of Goods Sold (Reversal)',
                debit: 0,
                credit: cogsAmt,
                amount: -cogsAmt,
                refType: 'SALE',
                refId: existing.id,
                refNo: existing.orderNo,
                currencyCode: saleCurrency,
                entityName: existing.customerName || 'Customer',
                description: `COGS Reversal on Order ${existing.orderNo} ${status}`,
                createdBy: user.name,
              },
              {
                entryNo: `JRN-VOID-INVR-${existing.orderNo}-${Date.now().toString().slice(-4)}`,
                entryDate: new Date(),
                storeCode: existing.storeCode,
                accountCategory: 'ASSET',
                accountName: 'Inventory Asset (Restocked)',
                debit: cogsAmt,
                credit: 0,
                amount: cogsAmt,
                refType: 'SALE',
                refId: existing.id,
                refNo: existing.orderNo,
                currencyCode: saleCurrency,
                entityName: existing.customerName || 'Customer',
                description: `Stock Restocked for Voided/Refunded Order ${existing.orderNo}`,
                createdBy: user.name,
              }
            );
          }

          await tx.financialLedgerEntry.createMany({ data: financialEntries });

          // Log to Audit Log
          await tx.auditLog.create({
            data: {
              module: 'Sales',
              action: `Order ${status}`,
              details: `Voided/refunded invoice ${existing.orderNo} (${Number(existing.grandTotal).toFixed(2)}) and restocked ${existing.items.length} item line(s) into ${existing.storeCode}`,
              userEmail: user.email || user.name,
              userRole: user.role,
              storeCode: existing.storeCode,
            },
          });
        }

        const sale = await tx.salesOrder.update({
          where: { id },
          data: {
            ...(status ? { status } : {}),
            ...(paymentMethod ? { paymentMethod } : {}),
          },
          include: { items: true },
        });

        return sale;
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const salePayload = {
      id: updatedSale.id,
      orderNo: updatedSale.orderNo,
      status: updatedSale.status,
      storeCode: existing.storeCode,
    };
    await broadcastRealtimeEvent('sales', 'SALE_UPDATED', salePayload);
    if (existing.storeCode) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.storeCode),
        'SALE_UPDATED',
        salePayload
      );
    }
    if (isVoidingOrRefunding) {
      const stockPayload = { storeCode: existing.storeCode, reason: 'SALE_REFUND' };
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', stockPayload);
      if (existing.storeCode) {
        await broadcastRealtimeEvent(
          getStoreChannel(existing.storeCode),
          'STOCK_UPDATED',
          stockPayload
        );
      }
    }

    return NextResponse.json({
      success: true,
      sale: updatedSale,
      message: `Invoice ${existing.orderNo} updated to ${status}. ${isVoidingOrRefunding ? 'Inventory items successfully restocked.' : ''}`,
    });
  } catch (error: any) {
    console.error('API /api/sales PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update sales order' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sales - Void/Cancel a sales order safely or delete
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'sales.cancel')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to void sales orders' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Sales Order ID is required' }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
        message: 'Sales order already removed or non-existent',
      });
    }

    // Check store scope
    if (user.role !== 'Super Admin' && user.store !== existing.storeCode) {
      return NextResponse.json(
        { error: 'Store Scope Lock: You cannot delete orders from another store' },
        { status: 403 }
      );
    }

    // Always safe-cancel completed sales orders rather than erasing historical financial records
    const cancelled = await prisma.$transaction(
      async (tx: any) => {
        if (existing.status === 'Completed' && existing.items && existing.items.length > 0) {
          const productIds = existing.items.map((it: any) => it.productId);
          const invRecords = await tx.inventory.findMany({
            where: { storeCode: existing.storeCode, productId: { in: productIds } },
          });
          const invMap = new Map<string, any>(invRecords.map((r: any) => [r.productId, r]));

          // Concurrently upsert inventory balances with atomic increment
          await Promise.all(
            existing.items.map((item: any) => {
              const prev = invMap.get(item.productId);
              const newQty = (prev?.qtyOnHand || 0) + item.qty;
              return tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: item.productId, storeCode: existing.storeCode },
                },
                create: {
                  productId: item.productId,
                  storeCode: existing.storeCode,
                  qtyOnHand: newQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: { increment: item.qty } },
              });
            })
          );

          // Batch create inventory ledger entries
          await tx.inventoryLedger.createMany({
            data: existing.items.map((item: any) => {
              const prev = invMap.get(item.productId);
              const newQty = (prev?.qtyOnHand || 0) + item.qty;
              return {
                productId: item.productId,
                storeCode: existing.storeCode,
                refNo: existing.orderNo,
                type: 'POS Sale Refund / Void In',
                qtyChange: item.qty,
                costPerUnit: item.unitCost,
                sellingPricePerUnit: item.unitPrice,
                balanceAfter: newQty,
                notes: `Order ${existing.orderNo} Voided by ${user.name}`,
                createdBy: user.name,
              };
            }),
          });

          if (existing.customerId) {
            const profile = await tx.customerStoreProfile.findUnique({
              where: {
                customerId_storeCode: {
                  customerId: existing.customerId,
                  storeCode: existing.storeCode,
                },
              },
            });
            if (profile) {
              await tx.customerStoreProfile.update({
                where: { id: profile.id },
                data: {
                  totalSpent: Math.max(0, Number(profile.totalSpent) - Number(existing.grandTotal)),
                  totalOrders: Math.max(0, (profile.totalOrders || 1) - 1),
                },
              });
            }
          }
        }

        const updated = await tx.salesOrder.update({
          where: { id },
          data: { status: 'Cancelled' },
        });

        await tx.auditLog.create({
          data: {
            module: 'Sales',
            action: 'Void Sales Order',
            details: `Voided and cancelled sales order ${existing.orderNo} (Total: ${Number(existing.grandTotal).toFixed(2)}) and restocked inventory items`,
            userEmail: user.email || user.name,
            userRole: user.role,
            storeCode: existing.storeCode,
          },
        });

        return updated;
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const cancelSalePayload = {
      id: existing.id,
      orderNo: existing.orderNo,
      status: 'Cancelled',
      storeCode: existing.storeCode,
    };
    await broadcastRealtimeEvent('sales', 'SALE_UPDATED', cancelSalePayload);
    if (existing.storeCode) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.storeCode),
        'SALE_UPDATED',
        cancelSalePayload
      );
    }
    const cancelStockPayload = { storeCode: existing.storeCode, reason: 'SALE_VOID' };
    await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', cancelStockPayload);
    if (existing.storeCode) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.storeCode),
        'STOCK_UPDATED',
        cancelStockPayload
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'archived',
      sale: cancelled,
      message: `Invoice ${existing.orderNo} successfully voided and stock restored to ${existing.storeCode}.`,
    });
  } catch (error: any) {
    console.error('API /api/sales DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to void sales order' },
      { status: 500 }
    );
  }
}
