'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import { InventoryItem, useApp } from '@/context/AppContext';

export interface StoreStockItem {
  storeId: string;
  storeCode: string;
  storeName: string;
  displayName: string;
  city: string;
  address?: string;
  phone?: string;
  qtyOnHand: number;
  qtyReserved: number;
  reorderPt: number;
  shelfLoc?: string | null;
  status: string;
  inStock: boolean;
  isLowStock: boolean;
  updatedAt?: string | null;
}

interface StoreStockModalProps {
  open: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  selectedStoreFilter?: string;
}

export default function StoreStockModal({
  open,
  onClose,
  item,
  selectedStoreFilter,
}: StoreStockModalProps) {
  const { storesList, currentUser } = useApp();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stores, setStores] = useState<StoreStockItem[]>([]);
  const [totalStock, setTotalStock] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch real-time authoritative stock from the database
  const fetchLiveStoreStock = useCallback(
    async (isSilent = false) => {
      if (!item) return;

      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const param = item.sku
          ? `sku=${encodeURIComponent(item.sku)}`
          : `productId=${encodeURIComponent(item.productId || item.id)}`;
        const res = await fetch(`/api/inventory/store-stock?${param}`, {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.stores)) {
          setStores(data.stores);
          setTotalStock(typeof data.totalStock === 'number' ? data.totalStock : 0);
          setLastUpdated(new Date());
        } else {
          throw new Error(data.error || 'Invalid store stock response');
        }
      } catch (err: any) {
        console.warn('Failed to fetch real-time store stock from DB:', err);
        setError('Could not fetch real-time stock from database. Showing cached records.');

        // Fallback: Populate from existing storesList & item.locationStock if network fails
        const isSuperAdmin = currentUser.role === 'Super Admin';
        const assignedStore = currentUser.store || 'BLR';
        const authorizedStoresList = isSuperAdmin
          ? storesList.filter((s) => s.status === 'Active')
          : storesList.filter((s) => s.code.toUpperCase() === assignedStore.toUpperCase());

        const fallbackStores: StoreStockItem[] = authorizedStoresList
          .sort((a, b) =>
            a.code === 'CENTRAL' ? -1 : b.code === 'CENTRAL' ? 1 : a.code.localeCompare(b.code)
          )
          .map((s) => {
            const qty =
              item.locationStock?.[s.code] ?? (item.store === s.code ? item.qtyOnHand : 0);
            const reorderPt = item.reorderPt || 5;
            return {
              storeId: s.id,
              storeCode: s.code,
              storeName: s.name,
              displayName: s.code === 'CENTRAL' ? 'Central' : s.city || s.name,
              city: s.city,
              qtyOnHand: qty,
              qtyReserved: 0,
              reorderPt,
              shelfLoc: null,
              status: s.status,
              inStock: qty > 0,
              isLowStock: qty > 0 && qty <= reorderPt,
            };
          });

        setStores(fallbackStores);
        const fallbackTotal = fallbackStores.reduce((sum, s) => sum + s.qtyOnHand, 0);
        setTotalStock(fallbackTotal);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [item, storesList, currentUser.role, currentUser.store]
  );

  // Trigger load whenever a new item is selected or modal opens
  useEffect(() => {
    if (open && item) {
      setSearchQuery('');
      fetchLiveStoreStock(false);
    } else {
      setStores([]);
      setTotalStock(0);
      setError(null);
    }
  }, [open, item, fetchLiveStoreStock]);

  // Filtered stores based on search input
  const filteredStores = useMemo(() => {
    let list = stores;
    if (currentUser.role !== 'Super Admin') {
      const assigned = currentUser.store || 'BLR';
      list = list.filter((s) => s.storeCode.toUpperCase() === assigned.toUpperCase());
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.storeName.toLowerCase().includes(q) ||
        s.storeCode.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
    );
  }, [stores, searchQuery, currentUser.role, currentUser.store]);

  if (!item) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Store Stock Allocation"
      subtitle={`${item.sku} · ${item.name}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="BuildingStorefrontIcon" size={15} className="text-primary shrink-0" />
            <span>
              Total across active locations:{' '}
              <strong className="text-foreground font-bold font-tabular">{totalStock} units</strong>
            </span>
            {lastUpdated && (
              <span className="hidden sm:inline text-muted-foreground/70">
                · Synced at {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Product Identity Card */}
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-muted overflow-hidden border border-border flex items-center justify-center flex-shrink-0">
              {item.primaryImage || (item.images && item.images[0]) || item.imageUrl ? (
                <AppImage
                  src={(item.primaryImage || (item.images && item.images[0]) || item.imageUrl)!}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon name="CubeIcon" size={22} className="text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-foreground bg-card px-2 py-0.5 rounded border border-border">
                  {item.sku}
                </span>
                {item.barcode && (
                  <span className="text-2xs text-muted-foreground font-mono">
                    UPC: {item.barcode}
                  </span>
                )}
                <span className="badge-info text-3xs font-semibold">{item.brand || 'General'}</span>
              </div>
              <h3 className="text-sm font-bold text-foreground truncate mt-0.5" title={item.name}>
                {item.name}
              </h3>
              <p className="text-2xs text-muted-foreground">
                {item.category} {item.subcategory ? `· ${item.subcategory}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Refresh Button */}
            <button
              type="button"
              onClick={() => fetchLiveStoreStock(true)}
              disabled={loading || refreshing}
              className="btn-secondary text-2xs py-1.5 px-2.5 gap-1.5 font-semibold text-foreground"
              title="Re-query root database for real-time stock"
            >
              <Icon
                name="ArrowPathIcon"
                size={13}
                className={`${refreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
              />
              {refreshing ? 'Syncing...' : 'Refresh'}
            </button>

            {/* Total Stock Pill */}
            <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-right">
              <span className="block text-3xs uppercase tracking-wider font-semibold text-primary">
                Total Stock
              </span>
              <span className="text-sm font-extrabold font-tabular text-primary">
                {totalStock} <span className="text-2xs font-medium">units</span>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Quick Summary Strip: Central — 25 · Bangalore — 25, etc. */}
        {stores.length > 0 && (
          <div className="p-2.5 rounded-lg bg-card border border-border">
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">
              <Icon name="MapPinIcon" size={12} className="text-primary" />
              <span>Location Summary</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stores.map((s) => (
                <div
                  key={`summary-chip-${s.storeCode}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    s.qtyOnHand > 0
                      ? 'bg-muted/60 border-border text-foreground font-medium'
                      : 'bg-muted/20 border-border/60 text-muted-foreground opacity-70'
                  }`}
                >
                  <span className="font-semibold">{s.displayName || s.city || s.storeCode}</span>
                  <span className="text-muted-foreground font-mono">—</span>
                  <span
                    className={`font-mono font-bold ${s.qtyOnHand > 0 ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {s.qtyOnHand}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error banner if database query had issues */}
        {error && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="ExclamationTriangleIcon" size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchLiveStoreStock(false)}
              className="text-2xs underline font-bold hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filter input for scaling with many stores */}
        {stores.length > 2 && (
          <div className="relative">
            <Icon
              name="MagnifyingGlassIcon"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search store name, location, or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-8 py-1.5 text-xs w-full"
            />
          </div>
        )}

        {/* Real-time Store Stock Breakdown Cards */}
        {loading ? (
          <div className="py-10 text-center space-y-3">
            <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground font-medium">
              Querying database for real-time store stock...
            </p>
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            <Icon name="BuildingStorefrontIcon" size={28} className="mx-auto mb-1.5 opacity-40" />
            <p className="text-xs font-semibold">No active store locations found</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
            {filteredStores.map((store) => {
              const isSelectedFilter =
                selectedStoreFilter &&
                selectedStoreFilter !== 'All Stores' &&
                selectedStoreFilter !== 'ALL' &&
                selectedStoreFilter.toUpperCase() === store.storeCode.toUpperCase();

              const stockPercent =
                totalStock > 0
                  ? Math.min(100, Math.round((store.qtyOnHand / totalStock) * 100))
                  : 0;

              return (
                <div
                  key={`store-row-${store.storeCode}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelectedFilter
                      ? 'bg-primary/5 border-primary/40 shadow-sm'
                      : store.qtyOnHand > 0
                        ? 'bg-card border-border hover:border-border/80'
                        : 'bg-muted/15 border-border/70 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Store Title and Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-2xs font-bold px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                          {store.storeCode}
                        </span>
                        <h4 className="text-sm font-bold text-foreground truncate">
                          {store.storeName}
                        </h4>
                        {isSelectedFilter && (
                          <span className="badge-primary text-3xs font-semibold">
                            Active Table Filter
                          </span>
                        )}
                        {store.storeCode === 'CENTRAL' && (
                          <span className="badge-neutral text-3xs font-medium">Central Hub</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-2xs text-muted-foreground mt-1 flex-wrap">
                        <span>
                          City: <strong className="text-foreground">{store.city || 'HQ'}</strong>
                        </span>
                        {store.shelfLoc && (
                          <span>
                            Shelf:{' '}
                            <strong className="text-foreground font-mono">{store.shelfLoc}</strong>
                          </span>
                        )}
                        <span>
                          Reorder Pt:{' '}
                          <strong className="font-tabular text-foreground">
                            {store.reorderPt}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Quantity & Stock Status */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className={`text-base font-extrabold font-tabular ${
                              store.qtyOnHand === 0
                                ? 'text-danger'
                                : store.qtyOnHand <= store.reorderPt
                                  ? 'text-warning'
                                  : 'text-success'
                            }`}
                          >
                            {store.qtyOnHand}
                          </span>
                          <span className="text-2xs text-muted-foreground font-medium">units</span>
                        </div>

                        {/* Status badge */}
                        <div className="mt-0.5">
                          {store.qtyOnHand === 0 ? (
                            <span className="inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-danger" />0 Stock
                            </span>
                          ) : store.qtyOnHand <= store.reorderPt ? (
                            <span className="inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              In Stock
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stock distribution progress bar */}
                  {totalStock > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            store.qtyOnHand === 0
                              ? 'bg-transparent'
                              : store.qtyOnHand <= store.reorderPt
                                ? 'bg-warning'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${stockPercent}%` }}
                        />
                      </div>
                      <span className="text-3xs text-muted-foreground font-mono font-medium shrink-0">
                        {stockPercent}% of network
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
