'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';

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

interface StockAdjustmentFormProps {
  item: {
    id: string;
    sku: string;
    name: string;
    store: string;
    qtyOnHand: number;
    costPrice: number;
  };
  onClose: () => void;
}

export default function StockAdjustmentForm({ item, onClose }: StockAdjustmentFormProps) {
  const { adjustStock, formatCurrency } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StockAdjustmentFormValues>({
    defaultValues: {
      adjustmentType: 'add',
      quantity: '',
      reason: '',
      notes: '',
      store: item.store,
    },
  });

  const adjustmentType = watch('adjustmentType');
  const quantity = watch('quantity');

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
    setIsSubmitting(true);
    try {
      const newQty = getNewQty();
      const diff = newQty - item.qtyOnHand;
      const reasonText = `${data.reason || 'Manual Adjustment'}${data.notes ? ` - ${data.notes}` : ''}`;
      await adjustStock(item.id, diff, reasonText);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Stock adjustment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {/* Current stock info */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-muted border border-border">
        <div className="text-center">
          <p className="text-2xs text-muted-foreground uppercase tracking-wider">Current Qty</p>
          <p className="text-2xl font-bold text-foreground font-tabular mt-0.5">{item.qtyOnHand}</p>
        </div>
        <Icon name="ArrowRightIcon" size={18} className="text-muted-foreground flex-shrink-0" />
        <div className="text-center">
          <p className="text-2xs text-muted-foreground uppercase tracking-wider">New Qty</p>
          <p
            className={`text-2xl font-bold font-tabular mt-0.5 ${getNewQty() === 0 ? 'text-danger' : getNewQty() < item.qtyOnHand ? 'text-warning' : 'text-positive'}`}
          >
            {getNewQty()}
          </p>
        </div>
        <div className="flex-1 text-right">
          <p className="text-2xs text-muted-foreground">Store</p>
          <p className="text-sm font-semibold text-foreground">{item.store}</p>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Cost: {formatCurrency(item.costPrice)}/unit
          </p>
        </div>
      </div>

      {/* Adjustment type */}
      <div>
        <label className="label-text">Adjustment Type</label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['add', 'remove', 'set'] as const).map((type) => (
            <label
              key={`adj-type-${type}`}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                adjustmentType === type
                  ? 'border-primary bg-primary/5 text-primary'
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
              <span className="text-sm font-semibold capitalize">
                {type === 'set' ? 'Set Exact' : type === 'add' ? 'Add Stock' : 'Remove Stock'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label htmlFor="adj-qty" className="label-text">
          {adjustmentType === 'set'
            ? 'Set Quantity To'
            : adjustmentType === 'add'
              ? 'Quantity to Add'
              : 'Quantity to Remove'}
        </label>
        <p className="helper-text">
          {adjustmentType === 'set'
            ? 'Enter the exact new stock quantity after counting'
            : adjustmentType === 'add'
              ? 'Number of units being added to stock'
              : 'Number of units being removed from stock'}
        </p>
        <input
          id="adj-qty"
          type="number"
          min={0}
          placeholder="Enter quantity..."
          className={`input-field mt-1.5 ${errors.quantity ? 'border-danger ring-1 ring-danger' : ''}`}
          {...register('quantity', {
            required: 'Quantity is required',
            min: { value: 0, message: 'Quantity cannot be negative' },
            validate: (v) => {
              if (v === '' || v === null || v === undefined) return 'Quantity is required';
              const num = Number(v);
              if (isNaN(num)) return 'Quantity must be a valid number';
              if (adjustmentType === 'set') {
                return num >= 0 || 'Quantity cannot be negative';
              }
              return num > 0 || 'Quantity must be greater than 0';
            },
          })}
        />
        {errors.quantity && <p className="error-text">{errors.quantity.message}</p>}
      </div>

      {/* Reason */}
      <div>
        <label htmlFor="adj-reason" className="label-text">
          Reason Code
        </label>
        <p className="helper-text">
          Select the reason for this adjustment — required for audit trail
        </p>
        <select
          id="adj-reason"
          className={`input-field mt-1.5 ${errors.reason ? 'border-danger ring-1 ring-danger' : ''}`}
          {...register('reason', { required: 'Reason code is required' })}
        >
          <option value="">— Select reason —</option>
          {REASON_CODES.map((r) => (
            <option key={`reason-${r.value}`} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {errors.reason && <p className="error-text">{errors.reason.message}</p>}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="adj-notes" className="label-text">
          Notes
          <span className="text-muted-foreground font-normal ml-1">(optional)</span>
        </label>
        <p className="helper-text">Additional context for this adjustment — visible in audit log</p>
        <textarea
          id="adj-notes"
          rows={3}
          placeholder="e.g. Found 3 units damaged during warehouse inspection on 12 Aug 2026"
          className="input-field mt-1.5 resize-none"
          {...register('notes')}
        />
      </div>

      {/* FIFO note */}
      <div
        className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border"
        style={{ backgroundColor: 'var(--info-bg)', borderColor: 'var(--info-border)' }}
      >
        <Icon name="InformationCircleIcon" size={15} className="text-info flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">FIFO lot impact: </span>
          {adjustmentType === 'add'
            ? 'A new FIFO lot will be created at current cost price for the added units.'
            : adjustmentType === 'remove'
              ? 'Units will be consumed from the oldest FIFO lot first. COGS will be recorded.'
              : 'Stock will be set and FIFO lots reconciled. Variance will be recorded as an adjustment entry.'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary flex-1"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
          {isSubmitting ? (
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
              Saving Adjustment...
            </>
          ) : (
            <>
              <Icon name="CheckIcon" size={15} />
              Save Adjustment
            </>
          )}
        </button>
      </div>
    </form>
  );
}
