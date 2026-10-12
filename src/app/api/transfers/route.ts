import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { executeStockTransfer, CreateTransferInput } from '@/lib/services/transferService';
import { broadcastRealtimeEvent, getStoreChannel } from '@/lib/realtime';
import { validateTransferHeader, validateTransferItem } from '@/lib/stockTransferCalculations';
import { executeWithIdempotency } from '@/lib/idempotency';

/**
 * GET /api/transfers - Retrieve stock transfers with store isolation
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Super Admin only — Stock Transfers is a privileged module
    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Stock Transfers is restricted to Super Admin only' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const store = searchParams.get('store');

    const where: any = {};

    if (user.role !== 'Super Admin') {
      const allowed =
        user.allowedStores && user.allowedStores.length > 0 ? user.allowedStores : [user.store];
      if (store === 'All Stores' || store === 'ALL') {
        return NextResponse.json(
          {
            error:
              'Forbidden: Consolidated view across all stores is restricted to Super Admin only',
          },
          { status: 403 }
        );
      }
      if (store && !allowed.includes(store)) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have permission to view transfers for another store' },
          { status: 403 }
        );
      }
      if (store) {
        where.OR = [{ sourceStore: store }, { destStore: store }];
      } else {
        where.OR = [{ sourceStore: { in: allowed } }, { destStore: { in: allowed } }];
      }
    } else if (store && store !== 'All Stores' && store !== 'ALL') {
      where.OR = [{ sourceStore: store }, { destStore: store }];
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        items: {
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
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return NextResponse.json(
      { success: true, transfers },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/transfers GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve transfers' }, { status: 500 });
  }
}

/**
 * POST /api/transfers - Execute atomic stock transfer
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Super Admin only — Stock Transfers is a privileged module
    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Stock Transfers is restricted to Super Admin only' },
        { status: 403 }
      );
    }

    const body: CreateTransferInput = await req.json();

    const headerValidation = validateTransferHeader({
      sourceStore: body.sourceStore,
      destStore: body.destStore,
      itemsCount: body.items ? body.items.length : 0,
    });
    if (!headerValidation.isValid) {
      return NextResponse.json({ error: headerValidation.error }, { status: 400 });
    }

    for (const item of body.items) {
      const itemValidation = validateTransferItem({
        productId: item.productId,
        qty: item.qty,
        costPerUnit: item.costPerUnit,
        transferPricePerUnit: item.transferPricePerUnit,
      });
      if (!itemValidation.isValid) {
        return NextResponse.json({ error: itemValidation.error }, { status: 400 });
      }
    }

    // Store isolation check for Store Managers
    if (user.role !== 'Super Admin') {
      if (body.sourceStore !== user.store && !user.allowedStores?.includes(body.sourceStore)) {
        return NextResponse.json(
          {
            error: `Forbidden: You are not authorized to transfer inventory out of store "${body.sourceStore}"`,
          },
          { status: 403 }
        );
      }
    }

    const customKey =
      (body as any).idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `transfer_${body.sourceStore}_${body.destStore}_${Date.now()}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'STOCK_TRANSFER',
        key: customKey,
        userId: user.id,
        storeCode: body.sourceStore,
        extractEntityId: (d) => d?.transfer?.id || d?.transfer?.transferNo,
      },
      async () => {
        const transfer = await executeStockTransfer({
          ...body,
          requestedBy: user.name,
        });

        const transferPayload = {
          transferNo: (transfer as any)?.transferNo,
          sourceStore: body.sourceStore,
          destStore: body.destStore,
          action: 'created',
        };

        await broadcastRealtimeEvent('transfers', 'TRANSFER_COMPLETED', transferPayload);
        if (body.sourceStore) {
          await broadcastRealtimeEvent(
            getStoreChannel(body.sourceStore),
            'TRANSFER_COMPLETED',
            transferPayload
          );
          await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', {
            storeCode: body.sourceStore,
          });
          await broadcastRealtimeEvent(getStoreChannel(body.sourceStore), 'STOCK_UPDATED', {
            storeCode: body.sourceStore,
          });
        }
        if (body.destStore) {
          await broadcastRealtimeEvent(
            getStoreChannel(body.destStore),
            'TRANSFER_COMPLETED',
            transferPayload
          );
          await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', { storeCode: body.destStore });
          await broadcastRealtimeEvent(getStoreChannel(body.destStore), 'STOCK_UPDATED', {
            storeCode: body.destStore,
          });
        }

        return { status: 201, data: { success: true, transfer } };
      }
    );
  } catch (error: any) {
    console.error('API /api/transfers POST error:', error);
    const msg = error?.message || '';
    const isTechnical =
      msg.includes('prisma') ||
      msg.includes('timeout') ||
      msg.includes('invocation') ||
      msg.includes('SQL') ||
      msg.includes('Transaction');
    const userFriendlyError = isTechnical
      ? 'Stock transfer could not be completed. No inventory was changed. Please try again.'
      : msg || 'Stock transfer could not be completed. No inventory was changed. Please try again.';

    return NextResponse.json({ error: userFriendlyError }, { status: 400 });
  }
}

/**
 * PUT /api/transfers - Update transfer status or cancel transfer with inventory reversal
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Stock Transfers is restricted to Super Admin only' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Transfer ID is required' }, { status: 400 });
    }

    const existing = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    const isCancelling =
      (existing.status === 'Received' ||
        existing.status === 'Completed' ||
        existing.status === 'In Transit') &&
      status === 'Cancelled';

    const updatedTransfer = await prisma.$transaction(
      async (tx: any) => {
        if (isCancelling && existing.items && existing.items.length > 0) {
          // Reverse inventory: Return to sourceStore, Deduct from destStore
          const productIds = existing.items.map((it: any) => it.productId);
          const [sourceInventories, destInventories] = await Promise.all([
            tx.inventory.findMany({
              where: { storeCode: existing.sourceStore, productId: { in: productIds } },
            }),
            tx.inventory.findMany({
              where: { storeCode: existing.destStore, productId: { in: productIds } },
            }),
          ]);
          const srcInvMap = new Map<string, any>(
            sourceInventories.map((i: any) => [i.productId, i])
          );
          const dstInvMap = new Map<string, any>(destInventories.map((i: any) => [i.productId, i]));

          const inventoryOps: Promise<any>[] = [];
          const ledgerEntries: any[] = [];

          for (const it of existing.items) {
            const srcPrevQty = srcInvMap.get(it.productId)?.qtyOnHand || 0;
            const srcNewQty = srcPrevQty + it.qty;

            inventoryOps.push(
              tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: it.productId, storeCode: existing.sourceStore },
                },
                create: {
                  productId: it.productId,
                  storeCode: existing.sourceStore,
                  qtyOnHand: srcNewQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: { increment: it.qty } },
              })
            );

            ledgerEntries.push({
              productId: it.productId,
              storeCode: existing.sourceStore,
              refNo: existing.transferNo,
              type: 'TRANSFER_CANCEL_RETURN',
              qtyChange: it.qty,
              costPerUnit: it.costPerUnit,
              sellingPricePerUnit: it.transferPricePerUnit,
              balanceAfter: srcNewQty,
              notes: `Transfer ${existing.transferNo} cancelled. Restocked to ${existing.sourceStore}`,
              createdBy: user.name,
            });

            const dstPrevQty = dstInvMap.get(it.productId)?.qtyOnHand || 0;
            const dstNewQty = Math.max(0, dstPrevQty - it.qty);

            inventoryOps.push(
              tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: it.productId, storeCode: existing.destStore },
                },
                create: {
                  productId: it.productId,
                  storeCode: existing.destStore,
                  qtyOnHand: dstNewQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: dstNewQty },
              })
            );

            ledgerEntries.push({
              productId: it.productId,
              storeCode: existing.destStore,
              refNo: existing.transferNo,
              type: 'TRANSFER_CANCEL_REVERSAL',
              qtyChange: -it.qty,
              costPerUnit: it.costPerUnit,
              sellingPricePerUnit: it.transferPricePerUnit,
              balanceAfter: dstNewQty,
              notes: `Transfer ${existing.transferNo} cancelled. Reversed from ${existing.destStore}`,
              createdBy: user.name,
            });
          }

          await Promise.all(inventoryOps);
          await tx.inventoryLedger.createMany({ data: ledgerEntries });

          await tx.auditLog.create({
            data: {
              module: 'Stock Transfers',
              action: 'Cancel Transfer',
              details: `Cancelled transfer ${existing.transferNo} and reversed ${existing.items.length} line items between ${existing.sourceStore} and ${existing.destStore}`,
              userEmail: user.email || user.name,
              userRole: user.role,
              storeCode: existing.sourceStore,
            },
          });
        }

        const updated = await tx.stockTransfer.update({
          where: { id },
          data: {
            ...(status ? { status } : {}),
            ...(notes !== undefined ? { notes } : {}),
          },
        });

        return updated;
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const transferPayload = {
      transferNo: existing.transferNo,
      action: 'status_updated',
      sourceStore: existing.sourceStore,
      destStore: existing.destStore,
    };
    await broadcastRealtimeEvent('transfers', 'TRANSFER_COMPLETED', transferPayload);
    if (existing.sourceStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.sourceStore),
        'TRANSFER_COMPLETED',
        transferPayload
      );
    }
    if (existing.destStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.destStore),
        'TRANSFER_COMPLETED',
        transferPayload
      );
    }
    if (isCancelling) {
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', {
        storeCode: existing.sourceStore,
      });
      await broadcastRealtimeEvent(getStoreChannel(existing.sourceStore), 'STOCK_UPDATED', {
        storeCode: existing.sourceStore,
      });
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', { storeCode: existing.destStore });
      await broadcastRealtimeEvent(getStoreChannel(existing.destStore), 'STOCK_UPDATED', {
        storeCode: existing.destStore,
      });
    }

    return NextResponse.json({
      success: true,
      transfer: updatedTransfer,
      message: `Transfer ${existing.transferNo} updated to ${status}.`,
    });
  } catch (error: any) {
    console.error('API /api/transfers PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update transfer' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transfers - Cancel & reverse completed transfer or delete draft
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Stock Transfers is restricted to Super Admin only' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Transfer ID is required' }, { status: 400 });
    }

    const existing = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
        message: 'Transfer already removed or non-existent',
      });
    }

    // Safe cancel and reverse inventory
    const cancelled = await prisma.$transaction(
      async (tx: any) => {
        if (
          (existing.status === 'Received' ||
            existing.status === 'Completed' ||
            existing.status === 'In Transit') &&
          existing.items &&
          existing.items.length > 0
        ) {
          const productIds = existing.items.map((it: any) => it.productId);
          const [sourceInventories, destInventories] = await Promise.all([
            tx.inventory.findMany({
              where: { storeCode: existing.sourceStore, productId: { in: productIds } },
            }),
            tx.inventory.findMany({
              where: { storeCode: existing.destStore, productId: { in: productIds } },
            }),
          ]);
          const srcInvMap = new Map<string, any>(
            sourceInventories.map((i: any) => [i.productId, i])
          );
          const dstInvMap = new Map<string, any>(destInventories.map((i: any) => [i.productId, i]));

          const inventoryOps: Promise<any>[] = [];
          const ledgerEntries: any[] = [];

          for (const it of existing.items) {
            const srcPrevQty = srcInvMap.get(it.productId)?.qtyOnHand || 0;
            const srcNewQty = srcPrevQty + it.qty;

            inventoryOps.push(
              tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: it.productId, storeCode: existing.sourceStore },
                },
                create: {
                  productId: it.productId,
                  storeCode: existing.sourceStore,
                  qtyOnHand: srcNewQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: { increment: it.qty } },
              })
            );

            ledgerEntries.push({
              productId: it.productId,
              storeCode: existing.sourceStore,
              refNo: existing.transferNo,
              type: 'TRANSFER_CANCEL_RETURN',
              qtyChange: it.qty,
              costPerUnit: it.costPerUnit,
              sellingPricePerUnit: it.transferPricePerUnit,
              balanceAfter: srcNewQty,
              notes: `Transfer ${existing.transferNo} cancelled. Restocked to ${existing.sourceStore}`,
              createdBy: user.name,
            });

            const dstPrevQty = dstInvMap.get(it.productId)?.qtyOnHand || 0;
            const dstNewQty = Math.max(0, dstPrevQty - it.qty);

            inventoryOps.push(
              tx.inventory.upsert({
                where: {
                  productId_storeCode: { productId: it.productId, storeCode: existing.destStore },
                },
                create: {
                  productId: it.productId,
                  storeCode: existing.destStore,
                  qtyOnHand: dstNewQty,
                  reorderPt: 5,
                },
                update: { qtyOnHand: dstNewQty },
              })
            );

            ledgerEntries.push({
              productId: it.productId,
              storeCode: existing.destStore,
              refNo: existing.transferNo,
              type: 'TRANSFER_CANCEL_REVERSAL',
              qtyChange: -it.qty,
              costPerUnit: it.costPerUnit,
              sellingPricePerUnit: it.transferPricePerUnit,
              balanceAfter: dstNewQty,
              notes: `Transfer ${existing.transferNo} cancelled. Reversed from ${existing.destStore}`,
              createdBy: user.name,
            });
          }

          await Promise.all(inventoryOps);
          await tx.inventoryLedger.createMany({ data: ledgerEntries });
        }

        const updated = await tx.stockTransfer.update({
          where: { id },
          data: { status: 'Cancelled' },
        });

        await tx.auditLog.create({
          data: {
            module: 'Stock Transfers',
            action: 'Cancel Transfer',
            details: `Cancelled transfer ${existing.transferNo} and reversed stock between ${existing.sourceStore} and ${existing.destStore}`,
            userEmail: user.email || user.name,
            userRole: user.role,
            storeCode: existing.sourceStore,
          },
        });

        return updated;
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const delTransferPayload = {
      transferNo: existing.transferNo,
      action: 'cancelled',
      sourceStore: existing.sourceStore,
      destStore: existing.destStore,
    };
    await broadcastRealtimeEvent('transfers', 'TRANSFER_COMPLETED', delTransferPayload);
    if (existing.sourceStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.sourceStore),
        'TRANSFER_COMPLETED',
        delTransferPayload
      );
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', {
        storeCode: existing.sourceStore,
      });
      await broadcastRealtimeEvent(getStoreChannel(existing.sourceStore), 'STOCK_UPDATED', {
        storeCode: existing.sourceStore,
      });
    }
    if (existing.destStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(existing.destStore),
        'TRANSFER_COMPLETED',
        delTransferPayload
      );
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', { storeCode: existing.destStore });
      await broadcastRealtimeEvent(getStoreChannel(existing.destStore), 'STOCK_UPDATED', {
        storeCode: existing.destStore,
      });
    }

    return NextResponse.json({
      success: true,
      mode: 'archived',
      transfer: cancelled,
      message: `Transfer ${existing.transferNo} cancelled and stock reversed.`,
    });
  } catch (error: any) {
    console.error('API /api/transfers DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel transfer' },
      { status: 500 }
    );
  }
}
