'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import ProofViewerModal, { PaymentProofData } from '@/components/ui/ProofViewerModal';

import {
  ConsolidatedPnLData,
  StorePnLData,
  CentralPnLData,
  LedgerEntry,
  DrillDownRecord,
} from './components/types';
import { ConsolidatedPnLView } from './components/ConsolidatedPnLView';
import { StorePnLView } from './components/StorePnLView';
import { CentralPnLView } from './components/CentralPnLView';
import { GeneralLedgerView } from './components/GeneralLedgerView';
import { DrillDownModal } from './components/DrillDownModal';
import { ReconciliationAuditModal } from './components/ReconciliationAuditModal';

export default function AccountingPage() {
  const {
    storesList,
    selectedStore,
    setSelectedStore,
    datePeriod,
    setDatePeriod,
    customDateRange,
    currentUser,
  } = useApp();

  // Active view tab (Consolidated is Super Admin only; normal managers default to store view)
  const [activeTab, setActiveTab] = useState<'consolidated' | 'store' | 'central' | 'ledger'>(
    currentUser?.role === 'Super Admin' ? 'consolidated' : 'store'
  );
  const [loading, setLoading] = useState(true);

  // Accounting data states
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedPnLData | null>(null);
  const [storePnLData, setStorePnLData] = useState<StorePnLData | null>(null);
  const [centralPnLData, setCentralPnLData] = useState<CentralPnLData | null>(null);

  // General Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerTotalDebit, setLedgerTotalDebit] = useState(0);
  const [ledgerTotalCredit, setLedgerTotalCredit] = useState(0);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedProof, setSelectedProof] = useState<PaymentProofData | null>(null);

  // Drill-Down Modal State
  const [drillDownModalOpen, setDrillDownModalOpen] = useState(false);
  const [_drillDownMetric, setDrillDownMetric] = useState('');
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [drillDownRecords, setDrillDownRecords] = useState<DrillDownRecord[]>([]);
  const [drillDownTotal, setDrillDownTotal] = useState(0);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownSearch, setDrillDownSearch] = useState('');

  // Reconciliation Audit Modal State
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditData, setAuditData] = useState<any | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Custom Date range pickers
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  // Fetch server-computed accounting data
  const fetchAccountingData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedStore) params.set('store', selectedStore);
      if (datePeriod) params.set('period', datePeriod);
      if (datePeriod === 'Custom Range') {
        if (startDateInput) params.set('startDate', startDateInput);
        else if (customDateRange?.start) params.set('startDate', customDateRange.start);
        if (endDateInput) params.set('endDate', endDateInput);
        else if (customDateRange?.end) params.set('endDate', customDateRange.end);
      }
      params.set('view', 'all');

      const res = await fetch(`/api/accounting?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setConsolidatedData(data.consolidated);
        setStorePnLData(data.storePnL);
        setCentralPnLData(data.centralPnL);
      } else {
        toast.error(data.error || 'Failed to fetch accounting statements');
      }
    } catch (err: any) {
      console.error('Error fetching accounting data:', err);
      toast.error('Network error loading accounting data');
    } finally {
      setLoading(false);
    }
  }, [selectedStore, datePeriod, customDateRange, startDateInput, endDateInput]);

  // Fetch General Ledger entries
  const fetchGeneralLedger = useCallback(async () => {
    try {
      setLedgerLoading(true);
      const params = new URLSearchParams();
      if (selectedStore) params.set('store', selectedStore);
      if (datePeriod && datePeriod !== 'All Time') params.set('period', datePeriod);
      if (ledgerCategoryFilter !== 'ALL') params.set('category', ledgerCategoryFilter);
      if (ledgerSearch.trim()) params.set('search', ledgerSearch.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/accounting/ledger?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLedgerEntries(data.entries || []);
        setLedgerTotalDebit(data.totalDebit || 0);
        setLedgerTotalCredit(data.totalCredit || 0);
        setLedgerTotalCount(data.totalCount || 0);
      }
    } catch (err: any) {
      console.error('Error fetching general ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedStore, datePeriod, ledgerCategoryFilter, ledgerSearch]);

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchGeneralLedger();
    }
  }, [activeTab, fetchGeneralLedger]);

  // Open interactive drill-down modal for any metric
  const handleDrillDown = async (metricKey: string, title: string) => {
    try {
      setDrillDownMetric(metricKey);
      setDrillDownTitle(title);
      setDrillDownSearch('');
      setDrillDownModalOpen(true);
      setDrillDownLoading(true);

      const params = new URLSearchParams();
      params.set('metric', metricKey);
      if (selectedStore) params.set('store', selectedStore);
      if (datePeriod) params.set('period', datePeriod);
      if (datePeriod === 'Custom Range') {
        if (startDateInput) params.set('startDate', startDateInput);
        else if (customDateRange?.start) params.set('startDate', customDateRange.start);
        if (endDateInput) params.set('endDate', endDateInput);
        else if (customDateRange?.end) params.set('endDate', customDateRange.end);
      }

      const res = await fetch(`/api/accounting/drilldown?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.drilldown) {
        setDrillDownRecords(data.drilldown.rows || []);
        setDrillDownTotal(data.drilldown.total || 0);
      } else {
        toast.error('Failed to load drill-down records');
      }
    } catch (err) {
      console.error('Error fetching drill-down:', err);
      toast.error('Network error loading drill-down records');
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Run root reconciliation audit
  const handleRunReconciliationAudit = async () => {
    try {
      setAuditLoading(true);
      setAuditModalOpen(true);
      const res = await fetch('/api/accounting/reconcile', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.audit) {
        setAuditData(data.audit);
        toast.success('Root Financial Reconciliation Verified');
      } else {
        toast.error('Failed to complete financial reconciliation audit');
      }
    } catch (err) {
      console.error('Audit error:', err);
      toast.error('Audit execution error');
    } finally {
      setAuditLoading(false);
    }
  };

  // Filter drilldown rows in modal
  const filteredDrillDownRows = useMemo(() => {
    if (!drillDownSearch.trim()) return drillDownRecords;
    const q = drillDownSearch.toLowerCase();
    return drillDownRecords.filter(
      (r) =>
        r.refNo.toLowerCase().includes(q) ||
        (r.entity && r.entity.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.items && r.items.toLowerCase().includes(q)) ||
        (r.storeCode && r.storeCode.toLowerCase().includes(q))
    );
  }, [drillDownRecords, drillDownSearch]);

  return (
    <AppLayout activeRoute="/accounting">
      <div className="space-y-4 md:space-y-6 fade-in pb-12">
        {/* Header & Global Filters */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Accounting</h1>
            <p className="page-subtitle">P&L, ledger & financial statements</p>
          </div>
        </div>

        <div className="card p-3 md:p-4 space-y-3">
          {/* Action Bar & Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Store Filter (SUPER ADMIN ONLY) */}
            {currentUser.role === 'Super Admin' && (
              <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl border border-border/80">
                <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground pl-2">
                  Store:
                </span>
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="select-field text-xs font-semibold py-1 px-3 h-8 w-auto min-w-[170px]"
                >
                  <option value="All Stores">All Stores (Consolidated)</option>
                  {storesList.map((s) => (
                    <option key={`opt-${s.code}`} value={s.code}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Period Filter */}
            <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl border border-border/80">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground pl-2">
                Period:
              </span>
              <select
                value={datePeriod}
                onChange={(e) => setDatePeriod(e.target.value)}
                className="select-field text-xs font-semibold py-1 px-3 h-8 w-auto min-w-[150px]"
              >
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
                <option value="This Quarter">This Quarter</option>
                <option value="This Year">This Financial Year</option>
                <option value="Custom Range">Custom Date Range</option>
              </select>
            </div>

            {/* Custom Date Pickers */}
            {datePeriod === 'Custom Range' && (
              <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-xl border border-border/80">
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="bg-card text-foreground text-xs py-1 px-2 rounded-lg border border-border/80 h-8"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="bg-card text-foreground text-xs py-1 px-2 rounded-lg border border-border/80 h-8"
                />
              </div>
            )}

            {/* Reconciliation Audit Trigger Button */}
            <button
              onClick={handleRunReconciliationAudit}
              className="h-9 inline-flex items-center gap-2 px-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-[0.98] cursor-pointer"
            >
              <Icon name="CheckCircleIcon" size={15} />
              <span>Audit Reconciliation</span>
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 border-b border-border/80 pb-1.5 overflow-x-auto scrollbar-none">
          {currentUser.role === 'Super Admin' && (
            <button
              onClick={() => setActiveTab('consolidated')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                activeTab === 'consolidated'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon name="BuildingOffice2Icon" size={15} />
              <span>Consolidated Company P&L</span>
              <span className="text-3xs px-1.5 py-0.5 rounded-full bg-primary-foreground/20 font-mono">
                Eliminated
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'store'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon name="BuildingStorefrontIcon" size={15} />
            <span>Store Operational P&L</span>
          </button>

          {currentUser.role === 'Super Admin' && (
            <button
              onClick={() => setActiveTab('central')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                activeTab === 'central'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon name="ArrowTrendingUpIcon" size={15} />
              <span>Central Transfer Profit P&L</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
              activeTab === 'ledger'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon name="BookOpenIcon" size={15} />
            <span>Financial General Ledger</span>
          </button>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="card p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm font-semibold">Aggregating Authoritative P&L Ledger Records...</p>
          </div>
        )}

        {/* 1. CONSOLIDATED COMPANY P&L VIEW */}
        {!loading && activeTab === 'consolidated' && consolidatedData && (
          <ConsolidatedPnLView
            consolidatedData={consolidatedData}
            selectedStore={selectedStore}
            datePeriod={datePeriod}
            handleDrillDown={handleDrillDown}
          />
        )}

        {/* 2. STORE OPERATIONAL P&L VIEW */}
        {!loading && activeTab === 'store' && storePnLData && (
          <StorePnLView storePnLData={storePnLData} handleDrillDown={handleDrillDown} />
        )}

        {/* 3. CENTRAL TRANSFER PROFIT P&L VIEW */}
        {!loading && activeTab === 'central' && centralPnLData && (
          <CentralPnLView centralPnLData={centralPnLData} handleDrillDown={handleDrillDown} />
        )}

        {/* 4. FINANCIAL GENERAL LEDGER VIEW */}
        {activeTab === 'ledger' && (
          <GeneralLedgerView
            ledgerCategoryFilter={ledgerCategoryFilter}
            setLedgerCategoryFilter={setLedgerCategoryFilter}
            ledgerSearch={ledgerSearch}
            setLedgerSearch={setLedgerSearch}
            ledgerTotalDebit={ledgerTotalDebit}
            ledgerTotalCredit={ledgerTotalCredit}
            ledgerTotalCount={ledgerTotalCount}
            ledgerLoading={ledgerLoading}
            ledgerEntries={ledgerEntries}
            onViewProof={(proof) => setSelectedProof(proof)}
          />
        )}

        {/* ─── INTERACTIVE DRILL-DOWN MODAL ─────────────────────────────────── */}
        <DrillDownModal
          open={drillDownModalOpen}
          onClose={() => setDrillDownModalOpen(false)}
          title={drillDownTitle}
          selectedStore={selectedStore}
          datePeriod={datePeriod}
          drillDownTotal={drillDownTotal}
          drillDownSearch={drillDownSearch}
          setDrillDownSearch={setDrillDownSearch}
          drillDownLoading={drillDownLoading}
          filteredDrillDownRows={filteredDrillDownRows}
          totalRecordsCount={drillDownRecords.length}
        />

        {/* ─── RECONCILIATION AUDIT MODAL ───────────────────────────────────── */}
        <ReconciliationAuditModal
          open={auditModalOpen}
          onClose={() => setAuditModalOpen(false)}
          auditLoading={auditLoading}
          auditData={auditData}
        />

        {/* Full-Screen Payment Proof Viewer */}
        <ProofViewerModal proof={selectedProof} onClose={() => setSelectedProof(null)} />
      </div>
    </AppLayout>
  );
}
