'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import NumericInput from '@/components/ui/NumericInput';
import { useApp, PurchaseOrder, InventoryItem } from '@/context/AppContext';
import VendorFormModal from './VendorFormModal';
import StoreFormModal from './StoreFormModal';
import ProductFormModal from './ProductFormModal';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import PaymentProofUpload from '@/components/ui/PaymentProofUpload';
import { getJurisdictionProfile } from '@/lib/localization/jurisdictions';
import { toast } from 'sonner';

export interface PurchaseOrderLineItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  qty: number | '';
  unitCost: number | '';
  taxRate: number;
  taxAmount: number;
  discount: number | '';
  lineTotal: number;
}

interface PurchaseOrderFormModalProps {
  open: boolean;
  onClose: () => void;
  purchase?: PurchaseOrder | null;
  onSuccess?: (po: PurchaseOrder) => void;
  zIndex?: number;
}

export default function PurchaseOrderFormModal({
  open,
  onClose,
  purchase,
  onSuccess,
  zIndex = 100,
}: PurchaseOrderFormModalProps) {
  const {
    vendors,
    inventory,
    storesList,
    paymentMethods,
    currentUser,
    addPurchase,
    updatePurchase,
    refreshAllData,
    confirmAction,
    systemSettings,
    branding,
    formatCurrency,
  } = useApp();

  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';
  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const jurProfile = getJurisdictionProfile(countryCode);
  const taxLabel = jurProfile?.taxLabel || 'Tax';

  const defaultPaymentMethod = useMemo(() => {
    return paymentMethods.find((m) => m.status === 'Active')?.name || 'Cash';
  }, [paymentMethods]);

  const defaultStore =
    currentUser.role === 'Super Admin'
      ? 'CENTRAL'
      : currentUser.store || storesList[0]?.code || 'CENTRAL';

  // PO Header Details
  const [vendorName, setVendorName] = useState('');
  const [store, setStore] = useState(defaultStore);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'Ordered' | 'Received' | 'Pending'>('Ordered');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Partial' | 'Unpaid'>('Unpaid');
  const [paidAmount, setPaidAmount] = useState<string | number>('');
  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line items state
  const [items, setItems] = useState<PurchaseOrderLineItem[]>([]);

  // Child Modals for single-source-of-truth master entity onboarding
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [activeItemIndexForProductCreate, setActiveItemIndexForProductCreate] = useState<
    number | null
  >(null);

  const isEdit = Boolean(purchase);

  // Vendor options for CustomSelect
  const vendorOptions: SelectOption[] = useMemo(() => {
    return vendors
      .filter((v) => v.status !== 'Archived')
      .map((v) => ({
        value: v.name,
        label: v.name,
        sublabel: `${v.code} · ${v.category || 'General'} · ${v.phone || ''}`,
        badge: v.gstin ? taxLabel || 'Tax' : undefined,
      }));
  }, [vendors, taxLabel]);

  // Store options for CustomSelect
  const storeOptions: SelectOption[] = useMemo(() => {
    if (currentUser.role !== 'Super Admin') {
      const userStore = currentUser.store || storesList[0]?.code || 'CENTRAL';
      const found = storesList.find((s) => s.code === userStore);
      return [
        {
          value: userStore,
          label: `${userStore} · ${found?.name || userStore}`,
          sublabel: found?.city || userStore,
          badge: 'Assigned Store',
        },
      ];
    }
    return [
      { value: 'CENTRAL', label: 'CENTRAL Warehouse (Central Hub)', sublabel: 'Central Warehouse' },
      ...storesList
        .filter((s) => s.code !== 'CENTRAL')
        .map((s) => ({
          value: s.code,
          label: `${s.code} · ${s.name}`,
          sublabel: s.city,
          badge: s.status,
        })),
    ];
  }, [storesList, currentUser.role, currentUser.store]);

  // Deduplicated unique catalog products for item selection
  const catalogProductOptions: SelectOption[] = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventory.forEach((i) => {
      const key = i.productId || i.sku;
      if (!map.has(key)) {
        map.set(key, i);
      }
    });

    return Array.from(map.values()).map((p) => ({
      value: p.productId || p.id,
      label: `${p.name} (${p.sku})`,
      sublabel: `Cost: ${formatCurrency(p.costPrice)} · ${taxLabel}: ${p.taxRate || 0}% · Stock: ${p.qtyOnHand}`,
      badge: p.brand || undefined,
    }));
  }, [inventory, formatCurrency, taxLabel]);

  // Helper to calculate line item values
  const calculateLineItem = (
    qtyVal: number | '',
    costVal: number | '',
    taxRateVal: number,
    discountVal: number | ''
  ) => {
    const q = typeof qtyVal === 'number' && qtyVal > 0 ? qtyVal : 0;
    const c = typeof costVal === 'number' && costVal >= 0 ? costVal : 0;
    const d = typeof discountVal === 'number' && discountVal >= 0 ? discountVal : 0;
    const rawSubtotal = q * c;
    const discountedBase = Math.max(0, rawSubtotal - d);
    const taxAmt = Math.round(((discountedBase * taxRateVal) / 100) * 100) / 100;
    const total = Math.round((discountedBase + taxAmt) * 100) / 100;

    return {
      taxAmount: taxAmt,
      lineTotal: total,
    };
  };

  // Helper to create an empty line item
  const createEmptyLineItem = (): PurchaseOrderLineItem => ({
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    productId: '',
    sku: '',
    name: '',
    qty: 1,
    unitCost: '',
    taxRate: 0,
    taxAmount: 0,
    discount: '',
    lineTotal: 0,
  });

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
        setVendorName(purchase.vendorName || '');
        setStore(purchase.store || defaultStore);
        setInvoiceNo(purchase.invoiceNo || '');
        setOrderDate(
          purchase.createdAt
            ? new Date(purchase.createdAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
        );
        setExpectedDate(purchase.expectedDate || '');
        setDueDate(purchase.dueDate || '');
        setStatus((purchase.status as any) || 'Ordered');
        const realPaid =
          purchase.payments && purchase.payments.length > 0
            ? purchase.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
            : purchase.paidAmount !== undefined && purchase.paidAmount !== null
              ? Number(purchase.paidAmount)
              : 0;
        setPaidAmount(realPaid > 0 ? realPaid : '');
        setPaymentStatus(purchase.paymentStatus || 'Unpaid');
        setNotes(purchase.notes || '');

        if (purchase.items && purchase.items.length > 0) {
          const loadedItems: PurchaseOrderLineItem[] = purchase.items.map(
            (it: any, index: number) => {
              const matchedInv = inventory.find(
                (inv) => (inv.productId && inv.productId === it.productId) || inv.sku === it.sku
              );
              const prodId =
                it.productId || it.itemId || matchedInv?.productId || matchedInv?.id || '';
              const sku = it.sku || matchedInv?.sku || '';
              const name = it.name || matchedInv?.name || 'Item';
              const qtyVal = Number(it.qty) || 1;
              const unitCostVal = Number(it.unitCost) || Number(matchedInv?.costPrice) || 0;
              const taxRateVal =
                it.taxRate !== undefined ? Number(it.taxRate) : matchedInv?.taxRate || 0;
              const discountVal =
                it.discount !== undefined && it.discount !== null ? Number(it.discount) : '';
              const { taxAmount, lineTotal } = calculateLineItem(
                qtyVal,
                unitCostVal,
                taxRateVal,
                discountVal
              );

              return {
                id: it.id || `po-it-${index}-${Date.now()}`,
                productId: prodId,
                sku,
                name,
                qty: qtyVal,
                unitCost: unitCostVal,
                taxRate: taxRateVal,
                taxAmount,
                discount: discountVal,
                lineTotal: it.lineTotal ? Number(it.lineTotal) : lineTotal,
              };
            }
          );
          setItems(loadedItems);
        } else {
          setItems([createEmptyLineItem()]);
        }
      } else {
        // New PO defaults
        const todayStr = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        setVendorName(vendors[0]?.name || '');
        setStore(defaultStore);
        setInvoiceNo('');
        setOrderDate(todayStr);
        setExpectedDate(nextWeekStr);
        setDueDate('');
        setStatus('Ordered');
        setPaymentStatus('Unpaid');
        setPaidAmount('');
        setNotes('');
        setItems([createEmptyLineItem()]);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editPurchaseIdRef.current = null;
    }
  }, [open, purchase?.id]);

  const isDirty = React.useMemo(() => {
    if (purchase) {
      return (
        vendorName !== (purchase.vendorName || '') ||
        invoiceNo !== (purchase.invoiceNo || '') ||
        notes !== (purchase.notes || '')
      );
    }
    return Boolean(
      invoiceNo ||
      notes ||
      items.length > 1 ||
      Boolean(items[0] && (items[0].productId || items[0].name || items[0].unitCost !== ''))
    );
  }, [purchase, vendorName, invoiceNo, notes, items]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this purchase order form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  // Live Financial Summaries
  const financials = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let grandTotal = 0;

    items.forEach((it) => {
      const q = typeof it.qty === 'number' && it.qty > 0 ? it.qty : 0;
      const c = typeof it.unitCost === 'number' && it.unitCost >= 0 ? it.unitCost : 0;
      const d = typeof it.discount === 'number' && it.discount >= 0 ? it.discount : 0;

      const rawSub = q * c;
      subtotal += rawSub;
      totalDiscount += d;
      totalTax += it.taxAmount || 0;
      grandTotal += it.lineTotal || 0;
    });

    subtotal = Math.round(subtotal * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    totalTax = Math.round(totalTax * 100) / 100;
    grandTotal = Math.round(grandTotal * 100) / 100;

    let computedPaid = 0;
    if (paymentStatus === 'Paid') {
      computedPaid = grandTotal;
    } else if (paymentStatus === 'Unpaid') {
      computedPaid = 0;
    } else {
      computedPaid =
        typeof paidAmount === 'number' ? paidAmount : parseFloat(String(paidAmount)) || 0;
    }

    const remaining = Math.max(0, Math.round((grandTotal - computedPaid) * 100) / 100);

    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal,
      paidAmount: computedPaid,
      remainingAmount: remaining,
    };
  }, [items, paymentStatus, paidAmount]);

  // Sync paidAmount when payment status changes
  const handlePaymentStatusChange = (newStatus: 'Paid' | 'Partial' | 'Unpaid') => {
    setPaymentStatus(newStatus);
    if (newStatus === 'Paid') {
      setPaidAmount(financials.grandTotal);
    } else if (newStatus === 'Unpaid') {
      setPaidAmount('');
    } else {
      // Partial: default to half or current
      setPaidAmount(
        financials.grandTotal > 0 ? Math.round((financials.grandTotal / 2) * 100) / 100 : ''
      );
    }
  };

  // Line Item Update handler
  const updateItemField = (index: number, fields: Partial<PurchaseOrderLineItem>) => {
    setItems((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], ...fields };

      const calc = calculateLineItem(
        current.qty,
        current.unitCost,
        current.taxRate,
        current.discount
      );
      updated[index] = {
        ...current,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      };
      return updated;
    });
  };

  // Product Selection with Intelligent Duplicate Merge
  const handleProductSelect = (index: number, selectedProductId: string) => {
    if (!selectedProductId) {
      updateItemField(index, {
        productId: '',
        sku: '',
        name: '',
        unitCost: '',
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 0,
      });
      return;
    }

    // Find catalog product
    const product = inventory.find(
      (i) => (i.productId && i.productId === selectedProductId) || i.id === selectedProductId
    );
    if (!product) return;

    // Check if this product/SKU is already on ANOTHER line item
    const duplicateIndex = items.findIndex(
      (it, idx) =>
        idx !== index &&
        ((it.productId && it.productId === product.productId) || (it.sku && it.sku === product.sku))
    );

    if (duplicateIndex !== -1) {
      // Intelligent duplicate merge! Increment quantity on the existing line item
      const existingRow = items[duplicateIndex];
      const currentQtyOnExisting = typeof existingRow.qty === 'number' ? existingRow.qty : 1;
      const addingQty =
        typeof items[index].qty === 'number' && items[index].qty > 0
          ? (items[index].qty as number)
          : 1;
      const newMergedQty = currentQtyOnExisting + addingQty;

      // Update existing row
      const calc = calculateLineItem(
        newMergedQty,
        existingRow.unitCost,
        existingRow.taxRate,
        existingRow.discount
      );
      const updatedItems = [...items];
      updatedItems[duplicateIndex] = {
        ...existingRow,
        qty: newMergedQty,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      };

      // Remove or reset the duplicate row
      if (updatedItems.length > 1) {
        updatedItems.splice(index, 1);
      } else {
        updatedItems[0] = createEmptyLineItem();
      }

      setItems(updatedItems);
      toast.info(
        `"${product.name}" (${product.sku}) is already in this order. Merged quantity to ${newMergedQty}!`
      );
      return;
    }

    // Normal assignment
    const qtyVal =
      typeof items[index].qty === 'number' && items[index].qty > 0 ? items[index].qty : 1;
    const costVal = Number(product.costPrice) || 0;
    const taxVal = Number(product.taxRate) || 0;
    const discVal = items[index].discount;
    const calc = calculateLineItem(qtyVal, costVal, taxVal, discVal);

    updateItemField(index, {
      productId: product.productId || product.id,
      sku: product.sku,
      name: product.name,
      unitCost: costVal,
      taxRate: taxVal,
      taxAmount: calc.taxAmount,
      lineTotal: calc.lineTotal,
    });
  };

  // Add Item Line
  const handleAddLineItem = () => {
    setItems((prev) => [...prev, createEmptyLineItem()]);
  };

  // Remove Item Line
  const handleRemoveLineItem = (index: number) => {
    if (items.length === 1) {
      // Keep at least 1 row, just clear it
      setItems([createEmptyLineItem()]);
    } else {
      setItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Handler when "+ Add New Product" is clicked for a specific line item
  const handleOpenProductCreateForLine = (lineIndex: number) => {
    setActiveItemIndexForProductCreate(lineIndex);
    setProductModalOpen(true);
  };

  // Handler when ProductFormModal successfully saves a product
  const handleProductCreated = (newProduct: InventoryItem) => {
    setProductModalOpen(false);
    toast.success(`Catalog product "${newProduct.name}" (${newProduct.sku}) created!`);

    const targetIndex =
      activeItemIndexForProductCreate !== null && activeItemIndexForProductCreate < items.length
        ? activeItemIndexForProductCreate
        : items.length - 1;

    // Auto-select the newly created product into the target row
    const prodId = newProduct.productId || newProduct.id;
    const costVal = Number(newProduct.costPrice) || 0;
    const taxVal = Number(newProduct.taxRate) || 0;
    const currentQty =
      typeof items[targetIndex]?.qty === 'number' && items[targetIndex].qty > 0
        ? items[targetIndex].qty
        : 1;
    const currentDisc = items[targetIndex]?.discount || '';
    const calc = calculateLineItem(currentQty, costVal, taxVal, currentDisc);

    setItems((prev) => {
      const updated = [...prev];
      updated[targetIndex] = {
        ...updated[targetIndex],
        productId: prodId,
        sku: newProduct.sku,
        name: newProduct.name,
        unitCost: costVal,
        taxRate: taxVal,
        qty: currentQty,
        discount: currentDisc,
        taxAmount: calc.taxAmount,
        lineTotal: calc.lineTotal,
      };
      return updated;
    });

    setActiveItemIndexForProductCreate(null);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorName.trim()) {
      toast.error('Please select a supplier vendor');
      return;
    }

    if (!store) {
      toast.error('Please select a destination store location');
      return;
    }

    // Validate that there is at least 1 valid line item
    const validItems = items.filter((it) => it.name.trim() || it.sku.trim() || it.productId);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item to the purchase order');
      return;
    }

    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      if (!it.name.trim() && !it.sku.trim()) {
        toast.error(`Line item #${i + 1} requires a product description or SKU`);
        return;
      }
      if (typeof it.qty !== 'number' || it.qty <= 0) {
        toast.error(`Line item #${i + 1} (${it.name || it.sku}) quantity must be greater than 0`);
        return;
      }
      if (typeof it.unitCost !== 'number' || it.unitCost < 0) {
        toast.error(
          `Line item #${i + 1} (${it.name || it.sku}) unit cost must be a valid non-negative number`
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Prepare multi-item payload
      const formattedItems = validItems.map((it) => ({
        productId: it.productId || undefined,
        sku: it.sku.trim(),
        name: it.name.trim() || it.sku.trim(),
        qty: Number(it.qty),
        unitCost: Number(it.unitCost),
        taxRate: Number(it.taxRate) || 0,
        taxAmount: Number(it.taxAmount) || 0,
        discount: it.discount !== '' && it.discount !== undefined ? Number(it.discount) : 0,
        lineTotal: Number(it.lineTotal),
      }));

      // Payment validation rules
      if (
        !isEdit &&
        (paymentStatus === 'Partial' || paymentStatus === 'Paid' || financials.paidAmount > 0)
      ) {
        if (!paymentProof) {
          toast.error(
            'Payment proof is mandatory! Please upload receipt/screenshot for upfront payment.'
          );
          setIsSubmitting(false);
          return;
        }

        if (paymentStatus === 'Partial') {
          if (financials.paidAmount <= 0 || financials.paidAmount >= financials.grandTotal) {
            toast.error(
              `Partial payment requires a paid amount between ${formatCurrency(0.01)} and ${formatCurrency(financials.grandTotal - 0.01)}`
            );
            setIsSubmitting(false);
            return;
          }
        } else if (paymentStatus === 'Paid') {
          if (financials.paidAmount !== financials.grandTotal) {
            toast.error(
              `Full payment requires paid amount to equal grand total (${formatCurrency(financials.grandTotal)})`
            );
            setIsSubmitting(false);
            return;
          }
        }
      }

      // If creating new PO with initial payment, generate internal fallback reference if not provided
      const effectivePaymentRef =
        paymentRef.trim() || `PO-ADV-${Date.now().toString(36).toUpperCase()}`;

      const payload = {
        vendorName: vendorName.trim(),
        storeCode: store,
        store: store,
        invoiceNo: invoiceNo.trim() || undefined,
        orderDate: orderDate || new Date().toISOString(),
        expectedDate: expectedDate || undefined,
        dueDate: dueDate || undefined,
        status: status,
        paymentStatus: paymentStatus,
        subtotal: financials.subtotal,
        taxAmount: financials.totalTax,
        discountAmount: financials.totalDiscount,
        totalAmount: financials.grandTotal,
        totalCost: financials.grandTotal,
        paidAmount: financials.paidAmount,
        remainingAmount: financials.remainingAmount,
        paymentMethod: paymentMethod,
        referenceNo: effectivePaymentRef,
        payRef: effectivePaymentRef,
        receiptUrl: paymentProof || undefined,
        paymentProofUrl: paymentProof || undefined,
        paymentNotes: paymentNotes.trim() || undefined,
        notes: notes.trim() || undefined,
        items: formattedItems,
      };

      const confirmed = await confirmAction({
        actionType: 'purchase',
        title: isEdit
          ? `Confirm Purchase Order Update #${purchase?.poNo}`
          : 'Confirm New Purchase Order',
        subtitle:
          'Please review the supplier, store location, line items, and financial breakdown.',
        confirmLabel: isEdit ? 'Confirm & Update PO' : 'Confirm & Place PO',
        summaryItems: [
          { label: 'Vendor / Supplier', value: vendorName.trim() },
          { label: 'Destination Store', value: store },
          {
            label: 'Line Items',
            value: `${formattedItems.reduce((acc, it) => acc + it.qty, 0)} units (${formattedItems.length} SKUs)`,
          },
          { label: 'Order Status', value: status },
          { label: 'Payment Status', value: paymentStatus },
          { label: 'Subtotal', value: formatCurrency(financials.subtotal) },
          ...(financials.totalTax > 0
            ? [{ label: taxLabel, value: formatCurrency(financials.totalTax) }]
            : []),
          ...(financials.totalDiscount > 0
            ? [
                {
                  label: 'Discount',
                  value: `-${formatCurrency(financials.totalDiscount)}`,
                },
              ]
            : []),
          {
            label: 'Grand Total Value',
            value: formatCurrency(financials.grandTotal),
            highlighted: true,
          },
          ...(financials.paidAmount > 0
            ? [{ label: 'Paid Amount', value: formatCurrency(financials.paidAmount) }]
            : []),
        ],
        warningMessage:
          status === 'Received'
            ? 'Status is set to Received. Once confirmed, physical inventory on hand will immediately be increased in the warehouse.'
            : 'This purchase order will be created and committed to the vendor ledger.',
      });

      if (!confirmed) {
        setIsSubmitting(false);
        return;
      }

      if (isEdit && purchase) {
        const updateRes = await updatePurchase(purchase.id, payload as any);
        if (updateRes && (updateRes as any).success === false) {
          setIsSubmitting(false);
          return;
        }
        toast.success(`Purchase Order #${purchase.poNo} updated successfully!`);
        if (onSuccess) {
          onSuccess({
            ...purchase,
            ...payload,
          } as any);
        }
        await refreshAllData();
        onClose();
      } else {
        const created = await addPurchase(payload as any);
        if (!created || (created as any).success === false) {
          setIsSubmitting(false);
          return;
        }
        const createdPO = (created as any).item || created;
        toast.success(`Purchase Order created with ${formattedItems.length} items!`);
        if (onSuccess && createdPO) {
          onSuccess(createdPO);
        }
        await refreshAllData();
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving purchase order:', err);
      toast.error(err.message || 'Failed to save purchase order');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={isEdit ? `Edit Purchase Order: ${purchase?.poNo}` : 'Create Purchase Order (PO)'}
        subtitle="Procure multi-product stock replenishment with live taxes, discounts, and inventory receiving"
        size="large-form"
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
              form="po-form"
              className="btn-primary text-xs gap-1.5 font-bold px-4 flex-1 sm:flex-initial disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={
                isSubmitting ||
                (!isEdit &&
                  (paymentStatus === 'Partial' ||
                    paymentStatus === 'Paid' ||
                    financials.paidAmount > 0) &&
                  (!paymentProof ||
                    financials.paidAmount <= 0 ||
                    (paymentStatus === 'Partial' &&
                      financials.paidAmount >= financials.grandTotal) ||
                    (paymentStatus === 'Paid' && financials.paidAmount !== financials.grandTotal)))
              }
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Purchase Order...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  <span>{isEdit ? 'Update Purchase Order' : 'Create Purchase Order'}</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="po-form" onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Header Row: Vendor & Store Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-3.5 rounded-xl border border-border bg-card">
            <div>
              <CustomSelect
                label="Supplier Vendor"
                required
                placeholder="Select supplier vendor..."
                value={vendorName}
                onChange={setVendorName}
                options={vendorOptions}
                searchable={true}
                addNewLabel="+ Onboard New Vendor"
                onAddNew={() => setVendorModalOpen(true)}
                size="sm"
              />
            </div>

            <div>
              {currentUser.role === 'Super Admin' ? (
                <CustomSelect
                  label="Receiving Store / Hub Location"
                  required
                  placeholder="Select destination warehouse/store..."
                  value={store}
                  onChange={setStore}
                  options={storeOptions}
                  searchable={true}
                  addNewLabel="+ Add New Store"
                  onAddNew={() => setStoreModalOpen(true)}
                  size="sm"
                />
              ) : (
                <div>
                  <label className="text-2xs font-bold text-foreground block mb-1">
                    Receiving Store / Hub Location <span className="text-danger">*</span>
                  </label>
                  <div className="input-field text-xs h-8 flex items-center bg-muted/50 text-muted-foreground font-semibold cursor-not-allowed">
                    <span className="font-mono text-primary font-bold mr-1.5">{store}</span>
                    <span className="text-muted-foreground">· Assigned Store (Locked)</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  Invoice / Ref No (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-98214"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="input-field text-xs h-8 font-mono"
                />
              </div>
              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">Order Date</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="input-field text-xs h-8"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="input-field text-xs h-8"
                />
              </div>
              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  Payment Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input-field text-xs h-8"
                />
              </div>
            </div>
          </div>

          {/* Multi-Product Line Items Section */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Icon name="ShoppingBagIcon" size={16} className="text-primary" />
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Purchase Order Line Items ({items.length})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenProductCreateForLine(items.length)}
                  className="btn-secondary h-7 text-2xs py-0 px-2.5 gap-1 text-primary border-primary/30 hover:bg-primary/10 font-bold"
                  title="Open Master Product Form to create a new SKU"
                >
                  <Icon name="PlusCircleIcon" size={13} />+ Add New Product
                </button>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="btn-primary h-7 text-2xs py-0 px-2.5 gap-1 font-bold"
                >
                  <Icon name="PlusIcon" size={13} />+ Add Row
                </button>
              </div>
            </div>

            {/* Desktop Table View (>=md) */}
            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/30 border-b border-border text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">#</th>
                    <th className="px-3 py-2 min-w-[260px]">Product / SKU</th>
                    <th className="px-3 py-2 w-28 text-center">Qty</th>
                    <th className="px-3 py-2 w-28">Cost ({currencySymbol})</th>
                    <th className="px-3 py-2 w-24">{taxLabel} (%)</th>
                    <th className="px-3 py-2 w-24">Disc ({currencySymbol})</th>
                    <th className="px-3 py-2 w-28 text-right font-tabular">Line Total</th>
                    <th className="px-3 py-2 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2.5 text-center text-muted-foreground font-mono text-2xs">
                        {index + 1}
                      </td>

                      {/* Product Selector with clear + Add New Product Button */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-[200px]">
                            <select
                              value={item.productId || ''}
                              onChange={(e) => handleProductSelect(index, e.target.value)}
                              className="input-field text-xs h-8 font-medium"
                            >
                              <option value="">Select Catalog Product...</option>
                              {catalogProductOptions.map((opt) => (
                                <option key={`opt-${opt.value}`} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenProductCreateForLine(index)}
                            className="btn-secondary h-8 px-2 text-2xs text-primary border-primary/30 hover:bg-primary/10 shrink-0"
                            title="Create & Auto-Select New Product"
                          >
                            <Icon name="PlusCircleIcon" size={14} />
                          </button>
                        </div>

                        {/* Optional Manual SKU/Name fallback if custom item */}
                        {!item.productId && (
                          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                            <input
                              type="text"
                              placeholder="Item Name / Desc"
                              value={item.name}
                              onChange={(e) => updateItemField(index, { name: e.target.value })}
                              className="input-field text-2xs h-7"
                            />
                            <input
                              type="text"
                              placeholder="SKU Code"
                              value={item.sku}
                              onChange={(e) =>
                                updateItemField(index, { sku: e.target.value.toUpperCase() })
                              }
                              className="input-field text-2xs h-7 font-mono"
                            />
                          </div>
                        )}
                      </td>

                      {/* Quantity with +/- Controls */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const curr = typeof item.qty === 'number' ? item.qty : 1;
                              if (curr > 1) updateItemField(index, { qty: curr - 1 });
                            }}
                            className="w-6 h-7 rounded border border-border bg-muted/40 hover:bg-muted text-foreground flex items-center justify-center text-xs font-bold"
                          >
                            -
                          </button>
                          <NumericInput
                            min={1}
                            allowDecimals={false}
                            placeholder="Qty"
                            value={item.qty}
                            onChange={(val) =>
                              updateItemField(index, { qty: val !== '' ? Number(val) : '' })
                            }
                            className="text-xs h-7 text-center font-tabular font-bold w-14"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const curr = typeof item.qty === 'number' ? item.qty : 1;
                              updateItemField(index, { qty: curr + 1 });
                            }}
                            className="w-6 h-7 rounded border border-border bg-muted/40 hover:bg-muted text-foreground flex items-center justify-center text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Purchase Unit Cost */}
                      <td className="px-3 py-2.5">
                        <NumericInput
                          min={0}
                          step="0.01"
                          allowDecimals={true}
                          placeholder="0.00"
                          value={item.unitCost}
                          onChange={(val) =>
                            updateItemField(index, { unitCost: val !== '' ? Number(val) : '' })
                          }
                          className="text-xs h-8 font-tabular font-semibold"
                        />
                      </td>

                      {/* Tax Rate % */}
                      <td className="px-3 py-2.5">
                        <select
                          value={item.taxRate}
                          onChange={(e) =>
                            updateItemField(index, { taxRate: Number(e.target.value) || 0 })
                          }
                          className="input-field text-xs h-8 font-medium text-center"
                        >
                          {(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                          {item.taxRate !== undefined &&
                            !(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).includes(
                              item.taxRate
                            ) && <option value={item.taxRate}>{item.taxRate}% (Custom)</option>}
                        </select>
                      </td>

                      {/* Discount Amount */}
                      <td className="px-3 py-2.5">
                        <NumericInput
                          min={0}
                          step="0.01"
                          allowDecimals={true}
                          placeholder="0"
                          value={item.discount}
                          onChange={(val) =>
                            updateItemField(index, { discount: val !== '' ? Number(val) : '' })
                          }
                          className="text-xs h-8 font-tabular text-center"
                        />
                      </td>

                      {/* Calculated Line Total */}
                      <td className="px-3 py-2.5 text-right font-tabular font-extrabold text-foreground">
                        {formatCurrency(item.lineTotal)}
                        {item.taxAmount > 0 && (
                          <span className="block text-3xs font-normal text-muted-foreground">
                            ({taxLabel}: {formatCurrency(item.taxAmount)})
                          </span>
                        )}
                      </td>

                      {/* Action: Delete Row */}
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Remove item"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Card View (<md) */}
            <div className="block md:hidden divide-y divide-border">
              {items.map((item, index) => (
                <div key={`m-item-${item.id}`} className="p-3 space-y-2.5 bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-bold text-muted-foreground font-mono">
                      Item #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(index)}
                      className="text-danger hover:bg-danger/10 p-1 rounded"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  </div>

                  <div>
                    <label className="text-3xs font-bold text-foreground block mb-1">
                      Catalog Product / SKU
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={item.productId || ''}
                        onChange={(e) => handleProductSelect(index, e.target.value)}
                        className="input-field text-xs h-8 flex-1"
                      >
                        <option value="">Select Catalog Product...</option>
                        {catalogProductOptions.map((opt) => (
                          <option key={`m-opt-${opt.value}`} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleOpenProductCreateForLine(index)}
                        className="btn-secondary h-8 px-2 text-2xs text-primary border-primary/30 shrink-0"
                      >
                        <Icon name="PlusCircleIcon" size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-3xs font-bold text-foreground block mb-1">
                        Quantity
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const curr = typeof item.qty === 'number' ? item.qty : 1;
                            if (curr > 1) updateItemField(index, { qty: curr - 1 });
                          }}
                          className="w-7 h-7 rounded border border-border bg-muted/40 text-xs font-bold flex items-center justify-center"
                        >
                          -
                        </button>
                        <NumericInput
                          min={1}
                          allowDecimals={false}
                          value={item.qty}
                          onChange={(val) =>
                            updateItemField(index, { qty: val !== '' ? Number(val) : '' })
                          }
                          className="text-xs h-7 text-center font-tabular font-bold flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const curr = typeof item.qty === 'number' ? item.qty : 1;
                            updateItemField(index, { qty: curr + 1 });
                          }}
                          className="w-7 h-7 rounded border border-border bg-muted/40 text-xs font-bold flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-3xs font-bold text-foreground block mb-1">
                        Unit Cost ({currencySymbol})
                      </label>
                      <NumericInput
                        min={0}
                        step="0.01"
                        allowDecimals={true}
                        value={item.unitCost}
                        onChange={(val) =>
                          updateItemField(index, { unitCost: val !== '' ? Number(val) : '' })
                        }
                        className="text-xs h-7 font-tabular font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-3xs font-bold text-foreground block mb-1">
                        {taxLabel} Tax Rate
                      </label>
                      <select
                        value={item.taxRate}
                        onChange={(e) =>
                          updateItemField(index, { taxRate: Number(e.target.value) || 0 })
                        }
                        className="input-field text-xs h-7 font-medium"
                      >
                        {(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                        {item.taxRate !== undefined &&
                          !(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).includes(
                            item.taxRate
                          ) && <option value={item.taxRate}>{item.taxRate}% (Custom)</option>}
                      </select>
                    </div>

                    <div>
                      <label className="text-3xs font-bold text-foreground block mb-1">
                        Discount ({currencySymbol})
                      </label>
                      <NumericInput
                        min={0}
                        step="0.01"
                        allowDecimals={true}
                        value={item.discount}
                        onChange={(val) =>
                          updateItemField(index, { discount: val !== '' ? Number(val) : '' })
                        }
                        className="text-xs h-7 font-tabular"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground font-semibold">Row Total:</span>
                    <span className="font-extrabold font-tabular text-foreground">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Add Row Bar */}
            <div className="p-2.5 bg-muted/20 border-t border-border flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleAddLineItem}
                className="text-primary hover:underline text-2xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Icon name="PlusCircleIcon" size={13} />+ Add Another Line Item
              </button>
              <span className="text-3xs text-muted-foreground">
                Total Products: <strong className="text-foreground">{items.length}</strong>
              </span>
            </div>
          </div>

          {/* Financials & Live Accounting Summary Card */}
          <div className="p-3.5 rounded-xl border border-border bg-card space-y-3">
            <h4 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
              Live Order Financials & Calculations
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
                <span className="text-2xs text-muted-foreground block font-medium">
                  Items Subtotal
                </span>
                <span className="text-sm font-bold text-foreground font-tabular">
                  {formatCurrency(financials.subtotal)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
                <span className="text-2xs text-muted-foreground block font-medium">
                  Total Discount
                </span>
                <span className="text-sm font-bold text-foreground font-tabular">
                  {formatCurrency(financials.totalDiscount)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/60">
                <span className="text-2xs text-muted-foreground block font-medium">
                  Total {taxLabel}
                </span>
                <span className="text-sm font-bold text-foreground font-tabular">
                  {formatCurrency(financials.totalTax)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                <span className="text-2xs text-primary block font-bold">Grand Total</span>
                <span className="text-base font-extrabold text-primary font-tabular">
                  {formatCurrency(financials.grandTotal)}
                </span>
              </div>
            </div>

            {/* Payment & Status Control */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  PO Fulfillment Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="input-field text-xs h-8 font-medium"
                >
                  <option value="Ordered">Ordered (Pending GRN Receiving)</option>
                  <option value="Pending">Pending (Draft / In Review)</option>
                  <option value="Received">Received (Credit Stock to Store Now)</option>
                </select>
              </div>

              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  Payment Status
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => handlePaymentStatusChange(e.target.value as any)}
                  disabled={isEdit && Boolean(purchase?.payments && purchase.payments.length > 0)}
                  className="input-field text-xs h-8 font-medium disabled:opacity-60"
                >
                  <option value="Unpaid">Unpaid (Credit / On Account)</option>
                  <option value="Partial">Partial Payment</option>
                  <option value="Paid">Fully Paid (Immediate Settlement)</option>
                </select>
              </div>

              <div>
                <label className="text-2xs font-bold text-foreground block mb-1">
                  Paid Amount ({currencySymbol})
                </label>
                <NumericInput
                  min={0}
                  max={financials.grandTotal}
                  step="0.01"
                  allowDecimals={true}
                  value={paidAmount}
                  onChange={(val) => setPaidAmount(val)}
                  disabled={
                    paymentStatus !== 'Partial' ||
                    (isEdit && Boolean(purchase?.payments && purchase.payments.length > 0))
                  }
                  className="text-xs font-tabular h-8 font-semibold disabled:opacity-60"
                  placeholder={paymentStatus === 'Paid' ? String(financials.grandTotal) : '0.00'}
                />
              </div>
            </div>

            {/* If PO already has payment transactions recorded */}
            {isEdit && purchase?.payments && purchase.payments.length > 0 && (
              <div className="p-2.5 rounded-lg bg-info/10 border border-info/30 text-2xs text-foreground flex items-center justify-between">
                <span>
                  Payments for this bill are managed via{' '}
                  <strong>{purchase.payments.length} verified transaction(s)</strong>. Total Paid:{' '}
                  <strong className="text-emerald-600">
                    {formatCurrency(purchase.paidAmount || 0)}
                  </strong>
                  .
                </span>
                <span className="text-muted-foreground text-3xs italic">
                  Use &quot;Record Payment&quot; on the purchases list to add tranches.
                </span>
              </div>
            )}

            {/* If creating new PO with initial payment */}
            {!isEdit && (paymentStatus === 'Partial' || paymentStatus === 'Paid') && (
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/80 space-y-2 text-2xs">
                <div className="font-bold text-muted-foreground text-3xs uppercase tracking-wider">
                  Initial Payment Details
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-0.5">
                      Method <span className="text-danger">*</span>
                    </label>
                    <PaymentMethodSelect
                      value={paymentMethod}
                      onChange={(val) => setPaymentMethod(val)}
                      size="sm"
                      modalZIndex={zIndex + 30}
                    />
                  </div>
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-0.5">
                      {countryCode === 'IN'
                        ? 'UTR / Transaction Reference'
                        : 'Transaction Reference'}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        countryCode === 'IN'
                          ? 'e.g. UTR / Bank Reference (auto if blank)'
                          : 'e.g. Transaction Ref / Voucher # (auto if blank)'
                      }
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="input-field text-xs h-8 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-0.5">
                      Payment Remarks
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Upfront advance payment"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="input-field text-xs h-8"
                    />
                  </div>
                </div>

                {/* Mandatory Payment Proof for Upfront Payment */}
                <PaymentProofUpload
                  value={paymentProof}
                  onChange={(url) => setPaymentProof(url)}
                  required={true}
                  label="Advance Payment Proof * (Receipt / Voucher / Screenshot)"
                  helperText="Upload receipt, voucher, or bank transfer confirmation (JPG, PNG, WebP, PDF up to 10MB) — Required"
                  storeCode={store}
                  relatedEntityType="PurchasePayment"
                />
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
              <span className="text-muted-foreground font-semibold">
                Remaining Payable Balance:
              </span>
              <span
                className={`font-extrabold font-tabular text-sm ${
                  financials.remainingAmount > 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {formatCurrency(financials.remainingAmount)}
              </span>
            </div>
          </div>

          {/* Notes & Comments */}
          <div>
            <label className="text-2xs font-bold text-foreground block mb-1">
              Order Notes / Delivery Instructions (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Deliver to rear loading bay; fragile electronic components"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field text-xs h-8"
            />
          </div>

          {/* Validation Warning when Upfront Payment Proof is Missing */}
          {!isEdit &&
            (paymentStatus === 'Partial' ||
              paymentStatus === 'Paid' ||
              financials.paidAmount > 0) &&
            !paymentProof && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-3xs font-semibold">
                <Icon
                  name="ExclamationTriangleIcon"
                  size={14}
                  className="shrink-0 text-amber-600"
                />
                <span>
                  Advance Payment requires Payment Proof upload (Receipt / Voucher / Screenshot)
                  before saving.
                </span>
              </div>
            )}
        </form>
      </Modal>

      {/* Embedded Dynamic Vendor Onboarding Modal */}
      <VendorFormModal
        open={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onSuccess={(newVendorName) => {
          setVendorName(newVendorName);
          toast.success(`Vendor "${newVendorName}" selected for PO!`);
        }}
        zIndex={zIndex + 20}
      />

      {/* Embedded Dynamic Store Hub Modal */}
      <StoreFormModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        onSuccess={(newStore) => {
          setStore(newStore.code);
          toast.success(`Store "${newStore.name}" (${newStore.code}) selected!`);
        }}
        zIndex={zIndex + 20}
      />

      {/* Embedded Master Product Form Modal for "+ Add New Product" */}
      <ProductFormModal
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setActiveItemIndexForProductCreate(null);
        }}
        onSuccess={handleProductCreated}
        zIndex={zIndex + 20}
      />
    </>
  );
}
