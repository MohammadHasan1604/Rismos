'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import { LedgerEntry } from './types';
import { PaymentProofData } from '@/components/ui/ProofViewerModal';

interface GeneralLedgerViewProps {
  ledgerCategoryFilter: string;
  setLedgerCategoryFilter: (cat: string) => void;
  ledgerSearch: string;
  setLedgerSearch: (search: string) => void;
  ledgerTotalDebit: number;
  ledgerTotalCredit: number;
  ledgerTotalCount: number;
  ledgerLoading: boolean;
  ledgerEntries: LedgerEntry[];
  onViewProof: (proof: PaymentProofData) => void;
}

export const GeneralLedgerView: React.FC<GeneralLedgerViewProps> = ({
  ledgerCategoryFilter,
  setLedgerCategoryFilter,
  ledgerSearch,
  setLedgerSearch,
  ledgerTotalDebit,
  ledgerTotalCredit,
  ledgerTotalCount,
  ledgerLoading,
  ledgerEntries,
  onViewProof,
}) => {
  const { formatCurrency, dateLocale } = useApp();
  return (
    <div className="space-y-6 fade-in">
      {/* Ledger Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-4 rounded-2xl border border-border">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-bold uppercase text-muted-foreground">
            Filter Category:
          </span>
          {[
            'ALL',
            'REVENUE',
            'COGS',
            'OPERATING_EXPENSE',
            'CENTRAL_EXPENSE',
            'TRANSFER_MARKUP',
            'ASSET',
            'LIABILITY',
          ].map((cat) => (
            <button
              key={`cat-${cat}`}
              onClick={() => setLedgerCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-2xs font-bold transition-all ${
                ledgerCategoryFilter === cat
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search voucher, ref, account..."
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            className="input-field text-xs py-1.5 px-3 min-w-[220px]"
          />
        </div>
      </div>

      {/* Ledger Totals Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Journal Debits
          </p>
          <p className="text-xl font-bold text-foreground font-tabular mt-1">
            {formatCurrency(ledgerTotalDebit)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Journal Credits
          </p>
          <p className="text-xl font-bold text-foreground font-tabular mt-1">
            {formatCurrency(ledgerTotalCredit)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Double-Entry Balance Check
          </p>
          <p
            className={`text-xl font-bold font-tabular mt-1 ${Math.abs(ledgerTotalDebit - ledgerTotalCredit) < 0.05 ? 'text-success' : 'text-danger'}`}
          >
            {Math.abs(ledgerTotalDebit - ledgerTotalCredit) < 0.05
              ? '✓ 100% Balanced'
              : `Diff: ${formatCurrency(Math.abs(ledgerTotalDebit - ledgerTotalCredit))}`}
          </p>
        </div>
      </div>

      {/* General Ledger Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">
            Double-Entry General Journal ({ledgerTotalCount} records)
          </h3>
          <span className="badge-info text-2xs font-bold">Authoritative MySQL Records</span>
        </div>

        {ledgerLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading Ledger...</div>
        ) : ledgerEntries.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No ledger records match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr className="bg-muted text-2xs font-bold uppercase text-muted-foreground">
                  <th className="px-4 py-3 sticky left-0 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Entry #
                  </th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Account Name</th>
                  <th className="px-4 py-3">Ref No</th>
                  <th className="px-4 py-3">Entity / Narration</th>
                  <th className="px-4 py-3 text-right font-tabular">Debit</th>
                  <th className="px-4 py-3 text-right font-tabular">Credit</th>
                  <th className="px-4 py-3 text-center">Payment Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-tabular">
                {ledgerEntries.map((le) => (
                  <tr key={`le-${le.id}`} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-primary whitespace-nowrap sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      {le.entryNo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(le.entryDate).toLocaleDateString(dateLocale || 'en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{le.storeCode}</td>
                    <td className="px-4 py-3">
                      <span className="badge-neutral text-3xs font-bold">{le.accountCategory}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">{le.accountName}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{le.refNo}</td>
                    <td
                      className="px-4 py-3 max-w-[260px] truncate text-muted-foreground"
                      title={le.description}
                    >
                      {le.description}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {le.debit > 0 ? formatCurrency(le.debit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {le.credit > 0 ? formatCurrency(le.credit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {le.proofUrl ? (
                        <button
                          onClick={() =>
                            onViewProof({
                              url: le.proofUrl!,
                              referenceNo: le.referenceNo || le.refNo || le.entryNo,
                              amount: le.debit > 0 ? le.debit : le.credit,
                              paymentMethod: le.paymentMethod || 'Journal Voucher',
                              paymentDate: le.entryDate,
                              payeeOrPayer: le.entityName || le.accountName,
                              recordedBy: le.createdBy || 'Finance Dept',
                              timestamp: le.entryDate,
                              notes: le.description,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-3xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shadow-2xs cursor-pointer"
                          title="View Attached Payment Proof"
                        >
                          <Icon name="DocumentCheckIcon" size={13} />
                          View Proof
                        </button>
                      ) : (
                        <span className="text-3xs text-muted-foreground italic">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
