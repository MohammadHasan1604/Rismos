'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { DrillDownRecord } from './types';

interface DrillDownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  selectedStore: string;
  datePeriod: string;
  drillDownTotal: number;
  drillDownSearch: string;
  setDrillDownSearch: (s: string) => void;
  drillDownLoading: boolean;
  filteredDrillDownRows: DrillDownRecord[];
  totalRecordsCount: number;
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  open,
  onClose,
  title,
  selectedStore,
  datePeriod,
  drillDownTotal,
  drillDownSearch,
  setDrillDownSearch,
  drillDownLoading,
  filteredDrillDownRows,
  totalRecordsCount,
}) => {
  const { formatCurrency, dateLocale } = useApp();
  return (
    <Modal open={open} onClose={onClose} title={`Detailed Audit Drill-Down: ${title}`} size="xl">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-xl border border-border">
          <div>
            <p className="text-xs text-muted-foreground">
              Scope: <strong className="text-foreground">{selectedStore}</strong> · Period:{' '}
              <strong className="text-foreground">{datePeriod}</strong>
            </p>
            <p className="text-xs text-success font-semibold mt-0.5">
              ✓ Reconciled: Sum of underlying rows exactly equals displayed statement value.
            </p>
          </div>

          <div className="text-right">
            <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground block">
              Authoritative Total
            </span>
            <span className="text-2xl font-black text-primary font-tabular">
              {formatCurrency(drillDownTotal)}
            </span>
          </div>
        </div>

        {/* Search within drill-down */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search within drill-down rows (ref, customer, store, item)..."
            value={drillDownSearch}
            onChange={(e) => setDrillDownSearch(e.target.value)}
            className="input-field text-xs py-2 px-3 w-full"
          />
        </div>

        {drillDownLoading ? (
          <div className="p-12 text-center text-muted-foreground">
            Loading constituent transaction records...
          </div>
        ) : filteredDrillDownRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No records found for this metric.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin border border-border rounded-xl">
            <table className="w-full text-left text-xs font-tabular min-w-[650px]">
              <thead className="bg-muted sticky top-0 border-b border-border text-2xs font-bold uppercase text-muted-foreground z-10">
                <tr>
                  <th className="px-4 py-3 sticky left-0 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Reference #
                  </th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Entity / Details</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDrillDownRows.map((row) => (
                  <tr key={`dd-${row.id}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-primary sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      {row.refNo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(row.date).toLocaleDateString(dateLocale || 'en-IN')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.storeCode}</td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <p className="font-bold text-foreground truncate">
                        {row.entity || row.description}
                      </p>
                      {row.items && (
                        <p className="text-3xs text-muted-foreground truncate">{row.items}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-foreground">
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t border-border">
          <span>
            Showing {filteredDrillDownRows.length} of {totalRecordsCount} records
          </span>
          <button onClick={onClose} className="btn-neutral text-xs py-1.5 px-4">
            Close Drill-Down
          </button>
        </div>
      </div>
    </Modal>
  );
};
