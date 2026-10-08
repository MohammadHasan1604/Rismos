'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import { useApp } from '@/context/AppContext';

interface VoidRefundModalProps {
  sale: any | null;
  onClose: () => void;
  onConfirmRefund: (saleId: string, refundMethod: string) => Promise<boolean>;
}

export const VoidRefundModal: React.FC<VoidRefundModalProps> = ({
  sale,
  onClose,
  onConfirmRefund,
}) => {
  const { formatCurrency } = useApp();
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    if (sale?.paymentMethod) {
      setRefundMethod(sale.paymentMethod);
    }
  }, [sale]);

  if (!sale) return null;

  return (
    <Modal
      open={Boolean(sale)}
      onClose={() => {
        if (!isRefunding) onClose();
      }}
      title={`Void / Refund Invoice #${sale.orderNo}`}
      subtitle="Record return payout instrument and automatically restore inventory"
      size="standard"
      zIndex={1150}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            disabled={isRefunding}
            onClick={onClose}
            className="btn-secondary text-xs flex-1 sm:flex-initial"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isRefunding}
            onClick={async () => {
              setIsRefunding(true);
              try {
                const success = await onConfirmRefund(sale.id, refundMethod);
                if (success) {
                  onClose();
                }
              } finally {
                setIsRefunding(false);
              }
            }}
            className="btn-danger text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial"
          >
            {isRefunding ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing Refund...</span>
              </>
            ) : (
              <>
                <Icon name="ArrowPathIcon" size={14} />
                <span>Confirm Void & Refund</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="p-3 rounded-xl bg-card border border-border/80 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-bold text-foreground">
              {sale.customerName || 'Walk-in Customer'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Store Location:</span>
            <span className="font-semibold text-foreground">{sale.store}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Original Payment Method:</span>
            <span className="font-semibold text-primary">{sale.paymentMethod}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border/60">
            <span className="font-bold text-foreground">Refund Total Amount:</span>
            <span className="font-extrabold text-danger text-sm font-tabular">
              {formatCurrency(sale.total)}
            </span>
          </div>
        </div>

        <div>
          <PaymentMethodSelect
            layout="dropdown"
            label="Refund Payout Method"
            required
            value={refundMethod}
            onChange={setRefundMethod}
            modalZIndex={1250}
          />
        </div>

        <div className="p-3 rounded-xl bg-danger/5 border border-danger/20 text-xs text-danger space-y-1">
          <p className="font-bold flex items-center gap-1">
            <Icon name="ExclamationTriangleIcon" size={14} />
            <span>Restocking & Accounting Notice</span>
          </p>
          <p className="text-2xs text-danger/80">
            Confirming will mark order {sale.orderNo} as Refunded, automatically restock all items
            into {sale.store}, and log a refund payout via {refundMethod} in the general ledger.
          </p>
        </div>
      </div>
    </Modal>
  );
};
