import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  requireStoreScope,
} from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/reports/export — Export reports as CSV, Excel, or PDF
 * Query params:
 *   report: overview | suppliers | products | employees | all
 *   format: csv | excel | pdf
 *   store, period, startDate, endDate: same filters as /api/reports
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
    const report = searchParams.get('report') || 'overview';
    const format = searchParams.get('format') || 'csv';
    const requestedStore = searchParams.get('store');
    const period = searchParams.get('period') || 'This Month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    if (!['csv', 'excel', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'Invalid export format' }, { status: 400 });
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

    const storeLabel = storeFilter || 'All Stores';
    const periodLabel =
      period === 'Custom Range' ? `${startDateParam || ''} to ${endDateParam || ''}` : period;
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          module: 'Reports',
          action: `EXPORT_${report.toUpperCase()}_${format.toUpperCase()}`,
          details: `Exported ${report} as ${format}: ${period}, Store: ${storeLabel}`,
          userEmail: user.email,
          userRole: user.role,
          storeCode: storeFilter || 'ALL',
        },
      });
    } catch {}

    if (report === 'all') {
      return await exportAllReports(
        format,
        start,
        end,
        storeFilter,
        storeLabel,
        periodLabel,
        timestamp
      );
    }

    switch (report) {
      case 'overview':
        return await exportOverview(
          format,
          start,
          end,
          storeFilter,
          storeLabel,
          periodLabel,
          timestamp
        );
      case 'suppliers':
        return await exportSuppliers(
          format,
          start,
          end,
          storeFilter,
          storeLabel,
          periodLabel,
          timestamp
        );
      case 'products':
        return await exportProducts(
          format,
          start,
          end,
          storeFilter,
          storeLabel,
          periodLabel,
          timestamp
        );
      case 'employees':
        return await exportEmployees(
          format,
          start,
          end,
          storeFilter,
          storeLabel,
          periodLabel,
          timestamp
        );
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('API /api/reports/export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

// ─── Export Helpers ─────────────────────────────────────────────────────────

function csvResponse(content: string, filename: string) {
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function excelResponse(content: string, filename: string) {
  // CSV that opens cleanly in Excel with proper encoding
  const bom = '\uFEFF'; // UTF-8 BOM for Excel
  return new NextResponse(bom + content, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function pdfHtmlResponse(html: string, filename: string) {
  // Returns HTML for print-to-PDF (browser handles the rendering)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function csvEscape(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCurrency(val: number): string {
  return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildCsvHeader(
  reportName: string,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
): string {
  return `Report:,${csvEscape(reportName)}\nStore:,${csvEscape(storeLabel)}\nPeriod:,${csvEscape(periodLabel)}\nGenerated:,${csvEscape(timestamp)}\n\n`;
}

function buildPdfPage(
  title: string,
  storeLabel: string,
  periodLabel: string,
  timestamp: string,
  tableHtml: string
): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title} - RISMOS Reports</title>
<style>
  @media print { @page { size: landscape; margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #1a1a1a; margin: 20px; }
  h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; }
  .meta { font-size: 10px; color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  tr:last-child td { border-bottom: 2px solid #334155; font-weight: 700; }
  .right { text-align: right; }
  .currency { font-family: 'Cascadia Code', monospace; }
</style>
</head><body>
<h1>${title}</h1>
<div class="meta">Store: ${storeLabel} &nbsp;|&nbsp; Period: ${periodLabel} &nbsp;|&nbsp; Generated: ${timestamp}</div>
${tableHtml}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;
}

// ─── Export: Overview ───────────────────────────────────────────────────────

async function exportOverview(
  format: string,
  start: Date,
  end: Date,
  storeFilter: string | undefined,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
) {
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

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

  const rows = [
    ['Metric', 'Value'],
    ['Total Revenue', formatCurrency(Number(salesAgg._sum.grandTotal) || 0)],
    ['Gross Profit', formatCurrency(Number(salesAgg._sum.grossProfit) || 0)],
    ['Total COGS', formatCurrency(Number(salesAgg._sum.totalCost) || 0)],
    ['Tax Collected', formatCurrency(Number(salesAgg._sum.taxAmount) || 0)],
    ['Discounts Given', formatCurrency(Number(salesAgg._sum.discountAmount) || 0)],
    ['Invoice Count', String(salesAgg._count.id || 0)],
    [
      'Avg Order Value',
      formatCurrency(
        salesAgg._count.id ? (Number(salesAgg._sum.grandTotal) || 0) / salesAgg._count.id : 0
      ),
    ],
    [
      'Gross Margin %',
      salesAgg._count.id && Number(salesAgg._sum.grandTotal)
        ? (
            ((Number(salesAgg._sum.grossProfit) || 0) / (Number(salesAgg._sum.grandTotal) || 1)) *
            100
          ).toFixed(1) + '%'
        : '0%',
    ],
  ];

  if (format === 'pdf') {
    const tableHtml = `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</table>`;
    return pdfHtmlResponse(
      buildPdfPage('Executive Overview Report', storeLabel, periodLabel, timestamp, tableHtml),
      'overview_report.html'
    );
  }

  const csv =
    buildCsvHeader('Executive Overview Report', storeLabel, periodLabel, timestamp) +
    rows.map((r) => r.map(csvEscape).join(',')).join('\n') +
    '\n';

  return format === 'excel'
    ? excelResponse(csv, `overview_report_${storeLabel.replace(/\s+/g, '_')}.xls`)
    : csvResponse(csv, `overview_report_${storeLabel.replace(/\s+/g, '_')}.csv`);
}

// ─── Export: Suppliers ──────────────────────────────────────────────────────

async function exportSuppliers(
  format: string,
  start: Date,
  end: Date,
  storeFilter: string | undefined,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
) {
  const poWhere: any = {
    orderDate: { gte: start, lte: end },
    status: { notIn: ['Cancelled', 'Archived'] },
  };
  if (storeFilter) poWhere.storeCode = storeFilter;

  const purchases = await prisma.purchaseOrder.findMany({
    where: poWhere,
    include: {
      vendor: { select: { name: true, phone: true, code: true } },
      items: { select: { qtyOrdered: true } },
      payments: { select: { amount: true } },
    },
  });

  const vendorMap = new Map<string, any>();
  for (const po of purchases) {
    const vid = po.vendorId;
    if (!vendorMap.has(vid)) {
      vendorMap.set(vid, {
        name: po.vendor.name,
        code: po.vendor.code,
        phone: po.vendor.phone,
        orders: 0,
        units: 0,
        spend: 0,
        paid: 0,
        credits: 0,
        pending: 0,
      });
    }
    const v = vendorMap.get(vid)!;
    v.orders++;
    const t = Number(po.totalCost) || 0;
    const cr = Number(po.creditAmount) || 0;
    const pd =
      po.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) || Number(po.paidAmount) || 0;
    v.spend += t;
    v.paid += pd;
    v.credits += cr;
    v.pending += Math.max(0, t - pd - cr);
    for (const item of po.items) v.units += item.qtyOrdered;
  }

  const suppliers = Array.from(vendorMap.values()).sort((a, b) => b.spend - a.spend);

  const header = [
    'Supplier Name',
    'Code',
    'Phone',
    'Orders',
    'Units Purchased',
    'Avg Unit Price',
    'Total Purchases',
    'Amount Paid',
    'Credits',
    'Amount Pending',
  ];
  const rows = suppliers.map((s) => [
    s.name,
    s.code,
    s.phone,
    String(s.orders),
    String(s.units),
    formatCurrency(s.units > 0 ? s.spend / s.units : 0),
    formatCurrency(s.spend),
    formatCurrency(s.paid),
    formatCurrency(s.credits),
    formatCurrency(s.pending),
  ]);

  // Totals row
  const totals = suppliers.reduce(
    (a, s) => ({
      orders: a.orders + s.orders,
      units: a.units + s.units,
      spend: a.spend + s.spend,
      paid: a.paid + s.paid,
      credits: a.credits + s.credits,
      pending: a.pending + s.pending,
    }),
    { orders: 0, units: 0, spend: 0, paid: 0, credits: 0, pending: 0 }
  );
  rows.push([
    'TOTAL',
    '',
    '',
    String(totals.orders),
    String(totals.units),
    '',
    formatCurrency(totals.spend),
    formatCurrency(totals.paid),
    formatCurrency(totals.credits),
    formatCurrency(totals.pending),
  ]);

  if (format === 'pdf') {
    const ths = header.map((h) => `<th>${h}</th>`).join('');
    const trs = rows
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td class="${i >= 3 ? 'right currency' : ''}">${c}</td>`).join('')}</tr>`
      )
      .join('');
    return pdfHtmlResponse(
      buildPdfPage(
        'Supplier Procurement Report',
        storeLabel,
        periodLabel,
        timestamp,
        `<table><tr>${ths}</tr>${trs}</table>`
      ),
      'suppliers_report.html'
    );
  }

  const csv =
    buildCsvHeader('Supplier Procurement Report', storeLabel, periodLabel, timestamp) +
    [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') +
    '\n';

  return format === 'excel'
    ? excelResponse(csv, `suppliers_report_${storeLabel.replace(/\s+/g, '_')}.xls`)
    : csvResponse(csv, `suppliers_report_${storeLabel.replace(/\s+/g, '_')}.csv`);
}

// ─── Export: Products ───────────────────────────────────────────────────────

async function exportProducts(
  format: string,
  start: Date,
  end: Date,
  storeFilter: string | undefined,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
) {
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

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

  const productMap = new Map<string, any>();
  for (const item of saleItems) {
    const key = item.productId;
    if (!productMap.has(key))
      productMap.set(key, {
        name: item.productName,
        sku: item.sku,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      });
    const p = productMap.get(key)!;
    p.units += item.qty;
    p.revenue += Number(item.lineTotal) || 0;
    p.cost += (Number(item.unitCost) || 0) * item.qty;
    p.profit += Number(item.lineProfit) || 0;
  }

  const products = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);

  const header = [
    'Rank',
    'Product Name',
    'SKU',
    'Units Sold',
    'Revenue',
    'Cost',
    'Gross Profit',
    'Margin %',
  ];
  const rows = products.map((p, i) => [
    String(i + 1),
    p.name,
    p.sku,
    String(p.units),
    formatCurrency(p.revenue),
    formatCurrency(p.cost),
    formatCurrency(p.profit),
    p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + '%' : '0%',
  ]);

  const totals = products.reduce(
    (a, p) => ({
      units: a.units + p.units,
      revenue: a.revenue + p.revenue,
      cost: a.cost + p.cost,
      profit: a.profit + p.profit,
    }),
    { units: 0, revenue: 0, cost: 0, profit: 0 }
  );
  rows.push([
    '',
    'TOTAL',
    '',
    String(totals.units),
    formatCurrency(totals.revenue),
    formatCurrency(totals.cost),
    formatCurrency(totals.profit),
    totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) + '%' : '0%',
  ]);

  if (format === 'pdf') {
    const ths = header.map((h) => `<th>${h}</th>`).join('');
    const trs = rows
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td class="${i >= 3 ? 'right currency' : ''}">${c}</td>`).join('')}</tr>`
      )
      .join('');
    return pdfHtmlResponse(
      buildPdfPage(
        'Best-Selling & Most Profitable Products Report',
        storeLabel,
        periodLabel,
        timestamp,
        `<table><tr>${ths}</tr>${trs}</table>`
      ),
      'products_report.html'
    );
  }

  const csv =
    buildCsvHeader('Best-Selling Products Report', storeLabel, periodLabel, timestamp) +
    [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') +
    '\n';

  return format === 'excel'
    ? excelResponse(csv, `products_report_${storeLabel.replace(/\s+/g, '_')}.xls`)
    : csvResponse(csv, `products_report_${storeLabel.replace(/\s+/g, '_')}.csv`);
}

// ─── Export: Employees ──────────────────────────────────────────────────────

async function exportEmployees(
  format: string,
  start: Date,
  end: Date,
  storeFilter: string | undefined,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
) {
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

  const empMap = new Map<string, any>();
  for (const s of sales) {
    const name = s.cashierName || 'Sales Staff';
    if (!empMap.has(name))
      empMap.set(name, {
        name,
        stores: new Set(),
        invoices: 0,
        customers: new Set(),
        revenue: 0,
        profit: 0,
        cost: 0,
      });
    const e = empMap.get(name)!;
    e.invoices++;
    e.stores.add(s.storeCode);
    e.revenue += Number(s.grandTotal) || 0;
    e.profit += Number(s.grossProfit) || 0;
    e.cost += Number(s.totalCost) || 0;
    if (s.customerPhone) e.customers.add(s.customerPhone);
  }

  const employees = Array.from(empMap.values()).sort((a, b) => b.revenue - a.revenue);

  const header = [
    'Employee',
    'Store(s)',
    'Invoices',
    'Unique Customers',
    'Avg Order Value',
    'Total Revenue',
    'Gross Profit',
  ];
  const rows = employees.map((e) => [
    e.name,
    Array.from(e.stores).join(', '),
    String(e.invoices),
    String(e.customers.size),
    formatCurrency(e.invoices > 0 ? e.revenue / e.invoices : 0),
    formatCurrency(e.revenue),
    formatCurrency(e.profit),
  ]);

  const totals = employees.reduce(
    (a, e) => ({
      invoices: a.invoices + e.invoices,
      customers: a.customers + e.customers.size,
      revenue: a.revenue + e.revenue,
      profit: a.profit + e.profit,
    }),
    { invoices: 0, customers: 0, revenue: 0, profit: 0 }
  );
  rows.push([
    'TOTAL',
    '',
    String(totals.invoices),
    String(totals.customers),
    '',
    formatCurrency(totals.revenue),
    formatCurrency(totals.profit),
  ]);

  if (format === 'pdf') {
    const ths = header.map((h) => `<th>${h}</th>`).join('');
    const trs = rows
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td class="${i >= 2 ? 'right currency' : ''}">${c}</td>`).join('')}</tr>`
      )
      .join('');
    return pdfHtmlResponse(
      buildPdfPage(
        'Employee Productivity Report',
        storeLabel,
        periodLabel,
        timestamp,
        `<table><tr>${ths}</tr>${trs}</table>`
      ),
      'employees_report.html'
    );
  }

  const csv =
    buildCsvHeader('Employee Productivity Report', storeLabel, periodLabel, timestamp) +
    [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') +
    '\n';

  return format === 'excel'
    ? excelResponse(csv, `employees_report_${storeLabel.replace(/\s+/g, '_')}.xls`)
    : csvResponse(csv, `employees_report_${storeLabel.replace(/\s+/g, '_')}.csv`);
}

// ─── Export All Reports ─────────────────────────────────────────────────────

async function exportAllReports(
  format: string,
  start: Date,
  end: Date,
  storeFilter: string | undefined,
  storeLabel: string,
  periodLabel: string,
  timestamp: string
) {
  if (format === 'pdf') {
    // For PDF, redirect to overview (all-in-one PDF is complex without library)
    return exportOverview(format, start, end, storeFilter, storeLabel, periodLabel, timestamp);
  }

  // For CSV/Excel, combine all reports into one file with sections
  const salesWhere: any = {
    createdAt: { gte: start, lte: end },
    status: { notIn: ['Refunded', 'Cancelled', 'Voided'] },
  };
  if (storeFilter) salesWhere.storeCode = storeFilter;

  const poWhere: any = {
    orderDate: { gte: start, lte: end },
    status: { notIn: ['Cancelled', 'Archived'] },
  };
  if (storeFilter) poWhere.storeCode = storeFilter;

  // 1. Overview
  const salesAgg = await prisma.salesOrder.aggregate({
    where: salesWhere,
    _sum: { grandTotal: true, grossProfit: true, totalCost: true },
    _count: { id: true },
  });

  let csv = buildCsvHeader(
    'RISMOS Executive Analytics - All Reports',
    storeLabel,
    periodLabel,
    timestamp
  );
  csv += `=== EXECUTIVE OVERVIEW ===\n`;
  csv += `Total Revenue,${formatCurrency(Number(salesAgg._sum.grandTotal) || 0)}\n`;
  csv += `Gross Profit,${formatCurrency(Number(salesAgg._sum.grossProfit) || 0)}\n`;
  csv += `Total COGS,${formatCurrency(Number(salesAgg._sum.totalCost) || 0)}\n`;
  csv += `Invoice Count,${salesAgg._count.id || 0}\n\n`;

  // 2. Products
  const saleItems = await prisma.salesOrderItem.findMany({
    where: { order: salesWhere },
    select: {
      productId: true,
      productName: true,
      sku: true,
      qty: true,
      lineTotal: true,
      lineProfit: true,
      unitCost: true,
    },
  });
  const prodMap = new Map<string, any>();
  for (const item of saleItems) {
    const k = item.productId;
    if (!prodMap.has(k))
      prodMap.set(k, { name: item.productName, sku: item.sku, units: 0, revenue: 0, profit: 0 });
    const p = prodMap.get(k)!;
    p.units += item.qty;
    p.revenue += Number(item.lineTotal) || 0;
    p.profit += Number(item.lineProfit) || 0;
  }
  csv += `=== BEST-SELLING PRODUCTS ===\n`;
  csv += `Product Name,SKU,Units Sold,Revenue,Gross Profit,Margin %\n`;
  const prods = Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue);
  for (const p of prods) {
    csv += `${csvEscape(p.name)},${csvEscape(p.sku)},${p.units},${formatCurrency(p.revenue)},${formatCurrency(p.profit)},${p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + '%' : '0%'}\n`;
  }
  csv += '\n';

  // 3. Suppliers
  const purchases = await prisma.purchaseOrder.findMany({
    where: poWhere,
    include: {
      vendor: { select: { name: true } },
      items: { select: { qtyOrdered: true } },
      payments: { select: { amount: true } },
    },
  });
  const supMap = new Map<string, any>();
  for (const po of purchases) {
    const vid = po.vendorId;
    if (!supMap.has(vid))
      supMap.set(vid, { name: po.vendor.name, orders: 0, units: 0, spend: 0, paid: 0 });
    const s = supMap.get(vid)!;
    s.orders++;
    s.spend += Number(po.totalCost) || 0;
    s.paid +=
      po.payments.reduce((sm, p) => sm + (Number(p.amount) || 0), 0) || Number(po.paidAmount) || 0;
    for (const i of po.items) s.units += i.qtyOrdered;
  }
  csv += `=== SUPPLIER PROCUREMENT ===\n`;
  csv += `Supplier,Orders,Units,Total Purchases,Amount Paid,Pending\n`;
  for (const s of Array.from(supMap.values()).sort((a, b) => b.spend - a.spend)) {
    csv += `${csvEscape(s.name)},${s.orders},${s.units},${formatCurrency(s.spend)},${formatCurrency(s.paid)},${formatCurrency(Math.max(0, s.spend - s.paid))}\n`;
  }
  csv += '\n';

  // 4. Employees
  const empSales = await prisma.salesOrder.findMany({
    where: salesWhere,
    select: { cashierName: true, grandTotal: true, grossProfit: true },
  });
  const eMap = new Map<string, any>();
  for (const s of empSales) {
    const name = s.cashierName || 'Sales Staff';
    if (!eMap.has(name)) eMap.set(name, { name, invoices: 0, revenue: 0, profit: 0 });
    const e = eMap.get(name)!;
    e.invoices++;
    e.revenue += Number(s.grandTotal) || 0;
    e.profit += Number(s.grossProfit) || 0;
  }
  csv += `=== EMPLOYEE PRODUCTIVITY ===\n`;
  csv += `Employee,Invoices,Total Revenue,Gross Profit\n`;
  for (const e of Array.from(eMap.values()).sort((a, b) => b.revenue - a.revenue)) {
    csv += `${csvEscape(e.name)},${e.invoices},${formatCurrency(e.revenue)},${formatCurrency(e.profit)}\n`;
  }

  return format === 'excel'
    ? excelResponse(csv, `all_reports_${storeLabel.replace(/\s+/g, '_')}.xls`)
    : csvResponse(csv, `all_reports_${storeLabel.replace(/\s+/g, '_')}.csv`);
}

// ─── Date Range Helper ──────────────────────────────────────────────────────

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
