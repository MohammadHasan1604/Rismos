'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import NumericInput from '@/components/ui/NumericInput';
import StoreFormModal from './StoreFormModal';
import { useApp, StoreHub, InventoryItem } from '@/context/AppContext';
import { toast } from 'sonner';
import {
  calculateTransferLineItem,
  formatTransferAmount,
  formatTransferMargin,
  getTransferProfitColorClass,
  round2,
} from '@/lib/stockTransferCalculations';

export interface StockTransferModalProps {
  open: boolean;
  onClose: () => void;
  initialSourceStore?: string;
  initialDestStore?: string;
  initialItemId?: string;
  onSuccess?: () => void;
  zIndex?: number;
}

export default function StockTransferModal({
  open,
  onClose,
  initialSourceStore,
  initialDestStore,
  initialItemId,
  onSuccess,
  zIndex = 100,
}: StockTransferModalProps) {
  const {
    inventory,
    storesList,
    currentUser,
    transferStock,
    refreshAllData,
    confirmAction,
    branding,
    systemSettings,
  } = useApp();

  const currencyCode = systemSettings?.currencyCode || branding?.baseCurrency?.slice(0, 3) || 'INR';
  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const locale = branding?.locale || 'en-IN';

  const defaultSource =
    initialSourceStore || (currentUser.role === 'Super Admin' ? 'CENTRAL' : currentUser.store);
  const [sourceStore, setSourceStore] = useState(defaultSource);
  const [destStore, setDestStore] = useState(initialDestStore || 'BLR');
  const [selectedProductId, setSelectedProductId] = useState(initialItemId || '');
  const [transferQty, setTransferQty] = useState<number | ''>('');
  const [transferPriceInput, setTransferPriceInput] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Store Modal for "+ Add New Store"
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  // Available source physical locations
  const availableSourceStores = useMemo(() => {
    if (currentUser.role === 'Super Admin') {
      return storesList.filter((s) => s.status === 'Active');
    }
    return storesList.filter(
      (s) =>
        s.code === currentUser.store ||
        (currentUser.allowedStores && currentUser.allowedStores.includes(s.code))
    );
  }, [storesList, currentUser]);

  // Available destination locations (must be active and != source)
  const availableDestStores = useMemo(() => {
    return storesList.filter((s) => s.status === 'Active' && s.code !== sourceStore);
  }, [storesList, sourceStore]);

  // Source store options
  const sourceStoreOptions: SelectOption[] = useMemo(() => {
    return availableSourceStores.map((st) => ({
      value: st.code,
      label: `${st.code} — ${st.name}`,
      sublabel: st.city,
    }));
  }, [availableSourceStores]);

  // Dest store options
  const destStoreOptions: SelectOption[] = useMemo(() => {
    return availableDestStores.map((st) => ({
      value: st.code,
      label: `${st.code} — ${st.name}`,
      sublabel: st.city,
    }));
  }, [availableDestStores]);

  // Items available at source location
  const sourceInventoryItems = useMemo(() => {
    return inventory.filter((i) => i.store === sourceStore && i.qtyOnHand > 0);
  }, [inventory, sourceStore]);

  // Active selected item
  const activeItem = useMemo(() => {
    if (selectedProductId) {
      const match = sourceInventoryItems.find(
        (i) => i.id === selectedProductId || i.productId === selectedProductId
      );
      if (match) return match;
    }
    return sourceInventoryItems[0] || null;
  }, [selectedProductId, sourceInventoryItems]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);

  useEffect(() => {
    if (!prevOpenRef.current && open) {
      prevOpenRef.current = true;
      const src =
        initialSourceStore || (currentUser.role === 'Super Admin' ? 'CENTRAL' : currentUser.store);
      setSourceStore(src);
      const possibleDest =
        storesList.find((s) => s.status === 'Active' && s.code !== src)?.code || 'BLR';
      setDestStore(initialDestStore || possibleDest);
      if (initialItemId) setSelectedProductId(initialItemId);
      setTransferQty('');
      setNotes('');
    }

    if (!open) {
      prevOpenRef.current = false;
    }
  }, [open, initialSourceStore, initialDestStore, initialItemId]);

  const isDirty = React.useMemo(() => {
    return Boolean(transferQty !== '' || notes);
  }, [transferQty, notes]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this stock transfer. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  // Keep destination valid when source changes
  useEffect(() => {
    if (sourceStore === destStore) {
      const alt = availableDestStores[0]?.code || 'BLR';
      setDestStore(alt);
    }
  }, [sourceStore, destStore, availableDestStores]);

  // Update default transfer price when activeItem changes
  useEffect(() => {
    if (activeItem) {
      setTransferPriceInput(
        activeItem.transferPrice && activeItem.transferPrice > 0
          ? round2(activeItem.transferPrice)
          : round2(activeItem.costPrice || 0)
      );
    }
  }, [activeItem]);

  const unitCost = round2(activeItem ? Number(activeItem.costPrice) || 0 : 0);
  const effectivePrice =
    typeof transferPriceInput === 'number' && transferPriceInput >= 0
      ? round2(transferPriceInput)
      : unitCost;
  const availableStock = activeItem ? Number(activeItem.qtyOnHand) || 0 : 0;

  const numericQty = transferQty === '' ? 0 : Number(transferQty);
  // Live calculation breakdown
  const lineCalc = useMemo(() => {
    return calculateTransferLineItem({
      qty: numericQty,
      costPerUnit: unitCost,
      transferPricePerUnit: effectivePrice,
    });
  }, [numericQty, unitCost, effectivePrice]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeItem) {
      toast.error('Please select an item to transfer');
      return;
    }

    if (!transferQty || Number(transferQty) <= 0) {
      toast.error('Please enter a valid transfer quantity greater than 0');
      return;
    }

    const qtyNum = parseInt(String(transferQty), 10);
    if (qtyNum > availableStock) {
      toast.error(
        `Transfer quantity (${qtyNum}) exceeds available stock (${availableStock}) at ${sourceStore}`
      );
      return;
    }

    if (transferPriceInput === '' || Number(transferPriceInput) < 0) {
      toast.error('Transfer Price must be a positive number or zero');
      return;
    }

    const confirmed = await confirmAction({
      actionType: 'transfer',
      title: 'Confirm Inter-Store Stock Transfer',
      subtitle: 'Please review source hub, destination, item, and transfer quantity.',
      confirmLabel: 'Confirm & Dispatch Transfer',
      summaryItems: [
        { label: 'Source Location', value: sourceStore },
        { label: 'Destination Store', value: destStore },
        { label: 'Product Name', value: activeItem.name, highlighted: true },
        { label: 'SKU', value: activeItem.sku },
        { label: 'Transfer Quantity', value: `${qtyNum} unit(s)` },
        { label: 'Transfer Price/Unit', value: formatTransferAmount(effectivePrice, { currencyCode, currencySymbol, locale }) },
        {
          label: 'Total Transfer Value',
          value: formatTransferAmount(effectivePrice * qtyNum, { currencyCode, currencySymbol, locale }),
        },
      ],
      warningMessage: `This will immediately deduct ${qtyNum} units from ${sourceStore} and credit them into ${destStore}.`,
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await transferStock(
        sourceStore,
        destStore,
        activeItem.productId || activeItem.id,
        qtyNum,
        effectivePrice,
        'Completed',
        notes.trim() || undefined
      );

      if (!res?.success) {
        return;
      }

      await refreshAllData();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch stock transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title="Initiate Inter-Store Stock Transfer"
        subtitle="Transfer goods between warehouse hubs and retail branches with automated inventory adjustments"
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
              form="stock-transfer-form"
              className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial"
              disabled={isSubmitting || sourceInventoryItems.length === 0 || !transferQty}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Dispatching...
                </>
              ) : (
                <>
                  <Icon name="ArrowPathRoundedSquareIcon" size={14} />
                  Confirm & Dispatch Stock
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="stock-transfer-form" onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Source & Destination Route */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <CustomSelect
                label="Dispatching Source Hub"
                required
                placeholder="Select source store..."
                value={sourceStore}
                onChange={(val) => {
                  setSourceStore(val);
                  setSelectedProductId('');
                }}
                options={sourceStoreOptions}
                searchable={true}
                addNewLabel="+ Add New Store"
                onAddNew={() => setStoreModalOpen(true)}
                size="sm"
              />
            </div>

            <div>
              <CustomSelect
                label="Destination Store / Hub"
                required
                placeholder="Select destination..."
                value={destStore}
                onChange={setDestStore}
                options={destStoreOptions}
                searchable={true}
                addNewLabel="+ Add New Store"
                onAddNew={() => setStoreModalOpen(true)}
                size="sm"
              />
            </div>
          </div>

          {/* Product / SKU Selection */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Select Product SKU at {sourceStore} <span className="text-danger">*</span>
            </label>
            {sourceInventoryItems.length === 0 ? (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                No inventory currently in stock at <strong>{sourceStore}</strong>. Please select
                another source store.
              </div>
            ) : (
              <CustomSelect
                placeholder="Search SKU or product name..."
                value={activeItem?.id || ''}
                onChange={(val) => setSelectedProductId(val)}
                options={sourceInventoryItems.map((it) => ({
                  value: it.id,
                  label: it.name,
                  sublabel: `SKU: ${it.sku} · Avail: ${it.qtyOnHand} pcs · Base Cost: ${formatTransferAmount(it.costPrice, { currencyCode, currencySymbol, locale })}`,
                }))}
                searchable={true}
                size="sm"
              />
            )}
          </div>

          {/* Active Item Context Banner */}
          {activeItem && (
            <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{activeItem.name}</p>
                <p className="text-3xs text-muted-foreground font-mono">SKU: {activeItem.sku}</p>
              </div>
              <div className="text-right">
                <span className="text-3xs text-muted-foreground block">Available Stock:</span>
                <strong className="text-foreground text-sm font-tabular">
                  {availableStock} units
                </strong>
              </div>
            </div>
          )}

          {/* Quantity & Transfer Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Transfer Quantity <span className="text-danger">*</span>
              </label>
              <NumericInput
                required
                min={1}
                max={availableStock || undefined}
                allowDecimals={false}
                placeholder="e.g. 10"
                value={transferQty}
                onChange={(val) => setTransferQty(val)}
                className="text-xs font-bold font-tabular h-8"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Transfer Price / Unit ({currencySymbol}) <span className="text-danger">*</span>
              </label>
              <NumericInput
                required
                min={0}
                step="0.01"
                allowDecimals={true}
                placeholder="e.g. 1200.00"
                value={transferPriceInput}
                onChange={(val) => setTransferPriceInput(val)}
                className="text-xs font-bold font-tabular text-primary h-8"
              />
            </div>
          </div>

          {/* Live Calculations Breakdown */}
          {activeItem && (
            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2 font-tabular text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Inventory Cost ({transferQty || 0} × {formatTransferAmount(unitCost, { currencyCode, currencySymbol, locale })}):
                </span>
                <span className="font-semibold text-foreground">
                  {formatTransferAmount(lineCalc.lineTotalCost, { currencyCode, currencySymbol, locale })}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Transfer Value ({transferQty || 0} × {formatTransferAmount(effectivePrice, { currencyCode, currencySymbol, locale })}):
                </span>
                <span className="font-bold text-foreground">
                  {formatTransferAmount(lineCalc.lineTotalValue, { currencyCode, currencySymbol, locale })}
                </span>
              </div>
              <div
                className={`flex justify-between pt-1 border-t border-primary/20 font-bold ${getTransferProfitColorClass(lineCalc.lineProfit)}`}
              >
                <span>Gross Transfer Profit:</span>
                <span>
                  {formatTransferAmount(lineCalc.lineProfit, { showPositiveSign: true, currencyCode, currencySymbol, locale })}{' '}
                  <span className="text-3xs font-semibold">
                    ({formatTransferMargin(lineCalc.profitMarginPercent)})
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Transfer Dispatch Notes */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Dispatch Instructions / Vehicle Notes{' '}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Dispatched via Express Logistics Van #4"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field text-xs h-8"
            />
          </div>
        </form>
      </Modal>

      {/* Embedded Master Store Form Modal for "+ Add New Store" */}
      <StoreFormModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        onSuccess={(newStore: StoreHub) => {
          setDestStore(newStore.code);
          toast.success(`Store "${newStore.name}" (${newStore.code}) added & selected!`);
        }}
        zIndex={zIndex + 20}
      />
    </>
  );
}
