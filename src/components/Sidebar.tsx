'use client';
import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';
import { getAuthoritativeNavGroups } from '@/lib/rbacEngine';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  activeRoute?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  badgeVariant?: 'danger' | 'warning' | 'info';
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const badgeColorMap: Record<string, string> = {
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-white',
  info: 'bg-info text-white',
};

export default function Sidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
  activeRoute,
}: SidebarProps) {
  const {
    selectedStore,
    setStoreSelectorOpen,
    setUserProfileOpen,
    currentUser,
    inventory,
    purchases,
    branding,
  } = useApp();

  const lowStockCount = inventory.filter((i) => i.qtyOnHand <= i.reorderPt).length;
  const pendingPOCount = purchases.filter(
    (p) => p.status === 'Sent' || p.status === 'Draft'
  ).length;

  const navGroups = getAuthoritativeNavGroups(currentUser, {
    lowStock: lowStockCount,
    pendingPO: pendingPOCount,
  });

  const sidebarClasses = [
    'fixed top-0 left-0 h-full z-50 flex flex-col bg-card border-r border-border shadow-sidebar sidebar-transition overflow-hidden',
    collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
    'hidden lg:flex',
  ].join(' ');

  const mobileSidebarClasses = [
    'fixed top-0 left-0 h-full z-50 flex flex-col bg-card border-r border-border shadow-sidebar sidebar-transition overflow-hidden w-[var(--sidebar-width)]',
    'lg:hidden',
    mobileOpen ? 'translate-x-0' : '-translate-x-full',
  ].join(' ');

  const renderNavItem = (item: NavItem) => {
    const isActive =
      activeRoute === item.href || (activeRoute === '/' && item.href === '/dashboard');
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={onMobileClose}
        className={`${isActive ? 'nav-item-active' : 'nav-item'} group relative`}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon
          name={item.icon as Parameters<typeof Icon>[0]['name']}
          size={17}
          className={`flex-shrink-0 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
        />
        {!collapsed && (
          <span className="flex-1 truncate text-[13px] tracking-tight">{item.label}</span>
        )}
        {!collapsed && item.badge !== undefined && item.badge > 0 && (
          <span
            className={`text-3xs px-1.5 py-0.5 rounded-full font-bold ${badgeColorMap[item.badgeVariant ?? 'info']}`}
          >
            {item.badge}
          </span>
        )}
        {collapsed && item.badge !== undefined && item.badge > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-warning ring-2 ring-card" />
        )}
      </Link>
    );
  };

  const renderSidebarContent = (isCollapsed: boolean) => (
    <>
      {/* Logo */}
      <div
        className={`flex items-center justify-between gap-2 px-3.5 py-3 border-b border-border/60 flex-shrink-0 ${isCollapsed ? 'justify-center px-2' : ''}`}
      >
        <Link href="/sales" onClick={onMobileClose} className="flex items-center gap-2 min-w-0">
          <AppLogo size={24} showText={!isCollapsed} />
        </Link>
        {!isCollapsed && (
          <button
            onClick={onMobileClose}
            className="lg:hidden text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close sidebar"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        )}
      </div>

      {/* Store selector */}
      {!isCollapsed &&
        (() => {
          const isSuperAdmin = currentUser.role === 'Super Admin';
          const userAllowed =
            currentUser.allowedStores && currentUser.allowedStores.length > 0
              ? currentUser.allowedStores
              : currentUser.store && currentUser.store !== 'All Stores'
                ? [currentUser.store]
                : ['BLR'];
          const canSwitch = isSuperAdmin;

          if (canSwitch) {
            return (
              <div className="px-2.5 py-2 border-b border-border/60 flex-shrink-0">
                <div
                  onClick={() => setStoreSelectorOpen(true)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/30 border border-border/60 cursor-pointer hover:bg-muted hover:border-slate-300 transition-all shadow-2xs group"
                  title={
                    isSuperAdmin
                      ? 'Switch active store scope'
                      : 'Switch between your assigned stores'
                  }
                >
                  <div
                    className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-white text-3xs font-bold ${
                      selectedStore === 'All Stores'
                        ? 'bg-primary'
                        : selectedStore === 'CENTRAL'
                          ? 'bg-slate-800'
                          : 'gradient-primary'
                    }`}
                  >
                    {selectedStore === 'All Stores' ? 'ALL' : selectedStore.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                      {branding.appName}
                    </p>
                    <p className="text-3xs text-muted-foreground truncate leading-tight mt-0.5">
                      {selectedStore === 'All Stores'
                        ? 'Consolidated View'
                        : selectedStore === 'CENTRAL'
                          ? 'Central Warehouse'
                          : `${selectedStore} Store`}
                    </p>
                  </div>
                  <Icon
                    name="ChevronUpDownIcon"
                    size={14}
                    className="text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-colors"
                  />
                </div>
              </div>
            );
          }

          return (
            <div className="px-2.5 py-2 border-b border-border/60 flex-shrink-0">
              <div
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/20 border border-border/40 select-none"
                title={`Assigned to ${userAllowed[0] || currentUser.store || selectedStore}`}
              >
                <div className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center text-white text-3xs font-bold gradient-primary">
                  {(userAllowed[0] || currentUser.store || selectedStore || 'BLR').slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate leading-tight">
                    {branding.appName}
                  </p>
                  <p className="text-3xs text-muted-foreground truncate leading-tight mt-0.5">
                    {userAllowed[0] || currentUser.store || selectedStore} Store
                  </p>
                </div>
                <span className="text-3xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                  Assigned
                </span>
              </div>
            </div>
          );
        })()}

      {/* Nav groups */}
      <nav
        className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2.5 space-y-4"
        aria-label="Main navigation"
      >
        {navGroups.map((group) => (
          <div key={group.id}>
            {!isCollapsed && (
              <p className="px-3 mb-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">{group.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div
        className={`border-t border-border/60 p-2.5 flex-shrink-0 ${isCollapsed ? 'flex justify-center' : ''}`}
      >
        {isCollapsed ? (
          <button
            onClick={() => setUserProfileOpen(true)}
            className="w-8 h-8 rounded-full overflow-hidden cursor-pointer hover:opacity-90 flex-shrink-0"
            aria-label="User profile"
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
                {currentUser.avatar}
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => setUserProfileOpen(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 cursor-pointer hover:bg-muted/60 rounded-lg transition-colors text-left"
            aria-label="User profile"
          >
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {currentUser.avatar}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{currentUser.name}</p>
              <p className="text-2xs text-muted-foreground">{currentUser.role}</p>
            </div>
            <Icon
              name="ArrowRightOnRectangleIcon"
              size={16}
              className="text-muted-foreground hover:text-danger transition-colors flex-shrink-0"
            />
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={sidebarClasses}>{renderSidebarContent(collapsed)}</div>

      {/* Mobile sidebar (accessed via hamburger for full navigation) */}
      <div className={mobileSidebarClasses}>{renderSidebarContent(false)}</div>
    </>
  );
}
