'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { CentralPnLData } from './types';

interface CentralPnLViewProps {
  centralPnLData: CentralPnLData;
  handleDrillDown: (metricKey: string, metricLabel: string) => void;
}

export const CentralPnLView: React.FC<CentralPnLViewProps> = ({
  centralPnLData,
  handleDrillDown,
}) => {
  const { formatCurrency } = useApp();
  return (
    <div className="space-y-6 fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => handleDrillDown('centralTransferRevenue', 'Central Transfer Billed Value')}
          className="card p-5 cursor-pointer hover:border-primary hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Transfer Billed Revenue
            </p>
            <span className="text-3xs font-bold text-primary group-hover:underline">
              Drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-foreground font-tabular mt-2">
            {formatCurrency(centralPnLData.centralTransferRevenue)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Billed to outlets @ Transfer Price</p>
        </div>

        <div className="card p-5">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Central Inventory Cost
          </p>
          <p className="text-2xl font-black text-info font-tabular mt-2">
            {formatCurrency(centralPnLData.centralInventoryCost)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Vendor purchase cost</p>
        </div>

        <div
          onClick={() => handleDrillDown('grossTransferProfit', 'Central Gross Transfer Markup')}
          className="card p-5 cursor-pointer hover:border-success hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Gross Transfer Margin
            </p>
            <span className="text-3xs font-bold text-success group-hover:underline">
              Drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-success font-tabular mt-2">
            {formatCurrency(centralPnLData.grossTransferProfit)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1 font-tabular">
            Markup: {centralPnLData.centralMarkupMarginPercent}%
          </p>
        </div>

        <div className="card p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
          <p className="text-2xs font-bold uppercase tracking-wider text-primary">
            Net Central Profit
          </p>
          <p
            className={`text-2xl font-black font-tabular mt-2 ${centralPnLData.netCentralProfit >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {formatCurrency(centralPnLData.netCentralProfit)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">After freight & warehouse overhead</p>
        </div>
      </div>

      {/* Outlet Breakdown Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Stock Transfer Profit by Destination Outlet
            </h3>
            <p className="text-xs text-muted-foreground">
              Margin realized on stock dispatched from Central Warehouse
            </p>
          </div>
          <span className="badge-info text-2xs font-bold">
            {centralPnLData.totalUnitsTransferred} Total Units Dispatched
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-muted text-2xs font-bold uppercase text-muted-foreground">
                <th className="px-4 py-3 sticky left-0 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                  Destination Outlet
                </th>
                <th className="px-4 py-3 text-right font-tabular">Transfers</th>
                <th className="px-4 py-3 text-right font-tabular">Units</th>
                <th className="px-4 py-3 text-right font-tabular">Vendor Cost</th>
                <th className="px-4 py-3 text-right font-tabular">Transfer Billed Value</th>
                <th className="px-4 py-3 text-right font-tabular">Central Markup Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm font-tabular">
              {centralPnLData.outletBreakdown.map((ob) => (
                <tr key={`ob-${ob.destStore}`} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-primary sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    {ob.destStore}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{ob.count}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{ob.units}</td>
                  <td className="px-4 py-3 text-right text-info">
                    {formatCurrency(ob.inventoryCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">
                    {formatCurrency(ob.transferValue)}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-success">
                    {formatCurrency(ob.markupProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
