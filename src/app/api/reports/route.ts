import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireStoreScope } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/reports — Server-side aggregated reports
 * Query params:
 *   report: overview | suppliers | products | employees
 *   store: store code or 'All Stores'
 *   period: Today | Yesterday | Last 7 Days | Last 30 Days | This Week | This Month | Last Month | This Quarter | This Year | Custom Range
 *   startDate: YYYY-MM-DD (for Custom Range)
 *   endDate: YYYY-MM-DD (for Custom Range)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // RBAC: Require security level >= 80 (Store Manager+) for financial reports
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions for financial reports' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const report = searchParams.get('report') || 'overview';
    const requestedStore = searchParams.get('store');
    const period = searchParams.get('period') || 'This Month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Validate report type
    const validReports = ['overview', 'suppliers', 'products', 'employees'];
    if (!validReports.includes(report)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    // Build date range
    const { start, end } = getServerDateRange(period, startDateParam, endDateParam);

    // Store isolation
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

    const meta = {
      report,
      period,
      store: storeFilter || 'All Stores',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    let data: any = {};

    switch (report) {
      case 'overview':
        data = await getOverviewReport(start, end, storeFilter);
        break;
      case 'suppliers':
        data = await getSupplierReport(start, end, storeFilter);
        break;
      case 'products':
        data = await getProductReport(start, end, storeFilter);
        break;
      case 'employees':
        data = await getEmployeeReport(start, end, storeFilter);
        break;
    }

    // Non-blocking Audit Log
    prisma.auditLog
      .create({
        data: {
          module: 'Reports',
          action: `VIEW_REPORT_${report.toUpperCase()}`,
          details: `Generated ${report} report: ${period}, Store: ${storeFilter || 'All Stores'}`,
          userEmail: user.email,
          userRole: user.role,
          storeCode: storeFilter || 'ALL',
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { success: true, data, meta },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/reports GET error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}

// ─── Date Range Helper (server-side, no client dependencies) ────────────────

function getServerDateRange(
  period: string,
  startDateParam: string | null,
  endDateParam: string | null
): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

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
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      return {
        start: new Date(y, m, d + diffToMonday, 0, 0, 0, 0),
        end: new Date(y, m, d + diffToMonday + 6, 23, 59, 59, 999),
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

// ─── Overview Report ────────────────────────────────────────────────────────

async function getOverviewReport(start: Date, end: Date, storeFilter?: string) {
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

  const purchaseWhere: any = {
    orderDate: { gte: start, lte: end },
    status: { notIn: ['Cancelled', 'Archived'] },
  };
  if (storeFilter) purchaseWhere.storeCode = storeFilter;

  const inventoryWhere: any = {};
  if (storeFilter) inventoryWhere.storeCode = storeFilter;

  // Sales aggregation
  const salesAgg = await prisma.salesOrder.aggregate({
    where: salesWhere,
    _sum: {
      grandTotal: true,
      grossProfit: true,
      totalCost: true,
      taxAmount: true,
      discountAmount: true,
    },
    _count: { id: true },
  });

  // Purchase aggregation
  const purchaseAgg = await prisma.purchaseOrder.aggregate({
    where: purchaseWhere,
    _sum: { totalCost: true, paidAmount: true, creditAmount: true },
    _count: { id: true },
  });

  // Inventory valuation (current snapshot — not date-bounded)
  const inventoryItems = await prisma.inventory.findMany({
    where: inventoryWhere,
    include: { product: { select: { baseCostPrice: true, baseSellingPrice: true, status: true } } },
  });

  let totalInvCost = 0;
  let totalInvRetail = 0;
  let activeSKUs = 0;
  for (const inv of inventoryItems) {
    if (inv.product.status === 'deleted' || inv.product.status === 'archived') continue;
    totalInvCost += Number(inv.product.baseCostPrice) * inv.qtyOnHand;
    totalInvRetail += Number(inv.product.baseSellingPrice) * inv.qtyOnHand;
    if (inv.qtyOnHand > 0) activeSKUs++;
  }

  const totalRevenue = Number(salesAgg._sum.grandTotal) || 0;
  const totalGrossProfit = Number(salesAgg._sum.grossProfit) || 0;
  const totalCOGS = Number(salesAgg._sum.totalCost) || 0;
  const totalTax = Number(salesAgg._sum.taxAmount) || 0;
  const totalDiscount = Number(salesAgg._sum.discountAmount) || 0;
  const invoiceCount = salesAgg._count.id || 0;
  const avgOrderValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;
  const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const totalPurchaseSpend = Number(purchaseAgg._sum.totalCost) || 0;
  const totalPurchasePaid = Number(purchaseAgg._sum.paidAmount) || 0;
  const totalPurchaseCredits = Number(purchaseAgg._sum.creditAmount) || 0;
  const purchaseOrderCount = purchaseAgg._count.id || 0;

  return {
    totalRevenue,
    totalGrossProfit,
    totalCOGS,
    totalTax,
    totalDiscount,
    invoiceCount,
    avgOrderValue,
    grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    totalPurchaseSpend,
    totalPurchasePaid,
    totalPurchaseCredits,
    purchaseOrderCount,
    inventoryCostValue: Math.round(totalInvCost * 100) / 100,
    inventoryRetailValue: Math.round(totalInvRetail * 100) / 100,
    activeSKUs,
  };
}

// ─── Supplier Report ────────────────────────────────────────────────────────

async function getSupplierReport(start: Date, end: Date, storeFilter?: string) {
  const poWhere: any = {
    orderDate: { gte: start, lte: end },
    status: { notIn: ['Cancelled', 'Archived'] },
  };
  if (storeFilter) poWhere.storeCode = storeFilter;

  const purchases = await prisma.purchaseOrder.findMany({
    where: poWhere,
    include: {
      vendor: {
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          contactPerson: true,
          email: true,
          categories: true,
        },
      },
      items: { select: { qtyOrdered: true, unitCost: true, lineTotal: true } },
      payments: { select: { amount: true } },
    },
  });

  // Group by vendor
  const vendorMap = new Map<string, any>();
  for (const po of purchases) {
    const vid = po.vendorId;
    if (!vendorMap.has(vid)) {
      vendorMap.set(vid, {
        vendorId: vid,
        vendorCode: po.vendor.code,
        vendorName: po.vendor.name,
        vendorPhone: po.vendor.phone,
        vendorContact: po.vendor.contactPerson,
        vendorEmail: po.vendor.email,
        vendorCategories: po.vendor.categories,
        totalOrders: 0,
        totalUnits: 0,
        totalSpend: 0,
        totalPaid: 0,
        totalCredits: 0,
        totalPending: 0,
      });
    }
    const v = vendorMap.get(vid)!;
    v.totalOrders++;
    const poTotal = Number(po.totalCost) || 0;
    const poCredit = Number(po.creditAmount) || 0;
    const poPaid =
      po.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ||
      Number(po.paidAmount) ||
      0;
    v.totalSpend += poTotal;
    v.totalPaid += poPaid;
    v.totalCredits += poCredit;
    v.totalPending += Math.max(0, poTotal - poPaid - poCredit);
    for (const item of po.items) {
      v.totalUnits += item.qtyOrdered;
    }
  }

  const suppliers = Array.from(vendorMap.values()).map((v) => ({
    ...v,
    avgUnitPrice: v.totalUnits > 0 ? Math.round((v.totalSpend / v.totalUnits) * 100) / 100 : 0,
    totalSpend: Math.round(v.totalSpend * 100) / 100,
    totalPaid: Math.round(v.totalPaid * 100) / 100,
    totalCredits: Math.round(v.totalCredits * 100) / 100,
    totalPending: Math.round(v.totalPending * 100) / 100,
  }));

  suppliers.sort((a, b) => b.totalSpend - a.totalSpend);

  // Totals
  const totals = suppliers.reduce(
    (acc, s) => ({
      totalOrders: acc.totalOrders + s.totalOrders,
      totalUnits: acc.totalUnits + s.totalUnits,
      totalSpend: acc.totalSpend + s.totalSpend,
      totalPaid: acc.totalPaid + s.totalPaid,
      totalCredits: acc.totalCredits + s.totalCredits,
      totalPending: acc.totalPending + s.totalPending,
    }),
    { totalOrders: 0, totalUnits: 0, totalSpend: 0, totalPaid: 0, totalCredits: 0, totalPending: 0 }
  );

  return { suppliers, totals, recordCount: suppliers.length };
}

// ─── Product Report ─────────────────────────────────────────────────────────

async function getProductReport(start: Date, end: Date, storeFilter?: string) {
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

  // Get all sale items with their parent order's date/store filter applied
  const saleItems = await prisma.salesOrderItem.findMany({
    where: { order: salesWhere },
    select: {
      productId: true,
      productName: true,
      sku: true,
      qty: true,
      unitPrice: true,
      unitCost: true,
      lineTotal: true,
      lineProfit: true,
    },
  });

  // Group by product
  const productMap = new Map<string, any>();
  for (const item of saleItems) {
    const key = item.productId;
    if (!productMap.has(key)) {
      productMap.set(key, {
        productId: key,
        productName: item.productName,
        sku: item.sku,
        unitsSold: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
      });
    }
    const p = productMap.get(key)!;
    p.unitsSold += item.qty;
    p.totalRevenue += Number(item.lineTotal) || 0;
    p.totalCost += (Number(item.unitCost) || 0) * item.qty;
    p.totalProfit += Number(item.lineProfit) || 0;
  }

  const products = Array.from(productMap.values()).map((p) => ({
    ...p,
    totalRevenue: Math.round(p.totalRevenue * 100) / 100,
    totalCost: Math.round(p.totalCost * 100) / 100,
    totalProfit: Math.round(p.totalProfit * 100) / 100,
    grossMarginPct:
      p.totalRevenue > 0 ? Math.round((p.totalProfit / p.totalRevenue) * 1000) / 10 : 0,
  }));

  // Default sort by revenue desc
  products.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totals = products.reduce(
    (acc, p) => ({
      unitsSold: acc.unitsSold + p.unitsSold,
      totalRevenue: acc.totalRevenue + p.totalRevenue,
      totalCost: acc.totalCost + p.totalCost,
      totalProfit: acc.totalProfit + p.totalProfit,
    }),
    { unitsSold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 }
  );

  return { products, totals, recordCount: products.length };
}

// ─── Employee Report ────────────────────────────────────────────────────────

async function getEmployeeReport(start: Date, end: Date, storeFilter?: string) {
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

  const sales = await prisma.salesOrder.findMany({
    where: salesWhere,
    select: {
      cashierName: true,
      storeCode: true,
      grandTotal: true,
      grossProfit: true,
      totalCost: true,
      customerPhone: true,
    },
  });

  // Group by cashier
  const empMap = new Map<string, any>();
  for (const s of sales) {
    const name = s.cashierName || 'Sales Staff';
    if (!empMap.has(name)) {
      empMap.set(name, {
        employeeName: name,
        stores: new Set<string>(),
        invoices: 0,
        customers: new Set<string>(),
        totalRevenue: 0,
        totalGrossProfit: 0,
        totalCost: 0,
      });
    }
    const e = empMap.get(name)!;
    e.invoices++;
    e.stores.add(s.storeCode);
    e.totalRevenue += Number(s.grandTotal) || 0;
    e.totalGrossProfit += Number(s.grossProfit) || 0;
    e.totalCost += Number(s.totalCost) || 0;
    if (s.customerPhone) e.customers.add(s.customerPhone);
  }

  const employees = Array.from(empMap.values()).map((e) => ({
    employeeName: e.employeeName,
    stores: Array.from(e.stores) as string[],
    invoices: e.invoices,
    customerCount: e.customers.size,
    avgOrderValue: e.invoices > 0 ? Math.round((e.totalRevenue / e.invoices) * 100) / 100 : 0,
    totalRevenue: Math.round(e.totalRevenue * 100) / 100,
    totalGrossProfit: Math.round(e.totalGrossProfit * 100) / 100,
    totalCost: Math.round(e.totalCost * 100) / 100,
  }));

  employees.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totals = employees.reduce(
    (acc, e) => ({
      invoices: acc.invoices + e.invoices,
      customerCount: acc.customerCount + e.customerCount,
      totalRevenue: acc.totalRevenue + e.totalRevenue,
      totalGrossProfit: acc.totalGrossProfit + e.totalGrossProfit,
    }),
    { invoices: 0, customerCount: 0, totalRevenue: 0, totalGrossProfit: 0 }
  );

  return { employees, totals, recordCount: employees.length };
}
