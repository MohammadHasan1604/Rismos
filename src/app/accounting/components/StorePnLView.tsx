'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { StorePnLData } from './types';

interface StorePnLViewProps {
  storePnLData: StorePnLData;
  handleDrillDown: (metricKey: string, metricLabel: string) => void;
}

export const StorePnLView: React.FC<StorePnLViewProps> = ({ storePnLData, handleDrillDown }) => {
  const { formatCurrency } = useApp();
  return (
    <div className="space-y-6 fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => handleDrillDown('netExternalRevenue', 'Store Sales Revenue')}
          className="card p-5 cursor-pointer hover:border-primary hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Store Sales Revenue
            </p>
            <span className="text-3xs font-bold text-primary group-hover:underline">
              Drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-foreground font-tabular mt-2">
            {formatCurrency(storePnLData.storeSalesRevenue)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Scope: {storePnLData.storeScope}</p>
        </div>

        <div className="card p-5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Store COGS (Transfer Price)
          </p>
          <p className="text-2xl font-black text-info font-tabular mt-2">
            {formatCurrency(storePnLData.storeCOGS)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Inventory cost billed by Central</p>
        </div>

        <div
          onClick={() => handleDrillDown('storeOperatingExpenses', 'Store Operating Expenses')}
          className="card p-5 cursor-pointer hover:border-danger hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Store Operating Expenses
            </p>
            <span className="text-3xs font-bold text-danger group-hover:underline">
              Drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-danger font-tabular mt-2">
            {formatCurrency(storePnLData.storeOperatingExpenses)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Store rent, bills & maintenance</p>
        </div>

        <div className="card p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
          <p className="text-2xs font-bold uppercase tracking-wider text-primary">
            Store Net Operating Profit
          </p>
          <p
            className={`text-2xl font-black font-tabular mt-2 ${storePnLData.storeNetProfit >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {formatCurrency(storePnLData.storeNetProfit)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1 font-tabular">
            Store Margin:{' '}
            <strong className="text-foreground">{storePnLData.storeNetMarginPercent}%</strong>
          </p>
        </div>
      </div>

      {/* Store Margin Statement */}
      <div className="card p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground">
          Store Operational Performance Statement ({storePnLData.storeScope})
        </h3>
        <div className="space-y-2 text-sm font-tabular border-t border-border pt-3">
          <div className="flex justify-between py-2 font-bold text-foreground">
            <span>Store Customer Sales Revenue:</span>
            <span>{formatCurrency(storePnLData.storeSalesRevenue)}</span>
          </div>
          <div className="flex justify-between py-2 text-muted-foreground border-b border-border pb-3">
            <span>Less: Store COGS (Based on Transfer Price billed by Central):</span>
            <span className="text-info font-semibold">
              -{formatCurrency(storePnLData.storeCOGS)}
            </span>
          </div>
          <div className="flex justify-between py-3 px-4 bg-muted/50 rounded-xl font-extrabold text-foreground">
            <span>Store Gross Operating Profit:</span>
            <span className="text-primary font-bold">
              {formatCurrency(storePnLData.storeGrossProfit)} (
              {storePnLData.storeGrossMarginPercent}%)
            </span>
          </div>
          <div className="flex justify-between py-2 text-muted-foreground pt-3 border-b border-border pb-3">
            <span>Less: Store Operating Expenses:</span>
            <span className="text-danger font-semibold">
              -{formatCurrency(storePnLData.storeOperatingExpenses)}
            </span>
          </div>
          <div className="flex justify-between py-4 px-5 bg-primary/10 rounded-2xl font-black text-foreground border border-primary/20">
            <span className="text-base">Store Net Profit Result:</span>
            <span
              className={`text-xl ${storePnLData.storeNetProfit >= 0 ? 'text-success' : 'text-danger'}`}
            >
              {formatCurrency(storePnLData.storeNetProfit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
