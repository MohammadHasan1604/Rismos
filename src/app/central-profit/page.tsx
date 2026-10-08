'use client';
import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import StoreFormModal from '@/components/forms/StoreFormModal';
import NumericInput from '@/components/ui/NumericInput';
import { useApp, StockTransferRecord, InventoryItem } from '@/context/AppContext';
import { toast } from 'sonner';
import SuperAdminGuard from '@/components/SuperAdminGuard';
import {
  calculateTransferLineItem,
  formatTransferAmount,
  formatTransferMargin,
  getTransferProfitColorClass,
  validateTransferHeader,
  validateTransferItem,
  round2,
} from '@/lib/stockTransferCalculations';

export default function CentralProfitPage() {
  const {
    stockTransfers,
    expenses,
    inventory,
    storesList,
    transferStock,
    updateTransferStatus,
    defaultStoreTransferPrices,
    setDefaultStoreTransferPrice,
    currentUser,
    branding,
    systemSettings,
  } = useApp();

  const currencyCode = systemSettings?.currencyCode || branding?.baseCurrency?.slice(0, 3) || 'USD';
  const currencySymbol = systemSettings?.currencySymbol || '';
  const locale = branding?.locale || 'en-US';

  const formatTransferCurrency = (
    amt: number | null | undefined,
    opts?: { showPositiveSign?: boolean; decimals?: number }
  ) => formatTransferAmount(amt, { currencyCode, currencySymbol, locale, ...opts });

  const [storeFilter, setStoreFilter] = useState('All Stores');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'Draft'>('All');
  const [searchRef, setSearchRef] = useState('');

  // Modals state
  const [createModal, setCreateModal] = useState(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [managePricesModal, setManagePricesModal] = useState(false);
  const [confirmTransferModal, setConfirmTransferModal] = useState(false);
  const [viewTransferModal, setViewTransferModal] = useState<StockTransferRecord | null>(null);

  // Transfer Form State
  const [fromStore, setFromStore] = useState('CENTRAL');
  const [toStore, setToStore] = useState('MUM');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [transferQty, setTransferQty] = useState<number | ''>('');
  const [customTransferPriceInput, setCustomTransferPriceInput] = useState<number | ''>('');
  const [transferStatusInput, setTransferStatusInput] = useState<'Completed' | 'Draft'>(
    'Completed'
  );

  // Manage Prices Form State
  const [selectedProductForPricing, setSelectedProductForPricing] = useState('');
  const [selectedStoreForPricing, setSelectedStoreForPricing] = useState('MUM');
  const [defaultPriceInput, setDefaultPriceInput] = useState<number | ''>('');

  // Available Inventory Items at selected source location
  const sourceItems = useMemo(() => {
    return inventory.filter((i) => i.store === fromStore && i.qtyOnHand > 0);
  }, [inventory, fromStore]);

  // Currently selected item for transfer
  const activeItem = useMemo(() => {
    if (!selectedProductId && sourceItems.length > 0) return sourceItems[0];
    return (
      sourceItems.find((i) => i.id === selectedProductId || i.productId === selectedProductId) ||
      sourceItems[0] ||
      null
    );
  }, [selectedProductId, sourceItems]);

  // Pre-fill / update transfer price when item or destination store changes
  React.useEffect(() => {
    if (activeItem && toStore) {
      const matchDefault = defaultStoreTransferPrices.find(
        (p) =>
          (p.productId === activeItem.id || p.productId === activeItem.productId) &&
          p.storeCode === toStore
      );
      if (matchDefault) {
        setCustomTransferPriceInput(matchDefault.defaultTransferPrice);
      } else if (activeItem.transferPrice && activeItem.transferPrice > 0) {
        setCustomTransferPriceInput(activeItem.transferPrice);
      } else {
        setCustomTransferPriceInput('');
      }
    }
  }, [activeItem, toStore, defaultStoreTransferPrices]);

  // Derived transfer live calculations via centralized engine
  const unitCost = round2(activeItem ? Number(activeItem.costPrice) || 0 : 0);
  const effectiveTransferPrice =
    typeof customTransferPriceInput === 'number' && customTransferPriceInput >= 0
      ? round2(customTransferPriceInput)
      : unitCost;
  const availableStock = activeItem ? Number(activeItem.qtyOnHand) || 0 : 0;

  const numericQty = transferQty === '' ? 0 : Number(transferQty);
  const lineCalc = calculateTransferLineItem({
    qty: numericQty,
    costPerUnit: unitCost,
    transferPricePerUnit: effectiveTransferPrice,
  });
  const totalInventoryCostCalc = lineCalc.lineTotalCost;
  const totalTransferValueCalc = lineCalc.lineTotalValue;
  const unitProfitCalc = lineCalc.unitProfit;
  const totalGrossProfitCalc = lineCalc.lineProfit;
  const grossMarginPercentCalc = lineCalc.profitMarginPercent;

  // Filtered Transfers List
  const filteredTransfers = useMemo(() => {
    const isCompletedStatus = (st: string) => st === 'Completed' || st === 'Received';
    return stockTransfers.filter((t) => {
      const assignedStore = currentUser.store || 'BLR';
      const matchStore =
        currentUser.role === 'Super Admin'
          ? storeFilter === 'All Stores' ||
            t.destStore === storeFilter ||
            t.sourceStore === storeFilter
          : t.destStore === assignedStore || t.sourceStore === assignedStore;
      const matchStatus =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Completed'
            ? isCompletedStatus(t.status)
            : t.status === statusFilter;
      const matchSearch =
        searchRef === '' ||
        t.transferNo.toLowerCase().includes(searchRef.toLowerCase()) ||
        t.productName.toLowerCase().includes(searchRef.toLowerCase()) ||
        t.sku.toLowerCase().includes(searchRef.toLowerCase());
      return matchStore && matchStatus && matchSearch;
    });
  }, [stockTransfers, storeFilter, statusFilter, searchRef]);

  // High-Level Central Profit KPIs (Authoritative Stored Totals)
  const isCompletedTransfer = (status: string) => status === 'Completed' || status === 'Received';
  const completedTransfers = useMemo(
    () => filteredTransfers.filter((t) => isCompletedTransfer(t.status)),
    [filteredTransfers]
  );

  const totalTransferRevenue = useMemo(
    () =>
      completedTransfers.reduce(
        (acc, t) =>
          round2(
            acc +
              (t.totalTransferValue !== undefined && !isNaN(Number(t.totalTransferValue))
                ? Number(t.totalTransferValue)
                : (Number(t.transferPrice) || 0) * (t.qty || 1))
          ),
        0
      ),
    [completedTransfers]
  );

  const totalInventoryCost = useMemo(
    () =>
      completedTransfers.reduce(
        (acc, t) =>
          round2(
            acc +
              (t.totalCost !== undefined && !isNaN(Number(t.totalCost))
                ? Number(t.totalCost)
                : (Number(t.purchaseCost) || 0) * (t.qty || 1))
          ),
        0
      ),
    [completedTransfers]
  );

  // Authoritative Gross Profit: Revenue - Cost
  const totalGrossTransferProfit = useMemo(
    () => round2(totalTransferRevenue - totalInventoryCost),
    [totalTransferRevenue, totalInventoryCost]
  );

  // Central Expenses
  const centralExpenses = useMemo(() => {
    return round2(
      expenses
        .filter(
          (e) =>
            e.store === 'CENTRAL' ||
            e.description.toLowerCase().includes('central') ||
            e.category === 'Transport'
        )
        .reduce((acc, e) => acc + (Number(e.amount) || 0), 0)
    );
  }, [expenses]);

  const netCentralProfit = round2(totalGrossTransferProfit - centralExpenses);
  const totalUnitsTransferred = useMemo(
    () => completedTransfers.reduce((acc, t) => acc + (t.qty || 0), 0),
    [completedTransfers]
  );
  const activeStoresCount = useMemo(
    () => new Set(completedTransfers.map((t) => t.destStore)).size,
    [completedTransfers]
  );

  // Store Breakdown Calculations with Exact Paisa Reconciliation
  const storeBreakdown = useMemo(() => {
    const map: Record<string, { store: string; cost: number; revenue: number; profit: number }> =
      {};

    completedTransfers.forEach((t) => {
      const dest = t.destStore;
      if (!map[dest]) map[dest] = { store: dest, cost: 0, revenue: 0, profit: 0 };
      const tVal = round2(
        t.totalTransferValue !== undefined && !isNaN(Number(t.totalTransferValue))
          ? Number(t.totalTransferValue)
          : (Number(t.transferPrice) || 0) * (t.qty || 1)
      );
      const tCost = round2(
        t.totalCost !== undefined && !isNaN(Number(t.totalCost))
          ? Number(t.totalCost)
          : (Number(t.purchaseCost) || 0) * (t.qty || 1)
      );
      const tProfit = round2(tVal - tCost);
      map[dest].cost = round2(map[dest].cost + tCost);
      map[dest].revenue = round2(map[dest].revenue + tVal);
      map[dest].profit = round2(map[dest].profit + tProfit);
    });

    return Object.values(map);
  }, [completedTransfers]);

  // Product Profitability Breakdown with Exact Paisa Reconciliation
  const productBreakdown = useMemo(() => {
    const map: Record<
      string,
      { name: string; sku: string; qty: number; cost: number; revenue: number; profit: number }
    > = {};

    completedTransfers.forEach((t) => {
      const key = t.sku || 'SKU';
      if (!map[key])
        map[key] = { name: t.productName, sku: t.sku, qty: 0, cost: 0, revenue: 0, profit: 0 };
      const tVal = round2(
        t.totalTransferValue !== undefined && !isNaN(Number(t.totalTransferValue))
          ? Number(t.totalTransferValue)
          : (Number(t.transferPrice) || 0) * (t.qty || 1)
      );
      const tCost = round2(
        t.totalCost !== undefined && !isNaN(Number(t.totalCost))
          ? Number(t.totalCost)
          : (Number(t.purchaseCost) || 0) * (t.qty || 1)
      );
      const tProfit = round2(tVal - tCost);
      map[key].qty += t.qty || 1;
      map[key].cost = round2(map[key].cost + tCost);
      map[key].revenue = round2(map[key].revenue + tVal);
      map[key].profit = round2(map[key].profit + tProfit);
    });

    return Object.values(map);
  }, [completedTransfers]);

  const openCreateModal = () => {
    if (sourceItems.length > 0) {
      setSelectedProductId(sourceItems[0].productId || sourceItems[0].id);
      setTransferQty('');
    }
    setCreateModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) {
      toast.error('Please select an item to transfer');
      return;
    }
    const headerVal = validateTransferHeader({
      sourceStore: fromStore,
      destStore: toStore,
      itemsCount: 1,
    });
    if (!headerVal.isValid) {
      toast.error(headerVal.error);
      return;
    }
    if (transferQty === '' || Number(transferQty) <= 0) {
      toast.error('Please enter a valid transfer quantity');
      return;
    }
    const itemVal = validateTransferItem({
      qty: Number(transferQty),
      costPerUnit: unitCost,
      transferPricePerUnit: effectiveTransferPrice,
      availableStock,
    });
    if (!itemVal.isValid) {
      toast.error(itemVal.error);
      return;
    }
    setConfirmTransferModal(true);
  };

  const executeTransfer = async () => {
    if (!activeItem) return;
    await transferStock(
      fromStore,
      toStore,
      activeItem.productId || activeItem.id,
      Math.floor(Number(transferQty)),
      effectiveTransferPrice,
      transferStatusInput
    );
    setConfirmTransferModal(false);
    setCreateModal(false);
    setTransferQty('');
  };

  const handleSaveDefaultPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForPricing) {
      toast.error('Select a product to set default pricing');
      return;
    }
    if (defaultPriceInput === '' || Number(defaultPriceInput) < 0) {
      toast.error('Please enter a valid default transfer price');
      return;
    }
    setDefaultStoreTransferPrice(
      selectedProductForPricing,
      selectedStoreForPricing,
      Number(defaultPriceInput)
    );
    setDefaultPriceInput('');
  };

  return (
    <SuperAdminGuard moduleName="Central Profit">
      <AppLayout activeRoute="/central-profit">
        <div className="space-y-4 md:space-y-6 fade-in">
          {/* Page Header & Primary Actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <div className="flex items-center gap-2">
                <h1 className="page-title">Central Profit</h1>
                <span className="badge-primary text-3xs">CENTRAL</span>
              </div>
              <p className="page-subtitle">Stock distribution & transfer pricing</p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={openCreateModal} className="btn-primary btn-sm gap-1">
                <Icon name="PlusIcon" size={14} />
                <span className="hidden sm:inline">Transfer</span>
                <span className="sm:hidden">+</span>
              </button>
              <button
                onClick={() => setManagePricesModal(true)}
                className="btn-secondary btn-sm gap-1 hidden sm:inline-flex"
              >
                <Icon name="AdjustmentsHorizontalIcon" size={14} />
                Prices
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="card p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Icon
                  name="MagnifyingGlassIcon"
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search transfer ref, product or SKU..."
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  className="input-field pl-9 text-xs py-1.5"
                />
              </div>
              <div className="flex items-center gap-1">
                {(['All', 'Completed', 'Draft'] as const).map((st) => (
                  <button
                    key={`st-flt-${st}`}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors ${
                      statusFilter === st
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {currentUser.role === 'Super Admin' && (
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="input-field text-xs py-1.5 px-3 w-full sm:w-auto"
              >
                <option value="All Stores">All Destination Stores</option>
                {storesList
                  .filter((s) => s.code !== 'CENTRAL')
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} ({s.name})
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* 7 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="card p-3 space-y-1 border-l-4 border-l-primary">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Transfer Revenue
              </span>
              <span className="text-base font-extrabold text-foreground block font-tabular">
                {formatTransferCurrency(totalTransferRevenue)}
              </span>
              <span className="text-3xs text-muted-foreground">Gross Internal Value</span>
            </div>

            <div className="card p-3 space-y-1 border-l-4 border-l-muted-foreground">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Inventory Cost
              </span>
              <span className="text-base font-extrabold text-foreground block font-tabular">
                {formatTransferCurrency(totalInventoryCost)}
              </span>
              <span className="text-3xs text-muted-foreground">Actual Vendor Cost</span>
            </div>

            <div className="card p-3 space-y-1 border-l-4 border-l-positive">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Gross Profit
              </span>
              <span
                className={`text-base font-extrabold block font-tabular ${getTransferProfitColorClass(totalGrossTransferProfit)}`}
              >
                {formatTransferCurrency(totalGrossTransferProfit, { showPositiveSign: true })}
              </span>
              <span className="text-3xs text-muted-foreground">Revenue − Cost</span>
            </div>

            <div className="card p-3 space-y-1 border-l-4 border-l-warning">
              <span className="text-3xs font-bold uppercase tracking-wider text-warning">
                Central Expenses
              </span>
              <span className="text-base font-extrabold text-warning block font-tabular">
                {formatTransferCurrency(centralExpenses)}
              </span>
              <span className="text-3xs text-muted-foreground">Logistics & Ops</span>
            </div>

            <div className="card p-3 space-y-1 border-l-4 border-l-info">
              <span className="text-3xs font-bold uppercase tracking-wider text-info">
                Net Central Profit
              </span>
              <span
                className={`text-base font-extrabold block font-tabular ${getTransferProfitColorClass(netCentralProfit)}`}
              >
                {formatTransferCurrency(netCentralProfit, { showPositiveSign: true })}
              </span>
              <span className="text-3xs text-muted-foreground">Gross Profit − Exp</span>
            </div>

            <div className="card p-3 space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Units Transferred
              </span>
              <span className="text-base font-extrabold text-foreground block font-tabular">
                {totalUnitsTransferred}
              </span>
              <span className="text-3xs text-muted-foreground">Items Shifted</span>
            </div>

            <div className="card p-3 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Stores
              </span>
              <span className="text-base font-extrabold text-foreground block font-tabular">
                {activeStoresCount} Stores
              </span>
              <span className="text-3xs text-muted-foreground">Receiving Stock</span>
            </div>
          </div>

          {/* Store & Product Breakdown Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Store Breakdown Table */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                  <Icon name="BuildingStorefrontIcon" size={16} className="text-primary" />
                  Store-wise Central Transfer Profit
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-3xs uppercase tracking-wider">
                      <th className="px-4 py-3">Store</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-right">Transfer Value</th>
                      <th className="px-4 py-3 text-right">Gross Profit</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-tabular">
                    {storeBreakdown.map((s) => {
                      const margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
                      return (
                        <tr key={`sb-${s.store}`} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-bold text-foreground">{s.store}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {formatTransferCurrency(s.cost)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatTransferCurrency(s.revenue)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold ${getTransferProfitColorClass(s.profit)}`}
                          >
                            {formatTransferCurrency(s.profit, { showPositiveSign: true })}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-bold ${getTransferProfitColorClass(s.profit)}`}
                          >
                            {formatTransferMargin(margin)}
                          </td>
                        </tr>
                      );
                    })}
                    {storeBreakdown.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-muted-foreground italic text-2xs"
                        >
                          No store transfer breakdown data recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product Profitability Breakdown Table */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                  <Icon name="CubeIcon" size={16} className="text-primary" />
                  Product Transfer Profitability
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-3xs uppercase tracking-wider">
                      <th className="px-4 py-3">Product / SKU</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Transfer Revenue</th>
                      <th className="px-4 py-3 text-right">Gross Profit</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-tabular">
                    {productBreakdown.map((p) => {
                      const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                      return (
                        <tr key={`pb-${p.sku}`} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <p className="font-bold text-foreground line-clamp-1">{p.name}</p>
                            <p className="text-3xs text-muted-foreground font-mono">{p.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{p.qty}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatTransferCurrency(p.revenue)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold ${getTransferProfitColorClass(p.profit)}`}
                          >
                            {formatTransferCurrency(p.profit, { showPositiveSign: true })}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-bold ${getTransferProfitColorClass(p.profit)}`}
                          >
                            {formatTransferMargin(margin)}
                          </td>
                        </tr>
                      );
                    })}
                    {productBreakdown.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-muted-foreground italic text-2xs"
                        >
                          No product transfer profit data recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Detailed Transfer History Table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Stock Transfer History Log</h3>
                <p className="text-2xs text-muted-foreground">
                  Immutable audit records of all inter-store transfers & profit calculations
                </p>
              </div>
              <span className="text-2xs font-semibold text-muted-foreground">
                {filteredTransfers.length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-3xs uppercase tracking-wider">
                    <th className="px-4 py-3">Ref #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">From → To</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Transfer Price</th>
                    <th className="px-4 py-3 text-right">Transfer Profit</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-tabular">
                  {filteredTransfers.map((t) => (
                    <tr key={`tr-log-${t.id}`} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{t.transferNo}</td>
                      <td className="px-4 py-3 text-2xs text-muted-foreground">{t.createdAt}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <p className="line-clamp-1">{t.productName}</p>
                        <p className="text-3xs font-mono text-muted-foreground">{t.sku}</p>
                      </td>
                      <td className="px-4 py-3 font-bold">
                        <span className="badge-secondary text-3xs">{t.sourceStore}</span> →{' '}
                        <span className="badge-info text-3xs">{t.destStore}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold">{t.qty}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatTransferCurrency(t.purchaseCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {formatTransferCurrency(t.transferPrice)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-extrabold ${getTransferProfitColorClass(t.transferProfit)}`}
                      >
                        {formatTransferCurrency(t.transferProfit, { showPositiveSign: true })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-3xs font-bold ${
                            isCompletedTransfer(t.status)
                              ? 'bg-positive/10 text-positive'
                              : t.status === 'Draft'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'Draft' && (
                            <button
                              onClick={() => updateTransferStatus(t.id, 'Completed')}
                              className="btn-primary text-3xs py-1 px-2"
                              title="Complete Draft Transfer"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            onClick={() => setViewTransferModal(t)}
                            className="btn-ghost text-3xs py-1 px-1.5"
                            title="View Summary"
                          >
                            <Icon name="EyeIcon" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* CREATE STOCK TRANSFER MODAL */}
        {createModal && (
          <Modal
            open={createModal}
            onClose={() => setCreateModal(false)}
            title="Create Stock Transfer"
            subtitle="Transfer stock from Central Warehouse to destination store with custom transfer pricing"
            size="lg"
          >
            <form onSubmit={handleCreateSubmit} className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Source Location *
                  </label>
                  <CustomSelect
                    value={fromStore}
                    onChange={(val) => {
                      setFromStore(val);
                      setSelectedProductId('');
                    }}
                    options={storesList
                      .filter((s) => s.status === 'Active')
                      .map((st) => ({
                        value: st.code,
                        label: `${st.code} — ${st.name}`,
                      }))}
                    placeholder="Select Source"
                    searchPlaceholder="Search source..."
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Destination Store *
                  </label>
                  <CustomSelect
                    value={toStore}
                    onChange={(val) => setToStore(val)}
                    options={storesList
                      .filter((s) => s.code !== fromStore && s.status === 'Active')
                      .map((st) => ({
                        value: st.code,
                        label: `${st.code} — ${st.name}`,
                      }))}
                    placeholder="Select Destination"
                    searchPlaceholder="Search store..."
                    addNewLabel="+ Add New Store"
                    onAddNew={() => setIsStoreModalOpen(true)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Select Product *
                  </label>
                  {sourceItems.length === 0 ? (
                    <div className="p-2.5 rounded-lg border border-warning/40 bg-warning/10 text-warning text-2xs">
                      No available inventory at {fromStore}. Select another source.
                    </div>
                  ) : (
                    <CustomSelect
                      value={selectedProductId}
                      onChange={(val) => setSelectedProductId(val)}
                      options={sourceItems.map((item) => ({
                        value: item.id,
                        label: item.name,
                        sublabel: `${item.sku} • Avail: ${item.qtyOnHand} units`,
                      }))}
                      placeholder="Search or select product..."
                      searchPlaceholder="Search by name or SKU..."
                      required
                    />
                  )}
                  <p className="text-3xs text-muted-foreground mt-1">
                    Available at {fromStore}:{' '}
                    <strong className="text-primary">{availableStock} units</strong>
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Quantity to Transfer *
                  </label>
                  <NumericInput
                    min={1}
                    max={availableStock}
                    required
                    value={transferQty}
                    onChange={(val) => setTransferQty(val)}
                    className="input-field text-xs font-bold"
                    placeholder="Enter qty..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Inventory Cost / Purchase Cost
                  </label>
                  <input
                    type="text"
                    disabled
                    value={formatTransferAmount(unitCost, { currencyCode, currencySymbol, locale })}
                    className="input-field text-xs bg-muted/50 font-bold text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-3xs text-muted-foreground mt-0.5">Authoritative cost basis</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Transfer Price Per Unit (Editable) *
                  </label>
                  <NumericInput
                    min={0}
                    required
                    placeholder={`Reference Cost: ${formatTransferAmount(unitCost, { currencyCode, currencySymbol, locale })}`}
                    value={customTransferPriceInput}
                    onChange={(val) => setCustomTransferPriceInput(val)}
                    className="input-field text-xs font-bold text-primary"
                  />
                  <p className="text-3xs text-muted-foreground mt-0.5">
                    Custom transfer price for {toStore}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Execution Status
                  </label>
                  <select
                    value={transferStatusInput}
                    onChange={(e: any) => setTransferStatusInput(e.target.value)}
                    className="input-field text-xs font-medium"
                  >
                    <option value="Completed">Completed (Immediate Stock Movement)</option>
                    <option value="Draft">Draft (Save Without Moving Stock)</option>
                  </select>
                </div>
              </div>

              {/* LIVE CALCULATION PREVIEW BOX */}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Live Transfer Profit Calculation Preview</span>
                  <span className="badge-primary text-3xs">{toStore} DESTINATION</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-3xs uppercase font-bold text-muted-foreground block">
                      Inventory Cost
                    </span>
                    <span className="text-xs font-bold text-foreground font-tabular">
                      {formatTransferCurrency(totalInventoryCostCalc)}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-3xs uppercase font-bold text-muted-foreground block">
                      Transfer Value
                    </span>
                    <span className="text-xs font-bold text-foreground font-tabular">
                      {formatTransferCurrency(totalTransferValueCalc)}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-3xs uppercase font-bold text-muted-foreground block">
                      Profit / Unit
                    </span>
                    <span
                      className={`text-xs font-bold font-tabular ${getTransferProfitColorClass(unitProfitCalc)}`}
                    >
                      {formatTransferCurrency(unitProfitCalc, { showPositiveSign: true })}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-background border border-border">
                    <span className="text-3xs uppercase font-bold text-muted-foreground block">
                      Central Gross Profit
                    </span>
                    <span
                      className={`text-sm font-extrabold font-tabular ${getTransferProfitColorClass(totalGrossProfitCalc)}`}
                    >
                      {formatTransferCurrency(totalGrossProfitCalc, { showPositiveSign: true })}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-background border border-border col-span-2 sm:col-span-1">
                    <span className="text-3xs uppercase font-bold text-info block">
                      Gross Margin
                    </span>
                    <span
                      className={`text-xs font-extrabold font-tabular ${getTransferProfitColorClass(totalGrossProfitCalc)}`}
                    >
                      {formatTransferMargin(grossMarginPercentCalc)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs font-bold">
                  Review & Confirm Transfer
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* CONFIRMATION SUMMARY MODAL */}
        {confirmTransferModal && (
          <Modal
            open={confirmTransferModal}
            onClose={() => setConfirmTransferModal(false)}
            title="Confirm Stock Transfer"
            subtitle="Review final transfer accounting details before atomic execution"
            size="sm"
          >
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2 font-tabular">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-bold text-foreground">{activeItem?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destination:</span>
                  <span className="font-bold text-primary">{toStore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="font-bold text-foreground">{transferQty} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Inventory Cost / unit:</span>
                  <span className="font-bold text-foreground">{formatTransferCurrency(unitCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transfer Price / unit:</span>
                  <span className="font-bold text-primary">
                    {formatTransferCurrency(effectiveTransferPrice)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-bold text-foreground">Total Inventory Cost:</span>
                  <span className="font-bold text-foreground">
                    {formatTransferCurrency(totalInventoryCostCalc)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-foreground">Total Transfer Value:</span>
                  <span className="font-bold text-foreground">
                    {formatTransferCurrency(totalTransferValueCalc)}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="font-extrabold text-foreground">Central Gross Profit:</span>
                  <span
                    className={`font-extrabold ${getTransferProfitColorClass(totalGrossProfitCalc)}`}
                  >
                    {formatTransferCurrency(totalGrossProfitCalc, { showPositiveSign: true })}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setConfirmTransferModal(false)}
                  className="btn-secondary text-xs"
                >
                  Back to Edit
                </button>
                <button onClick={executeTransfer} className="btn-primary text-xs font-bold">
                  Confirm & Execute Transfer
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* MANAGE DEFAULT TRANSFER PRICES MODAL */}
        {managePricesModal && (
          <Modal
            open={managePricesModal}
            onClose={() => setManagePricesModal(false)}
            title="Manage Default Store Transfer Prices"
            subtitle="Configure default internal transfer pricing per product and destination store"
            size="lg"
          >
            <div className="space-y-4 py-2 text-xs">
              <form
                onSubmit={handleSaveDefaultPrice}
                className="p-3 rounded-xl border border-border bg-muted/30 space-y-3"
              >
                <h4 className="font-bold text-foreground text-2xs uppercase tracking-wider">
                  Set Default Price Rule
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-3xs font-bold text-muted-foreground block mb-1">
                      Product
                    </label>
                    <select
                      value={selectedProductForPricing}
                      onChange={(e) => setSelectedProductForPricing(e.target.value)}
                      className="input-field text-xs py-1"
                    >
                      <option value="">Select Product</option>
                      {inventory.map((item) => (
                        <option key={`price-prod-${item.id}`} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-3xs font-bold text-muted-foreground block mb-1">
                      Destination Store
                    </label>
                    <select
                      value={selectedStoreForPricing}
                      onChange={(e) => setSelectedStoreForPricing(e.target.value)}
                      className="input-field text-xs py-1"
                    >
                      {storesList
                        .filter((s) => s.code !== 'CENTRAL')
                        .map((st) => (
                          <option key={`st-pr-${st.code}`} value={st.code}>
                            {st.code} — {st.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-3xs font-bold text-muted-foreground block mb-1">
                      Default Transfer Price ({currencySymbol})
                    </label>
                    <NumericInput
                      min={0}
                      required
                      value={defaultPriceInput}
                      onChange={(val) => setDefaultPriceInput(val)}
                      className="input-field text-xs py-1 font-bold"
                      placeholder="Enter price..."
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary text-2xs py-1 px-3">
                    Save Pricing Rule
                  </button>
                </div>
              </form>

              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-3xs font-semibold uppercase text-muted-foreground">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2 text-right">Default Transfer Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-tabular">
                    {defaultStoreTransferPrices.map((p) => {
                      const prod = inventory.find((i) => i.id === p.productId);
                      return (
                        <tr key={`tp-rule-${p.id}`}>
                          <td className="px-3 py-2 font-semibold text-foreground">
                            {prod ? prod.name : `#${p.productId}`}
                          </td>
                          <td className="px-3 py-2">
                            <span className="badge-info text-3xs">{p.storeCode}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-extrabold text-primary">
                            {formatTransferAmount(p.defaultTransferPrice, { currencyCode, currencySymbol, locale })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  onClick={() => setManagePricesModal(false)}
                  className="btn-primary text-xs py-1 px-4"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* VIEW SUMMARY MODAL */}
        {viewTransferModal && (
          <Modal
            open={!!viewTransferModal}
            onClose={() => setViewTransferModal(null)}
            title={`Transfer ${viewTransferModal.transferNo}`}
            subtitle={`Recorded on ${viewTransferModal.createdAt} by ${viewTransferModal.createdBy}`}
            size="sm"
          >
            <div className="space-y-3 py-2 text-xs font-tabular">
              <div className="p-3 rounded-xl bg-muted/40 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-bold text-foreground">{viewTransferModal.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route:</span>
                  <span className="font-bold">
                    {viewTransferModal.sourceStore} → {viewTransferModal.destStore}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="font-extrabold">{viewTransferModal.qty} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchase Cost / Unit:</span>
                  <span className="text-foreground">
                    {formatTransferCurrency(viewTransferModal.purchaseCost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transfer Price / Unit:</span>
                  <span className="font-bold text-primary">
                    {formatTransferCurrency(viewTransferModal.transferPrice)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border">
                  <span className="text-muted-foreground">Total Inventory Cost:</span>
                  <span className="font-semibold text-foreground">
                    {formatTransferCurrency(
                      viewTransferModal.totalCost ||
                        viewTransferModal.purchaseCost * viewTransferModal.qty
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Transfer Value:</span>
                  <span className="font-semibold text-foreground">
                    {formatTransferCurrency(
                      viewTransferModal.totalTransferValue ||
                        viewTransferModal.transferPrice * viewTransferModal.qty
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 border-t border-border">
                  <span className="font-bold text-foreground">Total Transfer Profit:</span>
                  <span
                    className={`font-extrabold ${getTransferProfitColorClass(viewTransferModal.transferProfit)}`}
                  >
                    {formatTransferCurrency(viewTransferModal.transferProfit, {
                      showPositiveSign: true,
                    })}
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setViewTransferModal(null)}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {isStoreModalOpen && (
          <StoreFormModal
            open={isStoreModalOpen}
            onClose={() => setIsStoreModalOpen(false)}
            zIndex={110}
            onSuccess={(newStore) => {
              setToStore(newStore.code);
            }}
          />
        )}
      </AppLayout>
    </SuperAdminGuard>
  );
}
