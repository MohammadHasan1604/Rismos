'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import NumericInput from '@/components/ui/NumericInput';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

export interface StockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: string;
    sku: string;
    name: string;
    store: string;
    qtyOnHand: number;
    costPrice: number;
  } | null;
  onSuccess?: () => void;
  zIndex?: number;
}

interface StockAdjustmentFormValues {
  adjustmentType: 'add' | 'remove' | 'set';
  quantity: number | '';
  reason: string;
  notes: string;
  store: string;
}

const REASON_CODES = [
  { value: 'damage', label: 'Damage / Spoilage' },
  { value: 'lost', label: 'Lost / Theft' },
  { value: 'found', label: 'Found / Recovered' },
  { value: 'opening', label: 'Opening Stock Entry' },
  { value: 'count', label: 'Physical Count Correction' },
  { value: 'return', label: 'Customer Return — No Sale' },
  { value: 'sample', label: 'Sample / Display Unit' },
  { value: 'other', label: 'Other (specify in notes)' },
];

export default function StockAdjustmentModal({
  open,
  onClose,
  item,
  onSuccess,
  zIndex = 100,
}: StockAdjustmentModalProps) {
  const { adjustStock, confirmAction, formatCurrency } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<StockAdjustmentFormValues>({
    defaultValues: {
      adjustmentType: 'add',
      quantity: '',
      reason: '',
      notes: '',
      store: item?.store || '',
    },
  });

  const adjustmentType = watch('adjustmentType');
  const quantity = watch('quantity');

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editItemIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetItemChanging = open && Boolean(item?.id) && item?.id !== editItemIdRef.current;

    if (isOpening || isTargetItemChanging) {
      prevOpenRef.current = open;
      editItemIdRef.current = item?.id || null;
      reset({
        adjustmentType: 'add',
        quantity: '',
        reason: '',
        notes: '',
        store: item?.store || '',
      });
    }

    if (!open) {
      prevOpenRef.current = false;
      editItemIdRef.current = null;
    }
  }, [open, item?.id, reset]);

  const isDirty = Boolean(quantity !== '' || watch('notes'));
  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this stock adjustment form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open || !item) return null;

  const getNewQty = () => {
    if (quantity === '' || quantity === null || quantity === undefined) return item.qtyOnHand;
    const qty = Number(quantity);
    if (isNaN(qty)) return item.qtyOnHand;
    if (adjustmentType === 'add') return item.qtyOnHand + qty;
    if (adjustmentType === 'remove') return Math.max(0, item.qtyOnHand - qty);
    if (adjustmentType === 'set') return qty;
    return item.qtyOnHand;
  };

  const onSubmit = async (data: StockAdjustmentFormValues) => {
    const newQty = getNewQty();
    const diff = newQty - item.qtyOnHand;

    const confirmed = await confirmAction({
      actionType: 'adjust',
      title: 'Confirm Inventory Stock Adjustment',
      subtitle: 'Please review the stock adjustment details before applying.',
      confirmLabel: 'Confirm & Apply Adjustment',
      variant: diff < 0 ? 'warning' : 'primary',
      summaryItems: [
        { label: 'Product Name', value: item.name, highlighted: true },
        { label: 'SKU', value: item.sku },
        { label: 'Store Location', value: item.store },
        { label: 'Current Stock', value: `${item.qtyOnHand} units` },
        { label: 'Adjustment Type', value: data.adjustmentType.toUpperCase() },
        { label: 'Stock Delta', value: `${diff >= 0 ? '+' : ''}${diff} units` },
        { label: 'Resulting Stock On Hand', value: `${newQty} units`, highlighted: true },
        { label: 'Reason', value: data.reason || 'Manual Adjustment' },
      ],
      warningMessage:
        'This will immediately update current physical inventory and append an entry to the inventory audit ledger.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const reasonText = `${data.reason || 'Manual Adjustment'}${data.notes ? ` - ${data.notes}` : ''}`;
      await adjustStock(item.id, diff, reasonText);
      toast.success(`Stock adjusted for "${item.name}": ${item.qtyOnHand} → ${newQty}`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Stock adjustment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title="Authoritative Stock Adjustment"
      subtitle={`${item.sku} · ${item.name} · Location: ${item.store}`}
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
            form="stock-adjustment-form"
            className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial"
            disabled={isSubmitting || quantity === '' || Number(quantity) < 0}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Adjusting Stock...
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={14} />
                Save Stock Adjustment
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="stock-adjustment-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2 text-xs">
        {/* Stock Delta Banner */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border">
          <div className="text-center">
            <p className="text-3xs text-muted-foreground uppercase font-semibold">Current Qty</p>
            <p className="text-2xl font-bold text-foreground font-tabular mt-0.5">
              {item.qtyOnHand}
            </p>
          </div>
          <Icon name="ArrowRightIcon" size={18} className="text-muted-foreground flex-shrink-0" />
          <div className="text-center">
            <p className="text-3xs text-muted-foreground uppercase font-semibold">New Qty</p>
            <p
              className={`text-2xl font-bold font-tabular mt-0.5 ${
                getNewQty() === 0
                  ? 'text-danger'
                  : getNewQty() < item.qtyOnHand
                    ? 'text-amber-500'
                    : 'text-emerald-500'
              }`}
            >
              {getNewQty()}
            </p>
          </div>
          <div className="flex-1 text-right">
            <p className="text-3xs text-muted-foreground uppercase font-semibold">Store Location</p>
            <p className="text-sm font-bold text-primary">{item.store}</p>
            <p className="text-3xs text-muted-foreground mt-0.5 font-tabular">
              Cost: {formatCurrency(item.costPrice)}/unit
            </p>
          </div>
        </div>

        {/* Adjustment Type Selector */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">Adjustment Action</label>
          <div className="grid grid-cols-3 gap-2">
            {(['add', 'remove', 'set'] as const).map((type) => (
              <label
                key={`adj-type-${type}`}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all duration-150 text-xs font-semibold ${
                  adjustmentType === type
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground'
                }`}
              >
                <input
                  type="radio"
                  value={type}
                  className="sr-only"
                  {...register('adjustmentType')}
                />
                <Icon
                  name={
                    type === 'add'
                      ? 'PlusCircleIcon'
                      : type === 'remove'
                        ? 'MinusCircleIcon'
                        : 'PencilSquareIcon'
                  }
                  size={15}
                />
                <span className="capitalize">
                  {type === 'set' ? 'Set Exact' : type === 'add' ? 'Add Stock' : 'Remove Stock'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Quantity Input */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            {adjustmentType === 'set'
              ? 'Set Exact Quantity To'
              : adjustmentType === 'add'
                ? 'Units to Add to Stock'
                : 'Units to Deduct from Stock'}{' '}
            <span className="text-danger">*</span>
          </label>
          <NumericInput
            min={0}
            allowDecimals={false}
            placeholder="Enter unit count..."
            value={quantity}
            onChange={(val) => setValue('quantity', val)}
            className="input-field text-xs font-bold font-tabular h-9"
          />
        </div>

        {/* Reason Code */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Audit Reason Code <span className="text-danger">*</span>
          </label>
          <select
            {...register('reason', { required: 'Please specify reason for stock adjustment' })}
            className="input-field text-xs font-medium h-9"
          >
            <option value="">Select reason...</option>
            {REASON_CODES.map((rc) => (
              <option key={rc.value} value={rc.label}>
                {rc.label}
              </option>
            ))}
          </select>
          {errors.reason && <p className="text-3xs text-danger mt-1">{errors.reason.message}</p>}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Audit Notes / Remarks{' '}
            <span className="text-muted-foreground font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Audit reconciliation by store manager"
            {...register('notes')}
            className="input-field text-xs h-8"
          />
        </div>
      </form>
    </Modal>
  );
}
