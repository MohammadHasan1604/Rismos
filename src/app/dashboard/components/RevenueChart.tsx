'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useApp } from '@/context/AppContext';
import { generateChartBuckets, parseDate } from '@/lib/dateUtils';

const formatCompactNumber = (v: number, sym = '₹', isIndia = true) => {
  if (isIndia) {
    if (v >= 10000000) return `${sym}${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `${sym}${(v / 100000).toFixed(1)}L`;
  } else {
    if (v >= 1000000) return `${sym}${(v / 1000000).toFixed(1)}M`;
  }
  if (v >= 1000) return `${sym}${(v / 1000).toFixed(0)}K`;
  return `${sym}${v}`;
};

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatCurrency?: (val: number) => string;
}

const CustomTooltip = ({ active, payload, label, formatCurrency }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-modal px-4 py-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={`tooltip-${p.name}`} className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-muted-foreground text-xs">{p.name}:</span>
          <span className="font-semibold text-foreground font-tabular text-xs">
            {formatCurrency ? formatCurrency(Math.round(p.value)) : Math.round(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueChart() {
  const {
    sales,
    selectedStore,
    datePeriod,
    customDateRange,
    currentUser,
    formatCurrency,
    systemSettings,
  } = useApp();
  const sym = systemSettings?.currencySymbol || '₹';
  const isIndia = (systemSettings?.countryCode || 'IN').toUpperCase() === 'IN';
  const isSalesManager = currentUser.role === 'Sales Manager';

  const matchStore = (storeCode?: string) =>
    selectedStore === 'All Stores' || storeCode === selectedStore;

  const validSales = sales.filter((s) => {
    return (
      matchStore(s.store) &&
      s.status !== 'Refunded' &&
      s.status !== 'Cancelled' &&
      s.status !== 'Voided'
    );
  });

  // Generate continuous timeline buckets based on the selected period
  const buckets = generateChartBuckets(datePeriod, customDateRange);

  const bucketData = buckets.map((bucket) => {
    const bStartTime = bucket.start.getTime();
    const bEndTime = bucket.end.getTime();

    let bucketRevenue = 0;
    let bucketProfit = 0;

    validSales.forEach((s) => {
      const dt = parseDate(s.createdAt);
      if (!dt) return;
      const t = dt.getTime();
      if (t >= bStartTime && t <= bEndTime) {
        const rev = Number(s.total) || 0;
        const profit =
          s.grossProfit !== undefined && s.grossProfit !== null && !isNaN(Number(s.grossProfit))
            ? Number(s.grossProfit)
            : rev * 0.25;
        bucketRevenue += rev;
        bucketProfit += profit;
      }
    });

    return {
      date: bucket.label,
      revenue: Math.round(bucketRevenue),
      profit: Math.round(bucketProfit),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={bucketData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCompactNumber(v, sym, isIndia)}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#gradRevenue)"
          dot={{ r: 3, fill: 'var(--primary)' }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
        {!isSalesManager && (
          <Area
            type="monotone"
            dataKey="profit"
            name="Gross Profit"
            stroke="var(--positive)"
            strokeWidth={2}
            fill="url(#gradProfit)"
            dot={{ r: 3, fill: 'var(--positive)' }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
