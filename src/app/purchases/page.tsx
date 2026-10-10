'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp, PurchaseOrder } from '@/context/AppContext';
import PurchaseOrderFormModal from '@/components/forms/PurchaseOrderFormModal';
import SupplierPaymentModal from '@/components/forms/SupplierPaymentModal';
import ProofViewerModal, { ProofViewerData } from '@/components/ui/ProofViewerModal';
import { getJurisdictionProfile } from '@/lib/localization/jurisdictions';
import { toast } from 'sonner';

export default function PurchasesPage() {
  const {
    purchases,
    vendors,
    inventory,
    addPurchase,
    updatePurchase,
    deletePurchase,
    selectedStore,
    storesList,
    currentUser,
    refreshAllData,
    recordPurchasePayment,
    formatCurrency,
    systemSettings,
    branding,
  } = useApp();

  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';
  const jurProfile = getJurisdictionProfile(countryCode);
  const taxLabel = jurProfile?.taxLabel || 'Tax';
  const dateLocale = jurProfile?.defaultLocale || 'en-US';

  const [createPoModal, setCreatePoModal] = useState(false);
  const [editPoModal, setEditPoModal] = useState<PurchaseOrder | null>(null);
  const [deletePoModal, setDeletePoModal] = useState<PurchaseOrder | null>(null);

  // Payment Recording Modal State (Master Single Source of Truth SupplierPaymentModal)
  const [paymentModalPo, setPaymentModalPo] = useState<PurchaseOrder | null>(null);
  const [proofViewerData, setProofViewerData] = useState<ProofViewerData | null>(null);

  const openPaymentModal = (po: PurchaseOrder) => {
    setPaymentModalPo(po);
  };

  const filteredPurchases =
    currentUser.role !== 'Super Admin'
      ? purchases.filter((p) => p.store === currentUser.store)
      : selectedStore === 'All Stores'
        ? purchases
        : purchases.filter((p) => p.store === selectedStore);

  const openEdit = (po: PurchaseOrder) => {
    if (currentUser.role !== 'Super Admin' && po.store !== currentUser.store) {
      toast.error(
        `Forbidden: You can only view and edit purchase orders belonging to your assigned store (${currentUser.store}).`
      );
      return;
    }
    setEditPoModal(po);
  };

  // Expandable PO items state
  const [expandedPoIds, setExpandedPoIds] = useState<Set<string>>(new Set());

  const togglePoExpand = (id: string) => {
    setExpandedPoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReceiveGrn = async (po: PurchaseOrder) => {
    try {
      await updatePurchase(po.id, { status: 'Received' });
      toast.success(
        `GRN Received! ${po.items?.length || 0} product(s) credited to inventory in ${po.store}.`
      );
      await refreshAllData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive goods');
    }
  };

  return (
    <AppLayout activeRoute="/purchases">
      <div className="space-y-4 md:space-y-6 fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Purchases</h1>
            <p className="page-subtitle">Purchase orders, GRN & supplier fulfillment</p>
          </div>
          <button
            onClick={() => setCreatePoModal(true)}
            className="btn-primary gap-1.5 text-xs flex-shrink-0"
          >
            <Icon name="PlusIcon" size={14} />
            <span className="hidden sm:inline">Create PO</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        {/* Purchase Orders Directory */}
        <div className="card overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <h3 className="section-header">Orders</h3>
            <span className="badge-neutral text-3xs">{filteredPurchases.length}</span>
          </div>

          {/* Mobile PO Cards (<md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredPurchases.map((po) => {
              const isExpanded = expandedPoIds.has(po.id);
              return (
                <div
                  key={`m-po-${po.id}`}
                  className="p-4 space-y-3 bg-card hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{po.poNo}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-3xs font-semibold px-2 py-0.5 rounded ${po.status === 'Received' ? 'bg-positive/10 text-positive' : 'bg-warning/10 text-warning'}`}
                      >
                        {po.status}
                      </span>
                      <span
                        className={`text-3xs font-semibold px-2 py-0.5 rounded ${po.paymentStatus === 'Paid' ? 'bg-positive/10 text-positive' : po.paymentStatus === 'Partial' ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}
                      >
                        {po.paymentStatus === 'Partial'
                          ? `Partial (Rem: ${formatCurrency(po.remainingAmount ?? po.totalAmount - (po.paidAmount || 0))})`
                          : po.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{po.vendorName}</h4>
                      <p className="text-2xs text-muted-foreground mt-0.5">
                        Expected: {po.expectedDate} · Store:{' '}
                        <span className="badge-info text-3xs font-mono">{po.store}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold font-tabular text-foreground block">
                        {formatCurrency(po.totalAmount)}
                      </span>
                      {po.items && po.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => togglePoExpand(po.id)}
                          className="text-3xs font-semibold text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5"
                        >
                          {po.items.length} item{po.items.length > 1 ? 's' : ''}
                          <Icon name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={11} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile Expanded Items List */}
                  {isExpanded && po.items && po.items.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-muted/30 border border-border space-y-1.5 text-2xs">
                      <div className="font-bold text-muted-foreground text-3xs uppercase tracking-wider pb-1 border-b border-border/50">
                        Line Items Breakdown
                      </div>
                      {po.items.map((it, idx) => (
                        <div
                          key={`m-po-it-${idx}`}
                          className="flex items-center justify-between gap-2 py-0.5"
                        >
                          <div className="truncate flex-1">
                            <span className="font-semibold text-foreground">{it.name}</span>
                            {it.sku && (
                              <span className="text-3xs text-muted-foreground font-mono ml-1">
                                ({it.sku})
                              </span>
                            )}
                          </div>
                          <div className="text-right font-tabular shrink-0 text-muted-foreground">
                            {it.qty} × {formatCurrency(it.unitCost)} ={' '}
                            <strong className="text-foreground">
                              {formatCurrency(it.lineTotal || it.qty * it.unitCost)}
                            </strong>
                          </div>
                        </div>
                      ))}

                      {/* Mobile Payment History */}
                      {po.payments && po.payments.length > 0 && (
                        <div className="pt-2 border-t border-border/60 space-y-1">
                          <div className="font-bold text-muted-foreground text-3xs uppercase tracking-wider flex items-center justify-between">
                            <span>Payment History ({po.payments.length})</span>
                            <span className="text-emerald-600 font-bold">
                              Paid: {formatCurrency(po.paidAmount || 0)}
                            </span>
                          </div>
                          {po.payments.map((p: any) => (
                            <div
                              key={`m-pay-${p.id}`}
                              className="flex items-center justify-between text-3xs py-1.5 border-b border-border/30 last:border-0"
                            >
                              <div>
                                <span className="font-mono font-bold text-primary mr-1.5">
                                  {p.voucherNo || 'PV'}
                                </span>
                                <span className="text-muted-foreground">
                                  {new Date(p.paymentDate || p.createdAt).toLocaleDateString(
                                    dateLocale
                                  )}{' '}
                                  · {p.paymentMethod}
                                </span>
                                {p.referenceNo && (
                                  <span className="text-muted-foreground font-mono block text-4xs">
                                    Ref: {p.referenceNo}
                                  </span>
                                )}
                                {p.notes && (
                                  <span className="text-muted-foreground italic block text-4xs">
                                    {p.notes}
                                  </span>
                                )}
                                {p.receiptUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setProofViewerData({
                                        proofUrl: p.receiptUrl,
                                        title: `Payment Proof — Voucher #${p.voucherNo || 'PV'}`,
                                        amount: Number(p.amount),
                                        paymentMethod: p.paymentMethod,
                                        referenceNo: p.referenceNo,
                                        paymentDate: p.paymentDate,
                                        recordedBy: p.recordedBy,
                                        entityName: po.vendorName,
                                        billNo: po.invoiceNo || po.poNo,
                                        notes: p.notes,
                                      })
                                    }
                                    className="mt-0.5 inline-flex items-center gap-1 text-4xs font-bold text-emerald-600 hover:underline"
                                  >
                                    <Icon name="DocumentCheckIcon" size={11} /> View Proof
                                  </button>
                                )}
                              </div>
                              <span className="font-extrabold font-tabular text-emerald-600">
                                {formatCurrency(Number(p.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                    {po.paymentStatus !== 'Paid' && (
                      <button
                        onClick={() => openPaymentModal(po)}
                        className="btn-secondary text-3xs py-1 px-2.5 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                      >
                        <Icon name="BanknotesIcon" size={12} />
                        Record Payment
                      </button>
                    )}
                    {po.status !== 'Received' && (
                      <button
                        onClick={() => handleReceiveGrn(po)}
                        className="btn-primary text-3xs py-1 px-2.5 gap-1"
                        title="Receive Goods Received Note (GRN) & Credit Stock"
                      >
                        <Icon name="CheckIcon" size={12} />
                        Receive GRN
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(po)}
                      className="btn-secondary text-3xs py-1 px-2.5 gap-1"
                    >
                      <Icon name="PencilSquareIcon" size={13} />
                      Edit PO
                    </button>
                    <button
                      onClick={() => setDeletePoModal(po)}
                      className="btn-ghost text-3xs py-1 px-2 text-danger hover:bg-danger/10"
                    >
                      <Icon name="TrashIcon" size={13} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop PO Table (>=md) */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full text-left min-w-[850px]">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-3 w-8 text-center sticky left-0 z-20 bg-card"></th>
                  <th className="px-4 py-3 sticky left-8 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    PO Number
                  </th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Products & Items</th>
                  <th className="px-4 py-3 font-tabular">Subtotal / Tax</th>
                  <th className="px-4 py-3 font-tabular">Grand Total</th>
                  <th className="px-4 py-3">Fulfillment</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Expected Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {filteredPurchases.map((po) => {
                  const isExpanded = expandedPoIds.has(po.id);
                  const itemCount = po.items?.length || 0;

                  return (
                    <React.Fragment key={`po-frag-${po.id}`}>
                      <tr className="table-row">
                        {/* Expand Toggle */}
                        <td className="px-3 py-3 text-center sticky left-0 z-10 bg-card">
                          {itemCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => togglePoExpand(po.id)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title={isExpanded ? 'Collapse items' : 'View line items'}
                            >
                              <Icon
                                name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                                size={14}
                              />
                            </button>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-primary sticky left-8 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          {po.poNo}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{po.vendorName}</td>
                        <td className="px-4 py-3">
                          <span className="badge-info text-3xs font-semibold">{po.store}</span>
                        </td>

                        {/* Multi-product count & summary */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground font-bold text-3xs font-tabular">
                              {itemCount} item{itemCount !== 1 ? 's' : ''}
                            </span>
                            <span
                              className="text-2xs text-muted-foreground truncate max-w-[160px]"
                              title={po.items?.map((i) => i.name).join(', ')}
                            >
                              {po.items?.[0]?.name || 'No items'}
                              {itemCount > 1 ? ` +${itemCount - 1} more` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Subtotal & Tax breakdown */}
                        <td className="px-4 py-3 font-tabular text-2xs text-muted-foreground">
                          <div>Sub: {formatCurrency(po.subtotal ?? po.totalAmount)}</div>
                          {po.taxAmount ? (
                            <div className="text-3xs text-muted-foreground">
                              {taxLabel}: {formatCurrency(po.taxAmount)}
                            </div>
                          ) : null}
                        </td>

                        {/* Grand Total */}
                        <td className="px-4 py-3 font-extrabold font-tabular text-foreground">
                          {formatCurrency(po.totalAmount)}
                        </td>

                        {/* Fulfillment Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`text-3xs font-bold px-2 py-0.5 rounded-full ${po.status === 'Received' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}
                          >
                            {po.status}
                          </span>
                        </td>

                        {/* Payment Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`text-3xs font-bold px-2 py-0.5 rounded-full ${po.paymentStatus === 'Paid' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : po.paymentStatus === 'Partial' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}
                          >
                            {po.paymentStatus === 'Partial'
                              ? `Partial (Rem: ${formatCurrency(po.remainingAmount ?? po.totalAmount - (po.paidAmount || 0))})`
                              : po.paymentStatus}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-2xs text-muted-foreground whitespace-nowrap">
                          {po.expectedDate}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {po.paymentStatus !== 'Paid' && (
                              <button
                                onClick={() => openPaymentModal(po)}
                                className="btn-secondary h-7 text-3xs py-1 px-2.5 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
                                title="Record Payment against PO"
                              >
                                <Icon name="BanknotesIcon" size={12} />
                                Pay
                              </button>
                            )}
                            {po.status !== 'Received' && (
                              <button
                                onClick={() => handleReceiveGrn(po)}
                                className="btn-primary h-7 text-3xs py-1 px-2.5 gap-1"
                                title="Receive Goods Received Note (GRN) & Credit Stock"
                              >
                                <Icon name="CheckIcon" size={12} />
                                Receive GRN
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(po)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit PO"
                            >
                              <Icon name="PencilSquareIcon" size={14} />
                            </button>
                            <button
                              onClick={() => setDeletePoModal(po)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Delete PO"
                            >
                              <Icon name="TrashIcon" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Desktop Expanded Line Items Subtable */}
                      {isExpanded && po.items && po.items.length > 0 && (
                        <tr className="bg-muted/15 border-b border-border/80">
                          <td colSpan={11} className="p-3 pl-12 pr-4">
                            <div className="rounded-lg border border-border bg-card p-3 shadow-xs space-y-2">
                              <div className="flex items-center justify-between text-2xs text-muted-foreground border-b border-border pb-1.5">
                                <span className="font-bold text-foreground uppercase tracking-wider">
                                  PO #{po.poNo} Line Items ({po.items.length})
                                </span>
                                <span>
                                  Destination Hub:{' '}
                                  <strong className="text-foreground">{po.store}</strong>
                                </span>
                              </div>

                              <table className="w-full text-left text-2xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b border-border/40 pb-1">
                                    <th className="py-1">Product Name</th>
                                    <th className="py-1 font-mono">SKU</th>
                                    <th className="py-1 text-center">Qty Ordered</th>
                                    <th className="py-1 text-right">Unit Cost</th>
                                    <th className="py-1 text-center">{taxLabel} Rate</th>
                                    <th className="py-1 text-right">Tax Amount</th>
                                    <th className="py-1 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                  {po.items.map((it, idx) => (
                                    <tr key={`expanded-row-${idx}`} className="hover:bg-muted/30">
                                      <td className="py-1.5 font-medium text-foreground">
                                        {it.name}
                                      </td>
                                      <td className="py-1.5 font-mono text-muted-foreground">
                                        {it.sku || '—'}
                                      </td>
                                      <td className="py-1.5 text-center font-bold font-tabular">
                                        {it.qty}
                                      </td>
                                      <td className="py-1.5 text-right font-tabular">
                                        {formatCurrency(it.unitCost)}
                                      </td>
                                      <td className="py-1.5 text-center">
                                        {it.taxRate ? `${it.taxRate}%` : '0%'}
                                      </td>
                                      <td className="py-1.5 text-right font-tabular text-muted-foreground">
                                        {formatCurrency(it.taxAmount || 0)}
                                      </td>
                                      <td className="py-1.5 text-right font-extrabold font-tabular text-foreground">
                                        {formatCurrency(it.lineTotal || it.qty * it.unitCost)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Verified Payment History Section */}
                              <div className="pt-2 border-t border-border/80 space-y-1.5">
                                <div className="flex items-center justify-between text-2xs">
                                  <span className="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Icon
                                      name="BanknotesIcon"
                                      size={13}
                                      className="text-emerald-600"
                                    />
                                    Payment Transactions History ({po.payments?.length || 0})
                                  </span>
                                  <div className="flex items-center gap-3 text-3xs font-tabular">
                                    <span>
                                      Total Cost: <strong>{formatCurrency(po.totalAmount)}</strong>
                                    </span>
                                    <span>
                                      Already Paid:{' '}
                                      <strong className="text-emerald-600">
                                        {formatCurrency(po.paidAmount || 0)}
                                      </strong>
                                    </span>
                                    <span>
                                      Remaining:{' '}
                                      <strong
                                        className={
                                          (po.remainingAmount ??
                                            po.totalAmount - (po.paidAmount || 0)) > 0
                                            ? 'text-danger'
                                            : 'text-emerald-600'
                                        }
                                      >
                                        {formatCurrency(
                                          po.remainingAmount ??
                                            po.totalAmount - (po.paidAmount || 0)
                                        )}
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                {!po.payments || po.payments.length === 0 ? (
                                  <p className="text-3xs text-muted-foreground italic py-1">
                                    No payment transactions recorded yet. Click &quot;Pay&quot; to
                                    add a payment tranche.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto rounded border border-border/60">
                                    <table className="w-full text-left text-3xs">
                                      <thead>
                                        <tr className="bg-muted/40 text-muted-foreground font-semibold">
                                          <th className="py-1 px-2.5">Voucher #</th>
                                          <th className="py-1 px-2.5">Payment Date</th>
                                          <th className="py-1 px-2.5 text-right">Amount</th>
                                          <th className="py-1 px-2.5">Payment Method</th>
                                          <th className="py-1 px-2.5">Reference</th>
                                          <th className="py-1 px-2.5 text-center">Payment Proof</th>
                                          <th className="py-1 px-2.5">Remarks</th>
                                          <th className="py-1 px-2.5">Recorded By</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/30 font-tabular">
                                        {po.payments.map((p: any) => (
                                          <tr key={`dt-pay-${p.id}`} className="hover:bg-muted/20">
                                            <td className="py-1.5 px-2.5 font-mono font-bold text-primary">
                                              {p.voucherNo || 'PV-LEGACY'}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-muted-foreground">
                                              {new Date(
                                                p.paymentDate || p.createdAt
                                              ).toLocaleDateString(dateLocale)}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right font-extrabold text-emerald-600">
                                              {formatCurrency(Number(p.amount))}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-medium">
                                              {p.paymentMethod}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-mono text-muted-foreground">
                                              {p.referenceNo || '—'}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-center">
                                              {p.receiptUrl ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setProofViewerData({
                                                      proofUrl: p.receiptUrl,
                                                      title: `Payment Proof — Voucher #${p.voucherNo || 'PV'}`,
                                                      amount: Number(p.amount),
                                                      paymentMethod: p.paymentMethod,
                                                      referenceNo: p.referenceNo,
                                                      paymentDate: p.paymentDate,
                                                      recordedBy: p.recordedBy,
                                                      entityName: po.vendorName,
                                                      billNo: po.invoiceNo || po.poNo,
                                                      notes: p.notes,
                                                    })
                                                  }
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-bold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                                                  title="View Attached Payment Proof"
                                                >
                                                  <Icon name="DocumentCheckIcon" size={12} />
                                                  View Proof
                                                </button>
                                              ) : (
                                                <span className="text-3xs text-muted-foreground/60 italic">
                                                  —
                                                </span>
                                              )}
                                            </td>
                                            <td
                                              className="py-1.5 px-2.5 text-muted-foreground max-w-[200px] truncate"
                                              title={p.notes || ''}
                                            >
                                              {p.notes || '—'}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-muted-foreground">
                                              {p.recordedBy || '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reusable Single-Source-of-Truth Purchase Order Form Modal */}
      <PurchaseOrderFormModal
        open={createPoModal || !!editPoModal}
        onClose={() => {
          setCreatePoModal(false);
          setEditPoModal(null);
        }}
        purchase={editPoModal}
      />

      {/* Delete PO Modal */}
      {deletePoModal && (
        <Modal
          open={!!deletePoModal}
          onClose={() => setDeletePoModal(null)}
          title={`Archive / Delete PO ${deletePoModal.poNo}`}
          subtitle={`Supplier: ${deletePoModal.vendorName} · Status: ${deletePoModal.status}`}
          size="md"
        >
          <div className="space-y-4 py-2 text-xs">
            {(() => {
              const isReceived =
                deletePoModal.status === 'Received' ||
                (deletePoModal as any).status === 'Completed';

              return (
                <>
                  <div
                    className={`p-4 rounded-xl border ${isReceived ? 'bg-warning/10 border-warning/30 text-foreground' : 'bg-muted/40 border-border text-foreground'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon
                        name={isReceived ? 'ExclamationTriangleIcon' : 'InformationCircleIcon'}
                        size={18}
                        className={
                          isReceived
                            ? 'text-warning shrink-0 mt-0.5'
                            : 'text-primary shrink-0 mt-0.5'
                        }
                      />
                      <div>
                        <p className="font-bold text-sm">
                          {isReceived
                            ? 'Purchase Order Already Received Into Stock'
                            : 'Draft / Unreceived Purchase Order'}
                        </p>
                        <p className="text-muted-foreground mt-1">
                          {isReceived
                            ? `This purchase order has already been received into central inventory stock. To protect warehouse ledgers and audit records, this PO will be safely Cancelled / Archived.`
                            : `This draft PO has not impacted warehouse stock and can be safely deleted.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <button
                      onClick={() => setDeletePoModal(null)}
                      className="btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deletePurchase(deletePoModal.id);
                        setDeletePoModal(null);
                      }}
                      className={
                        isReceived
                          ? 'btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4'
                          : 'btn-danger text-xs font-bold px-4'
                      }
                    >
                      {isReceived ? 'Cancel & Archive PO' : 'Delete Draft PO'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* Master Single Source of Truth Supplier Payment Modal */}
      <SupplierPaymentModal
        open={Boolean(paymentModalPo)}
        onClose={() => setPaymentModalPo(null)}
        purchase={paymentModalPo}
        onSuccess={() => {
          refreshAllData();
        }}
      />

      {/* Proof Viewer Modal */}
      <ProofViewerModal
        open={!!proofViewerData}
        onClose={() => setProofViewerData(null)}
        data={proofViewerData}
      />
    </AppLayout>
  );
}
