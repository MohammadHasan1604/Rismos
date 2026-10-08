'use client';

import React, { useState, useMemo } from 'react';
import KpiCard from './KpiCard';
import PendingVendorBillsModal from './PendingVendorBillsModal';
import { useApp } from '@/context/AppContext';
import { isWithinDatePeriod, getPreviousDateRange } from '@/lib/dateUtils';

export default function KpiBentoGrid() {
  const {
    sales,
    inventory,
    expenses,
    vendors,
    purchases,
    customers,
    storesList,
    usersList,
    selectedStore,
    datePeriod,
    customDateRange,
    currentUser,
    formatCurrency,
  } = useApp();

  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isSalesManager = currentUser.role === 'Sales Manager';

  const [vendorModalOpen, setVendorModalOpen] = useState(false);

  // Pre-index inventory cost map for O(1) lookups instead of O(N) per item per sale
  const invCostMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      if (inv.productId) map.set(inv.productId, inv.costPrice || 0);
      if (inv.sku) map.set(inv.sku, inv.costPrice || 0);
      if (inv.name) map.set(inv.name, inv.costPrice || 0);
    }
    return map;
  }, [inventory]);

  const {
    filteredSales,
    totalRevenue,
    prevRevenue,
    revChange,
    revTrend,
    grossProfit,
    grossMarginPct,
    filteredExpenses,
    totalExp,
    netProfit,
    invValue,
    filteredInv,
    receivablesTotal,
    pendingReceivablesCount,
    activePendingBills,
    payablesTotal,
    pendingBillsCount,
    activeOutletsCount,
  } = useMemo(() => {
    // Store filter matcher
    const matchStore = (storeCode?: string) =>
      selectedStore === 'All Stores' || storeCode === selectedStore;

    // Real Sales Filtering by store & period
    const filteredSales = sales.filter((s) => {
      const isStore = matchStore(s.store);
      const isDate = isWithinDatePeriod(s.createdAt, datePeriod, customDateRange);
      const isValid = s.status !== 'Refunded' && s.status !== 'Cancelled' && s.status !== 'Voided';
      return isStore && isDate && isValid;
    });

    // Prior Period Sales for calculating real % trend
    const prevDateRange = getPreviousDateRange(datePeriod, customDateRange);
    const prevSales = sales.filter((s) => {
      const isStore = matchStore(s.store);
      const isValid = s.status !== 'Refunded' && s.status !== 'Cancelled' && s.status !== 'Voided';
      if (!s.createdAt) return false;
      const t = new Date(s.createdAt).getTime();
      return (
        isStore && isValid && t >= prevDateRange.start.getTime() && t <= prevDateRange.end.getTime()
      );
    });

    const totalRevenue = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const prevRevenue = prevSales.reduce((acc, s) => acc + (s.total || 0), 0);

    let revChange = '0%';
    let revTrend: 'up' | 'down' | 'neutral' = 'neutral';
    if (prevRevenue > 0) {
      const diffPct = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
      revChange = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;
      revTrend = diffPct >= 0 ? 'up' : 'down';
    } else if (totalRevenue > 0) {
      revChange = '+100%';
      revTrend = 'up';
    }

    // Authoritative Gross Profit from DB records
    const grossProfit = filteredSales.reduce((acc, s) => {
      if (s.grossProfit !== undefined && s.grossProfit !== null && !isNaN(Number(s.grossProfit))) {
        return acc + Number(s.grossProfit);
      }
      const saleCost =
        s.totalCost !== undefined && s.totalCost !== null && !isNaN(Number(s.totalCost))
          ? Number(s.totalCost)
          : s.items?.reduce((itemAcc, it) => {
              const unitCost =
                (it.itemId && invCostMap.get(it.itemId)) ||
                (it.sku && invCostMap.get(it.sku)) ||
                (it.name && invCostMap.get(it.name)) ||
                0;
              return itemAcc + unitCost * it.qty;
            }, 0) || 0;
      return acc + Math.max(0, (s.total || 0) - saleCost);
    }, 0);

    const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0';

    // Authoritative Operational Expenses scoped to store & date period
    const filteredExpenses = expenses.filter((e) => {
      const isStore = matchStore(e.store);
      const isDate = isWithinDatePeriod(e.date, datePeriod, customDateRange);
      const isValid = e.status !== 'Rejected';
      return isStore && isDate && isValid;
    });
    const totalExp = filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    // Net Profit = Gross Profit - Operating Expenses
    const netProfit = grossProfit - totalExp;

    // Inventory Asset Value (point-in-time balance in store scope)
    const filteredInv =
      selectedStore === 'All Stores'
        ? inventory
        : inventory.filter((i) => i.store === selectedStore);
    const invValue = filteredInv.reduce(
      (acc, i) => acc + (i.costPrice || 0) * (i.qtyOnHand || 0),
      0
    );

    // Customer Receivables (outstanding customer credit balance)
    const receivablesTotal = customers.reduce((acc, c) => acc + (c.creditBalance || 0), 0);
    const pendingReceivablesCount = customers.filter((c) => (c.creditBalance || 0) > 0).length;

    // Authoritative Vendor Payables: Active, non-cancelled purchase orders in store scope
    const activePendingBills = purchases.filter((p) => {
      const isStore = matchStore(p.store);
      const isNotCancelled = p.status !== 'Cancelled' && p.status !== 'Archived';
      const isUnpaid = p.paymentStatus !== 'Paid';
      const rem =
        p.remainingAmount !== undefined
          ? p.remainingAmount
          : p.totalAmount - (p.paidAmount || 0) - (p.creditAmount || 0);
      return isStore && isNotCancelled && isUnpaid && rem > 0.005;
    });

    const payablesTotal = activePendingBills.reduce((acc, p) => {
      const rem =
        p.remainingAmount !== undefined
          ? p.remainingAmount
          : Math.max(0, p.totalAmount - (p.paidAmount || 0) - (p.creditAmount || 0));
      return acc + rem;
    }, 0);
    const pendingBillsCount = activePendingBills.length;

    // Active Outlets count
    const activeOutletsCount =
      selectedStore === 'All Stores' ? storesList.filter((s) => s.status === 'Active').length : 1;

    return {
      filteredSales,
      totalRevenue,
      prevRevenue,
      revChange,
      revTrend,
      grossProfit,
      grossMarginPct,
      filteredExpenses,
      totalExp,
      netProfit,
      invValue,
      filteredInv,
      receivablesTotal,
      pendingReceivablesCount,
      activePendingBills,
      payablesTotal,
      pendingBillsCount,
      activeOutletsCount,
    };
  }, [
    sales,
    inventory,
    expenses,
    purchases,
    customers,
    storesList,
    selectedStore,
    datePeriod,
    customDateRange,
    invCostMap,
  ]);

  const displayPeriodLabel =
    datePeriod === 'Custom Range' && customDateRange?.start && customDateRange?.end
      ? `${customDateRange.start} → ${customDateRange.end}`
      : datePeriod;

  const kpiCards = [
    {
      id: 'kpi-revenue',
      label: `Total Sales Revenue (${datePeriod})`,
      value: formatCurrency(totalRevenue),
      change: revChange,
      trend: revTrend,
      subtext: `vs prev period · ${filteredSales.length} orders`,
      icon: 'CurrencyRupeeIcon',
      variant: 'hero' as const,
      color: 'primary' as const,
    },
    {
      id: 'kpi-gross-profit',
      label: 'Gross Profit',
      value: formatCurrency(Math.round(grossProfit)),
      change: grossProfit > 0 ? `${grossMarginPct}% margin` : '0%',
      trend: grossProfit > 0 ? ('up' as const) : ('neutral' as const),
      subtext: totalRevenue > 0 ? `Cost of goods deducted` : 'No sales recorded',
      icon: 'ArrowTrendingUpIcon',
      variant: 'normal' as const,
      color: 'positive' as const,
    },
    {
      id: 'kpi-net-profit',
      label: 'Net Profit',
      value: formatCurrency(Math.round(netProfit)),
      change: netProfit > 0 ? 'Profitable' : netProfit < 0 ? 'Operating Loss' : formatCurrency(0),
      trend: netProfit >= 0 ? ('up' as const) : ('down' as const),
      subtext: `After ${formatCurrency(totalExp)} store expenses`,
      icon: 'ChartPieIcon',
      variant: 'normal' as const,
      color: netProfit >= 0 ? ('warning' as const) : ('danger' as const),
    },
    {
      id: 'kpi-expenses',
      label: 'Total Expenses',
      value: formatCurrency(totalExp),
      change: `${filteredExpenses.length} entries`,
      trend: totalExp > 0 ? ('down' as const) : ('neutral' as const),
      subtext: `Operating costs in ${datePeriod}`,
      icon: 'ReceiptPercentIcon',
      variant: 'normal' as const,
      color: 'danger' as const,
    },
    {
      id: 'kpi-inventory',
      label: isSalesManager ? 'Stock Status' : 'Inventory Asset Value',
      value: isSalesManager
        ? `${filteredInv.reduce((acc: number, i: any) => acc + (i.qtyOnHand || 0), 0)} Units`
        : formatCurrency(invValue),
      change: `${filteredInv.length} SKUs`,
      trend: 'neutral' as const,
      subtext: isSalesManager
        ? `${filteredInv.length} active inventory products`
        : `${filteredInv.reduce((acc: number, i: any) => acc + (i.qtyOnHand || 0), 0)} units on hand`,
      icon: 'CubeIcon',
      variant: 'normal' as const,
      color: 'info' as const,
    },
    {
      id: 'kpi-transactions',
      label: 'Store Transactions',
      value: `${filteredSales.length} Orders`,
      change: `${customers.length} Customers`,
      trend: 'neutral' as const,
      subtext: `Operational transactions in ${datePeriod}`,
      icon: 'ShoppingCartIcon',
      variant: 'normal' as const,
      color: 'positive' as const,
    },
    {
      id: 'kpi-receivables',
      label: 'Receivables',
      value: formatCurrency(receivablesTotal),
      change: `${pendingReceivablesCount} pending accounts`,
      trend: receivablesTotal > 0 ? ('alert' as const) : ('neutral' as const),
      subtext: `${customers.length} total customer accounts`,
      icon: 'ClockIcon',
      variant: 'normal' as const,
      color: 'warning' as const,
    },
    {
      id: 'kpi-payables',
      label: 'Vendor Payables',
      value: formatCurrency(payablesTotal),
      change: `${pendingBillsCount} pending bill${pendingBillsCount === 1 ? '' : 's'}`,
      trend: payablesTotal > 0 ? ('alert' as const) : ('neutral' as const),
      subtext: pendingBillsCount > 0 ? 'Click to view & settle bills' : 'All vendor bills settled',
      icon: 'BuildingStorefrontIcon',
      variant: 'normal' as const,
      color: 'neutral' as const,
      clickable: true,
      drillDownLabel: 'Drill down',
      onClick: () => setVendorModalOpen(true),
    },
    {
      id: 'kpi-stores',
      label: 'Active Outlets',
      value: selectedStore === 'All Stores' ? `${activeOutletsCount} Outlets` : selectedStore,
      change: `${usersList.length} staff`,
      trend: 'neutral' as const,
      subtext: storesList
        .map((s) => s.code)
        .slice(0, 4)
        .join(' · '),
      icon: 'MapPinIcon',
      variant: 'normal' as const,
      color: 'info' as const,
    },
  ];

  const visibleKpiCards = useMemo(() => {
    return kpiCards.filter((card) => {
      if (card.id === 'kpi-stores') return isSuperAdmin;
      if (card.id === 'kpi-transactions') return isSalesManager;
      if (
        isSalesManager &&
        (card.id === 'kpi-gross-profit' ||
          card.id === 'kpi-net-profit' ||
          card.id === 'kpi-expenses' ||
          card.id === 'kpi-payables' ||
          card.id === 'kpi-receivables')
      ) {
        return false;
      }
      return true;
    });
  }, [kpiCards, isSuperAdmin, isSalesManager]);

  return (
    <>
      {/* Hero KPI - full width on mobile */}
      {visibleKpiCards.length > 0 && (
        <div className="mb-3 md:mb-4">
          <KpiCard {...visibleKpiCards[0]} />
        </div>
      )}

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {visibleKpiCards
          .slice(1)
          .filter((kpi) => kpi.id !== 'kpi-stores')
          .map((kpi) => (
            <KpiCard key={kpi.id} {...kpi} />
          ))}
      </div>

      {/* Stores KPI (Super Admin only) */}
      {isSuperAdmin && (
        <div className="mt-3 md:mt-4">
          <KpiCard {...kpiCards[kpiCards.length - 1]} />
        </div>
      )}

      {/* Vendor Payables Drill-Down Modal (Only accessible if not Sales Manager) */}
      {!isSalesManager && (
        <PendingVendorBillsModal open={vendorModalOpen} onClose={() => setVendorModalOpen(false)} />
      )}
    </>
  );
}
