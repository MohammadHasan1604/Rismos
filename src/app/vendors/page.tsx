'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp, Vendor, PurchaseOrder } from '@/context/AppContext';
import VendorFormModal from '@/components/forms/VendorFormModal';
import SupplierPaymentModal from '@/components/forms/SupplierPaymentModal';
import ProofViewerModal, { ProofViewerData } from '@/components/ui/ProofViewerModal';
import { toast } from 'sonner';
import { validateAndNormalizeGstin } from '@/lib/gstUtils';
import { VendorBillsBreakdownModal } from './components/VendorBillsBreakdownModal';
import { VendorPaymentVoucherModal } from './components/VendorPaymentVoucherModal';
import { DeleteVendorModal } from './components/DeleteVendorModal';

export default function VendorsPage() {
  const {
    vendors,
    addVendor,
    updateVendor,
    deleteVendor,
    purchases,
    recordPurchasePayment,
    refreshAllData,
    currentUser,
    formatCurrency,
    dateLocale,
    systemSettings,
    branding,
  } = useApp();

  const countryCode =
    systemSettings?.countryCode || branding?.countryCode || 'IN';
  const taxIdLabel =
    countryCode === 'IN'
      ? 'GSTIN'
      : countryCode === 'AE'
        ? 'TRN'
        : countryCode === 'GB' || countryCode === 'SA'
          ? 'VAT'
          : 'Tax ID';

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterPayableOnly, setFilterPayableOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Vendor Onboarding / Edit / Delete modals
  const [onboardModal, setOnboardModal] = useState(false);
  const [editVendorModal, setEditVendorModal] = useState<Vendor | null>(null);
  const [deleteVendorModal, setDeleteVendorModal] = useState<Vendor | null>(null);

  // Drill-Down: Vendor Payables & Bills Drawer/Modal
  const [selectedVendorForBills, setSelectedVendorForBills] = useState<Vendor | null>(null);

  // Pay Now Modal State (Master Single Source of Truth SupplierPaymentModal)
  const [payModalPo, setPayModalPo] = useState<any | null>(null);

  // Printable Receipt Voucher State & Proof Viewer
  const [receiptVoucherModal, setReceiptVoucherModal] = useState<any | null>(null);
  const [proofViewerData, setProofViewerData] = useState<ProofViewerData | null>(null);

  // Synchronize authoritative vendor payables directly from DB records
  // Formula: Outstanding Balance = Total Bill - Valid Payments - Credits
  const vendorFinancials = useMemo(() => {
    const map: Record<
      string,
      {
        totalBilled: number;
        totalPaid: number;
        totalCredits: number;
        outstanding: number;
        unpaidCount: number;
        overdueCount: number;
        bills: any[];
      }
    > = {};

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Group purchases by vendor
    purchases.forEach((p) => {
      if (p.status === 'Cancelled' || p.status === 'Archived') return;

      const vKey = p.vendorId || p.vendorName?.toLowerCase().trim();
      if (!vKey) return;

      if (!map[vKey]) {
        map[vKey] = {
          totalBilled: 0,
          totalPaid: 0,
          totalCredits: 0,
          outstanding: 0,
          unpaidCount: 0,
          overdueCount: 0,
          bills: [],
        };
      }

      const totalCost = Number(p.totalAmount) || 0;
      const credit = Number(p.creditAmount) || 0;
      const realPaid =
        p.payments?.reduce((sum: number, pay: any) => sum + (Number(pay.amount) || 0), 0) ??
        (Number(p.paidAmount) || 0);
      const balance = Math.max(0, Math.round((totalCost - realPaid - credit) * 100) / 100);

      map[vKey].totalBilled += totalCost;
      map[vKey].totalPaid += realPaid;
      map[vKey].totalCredits += credit;
      map[vKey].outstanding += balance;

      // Overdue calculation
      const effDue = p.dueDate || p.expectedDate;
      let overdueDays = 0;
      let overdueStatus = 'Upcoming';

      if (balance <= 0.005) {
        overdueStatus = 'Settled';
      } else {
        map[vKey].unpaidCount++;
        if (effDue) {
          const dueD = new Date(effDue);
          const dueMidnight = new Date(
            dueD.getFullYear(),
            dueD.getMonth(),
            dueD.getDate()
          ).getTime();
          const diff = Math.round((todayMidnight - dueMidnight) / (1000 * 60 * 60 * 24));
          if (diff > 0) {
            overdueDays = diff;
            overdueStatus = 'Overdue';
            map[vKey].overdueCount++;
          } else if (diff === 0) {
            overdueStatus = 'Due Today';
          }
        }
      }

      map[vKey].bills.push({
        ...p,
        totalCost,
        paidAmount: realPaid,
        creditAmount: credit,
        balance,
        effectiveDueDate: effDue,
        overdueDays,
        overdueStatus,
      });
    });

    return map;
  }, [purchases]);

  // Aggregate enriched vendors
  const enrichedVendors = useMemo(() => {
    return vendors.map((v) => {
      const fin = vendorFinancials[v.id] ||
        vendorFinancials[v.name.toLowerCase().trim()] || {
          totalBilled: v.totalBilledAmount || 0,
          totalPaid: v.totalPaidAmount || 0,
          totalCredits: v.totalCreditsAmount || 0,
          outstanding: v.outstandingPayable || 0,
          unpaidCount: v.unpaidBillsCount || 0,
          overdueCount: v.overdueBillsCount || 0,
          bills: [],
        };

      return {
        ...v,
        totalBilledAmount: fin.totalBilled,
        totalPaidAmount: fin.totalPaid,
        totalCreditsAmount: fin.totalCredits,
        outstandingPayable: fin.outstanding,
        unpaidBillsCount: fin.unpaidCount,
        overdueBillsCount: fin.overdueCount,
        bills: fin.bills,
      };
    });
  }, [vendors, vendorFinancials]);

  // Overall Directory High-Level Metrics
  const summaryMetrics = useMemo(() => {
    const totalVendors = enrichedVendors.length;
    const totalBilled = enrichedVendors.reduce((acc, v) => acc + v.totalBilledAmount, 0);
    const totalPaid = enrichedVendors.reduce((acc, v) => acc + v.totalPaidAmount, 0);
    const totalOutstanding = enrichedVendors.reduce((acc, v) => acc + v.outstandingPayable, 0);
    const totalOverdueBills = enrichedVendors.reduce(
      (acc, v) => acc + (v.overdueBillsCount || 0),
      0
    );
    const totalUnpaidBills = enrichedVendors.reduce((acc, v) => acc + (v.unpaidBillsCount || 0), 0);

    return {
      totalVendors,
      totalBilled,
      totalPaid,
      totalOutstanding,
      totalOverdueBills,
      totalUnpaidBills,
    };
  }, [enrichedVendors]);

  // Filtered vendors
  const filteredVendors = useMemo(() => {
    return enrichedVendors.filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.code.toLowerCase().includes(q) ||
        (v.contactPerson && v.contactPerson.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q)) ||
        (v.gstin && v.gstin.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q));

      const matchCategory = filterCategory === 'All' || v.category === filterCategory;
      const matchPayable = !filterPayableOnly || v.outstandingPayable > 0;

      return matchQuery && matchCategory && matchPayable;
    });
  }, [enrichedVendors, searchQuery, filterCategory, filterPayableOnly]);

  // All distinct categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return Array.from(set).sort();
  }, [vendors]);

  const openEdit = (v: Vendor) => {
    setEditVendorModal(v);
  };

  // Open Pay Now Modal
  const openPayNow = (bill: any) => {
    setPayModalPo(bill);
  };

  // Print voucher
  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <AppLayout activeRoute="/vendors">
      <div className="space-y-4 md:space-y-6 fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Vendors</h1>
            <p className="page-subtitle">Supplier payables, bills & payment processing</p>
          </div>
          <button
            onClick={() => setOnboardModal(true)}
            className="btn-primary gap-1.5 text-xs flex-shrink-0"
          >
            <Icon name="PlusIcon" size={14} />
            <span className="hidden sm:inline">Onboard Supplier</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* High-Level Financial KPI Cards */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-[var(--page-gutter)] px-[var(--page-gutter)] md:mx-0 md:px-0 md:grid md:grid-cols-4 md:gap-3 pb-1 md:pb-0">
          <div className="card p-3 md:p-4 border border-border min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Suppliers
              </span>
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <Icon name="BuildingStorefrontIcon" size={18} />
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground font-tabular mt-1.5">
              {summaryMetrics.totalVendors}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">
              {summaryMetrics.totalUnpaidBills} active bill
              {summaryMetrics.totalUnpaidBills === 1 ? '' : 's'} recorded
            </p>
          </div>

          <div className="card p-3 md:p-4 border border-border min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Procurement Billed
              </span>
              <span className="p-2 rounded-xl bg-info/10 text-info">
                <Icon name="DocumentTextIcon" size={18} />
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground font-tabular mt-1.5">
              {formatCurrency(summaryMetrics.totalBilled)}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">
              Across all verified purchase orders
            </p>
          </div>

          <div className="card p-3 md:p-4 border border-border min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Settled Payments
              </span>
              <span className="p-2 rounded-xl bg-positive/10 text-positive">
                <Icon name="CheckCircleIcon" size={18} />
              </span>
            </div>
            <p className="text-2xl font-extrabold text-positive font-tabular mt-1.5">
              {formatCurrency(summaryMetrics.totalPaid)}
            </p>
            <p className="text-3xs text-muted-foreground mt-1">
              Verified bank, UPI & cash disbursements
            </p>
          </div>

          <div
            className={`card p-4 border transition-all duration-150 cursor-pointer ${
              summaryMetrics.totalOutstanding > 0
                ? 'border-danger/30 bg-danger/5 hover:border-danger/60'
                : 'border-emerald-500/30 bg-emerald-500/5'
            }`}
            onClick={() => setFilterPayableOnly(!filterPayableOnly)}
            title="Click to toggle filter for vendors with outstanding payables"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Net Outstanding Payables
              </span>
              <span
                className={`p-2 rounded-xl ${summaryMetrics.totalOutstanding > 0 ? 'bg-danger/10 text-danger' : 'bg-emerald-500/10 text-emerald-600'}`}
              >
                <Icon name="BanknotesIcon" size={18} />
              </span>
            </div>
            <p
              className={`text-2xl font-extrabold font-tabular mt-1.5 ${summaryMetrics.totalOutstanding > 0 ? 'text-danger' : 'text-emerald-600'}`}
            >
              {formatCurrency(summaryMetrics.totalOutstanding)}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {summaryMetrics.totalOverdueBills > 0 ? (
                <span className="text-3xs font-bold bg-danger/20 text-danger px-1.5 py-0.5 rounded">
                  {summaryMetrics.totalOverdueBills} Overdue
                </span>
              ) : (
                <span className="text-3xs text-emerald-600 font-semibold">✓ No overdue bills</span>
              )}
              <span className="text-3xs text-muted-foreground">· Click to filter</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 max-w-md">
              <Icon
                name="MagnifyingGlassIcon"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search vendor name, ${taxIdLabel}, phone, contact...`}
                className="input-field pl-9 text-xs"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-field text-xs py-2 w-44"
            >
              <option value="All">All Categories</option>
              {categoriesList.map((cat) => (
                <option key={`cat-opt-${cat}`} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => setFilterPayableOnly(!filterPayableOnly)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all flex items-center gap-1.5 ${
                filterPayableOnly
                  ? 'bg-danger/15 text-danger border-danger/40'
                  : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Icon name="ExclamationTriangleIcon" size={14} />
              Unpaid Payables Only
            </button>

            <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/20">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="Grid View"
              >
                <Icon name="Squares2X2Icon" size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                title="Table View"
              >
                <Icon name="Bars3Icon" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Vendors Directory Display */}
        {filteredVendors.length === 0 ? (
          <div className="card p-12 text-center text-muted-foreground">
            <Icon name="BuildingStorefrontIcon" size={40} className="mx-auto mb-2 opacity-30" />
            <h3 className="text-sm font-semibold text-foreground">No Suppliers Found</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Try modifying your search or filter settings, or onboard a new supplier.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.map((v) => {
              const hasPayable = v.outstandingPayable > 0.005;
              const hasOverdue = (v.overdueBillsCount || 0) > 0;

              return (
                <div
                  key={`vend-${v.id}`}
                  className={`card p-5 space-y-4 hover:shadow-card-hover transition-all duration-200 relative group border ${
                    hasOverdue
                      ? 'border-danger/50'
                      : hasPayable
                        ? 'border-border/90'
                        : 'border-border/60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-3xs font-mono font-bold text-muted-foreground">
                          {v.code}
                        </span>
                        {hasOverdue && (
                          <span className="badge-danger text-3xs font-extrabold px-1.5 py-0.2">
                            {v.overdueBillsCount} Overdue
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-foreground mt-0.5">{v.name}</h3>
                      <p className="text-2xs text-muted-foreground">{v.category || 'General'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="badge-warning text-3xs flex items-center gap-1 font-bold">
                        ★ {v.rating || 5.0}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(v)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit Vendor"
                        >
                          <Icon name="PencilSquareIcon" size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteVendorModal(v)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Archive / Delete"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-muted-foreground border-y border-border/60 py-2.5">
                    {v.contactPerson && (
                      <p className="flex items-center gap-1.5">
                        <Icon name="UserIcon" size={13} className="text-muted-foreground/70" />
                        <span className="text-foreground font-medium">{v.contactPerson}</span>
                      </p>
                    )}
                    {v.phone && (
                      <p className="flex items-center gap-1.5 font-mono text-2xs">
                        <Icon name="PhoneIcon" size={13} className="text-muted-foreground/70" />
                        <span>{v.phone}</span>
                      </p>
                    )}
                    {v.gstin && (
                      <p className="flex items-center gap-1.5">
                        <Icon
                          name="DocumentTextIcon"
                          size={13}
                          className="text-muted-foreground/70"
                        />
                        <span>{taxIdLabel}:</span>
                        <span className="font-mono text-primary font-bold text-2xs">{v.gstin}</span>
                      </p>
                    )}
                    {v.paymentTerms && (
                      <p className="text-2xs text-muted-foreground">
                        Terms: <strong className="text-foreground">{v.paymentTerms}</strong> · Lead:{' '}
                        {v.leadTimeDays || 3}d
                      </p>
                    )}
                  </div>

                  {/* Interactive Outstanding Payable Button */}
                  <div
                    onClick={() => {
                      setSelectedVendorForBills(v);
                    }}
                    className={`p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between ${
                      hasPayable
                        ? 'bg-danger/5 hover:bg-danger/10 border-danger/25 text-danger'
                        : 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/25 text-emerald-600'
                    }`}
                    title="Click to view full purchase bills breakdown and record payment"
                  >
                    <div>
                      <span className="text-2xs uppercase tracking-wider font-bold block text-muted-foreground">
                        Outstanding Payable
                      </span>
                      <span className="font-extrabold text-base font-tabular">
                        {formatCurrency(v.outstandingPayable)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-2xs font-semibold">
                      <span>
                        {hasPayable ? `${v.unpaidBillsCount || 0} bills pending` : 'All Settled'}
                      </span>
                      <Icon
                        name="ChevronRightIcon"
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="card overflow-hidden border border-border/80">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left min-w-[850px]">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Code / Supplier
                    </th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Contact & Phone</th>
                    <th className="px-4 py-3">{taxIdLabel}</th>
                    <th className="px-4 py-3">Payment Terms</th>
                    <th className="px-4 py-3 font-tabular text-right">Total Billed</th>
                    <th className="px-4 py-3 font-tabular text-right">Outstanding Payable</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs font-tabular">
                  {filteredVendors.map((v) => {
                    const hasPayable = v.outstandingPayable > 0.005;
                    return (
                      <tr key={`v-row-${v.id}`} className="table-row">
                        <td className="px-4 py-3 sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <span className="font-mono text-3xs font-bold text-muted-foreground block">
                            {v.code}
                          </span>
                          <span className="font-bold text-foreground">{v.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge-neutral text-3xs">{v.category || 'General'}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {v.contactPerson || '—'}
                          </div>
                          <div className="font-mono text-3xs">{v.phone}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-2xs text-primary font-semibold">
                          {v.gstin || '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {v.paymentTerms || 'Net 30'} ({v.leadTimeDays || 3}d)
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {formatCurrency(v.totalBilledAmount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedVendorForBills(v);
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs inline-flex items-center gap-1.5 transition-all ${
                              hasPayable
                                ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30'
                                : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                            }`}
                          >
                            {formatCurrency(v.outstandingPayable)}
                            <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(v)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit"
                            >
                              <Icon name="PencilSquareIcon" size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteVendorModal(v)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Archive / Delete"
                            >
                              <Icon name="TrashIcon" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VENDOR PAYABLES & BILLS BREAKDOWN MODAL                       */}
        {/* ------------------------------------------------------------- */}
        {selectedVendorForBills && (
          <VendorBillsBreakdownModal
            vendor={selectedVendorForBills}
            onClose={() => setSelectedVendorForBills(null)}
            openPayNow={(po) => setPayModalPo(po)}
            setProofViewerData={(proof) => setProofViewerData(proof)}
          />
        )}
        {/* Master Single Source of Truth Supplier Payment Modal */}
        <SupplierPaymentModal
          open={Boolean(payModalPo)}
          onClose={() => setPayModalPo(null)}
          purchase={payModalPo}
          onSuccess={async (_, receiptVoucher) => {
            setPayModalPo(null);
            if (receiptVoucher) {
              setReceiptVoucherModal(receiptVoucher);
            }
            await refreshAllData();
          }}
        />

        {/* ------------------------------------------------------------- */}
        {/* PRINTABLE PAYMENT RECEIPT VOUCHER MODAL                       */}
        {/* ------------------------------------------------------------- */}
        {receiptVoucherModal && (
          <VendorPaymentVoucherModal
            voucher={receiptVoucherModal}
            currentUser={currentUser}
            onClose={() => setReceiptVoucherModal(null)}
            setProofViewerData={(proof) => setProofViewerData(proof)}
          />
        )}

        {/* Reusable Single-Source-of-Truth Vendor Form Modal */}
        <VendorFormModal
          open={onboardModal || !!editVendorModal}
          onClose={() => {
            setOnboardModal(false);
            setEditVendorModal(null);
          }}
          vendor={editVendorModal}
        />

        {/* ------------------------------------------------------------- */}
        {/* DELETE / ARCHIVE CONFIRMATION MODAL                           */}
        {/* ------------------------------------------------------------- */}
        {deleteVendorModal && (
          <DeleteVendorModal
            vendor={deleteVendorModal}
            currentUser={currentUser}
            onClose={() => setDeleteVendorModal(null)}
            onDelete={async (vendorId, permanent, reason) => {
              const res = await deleteVendor(vendorId, permanent, reason);
              if (res?.success) {
                setDeleteVendorModal(null);
              }
              return res;
            }}
          />
        )}

        {/* Reusable Proof Viewer Modal */}
        <ProofViewerModal
          open={!!proofViewerData}
          onClose={() => setProofViewerData(null)}
          data={proofViewerData}
        />
      </div>
    </AppLayout>
  );
}
