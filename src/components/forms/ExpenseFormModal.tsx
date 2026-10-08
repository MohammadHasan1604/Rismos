'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import NumericInput from '@/components/ui/NumericInput';
import PaymentProofUpload from '@/components/ui/PaymentProofUpload';
import CategoryFormModal from './CategoryFormModal';
import StoreFormModal from './StoreFormModal';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import { useApp, Expense, CategoryItem, StoreHub } from '@/context/AppContext';
import { toast } from 'sonner';

export interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  onSuccess?: (expense: Expense) => void;
  zIndex?: number;
}

export default function ExpenseFormModal({
  open,
  onClose,
  expense,
  onSuccess,
  zIndex = 100,
}: ExpenseFormModalProps) {
  const {
    addExpense,
    updateExpense,
    selectedStore,
    storesList,
    categoriesList,
    paymentMethods,
    confirmAction,
    formatCurrency,
    systemSettings,
  } = useApp();
  const currencySymbol = systemSettings?.currencySymbol || '₹';

  const isEdit = Boolean(expense);

  const [category, setCategory] = useState('Store Rent');
  const [store, setStore] = useState('CENTRAL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic child modals for single-source-of-truth master entity onboarding
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  // Expense Categories list
  const expenseCategoryOptions: SelectOption[] = useMemo(() => {
    const list = categoriesList.filter((c) => c.status !== 'Archived');
    const expenseCats = list.filter((c) => c.categoryType === 'Expense');
    const otherCats = list.filter((c) => c.categoryType !== 'Expense');
    const ordered = [...expenseCats, ...otherCats];

    const set = new Set<string>();
    const opts: SelectOption[] = [];

    ordered.forEach((c) => {
      set.add(c.name.toLowerCase());
      opts.push({
        value: c.name,
        label: c.name,
        sublabel: c.categoryType === 'Expense' ? 'Expense Category' : c.categoryType,
        badge: c.categoryType === 'Expense' ? 'Expense' : undefined,
      });
    });

    const fallbackDefaults = [
      'Store Rent',
      'Utilities & Power',
      'Logistics & Freight',
      'Staff Salaries',
      'Maintenance & Repairs',
      'Marketing',
      'Office Supplies',
    ];
    fallbackDefaults.forEach((f) => {
      if (!set.has(f.toLowerCase())) {
        opts.push({ value: f, label: f, sublabel: 'Operating Expense' });
      }
    });

    return opts;
  }, [categoriesList]);

  // Stores list
  const storeOptions: SelectOption[] = useMemo(() => {
    return [
      { value: 'CENTRAL', label: 'COSKO Central Warehouse (CENTRAL)', sublabel: 'Central Hub' },
      ...storesList
        .filter((s) => s.code !== 'CENTRAL')
        .map((st) => ({
          value: st.code,
          label: `${st.code} — ${st.name}`,
          sublabel: st.city,
          badge: st.status,
        })),
    ];
  }, [storesList]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editExpenseIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetExpenseChanging =
      open && Boolean(expense?.id) && expense?.id !== editExpenseIdRef.current;

    if (isOpening || isTargetExpenseChanging) {
      prevOpenRef.current = open;
      editExpenseIdRef.current = expense?.id || null;

      if (expense) {
        setCategory(expense.category || 'Store Rent');
        setStore(expense.store || 'CENTRAL');
        setDescription(expense.description || '');
        setAmount(
          expense.amount !== undefined && expense.amount !== null ? Number(expense.amount) : ''
        );
        setPaymentMethod(expense.paymentMethod || 'Cash');
        setReferenceNo(expense.referenceNo || '');
        setReceiptUrl(expense.receiptUrl || null);
      } else {
        setCategory(expenseCategoryOptions[0]?.value || 'Store Rent');
        const defaultStore = selectedStore === 'All Stores' ? 'CENTRAL' : selectedStore;
        setStore(defaultStore);
        setDescription('');
        setAmount('');
        setPaymentMethod('Cash');
        setReferenceNo('');
        setReceiptUrl(null);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editExpenseIdRef.current = null;
    }
  }, [open, expense?.id]);

  const isDirty = React.useMemo(() => {
    if (expense) {
      return (
        description !== (expense.description || '') ||
        amount !== (expense.amount !== undefined ? Number(expense.amount) : '') ||
        referenceNo !== (expense.referenceNo || '')
      );
    }
    return Boolean(description || amount !== '' || referenceNo || receiptUrl);
  }, [expense, description, amount, referenceNo, receiptUrl]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this expense form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category.trim()) {
      toast.error('Expense Category is required');
      return;
    }

    if (amount === '' || Number(amount) <= 0 || isNaN(Number(amount))) {
      toast.error('Please enter a valid positive expense amount');
      return;
    }

    const parsedAmount = Math.round(Number(amount) * 100) / 100;
    const effectiveRef = referenceNo.trim() || `EXP-${Date.now().toString(36).toUpperCase()}`;

    if (!receiptUrl) {
      toast.error('Payment proof is mandatory! Please upload a receipt or voucher.');
      return;
    }

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? 'Confirm Expense Modification' : 'Confirm Expense Voucher',
      subtitle: 'Please review category, amount, and store details before recording.',
      confirmLabel: isEdit ? 'Confirm & Update Expense' : 'Confirm & Record Expense',
      summaryItems: [
        { label: 'Category', value: category.trim() },
        { label: 'Store Location', value: store },
        { label: 'Payment Method', value: paymentMethod },
        { label: 'Description', value: description.trim() || 'N/A' },
        {
          label: 'Expense Amount',
          value: formatCurrency(parsedAmount),
          highlighted: true,
        },
      ],
      warningMessage:
        'This will be booked as an operating expense in the store profit and loss statement.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && expense) {
        await updateExpense(expense.id, {
          category: category.trim(),
          amount: parsedAmount,
          store,
          description: description.trim(),
          paymentMethod,
          referenceNo: effectiveRef,
          receiptUrl,
        });
        toast.success(`Expense ${expense.referenceNo || expense.id} updated successfully!`);
        if (onSuccess) {
          onSuccess({
            ...expense,
            category: category.trim(),
            amount: parsedAmount,
            store,
            description: description.trim(),
            paymentMethod,
            referenceNoText: effectiveRef,
            receiptUrl,
          });
        }
      } else {
        await addExpense({
          category: category.trim(),
          amount: parsedAmount,
          store,
          description: description.trim(),
          paymentMethod,
          referenceNoText: effectiveRef,
          receiptUrl,
          status: 'Approved',
        });
        toast.success(`Expense of ${formatCurrency(parsedAmount)} recorded successfully!`);
        if (onSuccess) {
          onSuccess({
            id: 'temp-' + Date.now(),
            referenceNo: effectiveRef,
            category: category.trim(),
            amount: parsedAmount,
            store,
            description: description.trim(),
            paymentMethod,
            referenceNoText: referenceNo.trim() || undefined,
            receiptUrl,
            date: new Date().toISOString().split('T')[0],
            approvedBy: 'Current User',
            recordedBy: 'Current User',
          } as Expense);
        }
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={
          isEdit ? `Edit Expense (${expense?.referenceNo || ''})` : 'Record Operational Expense'
        }
        subtitle={
          isEdit
            ? 'Update expense details and attachments'
            : 'Track rent, utilities, maintenance, or store disbursements with proof'
        }
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
              form="expense-form"
              className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || !receiptUrl || !amount || Number(amount) <= 0}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Expense...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckCircleIcon" size={14} />
                  <span>{isEdit ? 'Update Expense' : 'Record Expense'}</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="expense-form" onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
          {/* Category & Store with "+ Add New" */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <CustomSelect
                label="Expense Category"
                required
                placeholder="Select expense category..."
                value={category}
                onChange={setCategory}
                options={expenseCategoryOptions}
                searchable={true}
                addNewLabel="+ Add New Category"
                onAddNew={() => setCategoryModalOpen(true)}
                size="sm"
              />
            </div>

            <div>
              <CustomSelect
                label="Store / Warehouse Hub"
                required
                placeholder="Select store..."
                value={store}
                onChange={setStore}
                options={storeOptions}
                searchable={true}
                addNewLabel="+ Add New Store"
                onAddNew={() => setStoreModalOpen(true)}
                size="sm"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Description / Notes <span className="text-danger">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Monthly utilities and operational expense"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field text-xs h-8"
            />
          </div>

          {/* Amount & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Amount ({currencySymbol}) <span className="text-danger">*</span>
              </label>
              <NumericInput
                required
                min={0.01}
                step="0.01"
                allowDecimals={true}
                placeholder="e.g. 5000.00"
                value={amount}
                onChange={(val) => setAmount(val)}
                className="text-xs font-bold font-tabular h-8"
              />
            </div>

            <div>
              <PaymentMethodSelect
                label="Payment Method"
                required
                value={paymentMethod}
                onChange={setPaymentMethod}
                size="sm"
                modalZIndex={zIndex + 20}
              />
            </div>
          </div>

          {/* Mandatory Payment Proof Attachment */}
          <PaymentProofUpload
            value={receiptUrl}
            onChange={setReceiptUrl}
            required={true}
            label="Payment Proof * (Receipt / Bill / Voucher)"
            helperText="Upload official invoice, bank confirmation, or voucher (JPG, PNG, WebP, PDF) — Required"
            storeCode={store}
            relatedEntityType="Expense"
            relatedEntityId={expense?.id}
          />

          {/* Validation Helper Notice */}
          {!receiptUrl && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-3xs font-semibold">
              <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0 text-amber-600" />
              <span>
                Payment Proof is strictly mandatory. Upload receipt/bill above to enable{' '}
                {isEdit ? 'updating' : 'recording'} expense.
              </span>
            </div>
          )}

        </form>
      </Modal>

      {/* Embedded Master Category Form Modal for "+ Add New Category" */}
      <CategoryFormModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        initialCategoryType="Expense"
        lockCategoryType={true}
        onSuccess={(catName) => {
          setCategory(catName);
          toast.success(`Expense Category "${catName}" selected!`);
        }}
        zIndex={zIndex + 20}
      />

      {/* Embedded Master Store Form Modal for "+ Add New Store" */}
      <StoreFormModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        onSuccess={(newStore: StoreHub) => {
          setStore(newStore.code);
          toast.success(`Store "${newStore.name}" (${newStore.code}) selected!`);
        }}
        zIndex={zIndex + 20}
      />
    </>
  );
}
