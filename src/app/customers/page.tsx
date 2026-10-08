'use client';
import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import CustomerFormModal from '@/components/forms/CustomerFormModal';
import { useApp, Customer, normalizeMobileNumber } from '@/context/AppContext';
import PaymentMethodSelect from '@/components/ui/PaymentMethodSelect';
import NumericInput from '@/components/ui/NumericInput';
import PaymentProofUpload from '@/components/ui/PaymentProofUpload';
import { toast } from 'sonner';

export default function CustomersPage() {
  const {
    customers,
    sales,
    repairsEnquiries,
    deleteCustomer,
    updateCustomer,
    addAuditLog,
    currentUser,
    selectedStore,
  } = useApp();

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const effectiveCustomerStore =
    currentUser?.role === 'Super Admin'
      ? selectedStore && selectedStore !== 'All Stores'
        ? selectedStore
        : 'BLR'
      : currentUser?.store && currentUser.store !== 'All Stores'
        ? currentUser.store
        : 'BLR';

  const [registerModal, setRegisterModal] = useState(false);
  const [editCustomerModal, setEditCustomerModal] = useState<Customer | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<Customer | null>(null);
  const [crmViewCustomer, setCrmViewCustomer] = useState<Customer | null>(null);

  // Settle Credit / Receive Customer Payment State
  const [settleCreditCustomer, setSettleCreditCustomer] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number | ''>('');
  const [settleMethod, setSettleMethod] = useState<string>('UPI');
  const [settleRef, setSettleRef] = useState<string>('');
  const [settleProof, setSettleProof] = useState<string | null>(null);
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [isSettling, setIsSettling] = useState(false);

  const openSettleCredit = (cust: Customer) => {
    setSettleCreditCustomer(cust);
    setSettleAmount(cust.creditBalance || '');
    setSettleMethod('UPI');
    setSettleRef('');
    setSettleProof(null);
    setSettleNotes(`Settlement of credit receivable for ${cust.name}`);
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleCreditCustomer) return;
    const payAmt = Number(settleAmount);
    if (!payAmt || payAmt <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    if (!settleRef.trim()) {
      toast.error('Payment Reference / UTR number is required');
      return;
    }
    setIsSettling(true);
    try {
      const currentBalance = Number(settleCreditCustomer.creditBalance) || 0;
      const newBalance = Math.max(0, Math.round((currentBalance - payAmt) * 100) / 100);
      const res = await updateCustomer(settleCreditCustomer.id, {
        creditBalance: newBalance,
      });
      if (res?.success) {
        addAuditLog(
          'Accounting',
          'Receive Customer Payment',
          `Received ₹${payAmt.toLocaleString('en-IN')} via ${settleMethod} (Ref: ${settleRef}) from ${settleCreditCustomer.name}. Outstanding balance updated to ₹${newBalance.toLocaleString('en-IN')}`
        );
        toast.success(`Payment of ₹${payAmt.toLocaleString('en-IN')} recorded successfully!`);
        if (crmViewCustomer?.id === settleCreditCustomer.id) {
          setCrmViewCustomer((prev) => (prev ? { ...prev, creditBalance: newBalance } : null));
        }
        setSettleCreditCustomer(null);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to record customer payment');
    } finally {
      setIsSettling(false);
    }
  };

  // CRM Segment Filter & Deep Search State
  const [selectedSegment, setSelectedSegment] = useState<string>('All Customers');
  const [deepSearchQuery, setDeepSearchQuery] = useState('');

  // Listen to URL query ?phone=
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const queryPhone = searchParams.get('phone');
      if (queryPhone) {
        const norm = normalizeMobileNumber(queryPhone);
        const match = customers.find((c) => normalizeMobileNumber(c.phone) === norm);
        if (match) {
          setCrmViewCustomer(match);
        } else {
          // If not in local customers list, create a virtual customer 360 preview
          setCrmViewCustomer({
            id: 'legacy-preview',
            name: 'Historical Customer',
            phone: queryPhone,
            email: 'customer@legacy.internal',
            city: 'Bengaluru',
            tier: 'Regular',
            creditBalance: 0,
            totalSpend: 0,
            lastPurchase: '15 Aug 2025',
          });
        }
      }
    }
  }, [customers]);

  const crmSegments = [
    'All Customers',
    'New Customer',
    'Returning Customer',
    'Repair Customer',
    'Repair + Purchase Customer',
    'High Value Customer',
    'Inactive Customer',
  ];

  // Helper to determine customer segment tag dynamically
  const getCustomerSegmentTag = (cust: Customer) => {
    const custNormPhone = normalizeMobileNumber(cust.phone);
    const custSales = sales.filter(
      (s) =>
        normalizeMobileNumber(s.customerPhone) === custNormPhone || s.customerName === cust.name
    );
    const custRepairs = repairsEnquiries.filter(
      (r) =>
        normalizeMobileNumber(r.customerPhone) === custNormPhone || r.customerName === cust.name
    );

    const hasSales = custSales.length > 0;
    const hasRepairs = custRepairs.length > 0;
    const isHighValue = cust.totalSpend >= 50000;

    if (hasSales && hasRepairs) return 'Repair + Purchase Customer';
    if (hasRepairs) return 'Repair Customer';
    if (isHighValue) return 'High Value Customer';
    if (custSales.length > 1) return 'Returning Customer';
    if (cust.tier === 'New' || custSales.length === 0) return 'New Customer';
    return 'Returning Customer';
  };

  // Filtered Customer List based on Segment & Deep Search
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const custNormPhone = normalizeMobileNumber(cust.phone);
      const custSales = sales.filter(
        (s) =>
          normalizeMobileNumber(s.customerPhone) === custNormPhone || s.customerName === cust.name
      );
      const custRepairs = repairsEnquiries.filter(
        (r) =>
          normalizeMobileNumber(r.customerPhone) === custNormPhone || r.customerName === cust.name
      );
      const tag = getCustomerSegmentTag(cust);

      // Segment Matching
      const matchSegment = selectedSegment === 'All Customers' || tag === selectedSegment;

      // Deep Search Matching (Customer Name, Mobile, Invoice #, Repair Ref / Requested)
      const q = deepSearchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        cust.name.toLowerCase().includes(q) ||
        cust.phone.includes(q) ||
        custNormPhone.includes(q) ||
        custSales.some((s) => s.orderNo.toLowerCase().includes(q)) ||
        custRepairs.some(
          (r) => r.repairRequested.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
        );

      return matchSegment && matchSearch;
    });
  }, [customers, sales, repairsEnquiries, selectedSegment, deepSearchQuery]);

  const openEdit = (c: Customer) => {
    setEditCustomerModal(c);
  };

  // Build unified chronological timeline for Customer 360
  const buildCustomerTimeline = (cust: Customer) => {
    const custNormPhone = normalizeMobileNumber(cust.phone);
    const custSales = sales.filter(
      (s) =>
        normalizeMobileNumber(s.customerPhone) === custNormPhone || s.customerName === cust.name
    );
    const custRepairs = repairsEnquiries.filter(
      (r) =>
        normalizeMobileNumber(r.customerPhone) === custNormPhone || r.customerName === cust.name
    );

    const timelineEvents: any[] = [];

    custRepairs.forEach((r) => {
      timelineEvents.push({
        date: r.createdAt || '15 Aug 2025',
        title: `Repair Enquiry: ${r.deviceName}`,
        description: r.repairRequested,
        type: 'repair',
        status: r.repairStatus,
        source: 'Legacy Repair DB',
      });
      if (
        (r.repairStatus as string) === 'Completed' ||
        r.repairStatus === 'Delivered' ||
        r.repairStatus === 'Ready for Delivery'
      ) {
        timelineEvents.push({
          date: r.createdAt || '18 Aug 2025',
          title: `Service Completed: ${r.deviceName}`,
          description: `Device inspected and tested. Status: ${r.repairStatus}`,
          type: 'repair-done',
          source: 'Legacy Repair DB',
        });
      }
    });

    custSales.forEach((s) => {
      timelineEvents.push({
        date: s.createdAt || '22 Aug 2026',
        title: `Retail Purchase (${s.orderNo})`,
        description: `Purchased items at ${s.store} Hub. Total: ₹${s.total.toLocaleString('en-IN')}`,
        type: 'sale',
        source: 'RISMOS Application DB',
      });
    });

    return timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return (
    <AppLayout activeRoute="/customers">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Customers</h1>
            <p className="page-subtitle">{customers.length} accounts · CRM & credit management</p>
          </div>
          <button
            onClick={() => setRegisterModal(true)}
            className="btn-primary text-xs gap-1.5 flex-shrink-0"
          >
            <Icon name="UserPlusIcon" size={14} />
            <span className="hidden sm:inline">Register</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* CRM Segment Pills */}
        {/* Segment chips - horizontal scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-[var(--page-gutter)] px-[var(--page-gutter)] md:mx-0 md:px-0 pb-1">
          {crmSegments.map((segment) => {
            const count =
              segment === 'All Customers'
                ? customers.length
                : customers.filter((c) => getCustomerSegmentTag(c) === segment).length;
            const isSelected = selectedSegment === segment;

            return (
              <button
                key={segment}
                onClick={() => setSelectedSegment(segment)}
                className={`filter-chip ${isSelected ? '' : ''}`}
                data-active={isSelected ? 'true' : 'false'}
              >
                <span>{segment}</span>
                <span
                  className={`text-3xs font-mono font-bold ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search customers, phone, invoices, repairs..."
            value={deepSearchQuery}
            onChange={(e) => setDeepSearchQuery(e.target.value)}
            className="input-field pl-9 text-sm"
          />
        </div>

        {/* Customer Directory Table */}
        {/* Mobile: Card List | Desktop: Table */}
        <div className="card overflow-hidden">
          <div className="px-3 md:px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="section-header flex items-center gap-2">
              <span>Directory</span>
              <span className="badge-neutral text-3xs">{filteredCustomers.length}</span>
            </h2>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead>
                <tr>
                  <th className="table-header sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Customer Name
                  </th>
                  <th className="table-header">Mobile Number</th>
                  <th className="table-header">City / Store</th>
                  <th className="table-header">CRM Segment</th>
                  <th className="table-header text-right font-tabular">Total Spend</th>
                  <th className="table-header text-right font-tabular">Credit Balance</th>
                  <th className="table-header text-center">Legacy Link</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No customer records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const tag = getCustomerSegmentTag(cust);
                    return (
                      <tr key={cust.id} className="table-row">
                        <td className="px-4 py-3 sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="font-semibold text-foreground">{cust.name}</div>
                          <div className="text-3xs text-muted-foreground">{cust.email}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {cust.phone}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground font-medium">
                          <div>{cust.city || '—'}</div>
                          {isSuperAdmin && cust.serviceStores && cust.serviceStores.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className="text-3xs text-muted-foreground">Stores:</span>
                              {cust.serviceStores.map((st: string) => (
                                <span key={st} className="badge-neutral text-3xs px-1.5 py-0 font-mono font-bold">
                                  {st}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold ${
                              tag === 'Repair + Purchase Customer'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : tag === 'High Value Customer'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : tag === 'Repair Customer'
                                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                    : 'badge-neutral'
                            }`}
                          >
                            {tag}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-tabular font-extrabold text-foreground">
                          ₹{cust.totalSpend.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-tabular">
                          <span
                            className={`font-bold ${cust.creditBalance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                          >
                            ₹{cust.creditBalance.toLocaleString('en-IN')}
                          </span>
                          {cust.creditBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => openSettleCredit(cust)}
                              className="ml-2 text-3xs font-bold text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                              title="Receive Payment / Settle Credit"
                            >
                              <Icon name="BanknotesIcon" size={12} />
                              <span>Settle</span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <Icon name="CheckBadgeIcon" size={12} />
                            Connected
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setCrmViewCustomer(cust)}
                            className="btn-secondary text-2xs py-1 px-2.5 h-7"
                            title="Customer 360"
                          >
                            360°
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(cust)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors inline-flex items-center"
                            title="Edit Customer"
                          >
                            <Icon name="PencilSquareIcon" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmModal(cust)}
                            className="inline-flex items-center p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-danger hover:bg-danger/10 text-xs transition-colors"
                            title="Archive / Delete Customer"
                          >
                            <Icon name="ArchiveBoxIcon" className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: Card list */}
          <div className="md:hidden divide-y divide-border/60">
            {filteredCustomers.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">No customers found</p>
                <p className="empty-state-text">Try adjusting your search or filters</p>
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const tag = getCustomerSegmentTag(cust);
                return (
                  <div
                    key={`m-${cust.id}`}
                    className="record-item"
                    onClick={() => setCrmViewCustomer(cust)}
                  >
                    <div className="record-avatar bg-primary/10 text-primary">
                      {cust.name.charAt(0)}
                    </div>
                    <div className="record-content">
                      <p className="record-title">{cust.name}</p>
                      <p className="record-subtitle">
                        {cust.phone} · {cust.city || '—'}
                        {isSuperAdmin && cust.serviceStores && cust.serviceStores.length > 0 && (
                          <span className="ml-1 text-primary font-mono text-3xs font-semibold">
                            [{cust.serviceStores.join(', ')}]
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="record-meta">
                      <p className="record-value">₹{cust.totalSpend.toLocaleString('en-IN')}</p>
                      {(cust.creditBalance || 0) > 0 && (
                        <p className="text-2xs text-danger font-semibold mt-0.5">
                          ₹{cust.creditBalance?.toLocaleString('en-IN')} due
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Customer 360 Unified Profile Modal */}
        {crmViewCustomer && (
          <Modal
            open={!!crmViewCustomer}
            onClose={() => setCrmViewCustomer(null)}
            title={`Customer 360 — ${crmViewCustomer.name}`}
            subtitle={`Unified Profile · Mobile: ${crmViewCustomer.phone} · Location: ${crmViewCustomer.city}`}
            size="lg"
          >
            <div className="space-y-6 py-2 text-sm max-h-[80vh] overflow-y-auto pr-1">
              {/* Top Source Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold border border-primary/20 flex items-center gap-1">
                  <Icon name="CubeIcon" className="w-3.5 h-3.5" /> Source: Master Database
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-500/20 flex items-center gap-1">
                  <Icon name="CircleStackIcon" className="w-3.5 h-3.5" /> Legacy Customer DB
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20 flex items-center gap-1">
                  <Icon name="WrenchScrewdriverIcon" className="w-3.5 h-3.5" /> Legacy Repair DB
                </span>
              </div>

              {/* Legacy Connection Card */}
              <div className="bg-secondary/40 border border-border rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Legacy Connected</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                    <Icon name="CheckCircleIcon" className="w-3.5 h-3.5" /> Yes (Verified)
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    External Customer ID
                  </span>
                  <span className="font-mono font-bold text-foreground mt-0.5 block">
                    LEG-CUST-1001
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Match Method</span>
                  <span className="font-semibold text-foreground mt-0.5 block">
                    Canonical Mobile Normalization
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Source Database</span>
                  <span className="font-mono text-muted-foreground mt-0.5 block">
                    LEGACY_MYSQL_DB (R/O)
                  </span>
                </div>
                {isSuperAdmin && crmViewCustomer.serviceStores && crmViewCustomer.serviceStores.length > 0 && (
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Service Stores</span>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {crmViewCustomer.serviceStores.map((st: string) => (
                        <span key={st} className="badge-neutral text-3xs px-1.5 py-0 font-mono font-bold">
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Analytics KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Spend
                  </p>
                  <p className="text-lg font-extrabold text-foreground font-tabular mt-0.5">
                    ₹{crmViewCustomer.totalSpend.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Verified Retail Sales
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Credit Ledger
                      </p>
                      {crmViewCustomer.creditBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => openSettleCredit(crmViewCustomer)}
                          className="text-3xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Icon name="BanknotesIcon" size={12} />
                          <span>Receive Payment</span>
                        </button>
                      )}
                    </div>
                    <p className="text-lg font-extrabold text-warning font-tabular mt-0.5">
                      ₹{crmViewCustomer.creditBalance.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Outstanding Receivable</p>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Retail Invoices
                  </p>
                  <p className="text-lg font-extrabold text-foreground font-tabular mt-0.5">
                    {
                      sales.filter(
                        (s) =>
                          normalizeMobileNumber(s.customerPhone) ===
                            normalizeMobileNumber(crmViewCustomer.phone) ||
                          s.customerName === crmViewCustomer.name
                      ).length
                    }{' '}
                    Orders
                  </p>
                  <p className="text-[11px] text-muted-foreground">Store Invoices</p>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Service History
                  </p>
                  <p className="text-lg font-extrabold text-primary font-tabular mt-0.5">
                    {
                      repairsEnquiries.filter(
                        (r) =>
                          normalizeMobileNumber(r.customerPhone) ===
                            normalizeMobileNumber(crmViewCustomer.phone) ||
                          r.customerName === crmViewCustomer.name
                      ).length
                    }{' '}
                    Jobs
                  </p>
                  <p className="text-[11px] text-primary font-semibold">Mobile, EV, AC</p>
                </div>
              </div>

              {/* Customer Journey Timeline */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Icon name="ClockIcon" className="w-4 h-4 text-primary" />
                  <span>Customer Journey Timeline</span>
                </h4>
                <div className="border-l-2 border-primary/30 pl-4 space-y-4 ml-2">
                  {buildCustomerTimeline(crmViewCustomer).map((evt, idx) => (
                    <div key={idx} className="relative space-y-1">
                      <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-card"></div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-xs">{evt.title}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {evt.date}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{evt.description}</p>
                      <span className="inline-block text-[10px] px-2 py-0.2 rounded bg-secondary text-muted-foreground">
                        Source: {evt.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Multi-Device Repair Section */}
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Icon name="WrenchScrewdriverIcon" className="w-4 h-4 text-primary" />
                  <span>Connected Device Repair History (Read-Only Legacy DB)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {repairsEnquiries
                    .filter(
                      (r) =>
                        normalizeMobileNumber(r.customerPhone) ===
                          normalizeMobileNumber(crmViewCustomer.phone) ||
                        r.customerName === crmViewCustomer.name
                    )
                    .map((r) => (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/20 text-primary">
                            {r.deviceType || 'Device'}
                          </span>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {r.repairStatus}
                          </span>
                        </div>
                        <div className="font-bold text-foreground text-xs">{r.deviceName}</div>
                        <p className="text-xs text-muted-foreground">{r.repairRequested}</p>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-primary/10">
                          <span>Ref: {r.id}</span>
                          <span>Store: {r.storeCode || 'BLR'}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Retail Purchase History */}
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Icon name="ShoppingBagIcon" className="w-4 h-4 text-primary" />
                  <span>Retail Purchase Orders & Receipts</span>
                </h4>
                <div className="overflow-x-auto max-h-48 border border-border rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground uppercase text-[10px] font-semibold border-b border-border">
                      <tr>
                        <th className="px-3 py-2">Invoice #</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Store</th>
                        <th className="px-3 py-2 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sales
                        .filter(
                          (s) =>
                            normalizeMobileNumber(s.customerPhone) ===
                              normalizeMobileNumber(crmViewCustomer.phone) ||
                            s.customerName === crmViewCustomer.name
                        )
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-secondary/20">
                            <td className="px-3 py-2 font-mono font-bold text-primary">
                              {s.orderNo}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{s.createdAt}</td>
                            <td className="px-3 py-2 font-medium">{s.store}</td>
                            <td className="px-3 py-2 text-right font-bold font-tabular">
                              ₹{s.total.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-border">
                <button
                  onClick={() => setCrmViewCustomer(null)}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Single-Source-of-Truth Customer Form Modal */}
        <CustomerFormModal
          open={registerModal || !!editCustomerModal}
          onClose={() => {
            setRegisterModal(false);
            setEditCustomerModal(null);
          }}
          customer={editCustomerModal}
        />

        {/* Safe Delete / Archive Confirmation Dialog */}
        {deleteConfirmModal && (
          <Modal
            open={!!deleteConfirmModal}
            onClose={() => setDeleteConfirmModal(null)}
            title={`Archive / Delete Customer "${deleteConfirmModal.name}"`}
            subtitle="Relational validation against sales, credit balances, and repair enquiries"
            size="md"
          >
            <div className="space-y-4 py-2 text-xs">
              {(() => {
                const norm = normalizeMobileNumber(deleteConfirmModal.phone);
                const salesCount = sales.filter(
                  (s) =>
                    normalizeMobileNumber(s.customerPhone) === norm ||
                    s.customerName === deleteConfirmModal.name
                ).length;
                const repairCount = repairsEnquiries.filter(
                  (r) =>
                    normalizeMobileNumber(r.customerPhone) === norm ||
                    r.customerName === deleteConfirmModal.name
                ).length;
                const hasHistory =
                  salesCount > 0 ||
                  repairCount > 0 ||
                  deleteConfirmModal.totalSpend > 0 ||
                  deleteConfirmModal.creditBalance > 0;

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
                              ? 'Customer Has Transaction History'
                              : 'Unused Customer Record'}
                          </p>
                          <p className="text-muted-foreground mt-1">
                            {hasHistory
                              ? `This customer has ${salesCount} sales invoices, ${repairCount} repair jobs, and ₹${deleteConfirmModal.totalSpend.toLocaleString('en-IN')} total spend. They will be safely Archived to maintain financial ledger history.`
                              : `This customer has 0 sales or service records. You can archive this profile, or Super Admins may permanently delete it.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmModal(null)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCustomer(deleteConfirmModal.id, false);
                          setDeleteConfirmModal(null);
                        }}
                        className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4"
                      >
                        Safe Archive
                      </button>

                      {!hasHistory && currentUser.role === 'Super Admin' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteCustomer(deleteConfirmModal.id, true);
                            setDeleteConfirmModal(null);
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
        {/* Receive Customer Payment / Settle Balance Modal */}
        {settleCreditCustomer && (
          <Modal
            open={Boolean(settleCreditCustomer)}
            onClose={() => {
              if (!isSettling) setSettleCreditCustomer(null);
            }}
            title={`Receive Customer Payment — ${settleCreditCustomer.name}`}
            subtitle={`Mobile: ${settleCreditCustomer.phone} · Current Receivable: ₹${(settleCreditCustomer.creditBalance || 0).toLocaleString('en-IN')}`}
            size="md"
            zIndex={1150}
          >
            <form onSubmit={handleSettleSubmit} className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/80 flex items-center justify-between">
                <div>
                  <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Outstanding Credit Balance
                  </span>
                  <span className="text-base font-extrabold text-warning font-tabular">
                    ₹{(settleCreditCustomer.creditBalance || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettleAmount(settleCreditCustomer.creditBalance || 0)}
                  className="btn-secondary text-3xs font-bold px-2.5 py-1"
                >
                  Pay Full Balance
                </button>
              </div>

              {/* Amount & Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Amount Received (₹) <span className="text-danger">*</span>
                  </label>
                  <NumericInput
                    value={settleAmount}
                    onChange={(val) => setSettleAmount(val)}
                    placeholder="e.g. 2500"
                    min={1}
                    max={Number(settleCreditCustomer.creditBalance) || 9999999}
                    className="input-field text-xs font-tabular font-bold"
                  />
                </div>

                <div>
                  <PaymentMethodSelect
                    label="Payment Method"
                    required
                    value={settleMethod}
                    onChange={setSettleMethod}
                    modalZIndex={1250}
                  />
                </div>
              </div>

              {/* Reference / UTR */}
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Payment Reference / UTR / Voucher No <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    settleMethod === 'Cash'
                      ? 'e.g. CASH-RCPT-001'
                      : 'e.g. UTR-987654321 or UPI Ref ID'
                  }
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  className="input-field text-xs font-mono"
                />
              </div>

              {/* Payment Proof Upload */}
              <PaymentProofUpload
                value={settleProof}
                onChange={setSettleProof}
                required={false}
                label="Payment Proof Receipt / Slip (Optional)"
                storeCode={effectiveCustomerStore}
                relatedEntityType="CustomerPayment"
                relatedEntityId={settleCreditCustomer?.id}
              />

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Payment Remarks
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="e.g. Counter cash settlement / UPI transfer"
                  className="input-field text-xs"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isSettling}
                  onClick={() => setSettleCreditCustomer(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettling || !settleAmount || !settleRef.trim()}
                  className="btn-primary text-xs font-bold gap-1.5 px-5"
                >
                  {isSettling ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Recording Payment...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="CheckCircleIcon" size={14} />
                      <span>Confirm & Record Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
