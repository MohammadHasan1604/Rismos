import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireStoreScope } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/reports/drilldown — Drill-down into individual transactions
 * Query params:
 *   type: product-sales | supplier-purchases | employee-sales | overview-sales
 *   id: productId | vendorId | cashierName
 *   store, period, startDate, endDate: same as /api/reports
 *   page: pagination (default 1)
 *   limit: page size (default 50, max 200)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '';
    const id = searchParams.get('id') || '';
    const requestedStore = searchParams.get('store');
    const period = searchParams.get('period') || 'This Month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const validTypes = ['product-sales', 'supplier-purchases', 'employee-sales', 'overview-sales'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid drilldown type' }, { status: 400 });
    }

    const { start, end } = getServerDateRange(period, startDateParam, endDateParam);

    const storeScope = requireStoreScope(user, requestedStore, {
      allowAllStoresForSuperAdmin: true,
    });
    if (!storeScope.authorized) {
      return NextResponse.json({ error: storeScope.error }, { status: storeScope.status });
    }

    const storeFilter: string | undefined =
      !storeScope.isAllStores && storeScope.physicalStoreCode
        ? storeScope.physicalStoreCode
        : undefined;

    let data: any = {};

    switch (type) {
      case 'product-sales':
        data = await drilldownProductSales(id, start, end, storeFilter, skip, limit);
        break;
      case 'supplier-purchases':
        data = await drilldownSupplierPurchases(id, start, end, storeFilter, skip, limit);
        break;
      case 'employee-sales':
        data = await drilldownEmployeeSales(id, start, end, storeFilter, skip, limit);
        break;
      case 'overview-sales':
        data = await drilldownOverviewSales(start, end, storeFilter, skip, limit);
        break;
    }

    return NextResponse.json(
      { success: true, ...data, page, limit },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('API /api/reports/drilldown error:', error);
    return NextResponse.json({ error: 'Drilldown query failed' }, { status: 500 });
  }
}

// ─── Drilldown: Product Sales ───────────────────────────────────────────────

async function drilldownProductSales(
  productId: string,
  start: Date,
  end: Date,
  storeFilter?: string,
  skip = 0,
  limit = 50
) {
  const where: any = {
    productId,
    order: {
      createdAt: { gte: start, lte: end },
      status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
      ...(storeFilter ? { storeCode: storeFilter } : {}),
    },
  };

  const [items, total] = await Promise.all([
    prisma.salesOrderItem.findMany({
      where,
      include: {
        order: {
          select: {
            orderNo: true,
            storeCode: true,
            customerName: true,
            cashierName: true,
            createdAt: true,
            grandTotal: true,
          },
        },
      },
      orderBy: { order: { createdAt: 'desc' } },
      skip,
      take: limit,
    }),
    prisma.salesOrderItem.count({ where }),
  ]);

  const records = items.map((it) => ({
    orderNo: it.order.orderNo,
    store: it.order.storeCode,
    customer: it.order.customerName,
    cashier: it.order.cashierName,
    date: it.order.createdAt,
    qty: it.qty,
    unitPrice: Number(it.unitPrice),
    unitCost: Number(it.unitCost),
    lineTotal: Number(it.lineTotal),
    lineProfit: Number(it.lineProfit),
  }));

  return { records, totalRecords: total, totalPages: Math.ceil(total / limit) };
}

// ─── Drilldown: Supplier Purchases ──────────────────────────────────────────

async function drilldownSupplierPurchases(
  vendorId: string,
  start: Date,
  end: Date,
  storeFilter?: string,
  skip = 0,
  limit = 50
) {
  const where: any = {
    vendorId,
    orderDate: { gte: start, lte: end },
    status: { notIn: ['Cancelled', 'Archived'] },
  };
  if (storeFilter) where.storeCode = storeFilter;

  const [purchases, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        items: {
          select: {
            qtyOrdered: true,
            unitCost: true,
            lineTotal: true,
            product: { select: { name: true, sku: true } },
          },
        },
        payments: { select: { amount: true, paymentDate: true } },
      },
      orderBy: { orderDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  const records = purchases.map((po) => ({
    poNo: po.poNo,
    invoiceNo: po.invoiceNo,
    store: po.storeCode,
    orderDate: po.orderDate,
    status: po.status,
    paymentStatus: po.paymentStatus,
    totalCost: Number(po.totalCost),
    paidAmount:
      po.payments?.reduce((s, p) => s + (Number(p.amount) || 0), 0) ?? (Number(po.paidAmount) || 0),
    creditAmount: Number(po.creditAmount),
    itemCount: po.items.length,
    totalUnits: po.items.reduce((s, i) => s + i.qtyOrdered, 0),
    items: po.items.map((i) => ({
      product: i.product.name,
      sku: i.product.sku,
      qty: i.qtyOrdered,
      unitCost: Number(i.unitCost),
      lineTotal: Number(i.lineTotal),
    })),
  }));

  return { records, totalRecords: total, totalPages: Math.ceil(total / limit) };
}

// ─── Drilldown: Employee Sales ──────────────────────────────────────────────

async function drilldownEmployeeSales(
  cashierName: string,
  start: Date,
  end: Date,
  storeFilter?: string,
  skip = 0,
  limit = 50
) {
  const where: any = {
    cashierName,
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) where.storeCode = storeFilter;

  const [sales, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      select: {
        orderNo: true,
        storeCode: true,
        customerName: true,
        customerPhone: true,
        grandTotal: true,
        grossProfit: true,
        totalCost: true,
        paymentMethod: true,
        createdAt: true,
        items: { select: { productName: true, qty: true, unitPrice: true, lineTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  const records = sales.map((s) => ({
    orderNo: s.orderNo,
    store: s.storeCode,
    customer: s.customerName,
    customerPhone: s.customerPhone,
    grandTotal: Number(s.grandTotal),
    grossProfit: Number(s.grossProfit),
    totalCost: Number(s.totalCost),
    paymentMethod: s.paymentMethod,
    date: s.createdAt,
    itemCount: s.items.length,
    items: s.items.map((i) => ({
      product: i.productName,
      qty: i.qty,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
    })),
  }));

  return { records, totalRecords: total, totalPages: Math.ceil(total / limit) };
}

// ─── Drilldown: Overview Sales ──────────────────────────────────────────────

async function drilldownOverviewSales(
  start: Date,
  end: Date,
  storeFilter?: string,
  skip = 0,
  limit = 50
) {
  const where: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) where.storeCode = storeFilter;

  const [sales, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      select: {
        orderNo: true,
        storeCode: true,
        customerName: true,
        cashierName: true,
        grandTotal: true,
        grossProfit: true,
        totalCost: true,
        paymentMethod: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  const records = sales.map((s) => ({
    orderNo: s.orderNo,
    store: s.storeCode,
    customer: s.customerName,
    cashier: s.cashierName,
    grandTotal: Number(s.grandTotal),
    grossProfit: Number(s.grossProfit),
    totalCost: Number(s.totalCost),
    paymentMethod: s.paymentMethod,
    date: s.createdAt,
  }));

  return { records, totalRecords: total, totalPages: Math.ceil(total / limit) };
}

// ─── Date Range Helper (duplicated to avoid importing client module) ────────

function getServerDateRange(
  period: string,
  startDateParam: string | null,
  endDateParam: string | null
): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();
  switch (period) {
    case 'Today':
      return { start: new Date(y, m, d, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
    case 'Yesterday':
      return {
        start: new Date(y, m, d - 1, 0, 0, 0, 0),
        end: new Date(y, m, d - 1, 23, 59, 59, 999),
      };
    case 'Last 7 Days':
      return { start: new Date(y, m, d - 6, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
    case 'Last 30 Days':
      return { start: new Date(y, m, d - 29, 0, 0, 0, 0), end: new Date(y, m, d, 23, 59, 59, 999) };
    case 'This Week': {
      const day = now.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      return {
        start: new Date(y, m, d + diff, 0, 0, 0, 0),
        end: new Date(y, m, d + diff + 6, 23, 59, 59, 999),
      };
    }
    case 'This Month':
      return { start: new Date(y, m, 1, 0, 0, 0, 0), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    case 'Last Month':
      return { start: new Date(y, m - 1, 1, 0, 0, 0, 0), end: new Date(y, m, 0, 23, 59, 59, 999) };
    case 'This Quarter': {
      const qi = Math.floor(m / 3);
      return {
        start: new Date(y, qi * 3, 1, 0, 0, 0, 0),
        end: new Date(y, qi * 3 + 3, 0, 23, 59, 59, 999),
      };
    }
    case 'This Year':
      return { start: new Date(y, 0, 1, 0, 0, 0, 0), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    case 'Custom Range': {
      if (startDateParam && endDateParam) {
        const sp = startDateParam.split('-').map(Number);
        const ep = endDateParam.split('-').map(Number);
        return {
          start: new Date(sp[0], sp[1] - 1, sp[2], 0, 0, 0, 0),
          end: new Date(ep[0], ep[1] - 1, ep[2], 23, 59, 59, 999),
        };
      }
      return { start: new Date(y, m, 1, 0, 0, 0, 0), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    }
    default:
      return { start: new Date(y, m, 1, 0, 0, 0, 0), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
  }
}
