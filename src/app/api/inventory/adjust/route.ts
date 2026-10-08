import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  validatePhysicalStore,
} from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent, getStoreChannel, persistOutboxEvent } from '@/lib/realtime';

import { executeWithIdempotency } from '@/lib/idempotency';
import { verifySensitiveAction } from '@/lib/sensitiveAction';
import { TaxService } from '@/lib/services/taxService';

/**
 * POST /api/inventory/adjust - Atomic stock adjustment with ledger entry and idempotency protection
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'inventory.adjust')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions for stock adjustment' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const targetStore = body.storeCode || body.store || user.store;

    if (targetStore === 'All Stores' || targetStore === 'ALL') {
      return NextResponse.json(
        {
          error:
            '"All Stores" is a reporting scope only. Adjustments must target a physical store.',
        },
        { status: 400 }
      );
    }

    // ─── Authoritative Store-Scope Enforcement ────────────────────────────
    if (user.securityLevel < 100) {
      if (
        targetStore &&
        targetStore.trim().toUpperCase() !== (user.store || '').trim().toUpperCase()
      ) {
        return NextResponse.json(
          {
            error: `Forbidden: As ${user.role}, you are restricted to store "${user.store}". Cross-store adjustment on "${targetStore}" is denied.`,
          },
          { status: 403 }
        );
      }
    }

    if (!body.productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Support either qtyChange or explicit newQty
    let resolvedQtyChange = body.qtyChange;
    if (resolvedQtyChange === undefined && body.newQty !== undefined) {
      const existingInv = await prisma.inventory.findUnique({
        where: {
          productId_storeCode: {
            productId: body.productId,
            storeCode: user.securityLevel >= 100 ? targetStore : user.store,
          },
        },
      });
      resolvedQtyChange = Number(body.newQty) - (existingInv?.qtyOnHand || 0);
    }

    if (resolvedQtyChange === undefined || resolvedQtyChange === 0) {
      return NextResponse.json(
        { error: 'A non-zero qtyChange or changing newQty is required' },
        { status: 400 }
      );
    }

    // 🔒 Enforce Server-Authoritative Step-Up Authentication for Stock Write-Offs / Loss Adjustments
    if (resolvedQtyChange < 0) {
      const stepUp = await verifySensitiveAction(req, body, user, 'STOCK_WRITEOFF');
      if (!stepUp.allowed) {
        return NextResponse.json(
          { error: stepUp.error, stepUpRequired: stepUp.stepUpRequired },
          { status: stepUp.status || 403 }
        );
      }
    }

    body.qtyChange = resolvedQtyChange;
    body.storeCode = targetStore;

    let effectiveStoreCode: string;
    if (user.securityLevel >= 100) {
      const validated = await validatePhysicalStore(body.storeCode);
      if (!validated.valid) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      effectiveStoreCode = validated.storeCode!;
    } else {
      effectiveStoreCode = user.store;
    }

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `adj_${body.productId}_${effectiveStoreCode}_${body.qtyChange}_${Date.now()}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'INVENTORY_ADJUSTMENT',
        key: customKey,
        userId: user.id,
        storeCode: effectiveStoreCode,
      },
      async () => {
        const result = await prisma.$transaction(
          async (tx: any) => {
            const inv = await tx.inventory.findUnique({
              where: {
                productId_storeCode: {
                  productId: body.productId,
                  storeCode: effectiveStoreCode,
                },
              },
            });

            const currentQty = inv ? inv.qtyOnHand : 0;
            const newQty = Math.max(0, currentQty + body.qtyChange);

            await tx.inventory.upsert({
              where: {
                productId_storeCode: {
                  productId: body.productId,
                  storeCode: effectiveStoreCode,
                },
              },
              create: {
                productId: body.productId,
                storeCode: effectiveStoreCode,
                qtyOnHand: newQty,
              },
              update: { qtyOnHand: newQty },
            });

            const product = await tx.product.findUnique({
              where: { id: body.productId },
              select: { baseCostPrice: true, sku: true, name: true },
            });

            const refNo = `ADJ-${Date.now().toString().slice(-8)}`;

            await tx.inventoryLedger.create({
              data: {
                productId: body.productId,
                storeCode: effectiveStoreCode,
                refNo,
                type: 'Stock Adjustment',
                qtyChange: body.qtyChange,
                costPerUnit: Number(product?.baseCostPrice) || 0,
                balanceAfter: newQty,
                notes: body.reason || 'Manual stock adjustment',
                createdBy: user.name,
              },
            });

            // Financial Ledger entry for stock adjustment
            const unitCost = Number(product?.baseCostPrice) || 0;
            const absQty = Math.abs(body.qtyChange);
            const financialImpact = Math.round(absQty * unitCost * 100) / 100;
            const taxContext = await TaxService.resolveTaxContext(effectiveStoreCode);
            const adjCurrency = taxContext.currencyCode || 'INR';

            if (financialImpact > 0) {
              if (body.qtyChange < 0) {
                await tx.financialLedgerEntry.createMany({
                  data: [
                    {
                      entryNo: `JRN-ADJ-LOSS-${refNo}`,
                      entryDate: new Date(),
                      storeCode: effectiveStoreCode,
                      accountCategory: 'OPERATING_EXPENSE',
                      accountName: 'Inventory Shrinkage & Spoilage Expense',
                      debit: financialImpact,
                      credit: 0,
                      amount: financialImpact,
                      refType: 'INVENTORY_ADJUSTMENT',
                      refId: body.productId,
                      refNo,
                      currencyCode: adjCurrency,
                      description: `Stock adjustment loss for ${product?.name || body.productId}: ${body.reason || 'Damage/Shrinkage'}`,
                      createdBy: user.name,
                    },
                    {
                      entryNo: `JRN-ADJ-INVA-${refNo}`,
                      entryDate: new Date(),
                      storeCode: effectiveStoreCode,
                      accountCategory: 'ASSET',
                      accountName: 'Inventory Asset (Shrinkage Write-Down)',
                      debit: 0,
                      credit: financialImpact,
                      amount: -financialImpact,
                      refType: 'INVENTORY_ADJUSTMENT',
                      refId: body.productId,
                      refNo,
                      currencyCode: adjCurrency,
                      description: `Stock asset write-down for ${product?.name || body.productId}`,
                      createdBy: user.name,
                    },
                  ],
                });
              } else {
                await tx.financialLedgerEntry.createMany({
                  data: [
                    {
                      entryNo: `JRN-ADJ-GAIN-${refNo}`,
                      entryDate: new Date(),
                      storeCode: effectiveStoreCode,
                      accountCategory: 'REVENUE',
                      accountName: 'Inventory Count Surplus & Gain',
                      debit: 0,
                      credit: financialImpact,
                      amount: financialImpact,
                      refType: 'INVENTORY_ADJUSTMENT',
                      refId: body.productId,
                      refNo,
                      currencyCode: adjCurrency,
                      description: `Stock surplus audit gain for ${product?.name || body.productId}`,
                      createdBy: user.name,
                    },
                    {
                      entryNo: `JRN-ADJ-INVA-${refNo}`,
                      entryDate: new Date(),
                      storeCode: effectiveStoreCode,
                      accountCategory: 'ASSET',
                      accountName: 'Inventory Asset (Surplus Stock In)',
                      debit: financialImpact,
                      credit: 0,
                      amount: financialImpact,
                      refType: 'INVENTORY_ADJUSTMENT',
                      refId: body.productId,
                      refNo,
                      currencyCode: adjCurrency,
                      description: `Stock asset write-up for ${product?.name || body.productId}`,
                      createdBy: user.name,
                    },
                  ],
                });
              }
            }

            await tx.auditLog.create({
              data: {
                module: 'Inventory',
                action: 'Stock Adjustment',
                details: `Adjusted ${product?.name || body.productId} (${product?.sku || 'N/A'}) by ${body.qtyChange > 0 ? '+' : ''}${body.qtyChange} at ${effectiveStoreCode}. New balance: ${newQty}. Reason: ${body.reason || 'Manual adjustment'}`,
                userEmail: user.email || user.name,
                userRole: user.role,
                storeCode: effectiveStoreCode,
              },
            });

            // Atomically persist durable outbox event inside same transaction
            await persistOutboxEvent(
              getStoreChannel(effectiveStoreCode),
              'STOCK_UPDATED',
              {
                storeCode: effectiveStoreCode,
                productId: body.productId,
              },
              tx
            );

            return { newQty, refNo };
          },
          { maxWait: 15000, timeout: 45000 }
        );

        const stockPayload = {
          storeCode: effectiveStoreCode,
          productId: body.productId,
        };
        await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', stockPayload, {
          skipOutbox: true,
        });
        if (effectiveStoreCode) {
          await broadcastRealtimeEvent(
            getStoreChannel(effectiveStoreCode),
            'STOCK_UPDATED',
            stockPayload,
            { skipOutbox: true }
          );
        }

        return {
          status: 200,
          data: {
            success: true,
            newQty: result.newQty,
            refNo: result.refNo,
          },
        };
      }
    );
  } catch (error: any) {
    console.error('API /api/inventory/adjust POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to adjust stock' }, { status: 500 });
  }
}
