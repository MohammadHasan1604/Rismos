'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';

export interface ConfirmationSummaryItem {
  label: string;
  value: React.ReactNode;
  highlighted?: boolean;
  badge?: string;
}

export type ActionType =
  | 'checkout'
  | 'purchase'
  | 'payment'
  | 'transfer'
  | 'adjust'
  | 'receive'
  | 'void'
  | 'delete'
  | 'update'
  | 'create';

export interface ActionConfirmationConfig {
  title: string;
  subtitle?: string;
  actionType?: ActionType;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'success';
  summaryItems?: ConfirmationSummaryItem[];
  warningMessage?: string;
  idempotencyKey?: string;
  onConfirm?: () => Promise<void> | void;
}

interface GlobalConfirmationModalProps {
  open: boolean;
  config: ActionConfirmationConfig | null;
  isProcessing: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onExecuteConfirm: () => void;
}

const ACTION_BADGES: Record<
  ActionType,
  { label: string; icon: string; badgeClass: string; btnClass: string }
> = {
  checkout: {
    label: 'POS Sale Checkout',
    icon: 'ShoppingCartIcon',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25',
  },
  purchase: {
    label: 'Purchase Order',
    icon: 'DocumentTextIcon',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    btnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25',
  },
  payment: {
    label: 'Disbursement & Payment',
    icon: 'CurrencyRupeeIcon',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    btnClass: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/25',
  },
  transfer: {
    label: 'Stock Transfer',
    icon: 'TruckIcon',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    btnClass: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-500/25',
  },
  adjust: {
    label: 'Inventory Adjustment',
    icon: 'AdjustmentsHorizontalIcon',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25',
  },
  receive: {
    label: 'Stock Inward / GRN',
    icon: 'ArrowDownTrayIcon',
    badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    btnClass: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/25',
  },
  void: {
    label: 'Void / Refund',
    icon: 'XCircleIcon',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    btnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/25',
  },
  delete: {
    label: 'Delete / Archive',
    icon: 'TrashIcon',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    btnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/25',
  },
  update: {
    label: 'Record Modification',
    icon: 'PencilSquareIcon',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    btnClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25',
  },
  create: {
    label: 'Record Creation',
    icon: 'PlusCircleIcon',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    btnClass: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/25',
  },
};

export default function GlobalConfirmationModal({
  open,
  config,
  isProcessing,
  errorMessage,
  onClose,
  onExecuteConfirm,
}: GlobalConfirmationModalProps) {
  if (!open || !config) return null;

  const actionType = config.actionType || 'create';
  const badgeMeta = ACTION_BADGES[actionType] || ACTION_BADGES.create;

  const buttonStyleClass =
    config.variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/25'
      : config.variant === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25'
        : badgeMeta.btnClass;

  const handleBackdropClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleBackdropClose}
      title=""
      size="standard"
      zIndex={200}
      footer={
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {config.cancelLabel || 'Review Details'}
          </button>
          <button
            type="button"
            onClick={onExecuteConfirm}
            disabled={isProcessing}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${buttonStyleClass}`}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4z"
                  />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Icon name="CheckCircleIcon" size={16} />
                <span>{config.confirmLabel || 'Confirm & Proceed'}</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="py-1 space-y-4">
        {/* Step Indicator & Action Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-3xs font-extrabold uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/25">
              Step 2 of 2
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-3xs font-bold rounded-full border ${badgeMeta.badgeClass}`}
            >
              <Icon name={badgeMeta.icon as any} size={12} />
              {badgeMeta.label}
            </span>
          </div>
          <span className="text-3xs font-mono font-semibold text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Duplicate Protected
          </span>
        </div>

        {/* Title & Subtitle */}
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
            {config.title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {config.subtitle || 'Please review the action details below before final execution.'}
          </p>
        </div>

        {/* Error Notice (Shown on genuine server failure) */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger flex items-start gap-2.5 text-xs animate-shake">
            <Icon name="ExclamationCircleIcon" size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Execution Failed</p>
              <p className="text-2xs text-danger/90 mt-0.5">{errorMessage}</p>
              <p className="text-3xs text-muted-foreground mt-1">
                You may review and modify the details or retry the operation.
              </p>
            </div>
          </div>
        )}

        {/* Warning Banner */}
        {config.warningMessage && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 flex items-start gap-2.5 text-xs">
            <Icon
              name="ExclamationTriangleIcon"
              size={18}
              className="flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
            />
            <div>
              <p className="font-semibold text-3xs uppercase tracking-wider">Important Notice</p>
              <p className="text-2xs mt-0.5">{config.warningMessage}</p>
            </div>
          </div>
        )}

        {/* Summary Breakdown Card */}
        {config.summaryItems && config.summaryItems.length > 0 && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Action Summary Breakdown
            </p>
            <div className="divide-y divide-border/40 text-xs">
              {config.summaryItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 gap-2">
                  <span className="text-muted-foreground text-2xs font-medium">{item.label}</span>
                  <div className="text-right flex items-center gap-1.5">
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-3xs font-semibold rounded bg-muted text-muted-foreground border border-border/60">
                        {item.badge}
                      </span>
                    )}
                    <span
                      className={`font-semibold ${
                        item.highlighted
                          ? 'text-primary font-bold text-sm font-tabular'
                          : 'text-foreground font-tabular text-2xs'
                      }`}
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Idempotency Footer Badge */}
        <div className="flex items-center justify-between text-3xs text-muted-foreground bg-muted/20 px-3 py-2 rounded-lg border border-border/40 font-mono">
          <span className="flex items-center gap-1.5">
            <Icon name="LockClosedIcon" size={12} className="text-primary" />
            Transaction Idempotency Key
          </span>
          <span className="font-bold text-foreground/80 truncate max-w-[180px]">
            {config.idempotencyKey || 'Auto-generated Client Lock'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
