'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';

export default function LowStockAlerts() {
  const { inventory, selectedStore } = useApp();

  const filteredInv =
    selectedStore === 'All Stores' ? inventory : inventory.filter((i) => i.store === selectedStore);

  const alerts = filteredInv
    .filter((item) => item.qtyOnHand <= (item.reorderPt || 5) || item.qtyOnHand === 0)
    .map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      store: item.store || 'BLR',
      qty: item.qtyOnHand,
      reorder: item.reorderPt || 10,
      severity: (item.qtyOnHand === 0 ? 'out-of-stock' : 'low-stock') as
        'out-of-stock' | 'low-stock',
    }));

  const outOfStockCount = alerts.filter((a) => a.severity === 'out-of-stock').length;
  const lowStockCount = alerts.filter((a) => a.severity === 'low-stock').length;

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-5 py-3 md:py-4 border-b border-border">
        <div>
          <h2 className="section-header">Stock Alerts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="text-danger font-semibold">{outOfStockCount} out of stock</span>
            {' · '}
            <span className="text-warning font-semibold">{lowStockCount} low stock</span>
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center">
          <Icon name="ExclamationTriangleIcon" size={16} className="text-danger" />
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center h-48">
            <div className="w-10 h-10 rounded-full bg-positive/10 flex items-center justify-center mb-2">
              <Icon name="CheckCircleIcon" size={20} className="text-positive" />
            </div>
            <p className="text-xs font-medium text-foreground">All stock levels optimal</p>
            <p className="text-2xs text-muted-foreground mt-1 max-w-[200px]">
              No out-of-stock or low-stock items detected in the system.
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 hover:bg-muted/50 transition-colors"
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${alert.severity === 'out-of-stock' ? 'bg-danger' : 'bg-warning'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{alert.name}</p>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  {alert.sku} · {alert.store}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <StatusBadge
                  variant={alert.severity}
                  label={alert.qty === 0 ? 'Out of Stock' : `${alert.qty} left`}
                />
                <p className="text-2xs text-muted-foreground mt-0.5">Reorder: {alert.reorder}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 md:px-5 py-2.5 md:py-3 border-t border-border">
        <Link
          href="/inventory-management"
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          View all inventory alerts
          <Icon name="ArrowRightIcon" size={12} />
        </Link>
      </div>
    </div>
  );
}
