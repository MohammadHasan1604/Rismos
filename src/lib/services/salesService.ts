import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { broadcastRealtimeEvent, getStoreChannel } from '../realtime';
import { generateSafeSequenceNo } from '../sequenceUtils';
import { validatePaymentMethod } from '../paymentValidator';
import { TaxService } from './taxService';

export interface CreateSaleInput {
  storeCode: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  items: {
    productId: string;
    productName: string;
    sku: string;
    qty: number;
    unitPrice: number;
    unitCost?: number;
    discountPercent?: number;
    taxRate?: number;
  }[];
  taxAmount?: number;
  discountAmount?: number;
  paymentMethod: string;
  referenceNo?: string;
  paymentProofUrl?: string;
  cashierName: string;
  photos?: string[];
  idempotencyKey?: string;
}

/**
 * Executes a POS Sale Checkout using atomic MySQL transaction, generating sequential invoice number
 * and reducing store inventory with concurrency protection.
 *
 * Security & Integrity Guarantees:
 * 1. Authoritative DB Cost: Ignores client unitCost and retrieves real product baseCostPrice from database.
 * 2. Concurrency-Safe Stock Validation: Strictly enforces stock availability; throws 409 on insufficient stock (no clamping).
 * 3. Atomic Stock Decrement: Uses atomic decrement on database inventory records.
 * 4. Double-entry financial and inventory ledger tracking.
 * 5. International Tax Engine & Snapshot: Resolves jurisdiction tax regime and creates immutable financial snapshots.
 */
export async function executePOSCheckout(input: CreateSaleInput) {
  // Validate payment method strictly
  const paymentValidation = validatePaymentMethod(input.paymentMethod);
  if (!paymentValidation.valid) {
    const err: any = new Error(paymentValidation.error);
    err.statusCode = 400;
    throw err;
  }
  const paymentMethod = paymentValidation.normalized!;

  const storeCode = input.storeCode.toUpperCase();
  const productIds = Array.from(new Set(input.items.map((it) => it.productId)));

  // Authoritative Cost and Tax Rate Resolution from Database (Ignore malicious client unitCost)
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, baseCostPrice: true, sku: true, name: true, gstRate: true },
  });
  const productMap = new Map<string, any>(dbProducts.map((p) => [p.id, p]));

  // Authoritative Tax Context Resolution
  const taxContext = await TaxService.resolveTaxContext(storeCode);

  const lineTaxItems = input.items.map((item) => {
    const dbProduct = productMap.get(item.productId);
    return {
      productId: item.productId,
      productName: item.productName || dbProduct?.name || 'Product',
      sku: item.sku || dbProduct?.sku || item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || 0,
      productTaxRate:
        item.taxRate !== undefined && item.taxRate !== null
          ? Number(item.taxRate)
          : dbProduct?.gstRate !== undefined && dbProduct?.gstRate !== null
            ? Number(dbProduct.gstRate)
            : null,
      hsnSac: null,
    };
  });

  const taxResult = TaxService.calculateTransactionTax(
    lineTaxItems,
    taxContext,
    Number(input.discountAmount) || 0
  );

  const subtotal = taxResult.subtotal;
  const taxAmount = taxResult.taxAmount;
  const discountAmount = taxResult.discountAmount;
  const grandTotal = taxResult.grandTotal;
  const netSalesRevenue = taxResult.netSalesRevenue;
  const taxCollected = taxAmount;
  const discount = discountAmount;

  let totalCost = 0;
  const preparedItems = taxResult.lines.map((taxLine) => {
    const dbProduct = productMap.get(taxLine.productId);
    const authoritativeUnitCost = dbProduct ? Number(dbProduct.baseCostPrice) || 0 : 0;
    const lineCost = Math.round(taxLine.qty * authoritativeUnitCost * 100) / 100;
    const lineProfit = Math.round((taxLine.lineSubtotal - lineCost) * 100) / 100;

    totalCost += lineCost;

    return {
      productId: taxLine.productId,
      productName: taxLine.productName,
      sku: taxLine.sku,
      qty: taxLine.qty,
      unitPrice: taxLine.unitPrice,
      unitCost: authoritativeUnitCost,
      discountPercent: taxLine.discountPercent,
      lineTotal: taxLine.lineTotal,
      lineProfit,
      taxRate: taxLine.taxRate,
      taxAmount: taxLine.taxAmount,
      hsnSac: taxLine.hsnSac || null,
    };
  });

  totalCost = Math.round(totalCost * 100) / 100;
  const COGS = totalCost;
  // P0-2: Gross Profit = Net Tax-Exclusive Sales Revenue - COGS
  const grossProfit = Math.round((netSalesRevenue - COGS) * 100) / 100;
  const netRevenue = netSalesRevenue;


  const storeNumericMap: Record<string, string> = {
    BLR: '001',
    HYD: '002',
    DEL: '003',
    MUM: '004',
    CENTRAL: '000',
  };
  const store3Digit = storeNumericMap[storeCode] || storeCode.slice(0, 3);
  const invoicePrefix = `CS26${store3Digit}`;
  const effectiveProofUrl =
    input.paymentProofUrl || (input.photos && input.photos.length > 0 ? input.photos[0] : null);
  if (!effectiveProofUrl || !String(effectiveProofUrl).trim()) {
    const err: any = new Error(
      'Payment proof is mandatory! Please upload a valid receipt or transaction screenshot.'
    );
    err.statusCode = 400;
    throw err;
  }
  const effectiveRefNo =
    input.referenceNo && String(input.referenceNo).trim()
      ? String(input.referenceNo).trim()
      : `TXN-${store3Digit}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Execute atomic interactive transaction with configured timeouts
  const result = await prisma.$transaction(
    async (tx: any) => {
      // 1. Generate store-specific invoice number with collision safety (e.g. CS260011, CS260012)
      const orderNo = await generateSafeSequenceNo('salesOrder', 'orderNo', invoicePrefix, 1, tx);

      // 2. Lock and batch read all inventory records for the cart items with FOR UPDATE row locking
      const invRecords = await tx.$queryRaw<Array<{ id: string; product_id: string; store_code: string; qty_on_hand: number }>>`
        SELECT id, product_id, store_code, qty_on_hand
        FROM inventory
        WHERE store_code = ${storeCode} AND product_id IN (${Prisma.join(productIds)})
        FOR UPDATE
      `;
      const invMap = new Map<string, any>(
        invRecords.map((r: any) => [r.product_id, { id: r.id, qtyOnHand: Number(r.qty_on_hand) }])
      );

      // PREVENT OVERSELLING: Strict concurrency-safe availability check
      for (const item of input.items) {
        const existing = invMap.get(item.productId);
        const availableQty = existing ? existing.qtyOnHand : 0;
        if (!existing || availableQty < item.qty) {
          const err: any = new Error(
            `Insufficient stock for "${item.productName || item.sku}": available ${availableQty}, requested ${item.qty}`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // 3. Atomically decrement inventory balances with conditional non-negative check
      for (const item of input.items) {
        const existing = invMap.get(item.productId);
        const updateCount = await tx.$executeRaw`
          UPDATE inventory
          SET qty_on_hand = qty_on_hand - ${item.qty}
          WHERE id = ${existing.id} AND qty_on_hand >= ${item.qty}
        `;
        if (updateCount === 0) {
          const err: any = new Error(
            `Insufficient stock for "${item.productName || item.sku}": concurrent checkout conflict. Available quantity modified.`
          );
          err.statusCode = 409;
          throw err;
        }
      }

      // 4. Batch create inventory ledger entries
      const inventoryLedgerEntries = input.items.map((item) => {
        const existing = invMap.get(item.productId);
        const currentQty = existing ? existing.qtyOnHand : 0;
        const newQty = currentQty - item.qty;
        const dbProduct = productMap.get(item.productId);
        const authoritativeUnitCost = dbProduct ? Number(dbProduct.baseCostPrice) || 0 : 0;

        return {
          productId: item.productId,
          storeCode,
          refNo: orderNo,
          type: 'POS Sale Out',
          qtyChange: -item.qty,
          costPerUnit: authoritativeUnitCost,
          sellingPricePerUnit: item.unitPrice,
          balanceAfter: newQty,
          notes: `POS Checkout (${orderNo})`,
          createdBy: input.cashierName,
        };
      });

      await tx.inventoryLedger.createMany({
        data: inventoryLedgerEntries,
      });

      // 5. Create Sales Order Record with nested sale items
      // 5. Create Sales Order Record with nested sale items & immutable tax/currency snapshots
      const sale = await tx.salesOrder.create({
        data: {
          orderNo,
          storeCode,
          customerId: input.customerId || null,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          subtotal,
          taxAmount,
          discountAmount,
          grandTotal,
          totalCost,
          grossProfit,
          paymentMethod,
          referenceNo: effectiveRefNo,
          paymentProofUrl:
            input.paymentProofUrl ||
            (input.photos && input.photos.length > 0 ? input.photos[0] : null),
          status: 'Completed',
          cashierName: input.cashierName,
          photosJson: input.photos
            ? JSON.stringify(input.photos)
            : input.paymentProofUrl
              ? JSON.stringify([input.paymentProofUrl])
              : null,
          countryCode: taxContext.countryCode,
          currencyCode: taxContext.currencyCode,
          currencySymbol: taxContext.currencySymbol,
          taxRegime: taxContext.taxRegime,
          taxInclusive: taxContext.taxInclusivePricing,
          taxConfigVersion: taxContext.taxConfigVersion,
          taxRegistrationSnapshot: taxContext.taxRegistrationNumber || null,
          taxBreakdownJson: JSON.stringify(taxResult.taxBreakdown),
          invoiceTemplateVersion: 1,
          invoiceSnapshotJson: JSON.stringify(taxResult.invoiceSnapshot),
          items: {
            create: preparedItems,
          },
        },
        include: {
          items: true,
        },
      });

      const effectiveProofUrl =
        input.paymentProofUrl || (input.photos && input.photos.length > 0 ? input.photos[0] : null);

      // Link FileAsset with created SalesOrder and guarantee transaction storeCode
      if (effectiveProofUrl) {
        try {
          const proofIndex = effectiveProofUrl.indexOf('payment-proofs/');
          if (proofIndex !== -1) {
            const rawKey = effectiveProofUrl.slice(proofIndex).split('?')[0];
            const cleanKey = decodeURIComponent(rawKey)
              .split(/[/\\]+/)
              .filter(Boolean)
              .join('/');
            await tx.fileAsset.updateMany({
              where: { objectKey: cleanKey },
              data: {
                relatedEntityType: 'Sale',
                relatedEntityId: sale.id,
                storeCode,
              },
            });
          }
        } catch (faErr) {
          console.warn('[salesService] FileAsset linking notice:', faErr);
        }
      }

      // 6. Batch create double-entry financial ledger records with currency snapshots
      const financialEntries: any[] = [
        {
          entryNo: `JRN-REV-${orderNo}`,
          entryDate: new Date(),
          storeCode,
          accountCategory: 'REVENUE',
          accountName: 'Gross Sales Revenue',
          debit: 0,
          credit: netRevenue,
          amount: netRevenue,
          refType: 'SALE',
          refId: sale.id,
          refNo: orderNo,
          currencyCode: taxContext.currencyCode,
          entityName: input.customerName || 'Customer',
          description: `POS Billed Sales Revenue for Order ${orderNo}`,
          createdBy: input.cashierName,
        },
      ];

      if (taxAmount > 0) {
        financialEntries.push({
          entryNo: `JRN-TAX-${orderNo}`,
          entryDate: new Date(),
          storeCode,
          accountCategory: 'LIABILITY',
          accountName: `${taxContext.taxLabel} Output Tax Liability`,
          debit: 0,
          credit: taxAmount,
          amount: taxAmount,
          refType: 'SALE',
          refId: sale.id,
          refNo: orderNo,
          currencyCode: taxContext.currencyCode,
          entityName: input.customerName || 'Customer',
          description: `${taxContext.taxLabel} Collected on Order ${orderNo}`,
          createdBy: input.cashierName,
        });
      }

      financialEntries.push({
        entryNo: `JRN-ASST-${orderNo}`,
        entryDate: new Date(),
        storeCode,
        accountCategory: 'ASSET',
        accountName:
          input.paymentMethod === 'Credit'
            ? 'Customer Accounts Receivable'
            : `Cash / Bank (${input.paymentMethod})`,
        debit: grandTotal,
        credit: 0,
        amount: grandTotal,
        refType: 'SALE',
        refId: sale.id,
        refNo: orderNo,
        currencyCode: taxContext.currencyCode,
        entityName: input.customerName || 'Customer',
        description: `Payment Receipt via ${input.paymentMethod} for Order ${orderNo} (Ref: ${effectiveRefNo})`,
        metadataJson: JSON.stringify({
          proofUrl: effectiveProofUrl,
          referenceNo: effectiveRefNo,
          paymentMethod: input.paymentMethod,
          orderNo,
          cashierName: input.cashierName,
          timestamp: new Date().toISOString(),
        }),
        createdBy: input.cashierName,
      });

      if (totalCost > 0) {
        financialEntries.push(
          {
            entryNo: `JRN-COGS-${orderNo}`,
            entryDate: new Date(),
            storeCode,
            accountCategory: 'COGS',
            accountName: 'Cost of Goods Sold',
            debit: totalCost,
            credit: 0,
            amount: totalCost,
            refType: 'SALE',
            refId: sale.id,
            refNo: orderNo,
            currencyCode: taxContext.currencyCode,
            entityName: input.customerName || 'Customer',
            description: `Inventory Cost of Goods Sold for Order ${orderNo}`,
            createdBy: input.cashierName,
          },
          {
            entryNo: `JRN-INVD-${orderNo}`,
            entryDate: new Date(),
            storeCode,
            accountCategory: 'ASSET',
            accountName: 'Inventory Asset (Depletion)',
            debit: 0,
            credit: totalCost,
            amount: -totalCost,
            refType: 'SALE',
            refId: sale.id,
            refNo: orderNo,
            currencyCode: taxContext.currencyCode,
            entityName: input.customerName || 'Customer',
            description: `Stock Depletion for POS Sale ${orderNo}`,
            createdBy: input.cashierName,
          }
        );
      }

      await tx.financialLedgerEntry.createMany({
        data: financialEntries,
      });

      // 7. Update Customer Total Spent & Orders count per store profile
      if (input.customerId) {
        await tx.customerStoreProfile.upsert({
          where: {
            customerId_storeCode: {
              customerId: input.customerId,
              storeCode,
            },
          },
          create: {
            customerId: input.customerId,
            storeCode,
            totalSpent: grandTotal,
            totalOrders: 1,
            creditBalance: 0,
          },
          update: {
            totalSpent: { increment: grandTotal },
            totalOrders: { increment: 1 },
          },
        });
      }

      // 8. Create Audit Log Entry
      await tx.auditLog.create({
        data: {
          module: 'Sales',
          action: 'POS Checkout',
          details: `Completed order ${orderNo} for ${input.customerName} (Total: ${taxContext.currencySymbol}${grandTotal.toFixed(2)}) [${input.paymentMethod}]`,
          userEmail: input.cashierName,
          userRole: 'Sales Manager',
          storeCode,
        },
      });

      // 9. Atomically write durable outbox events inside transaction
      await tx.realtimeOutbox.create({
        data: {
          channel: getStoreChannel(storeCode),
          event: 'SALE_COMPLETED',
          payload: JSON.stringify({
            orderNo: sale.orderNo,
            orderId: sale.id,
            storeCode,
            grandTotal,
            cashierName: input.cashierName,
          }),
          storeCode,
        },
      });

      await tx.realtimeOutbox.create({
        data: {
          channel: getStoreChannel(storeCode),
          event: 'STOCK_UPDATED',
          payload: JSON.stringify({
            storeCode,
            reason: 'SALE_CHECKOUT',
            orderNo: sale.orderNo,
          }),
          storeCode,
        },
      });

      return sale;
    },
    {
      maxWait: 15000,
      timeout: 45000,
    }
  );

  // Broadcast Realtime Events outside interactive transaction (skipOutbox since already committed in tx)
  try {
    await broadcastRealtimeEvent(
      'sales',
      'SALE_COMPLETED',
      {
        orderNo: result.orderNo,
        storeCode: result.storeCode,
      },
      { skipOutbox: true }
    );
    await broadcastRealtimeEvent(
      getStoreChannel(result.storeCode),
      'SALE_COMPLETED',
      {
        orderNo: result.orderNo,
        storeCode: result.storeCode,
      },
      { skipOutbox: true }
    );
    await broadcastRealtimeEvent(
      'inventory',
      'STOCK_UPDATED',
      { storeCode: result.storeCode },
      { skipOutbox: true }
    );
    await broadcastRealtimeEvent(
      getStoreChannel(result.storeCode),
      'STOCK_UPDATED',
      { storeCode: result.storeCode },
      { skipOutbox: true }
    );
  } catch (broadcastErr) {
    console.warn('[salesService] Realtime broadcast error (non-fatal):', broadcastErr);
  }

  return result;
}
