'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';
import DrilldownModal from './DrilldownModal';
import { toast } from 'sonner';

type ReportTab = 'overview' | 'suppliers' | 'products' | 'employees';
type SortField = 'revenue' | 'profit' | 'units';

const DATE_PERIODS = [
  'Today',
  'Yesterday',
  'Last 7 Days',
  'Last 30 Days',
  'This Week',
  'This Month',
  'Last Month',
  'This Quarter',
  'This Year',
  'Custom Range',
];

export default function ReportsPage() {
  const { storesList, selectedStore, currentUser, formatCurrency, dateLocale } = useApp();

  // Local report filters (independent of global context for reports-specific control)
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const effectiveReportStore =
    currentUser.role === 'Super Admin' ? selectedStore || 'All Stores' : currentUser.store || 'BLR';
  const [reportStore, setReportStore] = useState(effectiveReportStore);
  const [reportPeriod, setReportPeriod] = useState('This Month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (currentUser.role !== 'Super Admin') {
      setReportStore(currentUser.store || 'BLR');
    } else {
      setReportStore(selectedStore || 'All Stores');
    }
  }, [currentUser.role, currentUser.store, selectedStore]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel' | 'pdf'>('csv');

  // Data
  const [overviewData, setOverviewData] = useState<any>(null);
  const [supplierData, setSupplierData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [productSort, setProductSort] = useState<SortField>('revenue');

  // Drilldown
  const [drilldown, setDrilldown] = useState<{
    isOpen: boolean;
    title: string;
    type: 'product-sales' | 'supplier-purchases' | 'employee-sales' | 'overview-sales';
    id: string;
  }>({ isOpen: false, title: '', type: 'overview-sales', id: '' });

  // Fetch auth headers
  const getHeaders = useCallback(() => {
    return { 'Content-Type': 'application/json' };
  }, []);

  // Fetch report data
  const fetchReport = useCallback(
    async (tab: ReportTab) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          report: tab,
          store: reportStore,
          period: reportPeriod,
        });
        if (reportPeriod === 'Custom Range') {
          if (customStart) params.set('startDate', customStart);
          if (customEnd) params.set('endDate', customEnd);
        }

        const res = await fetch(`/api/reports?${params.toString()}`, {
          credentials: 'include',
          headers: getHeaders(),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to load report');
          return;
        }

        const json = await res.json();
        if (json.success) {
          switch (tab) {
            case 'overview':
              setOverviewData(json.data);
              break;
            case 'suppliers':
              setSupplierData(json.data);
              break;
            case 'products':
              setProductData(json.data);
              break;
            case 'employees':
              setEmployeeData(json.data);
              break;
          }
        }
      } catch (err) {
        console.error('Report fetch error:', err);
        toast.error('Network error loading report');
      } finally {
        setLoading(false);
      }
    },
    [reportStore, reportPeriod, customStart, customEnd, getHeaders]
  );

  // Fetch on tab change or filter change
  useEffect(() => {
    fetchReport(activeTab);
  }, [activeTab, reportStore, reportPeriod, customStart, customEnd, fetchReport]);

  // Sorted products
  const sortedProducts = useMemo(() => {
    if (!productData?.products) return [];
    const prods = [...productData.products];
    switch (productSort) {
      case 'profit':
        return prods.sort((a: any, b: any) => b.totalProfit - a.totalProfit);
      case 'units':
        return prods.sort((a: any, b: any) => b.unitsSold - a.unitsSold);
      default:
        return prods.sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);
    }
  }, [productData, productSort]);

  // Export
  const handleExport = async (reportType: string) => {
    try {
      const params = new URLSearchParams({
        report: reportType,
        format: exportFormat,
        store: reportStore,
        period: reportPeriod,
      });
      if (reportPeriod === 'Custom Range') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }

      const res = await fetch(`/api/reports/export?${params.toString()}`, {
        credentials: 'include',
        headers: getHeaders(),
      });

      if (!res.ok) {
        toast.error('Export failed');
        return;
      }

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
        // PDF — open in new tab for print
        const html = await res.text();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
        toast.success('PDF print view opened');
        return;
      }

      // CSV / Excel — download blob
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] || `${reportType}_report.${exportFormat === 'excel' ? 'xls' : 'csv'}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Export failed');
    }
  };

  const fmt = (v: number | undefined | null) =>
    (v ?? 0).toLocaleString(dateLocale || 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDec = (v: number | undefined | null) =>
    (v ?? 0).toLocaleString(dateLocale || 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const openDrilldown = (
    type: 'product-sales' | 'supplier-purchases' | 'employee-sales' | 'overview-sales',
    id: string,
    title: string
  ) => {
    setDrilldown({ isOpen: true, type, id, title });
  };

  return (
    <AppLayout activeRoute="/reports">
      <div className="space-y-4 md:space-y-6 fade-in">
        {/* Page Header + Filters */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">Analytics & reconciled financials</p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Store Filter (SUPER ADMIN ONLY) */}
          {currentUser.role === 'Super Admin' && (
            <select
              value={reportStore}
              onChange={(e) => setReportStore(e.target.value)}
              className="input-field text-xs py-2 px-3"
            >
              <option value="All Stores">All Stores</option>
              {storesList.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}

          {/* Date Filter */}
          <select
            value={reportPeriod}
            onChange={(e) => setReportPeriod(e.target.value)}
            className="input-field text-xs py-2 px-3"
          >
            {DATE_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Custom Range Inputs */}
          {reportPeriod === 'Custom Range' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="input-field text-xs py-2 px-2"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="input-field text-xs py-2 px-2"
              />
            </>
          )}

          {/* Export Format */}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as any)}
            className="input-field text-xs py-2 px-3 w-20"
          >
            <option value="csv">CSV</option>
            <option value="excel">Excel</option>
            <option value="pdf">PDF</option>
          </select>

          {/* Export Buttons */}
          <button onClick={() => handleExport(activeTab)} className="btn-secondary btn-sm gap-1">
            <Icon name="ArrowDownTrayIcon" size={13} />{' '}
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => handleExport('all')} className="btn-primary btn-sm gap-1">
            <Icon name="ArrowDownTrayIcon" size={13} />{' '}
            <span className="hidden sm:inline">All</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Executive Overview', icon: 'ChartBarIcon' },
              { id: 'suppliers', label: 'Supplier Procurement', icon: 'TruckIcon' },
              { id: 'products', label: 'Best-Selling Products', icon: 'CubeIcon' },
              { id: 'employees', label: 'Employee Productivity', icon: 'UserGroupIcon' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon name={tab.icon as any} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            <span className="ml-3 text-sm text-muted-foreground">Loading report data...</span>
          </div>
        )}

        {/* ═══ OVERVIEW TAB ═══ */}
        {!loading && activeTab === 'overview' && overviewData && (
          <div className="space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => openDrilldown('overview-sales', '', 'All Sales — Revenue Breakdown')}
                className="card p-4 space-y-1 text-left hover:border-primary/30 transition-colors cursor-pointer"
              >
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Total Sales Revenue
                </span>
                <p className="text-2xl font-extrabold text-foreground font-tabular">
                  {fmt(overviewData.totalRevenue)}
                </p>
                <span className="badge-success text-3xs">{overviewData.invoiceCount} Invoices</span>
              </button>

              <button
                onClick={() => openDrilldown('overview-sales', '', 'All Sales — Profit Breakdown')}
                className="card p-4 space-y-1 text-left hover:border-primary/30 transition-colors cursor-pointer"
              >
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Gross Trading Profit
                </span>
                <p className="text-2xl font-extrabold text-success font-tabular">
                  {fmt(overviewData.totalGrossProfit)}
                </p>
                <span className="text-2xs text-muted-foreground font-tabular">
                  Margin: {overviewData.grossMarginPct}%
                </span>
              </button>

              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Cost of Goods Sold
                </span>
                <p className="text-2xl font-extrabold text-foreground font-tabular">
                  {fmt(overviewData.totalCOGS)}
                </p>
                <span className="text-2xs text-muted-foreground font-tabular">
                  Avg Order: {fmtDec(overviewData.avgOrderValue)}
                </span>
              </div>

              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Total Purchase Spend
                </span>
                <p className="text-2xl font-extrabold text-info font-tabular">
                  {fmt(overviewData.totalPurchaseSpend)}
                </p>
                <span className="badge-info text-3xs">
                  {overviewData.purchaseOrderCount} Purchase Orders
                </span>
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tax Collected
                </span>
                <p className="text-lg font-bold text-foreground font-tabular">
                  {fmt(overviewData.totalTax)}
                </p>
              </div>
              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Discounts Given
                </span>
                <p className="text-lg font-bold text-warning font-tabular">
                  {fmt(overviewData.totalDiscount)}
                </p>
              </div>
              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Inventory Cost Value
                </span>
                <p className="text-lg font-bold text-foreground font-tabular">
                  {fmt(overviewData.inventoryCostValue)}
                </p>
                <span className="text-2xs text-muted-foreground">
                  {overviewData.activeSKUs} active SKUs
                </span>
              </div>
              <div className="card p-4 space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Inventory Retail Value
                </span>
                <p className="text-lg font-bold text-info font-tabular">
                  {fmt(overviewData.inventoryRetailValue)}
                </p>
                <span className="badge-info text-3xs">
                  Unrealized:{' '}
                  {fmt(
                    (overviewData.inventoryRetailValue || 0) -
                      (overviewData.inventoryCostValue || 0)
                  )}
                </span>
              </div>
            </div>

            {/* Quick Report Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="card p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Icon name="ChartBarIcon" size={20} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Sales Performance Report</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Detailed breakdown of {overviewData.invoiceCount} transactions — revenue,
                    profit, COGS, and margins.
                  </p>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-2xs font-mono text-muted-foreground">
                    Revenue: {fmt(overviewData.totalRevenue)}
                  </span>
                  <button
                    onClick={() => handleExport('overview')}
                    className="btn-primary text-xs gap-1.5 py-1.5"
                  >
                    <Icon name="ArrowDownTrayIcon" size={14} /> Download
                  </button>
                </div>
              </div>

              <div className="card p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center mb-3">
                    <Icon name="CubeIcon" size={20} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Inventory Valuation</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cost: {fmt(overviewData.inventoryCostValue)} vs Retail:{' '}
                    {fmt(overviewData.inventoryRetailValue)}.
                  </p>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-2xs font-mono text-muted-foreground">
                    {overviewData.activeSKUs} active SKUs
                  </span>
                  <button
                    onClick={() => handleExport('overview')}
                    className="btn-primary text-xs gap-1.5 py-1.5"
                  >
                    <Icon name="ArrowDownTrayIcon" size={14} /> Export
                  </button>
                </div>
              </div>

              <div className="card p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center mb-3">
                    <Icon name="TruckIcon" size={20} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Procurement Summary</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {overviewData.purchaseOrderCount} purchase orders totaling{' '}
                    {fmt(overviewData.totalPurchaseSpend)}.
                  </p>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-2xs font-mono text-muted-foreground">
                    Paid: {fmt(overviewData.totalPurchasePaid)}
                  </span>
                  <button
                    onClick={() => handleExport('suppliers')}
                    className="btn-primary text-xs gap-1.5 py-1.5"
                  >
                    <Icon name="ArrowDownTrayIcon" size={14} /> Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SUPPLIERS TAB ═══ */}
        {!loading && activeTab === 'suppliers' && supplierData && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Supplier Procurement & Payables Summary
                </h3>
                <p className="text-xs text-muted-foreground">
                  {supplierData.recordCount} suppliers · Total spend:{' '}
                  {formatCurrency(supplierData.totals?.totalSpend || 0)} · {reportPeriod}
                </p>
              </div>
              <button
                onClick={() => handleExport('suppliers')}
                className="btn-secondary text-xs gap-1.5 py-1.5"
              >
                <Icon name="ArrowDownTrayIcon" size={14} /> Export {exportFormat.toUpperCase()}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Supplier Name
                    </th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Units Purchased</th>
                    <th className="px-4 py-3 text-right">Avg Unit Price</th>
                    <th className="px-4 py-3 text-right">Total Purchases</th>
                    <th className="px-4 py-3 text-right">Amount Paid</th>
                    <th className="px-4 py-3 text-right">Credits</th>
                    <th className="px-4 py-3 text-right">Amount Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {supplierData.suppliers?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        No supplier procurement records found for this period.
                      </td>
                    </tr>
                  ) : (
                    supplierData.suppliers?.map((s: any) => (
                      <tr
                        key={s.vendorId}
                        onClick={() =>
                          openDrilldown(
                            'supplier-purchases',
                            s.vendorId,
                            `Purchase Orders — ${s.vendorName}`
                          )
                        }
                        className="hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-bold text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          {s.vendorName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-2xs">
                          {s.vendorPhone}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular">{s.totalOrders}</td>
                        <td className="px-4 py-3 text-right font-tabular">
                          {s.totalUnits.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular">
                          {fmtDec(s.avgUnitPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground font-tabular">
                          {fmt(s.totalSpend)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular text-success font-semibold">
                          {fmt(s.totalPaid)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                          {fmt(s.totalCredits)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular text-danger font-semibold">
                          {fmt(s.totalPending)}
                        </td>
                      </tr>
                    ))
                  )}
                  {/* Totals Row */}
                  {supplierData.totals && supplierData.suppliers?.length > 0 && (
                    <tr className="border-t-2 border-foreground/20 bg-muted/20 font-bold">
                      <td className="px-4 py-3 text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        TOTAL ({supplierData.recordCount} suppliers)
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {supplierData.totals.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {supplierData.totals.totalUnits.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular"></td>
                      <td className="px-4 py-3 text-right font-tabular text-foreground">
                        {fmt(supplierData.totals.totalSpend)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-success">
                        {fmt(supplierData.totals.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                        {fmt(supplierData.totals.totalCredits)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-danger">
                        {fmt(supplierData.totals.totalPending)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ PRODUCTS TAB ═══ */}
        {!loading && activeTab === 'products' && productData && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Top-Selling & Most Profitable Products
                </h3>
                <p className="text-xs text-muted-foreground">
                  {productData.recordCount} products · Revenue:{' '}
                  {fmt(productData.totals?.totalRevenue || 0)} · Profit:{' '}
                  {fmt(productData.totals?.totalProfit || 0)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-muted/50 rounded-lg p-0.5">
                  {(['revenue', 'profit', 'units'] as const).map((sf) => (
                    <button
                      key={sf}
                      onClick={() => setProductSort(sf)}
                      className={`px-3 py-1.5 rounded-md text-2xs font-bold transition-colors ${productSort === sf ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      By {sf === 'revenue' ? 'Revenue' : sf === 'profit' ? 'Profit' : 'Units'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleExport('products')}
                  className="btn-secondary text-xs gap-1.5 py-1.5"
                >
                  <Icon name="ArrowDownTrayIcon" size={14} /> Export {exportFormat.toUpperCase()}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Product Name
                    </th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Units Sold</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Cost (at Sale)</th>
                    <th className="px-4 py-3 text-right">Gross Profit</th>
                    <th className="px-4 py-3 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {sortedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No product sales recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    sortedProducts.map((p: any, idx: number) => (
                      <tr
                        key={p.productId}
                        onClick={() =>
                          openDrilldown('product-sales', p.productId, `Sales — ${p.productName}`)
                        }
                        className="hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-bold text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <span className="text-muted-foreground font-mono text-2xs mr-2">
                            {idx + 1}.
                          </span>
                          {p.productName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-2xs">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold">
                          {p.unitsSold}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold text-foreground">
                          {fmt(p.totalRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                          {fmt(p.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold text-success">
                          {fmt(p.totalProfit)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                          {p.grossMarginPct}%
                        </td>
                      </tr>
                    ))
                  )}
                  {/* Totals Row */}
                  {productData.totals && sortedProducts.length > 0 && (
                    <tr className="border-t-2 border-foreground/20 bg-muted/20 font-bold">
                      <td className="px-4 py-3 text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        TOTAL ({productData.recordCount} products)
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {productData.totals.unitsSold}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-foreground">
                        {fmt(productData.totals.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                        {fmt(productData.totals.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-success">
                        {fmt(productData.totals.totalProfit)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {productData.totals.totalRevenue > 0
                          ? (
                              (productData.totals.totalProfit / productData.totals.totalRevenue) *
                              100
                            ).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ EMPLOYEES TAB ═══ */}
        {!loading && activeTab === 'employees' && employeeData && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Employee Sales & Productivity Report
                </h3>
                <p className="text-xs text-muted-foreground">
                  {employeeData.recordCount} employees · {employeeData.totals?.invoices || 0} total
                  invoices · {reportPeriod}
                </p>
              </div>
              <button
                onClick={() => handleExport('employees')}
                className="btn-secondary text-xs gap-1.5 py-1.5"
              >
                <Icon name="ArrowDownTrayIcon" size={14} /> Export {exportFormat.toUpperCase()}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Employee Name
                    </th>
                    <th className="px-4 py-3">Store(s)</th>
                    <th className="px-4 py-3 text-right">Invoices</th>
                    <th className="px-4 py-3 text-right">Unique Customers</th>
                    <th className="px-4 py-3 text-right">Avg Order Value</th>
                    <th className="px-4 py-3 text-right">Total Revenue</th>
                    <th className="px-4 py-3 text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {employeeData.employees?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No employee sales recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    employeeData.employees?.map((emp: any, idx: number) => (
                      <tr
                        key={`emp-${idx}`}
                        onClick={() =>
                          openDrilldown(
                            'employee-sales',
                            emp.employeeName,
                            `Sales by ${emp.employeeName}`
                          )
                        }
                        className="hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-bold text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          {emp.employeeName}
                        </td>
                        <td className="px-4 py-3">
                          {emp.stores?.map((s: string) => (
                            <span key={s} className="badge-info text-3xs mr-1">
                              {s}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold">
                          {emp.invoices}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular">{emp.customerCount}</td>
                        <td className="px-4 py-3 text-right font-tabular">
                          {fmtDec(emp.avgOrderValue)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold text-foreground">
                          {fmt(emp.totalRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-bold text-success">
                          {fmt(emp.totalGrossProfit)}
                        </td>
                      </tr>
                    ))
                  )}
                  {/* Totals Row */}
                  {employeeData.totals && employeeData.employees?.length > 0 && (
                    <tr className="border-t-2 border-foreground/20 bg-muted/20 font-bold">
                      <td className="px-4 py-3 text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        TOTAL ({employeeData.recordCount} employees)
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {employeeData.totals.invoices}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {employeeData.totals.customerCount}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular"></td>
                      <td className="px-4 py-3 text-right font-tabular text-foreground">
                        {fmt(employeeData.totals.totalRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-success">
                        {fmt(employeeData.totals.totalGrossProfit)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Drilldown Modal */}
      <DrilldownModal
        isOpen={drilldown.isOpen}
        onClose={() => setDrilldown((d) => ({ ...d, isOpen: false }))}
        title={drilldown.title}
        type={drilldown.type}
        id={drilldown.id}
        store={reportStore}
        period={reportPeriod}
        startDate={reportPeriod === 'Custom Range' ? customStart : undefined}
        endDate={reportPeriod === 'Custom Range' ? customEnd : undefined}
      />
    </AppLayout>
  );
}
