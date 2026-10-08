'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useApp } from '@/context/AppContext';
import { isWithinDatePeriod } from '@/lib/dateUtils';

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

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  formatCurrency?: (val: number) => string;
}

const CustomTooltip = ({ active, payload, label, formatCurrency }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-modal px-4 py-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={`bar-tooltip-${p.name}`} className="font-semibold text-foreground font-tabular">
          {formatCurrency ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const barColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--positive)',
  'var(--warning)',
  'var(--info)',
];

export default function SalesByStoreChart() {
  const { sales, storesList, selectedStore, datePeriod, customDateRange, formatCurrency, systemSettings } = useApp();
  const sym = systemSettings?.currencySymbol || '₹';
  const isIndia = (systemSettings?.countryCode || 'IN').toUpperCase() === 'IN';

  // Filter sales by active date period & validity
  const validPeriodSales = sales.filter((s) => {
    return (
      isWithinDatePeriod(s.createdAt, datePeriod, customDateRange) &&
      s.status !== 'Refunded' &&
      s.status !== 'Cancelled' &&
      s.status !== 'Voided'
    );
  });

  const storeSalesMap: Record<string, number> = {};
  storesList.forEach((st) => {
    storeSalesMap[st.code] = 0;
  });

  validPeriodSales.forEach((s) => {
    const code = s.store || 'CENTRAL';
    storeSalesMap[code] = (storeSalesMap[code] || 0) + (s.total || 0);
  });

  const data = Object.keys(storeSalesMap).map((code) => ({
    store: code,
    sales: Math.round(storeSalesMap[code]),
    isSelected: selectedStore === code,
  }));

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barSize={24}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="store"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCompactNumber(v, sym, isIndia)}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
          {data.map((entry, idx) => {
            const isHighlight = selectedStore === 'All Stores' || entry.isSelected;
            const color = isHighlight ? barColors[idx % barColors.length] : 'var(--muted)';
            return <Cell key={`bar-cell-${idx}`} fill={color} opacity={isHighlight ? 1 : 0.4} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
