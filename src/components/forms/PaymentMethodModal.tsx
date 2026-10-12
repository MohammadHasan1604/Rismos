'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import NumericInput from '@/components/ui/NumericInput';
import { useApp, PaymentMethodItem } from '@/context/AppContext';
import { toast } from 'sonner';

export interface PaymentMethodModalProps {
  open: boolean;
  onClose: () => void;
  paymentMethod?: PaymentMethodItem | null;
  onSuccess?: (methodName: string, method?: PaymentMethodItem) => void;
  initialName?: string;
  quickMode?: boolean;
  zIndex?: number;
}

// Operational payment instruments strictly: Cash, UPI, Other
const PAYMENT_TYPES = [
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI / QR' },
  { value: 'Other', label: 'Other' },
];

export default function PaymentMethodModal({
  open,
  onClose,
  paymentMethod,
  onSuccess,
  initialName = '',
  quickMode = false,
  zIndex = 110,
}: PaymentMethodModalProps) {
  const { paymentMethods, addPaymentMethod, updatePaymentMethod, confirmAction } = useApp();

  const isEdit = Boolean(paymentMethod);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('Cash');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editMethodIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetMethodChanging =
      open && Boolean(paymentMethod?.id) && paymentMethod?.id !== editMethodIdRef.current;

    if (isOpening || isTargetMethodChanging) {
      prevOpenRef.current = open;
      editMethodIdRef.current = paymentMethod?.id || null;

      if (paymentMethod) {
        setName(paymentMethod.name || '');
        setCode(paymentMethod.code || '');
        setType(paymentMethod.type || 'Cash');
        setDescription(paymentMethod.description || '');
        setSortOrder(paymentMethod.sortOrder || 0);
        setIsActive(paymentMethod.status === 'Active');
      } else {
        setName(initialName);
        setCode(
          initialName
            ? initialName
                .toUpperCase()
                .replace(/[^A-Z0-9_]+/g, '_')
                .slice(0, 32)
            : ''
        );
        setType('Cash');
        setDescription('');
        setSortOrder(paymentMethods.length + 1);
        setIsActive(true);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editMethodIdRef.current = null;
    }
  }, [open, paymentMethod, paymentMethods.length, initialName]);

  const isDirty = React.useMemo(() => {
    if (paymentMethod) {
      return (
        name !== (paymentMethod.name || '') ||
        code !== (paymentMethod.code || '') ||
        description !== (paymentMethod.description || '')
      );
    }
    return Boolean(name || code || description);
  }, [paymentMethod, name, code, description]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this payment method form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit) {
      const generated = val
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_')
        .slice(0, 32);
      setCode(generated);
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Payment Method Name is required');
      return;
    }

    // Check duplicate name for new methods
    if (!isEdit) {
      const duplicate = paymentMethods.find(
        (m) => m.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        toast.info(`Payment Method "${cleanName}" already exists. Selecting it.`);
        if (onSuccess) onSuccess(duplicate.name, duplicate);
        onClose();
        return;
      }
    }

    const cleanCode =
      code.trim().toUpperCase() ||
      cleanName
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_')
        .slice(0, 32);

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Update Payment Method: ${cleanName}` : 'Create New Payment Method',
      subtitle: 'Please review payment method classification and code.',
      confirmLabel: isEdit ? 'Confirm & Update Method' : 'Confirm & Save Method',
      summaryItems: [
        { label: 'Method Name', value: cleanName, highlighted: true },
        { label: 'Instrument Code', value: cleanCode },
        { label: 'Classification', value: type },
        { label: 'Status', value: isActive ? 'Active' : 'Inactive' },
      ],
      warningMessage: isEdit
        ? 'Updating this payment method will reflect immediately across all checkout and voucher forms.'
        : 'Once created, this payment method will immediately be available across POS, Expenses, Supplier Payments, and POs.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && paymentMethod) {
        const res = await updatePaymentMethod(paymentMethod.id, {
          name: cleanName,
          code: cleanCode,
          type,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
          sortOrder: Number(sortOrder) || 0,
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.paymentMethod);
          onClose();
        }
      } else {
        const res = await addPaymentMethod({
          name: cleanName,
          code: cleanCode,
          type,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
          sortOrder: Number(sortOrder) || 0,
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.paymentMethod);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving payment method');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title={
        isEdit
          ? `Edit Payment Method: ${paymentMethod?.name}`
          : quickMode
            ? '+ Add New Payment Method'
            : 'Create Payment Method'
      }
      subtitle={
        isEdit
          ? `Code: ${paymentMethod?.code}`
          : 'Define financial instruments for POS checkout and expenditure vouchers'
      }
      size={quickMode ? 'compact' : 'standard'}
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
            form="payment-method-form"
            className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Icon name="CheckCircleIcon" size={14} />
                {isEdit ? 'Update Payment Method' : 'Create Payment Method'}
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="payment-method-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Method Name */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Payment Method Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. PhonePe QR, ICICI Corporate NetBanking, Amex Corporate"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        {/* Code & Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Method Code{' '}
              <span className="text-3xs text-muted-foreground font-normal">(Auto-generated)</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. PHONEPE_QR"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input-field text-xs font-mono font-bold uppercase"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Instrument Classification <span className="text-danger">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input-field text-xs font-medium"
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {type && !PAYMENT_TYPES.some((t) => t.value === type) && (
                <option value={type}>{type} (Historical)</option>
              )}
            </select>
          </div>
        </div>

        {/* Description / Bank Details */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Description / Account Details{' '}
            <span className="text-3xs text-muted-foreground font-normal">(Optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Indiranagar Branch HDFC Current Account 502000xxxx"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field text-xs resize-none"
          />
        </div>

        {/* Sort Order & Active Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-foreground">Sort Order:</label>
            <NumericInput
              min={0}
              allowDecimals={false}
              value={sortOrder}
              onChange={(val) => setSortOrder(Number(val) || 0)}
              className="w-20 text-xs font-tabular h-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Status (Active):</span>
            <ToggleSwitch
              checked={isActive}
              onChange={setIsActive}
              size="sm"
              onText="ON"
              offText="OFF"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
