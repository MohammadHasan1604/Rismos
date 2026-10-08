'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { useApp } from '@/context/AppContext';

export default function RecentActivityFeed() {
  const { sales, purchases, stockTransfers, auditLogs, selectedStore, currentUser, formatCurrency, dateLocale } = useApp();
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isStoreManager = currentUser.role === 'Store Manager';
  const isSalesManager = currentUser.role === 'Sales Manager';

  const assignedStore =
    currentUser.store && currentUser.store !== 'All Stores' ? currentUser.store : 'BLR';
  const activeScope = isSuperAdmin ? selectedStore : assignedStore;

  const saleActivities = sales
    .filter((s) => activeScope === 'All Stores' || s.store === activeScope)
    .map((s) => ({
      id: `sale-${s.id}`,
      icon: 'ShoppingCartIcon' as const,
      color: 'text-primary',
      bg: 'bg-primary/10',
      title: `Invoice #${s.orderNo} raised`,
      meta: `${s.customerName || 'Customer'} · ${formatCurrency(s.total || 0)} · ${s.store}`,
      time: s.createdAt
        ? new Date(s.createdAt).toLocaleDateString(dateLocale || 'en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'Recent',
      badge: { variant: 'active' as const, label: s.paymentMethod || 'Paid' },
    }));

  const purchaseActivities = (!isSalesManager ? purchases : [])
    .filter((p) => activeScope === 'All Stores' || p.store === activeScope)
    .map((p) => ({
      id: `po-${p.id}`,
      icon: 'TruckIcon' as const,
      color: 'text-info',
      bg: 'bg-info/10',
      title: `PO #${p.poNo} created`,
      meta: `Vendor: ${p.vendorName || 'Supplier'} · ${formatCurrency(p.totalAmount || 0)}`,
      time: p.createdAt
        ? new Date(p.createdAt).toLocaleDateString(dateLocale || 'en-IN', { day: '2-digit', month: 'short' })
        : 'Recent',
      badge: {
        variant: p.status === 'Received' ? ('active' as const) : ('pending' as const),
        label: p.status,
      },
    }));

  const transferActivities = isSuperAdmin
    ? stockTransfers
        .filter(
          (t) =>
            activeScope === 'All Stores' ||
            t.sourceStore === activeScope ||
            t.destStore === activeScope
        )
        .map((t) => ({
          id: `transfer-${t.id}`,
          icon: 'ArrowsRightLeftIcon' as const,
          color: 'text-accent',
          bg: 'bg-accent/10',
          title: `Stock transfer #${t.transferNo}`,
          meta: `${t.sourceStore} → ${t.destStore} · ${t.productName} · ${t.qty} units`,
          time: t.createdAt
            ? new Date(t.createdAt).toLocaleDateString(dateLocale || 'en-IN', { day: '2-digit', month: 'short' })
            : 'Recent',
          badge: { variant: 'info' as const, label: t.status },
        }))
    : [];

  const auditActivities = isSuperAdmin
    ? auditLogs
        .filter((a) => activeScope === 'All Stores' || a.storeCode === activeScope)
        .map((a) => ({
          id: `audit-${a.id}`,
          icon: 'ShieldCheckIcon' as const,
          color: 'text-muted-foreground',
          bg: 'bg-muted',
          title: `${a.action}: ${a.module}`,
          meta: `${a.details} · by ${a.userName}`,
          time: a.timestamp || 'Recent',
          badge: { variant: 'neutral' as const, label: a.module },
        }))
    : [];

  const activities = [
    ...saleActivities,
    ...purchaseActivities,
    ...transferActivities,
    ...auditActivities,
  ].slice(0, 10);

  return (
    <div className="card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="section-header">Recent Activity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{activeScope} · Live feed</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-positive animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center h-48">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <Icon name="ClockIcon" size={20} className="text-muted-foreground" />
            </div>
            <p className="text-xs font-medium text-foreground">No recent activity</p>
            <p className="text-2xs text-muted-foreground mt-1 max-w-[220px]">
              Live transactions and operational movements will appear here automatically.
            </p>
          </div>
        ) : (
          activities.map((act) => (
            <div
              key={act.id}
              className="flex items-start gap-3.5 px-4 py-3.5 hover:bg-muted/50 transition-colors duration-100 cursor-pointer"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${act.bg}`}
              >
                <Icon name={act.icon} size={15} className={act.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground leading-snug">{act.title}</p>
                  <StatusBadge variant={act.badge.variant} label={act.badge.label} />
                </div>
                <p className="text-2xs text-muted-foreground mt-0.5 truncate">{act.meta}</p>
                <p className="text-2xs text-muted-foreground mt-1">{act.time}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer — Audit logs restricted strictly to Super Admin per Requirement F */}
      <div className="px-5 py-3 border-t border-border">
        {isSuperAdmin ? (
          <Link
            href="/audit-logs"
            className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-primary hover:underline"
          >
            View full audit log
            <Icon name="ArrowRightIcon" size={12} />
          </Link>
        ) : (
          <Link
            href="/sales"
            className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-primary hover:underline"
          >
            View all recent sales
            <Icon name="ArrowRightIcon" size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}
