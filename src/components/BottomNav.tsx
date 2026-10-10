'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import BottomSheet from '@/components/ui/BottomSheet';
import { useApp } from '@/context/AppContext';
import { getMobileMoreNav, isRouteAllowed } from '@/lib/rbacEngine';

export default function BottomNav() {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [localItems, setLocalItems] = useState<
    Array<{ id: string; label: string; icon: string; href: string }>
  >([]);

  // 5-Position Nav Layout: Sales is ALWAYS the exact center (Position 3)
  const leftSlots = useMemo(() => {
    const rawSlots = [
      { id: 'bnav-dashboard', label: 'Home', icon: 'HomeIcon', href: '/dashboard' },
      { id: 'bnav-inventory', label: 'Inventory', icon: 'CubeIcon', href: '/inventory-management' },
    ];
    return rawSlots.filter((slot) => isRouteAllowed(slot.href, currentUser));
  }, [currentUser]);

  const rightSlotCustomer = {
    id: 'bnav-customers',
    label: 'Customers',
    icon: 'UsersIcon',
    href: '/customers',
  };

  const isSalesAllowed = isRouteAllowed('/sales', currentUser);
  const isCustomerAllowed = isRouteAllowed('/customers', currentUser);

  // Authoritative secondary items for More BottomSheet from single source of truth
  const authoritativeSecondaryNav = useMemo(() => {
    return getMobileMoreNav(currentUser);
  }, [currentUser]);

  // Load user UI preference from API on mount
  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    fetch('/api/users/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (!isCancelled && data.success && Array.isArray(data.preferences?.mobileMoreNavOrder)) {
          setSavedOrder(data.preferences.mobileMoreNavOrder);
        }
      })
      .catch((err) => console.warn('Could not load user UI preferences:', err));

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  // Merge authoritative items with user's saved preference
  useEffect(() => {
    if (authoritativeSecondaryNav.length === 0) {
      setLocalItems([]);
      return;
    }

    if (savedOrder.length === 0) {
      setLocalItems(authoritativeSecondaryNav);
      return;
    }

    // 1. Filter out any forbidden items from savedOrder
    // 2. Sort authoritative items by savedOrder position
    // 3. Append newly available items to the end
    const itemsMap = new Map(authoritativeSecondaryNav.map((item) => [item.id, item]));
    const ordered: typeof authoritativeSecondaryNav = [];

    for (const id of savedOrder) {
      const match = itemsMap.get(id);
      if (match) {
        ordered.push(match);
        itemsMap.delete(id);
      }
    }

    // Append any remaining items (new modules or unranked)
    for (const remaining of itemsMap.values()) {
      ordered.push(remaining);
    }

    setLocalItems(ordered);
  }, [authoritativeSecondaryNav, savedOrder]);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIndex) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const copy = [...localItems];
    const [moved] = copy.splice(draggedIdx, 1);
    copy.splice(targetIndex, 0, moved);
    setLocalItems(copy);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleTouchStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedIdx === null) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const rowEl = el?.closest('[data-reorder-index]');
    if (rowEl) {
      const idx = Number(rowEl.getAttribute('data-reorder-index'));
      if (!isNaN(idx) && idx !== dragOverIdx) {
        setDragOverIdx(idx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const copy = [...localItems];
      const [moved] = copy.splice(draggedIdx, 1);
      copy.splice(dragOverIdx, 0, moved);
      setLocalItems(copy);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localItems.length) return;

    const copy = [...localItems];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setLocalItems(copy);
  };

  const handleSaveOrder = async () => {
    setIsSaving(true);
    try {
      const newOrderIds = localItems.map((item) => item.id);
      const res = await fetch('/api/users/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { mobileMoreNavOrder: newOrderIds },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedOrder(newOrderIds);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to save mobile navigation order:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { mobileMoreNavOrder: null },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedOrder([]);
        setLocalItems(authoritativeSecondaryNav);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to reset mobile navigation order:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Revert local items to saved order
    if (savedOrder.length === 0) {
      setLocalItems(authoritativeSecondaryNav);
    } else {
      const itemsMap = new Map(authoritativeSecondaryNav.map((item) => [item.id, item]));
      const ordered: typeof authoritativeSecondaryNav = [];
      for (const id of savedOrder) {
        const match = itemsMap.get(id);
        if (match) {
          ordered.push(match);
          itemsMap.delete(id);
        }
      }
      for (const remaining of itemsMap.values()) {
        ordered.push(remaining);
      }
      setLocalItems(ordered);
    }
    setIsEditing(false);
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/' || pathname === '/dashboard';
    return pathname?.startsWith(href) ?? false;
  };

  const isSalesActive = pathname?.startsWith('/sales') ?? false;
  const isMoreActive = localItems.some((item) => isActive(item.href));

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border/80 lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
        style={{ height: 'calc(var(--bottomnav-height, 56px) + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between h-14 max-w-lg mx-auto px-2 relative">
          {/* Position 1 (Left 1) */}
          {leftSlots[0] ? (
            <Link
              href={leftSlots[0].href}
              className="flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors"
              data-active={isActive(leftSlots[0].href)}
              aria-current={isActive(leftSlots[0].href) ? 'page' : undefined}
              aria-label={leftSlots[0].label}
            >
              <Icon
                name={leftSlots[0].icon as Parameters<typeof Icon>[0]['name']}
                size={20}
                className={isActive(leftSlots[0].href) ? 'text-primary' : 'text-muted-foreground'}
              />
              <span
                className={`text-4xs mt-0.5 font-semibold leading-none ${
                  isActive(leftSlots[0].href) ? 'text-primary font-bold' : 'text-muted-foreground'
                }`}
              >
                {leftSlots[0].label}
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {/* Position 2 (Left 2) */}
          {leftSlots[1] ? (
            <Link
              href={leftSlots[1].href}
              className="flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors"
              data-active={isActive(leftSlots[1].href)}
              aria-current={isActive(leftSlots[1].href) ? 'page' : undefined}
              aria-label={leftSlots[1].label}
            >
              <Icon
                name={leftSlots[1].icon as Parameters<typeof Icon>[0]['name']}
                size={20}
                className={isActive(leftSlots[1].href) ? 'text-primary' : 'text-muted-foreground'}
              />
              <span
                className={`text-4xs mt-0.5 font-semibold leading-none ${
                  isActive(leftSlots[1].href) ? 'text-primary font-bold' : 'text-muted-foreground'
                }`}
              >
                {leftSlots[1].label}
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {/* Position 3 (EXACT CENTER) — SALES CONTROL */}
          {isSalesAllowed ? (
            <div className="flex-1 flex flex-col items-center justify-center relative -top-3.5 px-1">
              <Link
                href="/sales"
                className={`group flex flex-col items-center justify-center transition-transform active:scale-95 min-h-[48px] min-w-[48px] ${
                  isSalesActive ? 'scale-105' : ''
                }`}
                aria-current={isSalesActive ? 'page' : undefined}
                aria-label="Sales and POS Terminal"
              >
                <div
                  className={`w-13 h-13 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-md ${
                    isSalesActive
                      ? 'bg-gradient-to-tr from-primary to-primary/85 text-primary-foreground ring-4 ring-primary/25 shadow-primary/35 shadow-lg'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-background shadow-primary/20'
                  }`}
                >
                  <Icon name="ShoppingCartIcon" size={24} className="text-white" />
                </div>
                <span
                  className={`text-4xs font-black tracking-wider uppercase mt-1 leading-none ${
                    isSalesActive ? 'text-primary font-extrabold' : 'text-foreground'
                  }`}
                >
                  SALES
                </span>
              </Link>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Position 4 (Right 1) — Customers */}
          {isCustomerAllowed ? (
            <Link
              href={rightSlotCustomer.href}
              className="flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors"
              data-active={isActive(rightSlotCustomer.href)}
              aria-current={isActive(rightSlotCustomer.href) ? 'page' : undefined}
              aria-label={rightSlotCustomer.label}
            >
              <Icon
                name={rightSlotCustomer.icon as Parameters<typeof Icon>[0]['name']}
                size={20}
                className={
                  isActive(rightSlotCustomer.href) ? 'text-primary' : 'text-muted-foreground'
                }
              />
              <span
                className={`text-4xs mt-0.5 font-semibold leading-none ${
                  isActive(rightSlotCustomer.href)
                    ? 'text-primary font-bold'
                    : 'text-muted-foreground'
                }`}
              >
                {rightSlotCustomer.label}
              </span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}

          {/* Position 5 (Right 2) — More Sheet */}
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setMoreOpen(true);
            }}
            className="flex-1 flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center cursor-pointer transition-colors"
            data-active={isMoreActive}
            aria-label="More navigation modules"
          >
            <Icon
              name="EllipsisHorizontalIcon"
              size={20}
              className={isMoreActive ? 'text-primary' : 'text-muted-foreground'}
            />
            <span
              className={`text-4xs mt-0.5 font-semibold leading-none ${
                isMoreActive ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More Modules Bottom Sheet */}
      <BottomSheet
        open={moreOpen}
        onClose={() => {
          setIsEditing(false);
          setMoreOpen(false);
        }}
        title="All Modules & Features"
      >
        {/* Custom Header Bar with Edit / Reorder Controls */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/60">
          <span className="text-xs font-semibold text-muted-foreground">
            {isEditing
              ? 'Reorder modules (tap arrows to sort)'
              : `${localItems.length} modules available`}
          </span>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors min-h-[36px]"
              >
                <Icon name="PencilSquareIcon" size={14} />
                <span>Edit Order</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetDefault}
                  disabled={isSaving}
                  className="px-2.5 py-1.5 rounded-lg text-2xs font-medium text-muted-foreground hover:bg-muted transition-colors min-h-[36px]"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-2.5 py-1.5 rounded-lg text-2xs font-medium text-muted-foreground hover:bg-muted transition-colors min-h-[36px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrder}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs min-h-[36px] flex items-center gap-1"
                >
                  <Icon name="CheckIcon" size={13} />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Regular Grid View */}
        {!isEditing ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 py-2 max-h-[60vh] overflow-y-auto">
            {localItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl cursor-pointer transition-all min-h-[44px] ${
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary font-bold shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground active:scale-98'
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted'
                  }`}
                >
                  <Icon
                    name={item.icon as Parameters<typeof Icon>[0]['name']}
                    size={20}
                    className={isActive(item.href) ? 'text-white' : 'text-foreground'}
                  />
                </div>
                <span className="text-3xs font-semibold text-center leading-tight line-clamp-2">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          /* Reorder View with Touch/Pointer Drag & Accessible Up/Down Buttons */
          <div className="space-y-1.5 py-2 max-h-[60vh] overflow-y-auto">
            {localItems.map((item, idx) => {
              const isItemDragging = draggedIdx === idx;
              const isTargetOver = dragOverIdx === idx && draggedIdx !== idx;

              return (
                <div
                  key={item.id}
                  data-reorder-index={idx}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    isItemDragging
                      ? 'opacity-40 border-primary bg-primary/10 shadow-inner'
                      : isTargetOver
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/5 shadow-xs scale-[1.01]'
                        : 'border-border/70 bg-card/60 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Touch / Pointer Drag Handle */}
                    <button
                      type="button"
                      onTouchStart={() => handleTouchStart(idx)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted touch-none"
                      title="Drag to reorder"
                      aria-label={`Drag to reorder ${item.label}`}
                    >
                      <Icon name="Bars3Icon" size={18} />
                    </button>

                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon
                        name={item.icon as Parameters<typeof Icon>[0]['name']}
                        size={17}
                        className="text-foreground"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate text-foreground">{item.label}</p>
                      <p className="text-4xs text-muted-foreground truncate">{item.href}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0 || isSaving}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted/80 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      aria-label={`Move ${item.label} up`}
                    >
                      <Icon name="ChevronUpIcon" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === localItems.length - 1 || isSaving}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted/80 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      aria-label={`Move ${item.label} down`}
                    >
                      <Icon name="ChevronDownIcon" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
