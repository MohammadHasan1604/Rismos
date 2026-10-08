'use client';
import React, { useState } from 'react';
import { useApp, InventoryItem } from '@/context/AppContext';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/AppIcon';
import StoreStockModal from './StoreStockModal';

interface ProductDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
}

export default function ProductDetailModal({ item, onClose }: ProductDetailModalProps) {
  const { currentUser, formatCurrency } = useApp();
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isSalesManager = currentUser.role === 'Sales Manager';
  const [storeStockOpen, setStoreStockOpen] = useState(false);
  if (!item) return null;

  return (
    <>
      <Modal
        open={!!item}
        onClose={onClose}
        title="Product Master Record"
        subtitle={`${item.sku} · ${item.barcode}`}
        size="md"
      >
        <div className="space-y-5 py-2">
          {/* Title Card */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {item.primaryImage || (item.images && item.images[0]) || item.imageUrl ? (
                <img
                  src={item.primaryImage || (item.images && item.images[0]) || item.imageUrl}
                  alt={item.name}
                  className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="badge-info text-2xs mb-1">{item.brand || 'General'}</span>
                <h3 className="text-base font-bold text-foreground truncate">{item.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {item.category}
                  {item.subcategory ? ` · ${item.subcategory}` : ''}
                </p>
                {item.description && (
                  <p className="text-2xs text-muted-foreground mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            <StatusBadge
              variant={
                item.qtyOnHand === 0
                  ? 'out-of-stock'
                  : item.qtyOnHand <= item.reorderPt
                    ? 'low-stock'
                    : 'active'
              }
              label={
                item.qtyOnHand === 0
                  ? 'Out of Stock'
                  : item.qtyOnHand <= item.reorderPt
                    ? 'Low Stock'
                    : 'Active'
              }
              dot
            />
          </div>

          {/* Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-border bg-card flex flex-col justify-between">
              <div>
                <p className="text-2xs text-muted-foreground uppercase font-semibold">
                  Store Location
                </p>
                <p className="text-sm font-bold text-primary mt-0.5">{item.store}</p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setStoreStockOpen(true)}
                  className="mt-2 inline-flex items-center gap-1 text-3xs font-semibold text-primary hover:underline"
                >
                  <Icon name="BuildingStorefrontIcon" size={11} />
                  View All Stores
                </button>
              )}
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <p className="text-2xs text-muted-foreground uppercase font-semibold">Qty On Hand</p>
              <p
                className={`text-sm font-bold mt-0.5 font-tabular ${item.qtyOnHand === 0 ? 'text-danger' : item.qtyOnHand <= item.reorderPt ? 'text-warning' : 'text-foreground'}`}
              >
                {item.qtyOnHand} units
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <p className="text-2xs text-muted-foreground uppercase font-semibold">
                Reorder Point
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 font-tabular">
                {item.reorderPt} units
              </p>
            </div>

            {!isSalesManager && (
              <div className="p-3 rounded-lg border border-border bg-card">
                <p className="text-2xs text-muted-foreground uppercase font-semibold">Cost Price</p>
                <p className="text-sm font-bold text-foreground mt-0.5 font-tabular">
                  {formatCurrency(item.costPrice)}
                </p>
              </div>
            )}

            <div className="p-3 rounded-lg border border-border bg-card">
              <p className="text-2xs text-muted-foreground uppercase font-semibold">
                Selling Price
              </p>
              <p className="text-sm font-bold text-success mt-0.5 font-tabular">
                {formatCurrency(item.sellingPrice)}
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card">
              <p className="text-2xs text-muted-foreground uppercase font-semibold">MRP</p>
              <p className="text-sm font-bold text-muted-foreground mt-0.5 font-tabular">
                {item.mrp !== undefined && item.mrp !== null
                  ? formatCurrency(item.mrp)
                  : '—'}
              </p>
            </div>
          </div>

          {/* HSN & Tax */}
          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">HSN Code:</span>
              <span className="font-mono font-semibold text-foreground">{item.hsn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST Tax Rate:</span>
              <span className="font-semibold text-foreground">{item.taxRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FIFO Active Batches:</span>
              <span className="font-semibold text-foreground">
                {item.fifoLots} Lot{item.fifoLots !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Audit Movement:</span>
              <span className="text-muted-foreground">{item.lastMovement}</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="btn-secondary text-sm">
              Close Record
            </button>
          </div>
        </div>
      </Modal>

      {isSuperAdmin && (
        <StoreStockModal
          open={storeStockOpen}
          onClose={() => setStoreStockOpen(false)}
          item={item}
          selectedStoreFilter={item.store}
        />
      )}
    </>
  );
}
