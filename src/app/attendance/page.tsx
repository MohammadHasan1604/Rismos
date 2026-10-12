'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import SuperAdminGuard from '@/components/SuperAdminGuard';

interface AttendanceRecord {
  id: string;
  userId: string;
  employeeName: string;
  employeeEmail: string;
  role: string;
  avatarUrl: string | null;
  store: string;
  date: string;
  shiftStart: string;
  shiftEnd: string | null;
  totalSeconds: number;
  totalHHMM: string;
  totalHHMMSS: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

function formatHHMM(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '—';
  }
}

export default function AttendancePage() {
  const { currentUser, storesList, usersList } = useApp();

  // Role identification
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isStoreManager = currentUser.role === 'Store Manager';
  const isSalesManager = currentUser.role === 'Sales Manager';

  // Filters
  const [selectedStore, setSelectedStore] = useState<string>(
    isSuperAdmin ? 'All Stores' : currentUser.store || 'BLR'
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string>(
    isSalesManager ? currentUser.id : 'all'
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Attendance Records State
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Current User Shift State
  const [shiftStatus, setShiftStatus] = useState<
    'LOADING' | 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED'
  >('LOADING');
  const [shiftStartUtc, setShiftStartUtc] = useState<string | null>(null);
  const [shiftEndUtc, setShiftEndUtc] = useState<string | null>(null);
  const [liveElapsed, setLiveElapsed] = useState<string>('00:00');
  const [shiftCompletedTotal, setShiftCompletedTotal] = useState<string>('00:00');
  const [actionLoading, setActionLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Current Shift for Active User
  const fetchCurrentShift = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/current', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ACTIVE') {
          setShiftStatus('ACTIVE');
          setShiftStartUtc(data.shiftStartUtc);
          setShiftEndUtc(null);
          setLiveElapsed(formatHHMM(data.elapsedSeconds || 0));
        } else if (data.status === 'COMPLETED') {
          setShiftStatus('COMPLETED');
          setShiftStartUtc(data.shiftStartUtc);
          setShiftEndUtc(data.shiftEndUtc || null);
          setShiftCompletedTotal(formatHHMM(data.totalSeconds || 0));
        } else {
          setShiftStatus('NOT_STARTED');
          setShiftStartUtc(null);
          setShiftEndUtc(null);
        }
      }
    } catch {
      setShiftStatus('NOT_STARTED');
    }
  }, []);

  // Fetch Attendance Log Records
  const fetchAttendanceRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.set('date', selectedDate);

      if (isSuperAdmin) {
        if (selectedStore !== 'All Stores') params.set('storeCode', selectedStore);
        if (selectedEmployee !== 'all') params.set('userId', selectedEmployee);
      } else if (isStoreManager) {
        params.set('storeCode', currentUser.store || 'BLR');
        if (selectedEmployee !== 'all') params.set('userId', selectedEmployee);
      } else {
        // Sales Manager: strictly own records
        params.set('userId', currentUser.id);
      }

      const res = await fetch(`/api/attendance?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (err: any) {
      toast.error('Failed to load attendance records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    selectedStore,
    selectedEmployee,
    isSuperAdmin,
    isStoreManager,
    currentUser.store,
    currentUser.id,
  ]);

  useEffect(() => {
    fetchCurrentShift();
    fetchAttendanceRecords();
  }, [fetchCurrentShift, fetchAttendanceRecords]);

  // Live visual timer for active shift
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (shiftStatus === 'ACTIVE' && shiftStartUtc) {
      const startMs = new Date(shiftStartUtc).getTime();
      const updateTimer = () => {
        const diffSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        setLiveElapsed(formatHHMM(diffSeconds));
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [shiftStatus, shiftStartUtc]);

  // Realtime Attendance Invalidation Listener
  useEffect(() => {
    const handleRealtime = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;

      if (
        detail.event === 'ATTENDANCE_STARTED' ||
        detail.event === 'ATTENDANCE_ENDED' ||
        detail.event === 'ATTENDANCE_UPDATED' ||
        detail.event === 'WORK_ACTIVITY_UPDATED'
      ) {
        // Refetch records for current store/filters
        fetchAttendanceRecords();

        // If the event affects current user, also re-sync shift status
        if (detail.payload?.userId === currentUser.id) {
          fetchCurrentShift();
        }
      }
    };

    window.addEventListener('cosko:realtime', handleRealtime);
    return () => {
      window.removeEventListener('cosko:realtime', handleRealtime);
    };
  }, [fetchAttendanceRecords, fetchCurrentShift, currentUser.id]);

  // Start Shift Action
  const handleStartShift = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/attendance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to start shift');
        return;
      }
      toast.success('Duty Shift started successfully!');
      setShiftStatus('ACTIVE');
      setShiftStartUtc(data.shift?.shiftStartUtc || new Date().toISOString());
      fetchAttendanceRecords();
    } catch (err: any) {
      toast.error('Network error starting shift: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // End Shift Action
  const handleEndShift = async () => {
    if (
      !window.confirm(
        'Are you sure you want to end your shift for today? You will not be able to start another shift until tomorrow.'
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/attendance/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to end shift');
        return;
      }
      toast.success(`Shift ended! Total time: ${data.formattedDuration}`);
      setShiftStatus('COMPLETED');
      setShiftEndUtc(new Date().toISOString());
      setShiftCompletedTotal(data.formattedDuration || '00:00');
      fetchAttendanceRecords();
    } catch (err: any) {
      toast.error('Network error ending shift: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered staff list for the employee filter
  const permittedEmployees = useMemo(() => {
    if (isSuperAdmin) {
      if (selectedStore === 'All Stores') return usersList;
      return usersList.filter(
        (u) =>
          u.store === selectedStore || (u.allowedStores && u.allowedStores.includes(selectedStore))
      );
    }
    if (isStoreManager) {
      const mgrStore = currentUser.store;
      return usersList.filter(
        (u) => u.store === mgrStore || (u.allowedStores && u.allowedStores.includes(mgrStore))
      );
    }
    return usersList.filter((u) => u.id === currentUser.id);
  }, [usersList, isSuperAdmin, isStoreManager, selectedStore, currentUser.store, currentUser.id]);

  // Filtered records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeEmail.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.store.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  // Aggregate KPI stats
  const activeCount = records.filter((r) => r.status === 'ACTIVE').length;
  const completedCount = records.filter((r) => r.status === 'COMPLETED').length;
  const totalWorkedSeconds = records.reduce((sum, r) => sum + r.totalSeconds, 0);

  return (
    <SuperAdminGuard moduleName="Attendance Management">
      <AppLayout activeRoute="/attendance">
        <div className="space-y-4 md:space-y-6 fade-in pb-12">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title flex items-center gap-2">
                <Icon name="ClockIcon" size={24} className="text-primary" />
                <span>Shift Attendance & Work Log</span>
              </h1>
              <p className="page-subtitle">
                {isSuperAdmin
                  ? 'Enterprise-wide staff shifts, real-time activity and duty logs'
                  : isStoreManager
                    ? `Store (${currentUser.store}) team duty shift roster & active sessions`
                    : 'Your daily duty shift, logged hours and work timeline'}
              </p>
            </div>
          </div>

          {/* ─── Clear Duty Shift Status Card (Requirement 14) ─── */}
          <div className="card p-4 sm:p-5 border-primary/20 bg-gradient-to-r from-card via-card to-primary/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                    shiftStatus === 'ACTIVE'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : shiftStatus === 'COMPLETED'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                        : 'bg-muted border-border text-muted-foreground'
                  }`}
                >
                  <Icon
                    name={
                      shiftStatus === 'ACTIVE'
                        ? 'PlayIcon'
                        : shiftStatus === 'COMPLETED'
                          ? 'CheckCircleIcon'
                          : 'PauseIcon'
                    }
                    size={24}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Your Current Shift Status
                    </span>
                    <span
                      className={`badge text-3xs font-extrabold px-2 py-0.5 rounded-full ${
                        shiftStatus === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : shiftStatus === 'COMPLETED'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                            : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {shiftStatus === 'ACTIVE'
                        ? '● Shift Active'
                        : shiftStatus === 'COMPLETED'
                          ? '✓ Shift Completed'
                          : '○ Shift Not Started'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline gap-2">
                    {shiftStatus === 'ACTIVE' && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                          {liveElapsed}
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          (Started at {formatTime(shiftStartUtc)})
                        </span>
                      </div>
                    )}

                    {shiftStatus === 'COMPLETED' && (
                      <div className="flex flex-wrap items-baseline gap-2 text-xs">
                        <span className="text-lg sm:text-xl font-black text-foreground">
                          Total: {shiftCompletedTotal}
                        </span>
                        <span className="text-muted-foreground">
                          Started: <strong>{formatTime(shiftStartUtc)}</strong> · Ended:{' '}
                          <strong>{formatTime(shiftEndUtc)}</strong>
                        </span>
                      </div>
                    )}

                    {shiftStatus === 'NOT_STARTED' && (
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        You have not clocked in for duty today. Start shift to begin recording
                        operational hours.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Shift Actions */}
              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {shiftStatus === 'NOT_STARTED' && (
                  <button
                    type="button"
                    onClick={handleStartShift}
                    disabled={actionLoading}
                    className="btn-primary h-11 px-5 text-sm font-bold gap-2 shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
                  >
                    <Icon name="PlayIcon" size={16} />
                    <span>Start Shift</span>
                  </button>
                )}

                {shiftStatus === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={handleEndShift}
                    disabled={actionLoading}
                    className="btn-danger h-11 px-5 text-sm font-bold gap-2 shadow-md bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50 min-h-[44px]"
                  >
                    <Icon name="StopIcon" size={16} />
                    <span>End Shift</span>
                  </button>
                )}

                {shiftStatus === 'COMPLETED' && (
                  <button
                    type="button"
                    disabled
                    className="btn-secondary h-11 px-5 text-xs font-bold text-muted-foreground opacity-60 cursor-not-allowed min-h-[44px]"
                  >
                    <span>Start Shift (Done for Today)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─── Compact KPI Summary Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-3.5 space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Shift Records
              </span>
              <p className="text-xl sm:text-2xl font-black text-foreground font-tabular">
                {records.length}
              </p>
              <p className="text-3xs text-muted-foreground">On {selectedDate}</p>
            </div>

            <div className="card p-3.5 space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Active on Duty Now
              </span>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-tabular flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeCount}
              </p>
              <p className="text-3xs text-muted-foreground">Live staff in session</p>
            </div>

            <div className="card p-3.5 space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                Completed Shifts
              </span>
              <p className="text-xl sm:text-2xl font-black text-foreground font-tabular">
                {completedCount}
              </p>
              <p className="text-3xs text-muted-foreground">Logged out for the day</p>
            </div>

            <div className="card p-3.5 space-y-1">
              <span className="text-3xs font-bold uppercase tracking-wider text-primary">
                Total Logged Time
              </span>
              <p className="text-xl sm:text-2xl font-black text-primary font-mono">
                {formatHHMM(totalWorkedSeconds)}
              </p>
              <p className="text-3xs text-muted-foreground">Hours:Minutes total</p>
            </div>
          </div>

          {/* ─── Filter & Toolbar ─── */}
          <div className="card p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Store Filter (Only Super Admin can switch stores) */}
              {isSuperAdmin ? (
                <div>
                  <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Store Filter
                  </label>
                  <select
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="input-field py-2 text-xs"
                  >
                    <option value="All Stores">All Stores</option>
                    {storesList.map((s) => (
                      <option key={`st-${s.code}`} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Store Location
                  </label>
                  <div className="input-field py-2 text-xs bg-muted text-muted-foreground flex items-center justify-between">
                    <span>{currentUser.store || 'Store Location'}</span>
                    <Icon name="LockClosedIcon" size={12} className="text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Employee Filter */}
              {!isSalesManager ? (
                <div>
                  <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Employee Filter
                  </label>
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="input-field py-2 text-xs"
                  >
                    <option value="all">All Employees</option>
                    {permittedEmployees.map((u) => (
                      <option key={`emp-${u.id}`} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Employee
                  </label>
                  <div className="input-field py-2 text-xs bg-muted text-muted-foreground flex items-center justify-between">
                    <span>{currentUser.name}</span>
                    <Icon name="LockClosedIcon" size={12} className="text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Date Picker */}
              <div>
                <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Duty Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="input-field py-2 text-xs"
                />
              </div>

              {/* Search Filter */}
              <div>
                <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Search Roster
                </label>
                <div className="relative">
                  <Icon
                    name="MagnifyingGlassIcon"
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    placeholder="Filter name, email, store..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field pl-8 py-2 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ─── Attendance Table / Mobile Cards ─── */}
          <div className="card overflow-hidden">
            {/* Mobile Record Cards (< md) */}
            <div className="md:hidden divide-y divide-border">
              {loading ? (
                <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
                  Loading attendance shift roster...
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                  <Icon
                    name="CalendarIcon"
                    size={28}
                    className="mx-auto text-muted-foreground/40"
                  />
                  <p>No shift records found for {selectedDate}.</p>
                </div>
              ) : (
                filteredRecords.map((r) => (
                  <div key={`m-att-${r.id}`} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-foreground">{r.employeeName}</h4>
                        <p className="text-3xs text-muted-foreground">
                          {r.role} · <span className="font-semibold text-primary">{r.store}</span>
                        </p>
                      </div>
                      <span
                        className={`badge text-3xs font-bold px-2 py-0.5 rounded-full ${
                          r.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {r.status === 'ACTIVE' ? '● Active' : '✓ Completed'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-muted/40 text-2xs">
                      <div>
                        <span className="text-3xs text-muted-foreground block">Clock In</span>
                        <strong className="font-mono text-foreground">
                          {formatTime(r.shiftStart)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-3xs text-muted-foreground block">Clock Out</span>
                        <strong className="font-mono text-foreground">
                          {formatTime(r.shiftEnd)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-3xs text-muted-foreground block">Duration</span>
                        <strong className="font-mono text-primary font-bold">{r.totalHHMM}</strong>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table with Sticky Identifier Column (>= md) */}
            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-muted border-b border-border text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                    {/* Sticky Identifying Column (Requirement 7) */}
                    <th className="sticky left-0 z-10 bg-muted px-4 py-3 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] min-w-[200px]">
                      Employee Name
                    </th>
                    <th className="px-4 py-3">Store Location</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Duty Date</th>
                    <th className="px-4 py-3">Shift Start</th>
                    <th className="px-4 py-3">Shift End</th>
                    <th className="px-4 py-3">Duration (HH:MM:SS)</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-muted-foreground animate-pulse"
                      >
                        Loading authoritative MySQL attendance logs...
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        No shift records found for {selectedDate}.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={`row-att-${r.id}`} className="hover:bg-muted/30 transition-colors">
                        {/* Sticky Identifier Column */}
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xs font-bold shrink-0">
                              {r.employeeName[0]}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-foreground block truncate">
                                {r.employeeName}
                              </span>
                              <span className="text-3xs text-muted-foreground block truncate">
                                {r.employeeEmail}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-semibold text-foreground">
                          <span className="badge-primary text-3xs font-mono font-bold">
                            {r.store}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-muted-foreground font-medium">{r.role}</td>

                        <td className="px-4 py-3 font-mono text-muted-foreground">{r.date}</td>

                        <td className="px-4 py-3 font-mono text-foreground">
                          {formatTime(r.shiftStart)}
                        </td>

                        <td className="px-4 py-3 font-mono text-foreground">
                          {formatTime(r.shiftEnd)}
                        </td>

                        <td className="px-4 py-3 font-mono font-bold text-primary">
                          {r.totalHHMMSS}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1.5 text-3xs font-bold px-2.5 py-1 rounded-full ${
                              r.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {r.status === 'ACTIVE' ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </>
                            ) : (
                              <>✓ Completed</>
                            )}
                          </span>
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
    </SuperAdminGuard>
  );
}
