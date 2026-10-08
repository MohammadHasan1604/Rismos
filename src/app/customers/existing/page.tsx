'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';

interface LegacyCustomerRow {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  email: string | null;
  city: string;
  firstSeenDate: string;
  repairsCount: number;
  coskoPurchasesCount: number;
  coskoCustomerId: string | null;
  linkStatus: string;
}

const INITIAL_LEGACY_CUSTOMERS: LegacyCustomerRow[] = [
  {
    id: 'LEG-CUST-1001',
    name: 'Ahmed Khan',
    phone: '+91 98765 43210',
    normalizedPhone: '9876543210',
    email: 'ahmed.khan@gmail.com',
    city: 'Bengaluru',
    firstSeenDate: '15 Aug 2025',
    repairsCount: 2,
    coskoPurchasesCount: 1,
    coskoCustomerId: 'cust-ahmed-01',
    linkStatus: 'VERIFIED',
  },
  {
    id: 'LEG-CUST-1002',
    name: 'Priya Sharma',
    phone: '+91 98450 11223',
    normalizedPhone: '9845011223',
    email: 'priya.s@yahoo.co.in',
    city: 'Hyderabad',
    firstSeenDate: '10 Mar 2026',
    repairsCount: 1,
    coskoPurchasesCount: 0,
    coskoCustomerId: null,
    linkStatus: 'AUTO_MATCHED',
  },
  {
    id: 'LEG-CUST-1003',
    name: 'Vikram Mehta',
    phone: '+91 98111 22334',
    normalizedPhone: '9811122334',
    email: 'vikram.m@outlook.com',
    city: 'Delhi',
    firstSeenDate: '02 May 2026',
    repairsCount: 1,
    coskoPurchasesCount: 0,
    coskoCustomerId: null,
    linkStatus: 'AUTO_MATCHED',
  },
  {
    id: 'LEG-CUST-1004',
    name: 'Rajesh Patil',
    phone: '+91 98200 33445',
    normalizedPhone: '9820033445',
    email: 'rajesh.patil@corp.in',
    city: 'Mumbai',
    firstSeenDate: '15 Jul 2026',
    repairsCount: 1,
    coskoPurchasesCount: 0,
    coskoCustomerId: null,
    linkStatus: 'AUTO_MATCHED',
  },
];

export default function ExistingCustomersPage() {
  const { currentUser } = useApp();
  const [customers, setCustomers] = useState<LegacyCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.append('linkStatus', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/customers/legacy/link?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load legacy customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter, searchQuery]);

  const handleLinkAction = async (legacyId: string, action: 'verify' | 'unlink') => {
    try {
      const target = customers.find((c) => c.id === legacyId);
      const res = await fetch('/api/customers/legacy/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legacyCustomerId: legacyId,
          coskoCustomerId: target?.coskoCustomerId || null,
          customerName: target?.name,
          phone: target?.phone,
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(data.message);
        setTimeout(() => setActionSuccessMsg(null), 4000);
        // Optimistically update status in state
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === legacyId
              ? { ...c, linkStatus: action === 'unlink' ? 'UNLINKED' : 'VERIFIED' }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Link action failed:', err);
    }
  };

  const getLinkStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'AUTO_MATCHED':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'UNLINKED':
        return 'bg-secondary text-muted-foreground border-border';
      default:
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
  };

  return (
    <AppLayout activeRoute="/customers">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Connected Legacy Database
              </span>
              <span className="text-xs text-muted-foreground">Historical Bridge Layer</span>
            </div>
            <h1 className="page-title">Existing / Historical Customers</h1>
            <p className="text-sm text-muted-foreground">
              Review, verify, and link legacy customer identities and repair history with the active
              Customer Master.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/customers"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground hover:bg-secondary transition-colors text-sm font-medium shadow-sm"
            >
              <Icon name="UserGroupIcon" className="w-4 h-4 text-primary" />
              <span>Customer Master</span>
            </Link>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionSuccessMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl text-sm flex items-center gap-2">
            <Icon name="CheckCircleIcon" className="w-5 h-5 flex-shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
          <div className="relative flex-1">
            <Icon
              name="MagnifyingGlassIcon"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search legacy customers by name, phone, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="All">All Link Statuses</option>
              <option value="VERIFIED">Verified</option>
              <option value="AUTO_MATCHED">Auto Matched</option>
              <option value="UNLINKED">Unlinked</option>
            </select>
          </div>
        </div>

        {/* Customer Table */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Icon name="UsersIcon" className="w-5 h-5 text-primary" />
              <span>Historical Customer Directory</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {customers.length} records
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3.5 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Customer Name
                  </th>
                  <th className="px-4 py-3.5">Mobile Number</th>
                  <th className="px-4 py-3.5">Legacy ID</th>
                  <th className="px-4 py-3.5">Master Link</th>
                  <th className="px-4 py-3.5 text-center">Repairs</th>
                  <th className="px-4 py-3.5 text-center">Retail Sales</th>
                  <th className="px-4 py-3.5">First Seen</th>
                  <th className="px-4 py-3.5">Link Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span>Querying read-only legacy customer database...</span>
                      </div>
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No legacy customers matched the criteria.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        {c.name}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                        {c.phone}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-primary font-semibold">
                        {c.id}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">
                        {c.coskoCustomerId ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {c.coskoCustomerId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Pending link</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold">
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">
                          {c.repairsCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold">
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">
                          {c.coskoPurchasesCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {c.firstSeenDate}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLinkStatusBadge(c.linkStatus)}`}
                        >
                          {c.linkStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2">
                        <Link
                          href={`/customers?phone=${encodeURIComponent(c.phone)}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium"
                        >
                          Customer 360
                        </Link>
                        {c.linkStatus !== 'VERIFIED' ? (
                          <button
                            onClick={() => handleLinkAction(c.id, 'verify')}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 text-xs font-medium"
                          >
                            Verify Link
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLinkAction(c.id, 'unlink')}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-destructive text-xs font-medium"
                          >
                            Unlink
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
