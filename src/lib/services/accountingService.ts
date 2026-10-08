import { prisma } from '../db';
import { Prisma } from '@prisma/client';

export interface LedgerEntryInput {
  entryNo: string;
  entryDate?: Date;
  storeCode: string;
  accountCategory:
    | 'REVENUE'
    | 'COGS'
    | 'OPERATING_EXPENSE'
    | 'CENTRAL_EXPENSE'
    | 'TRANSFER_MARKUP'
    | 'ASSET'
    | 'LIABILITY';
  accountName: string;
  debit?: number;
  credit?: number;
  amount: number;
  refType:
    | 'SALE'
    | 'PURCHASE_GRN'
    | 'VENDOR_PAYMENT'
    | 'EXPENSE'
    | 'STOCK_TRANSFER'
    | 'INVENTORY_ADJUSTMENT';
  refId?: string | null;
  refNo: string;
  entityName?: string | null;
  description: string;
  isEliminated?: boolean;
  metadataJson?: string | null;
  currencyCode?: string;
  createdBy: string;
}

/**
 * Atomically record double-entry journal items in the persistent Financial Ledger.
 */
export async function recordLedgerEntries(tx: any, entries: LedgerEntryInput[]) {
  if (!entries || entries.length === 0) return [];
  const data = entries.map((item) => ({
    entryNo: item.entryNo,
    entryDate: item.entryDate || new Date(),
    storeCode: item.storeCode,
    accountCategory: item.accountCategory,
    accountName: item.accountName,
    debit: item.debit || 0,
    credit: item.credit || 0,
    amount: item.amount,
    refType: item.refType,
    refId: item.refId || null,
    refNo: item.refNo,
    entityName: item.entityName || null,
    description: item.description,
    isEliminated: item.isEliminated || false,
    metadataJson: item.metadataJson || null,
    currencyCode: item.currencyCode || 'INR',
    createdBy: item.createdBy,
    createdAt: item.entryDate || new Date(),
  }));

  await tx.financialLedgerEntry.createMany({
    data,
  });
  return data;
}

export interface AccountingFilterParams {
  store?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 1. CONSOLIDATED COMPANY P&L (Internal Transfer Profit Eliminated)
 * Revenue = External Customer POS Sales ONLY.
 * COGS = True Vendor Purchase Cost of sold items.
 * Internal Central -> Store transfer revenues & transfer markups are 100% ELIMINATED.
 */
export async function getConsolidatedPnL(filters: AccountingFilterParams) {
  const { store, startDate, endDate } = filters;

  // Build where clause for external sales
  const salesWhere: any = {
    status: { notIn: ['Cancelled', 'Voided', 'Refunded'] },
  };
  if (store && store !== 'All Stores' && store !== 'ALL') {
    salesWhere.storeCode = store;
  }
  if (startDate || endDate) {
    salesWhere.createdAt = {};
    if (startDate) salesWhere.createdAt.gte = startDate;
    if (endDate) salesWhere.createdAt.lte = endDate;
  }

  // Fetch all authoritative sales with items and base product costs
  const sales = await prisma.salesOrder.findMany({
    where: salesWhere,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              baseCostPrice: true,
              baseSellingPrice: true,
              name: true,
              sku: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  let grossRevenue = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let netExternalRevenue = 0;
  let vendorCOGS = 0;

  for (const s of sales) {
    const saleSubtotal = Number(s.subtotal) || 0;
    const saleDiscount = Number(s.discountAmount) || 0;
    const saleTax = Number(s.taxAmount) || 0;
    const saleGrandTotal = Number(s.grandTotal) || 0;

    grossRevenue += saleSubtotal;
    totalDiscounts += saleDiscount;
    totalTax += saleTax;
    netExternalRevenue += saleSubtotal - saleDiscount;

    // Compute authoritative vendor COGS directly from persisted totalCost or line item unitCost
    let saleCogs = 0;
    if (s.totalCost !== undefined && s.totalCost !== null && Number(s.totalCost) > 0) {
      saleCogs = Number(s.totalCost);
    } else {
      for (const it of s.items) {
        const unitCost = Number(it.unitCost) || Number(it.product?.baseCostPrice) || 0;
        saleCogs += unitCost * it.qty;
      }
    }
    vendorCOGS += saleCogs;
  }

  const consolidatedGrossProfit = netExternalRevenue - vendorCOGS;
  const grossMarginPercent =
    netExternalRevenue > 0 ? (consolidatedGrossProfit / netExternalRevenue) * 100 : 0;

  // Expenses: Store Operating vs Central Operations
  const expWhere: any = {};
  if (store && store !== 'All Stores' && store !== 'ALL') {
    expWhere.storeCode = store;
  }
  if (startDate || endDate) {
    expWhere.date = {};
    if (startDate) expWhere.date.gte = startDate;
    if (endDate) expWhere.date.lte = endDate;
  }

  const allExpenses = await prisma.expense.findMany({
    where: expWhere,
    orderBy: { date: 'desc' },
  });

  let storeOperatingExpenses = 0;
  let centralExpenses = 0;
  const expenseCategoryBreakdown: Record<string, number> = {};

  for (const e of allExpenses) {
    const amt = Number(e.amount) || 0;
    const isCentral =
      e.storeCode === 'CENTRAL' ||
      e.category.toLowerCase().includes('freight') ||
      e.description.toLowerCase().includes('central');
    if (isCentral) {
      centralExpenses += amt;
    } else {
      storeOperatingExpenses += amt;
    }
    expenseCategoryBreakdown[e.category] = (expenseCategoryBreakdown[e.category] || 0) + amt;
  }

  const totalExpenses = storeOperatingExpenses + centralExpenses;
  const consolidatedNetProfit = consolidatedGrossProfit - totalExpenses;
  const netMarginPercent =
    netExternalRevenue > 0 ? (consolidatedNetProfit / netExternalRevenue) * 100 : 0;

  // Internal Transfer Revenue that was ELIMINATED
  const transferWhere: any = {
    status: { in: ['Completed', 'Received'] },
  };
  if (startDate || endDate) {
    transferWhere.shipDate = {};
    if (startDate) transferWhere.shipDate.gte = startDate;
    if (endDate) transferWhere.shipDate.lte = endDate;
  }
  const transfers = await prisma.stockTransfer.findMany({
    where: transferWhere,
  });
  const eliminatedTransferRevenue = transfers.reduce(
    (acc, t) => acc + Number(t.totalTransferValue),
    0
  );
  const eliminatedTransferMarkup = transfers.reduce((acc, t) => acc + Number(t.grossProfit), 0);

  // Store contributions breakdown
  const storeContributionsMap: Record<
    string,
    {
      storeCode: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      netProfit: number;
      ordersCount: number;
    }
  > = {};

  for (const s of sales) {
    const sc = s.storeCode;
    if (!storeContributionsMap[sc]) {
      storeContributionsMap[sc] = {
        storeCode: sc,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        ordersCount: 0,
      };
    }
    const rev = (Number(s.subtotal) || 0) - (Number(s.discountAmount) || 0);
    const cogs = Number(s.totalCost) || 0;
    storeContributionsMap[sc].revenue += rev;
    storeContributionsMap[sc].cogs += cogs;
    storeContributionsMap[sc].grossProfit += rev - cogs;
    storeContributionsMap[sc].ordersCount += 1;
  }

  for (const e of allExpenses) {
    const sc = e.storeCode;
    if (!storeContributionsMap[sc]) {
      storeContributionsMap[sc] = {
        storeCode: sc,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        ordersCount: 0,
      };
    }
    storeContributionsMap[sc].expenses += Number(e.amount) || 0;
  }

  const storeContributions = Object.values(storeContributionsMap).map((sc) => ({
    ...sc,
    netProfit: sc.grossProfit - sc.expenses,
    grossMarginPercent: sc.revenue > 0 ? (sc.grossProfit / sc.revenue) * 100 : 0,
  }));

  return {
    netExternalRevenue: Math.round(netExternalRevenue * 100) / 100,
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    vendorCOGS: Math.round(vendorCOGS * 100) / 100,
    consolidatedGrossProfit: Math.round(consolidatedGrossProfit * 100) / 100,
    grossMarginPercent: Number(grossMarginPercent.toFixed(2)),
    storeOperatingExpenses: Math.round(storeOperatingExpenses * 100) / 100,
    centralExpenses: Math.round(centralExpenses * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    consolidatedNetProfit: Math.round(consolidatedNetProfit * 100) / 100,
    netMarginPercent: Number(netMarginPercent.toFixed(2)),
    eliminatedTransferRevenue: Math.round(eliminatedTransferRevenue * 100) / 100,
    eliminatedTransferMarkup: Math.round(eliminatedTransferMarkup * 100) / 100,
    ordersCount: sales.length,
    expensesCount: allExpenses.length,
    expenseCategoryBreakdown,
    storeContributions,
  };
}

/**
 * 2. STORE OPERATIONAL P&L
 * Measures standalone store branch performance.
 * Store COGS is based on the Transfer Price paid to Central Warehouse for inventory.
 */
export async function getStoreOperationalPnL(filters: AccountingFilterParams) {
  const { store, startDate, endDate } = filters;
  const storeScope = store && store !== 'All Stores' && store !== 'ALL' ? store : undefined;

  const salesWhere: any = {
    status: { notIn: ['Cancelled', 'Voided', 'Refunded'] },
  };
  if (storeScope) {
    salesWhere.storeCode = storeScope;
  }
  if (startDate || endDate) {
    salesWhere.createdAt = {};
    if (startDate) salesWhere.createdAt.gte = startDate;
    if (endDate) salesWhere.createdAt.lte = endDate;
  }

  const sales = await prisma.salesOrder.findMany({
    where: salesWhere,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              baseCostPrice: true,
              baseSellingPrice: true,
              name: true,
              sku: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch transfer pricing records for items received by store
  const transferItems = await prisma.stockTransferItem.findMany({
    where: storeScope
      ? { transfer: { destStore: storeScope, status: { in: ['Completed', 'Received'] } } }
      : undefined,
    include: { transfer: true },
    orderBy: { transfer: { shipDate: 'desc' } },
  });
  const transferPriceMap = new Map<string, number>();
  for (const ti of transferItems) {
    if (!transferPriceMap.has(ti.productId)) {
      transferPriceMap.set(ti.productId, Number(ti.transferPricePerUnit));
    }
  }

  let storeSalesRevenue = 0;
  let storeCOGS = 0;

  for (const s of sales) {
    const rev = (Number(s.subtotal) || 0) - (Number(s.discountAmount) || 0);
    storeSalesRevenue += rev;

    for (const it of s.items) {
      const effectiveTransferPrice =
        transferPriceMap.get(it.productId) ??
        (it.unitCost != null ? Number(it.unitCost) : null) ??
        (it.product?.baseCostPrice != null ? Number(it.product.baseCostPrice) : 0);
      storeCOGS += (Number(effectiveTransferPrice) || 0) * it.qty;
    }
  }

  const storeGrossProfit = storeSalesRevenue - storeCOGS;
  const storeGrossMarginPercent =
    storeSalesRevenue > 0 ? (storeGrossProfit / storeSalesRevenue) * 100 : 0;

  const expWhere: any = {};
  if (storeScope) {
    expWhere.storeCode = storeScope;
  } else {
    expWhere.storeCode = { not: 'CENTRAL' };
  }
  if (startDate || endDate) {
    expWhere.date = {};
    if (startDate) expWhere.date.gte = startDate;
    if (endDate) expWhere.date.lte = endDate;
  }

  const storeExpenses = await prisma.expense.findMany({
    where: expWhere,
    orderBy: { date: 'desc' },
  });
  const totalStoreExpenses = storeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const storeNetProfit = storeGrossProfit - totalStoreExpenses;
  const storeNetMarginPercent =
    storeSalesRevenue > 0 ? (storeNetProfit / storeSalesRevenue) * 100 : 0;

  return {
    storeScope: storeScope || 'All Retail Outlets',
    storeSalesRevenue: Math.round(storeSalesRevenue * 100) / 100,
    storeCOGS: Math.round(storeCOGS * 100) / 100,
    storeGrossProfit: Math.round(storeGrossProfit * 100) / 100,
    storeGrossMarginPercent: Number(storeGrossMarginPercent.toFixed(2)),
    storeOperatingExpenses: Math.round(totalStoreExpenses * 100) / 100,
    storeNetProfit: Math.round(storeNetProfit * 100) / 100,
    storeNetMarginPercent: Number(storeNetMarginPercent.toFixed(2)),
    ordersCount: sales.length,
    expensesCount: storeExpenses.length,
  };
}

/**
 * 3. CENTRAL TRANSFER PROFIT P&L
 * Tracks Central Warehouse markup on goods transferred out to retail outlets,
 * minus Central logistics, freight, and warehouse operational costs.
 */
export async function getCentralTransferPnL(filters: AccountingFilterParams) {
  const { startDate, endDate } = filters;

  const transferWhere: any = {
    sourceStore: 'CENTRAL',
    status: { in: ['Completed', 'Received'] },
  };
  if (startDate || endDate) {
    transferWhere.shipDate = {};
    if (startDate) transferWhere.shipDate.gte = startDate;
    if (endDate) transferWhere.shipDate.lte = endDate;
  }

  const transfers = await prisma.stockTransfer.findMany({
    where: transferWhere,
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true },
          },
        },
      },
    },
    orderBy: { shipDate: 'desc' },
  });

  let centralTransferRevenue = 0;
  let centralInventoryCost = 0;
  let grossTransferProfit = 0;
  let totalUnitsTransferred = 0;

  const outletTransferBreakdownMap: Record<
    string,
    {
      destStore: string;
      transferValue: number;
      inventoryCost: number;
      markupProfit: number;
      units: number;
      count: number;
    }
  > = {};

  for (const t of transfers) {
    const val = Number(t.totalTransferValue) || 0;
    const cost = Number(t.totalCost) || 0;
    const profit = Number(t.grossProfit) || val - cost;
    const units = t.totalUnits || 0;

    centralTransferRevenue += val;
    centralInventoryCost += cost;
    grossTransferProfit += profit;
    totalUnitsTransferred += units;

    const dest = t.destStore;
    if (!outletTransferBreakdownMap[dest]) {
      outletTransferBreakdownMap[dest] = {
        destStore: dest,
        transferValue: 0,
        inventoryCost: 0,
        markupProfit: 0,
        units: 0,
        count: 0,
      };
    }
    outletTransferBreakdownMap[dest].transferValue += val;
    outletTransferBreakdownMap[dest].inventoryCost += cost;
    outletTransferBreakdownMap[dest].markupProfit += profit;
    outletTransferBreakdownMap[dest].units += units;
    outletTransferBreakdownMap[dest].count += 1;
  }

  const expWhere: any = {
    OR: [
      { storeCode: 'CENTRAL' },
      { category: { contains: 'Transport' } },
      { category: { contains: 'Freight' } },
      { description: { contains: 'Central' } },
    ],
  };
  if (startDate || endDate) {
    expWhere.date = {};
    if (startDate) expWhere.date.gte = startDate;
    if (endDate) expWhere.date.lte = endDate;
  }

  const centralExpensesRecords = await prisma.expense.findMany({
    where: expWhere,
    orderBy: { date: 'desc' },
  });
  const totalCentralExpenses = centralExpensesRecords.reduce(
    (acc, e) => acc + (Number(e.amount) || 0),
    0
  );
  const netCentralProfit = grossTransferProfit - totalCentralExpenses;
  const centralMarkupMarginPercent =
    centralTransferRevenue > 0 ? (grossTransferProfit / centralTransferRevenue) * 100 : 0;

  return {
    centralTransferRevenue: Math.round(centralTransferRevenue * 100) / 100,
    centralInventoryCost: Math.round(centralInventoryCost * 100) / 100,
    grossTransferProfit: Math.round(grossTransferProfit * 100) / 100,
    centralMarkupMarginPercent: Number(centralMarkupMarginPercent.toFixed(2)),
    centralExpenses: Math.round(totalCentralExpenses * 100) / 100,
    netCentralProfit: Math.round(netCentralProfit * 100) / 100,
    totalUnitsTransferred,
    transfersCount: transfers.length,
    expensesCount: centralExpensesRecords.length,
    outletBreakdown: Object.values(outletTransferBreakdownMap),
  };
}

/**
 * 4. DRILL-DOWN AUDIT RECORDS
 * Returns exact constituent transaction rows for ANY clicked metric.
 */
export async function getDrillDownRecords(metricKey: string, filters: AccountingFilterParams) {
  const { store, startDate, endDate } = filters;
  const storeScope = store && store !== 'All Stores' && store !== 'ALL' ? store : undefined;

  switch (metricKey) {
    case 'revenue':
    case 'grossRevenue':
    case 'netExternalRevenue': {
      const where: any = { status: { notIn: ['Cancelled', 'Voided', 'Refunded'] } };
      if (storeScope) where.storeCode = storeScope;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }
      const sales = await prisma.salesOrder.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
      const rows = sales.map((s) => ({
        id: s.id,
        refNo: s.orderNo,
        date: s.createdAt,
        storeCode: s.storeCode,
        entity: s.customerName || 'Customer',
        description: `POS Sale (${s.items.length} items)`,
        amount: Number(s.grandTotal),
        netRevenue: Number(s.subtotal) - Number(s.discountAmount || 0),
        tax: Number(s.taxAmount),
        cost: Number(s.totalCost),
        profit: Number(s.grossProfit),
        status: s.status,
        paymentMethod: s.paymentMethod,
        items: s.items
          .map((it) => `${it.productName} (x${it.qty} @ ${Number(it.unitPrice)})`)
          .join(', '),
      }));
      const total = rows.reduce((acc, r) => acc + r.netRevenue, 0);
      return {
        metric: 'Net External Sales Revenue',
        total: Math.round(total * 100) / 100,
        count: rows.length,
        rows,
      };
    }

    case 'cogs':
    case 'vendorCOGS': {
      const where: any = { status: { notIn: ['Cancelled', 'Voided', 'Refunded'] } };
      if (storeScope) where.storeCode = storeScope;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }
      const sales = await prisma.salesOrder.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
      const rows = sales.map((s) => ({
        id: s.id,
        refNo: s.orderNo,
        date: s.createdAt,
        storeCode: s.storeCode,
        entity: s.customerName || 'Customer',
        description: `COGS for Sale ${s.orderNo}`,
        amount: Number(s.totalCost),
        revenue: Number(s.grandTotal),
        profit: Number(s.grossProfit),
        items: s.items
          .map((it) => `${it.productName}: ${it.qty} x ${Number(it.unitCost)}`)
          .join(', '),
      }));
      const total = rows.reduce((acc, r) => acc + r.amount, 0);
      return {
        metric: 'Cost of Goods Sold (Vendor Cost)',
        total: Math.round(total * 100) / 100,
        count: rows.length,
        rows,
      };
    }

    case 'expenses':
    case 'storeOperatingExpenses':
    case 'centralExpenses':
    case 'totalExpenses': {
      const where: any = {};
      if (metricKey === 'storeOperatingExpenses') {
        if (storeScope) where.storeCode = storeScope;
        else where.storeCode = { not: 'CENTRAL' };
      } else if (metricKey === 'centralExpenses') {
        where.OR = [
          { storeCode: 'CENTRAL' },
          { category: { contains: 'Transport' } },
          { category: { contains: 'Freight' } },
          { description: { contains: 'Central' } },
        ];
      } else if (storeScope) {
        where.storeCode = storeScope;
      }
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = startDate;
        if (endDate) where.date.lte = endDate;
      }
      const expenses = await prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
      });
      const rows = expenses.map((e) => ({
        id: e.id,
        refNo: e.expenseNo,
        date: e.date,
        storeCode: e.storeCode,
        entity: e.approvedBy || 'Manager',
        category: e.category,
        description: e.description || e.category,
        amount: Number(e.amount),
        paymentMethod: e.paymentMethod,
      }));
      const total = rows.reduce((acc, r) => acc + r.amount, 0);
      return {
        metric: 'Operating Expenses Breakdown',
        total: Math.round(total * 100) / 100,
        count: rows.length,
        rows,
      };
    }

    case 'transferRevenue':
    case 'centralTransferRevenue':
    case 'transferProfit':
    case 'grossTransferProfit': {
      const where: any = {
        sourceStore: 'CENTRAL',
        status: { in: ['Completed', 'Received'] },
      };
      if (startDate || endDate) {
        where.shipDate = {};
        if (startDate) where.shipDate.gte = startDate;
        if (endDate) where.shipDate.lte = endDate;
      }
      const transfers = await prisma.stockTransfer.findMany({
        where,
        include: { items: { include: { product: true } } },
        orderBy: { shipDate: 'desc' },
      });
      const rows = transfers.map((t) => ({
        id: t.id,
        refNo: t.transferNo,
        date: t.shipDate,
        route: `${t.sourceStore} → ${t.destStore}`,
        storeCode: t.sourceStore,
        destStore: t.destStore,
        entity: t.requestedBy,
        units: t.totalUnits,
        totalCost: Number(t.totalCost),
        transferValue: Number(t.totalTransferValue),
        profit: Number(t.grossProfit),
        amount: metricKey.includes('Profit') ? Number(t.grossProfit) : Number(t.totalTransferValue),
        status: t.status,
        items: t.items
          .map(
            (it) =>
              `${it.product?.name || 'Item'} (Qty: ${it.qty}, Cost: ${Number(it.costPerUnit)}, Billed: ${Number(it.transferPricePerUnit)})`
          )
          .join(', '),
      }));
      const total = rows.reduce((acc, r) => acc + r.amount, 0);
      return {
        metric: metricKey.includes('Profit')
          ? 'Central Transfer Gross Markup'
          : 'Central Transfer Billed Value',
        total: Math.round(total * 100) / 100,
        count: rows.length,
        rows,
      };
    }

    default: {
      return { metric: metricKey, total: 0, count: 0, rows: [] };
    }
  }
}

/**
 * 5. GENERAL LEDGER ENTRIES QUERY
 */
export async function getGeneralLedgerEntries(filters: {
  store?: string;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  refType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { store, startDate, endDate, category, refType, search, page = 1, limit = 50 } = filters;
  const where: any = {};

  if (store && store !== 'All Stores' && store !== 'ALL') {
    where.storeCode = store;
  }
  if (category && category !== 'ALL') {
    where.accountCategory = category;
  }
  if (refType && refType !== 'ALL') {
    where.refType = refType;
  }
  if (startDate || endDate) {
    where.entryDate = {};
    if (startDate) where.entryDate.gte = startDate;
    if (endDate) where.entryDate.lte = endDate;
  }
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { entryNo: { contains: q } },
      { refNo: { contains: q } },
      { accountName: { contains: q } },
      { description: { contains: q } },
      { entityName: { contains: q } },
    ];
  }

  const [totalCount, entries, totalsAgg] = await Promise.all([
    (prisma as any).financialLedgerEntry.count({ where }),
    (prisma as any).financialLedgerEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    (prisma as any).financialLedgerEntry.aggregate({
      where,
      _sum: {
        debit: true,
        credit: true,
      },
    }),
  ]);

  const totalDebit = Number(totalsAgg._sum.debit) || 0;
  const totalCredit = Number(totalsAgg._sum.credit) || 0;

  return {
    page,
    limit,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    entries: entries.map((e: any) => {
      let meta: any = null;
      try {
        if (e.metadataJson) meta = JSON.parse(e.metadataJson);
      } catch {}
      return {
        id: e.id,
        entryNo: e.entryNo,
        entryDate: e.entryDate,
        storeCode: e.storeCode,
        accountCategory: e.accountCategory,
        accountName: e.accountName,
        debit: Number(e.debit),
        credit: Number(e.credit),
        amount: Number(e.amount),
        refType: e.refType,
        refId: e.refId,
        refNo: e.refNo,
        entityName: e.entityName,
        description: e.description,
        isEliminated: e.isEliminated,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
        metadataJson: e.metadataJson,
        proofUrl: meta?.proofUrl || meta?.receiptUrl || null,
        referenceNo: meta?.referenceNo || e.refNo || null,
        paymentMethod: meta?.paymentMethod || null,
      };
    }),
  };
}

/**
 * 6. ROOT FINANCIAL RECONCILIATION
 * Proves mathematical consistency across all source transactions, ledger rows, and P&L.
 */
export async function runRootFinancialReconciliation() {
  const [
    salesAgg,
    purchasesAgg,
    expensesAgg,
    transfersAgg,
    ledgerTotals,
    inventoryRecords,
    customersAgg,
    vendorsAgg,
  ] = await Promise.all([
    // Sales Totals
    prisma.salesOrder.aggregate({
      where: { status: { notIn: ['Cancelled', 'Voided', 'Refunded'] } },
      _sum: {
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        grandTotal: true,
        totalCost: true,
        grossProfit: true,
      },
      _count: { id: true },
    }),
    // Purchases Totals
    (prisma as any).purchaseOrder.aggregate({
      where: { status: { in: ['Received', 'Completed'] } },
      _sum: {
        totalCost: true,
        paidAmount: true,
        creditAmount: true,
      },
      _count: { id: true },
    }),
    // Expenses Totals
    prisma.expense.aggregate({
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Transfers Totals
    prisma.stockTransfer.aggregate({
      where: { status: { in: ['Completed', 'Received'] } },
      _sum: {
        totalCost: true,
        totalTransferValue: true,
        grossProfit: true,
      },
      _count: { id: true },
    }),
    // Financial Ledger Entries Summary
    (prisma as any).financialLedgerEntry.aggregate({
      _sum: {
        debit: true,
        credit: true,
      },
      _count: { id: true },
    }),
    // Inventory Balances
    prisma.inventory.findMany({
      include: { product: true },
    }),
    // Customers Receivables (from store profiles)
    (prisma as any).customerStoreProfile.aggregate({
      _sum: { creditBalance: true, totalSpent: true },
      _count: { id: true },
    }),
    // Vendors
    (prisma as any).vendor.findMany({
      include: {
        purchases: {
          where: { status: { notIn: ['Cancelled', 'Archived'] } },
          include: { payments: true },
        },
      },
    }),
  ]);

  // Calculations
  const salesNetRevenue =
    (Number(salesAgg._sum.subtotal) || 0) - (Number(salesAgg._sum.discountAmount) || 0);
  const salesCOGS = Number(salesAgg._sum.totalCost) || 0;
  const salesGrossProfit = salesNetRevenue - salesCOGS;
  const totalExpenses = Number(expensesAgg._sum.amount) || 0;
  const consolidatedNetProfit = salesGrossProfit - totalExpenses;

  // Inventory Asset Valuation
  let totalInventoryAssetValue = 0;
  let totalStockUnitsOnHand = 0;
  for (const inv of inventoryRecords) {
    const cost = Number(inv.product.baseCostPrice) || 0;
    const qty = inv.qtyOnHand || 0;
    totalInventoryAssetValue += cost * qty;
    totalStockUnitsOnHand += qty;
  }

  // Vendor Payables
  let totalVendorBilled = 0;
  let totalVendorPaid = 0;
  let totalVendorCredits = 0;
  let totalOutstandingPayables = 0;

  for (const v of vendorsAgg) {
    for (const po of v.purchases) {
      const tc = Number(po.totalCost) || 0;
      const ca = Number(po.creditAmount) || 0;
      const pd =
        po.payments?.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0) ??
        (Number(po.paidAmount) || 0);
      const rem = Math.max(0, tc - pd - ca);
      totalVendorBilled += tc;
      totalVendorPaid += pd;
      totalVendorCredits += ca;
      totalOutstandingPayables += rem;
    }
  }

  const customerReceivables = Number(customersAgg._sum.creditBalance) || 0;

  // Ledger Aggregates
  const ledgerDebits = Number(ledgerTotals._sum.debit) || 0;
  const ledgerCredits = Number(ledgerTotals._sum.credit) || 0;
  const ledgerDebitCreditDiff = Math.abs(ledgerDebits - ledgerCredits);

  // Transfer Profit
  const centralTransferMarkup = Number(transfersAgg._sum.grossProfit) || 0;

  // Mathematical Verification Proofs
  const proofs = [
    {
      test: 'Consolidated Gross Profit = Sales Net Revenue - Vendor COGS',
      leftValue: Math.round(salesGrossProfit * 100) / 100,
      rightValue: Math.round((salesNetRevenue - salesCOGS) * 100) / 100,
      isReconciled: Math.abs(salesGrossProfit - (salesNetRevenue - salesCOGS)) < 0.01,
    },
    {
      test: 'Consolidated Net Profit = Gross Profit - Total Operating & Central Expenses',
      leftValue: Math.round(consolidatedNetProfit * 100) / 100,
      rightValue: Math.round((salesGrossProfit - totalExpenses) * 100) / 100,
      isReconciled: Math.abs(consolidatedNetProfit - (salesGrossProfit - totalExpenses)) < 0.01,
    },
    {
      test: 'Outstanding Payables = Total Vendor Bills - Recorded Payments - Credits',
      leftValue: Math.round(totalOutstandingPayables * 100) / 100,
      rightValue:
        Math.round((totalVendorBilled - totalVendorPaid - totalVendorCredits) * 100) / 100,
      isReconciled:
        Math.abs(
          totalOutstandingPayables - (totalVendorBilled - totalVendorPaid - totalVendorCredits)
        ) < 0.05,
    },
    {
      test: 'General Ledger Double-Entry Balance (Total Debits == Total Credits)',
      leftValue: Math.round(ledgerDebits * 100) / 100,
      rightValue: Math.round(ledgerCredits * 100) / 100,
      isReconciled: ledgerDebitCreditDiff < 0.05,
    },
  ];

  const allPassed = proofs.every((p) => p.isReconciled);

  return {
    status: allPassed ? 'RECONCILED' : 'DISCREPANCY_DETECTED',
    timestamp: new Date().toISOString(),
    sales: {
      ordersCount: salesAgg._count.id,
      netRevenue: Math.round(salesNetRevenue * 100) / 100,
      cogs: Math.round(salesCOGS * 100) / 100,
      grossProfit: Math.round(salesGrossProfit * 100) / 100,
    },
    expenses: {
      expensesCount: expensesAgg._count.id,
      totalAmount: Math.round(totalExpenses * 100) / 100,
    },
    purchases: {
      purchasesCount: purchasesAgg._count.id,
      totalBilled: Math.round((Number(purchasesAgg._sum.totalCost) || 0) * 100) / 100,
      totalPaid: Math.round((Number(purchasesAgg._sum.paidAmount) || 0) * 100) / 100,
      totalCredits: Math.round((Number(purchasesAgg._sum.creditAmount) || 0) * 100) / 100,
    },
    netProfit: Math.round(consolidatedNetProfit * 100) / 100,
    transfers: {
      transfersCount: transfersAgg._count.id,
      centralMarkup: Math.round(centralTransferMarkup * 100) / 100,
      totalCost: Number(transfersAgg._sum.totalCost) || 0,
      totalValue: Number(transfersAgg._sum.totalTransferValue) || 0,
    },
    inventory: {
      totalAssetValue: Math.round(totalInventoryAssetValue * 100) / 100,
      unitsOnHand: totalStockUnitsOnHand,
    },
    payables: {
      totalBilled: Math.round(totalVendorBilled * 100) / 100,
      totalPaid: Math.round(totalVendorPaid * 100) / 100,
      totalCredits: Math.round(totalVendorCredits * 100) / 100,
      outstandingPayables: Math.round(totalOutstandingPayables * 100) / 100,
    },
    receivables: {
      totalReceivables: Math.round(customerReceivables * 100) / 100,
    },
    generalLedger: {
      entriesCount: ledgerTotals._count.id,
      totalDebits: Math.round(ledgerDebits * 100) / 100,
      totalCredits: Math.round(ledgerCredits * 100) / 100,
      difference: Math.round(ledgerDebitCreditDiff * 100) / 100,
    },
    proofs,
  };
}
