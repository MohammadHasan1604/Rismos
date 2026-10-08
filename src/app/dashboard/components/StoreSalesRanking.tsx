'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import { isWithinDatePeriod } from '@/lib/dateUtils';

export default function StoreSalesRanking() {
  const {
    sales,
    storesList,
    customers,
    selectedStore,
    datePeriod,
    setDatePeriod,
    customDateRange,
    setCustomDateRange,
    formatCurrency,
    dateLocale,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'stores' | 'customers'>('stores');
  const [customStartDate, setCustomStartDate] = useState(customDateRange?.start || '');
  const [customEndDate, setCustomEndDate] = useState(customDateRange?.end || '');

  // Authoritative date range calculation from single source of truth
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Exclude refunded or non-completed sales
      if (sale.status === 'Refunded' || sale.status === 'Cancelled') return false;
      return isWithinDatePeriod(sale.createdAt, datePeriod, customDateRange);
    });
  }, [sales, datePeriod, customDateRange]);

  // Aggregate Store Sales Ranking
  const storeRankings = useMemo(() => {
    const storeMap: Record<
      string,
      {
        storeCode: string;
        storeName: string;
        revenue: number;
        grossProfit: number;
        invoiceCount: number;
        totalUnits: number;
        isSelected: boolean;
      }
    > = {};

    // Initialize with existing known stores
    storesList.forEach((st) => {
      storeMap[st.code] = {
        storeCode: st.code,
        storeName: st.name,
        revenue: 0,
        grossProfit: 0,
        invoiceCount: 0,
        totalUnits: 0,
        isSelected: selectedStore === st.code,
      };
    });

    // Aggregate from external customer sales
    filteredSales.forEach((sale) => {
      const code = sale.store || 'CENTRAL';
      if (!storeMap[code]) {
        const found = storesList.find((s) => s.code === code);
        storeMap[code] = {
          storeCode: code,
          storeName: found ? found.name : `Store ${code}`,
          revenue: 0,
          grossProfit: 0,
          invoiceCount: 0,
          totalUnits: 0,
          isSelected: selectedStore === code,
        };
      }

      const rev = Number(sale.total) || 0;
      const subtotal = Number(sale.subtotal) || rev;
      const gp =
        sale.grossProfit !== undefined &&
        sale.grossProfit !== null &&
        !isNaN(Number(sale.grossProfit))
          ? Number(sale.grossProfit)
          : Math.max(0, subtotal * 0.25);
      const units = sale.items?.reduce((acc, it) => acc + (it.qty || 1), 0) || 1;

      storeMap[code].revenue += rev;
      storeMap[code].grossProfit += gp;
      storeMap[code].invoiceCount += 1;
      storeMap[code].totalUnits += units;
    });

    const list = Object.values(storeMap).map((st) => {
      const avgInvoiceValue = st.invoiceCount > 0 ? Math.round(st.revenue / st.invoiceCount) : 0;
      return {
        ...st,
        avgInvoiceValue,
      };
    });

    // Sort by revenue descending
    return list.sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales, storesList, selectedStore]);

  // Aggregate Customer Sales Analytics
  const customerAnalytics = useMemo(() => {
    const custMap: Record<
      string,
      {
        id: string;
        name: string;
        phone: string;
        totalSpend: number;
        totalPurchases: number;
        invoiceCount: number;
        lastPurchase: string;
      }
    > = {};

    filteredSales.forEach((sale) => {
      const key = sale.customerPhone || sale.customerName || 'Walk-in';
      if (!custMap[key]) {
        const matched = customers.find(
          (c) => c.phone === sale.customerPhone || c.name === sale.customerName
        );
        custMap[key] = {
          id: matched?.id || key,
          name: sale.customerName || 'Walk-in Customer',
          phone: sale.customerPhone || '',
          totalSpend: 0,
          totalPurchases: 0,
          invoiceCount: 0,
          lastPurchase: sale.createdAt
            ? new Date(sale.createdAt).toLocaleDateString(dateLocale || 'en-IN')
            : 'N/A',
        };
      }

      custMap[key].totalSpend += Number(sale.total) || 0;
      custMap[key].totalPurchases += sale.items?.reduce((acc, it) => acc + (it.qty || 1), 0) || 1;
      custMap[key].invoiceCount += 1;
    });

    return Object.values(custMap).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredSales, customers]);

  const quickFilters = [
    'Today',
    'Yesterday',
    'Last 7 Days',
    'This Week',
    'This Month',
    'This Quarter',
    'This Year',
    'Custom Range',
  ];

  const handleQuickFilter = (f: string) => {
    if (f === 'Custom Range') {
      setDatePeriod('Custom Range');
      if (customStartDate && customEndDate) {
        setCustomDateRange({ start: customStartDate, end: customEndDate });
      }
      return;
    }
    setDatePeriod(f);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStartDate && customEndDate) {
      setCustomDateRange({ start: customStartDate, end: customEndDate });
      setDatePeriod('Custom Range');
    }
  };

  return (
    <div className="card p-5 space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-header text-sm sm:text-base font-bold text-foreground">
              {activeTab === 'stores' ? 'Store Sales Ranking' : 'Customer Sales Analytics'}
            </h2>
            <span className="badge-primary text-2xs px-2 py-0.5 rounded-full font-bold">
              {activeTab === 'stores'
                ? `${storeRankings.length} Stores`
                : `${customerAnalytics.length} Active Customers`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === 'stores'
              ? `Ranked by verified POS sales in ${datePeriod}`
              : `Top retail customers in ${datePeriod}`}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('stores')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'stores'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Stores
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'customers'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Customers
          </button>
        </div>
      </div>

      {/* Date Filter Badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {quickFilters.map((f) => (
          <button
            key={f}
            onClick={() => handleQuickFilter(f)}
            className={`px-2.5 py-1 rounded-md text-2xs font-semibold border transition-all ${
              datePeriod === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted/40'
            }`}
          >
            {f}
          </button>
        ))}

        {datePeriod === 'Custom Range' && (
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-2 mt-1 sm:mt-0">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="input-field text-2xs py-0.5 px-1.5 h-7"
            />
            <span className="text-2xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="input-field text-2xs py-0.5 px-1.5 h-7"
            />
            <button type="submit" className="btn-secondary text-2xs px-2 py-0.5 h-7">
              Apply
            </button>
          </form>
        )}
      </div>

      {/* Content */}
      {activeTab === 'stores' ? (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          {storeRankings.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No store sales in this period
            </div>
          ) : (
            storeRankings.map((st, idx) => {
              const isLead = idx === 0 && st.revenue > 0;
              const isSelected = selectedStore === st.storeCode;

              return (
                <div
                  key={st.storeCode}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border bg-card/50 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isLead
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-foreground truncate">
                          {st.storeCode}
                        </span>
                        <span className="text-3xs text-muted-foreground truncate">
                          · {st.storeName}
                        </span>
                        {isSelected && (
                          <span className="text-3xs bg-primary/20 text-primary px-1.5 py-0.2 rounded font-bold">
                            Current Scope
                          </span>
                        )}
                      </div>
                      <p className="text-3xs text-muted-foreground mt-0.5">
                        {st.invoiceCount} invoices · {st.totalUnits} units · Avg ticket {formatCurrency(st.avgInvoiceValue)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-foreground font-tabular">
                      {formatCurrency(st.revenue)}
                    </p>
                    <p className="text-3xs text-positive font-medium font-tabular mt-0.5">
                      GP: {formatCurrency(Math.round(st.grossProfit))}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          {customerAnalytics.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No customer sales recorded in this period
            </div>
          ) : (
            customerAnalytics.map((c, idx) => (
              <div
                key={c.id}
                className="p-3 rounded-xl border border-border bg-card/50 hover:bg-muted/30 transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-foreground truncate">{c.name}</p>
                    <p className="text-3xs text-muted-foreground mt-0.5">
                      {c.phone || 'No phone'} · {c.invoiceCount} orders ({c.totalPurchases} units)
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-foreground font-tabular">
                    {formatCurrency(c.totalSpend)}
                  </p>
                  <p className="text-3xs text-muted-foreground mt-0.5">Last: {c.lastPurchase}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
