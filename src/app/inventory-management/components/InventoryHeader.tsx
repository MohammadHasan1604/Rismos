'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import AddItemModal from './AddItemModal';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

export default function InventoryHeader() {
  const { inventory, inventoryLedger, selectedStore, branding, formatCurrency, dateLocale } = useApp();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  const handleExport = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['SKU,Name,Brand,Category,Store,QtyOnHand,CostPrice,SellingPrice']
        .concat(
          inventory.map(
            (i) =>
              `${i.sku},"${i.name}",${i.brand},${i.category},${i.store},${i.qtyOnHand},${i.costPrice},${i.sellingPrice}`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventory_export_${selectedStore}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Inventory exported as CSV');
  };

  const activeSKUsCount = React.useMemo(() => {
    if (selectedStore === 'All Stores' || selectedStore === 'ALL') {
      return new Set(inventory.map((i) => i.productId || i.sku)).size;
    }
    return inventory.filter((i) => i.store === selectedStore).length;
  }, [inventory, selectedStore]);

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        {/* Title section */}
        <div className="page-header">
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{branding.appName}</span>
            <Icon name="ChevronRightIcon" size={12} />
            <span className="text-foreground font-medium">Inventory</span>
          </div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">
            {activeSKUsCount}{' '}
            {selectedStore === 'All Stores' ? 'products (all locations)' : 'products'} ·{' '}
            <span className="font-semibold text-foreground">
              {selectedStore === 'All Stores' ? 'All Stores' : selectedStore}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLedgerModalOpen(true)}
            className="btn-outline text-xs gap-1.5 hidden md:inline-flex"
          >
            <Icon name="QueueListIcon" size={14} />
            Ledger ({inventoryLedger.length})
          </button>
          <button
            onClick={handleExport}
            className="btn-ghost btn-icon-sm md:hidden"
            aria-label="Export CSV"
          >
            <Icon name="ArrowUpTrayIcon" size={15} />
          </button>
          <button
            onClick={handleExport}
            className="btn-ghost gap-1.5 text-xs hidden md:inline-flex"
          >
            <Icon name="ArrowUpTrayIcon" size={14} />
            Export CSV
          </button>
          <button onClick={() => setAddModalOpen(true)} className="btn-primary text-xs gap-1.5">
            <Icon name="PlusIcon" size={14} />
            <span className="hidden sm:inline">Add Product</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      <AddItemModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      {/* Complete Movement Ledger Modal */}
      <Modal
        open={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title="Movement Ledger"
        subtitle="Purchases, Transfers, Sales & Adjustments"
        size="lg"
      >
        <div className="space-y-4 py-2">
          {/* Mobile: card list. Desktop: table */}
          <div className="hidden md:block overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-bold uppercase text-muted-foreground">
                  <th className="table-header">Timestamp</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Product / SKU</th>
                  <th className="table-header">Location</th>
                  <th className="table-header text-right">Qty</th>
                  <th className="table-header font-tabular text-right">Unit Value</th>
                  <th className="table-header">Ref / User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-tabular">
                {inventoryLedger.map((entry) => (
                  <tr key={`led-row-${entry.id}`} className="table-row">
                    <td className="table-cell text-3xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString(dateLocale || 'en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="table-cell">
                      <span
                        className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                          entry.movementType === 'PURCHASE'
                            ? 'bg-success/15 text-success'
                            : entry.movementType === 'TRANSFER_IN'
                              ? 'bg-info/15 text-info'
                              : entry.movementType === 'TRANSFER_OUT'
                                ? 'bg-warning/15 text-warning'
                                : entry.movementType === 'SALE'
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {entry.movementType}
                      </span>
                    </td>
                    <td className="table-cell font-semibold text-foreground">
                      {entry.productName}{' '}
                      <span className="text-3xs text-muted-foreground font-mono">
                        ({entry.sku})
                      </span>
                    </td>
                    <td className="table-cell font-bold text-foreground">{entry.storeCode}</td>
                    <td
                      className={`table-cell text-right font-extrabold ${entry.quantity > 0 ? 'text-success' : 'text-danger'}`}
                    >
                      {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                    </td>
                    <td className="table-cell text-right">{formatCurrency(entry.unitCost)}</td>
                    <td className="table-cell text-3xs text-muted-foreground">
                      <p className="font-mono text-foreground">{entry.referenceNo}</p>
                      <p>{entry.createdBy}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: Card list */}
          <div className="md:hidden divide-y divide-border/60 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {inventoryLedger.map((entry) => (
              <div key={`led-card-${entry.id}`} className="py-3 px-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                      entry.movementType === 'PURCHASE'
                        ? 'bg-success/15 text-success'
                        : entry.movementType === 'TRANSFER_IN'
                          ? 'bg-info/15 text-info'
                          : entry.movementType === 'TRANSFER_OUT'
                            ? 'bg-warning/15 text-warning'
                            : entry.movementType === 'SALE'
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {entry.movementType}
                  </span>
                  <span
                    className={`text-sm font-bold font-tabular ${entry.quantity > 0 ? 'text-success' : 'text-danger'}`}
                  >
                    {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate">
                  {entry.productName}
                </p>
                <div className="flex items-center justify-between mt-1 text-2xs text-muted-foreground">
                  <span>
                    {entry.storeCode} · {entry.referenceNo}
                  </span>
                  <span className="font-tabular">{formatCurrency(entry.unitCost)}</span>
                </div>
                <p className="text-3xs text-muted-foreground mt-0.5">
                  {new Date(entry.createdAt).toLocaleString(dateLocale || 'en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {entry.createdBy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
