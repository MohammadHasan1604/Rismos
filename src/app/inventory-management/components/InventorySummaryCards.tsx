'use client';
import React, { useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';

interface InventorySummaryCardsProps {
  categoryFilter?: string;
  storeScope?: string;
}

export default function InventorySummaryCards({
  categoryFilter,
  storeScope,
}: InventorySummaryCardsProps) {
  const { inventory, selectedStore, formatCurrency, dateLocale } = useApp();
  const activeStore = storeScope || selectedStore;

  const { totalSKUs, totalQuantity, totalValue, lowStockCount, outOfStockCount } = useMemo(() => {
    // Filter raw inventory by category first
    const catFiltered = inventory.filter((item) => {
      return (
        !categoryFilter || categoryFilter === 'All Categories' || item.category === categoryFilter
      );
    });

    if (activeStore === 'All Stores' || activeStore === 'ALL') {
      // Aggregated across all stores
      // Group by distinct SKU / product
      const productMap = new Map<
        string,
        { totalQty: number; costPrice: number; reorderPt: number }
      >();

      catFiltered.forEach((item) => {
        const key = item.productId || item.sku;
        const existing = productMap.get(key);
        if (existing) {
          existing.totalQty += item.qtyOnHand;
        } else {
          productMap.set(key, {
            totalQty: item.qtyOnHand,
            costPrice: item.costPrice,
            reorderPt: item.reorderPt || 5,
          });
        }
      });

      let totalQty = 0;
      let totalVal = 0;
      let lowCount = 0;
      let outCount = 0;

      productMap.forEach(({ totalQty: qty, costPrice, reorderPt }) => {
        totalQty += qty;
        totalVal += costPrice * qty;
        if (qty === 0) {
          outCount++;
        } else if (qty <= reorderPt) {
          lowCount++;
        }
      });

      return {
        totalSKUs: productMap.size,
        totalQuantity: totalQty,
        totalValue: totalVal,
        lowStockCount: lowCount,
        outOfStockCount: outCount,
      };
    } else {
      // Filter strictly by active store location
      const storeItems = catFiltered.filter((item) => item.store === activeStore);
      const totalQty = storeItems.reduce((acc, item) => acc + item.qtyOnHand, 0);
      const totalVal = storeItems.reduce((acc, item) => acc + item.costPrice * item.qtyOnHand, 0);
      const lowCount = storeItems.filter(
        (item) => item.qtyOnHand > 0 && item.qtyOnHand <= item.reorderPt
      ).length;
      const outCount = storeItems.filter((item) => item.qtyOnHand === 0).length;

      return {
        totalSKUs: storeItems.length,
        totalQuantity: totalQty,
        totalValue: totalVal,
        lowStockCount: lowCount,
        outOfStockCount: outCount,
      };
    }
  }, [inventory, activeStore, categoryFilter]);

  const scopeLabel = `${activeStore === 'All Stores' ? 'All Locations' : activeStore}${
    categoryFilter && categoryFilter !== 'All Categories' ? ` · ${categoryFilter}` : ''
  }`;

  const summaryCards = [
    {
      id: 'inv-sum-total',
      label: 'Total SKUs',
      value: totalSKUs.toLocaleString(dateLocale || 'en-IN'),
      sub: `Scope: ${scopeLabel}`,
      icon: 'CubeIcon',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      id: 'inv-sum-qty',
      label: 'Total Quantity',
      value: totalQuantity.toLocaleString(dateLocale || 'en-IN') + ' units',
      sub:
        activeStore === 'All Stores'
          ? 'Aggregated across all stores'
          : `Physical stock in ${activeStore}`,
      icon: 'Square3Stack3DIcon',
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      id: 'inv-sum-value',
      label: 'Inventory Value',
      value: formatCurrency(totalValue),
      sub: 'At purchase cost valuation',
      icon: 'CurrencyRupeeIcon',
      color: 'text-info',
      bg: 'bg-info/10',
    },
    {
      id: 'inv-sum-low',
      label: 'Low Stock',
      value: lowStockCount.toString(),
      sub: 'Below reorder threshold',
      icon: 'ExclamationTriangleIcon',
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      id: 'inv-sum-out',
      label: 'Out of Stock',
      value: outOfStockCount.toString(),
      sub: 'Zero inventory on hand',
      icon: 'XCircleIcon',
      color: 'text-danger',
      bg: 'bg-danger/10',
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none md:grid md:grid-cols-5 md:gap-3 -mx-[var(--page-gutter)] px-[var(--page-gutter)] md:mx-0 md:px-0 pb-1 md:pb-0">
      {summaryCards.map((card) => (
        <div
          key={card.id}
          className="card p-3 md:p-4 flex items-center gap-3 min-w-[150px] md:min-w-0 flex-shrink-0 md:flex-shrink"
        >
          <div
            className={`w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl flex items-center justify-center flex-shrink-0 ${card.bg}`}
          >
            <Icon
              name={card.icon as Parameters<typeof Icon>[0]['name']}
              size={18}
              className={card.color}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-3xs md:text-2xs font-bold text-muted-foreground uppercase tracking-wider truncate">
              {card.label}
            </p>
            <p className="text-base md:text-lg font-bold text-foreground font-tabular mt-0.5 truncate">
              {card.value}
            </p>
            <p className="text-3xs text-muted-foreground truncate hidden md:block">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
