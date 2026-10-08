'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import SuperAdminGuard from '@/components/SuperAdminGuard';

type PeriodFilter = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom' | 'all_time';

interface DailyBreakdownItem {
  date: string;
  activeSeconds: number;
  activeMinutes: number;
  activeHours: string;
  idleMinutes: number;
  firstLogin: string;
  lastActivity: string;
  sessionsCount: number;
}

interface UserActivityStat {
  userId: string;
  name: string;
  email: string;
  role: string;
  storeScope: string;
  avatarUrl?: string;
  accountStatus: string;
  liveStatus: 'ONLINE' | 'IDLE' | 'OFFLINE';
  shiftStatus?: 'ACTIVE' | 'COMPLETED' | 'NOT_STARTED';
  shiftStart?: string | null;
  liveElapsedSeconds?: number;
  formattedLiveElapsed?: string;
  lastSeen?: string | null;
  todayDurationSeconds?: number;
  formattedTodayDuration?: string;
  totalActiveSeconds: number;
  totalWorkingMinutes: number;
  totalWorkingHours: string;
  totalIdleMinutes: number;
  workingDays: number;
  firstLogin: string | null;
  lastActivity: string | null;
  sessionsCount: number;
  dailyBreakdown: DailyBreakdownItem[];
}

interface StatsSummary {
  totalWorkingMinutes: number;
  totalWorkingHours: string;
  totalSessions: number;
  activeStaffOnline: number;
  averageDailyHours: string;
  totalUsersCount: number;
}

function formatHHMMSS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function WorkActivityPage() {
  const { currentUser, storesList } = useApp();
  const isSuperAdmin =
    currentUser.role === 'Super Admin' || (currentUser as any).securityLevel >= 100;
  const isStoreManager = currentUser.role === 'Store Manager';

  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedStore, setSelectedStore] = useState<string>(
    isSuperAdmin ? 'all' : currentUser.store || 'BLR'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [users, setUsers] = useState<UserActivityStat[]>([]);
  const [breakdownUser, setBreakdownUser] = useState<UserActivityStat | null>(null);

  // 1-second local visual ticker for active duty shift timers
  const [, setVisualTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setVisualTick((t) => (t + 1) % 10000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Activity Stats from Authoritative Server
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const params = new URLSearchParams({
        range: period,
        timezone: tz,
      });

      if (period === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }

      if (isSuperAdmin) {
        if (selectedUserId !== 'all') params.set('userId', selectedUserId);
        if (selectedStore !== 'all') params.set('storeCode', selectedStore);
      } else if (isStoreManager) {
        params.set('storeCode', currentUser.store || 'BLR');
        if (selectedUserId !== 'all') params.set('userId', selectedUserId);
      } else {
        // Sales Manager
        params.set('userId', currentUser.id);
        params.set('storeCode', currentUser.store || 'BLR');
      }

      const res = await fetch(`/api/activity/stats?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load activity metrics');
      }

      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        setUsers(data.users || []);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error fetching activity statistics');
    } finally {
      setLoading(false);
    }
  }, [
    period,
    customStart,
    customEnd,
    selectedUserId,
    selectedStore,
    isSuperAdmin,
    isStoreManager,
    currentUser.id,
    currentUser.store,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Realtime Live Presence Listener for Work Activity
  useEffect(() => {
    const handleRealtimeMessage = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;

      if (
        detail.event === 'WORK_ACTIVITY_UPDATED' ||
        detail.event === 'ATTENDANCE_STARTED' ||
        detail.event === 'ATTENDANCE_ENDED'
      ) {
        const payload = detail.payload;
        if (!payload) return;

        setUsers((prevUsers) =>
          prevUsers.map((u) => {
            if (u.userId === payload.userId) {
              const updatedShiftStatus =
                detail.event === 'ATTENDANCE_STARTED'
                  ? 'ACTIVE'
                  : detail.event === 'ATTENDANCE_ENDED'
                    ? 'COMPLETED'
                    : payload.hasActiveShift !== undefined
                      ? payload.hasActiveShift
                        ? 'ACTIVE'
                        : u.shiftStatus === 'ACTIVE'
                          ? 'COMPLETED'
                          : u.shiftStatus
                      : u.shiftStatus;

              return {
                ...u,
                liveStatus: (payload.status as any) || u.liveStatus,
                shiftStatus: updatedShiftStatus,
                shiftStart:
                  payload.shiftStartUtc !== undefined ? payload.shiftStartUtc : u.shiftStart,
                lastSeen: payload.lastSeen || payload.timestamp || u.lastSeen,
                todayDurationSeconds:
                  payload.totalSeconds !== undefined
                    ? payload.totalSeconds
                    : u.todayDurationSeconds,
              };
            }
            return u;
          })
        );
      }
    };

    window.addEventListener('cosko:realtime', handleRealtimeMessage);
    return () => {
      window.removeEventListener('cosko:realtime', handleRealtimeMessage);
    };
  }, []);

  // Handle CSV Export
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const params = new URLSearchParams({
        range: period,
        timezone: tz,
      });

      if (period === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }

      if (isSuperAdmin) {
        if (selectedUserId !== 'all') params.set('userId', selectedUserId);
        if (selectedStore !== 'all') params.set('storeCode', selectedStore);
      } else if (isStoreManager) {
        params.set('storeCode', currentUser.store || 'BLR');
        if (selectedUserId !== 'all') params.set('userId', selectedUserId);
      } else {
        params.set('userId', currentUser.id);
        params.set('storeCode', currentUser.store || 'BLR');
      }

      const res = await fetch(`/api/activity/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work_activity_${period}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Work activity report exported successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  // Filtered users for search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.storeScope.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Live timer calculation derived from server shiftStart timestamp (never resets on rerender)
  const computeLiveElapsed = (u: UserActivityStat) => {
    if (u.shiftStatus !== 'ACTIVE' || !u.shiftStart) {
      return u.todayDurationSeconds && u.todayDurationSeconds > 0
        ? formatHHMMSS(u.todayDurationSeconds)
        : '—';
    }
    const startMs = new Date(u.shiftStart).getTime();
    const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    return formatHHMMSS(diff);
  };

  const formatHoursMins = (totalMinutes: number) => {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs === 0 && mins === 0) return '0 mins';
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  const formatDateTime = (dateStr: string | null | Date | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  };

  const formatTimeOnly = (dateStr: string | null | Date | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(dateStr);
    }
  };

  return (
    <SuperAdminGuard moduleName="Work Activity">
      <AppLayout activeRoute="/work-activity">
        <div className="space-y-4 md:space-y-6 fade-in">
          {/* Top Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title">Work Activity</h1>
              <p className="page-subtitle">
                Operational presence & authoritative duty shift metrics
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={fetchStats}
                disabled={loading}
                className="btn-secondary btn-sm gap-1"
                title="Refresh"
              >
                <Icon name="ArrowPathIcon" size={14} className={loading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleExportCSV}
                disabled={exporting || loading}
                className="btn-primary btn-sm gap-1"
              >
                {exporting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="ArrowDownTrayIcon" size={14} />
                )}
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* Filter Navigation Bar */}
          <div className="card p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
              {/* Range Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border border-border/80 overflow-x-auto scrollbar-thin">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'this_week', label: 'This Week' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'all_time', label: 'All Time' },
                    { id: 'custom', label: 'Custom Range' },
                  ] as Array<{ id: PeriodFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPeriod(f.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      period === f.id
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Scope & Staff Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                {isSuperAdmin ? (
                  <select
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="input-field text-xs py-1.5 w-auto"
                  >
                    <option value="all">All Store Locations</option>
                    {storesList.map((s) => (
                      <option key={s.id} value={s.code}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-2.5 py-1 text-2xs font-semibold rounded-lg bg-muted text-foreground border border-border">
                    Store: {currentUser.store || 'BLR'} Hub
                  </span>
                )}

                {/* Staff Member Filter */}
                {(isSuperAdmin || isStoreManager) && (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="input-field text-xs py-1.5 w-auto max-w-[200px]"
                  >
                    <option value="all">
                      {isSuperAdmin ? 'All Staff Members' : 'Store Staff'} ({users.length})
                    </option>
                    {users.map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Custom Date Range Selector */}
            {period === 'custom' && (
              <div className="flex items-center gap-3 pt-2 border-t border-border/60 flex-wrap">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Custom Range:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="input-field text-xs py-1 px-2 font-mono"
                  />
                  <span className="text-muted-foreground text-xs font-bold">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="input-field text-xs py-1 px-2 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="card p-4 space-y-1 relative overflow-hidden border border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Total Working Time
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Icon name="ClockIcon" size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-foreground font-tabular">
                {summary ? `${summary.totalWorkingHours} hrs` : '0.0 hrs'}
              </p>
              <p className="text-3xs sm:text-2xs text-muted-foreground font-tabular">
                {summary
                  ? `${summary.totalWorkingMinutes.toLocaleString('en-IN')} active mins`
                  : '0 active mins'}
              </p>
            </div>

            <div className="card p-4 space-y-1 relative overflow-hidden border border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Working Days
                </span>
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Icon name="CalendarDaysIcon" size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-foreground font-tabular">
                {users.length > 0 ? Math.max(...users.map((u) => u.workingDays)) : 0} Days
              </p>
              <p className="text-3xs sm:text-2xs text-muted-foreground font-tabular">
                Active attendance days in period
              </p>
            </div>

            <div className="card p-4 space-y-1 relative overflow-hidden border border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Staff Online Now
                </span>
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Icon name="SignalIcon" size={16} />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <p className="text-lg sm:text-2xl font-extrabold text-foreground font-tabular">
                  {summary?.activeStaffOnline || 0}
                </p>
              </div>
              <p className="text-3xs sm:text-2xs text-muted-foreground">
                Heartbeat received &lt; 45s ago
              </p>
            </div>

            <div className="card p-4 space-y-1 relative overflow-hidden border border-border/80">
              <div className="flex items-center justify-between">
                <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tracked Sessions
                </span>
                <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Icon name="ComputerDesktopIcon" size={16} />
                </span>
              </div>
              <p className="text-lg sm:text-2xl font-extrabold text-foreground font-tabular">
                {summary?.totalSessions || 0}
              </p>
              <p className="text-3xs sm:text-2xs text-muted-foreground font-tabular">
                Avg {summary?.averageDailyHours || '0.0'} hrs/day
              </p>
            </div>
          </div>

          {/* Staff Table Card */}
          <div className="card overflow-hidden border border-border/80">
            <div className="p-4 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-foreground">
                  {isSuperAdmin
                    ? 'Staff Member Activity & Session Telemetry'
                    : 'Store Staff Activity & Presence'}
                </h2>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  Realtime presence, shift status, and authoritative duty time calculations.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Icon
                  name="MagnifyingGlassIcon"
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Filter by name, role, store..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field text-xs pl-8 py-1.5"
                />
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground text-3xs uppercase font-bold tracking-wider border-b border-border/80">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-3">Role & Store</th>
                    <th className="py-3 px-3">Presence</th>
                    <th className="py-3 px-3">Shift Status</th>
                    <th className="py-3 px-3">Shift Start</th>
                    <th className="py-3 px-3">Live Elapsed</th>
                    <th className="py-3 px-3">Last Seen</th>
                    <th className="py-3 px-3 text-right">Today Duration</th>
                    <th className="py-3 px-4 text-center">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium font-tabular">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading activity telemetry...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        No activity logs found for the selected period.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isOnline = u.liveStatus === 'ONLINE';
                      const isIdle = u.liveStatus === 'IDLE';
                      const isActiveShift = u.shiftStatus === 'ACTIVE';

                      return (
                        <tr key={u.userId} className="hover:bg-muted/30 transition-colors">
                          {/* Member */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {u.avatarUrl ? (
                                <img
                                  src={u.avatarUrl}
                                  alt={u.name}
                                  className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {u.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-foreground leading-tight">{u.name}</p>
                                <p className="text-3xs text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Role & Store */}
                          <td className="py-3 px-3">
                            <span className="text-2xs font-semibold block text-foreground">
                              {u.role}
                            </span>
                            <span className="text-3xs text-muted-foreground font-mono">
                              {u.storeScope === 'All Stores' ? 'Global' : `${u.storeScope} Hub`}
                            </span>
                          </td>

                          {/* Live Presence Status */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-3xs font-bold ${
                                isOnline
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  : isIdle
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : 'bg-muted text-muted-foreground border border-border'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isOnline
                                    ? 'bg-emerald-500 animate-pulse'
                                    : isIdle
                                      ? 'bg-amber-500'
                                      : 'bg-muted-foreground'
                                }`}
                              />
                              {u.liveStatus}
                            </span>
                          </td>

                          {/* Shift Status */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold ${
                                isActiveShift
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : u.shiftStatus === 'COMPLETED'
                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                    : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isActiveShift
                                ? 'Active Shift'
                                : u.shiftStatus === 'COMPLETED'
                                  ? 'Shift Ended'
                                  : 'No Shift Today'}
                            </span>
                          </td>

                          {/* Shift Start */}
                          <td className="py-3 px-3 text-2xs text-muted-foreground font-mono">
                            {formatTimeOnly(u.shiftStart)}
                          </td>

                          {/* Live Elapsed (ticks locally every second) */}
                          <td className="py-3 px-3">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isActiveShift
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {computeLiveElapsed(u)}
                            </span>
                          </td>

                          {/* Last Seen */}
                          <td className="py-3 px-3 text-2xs text-muted-foreground">
                            {formatTimeOnly(u.lastSeen)}
                          </td>

                          {/* Today's Duration */}
                          <td className="py-3 px-3 text-right">
                            <span className="font-extrabold text-xs text-foreground font-mono">
                              {u.formattedTodayDuration ||
                                (u.todayDurationSeconds
                                  ? formatHHMMSS(u.todayDurationSeconds)
                                  : '00:00:00')}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setBreakdownUser(u)}
                              className="btn-ghost text-3xs text-primary font-bold px-2.5 py-1 hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                            >
                              View Days
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (<md) */}
            <div className="block md:hidden divide-y divide-border/60">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading activity telemetry...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  No activity logs found for the selected period.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isOnline = u.liveStatus === 'ONLINE';
                  const isIdle = u.liveStatus === 'IDLE';
                  const isActiveShift = u.shiftStatus === 'ACTIVE';

                  return (
                    <div key={`m-user-${u.userId}`} className="p-4 space-y-3 bg-card">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-foreground">{u.name}</p>
                            <p className="text-3xs text-muted-foreground">
                              {u.role} · {u.storeScope}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold ${
                              isActiveShift
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isActiveShift ? 'Active' : 'Off Duty'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold ${
                              isOnline
                                ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                                : isIdle
                                  ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {u.liveStatus}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-2xs p-2.5 rounded-lg bg-muted/30 font-tabular">
                        <div>
                          <span className="text-3xs text-muted-foreground uppercase block font-bold">
                            Elapsed Duty Time
                          </span>
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                            {computeLiveElapsed(u)}
                          </span>
                        </div>
                        <div>
                          <span className="text-3xs text-muted-foreground uppercase block font-bold">
                            Today's Total
                          </span>
                          <span className="text-sm font-extrabold text-foreground font-mono">
                            {u.formattedTodayDuration || '00:00:00'}
                          </span>
                        </div>
                        <div>
                          <span className="text-3xs text-muted-foreground uppercase block font-bold">
                            Shift Started
                          </span>
                          <span className="text-foreground font-mono">
                            {formatTimeOnly(u.shiftStart)}
                          </span>
                        </div>
                        <div>
                          <span className="text-3xs text-muted-foreground uppercase block font-bold">
                            Last Seen
                          </span>
                          <span className="text-foreground font-mono">
                            {formatTimeOnly(u.lastSeen)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setBreakdownUser(u)}
                        className="btn-secondary w-full text-xs py-1.5 justify-center cursor-pointer"
                      >
                        <Icon name="CalendarDaysIcon" size={14} />
                        View Daily Breakdown
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Daily Breakdown Modal */}
        {breakdownUser && (
          <Modal
            open={!!breakdownUser}
            onClose={() => setBreakdownUser(null)}
            title={`Daily Work Breakdown: ${breakdownUser.name}`}
            subtitle={`${breakdownUser.role} · Store: ${breakdownUser.storeScope} · Total Active: ${formatHoursMins(
              breakdownUser.totalWorkingMinutes
            )}`}
            size="lg"
          >
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-muted/20 border border-border/80 text-center font-tabular">
                <div>
                  <span className="text-3xs uppercase font-bold text-muted-foreground block">
                    Working Days
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    {breakdownUser.workingDays} Days
                  </span>
                </div>
                <div>
                  <span className="text-3xs uppercase font-bold text-muted-foreground block">
                    Total Active Hours
                  </span>
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                    {breakdownUser.totalWorkingHours} hrs
                  </span>
                </div>
                <div>
                  <span className="text-3xs uppercase font-bold text-muted-foreground block">
                    Total Sessions
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    {breakdownUser.sessionsCount}
                  </span>
                </div>
              </div>

              {/* Daily Records Table */}
              <div className="overflow-x-auto border border-border/80 rounded-xl max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground text-3xs uppercase font-bold tracking-wider sticky top-0 bg-muted">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">First Login</th>
                      <th className="py-2.5 px-3">Last Active</th>
                      <th className="py-2.5 px-3 text-right">Active Minutes</th>
                      <th className="py-2.5 px-3 text-right">Working Hours</th>
                      <th className="py-2.5 px-3 text-right">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-tabular">
                    {breakdownUser.dailyBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                          No daily activity recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      breakdownUser.dailyBreakdown.map((day) => (
                        <tr key={day.date} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 font-bold text-foreground font-mono">
                            {day.date}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground text-2xs">
                            {formatDateTime(day.firstLogin)}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground text-2xs">
                            {formatDateTime(day.lastActivity)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                            {day.activeMinutes}m
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                            {day.activeHours}h
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {day.sessionsCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBreakdownUser(null)}
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AppLayout>
    </SuperAdminGuard>
  );
}
