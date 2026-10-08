'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import { ConsolidatedPnLData } from './types';

interface ConsolidatedPnLViewProps {
  consolidatedData: ConsolidatedPnLData;
  selectedStore: string;
  datePeriod: string;
  handleDrillDown: (metricKey: string, metricLabel: string) => void;
}

export const ConsolidatedPnLView: React.FC<ConsolidatedPnLViewProps> = ({
  consolidatedData,
  selectedStore,
  datePeriod,
  handleDrillDown,
}) => {
  const { formatCurrency } = useApp();
  return (
    <div className="space-y-6 fade-in">
      {/* Elimination Accounting Rule Notice */}
      <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon
            name="InformationCircleIcon"
            size={20}
            className="text-primary flex-shrink-0 mt-0.5"
          />
          <div className="text-xs space-y-1">
            <p className="font-bold text-foreground">Consolidated Enterprise Accounting Standard</p>
            <p className="text-muted-foreground leading-relaxed">
              Internal Central → Retail store transfer revenue (
              <strong className="text-foreground">
                {formatCurrency(consolidatedData.eliminatedTransferRevenue)}
              </strong>
              ) and transfer markups (
              <strong className="text-foreground">
                {formatCurrency(consolidatedData.eliminatedTransferMarkup)}
              </strong>
              ) have been <strong>eliminated</strong> to prevent double-counting. Consolidated
              Profit reflects external sales to billed customers minus authoritative vendor
              procurement cost.
            </p>
          </div>
        </div>
        <span className="badge-success text-2xs font-bold whitespace-nowrap self-center">
          ✓ GAAP / Ind-AS Elimination Applied
        </span>
      </div>

      {/* KPI Cards Row (Clickable with Drill-Down) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => handleDrillDown('netExternalRevenue', 'External Sales Revenue')}
          className="card p-5 cursor-pointer hover:border-primary hover:shadow-md transition-all group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              External Sales Revenue
            </p>
            <span className="text-3xs font-bold text-primary group-hover:underline">
              Click to drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-foreground font-tabular mt-2">
            {formatCurrency(consolidatedData.netExternalRevenue)}
          </p>
          <p className="text-2xs text-success font-semibold mt-1 flex items-center gap-1">
            <Icon name="CheckCircleIcon" size={14} />
            <span>{consolidatedData.ordersCount} verified customer invoices</span>
          </p>
        </div>

        <div
          onClick={() => handleDrillDown('vendorCOGS', 'Cost of Goods Sold (Vendor Cost)')}
          className="card p-5 cursor-pointer hover:border-info hover:shadow-md transition-all group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Vendor COGS (Purchase Cost)
            </p>
            <span className="text-3xs font-bold text-info group-hover:underline">
              Click to drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-info font-tabular mt-2">
            {formatCurrency(consolidatedData.vendorCOGS)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">Actual procurement inventory cost</p>
        </div>

        <div
          onClick={() => handleDrillDown('totalExpenses', 'Total Operating Expenses')}
          className="card p-5 cursor-pointer hover:border-danger hover:shadow-md transition-all group relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Operating Expenses
            </p>
            <span className="text-3xs font-bold text-danger group-hover:underline">
              Click to drill down →
            </span>
          </div>
          <p className="text-2xl font-black text-danger font-tabular mt-2">
            {formatCurrency(consolidatedData.totalExpenses)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1">
            Store ({formatCurrency(consolidatedData.storeOperatingExpenses)}) + Central ({formatCurrency(consolidatedData.centralExpenses)})
          </p>
        </div>

        <div className="card p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 relative overflow-hidden">
          <p className="text-2xs font-bold uppercase tracking-wider text-primary">
            Consolidated Net Profit
          </p>
          <p
            className={`text-2xl font-black font-tabular mt-2 ${consolidatedData.consolidatedNetProfit >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {formatCurrency(consolidatedData.consolidatedNetProfit)}
          </p>
          <p className="text-2xs text-muted-foreground mt-1 font-tabular">
            Net Margin:{' '}
            <strong className="text-foreground">{consolidatedData.netMarginPercent}%</strong>
          </p>
        </div>
      </div>

      {/* Consolidated Income Statement Table */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Consolidated Financial Income Statement
            </h3>
            <p className="text-xs text-muted-foreground">
              Authoritative double-entry balances for {selectedStore} ({datePeriod})
            </p>
          </div>
          <span className="badge-neutral text-xs font-mono font-bold">Scope: {selectedStore}</span>
        </div>

        <div className="space-y-2 text-sm font-tabular">
          <div
            onClick={() => handleDrillDown('netExternalRevenue', 'External Sales Revenue')}
            className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
          >
            <span className="font-semibold text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Gross External Sales Revenue (Billed to Customers)
            </span>
            <span className="font-bold text-foreground">
              {formatCurrency(consolidatedData.netExternalRevenue)}
            </span>
          </div>

          <div
            onClick={() => handleDrillDown('vendorCOGS', 'Cost of Goods Sold (Vendor Cost)')}
            className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors text-muted-foreground border-b border-border pb-3"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-info" />
              Less: Cost of Goods Sold (Authoritative Vendor Purchase Cost)
            </span>
            <span className="font-semibold text-info">
              -{formatCurrency(consolidatedData.vendorCOGS)}
            </span>
          </div>

          {/* Gross Profit Subtotal */}
          <div className="flex justify-between items-center py-3 px-4 bg-muted/50 rounded-xl font-extrabold text-foreground border border-border">
            <span className="text-base">Consolidated Gross Profit</span>
            <div className="text-right">
              <span className="text-lg text-primary">
                {formatCurrency(consolidatedData.consolidatedGrossProfit)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ({consolidatedData.grossMarginPercent}% margin)
              </span>
            </div>
          </div>

          {/* Expenses Breakdown */}
          <div
            onClick={() => handleDrillDown('storeOperatingExpenses', 'Store Operating Expenses')}
            className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors text-muted-foreground pt-3"
          >
            <span>Store Operational Expenses (Rent, Salaries, Electricity, Repairs):</span>
            <span className="font-semibold text-danger">
              -{formatCurrency(consolidatedData.storeOperatingExpenses)}
            </span>
          </div>

          <div
            onClick={() =>
              handleDrillDown('centralExpenses', 'Central Logistics & Transport Expenses')
            }
            className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors text-muted-foreground border-b border-border pb-3"
          >
            <span>Central Operations & Freight Logistics Expenses:</span>
            <span className="font-semibold text-danger">
              -{formatCurrency(consolidatedData.centralExpenses)}
            </span>
          </div>

          {/* Net Operating Profit */}
          <div className="flex justify-between items-center py-4 px-5 bg-primary/10 rounded-2xl font-black text-foreground border border-primary/20">
            <span className="text-base sm:text-lg">Consolidated Net Operating Profit</span>
            <div className="text-right">
              <span
                className={`text-xl sm:text-2xl ${consolidatedData.consolidatedNetProfit >= 0 ? 'text-success' : 'text-danger'}`}
              >
                {formatCurrency(consolidatedData.consolidatedNetProfit)}
              </span>
              <span className="text-xs font-semibold text-muted-foreground block">
                Net Margin: {consolidatedData.netMarginPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Store Contributions Table */}
      {consolidatedData.storeContributions.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Outlet Profitability Contribution Breakdown
              </h3>
              <p className="text-xs text-muted-foreground">
                Store-level external revenue, cost, and net operational result
              </p>
            </div>
            <span className="badge-info text-2xs font-bold">
              {consolidatedData.storeContributions.length} Outlets Active
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left min-w-[700px]">
              <thead>
                <tr className="bg-muted text-2xs font-bold uppercase text-muted-foreground">
                  <th className="px-4 py-3 sticky left-0 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Store Code
                  </th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right font-tabular">Net Revenue</th>
                  <th className="px-4 py-3 text-right font-tabular">COGS</th>
                  <th className="px-4 py-3 text-right font-tabular">Gross Profit</th>
                  <th className="px-4 py-3 text-right font-tabular">Margin</th>
                  <th className="px-4 py-3 text-right font-tabular">Expenses</th>
                  <th className="px-4 py-3 text-right font-tabular">Net Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm font-tabular">
                {consolidatedData.storeContributions.map((sc) => (
                  <tr key={`sc-${sc.storeCode}`} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-primary sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      {sc.storeCode}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-muted-foreground">
                      {sc.ordersCount}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(sc.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-info font-medium">
                      {formatCurrency(sc.cogs)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-success">
                      {formatCurrency(sc.grossProfit)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {sc.grossMarginPercent.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-danger font-medium">
                      {formatCurrency(sc.expenses)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-black ${sc.netProfit >= 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {formatCurrency(sc.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
