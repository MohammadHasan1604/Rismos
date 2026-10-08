import React, { useState, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { Vendor, useApp } from '@/context/AppContext';

interface VendorBillsBreakdownModalProps {
  vendor: any | null;
  onClose: () => void;
  openPayNow: (bill: any) => void;
  setProofViewerData: (data: any) => void;
}

export const VendorBillsBreakdownModal: React.FC<VendorBillsBreakdownModalProps> = ({
  vendor,
  onClose,
  openPayNow,
  setProofViewerData,
}) => {
  const { formatCurrency, dateLocale } = useApp();
  const [billsFilter, setBillsFilter] = useState<'pending' | 'overdue' | 'all'>('pending');
  const [expandedPaymentPoId, setExpandedPaymentPoId] = useState<string | null>(null);

  const selectedVendorBills = useMemo(() => {
    const bills = vendor?.bills || [];
    if (billsFilter === 'pending') {
      return bills.filter((b: any) => b.balance > 0.005);
    }
    if (billsFilter === 'overdue') {
      return bills.filter((b: any) => b.balance > 0.005 && b.overdueStatus === 'Overdue');
    }
    return bills;
  }, [vendor, billsFilter]);

  if (!vendor) return null;

  return (
    <Modal
      open={!!vendor}
      onClose={onClose}
      title={`Outstanding Payables & Bills — ${vendor.name}`}
      subtitle={`Supplier Code: ${vendor.code} · Terms: ${vendor.paymentTerms || 'Net 30'}`}
      size="large-form"
      footer={
        <div className="flex justify-end w-full">
          <button onClick={onClose} className="btn-secondary text-xs cursor-pointer flex-1 sm:flex-initial">
            Close Payables
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Financial Reconciled Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/40 border border-border rounded-xl">
          <div>
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Total Billed
            </span>
            <span className="text-base font-bold text-foreground font-tabular">
              {formatCurrency(vendor.totalBilledAmount || 0)}
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Settled Payments
            </span>
            <span className="text-base font-bold text-emerald-600 font-tabular">
              {formatCurrency(vendor.totalPaidAmount || 0)}
            </span>
          </div>
          <div>
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Vendor Credits
            </span>
            <span className="text-base font-bold text-info font-tabular">
              {formatCurrency(vendor.totalCreditsAmount || 0)}
            </span>
          </div>
          <div className="border-l border-border pl-3">
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Net Balance Due
            </span>
            <span
              className={`text-lg font-extrabold font-tabular ${
                vendor.outstandingPayable > 0 ? 'text-danger' : 'text-emerald-600'
              }`}
            >
              {formatCurrency(vendor.outstandingPayable || 0)}
            </span>
          </div>
        </div>

        {/* Bills Filter Tabs */}
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBillsFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billsFilter === 'pending'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unpaid Bills ({vendor.unpaidBillsCount || 0})
            </button>
            <button
              onClick={() => setBillsFilter('overdue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billsFilter === 'overdue'
                  ? 'bg-danger text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Overdue Bills ({vendor.overdueBillsCount || 0})
            </button>
            <button
              onClick={() => setBillsFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billsFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Purchase Bills ({selectedVendorBills.length})
            </button>
          </div>

          <span className="text-3xs text-muted-foreground hidden sm:inline">
            Formula: Total − Paid − Credits = Balance
          </span>
        </div>

        {/* Bills Listing */}
        {selectedVendorBills.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Icon name="CheckCircleIcon" size={36} className="mx-auto mb-2 text-positive/60" />
            <p className="font-bold text-foreground">No matching purchase bills found</p>
            <p className="text-2xs text-muted-foreground mt-0.5">
              {billsFilter === 'pending'
                ? 'All purchase bills for this vendor are fully paid and settled.'
                : 'No purchase records matching this criteria.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin">
            {selectedVendorBills.map((bill: any) => {
              const isExpanded = expandedPaymentPoId === bill.id;
              const isOverdue = bill.overdueStatus === 'Overdue';
              const isSettled = bill.balance <= 0.005;

              return (
                <div
                  key={`bill-${bill.id}`}
                  className={`rounded-xl border transition-all p-3.5 space-y-2.5 ${
                    isOverdue
                      ? 'border-danger/40 bg-danger/5'
                      : isSettled
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-border bg-card'
                  }`}
                >
                  {/* Bill Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs text-primary">
                        {bill.invoiceNo || bill.poNo}
                      </span>
                      {bill.invoiceNo && bill.invoiceNo !== bill.poNo && (
                        <span className="text-3xs text-muted-foreground font-mono">
                          ({bill.poNo})
                        </span>
                      )}
                      <span className="badge-neutral text-3xs">{bill.store || bill.storeCode}</span>

                      {/* Overdue Badge */}
                      {isOverdue ? (
                        <span className="badge-danger text-3xs font-extrabold flex items-center gap-1">
                          <Icon name="ClockIcon" size={11} />
                          Overdue by {bill.overdueDays} day{bill.overdueDays === 1 ? '' : 's'}
                        </span>
                      ) : bill.overdueStatus === 'Due Today' ? (
                        <span className="badge-warning text-3xs font-extrabold">Due Today</span>
                      ) : isSettled ? (
                        <span className="badge-positive text-3xs font-bold flex items-center gap-1">
                          <Icon name="CheckIcon" size={11} /> Settled
                        </span>
                      ) : (
                        <span className="badge-neutral text-3xs">Pending</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Payment History Toggle */}
                      <button
                        onClick={() => setExpandedPaymentPoId(isExpanded ? null : bill.id)}
                        className="btn-secondary text-3xs py-1 px-2.5 gap-1 cursor-pointer"
                      >
                        <Icon name="DocumentTextIcon" size={12} />
                        {bill.payments?.length || 0} Payment
                        {bill.payments?.length === 1 ? '' : 's'}
                        <Icon
                          name="ChevronDownIcon"
                          size={12}
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {/* Pay Now Button */}
                      {!isSettled && (
                        <button
                          onClick={() => openPayNow(bill)}
                          className="btn-primary text-3xs py-1 px-3 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                        >
                          <Icon name="BanknotesIcon" size={12} />
                          Pay Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bill Financial Breakdown Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-2xs font-tabular pt-1 border-t border-border/70">
                    <div>
                      <span className="text-muted-foreground block">Order Date:</span>
                      <span className="font-semibold text-foreground">
                        {bill.orderDate
                          ? new Date(bill.orderDate).toLocaleDateString(dateLocale || 'en-IN')
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Due Date:</span>
                      <span
                        className={`font-semibold ${isOverdue ? 'text-danger' : 'text-foreground'}`}
                      >
                        {bill.effectiveDueDate
                          ? new Date(bill.effectiveDueDate).toLocaleDateString(dateLocale || 'en-IN')
                          : 'Net 30'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Original Amount:</span>
                      <span className="font-bold text-foreground">
                        {formatCurrency(bill.totalCost)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Paid Amount:</span>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(bill.paidAmount || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-bold">
                        Outstanding Balance:
                      </span>
                      <span
                        className={`font-extrabold text-xs ${bill.balance > 0 ? 'text-danger' : 'text-emerald-600'}`}
                      >
                        {formatCurrency(bill.balance)}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Payment History Table */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-border/70 fade-in space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                          Verified Payment Transactions
                        </span>
                        <span className="text-3xs text-muted-foreground">
                          Source: Real DB Purchase Payments
                        </span>
                      </div>

                      {!bill.payments || bill.payments.length === 0 ? (
                        <p className="text-3xs text-muted-foreground italic py-1">
                          No payment transactions recorded yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto border border-border rounded-lg">
                          <table className="w-full text-left text-3xs">
                            <thead>
                              <tr className="bg-muted text-muted-foreground font-bold uppercase">
                                <th className="px-2.5 py-1.5">Voucher #</th>
                                <th className="px-2.5 py-1.5">Date</th>
                                <th className="px-2.5 py-1.5 font-tabular text-right">Amount</th>
                                <th className="px-2.5 py-1.5">Method</th>
                                <th className="px-2.5 py-1.5">Reference / UTR</th>
                                <th className="px-2.5 py-1.5">Remarks</th>
                                <th className="px-2.5 py-1.5">Recorded By</th>
                                <th className="px-2.5 py-1.5 text-center">Receipt</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border font-tabular">
                              {bill.payments.map((p: any) => (
                                <tr key={`pay-row-${p.id}`} className="hover:bg-muted/20">
                                  <td className="px-2.5 py-1.5 font-mono text-primary font-bold">
                                    {p.voucherNo || 'PV-LEGACY'}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-muted-foreground">
                                    {new Date(p.paymentDate || p.createdAt).toLocaleDateString(
                                      dateLocale || 'en-IN'
                                    )}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right font-extrabold text-emerald-600">
                                    {formatCurrency(Number(p.amount))}
                                  </td>
                                  <td className="px-2.5 py-1.5">{p.paymentMethod}</td>
                                  <td className="px-2.5 py-1.5 font-mono text-muted-foreground">
                                    {p.referenceNo || 'N/A'}
                                  </td>
                                  <td
                                    className="px-2.5 py-1.5 text-muted-foreground max-w-[160px] truncate"
                                    title={p.notes || ''}
                                  >
                                    {p.notes || '—'}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-muted-foreground">
                                    {p.recordedBy}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-center">
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
                                            entityName: vendor?.name,
                                            billNo: bill.invoiceNo || bill.poNo,
                                            notes: p.notes,
                                          })
                                        }
                                        className="text-primary hover:underline font-bold inline-flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <Icon name="DocumentIcon" size={11} /> View Proof
                                      </button>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
};
