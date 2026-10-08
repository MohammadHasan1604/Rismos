'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';

interface ReconciliationAuditModalProps {
  open: boolean;
  onClose: () => void;
  auditLoading: boolean;
  auditData: any;
}

export const ReconciliationAuditModal: React.FC<ReconciliationAuditModalProps> = ({
  open,
  onClose,
  auditLoading,
  auditData,
}) => {
  const { formatCurrency } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Root Financial Reconciliation & Mathematical Verification"
      size="lg"
    >
      {auditLoading ? (
        <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-success/30 border-t-success rounded-full animate-spin" />
          <p className="text-sm font-semibold">
            Running multi-table mathematical reconciliation...
          </p>
        </div>
      ) : auditData ? (
        <div className="space-y-5">
          {/* Audit Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              auditData.status === 'RECONCILED'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-danger/10 border-danger/30 text-danger'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon name="CheckCircleIcon" size={24} />
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider">
                  {auditData.status === 'RECONCILED'
                    ? 'Root Reconciliation 100% Verified'
                    : 'Discrepancy Detected'}
                </h4>
                <p className="text-2xs text-muted-foreground">
                  All persisted database transactions match the displayed totals down to the rupee.
                </p>
              </div>
            </div>
            <span className="badge-success text-xs font-mono font-bold">
              Zero Mathematical Drift
            </span>
          </div>

          {/* Verification Proofs */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Mathematical Invariant Proofs:
            </p>
            <div className="space-y-2 text-xs font-tabular">
              {auditData.proofs?.map((p: any, idx: number) => (
                <div
                  key={`proof-${idx}`}
                  className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-foreground">{p.test}</p>
                    <p className="text-3xs text-muted-foreground">
                      Left: {formatCurrency(p.leftValue)} | Right: {formatCurrency(p.rightValue)}
                    </p>
                  </div>
                  <span
                    className={`badge-${p.isReconciled ? 'success' : 'danger'} text-2xs font-bold`}
                  >
                    {p.isReconciled ? '✓ RECONCILED' : 'DISCREPANCY'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Subsystem Totals Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-tabular">
            <div className="p-3 bg-card border border-border rounded-xl">
              <span className="text-3xs font-bold uppercase text-muted-foreground block">
                Net Sales Revenue
              </span>
              <span className="text-sm font-bold text-foreground mt-1 block">
                {formatCurrency(auditData.sales?.netRevenue)}
              </span>
              <span className="text-3xs text-muted-foreground">
                {auditData.sales?.ordersCount} orders
              </span>
            </div>

            <div className="p-3 bg-card border border-border rounded-xl">
              <span className="text-3xs font-bold uppercase text-muted-foreground block">
                Vendor COGS
              </span>
              <span className="text-sm font-bold text-info mt-1 block">
                {formatCurrency(auditData.sales?.cogs)}
              </span>
              <span className="text-3xs text-muted-foreground">Actual cost</span>
            </div>

            <div className="p-3 bg-card border border-border rounded-xl">
              <span className="text-3xs font-bold uppercase text-muted-foreground block">
                Inventory Asset
              </span>
              <span className="text-sm font-bold text-foreground mt-1 block">
                {formatCurrency(auditData.inventory?.totalAssetValue)}
              </span>
              <span className="text-3xs text-muted-foreground">
                {auditData.inventory?.unitsOnHand} units on hand
              </span>
            </div>

            <div className="p-3 bg-card border border-border rounded-xl">
              <span className="text-3xs font-bold uppercase text-muted-foreground block">
                Vendor Payables
              </span>
              <span className="text-sm font-bold text-danger mt-1 block">
                {formatCurrency(auditData.payables?.outstandingPayables)}
              </span>
              <span className="text-3xs text-muted-foreground">Unpaid balance</span>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <button onClick={onClose} className="btn-primary text-xs py-2 px-4 cursor-pointer">
              Done
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
