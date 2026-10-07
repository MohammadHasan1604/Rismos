'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

interface TopbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onMobileMenuOpen: () => void;
}

function formatHHMM(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function Topbar({ onToggleSidebar, onMobileMenuOpen }: TopbarProps) {
  const {
    setSearchOpen,
    setNotificationsOpen,
    setUserProfileOpen,
    setStoreSelectorOpen,
    notifications,
    currentUser,
    selectedStore,
    branding,
  } = useApp();
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ─── Server-Authoritative Shift Attendance State ─────────────────────────────
  const [shiftStatus, setShiftStatus] = useState<
    'LOADING' | 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED'
  >('LOADING');
  const [shiftStartUtc, setShiftStartUtc] = useState<string | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState<string>('00:00');
  const [shiftActionLoading, setShiftActionLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current attendance status from server
  const fetchCurrentShift = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch('/api/attendance/current', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ACTIVE') {
          setShiftStatus('ACTIVE');
          setShiftStartUtc(data.shiftStartUtc);
          setElapsedDisplay(formatHHMM(data.elapsedSeconds || 0));
        } else if (data.status === 'COMPLETED') {
          setShiftStatus('COMPLETED');
          setShiftStartUtc(data.shiftStartUtc);
          setElapsedDisplay(formatHHMM(data.totalSeconds || 0));
        } else {
          setShiftStatus('NOT_STARTED');
          setShiftStartUtc(null);
        }
      }
    } catch {
      setShiftStatus('NOT_STARTED');
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchCurrentShift();
  }, [fetchCurrentShift]);

  // Server-anchored elapsed timer calculation
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (shiftStatus === 'ACTIVE' && shiftStartUtc) {
      const startMs = new Date(shiftStartUtc).getTime();
      const updateTimer = () => {
        const nowMs = Date.now();
        const diffSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
        setElapsedDisplay(formatHHMM(diffSeconds));
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [shiftStatus, shiftStartUtc]);

  const handleStartShift = async () => {
    setShiftActionLoading(true);
    try {
      const res = await fetch('/api/attendance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to start shift');
        if (res.status === 409) {
          fetchCurrentShift();
        }
        return;
      }
      toast.success('Duty Shift started successfully');
      setShiftStatus('ACTIVE');
      setShiftStartUtc(data.shift?.shiftStartUtc || new Date().toISOString());
    } catch (err: any) {
      toast.error('Network error starting shift: ' + err.message);
    } finally {
      setShiftActionLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (
      !window.confirm(
        'Are you sure you want to end your shift for today? You will not be able to start another shift until tomorrow.'
      )
    ) {
      return;
    }
    setShiftActionLoading(true);
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
      if (data.totalSeconds) {
        setElapsedDisplay(formatHHMM(data.totalSeconds));
      }
    } catch (err: any) {
      toast.error('Network error ending shift: ' + err.message);
    } finally {
      setShiftActionLoading(false);
    }
  };

  return (
    <header
      className="flex-shrink-0 bg-card/95 backdrop-blur-lg border-b border-border/80 flex items-center justify-between gap-2 px-3 lg:px-5 w-full z-30"
      style={{ height: 'var(--topbar-height)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Desktop: sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className="btn-ghost hidden lg:flex w-8 h-8 p-0 items-center justify-center flex-shrink-0 rounded-lg"
          aria-label="Toggle sidebar"
        >
          <Icon name="Bars3Icon" size={16} />
        </button>

        {/* Mobile: brand (links to /sales) + interactive store switcher */}
        <div className="flex lg:hidden items-center gap-1.5 min-w-0">
          <Link
            href="/sales"
            className="flex items-center gap-1.5 min-w-0 hover:opacity-85 transition-opacity"
            aria-label="Go to Sales"
          >
            <AppLogo size={18} showText={false} />
            <span className="text-sm font-bold text-foreground truncate max-w-[100px]">
              {branding.appName || 'RISMOS'}
            </span>
          </Link>

          {currentUser.role === 'Super Admin' ? (
            <button
              onClick={() => setStoreSelectorOpen(true)}
              className="text-3xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-0.5 rounded-md font-bold truncate max-w-[100px] flex items-center gap-1 border border-primary/20 active:scale-95 transition-all cursor-pointer"
              aria-label="Switch store location"
            >
              <span>
                {selectedStore === 'All Stores'
                  ? 'All'
                  : selectedStore === 'CENTRAL'
                    ? 'HQ'
                    : selectedStore}
              </span>
              <Icon name="ChevronUpDownIcon" size={10} className="opacity-70 flex-shrink-0" />
            </button>
          ) : (
            <span className="text-3xs bg-primary/8 text-primary px-1.5 py-0.5 rounded-md font-bold truncate max-w-[80px]">
              {currentUser.store || 'Store'}
            </span>
          )}
        </div>

        {/* Global Quick Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors border border-border/60 max-w-xs cursor-pointer"
          aria-label="Open search dialog"
        >
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            className="flex-shrink-0 text-muted-foreground"
          />
          <span className="flex-1 text-left truncate">Search products, orders...</span>
          <kbd className="text-3xs bg-card px-1.5 py-0.5 rounded border border-border font-mono shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Action buttons & Shift Attendance Controls */}
      <div className="flex items-center gap-1.5">
        {/* Server Authoritative Shift Controls */}
        {shiftStatus === 'NOT_STARTED' && (
          <button
            onClick={handleStartShift}
            disabled={shiftActionLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Start your duty shift for today"
          >
            <Icon name="PlayIcon" size={13} />
            <span className="hidden sm:inline">Start Shift</span>
          </button>
        )}

        {shiftStatus === 'ACTIVE' && (
          <div className="flex items-center gap-1.5">
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold"
              title="Shift in progress (HH:MM)"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {elapsedDisplay}
            </span>
            <button
              onClick={handleEndShift}
              disabled={shiftActionLoading}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-50"
              title="End duty shift for today"
            >
              End Shift
            </button>
          </div>
        )}

        {shiftStatus === 'COMPLETED' && (
          <span
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-3xs font-bold bg-muted text-muted-foreground border border-border"
            title={`Today's shift completed (${elapsedDisplay})`}
          >
            <Icon name="CheckCircleIcon" size={12} className="text-emerald-500" />
            <span className="hidden sm:inline">Shift Done ({elapsedDisplay})</span>
            <span className="sm:hidden">Done</span>
          </span>
        )}

        <div className="w-px h-5 bg-border/60 mx-1 hidden sm:block" />

        {/* Mobile search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="btn-ghost md:hidden w-8 h-8 p-0 flex items-center justify-center rounded-lg cursor-pointer"
          aria-label="Search"
        >
          <Icon name="MagnifyingGlassIcon" size={18} />
        </button>

        {/* Notifications */}
        <button
          onClick={() => setNotificationsOpen(true)}
          className="btn-ghost w-8 h-8 p-0 flex items-center justify-center rounded-lg relative cursor-pointer"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Icon name="BellIcon" size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger ring-2 ring-card" />
          )}
        </button>

        <div className="w-px h-5 bg-border/60 mx-0.5 hidden lg:block" />

        {/* User profile */}
        <button
          onClick={() => setUserProfileOpen(true)}
          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors border border-transparent hover:border-border/40"
          aria-label="User profile"
        >
          <div className="relative">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-7 h-7 rounded-full object-cover border border-border flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {currentUser.avatar}
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-card ${
                shiftStatus === 'ACTIVE'
                  ? 'bg-emerald-500 animate-pulse'
                  : shiftStatus === 'COMPLETED'
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
              }`}
              title={
                shiftStatus === 'ACTIVE'
                  ? 'Active Shift'
                  : shiftStatus === 'COMPLETED'
                    ? 'Shift Completed'
                    : 'Shift Not Started'
              }
            />
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[120px]">
              {currentUser.name}
            </p>
            <p className="text-3xs text-muted-foreground leading-tight">{currentUser.role}</p>
          </div>
          <Icon
            name="ChevronDownIcon"
            size={12}
            className="text-muted-foreground hidden lg:block"
          />
        </button>
      </div>
    </header>
  );
}
