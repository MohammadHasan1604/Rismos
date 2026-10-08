import { prisma } from '../db';
import { broadcastRealtimeEvent } from '../realtime';
import { generateSafeSequenceNo } from '../sequenceUtils';
import {
  calculateTransferTotals,
  validateTransferHeader,
  validateTransferItem,
  formatTransferAmount,
} from '../stockTransferCalculations';
import { TaxService } from './taxService';

export interface CreateTransferInput {
  sourceStore: string;
  destStore: string;
  requestedBy: string;
  notes?: string;
  items: {
    productId: string;
    qty: number;
    costPerUnit: number;
    transferPricePerUnit: number;
  }[];
}

/**
 * Executes Inter-Store Stock Transfer using atomic MySQL transaction, recording custom transfer price snapshots
 * and gross Central Profit without inflating consolidated company profit.
 */
export async function executeStockTransfer(input: CreateTransferInput) {
  const sourceStore = input.sourceStore ? input.sourceStore.trim().toUpperCase() : '';
  const destStore = input.destStore ? input.destStore.trim().toUpperCase() : '';

  const headerValidation = validateTransferHeader({
    sourceStore,
    destStore,
    itemsCount: input.items ? input.items.length : 0,
  });
  if (!headerValidation.isValid) {
    throw new Error(headerValidation.error);
  }

  // Pre-validate all items before transaction
  for (const item of input.items) {
    if (!item.productId) {
      throw new Error('Product ID is required for all transfer line items.');
    }
    const itemValidation = validateTransferItem({
      productId: item.productId,
      qty: item.qty,
      costPerUnit: item.costPerUnit,
      transferPricePerUnit: item.transferPricePerUnit,
    });
    if (!itemValidation.isValid) {
      throw new Error(`Product ${item.productId}: ${itemValidation.error}`);
    }
  }

  // Authoritative centralized calculations
  const totals = calculateTransferTotals(input.items);
  const totalUnits = totals.totalUnits;
  const totalCost = totals.totalCost;
  const totalTransferValue = totals.totalTransferValue;
  const grossProfit = totals.grossProfit;

  const productIds = input.items.map((item) => item.productId);
  const preparedItems = totals.items.map((calc, idx) => ({
    productId: input.items[idx].productId,
    qty: calc.qty,
    costPerUnit: calc.costPerUnit,
    transferPricePerUnit: calc.transferPricePerUnit,
    lineTotalCost: calc.lineTotalCost,
    lineTotalValue: calc.lineTotalValue,
    lineProfit: calc.lineProfit,
  }));

  // Generate transfer number safely using collision-proof sequence generator
  const transferNo = await generateSafeSequenceNo('stockTransfer', 'transferNo', 'TRF-2026-', 4);

  // Execute atomic database changes with serverless-safe 45s timeout
  const transfer = await prisma.$transaction(
    async (tx: any) => {
      // 1. Batch fetch all source and destination inventory rows in parallel
      const [sourceInventories, destInventories] = await Promise.all([
        tx.inventory.findMany({
          where: {
            storeCode: sourceStore,
            productId: { in: productIds },
          },
        }),
        tx.inventory.findMany({
          where: {
            storeCode: destStore,
            productId: { in: productIds },
          },
        }),
      ]);

      const sourceInvMap = new Map<string, any>(
        sourceInventories.map((inv: any) => [inv.productId, inv])
      );
      const destInvMap = new Map<string, any>(
        destInventories.map((inv: any) => [inv.productId, inv])
      );

      // 2. Pre-verify all items have sufficient stock before making any updates
      for (const item of preparedItems) {
        const sourceInv = sourceInvMap.get(item.productId);
        const availableQty = sourceInv ? sourceInv.qtyOnHand : 0;
        if (availableQty < item.qty) {
          throw new Error(
            `Insufficient stock at ${sourceStore} for product ID ${item.productId}. Available: ${availableQty}, Requested: ${item.qty}`
          );
        }
      }

      // 3. Create Stock Transfer master & items snapshot
      const createdTransfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          sourceStore,
          destStore,
          status: 'Received',
          requestedBy: input.requestedBy,
          receivedBy: input.requestedBy,
          totalUnits,
          totalCost,
          totalTransferValue,
          grossProfit,
          notes: input.notes || null,
          items: {
            create: preparedItems,
          },
        },
        include: {
          items: true,
        },
      });

      // 4. Update Source & Destination Inventory rows concurrently
      const ledgerEntries: any[] = [];
      const inventoryUpdates: Promise<any>[] = [];

      for (const item of preparedItems) {
        const sourceInv = sourceInvMap.get(item.productId);
        const currentSourceQty = sourceInv ? sourceInv.qtyOnHand : 0;
        const newSourceQty = currentSourceQty - item.qty;

        inventoryUpdates.push(
          tx.inventory.update({
            where: { productId_storeCode: { productId: item.productId, storeCode: sourceStore } },
            data: { qtyOnHand: newSourceQty },
          })
        );

        ledgerEntries.push({
          productId: item.productId,
          storeCode: sourceStore,
          refNo: transferNo,
          type: 'Stock Transfer Out',
          qtyChange: -item.qty,
          costPerUnit: item.costPerUnit,
          sellingPricePerUnit: item.transferPricePerUnit,
          balanceAfter: newSourceQty,
          notes: `Transferred to ${destStore} (${transferNo})`,
          createdBy: input.requestedBy,
        });

        const destInv = destInvMap.get(item.productId);
        const currentDestQty = destInv ? destInv.qtyOnHand : 0;
        const newDestQty = currentDestQty + item.qty;

        inventoryUpdates.push(
          tx.inventory.upsert({
            where: { productId_storeCode: { productId: item.productId, storeCode: destStore } },
            create: {
              productId: item.productId,
              storeCode: destStore,
              qtyOnHand: newDestQty,
              reorderPt: 5,
            },
            update: { qtyOnHand: newDestQty },
          })
        );

        ledgerEntries.push({
          productId: item.productId,
          storeCode: destStore,
          refNo: transferNo,
          type: 'Stock Transfer In',
          qtyChange: item.qty,
          costPerUnit: item.transferPricePerUnit,
          sellingPricePerUnit: item.transferPricePerUnit,
          balanceAfter: newDestQty,
          notes: `Received from ${sourceStore} (${transferNo})`,
          createdBy: input.requestedBy,
        });
      }

      await Promise.all(inventoryUpdates);

      // 5. Batch create all inventory ledger entries in a single query
      await tx.inventoryLedger.createMany({
        data: ledgerEntries,
      });

      const taxContext = await TaxService.resolveTaxContext(sourceStore);
      const trfCurrency = taxContext.currencyCode || 'INR';

      // 6. Record Double-Entry Financial Ledger Entries atomically in a single batched query
      await tx.financialLedgerEntry.createMany({
        data: [
          {
            entryNo: `JRN-TRF-MKP-${transferNo}`,
            entryDate: new Date(),
            storeCode: sourceStore,
            accountCategory: 'TRANSFER_MARKUP',
            accountName: 'Central Stock Transfer Markup',
            debit: grossProfit < 0 ? Math.abs(grossProfit) : 0,
            credit: grossProfit >= 0 ? grossProfit : 0,
            amount: grossProfit,
            refType: 'STOCK_TRANSFER',
            refId: createdTransfer.id,
            refNo: transferNo,
            currencyCode: trfCurrency,
            description: `Internal Transfer Margin from ${sourceStore} to ${destStore} (${transferNo})`,
            isEliminated: true,
            createdBy: input.requestedBy,
          },
          {
            entryNo: `JRN-TRF-CLR-${transferNo}`,
            entryDate: new Date(),
            storeCode: sourceStore,
            accountCategory: 'ASSET',
            accountName: 'Inter-Store Clearing Account',
            debit: totalTransferValue,
            credit: 0,
            amount: totalTransferValue,
            refType: 'STOCK_TRANSFER',
            refId: createdTransfer.id,
            refNo: transferNo,
            currencyCode: trfCurrency,
            description: `Inter-store transfer clearing to ${destStore} (${transferNo})`,
            isEliminated: true,
            createdBy: input.requestedBy,
          },
          {
            entryNo: `JRN-TRF-SRC-${transferNo}`,
            entryDate: new Date(),
            storeCode: sourceStore,
            accountCategory: 'ASSET',
            accountName: 'Inventory Asset (Inter-Store Dispatch)',
            debit: 0,
            credit: totalCost,
            amount: -totalCost,
            refType: 'STOCK_TRANSFER',
            refId: createdTransfer.id,
            refNo: transferNo,
            currencyCode: trfCurrency,
            description: `Stock dispatched from ${sourceStore} to ${destStore} (${transferNo})`,
            isEliminated: true,
            createdBy: input.requestedBy,
          },
          {
            entryNo: `JRN-TRF-DST-${transferNo}`,
            entryDate: new Date(),
            storeCode: destStore,
            accountCategory: 'ASSET',
            accountName: 'Inventory Asset (Store Inbound Receipt)',
            debit: totalTransferValue,
            credit: 0,
            amount: totalTransferValue,
            refType: 'STOCK_TRANSFER',
            refId: createdTransfer.id,
            refNo: transferNo,
            currencyCode: trfCurrency,
            description: `Stock received at ${destStore} from ${sourceStore} at Transfer Price (${transferNo})`,
            isEliminated: true,
            createdBy: input.requestedBy,
          },
          {
            entryNo: `JRN-TRF-DST-CLR-${transferNo}`,
            entryDate: new Date(),
            storeCode: destStore,
            accountCategory: 'LIABILITY',
            accountName: 'Inter-Store Payable Clearing',
            debit: 0,
            credit: totalTransferValue,
            amount: totalTransferValue,
            refType: 'STOCK_TRANSFER',
            refId: createdTransfer.id,
            refNo: transferNo,
            currencyCode: trfCurrency,
            description: `Inter-store transfer payable clearing for receipt from ${sourceStore} (${transferNo})`,
            isEliminated: true,
            createdBy: input.requestedBy,
          },
        ],
      });

      // 7. Record Audit Log Entry
      await tx.auditLog.create({
        data: {
          module: 'Central Profit',
          action: 'Execute Stock Transfer',
          details: `Dispatched ${totalUnits} units from ${sourceStore} to ${destStore} (Transfer Value: ${formatTransferAmount(totalTransferValue, { currencyCode: taxContext.currencyCode, currencySymbol: taxContext.currencySymbol })}, Central Profit: ${formatTransferAmount(grossProfit, { showPositiveSign: true, currencyCode: taxContext.currencyCode, currencySymbol: taxContext.currencySymbol })})`,
          userEmail: input.requestedBy,
          userRole: 'Super Admin',
          storeCode: sourceStore,
        },
      });

      return createdTransfer;
    },
    {
      maxWait: 15000,
      timeout: 45000,
    }
  );

  // 7. Fire realtime broadcasts AFTER transaction commit
  try {
    await broadcastRealtimeEvent('transfers', 'TRANSFER_COMPLETED', {
      transferNo,
      sourceStore,
      destStore,
    });
    await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', { storeCode: sourceStore });
    await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', { storeCode: destStore });
  } catch (socketErr) {
    console.warn('Realtime broadcast notification failed (non-critical):', socketErr);
  }

  return transfer;
}
