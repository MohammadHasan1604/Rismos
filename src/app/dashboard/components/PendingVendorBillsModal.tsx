'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import Link from 'next/link';
import { useApp, PurchaseOrder } from '@/context/AppContext';
import SupplierPaymentModal from '@/components/forms/SupplierPaymentModal';
import { toast } from 'sonner';

interface PendingVendorBillsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PendingVendorBillsModal({ open, onClose }: PendingVendorBillsModalProps) {
  const {
    purchases,
    vendors,
    selectedStore,
    datePeriod,
    recordPurchasePayment,
    refreshAllData,
    formatCurrency,
    dateLocale,
  } = useApp();

  // Fresh authoritative sync whenever modal opens
  React.useEffect(() => {
    if (open && refreshAllData) {
      refreshAllData();
    }
  }, [open, refreshAllData]);

  // Payment dialog state (Master Single Source of Truth SupplierPaymentModal)
  const [selectedPoForPay, setSelectedPoForPay] = useState<PurchaseOrder | null>(null);

  // Authoritative pending bills in current store scope
  const pendingBills = purchases.filter((p) => {
    const matchStore = selectedStore === 'All Stores' || p.store === selectedStore;
    const isNotCancelled = p.status !== 'Cancelled' && p.status !== 'Archived';
    const isUnpaid = p.paymentStatus !== 'Paid';
    const rem =
      p.remainingAmount !== undefined
        ? p.remainingAmount
        : p.totalAmount - (p.paidAmount || 0) - (p.creditAmount || 0);
    return matchStore && isNotCancelled && isUnpaid && rem > 0.005;
  });

  const totalOutstanding = pendingBills.reduce((acc, p) => {
    const rem =
      p.remainingAmount !== undefined
        ? p.remainingAmount
        : Math.max(0, p.totalAmount - (p.paidAmount || 0) - (p.creditAmount || 0));
    return acc + rem;
  }, 0);

  const openPayDialog = (po: PurchaseOrder) => {
    setSelectedPoForPay(po);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Pending Vendor Bills & Payables"
        subtitle={`Authoritative outstanding bills for ${selectedStore === 'All Stores' ? 'All Outlets (Consolidated)' : selectedStore}`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Header Summary Banner */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Total Outstanding Payables
              </p>
              <p className="text-2xl font-bold text-foreground font-tabular mt-0.5">
                {formatCurrency(totalOutstanding)}
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                {pendingBills.length} pending bill{pendingBills.length === 1 ? '' : 's'} across{' '}
                {selectedStore}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1">
                <Icon name="MapPinIcon" size={12} />
                {selectedStore}
              </span>
              <Link
                href={`/purchases?paymentStatus=pending`}
                onClick={onClose}
                className="btn-secondary text-xs px-3 py-1.5 gap-1"
              >
                View in Purchases
                <Icon name="ArrowTopRightOnSquareIcon" size={13} />
              </Link>
            </div>
          </div>

          {/* Bills List */}
          {pendingBills.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-positive/10 text-positive flex items-center justify-center mx-auto mb-3">
                <Icon name="CheckCircleIcon" size={24} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No Pending Bills</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                All purchase orders and supplier bills under {selectedStore} are fully paid and
                settled. No outstanding vendor liabilities exist.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin">
              {pendingBills.map((po) => {
                const vendorInfo = vendors.find(
                  (v) =>
                    v.id === po.vendorId || v.name.toLowerCase() === po.vendorName?.toLowerCase()
                );
                const remaining =
                  po.remainingAmount !== undefined
                    ? po.remainingAmount
                    : Math.max(0, po.totalAmount - (po.paidAmount || 0) - (po.creditAmount || 0));
                const paid = po.paidAmount || 0;

                return (
                  <div
                    key={`pending-bill-${po.id}`}
                    className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-foreground font-mono">
                          {po.invoiceNo || po.poNo}
                        </span>
                        {po.invoiceNo && po.invoiceNo !== po.poNo && (
                          <span className="text-3xs text-muted-foreground font-mono">
                            ({po.poNo})
                          </span>
                        )}
                        <StatusBadge
                          variant={po.paymentStatus === 'Partial' ? 'warning' : 'danger'}
                          label={po.paymentStatus || 'Unpaid'}
                        />
                        <span className="text-3xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">
                          Store: {po.store}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-foreground truncate">
                          {po.vendorName}
                        </span>
                        {vendorInfo?.phone && (
                          <span className="text-muted-foreground text-3xs">
                            · {vendorInfo.phone}
                          </span>
                        )}
                        {vendorInfo?.city && (
                          <span className="text-muted-foreground text-3xs">
                            · {vendorInfo.city}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-3xs text-muted-foreground">
                        <span>
                          Ordered:{' '}
                          {po.createdAt
                            ? new Date(po.createdAt).toLocaleDateString(dateLocale || 'en-IN')
                            : 'N/A'}
                        </span>
                        {po.expectedDate && <span>Expected: {po.expectedDate}</span>}
                        <span>Items: {po.items?.length || 0} SKUs</span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 flex-shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Outstanding Payable</p>
                        <p className="text-base font-bold text-danger font-tabular">
                          {formatCurrency(remaining)}
                        </p>
                        {paid > 0 && (
                          <p className="text-3xs text-muted-foreground">
                            Paid: {formatCurrency(paid)} / Total: {formatCurrency(po.totalAmount)}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => openPayDialog(po)}
                        className="btn-primary text-xs py-1.5 px-3 gap-1.5"
                      >
                        <Icon name="BanknotesIcon" size={13} />
                        Pay Bill
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <p className="text-2xs text-muted-foreground">
              Direct source-of-truth database ledger query
            </p>
            <button onClick={onClose} className="btn-secondary text-xs px-4 py-1.5">
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Master Single Source of Truth Supplier Payment Modal */}
      <SupplierPaymentModal
        open={Boolean(selectedPoForPay)}
        onClose={() => setSelectedPoForPay(null)}
        purchase={selectedPoForPay}
        onSuccess={() => {
          setSelectedPoForPay(null);
          refreshAllData();
        }}
        zIndex={110}
      />
    </>
  );
}
