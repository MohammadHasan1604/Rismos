'use client';
import React, { useState, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import StockAdjustmentModal from '@/components/forms/StockAdjustmentModal';
import AddItemModal from './AddItemModal';
import ProductDetailModal from './ProductDetailModal';
import StoreStockModal from './StoreStockModal';
import BottomSheet from '@/components/ui/BottomSheet';
import { useApp, InventoryItem } from '@/context/AppContext';
import { toast } from 'sonner';

const StockStatusBadge = StatusBadge;

type SortKey = keyof InventoryItem;

const ALL_COLUMNS = [
  { key: 'sku', label: 'SKU', visible: true },
  { key: 'name', label: 'Item Name', visible: true },
  { key: 'brand', label: 'Brand', visible: true },
  { key: 'category', label: 'Category', visible: true },
  { key: 'store', label: 'Store', visible: true },
  { key: 'qtyOnHand', label: 'Qty on Hand', visible: true },
  { key: 'reorderPt', label: 'Reorder Pt', visible: true },
  { key: 'costPrice', label: 'Cost Price', visible: true },
  { key: 'sellingPrice', label: 'Sell Price', visible: true },
  { key: 'mrp', label: 'MRP', visible: true },
  { key: 'hsn', label: 'HSN', visible: false },
  { key: 'taxRate', label: 'Tax %', visible: true },
  { key: 'fifoLots', label: 'FIFO Lots', visible: false },
  { key: 'status', label: 'Status', visible: true },
  { key: 'lastMovement', label: 'Last Movement', visible: false },
];

const STATUSES = ['All Status', 'Active', 'Inactive', 'Low Stock', 'Out of Stock'];

function getStockStatus(item: InventoryItem) {
  if (item.qtyOnHand === 0) return { variant: 'out-of-stock' as const, label: 'Out of Stock' };
  if (item.qtyOnHand <= item.reorderPt)
    return { variant: 'low-stock' as const, label: 'Low Stock' };
  if (item.status === 'inactive') return { variant: 'inactive' as const, label: 'Inactive' };
  return { variant: 'active' as const, label: 'Active' };
}

interface InventoryTableProps {
  categoryFilter?: string;
  setCategoryFilter?: (cat: string) => void;
}

export default function InventoryTable({
  categoryFilter: propCategoryFilter,
  setCategoryFilter: propSetCategoryFilter,
}: InventoryTableProps = {}) {
  const {
    inventory,
    deleteItem: removeInventoryItem,
    updateItem,
    selectedStore,
    setSelectedStore,
    categoriesList,
    storesList,
    currentUser,
    sales,
    inventoryLedger,
    confirmAction,
  } = useApp();

  const isSuperAdmin = currentUser.role === 'Super Admin';

  const [search, setSearch] = useState('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState('All Categories');
  const categoryFilter =
    propCategoryFilter !== undefined ? propCategoryFilter : localCategoryFilter;
  const setCategoryFilter = propSetCategoryFilter || setLocalCategoryFilter;

  const [statusFilter, setStatusFilter] = useState('All Status');
  const [sortMode, setSortMode] = useState<
    'newest' | 'oldest' | 'name' | 'sku' | 'qtyOnHand' | 'costPrice' | 'category'
  >('newest');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnConfig, setColumnConfig] = useState(ALL_COLUMNS);
  const [colVisOpen, setColVisOpen] = useState(false);

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);
  const [deleteItemModal, setDeleteItemModal] = useState<InventoryItem | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [storeStockItem, setStoreStockItem] = useState<InventoryItem | null>(null);
  const [mobileActionItem, setMobileActionItem] = useState<InventoryItem | null>(null);

  const visibleColumns = columnConfig.filter((c) => c.visible);

  const handleOpenEdit = async (item: InventoryItem) => {
    try {
      const targetId = item.productId || item.id;
      const res = await fetch(`/api/inventory?id=${encodeURIComponent(targetId)}`);
      const data = await res.json();
      if (data?.success && data?.product) {
        const p = data.product;
        const currentStoreInv =
          (p.inventoryItems || []).find(
            (inv: any) =>
              inv.storeCode ===
              (selectedStore !== 'All Stores' && selectedStore !== 'ALL'
                ? selectedStore
                : item.store)
          ) || (p.inventoryItems || [])[0];

        setEditItem({
          id: p.id,
          productId: p.id,
          sku: p.sku,
          barcode: p.barcode || '',
          name: p.name,
          brand: p.brand || '',
          model: p.model || '',
          category: p.category,
          subcategory: p.subcategory || '',
          description: p.description || '',
          store:
            currentStoreInv?.storeCode ||
            (selectedStore !== 'All Stores' && selectedStore !== 'ALL'
              ? selectedStore
              : item.store) ||
            'CENTRAL',
          qtyOnHand:
            currentStoreInv?.qtyOnHand !== undefined ? currentStoreInv.qtyOnHand : item.qtyOnHand,
          reorderPt: currentStoreInv?.reorderPt || item.reorderPt || 5,
          minStock: item.minStock || 10,
          costPrice: Number(p.baseCostPrice),
          transferPrice: Number(p.baseCostPrice),
          sellingPrice: Number(p.baseSellingPrice),
          mrp: p.mrp !== null && p.mrp !== undefined ? Number(p.mrp) : item.mrp || 0,
          taxRate: Number(p.gstRate) || 18,
          warrantyMonths: p.warrantyMonths || 12,
          status: p.status as any,
          fifoLots: 1,
          lastMovement: 'Synced',
          imageUrl: p.imageUrl || undefined,
          primaryImage: p.imageUrl || undefined,
          images: p.imageUrl ? [p.imageUrl] : [],
        });
        return;
      }
    } catch (err) {
      console.warn('Failed to fetch authoritative product for edit:', err);
    }
    setEditItem(item);
  };

  // Consolidate inventory for "All Stores" scope, or filter strictly by selected store
  const scopedItems = useMemo(() => {
    if (selectedStore === 'All Stores' || selectedStore === 'ALL') {
      const map = new Map<string, InventoryItem>();
      inventory.forEach((item) => {
        const key = item.productId || item.sku;
        const existing = map.get(key);
        if (existing) {
          existing.qtyOnHand += item.qtyOnHand;
          const mergedLoc = {
            ...(existing.locationStock || {}),
            ...(item.locationStock || {}),
            [item.store]: item.qtyOnHand,
          };
          existing.locationStock = mergedLoc;
        } else {
          const initialLoc = item.locationStock
            ? { ...item.locationStock }
            : { [item.store]: item.qtyOnHand };
          map.set(key, {
            ...item,
            id: item.productId || item.id,
            store: 'All Locations',
            locationStock: initialLoc,
          });
        }
      });
      return Array.from(map.values());
    } else {
      return inventory.filter((item) => item.store === selectedStore);
    }
  }, [inventory, selectedStore]);

  const filtered = useMemo(() => {
    return scopedItems.filter((item) => {
      const matchSearch =
        search === '' ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        (item.barcode && item.barcode.includes(search)) ||
        item.brand.toLowerCase().includes(search.toLowerCase());

      const matchCategory = categoryFilter === 'All Categories' || item.category === categoryFilter;

      const stockSt = getStockStatus(item);
      const matchStatus =
        statusFilter === 'All Status' ||
        (statusFilter === 'Active' && stockSt.variant === 'active') ||
        (statusFilter === 'Inactive' && item.status === 'inactive') ||
        (statusFilter === 'Low Stock' && stockSt.variant === 'low-stock') ||
        (statusFilter === 'Out of Stock' && stockSt.variant === 'out-of-stock');

      return matchSearch && matchCategory && matchStatus;
    });
  }, [scopedItems, search, categoryFilter, statusFilter]);

  const sorted = useMemo(() => {
    if (sortMode === 'newest') {
      return [...filtered].sort((a, b) => {
        const at = a.createdAt ? String(a.createdAt) : '';
        const bt = b.createdAt ? String(b.createdAt) : '';
        return bt.localeCompare(at);
      });
    }
    if (sortMode === 'oldest') {
      return [...filtered].sort((a, b) => {
        const at = a.createdAt ? String(a.createdAt) : '';
        const bt = b.createdAt ? String(b.createdAt) : '';
        return at.localeCompare(bt);
      });
    }
    return [...filtered].sort((a, b) => {
      const key = sortMode as keyof InventoryItem;
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
  }, [filtered, sortMode, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((i) => i.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    selectedIds.forEach((id) => removeInventoryItem(id));
    setSelectedIds(new Set());
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItemModal) return;
    setDeleteLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    removeInventoryItem(deleteItemModal.id);
    setDeleteLoading(false);
    setDeleteItemModal(null);
  };

  const handleStatusChange = (
    itemId: string,
    newStatus: 'active' | 'inactive' | 'discontinued'
  ) => {
    setStatusDropdownId(null);
    updateItem(itemId, { status: newStatus });
  };

  const toggleColumn = (key: string) => {
    setColumnConfig((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey)
      return (
        <Icon name="ChevronUpDownIcon" size={12} className="text-muted-foreground opacity-50" />
      );
    return sortDir === 'asc' ? (
      <Icon name="ChevronUpIcon" size={12} className="text-primary" />
    ) : (
      <Icon name="ChevronDownIcon" size={12} className="text-primary" />
    );
  };

  return (
    <>
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3.5 border-b border-border flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <Icon
                name="MagnifyingGlassIcon"
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search by name, SKU, barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
          </div>

          {/* Location filter */}
          {currentUser.role === 'Super Admin' ? (
            <select
              value={selectedStore}
              onChange={(e) => {
                setSelectedStore(e.target.value);
                setPage(1);
              }}
              className="input-field py-2 text-sm w-auto min-w-[200px]"
            >
              <optgroup label="Reporting Scope">
                <option value="All Stores">All Locations (Consolidated View)</option>
              </optgroup>
              <optgroup label="Physical Warehouses & Stores">
                {[...storesList]
                  .sort((a, b) =>
                    a.code === 'CENTRAL'
                      ? -1
                      : b.code === 'CENTRAL'
                        ? 1
                        : a.code.localeCompare(b.code)
                  )
                  .map((s) => (
                    <option key={`store-opt-${s.code}`} value={s.code}>
                      {s.code === 'CENTRAL'
                        ? 'COSKO Central Warehouse (CENTRAL)'
                        : `${s.name} (${s.code})`}
                    </option>
                  ))}
              </optgroup>
            </select>
          ) : (
            <div className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-xs font-semibold text-foreground">
              <Icon name="MapPinIcon" size={13} className="text-primary flex-shrink-0" />
              <span>{currentUser.store || 'BLR'} Store</span>
            </div>
          )}

          {/* Dynamic Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="input-field py-2 text-sm w-auto min-w-[160px]"
          >
            <option value="All Categories">All Categories</option>
            {categoriesList
              .filter((c) => c.status === 'Active')
              .map((c) => (
                <option key={`cat-opt-${c.id}`} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input-field py-2 text-sm w-auto min-w-[140px]"
          >
            {STATUSES.map((s) => (
              <option key={`status-opt-${s}`} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Sort order selector (Requirement 30) */}
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as any);
              setPage(1);
            }}
            className="input-field py-2 text-sm w-auto min-w-[160px]"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="name">Sort: Item Name</option>
            <option value="sku">Sort: SKU Code</option>
            <option value="qtyOnHand">Sort: Qty on Hand</option>
            <option value="costPrice">Sort: Inventory Value</option>
            <option value="category">Sort: Category</option>
          </select>

          <div className="flex-1" />

          {/* Column visibility */}
          <div className="relative">
            <button onClick={() => setColVisOpen((v) => !v)} className="btn-ghost text-sm gap-1.5">
              <Icon name="ViewColumnsIcon" size={15} />
              Columns
            </button>
            {colVisOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border rounded-xl shadow-modal z-30 py-2 fade-in">
                <p className="px-4 py-1.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Toggle Columns
                </p>
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={`col-toggle-${col.key}`}
                    className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-muted transition-colors duration-100"
                  >
                    <input
                      type="checkbox"
                      checked={columnConfig.find((c) => c.key === col.key)?.visible ?? false}
                      onChange={() => toggleColumn(col.key)}
                      className="w-3.5 h-3.5 accent-primary rounded"
                    />
                    <span className="text-sm text-foreground">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/20 flex items-center gap-3 slide-up">
            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex-1" />
            <button className="btn-ghost text-sm gap-1.5" onClick={() => setSelectedIds(new Set())}>
              <Icon name="XMarkIcon" size={14} />
              Deselect
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-danger hover:bg-danger/10 transition-all duration-150 active:scale-95"
              onClick={handleBulkDelete}
            >
              <Icon name="TrashIcon" size={14} />
              Delete Selected
            </button>
          </div>
        )}

        {/* Mobile Product Cards (<md) */}
        <div className="block md:hidden divide-y divide-border">
          {paginated.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Icon name="CubeIcon" size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No inventory items found</p>
            </div>
          ) : (
            paginated.map((item) => {
              const stockStatus = getStockStatus(item);
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={`m-inv-${item.id}-${item.store}`}
                  className={`p-4 space-y-3 bg-card hover:bg-muted/10 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-muted overflow-hidden border border-border flex items-center justify-center flex-shrink-0">
                        {item.primaryImage || (item.images && item.images[0]) ? (
                          <img
                            src={item.primaryImage || item.images![0]}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon name="CubeIcon" size={20} className="text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-3xs text-muted-foreground">
                            {item.sku}
                          </span>
                          {item.store === 'All Locations' ? (
                            <span className="badge-info text-3xs font-mono">
                              All Stores · {item.qtyOnHand} units
                            </span>
                          ) : (
                            <span className="badge-info text-3xs font-mono">{item.store}</span>
                          )}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStoreStockItem(item);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-bold text-primary hover:text-primary-focus bg-primary/10 border border-primary/20 transition-all ml-auto cursor-pointer"
                              title="View store-wise stock allocation"
                            >
                              <Icon name="BuildingStorefrontIcon" size={11} />
                              View Stores
                            </button>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-foreground truncate mt-0.5">
                          {item.name}
                        </h4>
                        <p className="text-2xs text-muted-foreground">
                          {item.brand} · {item.category}
                        </p>
                      </div>
                    </div>

                    <StockStatusBadge variant={stockStatus.variant} label={stockStatus.label} />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                    <span className="text-2xs text-muted-foreground">
                      Stock:{' '}
                      <strong className="text-foreground font-tabular">
                        {item.qtyOnHand} units
                      </strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold font-tabular text-sm text-foreground">
                        ₹{item.sellingPrice.toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMobileActionItem(item)}
                        className="btn-secondary py-1.5 px-3 text-xs font-bold gap-1 min-h-[36px] cursor-pointer"
                      >
                        <Icon name="EllipsisVerticalIcon" size={16} />
                        <span>Actions</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Inventory Table (>=md) */}
        <div className="hidden md:block overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted">
                {/* Checkbox */}
                <th className="w-10 px-4 py-3 sticky left-0 z-20 bg-muted">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && selectedIds.size === paginated.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 accent-primary rounded"
                    aria-label="Select all rows"
                  />
                </th>

                {visibleColumns.map((col) => (
                  <th
                    key={`th-${col.key}`}
                    className={`table-header ${
                      col.key === 'sku'
                        ? 'min-w-[130px] whitespace-nowrap sticky left-10 z-20 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]'
                        : ''
                    }`}
                    onClick={() => handleSort(col.key as SortKey)}
                  >
                    <span className="flex items-center gap-1.5 cursor-pointer select-none">
                      {col.label}
                      <SortIcon colKey={col.key} />
                    </span>
                  </th>
                ))}

                {/* Actions col */}
                <th className="table-header w-28 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2}>
                    <EmptyState
                      icon="CubeIcon"
                      title="No inventory items found"
                      description="No items match your current filters. Try adjusting the search or filter criteria, or add a new item to get started."
                      actionLabel="Add Item"
                      onAction={() => setAddModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((item) => {
                  const stockStatus = getStockStatus(item);
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={`row-${item.id}-${item.store}`}
                      className={`table-row group ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      {/* Checkbox */}
                      <td
                        className={`px-4 py-3.5 sticky left-0 z-10 ${isSelected ? 'bg-primary/10' : 'bg-card group-hover:bg-muted/40'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(item.id)}
                          className="w-4 h-4 accent-primary rounded"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>

                      {/* Dynamic columns */}
                      {visibleColumns.map((col) => {
                        const val = item[col.key as keyof InventoryItem];

                        if (col.key === 'sku')
                          return (
                            <td
                              key={`cell-${item.id}-sku`}
                              className={`table-cell min-w-[130px] whitespace-nowrap sticky left-10 z-10 ${
                                isSelected ? 'bg-primary/10' : 'bg-card group-hover:bg-muted/40'
                              } border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]`}
                            >
                              <div>
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {item.sku}
                                </span>
                                <p className="text-2xs text-muted-foreground mt-0.5">
                                  {item.barcode}
                                </p>
                              </div>
                            </td>
                          );

                        if (col.key === 'name')
                          return (
                            <td
                              key={`cell-${item.id}-name`}
                              className="table-cell max-w-[240px]"
                            >
                              <div className="flex items-center gap-2.5">
                                {item.primaryImage ||
                                (item.images && item.images[0]) ||
                                item.imageUrl ? (
                                  <img
                                    src={
                                      item.primaryImage ||
                                      (item.images && item.images[0]) ||
                                      item.imageUrl
                                    }
                                    alt={item.name}
                                    className="w-8 h-8 rounded-lg object-cover border border-border flex-shrink-0"
                                  />
                                ) : (
                                  <span
                                    className="badge-warning text-3xs px-1.5 py-0.5 rounded font-bold whitespace-nowrap"
                                    title="Click edit to upload image"
                                  >
                                    Image Missing
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p
                                    onClick={() => setViewItem(item)}
                                    className="text-sm font-medium text-foreground hover:text-primary cursor-pointer truncate"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </p>
                                  <p className="text-2xs text-muted-foreground mt-0.5">
                                    {item.subcategory}
                                  </p>
                                </div>
                              </div>
                            </td>
                          );

                        if (col.key === 'qtyOnHand')
                          return (
                            <td key={`cell-${item.id}-qty`} className="table-cell">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-tabular font-semibold text-sm ${item.qtyOnHand === 0 ? 'text-danger' : item.qtyOnHand <= item.reorderPt ? 'text-warning' : 'text-foreground'}`}
                                >
                                  {item.qtyOnHand}
                                </span>
                                {item.qtyOnHand <= item.reorderPt && item.qtyOnHand > 0 && (
                                  <Icon
                                    name="ExclamationTriangleIcon"
                                    size={12}
                                    className="text-warning"
                                  />
                                )}
                                {item.qtyOnHand === 0 && (
                                  <Icon name="XCircleIcon" size={12} className="text-danger" />
                                )}
                              </div>
                            </td>
                          );

                        if (col.key === 'costPrice')
                          return (
                            <td key={`cell-${item.id}-cost`} className="table-cell">
                              <span className="font-tabular text-sm">
                                ₹{item.costPrice.toLocaleString('en-IN')}
                              </span>
                            </td>
                          );

                        if (col.key === 'sellingPrice')
                          return (
                            <td key={`cell-${item.id}-sell`} className="table-cell">
                              <span className="font-tabular text-sm font-medium">
                                ₹{item.sellingPrice.toLocaleString('en-IN')}
                              </span>
                            </td>
                          );

                        if (col.key === 'mrp')
                          return (
                            <td key={`cell-${item.id}-mrp`} className="table-cell">
                              <span className="font-tabular text-sm text-muted-foreground">
                                {item.mrp !== undefined && item.mrp !== null
                                  ? `₹${item.mrp.toLocaleString('en-IN')}`
                                  : '—'}
                              </span>
                            </td>
                          );

                        if (col.key === 'taxRate')
                          return (
                            <td key={`cell-${item.id}-tax`} className="table-cell">
                              <span className="font-tabular text-sm">{item.taxRate}%</span>
                            </td>
                          );

                        if (col.key === 'fifoLots')
                          return (
                            <td key={`cell-${item.id}-fifo`} className="table-cell">
                              <span
                                className={`font-tabular text-sm ${item.fifoLots === 0 ? 'text-muted-foreground' : 'text-foreground'}`}
                              >
                                {item.fifoLots} lot{item.fifoLots !== 1 ? 's' : ''}
                              </span>
                            </td>
                          );

                        if (col.key === 'store')
                          return (
                            <td key={`cell-${item.id}-store`} className="table-cell">
                              {item.store === 'All Locations' ? (
                                <div className="flex flex-col items-start gap-1 py-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="badge-info text-2xs font-semibold">
                                      All Stores
                                    </span>
                                    <span className="text-xs font-bold text-foreground font-tabular">
                                      {item.qtyOnHand} {item.qtyOnHand === 1 ? 'unit' : 'units'}
                                    </span>
                                  </div>
                                  {isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setStoreStockItem(item);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold text-primary hover:text-primary-focus bg-primary/10 hover:bg-primary/20 border border-primary/25 transition-all duration-150 active:scale-95 cursor-pointer"
                                      title={`View real-time stock across all stores for ${item.name}`}
                                    >
                                      <Icon name="BuildingStorefrontIcon" size={12} />
                                      View All Stores
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-start gap-1 py-0.5">
                                  <span className="badge-info text-2xs font-semibold">
                                    {item.store}
                                  </span>
                                  {isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setStoreStockItem(item);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold text-muted-foreground hover:text-primary bg-muted/60 hover:bg-muted border border-border transition-all duration-150 active:scale-95 cursor-pointer"
                                      title={`Check stock at other stores for ${item.name}`}
                                    >
                                      <Icon name="BuildingStorefrontIcon" size={11} />
                                      View All Stores
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          );

                        if (col.key === 'status')
                          return (
                            <td key={`cell-${item.id}-status`} className="table-cell relative">
                              <button
                                onClick={() =>
                                  setStatusDropdownId(statusDropdownId === item.id ? null : item.id)
                                }
                                className="flex items-center gap-1 group"
                                aria-label={`Change status for ${item.name}`}
                              >
                                <StatusBadge
                                  variant={stockStatus.variant}
                                  label={stockStatus.label}
                                  dot
                                />
                                <Icon
                                  name="ChevronDownIcon"
                                  size={10}
                                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                />
                              </button>
                              {statusDropdownId === item.id && (
                                <div className="absolute left-0 top-full mt-1 w-40 bg-card border border-border rounded-xl shadow-modal z-30 py-1 fade-in">
                                  {(['active', 'inactive', 'discontinued'] as const).map((s) => (
                                    <button
                                      key={`status-change-${item.id}-${s}`}
                                      onClick={() => handleStatusChange(item.id, s)}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted capitalize transition-colors duration-100"
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          );

                        return (
                          <td key={`cell-${item.id}-${col.key}`} className="table-cell">
                            <span className="text-sm text-foreground">{String(val)}</span>
                          </td>
                        );
                      })}

                      {/* Actions */}
                      <td className="table-cell text-right pr-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          {isSuperAdmin && (
                            <button
                              onClick={() => setStoreStockItem(item)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all duration-150"
                              title={`View all stores stock for ${item.name}`}
                            >
                              <Icon name="BuildingStorefrontIcon" size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => setAdjustItem(item)}
                            className="p-1.5 rounded-lg hover:bg-warning/10 text-muted-foreground hover:text-warning transition-all duration-150"
                            title={`Adjust stock for ${item.name}`}
                          >
                            <Icon name="AdjustmentsHorizontalIcon" size={15} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all duration-150"
                            title={`Edit ${item.name}`}
                          >
                            <Icon name="PencilSquareIcon" size={15} />
                          </button>
                          <button
                            onClick={() => setViewItem(item)}
                            className="p-1.5 rounded-lg hover:bg-info/10 text-muted-foreground hover:text-info transition-all duration-150"
                            title={`View details for ${item.name}`}
                          >
                            <Icon name="EyeIcon" size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteItemModal(item)}
                            className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-all duration-150"
                            title={`Delete ${item.name}`}
                          >
                            <Icon name="TrashIcon" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {sorted.length > 0 && (
          <div className="px-4 py-3.5 border-t border-border flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Showing{' '}
                <span className="font-semibold text-foreground font-tabular">
                  {(page - 1) * perPage + 1}–{Math.min(page * perPage, sorted.length)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-foreground font-tabular">{sorted.length}</span>{' '}
                items
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Per page:</span>
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input-field py-1 text-sm w-16"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={`perpage-${n}`} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="btn-ghost p-2 disabled:opacity-40"
              >
                <Icon name="ChevronDoubleLeftIcon" size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost p-2 disabled:opacity-40"
              >
                <Icon name="ChevronLeftIcon" size={14} />
              </button>

              <span className="px-3 text-sm font-semibold text-foreground">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost p-2 disabled:opacity-40"
              >
                <Icon name="ChevronRightIcon" size={14} />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="btn-ghost p-2 disabled:opacity-40"
              >
                <Icon name="ChevronDoubleRightIcon" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Master Single Source of Truth Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={Boolean(adjustItem)}
        onClose={() => setAdjustItem(null)}
        item={adjustItem}
        onSuccess={() => setAdjustItem(null)}
      />

      {/* Add / Edit Modal */}
      <AddItemModal
        key={editItem ? `edit-${editItem.id}-${editItem.store}` : 'add-modal'}
        open={addModalOpen || !!editItem}
        onClose={() => {
          setAddModalOpen(false);
          setEditItem(null);
        }}
        editItem={editItem}
      />

      {/* Product Detail Record Modal */}
      <ProductDetailModal item={viewItem} onClose={() => setViewItem(null)} />

      {/* View All Stores Stock Modal */}
      {isSuperAdmin && (
        <StoreStockModal
          open={!!storeStockItem}
          item={storeStockItem}
          onClose={() => setStoreStockItem(null)}
          selectedStoreFilter={selectedStore}
        />
      )}

      {/* Safe Delete / Archive Confirm Modal */}
      {deleteItemModal && (
        <Modal
          open={!!deleteItemModal}
          onClose={() => !deleteLoading && setDeleteItemModal(null)}
          title={`Archive / Delete Product "${deleteItemModal.name}"`}
          subtitle={`SKU: ${deleteItemModal.sku} · Store: ${deleteItemModal.store}`}
          size="md"
        >
          <div className="space-y-4 py-2 text-xs">
            {(() => {
              const hasLedger = inventoryLedger
                ? inventoryLedger.some(
                    (l) => l.productId === deleteItemModal.id || l.sku === deleteItemModal.sku
                  )
                : false;
              const hasSales = sales
                ? sales.some((s) =>
                    s.items.some(
                      (it) => it.itemId === deleteItemModal.id || it.name === deleteItemModal.name
                    )
                  )
                : false;
              const hasHistory = hasLedger || hasSales || deleteItemModal.qtyOnHand > 0;

              return (
                <>
                  <div
                    className={`p-4 rounded-xl border ${hasHistory ? 'bg-warning/10 border-warning/30 text-foreground' : 'bg-muted/40 border-border text-foreground'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon
                        name={hasHistory ? 'ExclamationTriangleIcon' : 'InformationCircleIcon'}
                        size={18}
                        className={
                          hasHistory
                            ? 'text-warning shrink-0 mt-0.5'
                            : 'text-primary shrink-0 mt-0.5'
                        }
                      />
                      <div>
                        <p className="font-bold text-sm">
                          {hasHistory
                            ? 'Product Has Stock / Sales History'
                            : 'Unused Product Catalog Entry'}
                        </p>
                        <p className="text-muted-foreground mt-1">
                          {hasHistory
                            ? `This product has existing stock (${deleteItemModal.qtyOnHand} units) or historical sales/movement transactions. To maintain accounting integrity, it will be safely Archived (hidden from active catalog and POS checkout).`
                            : `This product has 0 inventory movements and 0 sales. You can archive it safely, or permanently delete it.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <button
                      type="button"
                      disabled={deleteLoading}
                      onClick={() => setDeleteItemModal(null)}
                      className="btn-secondary text-xs"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      disabled={deleteLoading}
                      onClick={async () => {
                        await confirmAction({
                          actionType: 'delete',
                          title: `Archive Product "${deleteItemModal.name}"`,
                          subtitle: 'Please review the item details before archiving.',
                          confirmLabel: 'Confirm & Archive Product',
                          variant: 'warning',
                          summaryItems: [
                            {
                              label: 'Product Name',
                              value: deleteItemModal.name,
                              highlighted: true,
                            },
                            { label: 'SKU Code', value: deleteItemModal.sku },
                            { label: 'Store Location', value: deleteItemModal.store },
                            { label: 'Stock On Hand', value: `${deleteItemModal.qtyOnHand} units` },
                            { label: 'Action Mode', value: 'SAFE ARCHIVAL' },
                          ],
                          warningMessage:
                            'Archiving will hide this SKU from the active catalog and POS checkout while preserving historical reports and stock logs.',
                          onConfirm: async () => {
                            await removeInventoryItem(deleteItemModal.id, false);
                            setDeleteItemModal(null);
                          },
                        });
                      }}
                      className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4"
                    >
                      Safe Archive
                    </button>

                    {!hasHistory && currentUser.role === 'Super Admin' && (
                      <button
                        type="button"
                        disabled={deleteLoading}
                        onClick={async () => {
                          await confirmAction({
                            actionType: 'delete',
                            title: `Permanently Delete SKU "${deleteItemModal.name}"`,
                            subtitle:
                              'This will permanently erase the product from database records.',
                            confirmLabel: 'Confirm & Delete Permanently',
                            variant: 'danger',
                            summaryItems: [
                              {
                                label: 'Product Name',
                                value: deleteItemModal.name,
                                highlighted: true,
                              },
                              { label: 'SKU Code', value: deleteItemModal.sku },
                              { label: 'Store Location', value: deleteItemModal.store },
                              { label: 'Action Mode', value: 'PERMANENT RECORD REMOVAL' },
                            ],
                            warningMessage:
                              'Warning: This product has zero inventory and zero sales transactions. Deletion cannot be undone.',
                            onConfirm: async () => {
                              await removeInventoryItem(deleteItemModal.id, true);
                              setDeleteItemModal(null);
                            },
                          });
                        }}
                        className="btn-danger text-xs font-bold px-4"
                      >
                        Permanent Delete
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* Mobile Product Card Actions BottomSheet */}
      {mobileActionItem && (
        <BottomSheet
          open={!!mobileActionItem}
          onClose={() => setMobileActionItem(null)}
          title={`Actions: ${mobileActionItem.name}`}
        >
          <div className="space-y-1.5 p-2">
            <button
              type="button"
              onClick={() => {
                const item = mobileActionItem;
                setMobileActionItem(null);
                setViewItem(item);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted text-sm font-semibold text-foreground min-h-[44px] cursor-pointer"
            >
              <Icon name="EyeIcon" size={18} className="text-info" />
              <span>View Product Details</span>
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  const item = mobileActionItem;
                  setMobileActionItem(null);
                  setStoreStockItem(item);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted text-sm font-semibold text-foreground min-h-[44px] cursor-pointer"
              >
                <Icon name="BuildingStorefrontIcon" size={18} className="text-primary" />
                <span>Store Stock Allocation</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const item = mobileActionItem;
                setMobileActionItem(null);
                setAdjustItem(item);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted text-sm font-semibold text-foreground min-h-[44px] cursor-pointer"
            >
              <Icon name="AdjustmentsHorizontalIcon" size={18} className="text-warning" />
              <span>Adjust Stock Quantity</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const item = mobileActionItem;
                setMobileActionItem(null);
                handleOpenEdit(item);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted text-sm font-semibold text-foreground min-h-[44px] cursor-pointer"
            >
              <Icon name="PencilSquareIcon" size={18} className="text-primary" />
              <span>Edit Product Info</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const item = mobileActionItem;
                setMobileActionItem(null);
                setDeleteItemModal(item);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-danger/10 text-sm font-semibold text-danger min-h-[44px] cursor-pointer"
            >
              <Icon name="TrashIcon" size={18} />
              <span>Archive or Delete Product</span>
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
