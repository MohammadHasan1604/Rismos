'use client';

import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { formatMoney, formatTaxLabel } from '@/lib/localization';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import {
  useApp,
  Customer,
  InventoryItem,
  SalePhoto,
  RepairEnquiry,
  normalizeMobileNumber,
} from '@/context/AppContext';
import CustomerFormModal from '@/components/forms/CustomerFormModal';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import NumericInput from '@/components/ui/NumericInput';
import PaymentProofUpload from '@/components/ui/PaymentProofUpload';
import ProofViewerModal, { PaymentProofData } from '@/components/ui/ProofViewerModal';
import { DigitalInvoiceModal } from './components/DigitalInvoiceModal';
import { VoidRefundModal } from './components/VoidRefundModal';
import { buildWhatsAppInvoiceUrl } from '@/lib/whatsappInvoice';
import { toast } from 'sonner';

interface CartItem {
  itemId: string;
  name: string;
  sku: string;
  referenceSellingPrice: number;
  actualSellingPrice: number | '';
  unitCost: number;
  qty: number;
  maxQty: number;
  discountPercent: number;
  warrantyMonths: number;
}

export default function SalesPage() {
  const {
    sales,
    inventory,
    customers,
    repairsEnquiries,
    categoriesList,
    addSale,
    updateSale,
    voidSale,
    addCustomer,
    selectedStore,
    branding,
    systemSettings,
    currentUser,
    paymentMethods,
    storesList,
    addAuditLog,
    confirmAction,
  } = useApp();

  const currencyCode = systemSettings?.currencyCode || 'INR';
  const locale = branding?.locale || 'en-IN';
  const taxLabel = formatTaxLabel(systemSettings?.taxRegime || 'GST');

  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
  const [catalogSearch, setCatalogSearch] = useState('');
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const [displayLimit, setDisplayLimit] = useState(48);
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerToEdit, setSelectedCustomerToEdit] = useState<Customer | null>(null);

  // Cashier & Store Resolution
  const activeEmployeeName = currentUser.name || 'Sales Manager';
  const effectiveStore =
    currentUser.role !== 'Super Admin'
      ? currentUser.store && currentUser.store !== 'All Stores'
        ? currentUser.store
        : 'CENTRAL'
      : selectedStore === 'All Stores'
        ? 'CENTRAL'
        : selectedStore;

  // Permissions
  const canOverridePrice =
    currentUser.role === 'Super Admin' || currentUser.role === 'Store Manager';
  const canViewCost = currentUser.role === 'Super Admin' || currentUser.role === 'Store Manager';

  // Customer State - Starts clean, no prefilled customer
  const [customerPhoneDigits, setCustomerPhoneDigits] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walkin');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerHistory, setCustomerHistory] = useState<{
    purchases: any[];
    repairs: { date: string; status: string; service: string; device: string }[];
  }>({ purchases: [], repairs: [] });

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [customerNotFound, setCustomerNotFound] = useState(false);

  // Customer Modal
  const [quickRegModal, setQuickRegModal] = useState(false);

  // GST Invoice Options
  const [gstInvoiceEnabled, setGstInvoiceEnabled] = useState(false);
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerBusinessName, setCustomerBusinessName] = useState('');
  const [customerBillingAddress, setCustomerBillingAddress] = useState('');

  // Checkout State
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [refundModalSale, setRefundModalSale] = useState<any | null>(null);
  const [cartDiscount, setCartDiscount] = useState<number>(0);
  const [heldCart, setHeldCart] = useState<CartItem[] | null>(null);
  const [receiptModal, setReceiptModal] = useState<any | null>(null);
  const [salePhotos, setSalePhotos] = useState<SalePhoto[]>([]);
  const [posReferenceNo, setPosReferenceNo] = useState('');
  const [posPaymentProofUrl, setPosPaymentProofUrl] = useState<string | null>(null);
  const [selectedProof, setSelectedProof] = useState<PaymentProofData | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const checkoutLockRef = useRef(false);

  // History Search & Filter State
  const [historySearch, setHistorySearch] = useState('');
  const [historyStoreFilter, setHistoryStoreFilter] = useState('All');

  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Normalize mobile number helper: strips +91, 0, spaces, dashes
  const clean10DigitPhone = (val: string): string => {
    const raw = val.replace(/\D/g, '');
    if (raw.startsWith('91') && raw.length === 12) return raw.slice(2);
    if (raw.startsWith('0') && raw.length === 11) return raw.slice(1);
    if (raw.length > 10) return raw.slice(-10);
    return raw;
  };

  const performCustomerLookup = async (phone10: string) => {
    setLookupLoading(true);
    setCustomerNotFound(false);
    const fullNormalized = `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`;
    setCustomerPhone(fullNormalized);

    try {
      // 1. Check local customers first
      const localMatch = customers.find((c) => clean10DigitPhone(c.phone) === phone10);

      // 2. Call backend legacy / customer lookup API
      let remoteMatch: any = null;
      let remoteRepairs: any[] = [];
      try {
        const res = await fetch(
          `/api/customers/legacy/search?phone=${encodeURIComponent(phone10)}`
        );
        const data = await res.json();
        if (data.success && data.found) {
          remoteMatch = data.customer;
          remoteRepairs = data.repairs || [];
        }
      } catch (err) {
        console.warn('Backend customer search fallback:', err);
      }

      const verified = localMatch || remoteMatch;

      if (verified) {
        setSelectedCustomerId(verified.id || 'cust-matched');
        setCustomerName(verified.name || 'Registered Customer');
        setLookupDone(true);
        setCustomerNotFound(false);

        // Fetch Last 3 Purchases
        const pastSales = sales
          .filter(
            (s) =>
              clean10DigitPhone(s.customerPhone || '') === phone10 ||
              s.customerName.toLowerCase() === verified.name.toLowerCase()
          )
          .slice(0, 3);

        // Fetch Last 3 Permitted Service/Repair records (Date, Status, Device/Service requested only)
        const relevantRepairs: { date: string; status: string; service: string; device: string }[] =
          [];
        if (remoteRepairs && remoteRepairs.length > 0) {
          remoteRepairs.slice(0, 3).forEach((r) => {
            relevantRepairs.push({
              date: r.enquiryDate ? new Date(r.enquiryDate).toLocaleDateString('en-IN') : 'Recent',
              status: r.repairStatus || r.status || 'Received',
              service: r.repairRequested || r.issueDescription || 'Inspection / Service',
              device: r.deviceName || r.deviceType || 'Device',
            });
          });
        } else {
          repairsEnquiries
            .filter((r) => clean10DigitPhone(r.customerPhone) === phone10)
            .slice(0, 3)
            .forEach((r) => {
              relevantRepairs.push({
                date: r.enquiryDate,
                status: r.repairStatus,
                service: r.repairRequested,
                device: r.deviceName || 'Device',
              });
            });
        }

        setCustomerHistory({
          purchases: pastSales,
          repairs: relevantRepairs,
        });

        toast.success(`Verified Customer: ${verified.name}`);
      } else {
        // Customer not found
        setLookupDone(true);
        setCustomerNotFound(true);
        setSelectedCustomerId('walkin');
        setCustomerName('Walk-in Customer');
        setCustomerHistory({ purchases: [], repairs: [] });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const attachCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    const digits = clean10DigitPhone(c.phone);
    setCustomerPhoneDigits(digits);
    setCustomerSearchQuery('');
    setLookupDone(true);
    setCustomerNotFound(false);

    if (c.gstin) {
      setGstInvoiceEnabled(true);
      setCustomerGstin(c.gstin.trim().toUpperCase());
    }
    if (c.address) {
      setCustomerBillingAddress(c.address.trim());
    }

    const pastSales = sales
      .filter(
        (s) =>
          clean10DigitPhone(s.customerPhone || '') === digits ||
          s.customerName.toLowerCase() === c.name.toLowerCase()
      )
      .slice(0, 3);

    const relevantRepairs: { date: string; status: string; service: string; device: string }[] = [];
    repairsEnquiries
      .filter((r) => clean10DigitPhone(r.customerPhone) === digits)
      .slice(0, 3)
      .forEach((r) => {
        relevantRepairs.push({
          date: r.enquiryDate,
          status: r.repairStatus,
          service: r.repairRequested,
          device: r.deviceName || 'Device',
        });
      });

    setCustomerHistory({
      purchases: pastSales,
      repairs: relevantRepairs,
    });
    toast.success(`Attached Customer: ${c.name}`);
  };

  const resetToWalkIn = () => {
    setSelectedCustomerId('walkin');
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setCustomerPhoneDigits('');
    setCustomerSearchQuery('');
    setCustomerHistory({ purchases: [], repairs: [] });
    setCustomerNotFound(false);
    setLookupDone(false);
    setSelectedCustomerToEdit(null);
  };

  const openCustomerModal = (cust?: Customer) => {
    setSelectedCustomerToEdit(cust || null);
    setQuickRegModal(true);
  };

  const handleSearchQueryChange = (val: string) => {
    setCustomerSearchQuery(val);
    const digits = clean10DigitPhone(val);
    if (digits.length === 10) {
      setCustomerPhoneDigits(digits);
      performCustomerLookup(digits);
    } else {
      setLookupDone(false);
      setCustomerNotFound(false);
    }
  };

  const matchingCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = clean10DigitPhone(q);
    const seen = new Set<string>();
    const result: Customer[] = [];
    for (const c of customers) {
      if (!c.id || seen.has(c.id)) continue;
      const matchName = c.name?.toLowerCase().includes(q);
      const matchPhone = cleanQ.length >= 3 && clean10DigitPhone(c.phone || '').includes(cleanQ);
      if (matchName || matchPhone) {
        seen.add(c.id);
        result.push(c);
        if (result.length >= 5) break;
      }
    }
    return result;
  }, [customers, customerSearchQuery]);

  // Inventory Filtering
  const dynamicCategories = useMemo(() => {
    const active = categoriesList.filter((c) => c.status === 'Active').map((c) => c.name);
    return ['All Categories', ...Array.from(new Set(active))];
  }, [categoriesList]);

  // Reset display limit on search or category change
  useEffect(() => {
    setDisplayLimit(48);
  }, [deferredCatalogSearch, selectedCategory]);

  const filteredInventory = useMemo(() => {
    const searchLower = deferredCatalogSearch.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchStore = item.store === effectiveStore;
      const matchSearch =
        searchLower === '' ||
        item.name.toLowerCase().includes(searchLower) ||
        item.sku.toLowerCase().includes(searchLower) ||
        (item.barcode && item.barcode.includes(searchLower)) ||
        (item.brand && item.brand.toLowerCase().includes(searchLower));
      const matchCategory =
        selectedCategory === 'All Categories' || item.category === selectedCategory;
      return matchStore && matchSearch && matchCategory;
    });
  }, [inventory, effectiveStore, deferredCatalogSearch, selectedCategory]);

  const displayedInventory = useMemo(() => {
    return filteredInventory.slice(0, displayLimit);
  }, [filteredInventory, displayLimit]);

  // Cart Management with Reference vs Actual Selling Price
  const addToCart = (item: InventoryItem) => {
    if (item.qtyOnHand <= 0) {
      toast.error(`"${item.name}" is out of stock in ${item.store}!`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        if (existing.qty >= item.qtyOnHand) {
          toast.warning(`Maximum available stock reached (${item.qtyOnHand} units)`);
          return prev;
        }
        return prev.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c));
      }

      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          referenceSellingPrice: item.sellingPrice,
          actualSellingPrice: item.sellingPrice,
          unitCost: item.costPrice || 0,
          qty: 1,
          maxQty: item.qtyOnHand,
          discountPercent: 0,
          warrantyMonths: item.warrantyMonths || 12,
        },
      ];
    });

    toast.success(`Added "${item.name}" to cart`);
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.itemId === itemId) {
            const next = c.qty + delta;
            if (next > c.maxQty) {
              toast.warning(`Maximum available stock reached (${c.maxQty} units)`);
              return c;
            }
            return { ...c, qty: Math.max(0, next) };
          }
          return c;
        })
        .filter((c) => c.qty > 0)
    );
  };

  const updateActualSellingPrice = (itemId: string, newPrice: number | '') => {
    if (!canOverridePrice) {
      toast.error('Permission Denied: Your role is not authorized to override selling prices.');
      return;
    }

    setCart((prev) =>
      prev.map((c) => {
        if (c.itemId === itemId) {
          if (newPrice !== '' && Number(newPrice) < c.unitCost) {
            toast.warning(`Warning: Price ₹${newPrice} is below purchase cost ₹${c.unitCost}!`);
          }
          addAuditLog(
            'Sales',
            'Override Selling Price',
            `Adjusted sale price for "${c.name}" from ₹${c.referenceSellingPrice} to ₹${newPrice}`
          );
          return { ...c, actualSellingPrice: newPrice };
        }
        return c;
      })
    );
  };

  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, c) => acc + (Number(c.actualSellingPrice) || 0) * c.qty, 0);
  }, [cart]);

  // GST Calculation: When GST is ON: 18% (CGST 9% + SGST 9%)
  const gstRate = 18;
  const cartTax = useMemo(() => {
    if (!gstInvoiceEnabled) return 0;
    return Math.round(cartSubtotal * (gstRate / 100) * 100) / 100;
  }, [cartSubtotal, gstInvoiceEnabled]);

  const cgstAmount = useMemo(
    () => (gstInvoiceEnabled ? Math.round((cartTax / 2) * 100) / 100 : 0),
    [cartTax, gstInvoiceEnabled]
  );
  const sgstAmount = useMemo(
    () => (gstInvoiceEnabled ? Math.round((cartTax / 2) * 100) / 100 : 0),
    [cartTax, gstInvoiceEnabled]
  );

  const cartTotal = useMemo(() => {
    return Math.max(0, cartSubtotal + cartTax - cartDiscount);
  }, [cartSubtotal, cartTax, cartDiscount]);

  // Checkout Execution
  const handleCheckout = async () => {
    if (checkoutLockRef.current || isCheckingOut) {
      return;
    }
    if (cart.length === 0) {
      toast.error('Billing cart is empty! Add products before checking out.');
      return;
    }

    // Validate GSTIN format if GST invoice is enabled and GSTIN is provided
    if (gstInvoiceEnabled && customerGstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(customerGstin.trim().toUpperCase())) {
        toast.error(
          'Invalid GSTIN format. Standard Indian GSTIN is 15 alphanumeric characters (e.g. 29ABCDE1234F1Z5).'
        );
        return;
      }
    }

    // Strictly validate mandatory payment proof
    if (!posPaymentProofUrl) {
      toast.error(
        'Payment Proof (Receipt / Screenshot / Voucher) is strictly required to complete checkout.'
      );
      return;
    }

    const effectiveRefNo =
      posReferenceNo.trim() ||
      `POS-${paymentMethod.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const totalUnits = cart.reduce((sum, c) => sum + c.qty, 0);

    const confirmed = await confirmAction({
      actionType: 'checkout',
      title: 'Confirm POS Sale Order',
      subtitle: 'Please review customer, cart items, and payment details before finalizing.',
      confirmLabel: 'Confirm & Place Order',
      summaryItems: [
        { label: 'Customer', value: customerName.trim() || 'Walk-in Customer' },
        { label: 'Store Location', value: effectiveStore },
        { label: 'Items in Cart', value: `${totalUnits} units (${cart.length} SKUs)` },
        { label: 'Taxable Subtotal', value: `₹${cartSubtotal.toLocaleString('en-IN')}` },
        ...(gstInvoiceEnabled
          ? [{ label: 'GST (18%)', value: `₹${cartTax.toLocaleString('en-IN')}` }]
          : []),
        ...(cartDiscount > 0
          ? [{ label: 'Discount Applied', value: `-₹${cartDiscount.toLocaleString('en-IN')}` }]
          : []),
        { label: 'Payment Method', value: paymentMethod },
        { label: 'Payment Ref (Server-generated)', value: effectiveRefNo },
        {
          label: 'Total Payable Amount',
          value: `₹${cartTotal.toLocaleString('en-IN')}`,
          highlighted: true,
        },
      ],
      warningMessage:
        'Once confirmed, physical inventory will be deducted immediately and an official sales invoice will be generated.',
    });

    if (!confirmed) {
      return;
    }

    checkoutLockRef.current = true;
    setIsCheckingOut(true);

    try {
      // Client-side idempotency session key to prevent duplicate orders
      const clientSessionKey = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const saleOrder = await addSale({
        customerId: selectedCustomerId !== 'walkin' ? selectedCustomerId : undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone ? customerPhone.trim() : '',
        store: effectiveStore,
        items: cart.map((c) => ({
          itemId: c.itemId,
          name: c.name,
          qty: c.qty,
          unitPrice:
            c.actualSellingPrice !== '' ? Number(c.actualSellingPrice) : c.referenceSellingPrice,
          taxRate: gstInvoiceEnabled ? gstRate : 0,
          warrantyMonths: c.warrantyMonths,
        })),
        subtotal: cartSubtotal,
        taxTotal: cartTax,
        discount: cartDiscount,
        total: cartTotal,
        taxEnabled: gstInvoiceEnabled,
        paymentMethod,
        referenceNo: effectiveRefNo,
        paymentProofUrl: posPaymentProofUrl,
        status: 'Completed',
        salePhotos,
        idempotencyKey: clientSessionKey,
      });

      if (!saleOrder) {
        return;
      }

      // Attach GST snapshot info for receipt modal
      const receiptSnapshot = {
        ...saleOrder,
        referenceNo: effectiveRefNo,
        paymentProofUrl: posPaymentProofUrl,
        gstInvoiceEnabled,
        customerGstin: customerGstin.trim() || undefined,
        customerBusinessName: customerBusinessName.trim() || undefined,
        customerBillingAddress: customerBillingAddress.trim() || undefined,
        cgstAmount,
        sgstAmount,
        coskoGstin: branding.taxNumber || '29AABCC1234F1Z5',
      };

      setReceiptModal(receiptSnapshot);

      // Completely clear transactional POS form (Requirement 18 & 19)
      setCart([]);
      setSalePhotos([]);
      setCartDiscount(0);
      setCustomerPhoneDigits('');
      setSelectedCustomerId('walkin');
      setCustomerName('Walk-in Customer');
      setCustomerPhone('');
      setCustomerHistory({ purchases: [], repairs: [] });
      setLookupDone(false);
      setCustomerNotFound(false);
      setGstInvoiceEnabled(false);
      setCustomerGstin('');
      setCustomerBusinessName('');
      setCustomerBillingAddress('');
      setPosReferenceNo('');
      setPosPaymentProofUrl(null);
    } finally {
      checkoutLockRef.current = false;
      setIsCheckingOut(false);
    }
  };

  // WhatsApp Digital Invoice Sender
  const handleSendWhatsAppInvoice = (receipt: any) => {
    const targetPhone = receipt.customerPhone || customerPhone;
    const res = buildWhatsAppInvoiceUrl(receipt, targetPhone);
    if (!res.success || !res.url) {
      toast.error(res.error || 'Customer phone number is required to send invoice on WhatsApp.');
      return;
    }

    window.open(res.url, '_blank');
    toast.success(`Opened WhatsApp with invoice summary for +91 ${res.cleanPhone}`);
  };

  // Sales History Filtering
  const filteredSalesHistory = useMemo(() => {
    return sales.filter((s) => {
      const matchSearch =
        historySearch === '' ||
        s.orderNo.toLowerCase().includes(historySearch.toLowerCase()) ||
        s.customerName.toLowerCase().includes(historySearch.toLowerCase()) ||
        s.customerPhone.includes(historySearch);
      const assignedStore = currentUser.store || 'BLR';
      const matchStore =
        currentUser.role === 'Super Admin'
          ? historyStoreFilter === 'All' || s.store === historyStoreFilter
          : s.store === assignedStore;
      const matchDate = !historyDateFilter || s.createdAt.includes(historyDateFilter);
      return matchSearch && matchStore && matchDate;
    });
  }, [
    sales,
    historySearch,
    historyStoreFilter,
    historyDateFilter,
    currentUser.role,
    currentUser.store,
  ]);

  return (
    <AppLayout activeRoute="/sales">
      <div className="space-y-4 md:space-y-6 fade-in">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <div className="flex items-center gap-2">
              <h1 className="page-title">POS Terminal</h1>
              <span className="badge-primary text-3xs font-mono font-bold px-1.5 py-0.5 rounded-full">
                {effectiveStore}
              </span>
            </div>
            <p className="page-subtitle">
              Cashier:{' '}
              <strong className="text-foreground font-semibold">{activeEmployeeName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60">
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                  activeTab === 'pos'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                POS Billing
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                  activeTab === 'history'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sales History ({sales.length})
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'pos' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
            {/* 1. Customer Lookup & CRM Section (Order 1 on Mobile: Very Top. Desktop: Right Column Row 1) */}
            <div className="order-1 lg:order-none lg:col-start-8 lg:col-end-13 lg:row-start-1 space-y-4">
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Icon name="UserIcon" size={15} className="text-primary" />
                    Customer Lookup & CRM
                  </span>
                  {selectedCustomerId !== 'walkin' && (
                    <button
                      type="button"
                      onClick={resetToWalkIn}
                      className="text-2xs font-semibold text-muted-foreground hover:text-danger underline transition-colors"
                    >
                      Reset to Walk-in
                    </button>
                  )}
                </div>

                {/* Customer Search Field (Phone or Name) */}
                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Search Customer (Phone or Name)
                  </label>
                  <div className="relative">
                    <Icon
                      name="MagnifyingGlassIcon"
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Type 10-digit mobile or customer name..."
                      value={customerSearchQuery}
                      onChange={(e) => handleSearchQueryChange(e.target.value)}
                      className="input-field pl-9 pr-8 text-xs font-medium"
                    />
                    {lookupLoading ? (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : customerSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setCustomerSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    ) : null}
                  </div>

                  {/* Auto-matching Results Panel */}
                  {customerSearchQuery.trim().length > 0 && matchingCustomers.length > 0 && (
                    <div className="p-1.5 rounded-xl border border-border bg-card shadow-lg space-y-1 max-h-48 overflow-y-auto z-20">
                      <div className="text-3xs font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">
                        Matching Customers ({matchingCustomers.length})
                      </div>
                      {matchingCustomers.map((c) => (
                        <button
                          key={`match-cust-${c.id}`}
                          type="button"
                          onClick={() => attachCustomer(c)}
                          className="w-full text-left p-2 rounded-lg hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-all flex items-center justify-between group min-h-[44px]"
                        >
                          <div>
                            <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors block">
                              {c.name}
                            </span>
                            <span className="text-3xs font-mono text-muted-foreground">
                              {c.phone} {c.city ? `· ${c.city}` : ''}
                            </span>
                          </div>
                          <span className="text-3xs font-bold px-2 py-1 rounded bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                            Attach
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Not Found -> Prompt to Add Customer */}
                  {customerSearchQuery.trim().length > 0 &&
                    matchingCustomers.length === 0 &&
                    !lookupLoading && (
                      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between text-xs fade-in">
                        <div>
                          <p className="font-bold text-foreground">No Customer Found</p>
                          <p className="text-2xs text-muted-foreground">
                            {clean10DigitPhone(customerSearchQuery).length === 10
                              ? `+91 ${clean10DigitPhone(customerSearchQuery)}`
                              : `"${customerSearchQuery}"`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const digits = clean10DigitPhone(customerSearchQuery);
                            if (digits.length === 10) {
                              setCustomerPhoneDigits(digits);
                            }
                            openCustomerModal();
                          }}
                          className="btn-primary text-xs py-1.5 px-3 font-bold flex items-center gap-1 min-h-[36px]"
                        >
                          <Icon name="PlusIcon" size={14} />+ Create Customer
                        </button>
                      </div>
                    )}
                </div>

                {/* Attached Customer View or Walk-in Default */}
                {selectedCustomerId !== 'walkin' ? (
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2 fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-foreground truncate block">
                            {customerName}
                          </span>
                          <span className="badge-success text-3xs px-2 py-0.5 rounded-full font-bold shrink-0">
                            Verified
                          </span>
                        </div>
                        <span className="text-2xs font-mono text-muted-foreground block mt-0.5">
                          {customerPhone}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const currentObj = customers.find((c) => c.id === selectedCustomerId);
                            if (currentObj) openCustomerModal(currentObj);
                          }}
                          className="text-3xs font-semibold px-2 py-1 rounded bg-card border border-border text-foreground hover:border-primary/50 transition-colors"
                          title="Edit Customer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={resetToWalkIn}
                          className="text-3xs font-semibold px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:text-danger transition-colors"
                          title="Change Customer"
                        >
                          Change
                        </button>
                      </div>
                    </div>

                    {/* Previous Own-Store Purchases */}
                    {customerHistory.purchases.length > 0 && (
                      <div className="pt-2 border-t border-emerald-500/20 space-y-1 text-2xs">
                        <span className="font-bold text-muted-foreground block">
                          Previous Own-Store Purchases:
                        </span>
                        <div className="space-y-1">
                          {customerHistory.purchases.map((p, idx) => (
                            <div
                              key={`past-p-${idx}`}
                              className="flex justify-between text-foreground"
                            >
                              <span className="font-mono">
                                {p.orderNo} ({p.createdAt})
                              </span>
                              <span className="font-bold">₹{p.total.toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Read-Only Legacy Repair / Service History */}
                    {customerHistory.repairs.length > 0 && (
                      <div className="pt-2 border-t border-emerald-500/20 space-y-1 text-2xs">
                        <span className="font-bold text-muted-foreground block">
                          Service & Repair History (Read-Only):
                        </span>
                        <div className="space-y-1">
                          {customerHistory.repairs.map((r, idx) => (
                            <div
                              key={`past-r-${idx}`}
                              className="flex justify-between text-foreground"
                            >
                              <span>
                                {r.device} - {r.service}
                              </span>
                              <span className="badge-warning text-3xs">{r.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl border border-border/80 bg-muted/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                        <Icon name="UserIcon" size={14} />
                      </div>
                      <div>
                        <span className="font-bold text-foreground block text-xs">
                          Walk-in Customer
                        </span>
                        <span className="text-3xs text-muted-foreground">
                          Default billing profile
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCustomerModal()}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Icon name="PlusIcon" size={13} />+ New Customer
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Product Catalog & Search (Order 2 on Mobile: Middle. Desktop: Left Column Spanning Both Rows) */}
            <div className="order-2 lg:order-none lg:col-start-1 lg:col-end-8 lg:row-start-1 lg:row-span-2 space-y-4">
              <div className="card p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Icon
                      name="MagnifyingGlassIcon"
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      placeholder="Search product name, SKU, or brand..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="input-field pl-9 text-xs font-medium"
                    />
                  </div>
                </div>

                {/* Category Pill Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-2xs scrollbar-none">
                  {dynamicCategories.map((cat) => (
                    <button
                      key={`cat-pill-${cat}`}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all border ${
                        selectedCategory === cat
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-card text-muted-foreground border-border/80 hover:border-border hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[580px] overflow-y-auto pr-1">
                {displayedInventory.map((item) => (
                  <div
                    key={`inv-grid-${item.id}`}
                    onClick={() => addToCart(item)}
                    className="card p-3 flex flex-col justify-between hover:border-primary/60 hover:shadow-card-hover transition-all duration-200 cursor-pointer group active:scale-[0.99]"
                  >
                    <div>
                      <div className="aspect-video w-full rounded-xl bg-muted/40 mb-2 overflow-hidden flex items-center justify-center relative border border-border/40">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <Icon name="PhotoIcon" size={24} className="text-muted-foreground/40" />
                        )}
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-3xs font-mono font-bold bg-black/70 backdrop-blur-xs text-white">
                          {item.qtyOnHand} in stock
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-tight">
                        {item.name}
                      </h4>
                      <p className="text-3xs text-muted-foreground font-mono mt-0.5">{item.sku}</p>
                    </div>

                    <div className="pt-2 mt-2 border-t border-border/60 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-primary font-tabular">
                          ₹{item.sellingPrice.toLocaleString('en-IN')}
                        </span>
                        {canViewCost && (
                          <span className="text-3xs text-muted-foreground block font-mono">
                            Cost: ₹{item.costPrice}
                          </span>
                        )}
                      </div>
                      <button className="h-7 w-7 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-150 flex items-center justify-center shadow-2xs">
                        <Icon name="PlusIcon" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredInventory.length > displayLimit && (
                  <div className="col-span-full py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setDisplayLimit((prev) => prev + 48)}
                      className="px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors"
                    >
                      Load More Products ({filteredInventory.length - displayLimit} remaining)
                    </button>
                  </div>
                )}
                {filteredInventory.length === 0 && (
                  <div className="col-span-full py-16 text-center text-muted-foreground text-xs">
                    No products found matching filters in {effectiveStore}.
                  </div>
                )}
              </div>
            </div>

            {/* 3. Cart, Pricing, Discounts, Payment, Proof Upload, Checkout (Order 3 on Mobile: Bottom. Desktop: Right Column Row 2) */}
            <div className="order-3 lg:order-none lg:col-start-8 lg:col-end-13 lg:row-start-2 space-y-4">
              <div className="card p-4 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-foreground">
                      Billing Cart ({cart.reduce((a, b) => a + b.qty, 0)})
                    </span>
                    {heldCart && (
                      <span className="badge-warning text-3xs font-bold">Cart Held</span>
                    )}
                  </div>

                  {/* GST Invoice Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-bold text-muted-foreground">GST Invoice:</span>
                    <ToggleSwitch
                      checked={gstInvoiceEnabled}
                      onChange={setGstInvoiceEnabled}
                      size="sm"
                      onText="ON"
                      offText="OFF"
                    />
                  </div>
                </div>

                {/* Customer GST Fields when GST is ON */}
                {gstInvoiceEnabled && (
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2 text-xs fade-in">
                    <div className="flex items-center justify-between text-2xs text-muted-foreground">
                      <span>
                        COSKO GSTIN:{' '}
                        <strong className="font-mono text-foreground">
                          {branding.taxNumber || '29AABCC1234F1Z5'}
                        </strong>
                      </span>
                      <span>Rate: 18% (9% CGST + 9% SGST)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-3xs font-bold text-muted-foreground block mb-0.5">
                          Customer GSTIN (Optional)
                        </label>
                        <input
                          type="text"
                          maxLength={15}
                          placeholder="29ABCDE1234F1Z5"
                          value={customerGstin}
                          onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                          className="input-field text-2xs py-1 font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-3xs font-bold text-muted-foreground block mb-0.5">
                          Business / Firm Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Acme Enterprises"
                          value={customerBusinessName}
                          onChange={(e) => setCustomerBusinessName(e.target.value)}
                          className="input-field text-2xs py-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-3xs font-bold text-muted-foreground block mb-0.5">
                        Billing Address
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 12/B Commercial Street, Bengaluru"
                        value={customerBillingAddress}
                        onChange={(e) => setCustomerBillingAddress(e.target.value)}
                        className="input-field text-2xs py-1"
                      />
                    </div>
                  </div>
                )}

                {/* Cart Items List */}
                {cart.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <Icon
                      name="ShoppingBagIcon"
                      size={32}
                      className="text-muted-foreground mx-auto"
                    />
                    <p className="text-xs text-muted-foreground font-medium">
                      Cart is empty. Click products to add.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {cart.map((c) => {
                      const isBelowCost =
                        c.actualSellingPrice !== '' && Number(c.actualSellingPrice) < c.unitCost;
                      return (
                        <div
                          key={`cart-item-${c.itemId}`}
                          className="p-3 rounded-xl bg-muted/40 border border-border space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground truncate">{c.name}</p>
                              <p className="text-3xs text-muted-foreground font-mono">
                                {c.sku} · {c.warrantyMonths}m Warranty
                              </p>
                            </div>

                            <div className="flex items-center gap-1 bg-card rounded-lg border border-border px-1 py-0.5">
                              <button
                                onClick={() => updateCartQty(c.itemId, -1)}
                                className="p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="MinusIcon" size={12} />
                              </button>
                              <span className="text-xs font-bold px-1.5 font-tabular">{c.qty}</span>
                              <button
                                onClick={() => updateCartQty(c.itemId, 1)}
                                className="p-1 min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="PlusIcon" size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Reference Selling Price vs Actual Selling Price Display */}
                          <div className="flex items-center justify-between text-2xs pt-1 border-t border-border/50">
                            <div className="space-y-0.5">
                              <span className="text-muted-foreground block">
                                Ref Price:{' '}
                                <span className="font-semibold text-foreground">
                                  ₹{c.referenceSellingPrice}
                                </span>
                              </span>
                              {canViewCost && (
                                <span className="text-3xs text-muted-foreground block">
                                  Ref Cost:{' '}
                                  <span className="font-mono font-medium">₹{c.unitCost}</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <label className="text-3xs text-muted-foreground block">
                                  Actual Sale Price (₹)
                                </label>
                                {canOverridePrice ? (
                                  <NumericInput
                                    value={c.actualSellingPrice}
                                    onChange={(val) => updateActualSellingPrice(c.itemId, val)}
                                    className="input-field text-2xs py-0.5 px-1.5 w-20 text-right font-bold font-tabular"
                                    placeholder="Price"
                                  />
                                ) : (
                                  <span className="font-bold text-foreground font-tabular">
                                    ₹{c.actualSellingPrice}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-extrabold text-foreground font-tabular min-w-[55px] text-right">
                                ₹
                                {((Number(c.actualSellingPrice) || 0) * c.qty).toLocaleString(
                                  'en-IN'
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Below Cost Warning */}
                          {isBelowCost && (
                            <div className="p-1.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-3xs font-bold flex items-center gap-1">
                              <Icon name="ExclamationTriangleIcon" size={12} />
                              Below Authoritative Cost Warning (Cost: ₹{c.unitCost}). Authorized
                              override active.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Billing Summary Totals */}
                <div className="pt-3 border-t border-border space-y-1.5 text-xs font-tabular">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxable Subtotal:</span>
                    <span>₹{cartSubtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {gstInvoiceEnabled ? (
                    <>
                      <div className="flex justify-between text-muted-foreground text-2xs">
                        <span>CGST (9%):</span>
                        <span>₹{cgstAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-2xs">
                        <span>SGST (9%):</span>
                        <span>₹{sgstAmount.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST Amount:</span>
                      <span className="text-2xs font-semibold">₹0 (Non-GST Invoice)</span>
                    </div>
                  )}
                  {cartDiscount > 0 && (
                    <div className="flex justify-between text-success font-bold">
                      <span>Order Discount:</span>
                      <span>-₹{cartDiscount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-extrabold text-foreground pt-1.5 border-t border-border">
                    <span>Grand Total:</span>
                    <span className="text-primary">₹{cartTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Payment Method Selector (Cash, UPI, Other) */}
                <PaymentMethodSelect
                  layout="pills"
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  modalZIndex={1200}
                />

                {/* Mandatory Proof Upload */}
                <div className="pt-2 border-t border-border space-y-2">
                  <PaymentProofUpload
                    value={posPaymentProofUrl}
                    onChange={setPosPaymentProofUrl}
                    required={true}
                    label="Payment Proof * (Receipt / Screenshot / Slip)"
                    helperText="Upload UPI screenshot, card slip, or cash voucher (JPG, PNG, WebP, PDF) — Required"
                    storeCode={effectiveStore}
                    relatedEntityType="Sale"
                  />

                  {!posPaymentProofUrl && cart.length > 0 && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-3xs font-semibold">
                      <Icon
                        name="ExclamationTriangleIcon"
                        size={14}
                        className="shrink-0 text-amber-600"
                      />
                      <span>Payment Proof upload is strictly required to enable checkout.</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      if (heldCart) {
                        setCart(heldCart);
                        setHeldCart(null);
                        toast.success('Held cart resumed');
                      } else {
                        if (cart.length === 0) return;
                        setHeldCart(cart);
                        setCart([]);
                        toast.info('Cart put on hold');
                      }
                    }}
                    className="btn-secondary h-11 text-xs font-semibold shadow-xs"
                  >
                    {heldCart ? 'Resume Held Cart' : 'Hold Cart'}
                  </button>
                  <button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || isCheckingOut || !posPaymentProofUrl}
                    className="btn-primary h-11 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingOut ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        Processing Checkout...
                      </>
                    ) : (
                      <>
                        <Icon name="CheckIcon" size={15} />
                        Complete Checkout
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Sales History Tab */
          <div className="card p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
              <div>
                <h3 className="text-sm font-bold text-foreground">Sales Orders & Invoices</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Authoritative MySQL customer sales transaction ledger
                </p>
              </div>

              {/* History Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Icon
                    name="MagnifyingGlassIcon"
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    placeholder="Search invoice, customer..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="input-field pl-8 text-xs py-1.5 w-48"
                  />
                </div>
                {currentUser.role === 'Super Admin' && (
                  <select
                    value={historyStoreFilter}
                    onChange={(e) => setHistoryStoreFilter(e.target.value)}
                    className="select-field text-xs py-1.5 w-36"
                  >
                    <option value="All">All Stores</option>
                    {storesList.map((st) => (
                      <option key={st.id || st.code} value={st.code}>
                        {st.code} - {st.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Mobile Record Cards (< sm) */}
            <div className="space-y-3 sm:hidden">
              {filteredSalesHistory.map((s) => (
                <div key={`mob-hist-${s.id}`} className="card p-3.5 space-y-2 border border-border">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-primary text-xs">{s.orderNo}</span>
                      <span className="text-3xs text-muted-foreground block">{s.createdAt}</span>
                    </div>
                    <span className="badge-info text-3xs font-semibold">{s.store}</span>
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">{s.customerName}</span>
                    <span className="text-3xs font-mono text-muted-foreground block">
                      {s.customerPhone}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                    <span className="badge-neutral text-3xs">{s.paymentMethod}</span>
                    <span className="font-bold text-foreground font-tabular">
                      {formatMoney(s.total, currencyCode, locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    {s.paymentProofUrl && (
                      <button
                        onClick={() =>
                          setSelectedProof({
                            url: s.paymentProofUrl!,
                            referenceNo: s.referenceNo || s.orderNo,
                            amount: s.total,
                            paymentMethod: s.paymentMethod,
                            paymentDate: s.createdAt,
                            payeeOrPayer: s.customerName,
                            recordedBy: s.cashierName || 'POS Terminal',
                            timestamp: s.createdAt,
                            notes: `Sales Order ${s.orderNo} (${s.store})`,
                          })
                        }
                        className="px-2 py-1 rounded text-3xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      >
                        Proof
                      </button>
                    )}
                    <button
                      onClick={() => setReceiptModal(s)}
                      className="btn-secondary text-2xs py-1 px-2.5 h-7"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleSendWhatsAppInvoice(s)}
                      className="p-1 rounded-md bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                      title="Send WhatsApp Invoice"
                    >
                      <Icon name="WhatsApp" size={14} />
                    </button>
                    {s.status === 'Cancelled' || s.status === 'Refunded' ? (
                      <span className="px-1.5 py-0.5 rounded text-3xs font-bold bg-danger/10 text-danger border border-danger/20">
                        Voided
                      </span>
                    ) : (
                      (currentUser.role === 'Super Admin' ||
                        currentUser.role === 'Store Manager') && (
                        <button
                          onClick={() => {
                            setRefundModalSale(s);
                          }}
                          className="p-1 rounded-md bg-danger/10 text-danger hover:bg-danger hover:text-white"
                          title="Void / Refund Invoice"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
              {filteredSalesHistory.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  No sales transactions found matching query.
                </div>
              )}
            </div>

            {/* Desktop Wide Table (>= sm) with Sticky Invoice # Column */}
            <div className="hidden sm:block overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Invoice #
                    </th>
                    <th className="px-4 py-3">Date / Time</th>
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3">Customer & Mobile</th>
                    <th className="px-4 py-3 text-center">Items</th>
                    <th className="px-4 py-3 text-right font-tabular">Subtotal</th>
                    <th className="px-4 py-3 text-right font-tabular">{taxLabel}</th>
                    <th className="px-4 py-3 text-right font-tabular">Total</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-center">Payment Proof</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredSalesHistory.map((s) => (
                    <tr key={`hist-row-${s.id}`} className="table-row">
                      <td className="px-4 py-3 font-mono font-bold text-primary sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        {s.orderNo}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {s.createdAt}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-info text-3xs font-semibold">{s.store}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">
                          {s.customerName}
                        </span>
                        <span className="text-3xs font-mono text-muted-foreground">
                          {s.customerPhone}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{s.items?.length || 1}</td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {formatMoney(s.subtotal, currencyCode, locale)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular text-muted-foreground">
                        {formatMoney(s.taxTotal, currencyCode, locale)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground font-tabular">
                        {formatMoney(s.total, currencyCode, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-neutral text-3xs">{s.paymentMethod}</span>
                        {s.referenceNo && (
                          <span
                            className="block text-3xs font-mono text-muted-foreground mt-0.5 truncate max-w-[110px]"
                            title={s.referenceNo}
                          >
                            {s.referenceNo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.paymentProofUrl ? (
                          <button
                            onClick={() =>
                              setSelectedProof({
                                url: s.paymentProofUrl!,
                                referenceNo: s.referenceNo || s.orderNo,
                                amount: s.total,
                                paymentMethod: s.paymentMethod,
                                paymentDate: s.createdAt,
                                payeeOrPayer: s.customerName,
                                recordedBy: s.cashierName || 'POS Terminal',
                                timestamp: s.createdAt,
                                notes: `Sales Order ${s.orderNo} (${s.store})`,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-3xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shadow-2xs"
                            title="View Payment Proof"
                          >
                            <Icon name="DocumentCheckIcon" size={13} />
                            View Proof
                          </button>
                        ) : (
                          <span className="text-3xs text-muted-foreground italic">No Proof</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setReceiptModal(s)}
                            className="btn-secondary text-2xs py-1 px-2.5 h-7"
                            title="View Invoice"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleSendWhatsAppInvoice(s)}
                            className="p-1 rounded-md bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors"
                            title="Send WhatsApp Invoice"
                            aria-label="Send WhatsApp Invoice"
                          >
                            <Icon name="WhatsApp" size={14} />
                          </button>
                          {s.status === 'Cancelled' || s.status === 'Refunded' ? (
                            <span className="px-1.5 py-0.5 rounded text-3xs font-bold bg-danger/10 text-danger border border-danger/20">
                              Voided
                            </span>
                          ) : (
                            (currentUser.role === 'Super Admin' ||
                              currentUser.role === 'Store Manager') && (
                              <button
                                onClick={() => {
                                  setRefundModalSale(s);
                                }}
                                className="p-1 rounded-md bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors cursor-pointer"
                                title="Void / Refund Invoice & Restock Inventory"
                              >
                                <Icon name="TrashIcon" size={14} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSalesHistory.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground text-xs">
                        No sales transactions found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reusable Single-Source-of-Truth Customer Form Modal */}
      <CustomerFormModal
        open={quickRegModal}
        onClose={() => {
          setQuickRegModal(false);
          setSelectedCustomerToEdit(null);
        }}
        customer={selectedCustomerToEdit || undefined}
        initialPhone={customerPhoneDigits ? `+91 ${customerPhoneDigits}` : undefined}
        onSuccess={(created) => {
          attachCustomer(created);
          setQuickRegModal(false);
          setSelectedCustomerToEdit(null);
        }}
      />

      {/* Digital Tax Invoice / Receipt Modal */}
      {receiptModal && (
        <DigitalInvoiceModal
          receiptModal={receiptModal}
          onClose={() => setReceiptModal(null)}
          branding={branding}
          systemSettings={systemSettings}
          onSendWhatsApp={handleSendWhatsAppInvoice}
          onViewProof={(proof) => setSelectedProof(proof)}
        />
      )}

      {/* Full-Screen Payment Proof Viewer */}
      <ProofViewerModal proof={selectedProof} onClose={() => setSelectedProof(null)} />

      {/* Void & Refund Modal */}
      {refundModalSale && (
        <VoidRefundModal
          sale={refundModalSale}
          onClose={() => setRefundModalSale(null)}
          onConfirmRefund={async (saleId, refundMethod) => {
            const res = await updateSale(saleId, {
              status: 'Refunded',
              paymentMethod: refundMethod,
            });
            return Boolean(res?.success);
          }}
        />
      )}
    </AppLayout>
  );
}
