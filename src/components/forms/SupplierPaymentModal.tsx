'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import NumericInput from '@/components/ui/NumericInput';
import PaymentProofUpload from '@/components/ui/PaymentProofUpload';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import { useApp, PurchaseOrder } from '@/context/AppContext';
import { toast } from 'sonner';

export interface SupplierPaymentModalProps {
  open: boolean;
  onClose: () => void;
  purchase: PurchaseOrder | any | null;
  onSuccess?: (updatedPo?: PurchaseOrder, receiptVoucher?: any) => void;
  zIndex?: number;
}

export default function SupplierPaymentModal({
  open,
  onClose,
  purchase,
  onSuccess,
  zIndex = 100,
}: SupplierPaymentModalProps) {
  const {
    recordPurchasePayment,
    refreshAllData,
    confirmAction,
    paymentMethods,
    formatCurrency,
    systemSettings,
    branding,
  } = useApp();

  const defaultPayMethod = React.useMemo(() => {
    return paymentMethods.find((m) => m.status === 'Active')?.name || 'Cash';
  }, [paymentMethods]);

  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';

  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState(defaultPayMethod);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payProof, setPayProof] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute live remaining balance
  const remaining = React.useMemo(() => {
    if (!purchase) return 0;
    if (purchase.remainingAmount !== undefined) {
      return Number(purchase.remainingAmount) || 0;
    }
    const total = Number(purchase.totalAmount) || 0;
    const paid = Number(purchase.paidAmount) || 0;
    const credit = Number(purchase.creditAmount) || 0;
    return Math.max(0, Math.round((total - paid - credit) * 100) / 100);
  }, [purchase]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editPurchaseIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetPurchaseChanging =
      open && Boolean(purchase?.id) && purchase?.id !== editPurchaseIdRef.current;

    if (isOpening || isTargetPurchaseChanging) {
      prevOpenRef.current = open;
      editPurchaseIdRef.current = purchase?.id || null;

      if (purchase) {
        const initialBal = remaining > 0 ? remaining : '';
        setPayAmount(initialBal);
        setPayMethod(defaultPayMethod);
        setPayDate(new Date().toISOString().split('T')[0]);
        setPayRef('');
        setPayNotes(`Payment against ${purchase.invoiceNo || purchase.poNo}`);
        setPayProof(null);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editPurchaseIdRef.current = null;
    }
  }, [open, purchase?.id]);

  const isDirty = React.useMemo(() => {
    return Boolean(
      payRef || payNotes !== `Payment against ${purchase?.invoiceNo || purchase?.poNo}` || payProof
    );
  }, [purchase, payRef, payNotes, payProof]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this payment form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open || !purchase) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!payAmount || Number(payAmount) <= 0.005) {
      toast.error(`Please enter a valid payment amount greater than ${formatCurrency(0)}`);
      return;
    }

    const amountNum = Math.round(Number(payAmount) * 100) / 100;

    if (amountNum > remaining + 0.01) {
      toast.error(
        `Payment amount (${formatCurrency(amountNum)}) cannot exceed remaining balance (${formatCurrency(remaining)})`
      );
      return;
    }

    const effectiveRef = payRef.trim() || `PAY-${Date.now().toString(36).toUpperCase()}`;

    if (!payProof) {
      toast.error('Payment proof is mandatory! Please upload receipt/screenshot.');
      return;
    }

    const confirmed = await confirmAction({
      actionType: 'payment',
      title: 'Confirm Supplier Payment',
      subtitle: 'Please review payment amount and vendor details before recording.',
      confirmLabel: 'Confirm & Record Payment',
      summaryItems: [
        {
          label: 'Vendor / Supplier',
          value: purchase.vendorName || purchase.vendor?.name || 'Vendor',
        },
        { label: 'PO / Invoice Ref', value: purchase.invoiceNo || purchase.poNo },
        { label: 'Payment Method', value: payMethod },
        { label: 'Payment Date', value: payDate },
        {
          label: 'Remaining Balance After',
          value: formatCurrency(Math.max(0, remaining - amountNum)),
        },
        {
          label: 'Payment Amount',
          value: formatCurrency(amountNum),
          highlighted: true,
        },
      ],
      warningMessage:
        'This transaction will be recorded in the accounting ledger and supplier balance immediately.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await recordPurchasePayment({
        purchaseId: purchase.id,
        amount: amountNum,
        paymentDate: payDate,
        paymentMethod: payMethod,
        referenceNo: effectiveRef,
        receiptUrl: payProof,
        notes: payNotes.trim() || undefined,
      });

      if (res.success) {
        toast.success(`Payment of ${formatCurrency(amountNum)} recorded for ${purchase.poNo}`);
        await refreshAllData();
        if (onSuccess) {
          onSuccess(
            {
              ...purchase,
              paidAmount: (purchase.paidAmount || 0) + amountNum,
              remainingAmount: Math.max(0, remaining - amountNum),
            },
            res.receiptVoucher
          );
        }
        onClose();
      } else {
        toast.error(res.error || 'Failed to record supplier payment');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error recording payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title="Record Supplier / Bill Payment"
      subtitle={`Bill: ${purchase.invoiceNo || purchase.poNo} · Vendor: ${purchase.vendorName || purchase.vendor}`}
      size="standard"
      zIndex={zIndex}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            onClick={handleSafeClose}
            className="btn-secondary text-xs flex-1 sm:flex-initial"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="supplier-payment-form"
            className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || !payProof || !payAmount || Number(payAmount) <= 0}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing Payment...
              </>
            ) : (
              <>
                <Icon name="CheckCircleIcon" size={14} />
                Confirm & Record Payment
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="supplier-payment-form" onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
        {/* Authoritative Financial Breakdown Banner */}
        <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2 font-tabular">
          <div className="flex justify-between text-muted-foreground">
            <span>Bill Total:</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(Number(purchase.totalAmount || 0))}
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Already Paid:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(Number(purchase.paidAmount || 0))}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-primary/20 font-bold">
            <span className="text-foreground">Remaining Balance:</span>
            <span className="text-amber-600 dark:text-amber-400 text-sm">
              {formatCurrency(remaining)}
            </span>
          </div>
        </div>

        {/* Quick percentage buttons */}
        {remaining > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPayAmount(remaining)}
              className="btn-secondary text-2xs py-1 px-2.5 font-bold flex-1"
            >
              Pay Full Balance ({formatCurrency(remaining)})
            </button>
            <button
              type="button"
              onClick={() => setPayAmount(Math.round((remaining / 2) * 100) / 100)}
              className="btn-secondary text-2xs py-1 px-2.5 font-semibold"
            >
              Pay 50% ({formatCurrency(Math.round((remaining / 2) * 100) / 100)})
            </button>
          </div>
        )}

        {/* Amount & Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Payment Amount ({currencySymbol}) <span className="text-danger">*</span>
            </label>
            <NumericInput
              required
              min={0.01}
              step="0.01"
              allowDecimals={true}
              placeholder="e.g. 25000.00"
              value={payAmount}
              onChange={(val) => setPayAmount(val)}
              className="text-xs font-bold font-tabular h-9"
            />
          </div>

          <div>
            <PaymentMethodSelect
              value={payMethod}
              onChange={(val) => setPayMethod(val)}
              label="Payment Method"
              required
              modalZIndex={(zIndex || 1100) + 50}
            />
          </div>
        </div>

        {/* Date & Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Payment Date <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="input-field text-xs font-mono h-9"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              {countryCode === 'IN' ? 'Reference / UTR No.' : 'Transaction Reference'}{' '}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder={
                countryCode === 'IN'
                  ? 'e.g. UTR / IMPS / Cheque No'
                  : 'e.g. Wire / Ref / Voucher No'
              }
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="input-field text-xs font-mono h-9"
            />
          </div>
        </div>

        {/* Mandatory Payment Proof Attachment */}
        <PaymentProofUpload
          value={payProof}
          onChange={setPayProof}
          required={true}
          label="Payment Proof * (Screenshot / Bank Receipt / Cheque Copy)"
          helperText="Upload official transaction receipt or voucher (JPG, PNG, WebP, PDF) — Required"
          storeCode={purchase?.storeCode || purchase?.store}
          relatedEntityType="PurchasePayment"
          relatedEntityId={purchase?.id}
        />

        {/* Remarks / Notes */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Notes / Disbursement Remarks{' '}
            <span className="text-muted-foreground font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Cleared via Corporate Banking Account"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
            className="input-field text-xs h-8"
          />
        </div>

        {/* Validation Helper Notice */}
        {!payProof && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-3xs font-semibold">
            <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0 text-amber-600" />
            <span>
              Payment Proof is strictly mandatory. Upload receipt/screenshot above to enable Record
              Payment.
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
