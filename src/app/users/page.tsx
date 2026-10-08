'use client';
import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useApp, UserAccount } from '@/context/AppContext';
import UserFormModal from '@/components/forms/UserFormModal';
import {
  RBACEngine,
  RBACUser,
  PERMISSION_CATALOGUE,
  PermissionDefinition,
  ROLE_SECURITY_LEVELS,
} from '@/lib/rbacEngine';
import { toast } from 'sonner';

export default function UsersPage() {
  const {
    usersList,
    currentUser,
    toggleUserStatus,
    setUserPermissionOverride,
    deleteUserAccount,
    sales,
    purchases,
    expenses,
    auditLogs,
    formatCurrency,
  } = useApp();

  const [inviteModal, setInviteModal] = useState(false);
  const [editUserModal, setEditUserModal] = useState<UserAccount | null>(null);
  const [permissionsModalUser, setPermissionsModalUser] = useState<UserAccount | null>(null);
  const [performanceModalUser, setPerformanceModalUser] = useState<UserAccount | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<UserAccount | null>(null);

  const handleOpenPermissions = (u: UserAccount) => {
    if (currentUser.role !== 'Super Admin') {
      toast.error('Access Matrix configuration is restricted to Super Admin accounts.');
      return;
    }
    if (u.role === 'Super Admin') {
      toast.info(
        'Super Admin accounts possess unconditional root-level enterprise access. Access Matrix configuration is not applicable.'
      );
      return;
    }
    setPermissionsModalUser(u);
  };

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Suspended'>(
    'All'
  );

  // Permission UI Category Expand/Collapse State
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Active permission target user derived live from usersList
  const activePermissionsUser = useMemo(() => {
    if (!permissionsModalUser) return null;
    return usersList.find((u) => u.id === permissionsModalUser.id) || permissionsModalUser;
  }, [permissionsModalUser, usersList]);

  // Loading state tracking per permission code for live saving feedback
  const [savingPermissionCodes, setSavingPermissionCodes] = useState<Record<string, boolean>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const handleTogglePermission = async (
    targetUserId: string,
    permissionCode: string,
    overrideType: 'ALLOW' | 'DENY' | 'RESET'
  ) => {
    setSavingPermissionCodes((prev) => ({ ...prev, [permissionCode]: true }));
    try {
      await setUserPermissionOverride(targetUserId, permissionCode, overrideType);
    } finally {
      setSavingPermissionCodes((prev) => ({ ...prev, [permissionCode]: false }));
    }
  };

  const handleBulkAllowAll = async (targetUserId: string) => {
    setIsBulkSaving(true);
    try {
      for (const perm of PERMISSION_CATALOGUE) {
        if (!perm.isProtected) {
          await setUserPermissionOverride(targetUserId, perm.code, 'ALLOW');
        }
      }
      toast.success(`Enabled all non-protected permissions`);
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleBulkResetAll = async (targetUserId: string) => {
    setIsBulkSaving(true);
    try {
      for (const perm of PERMISSION_CATALOGUE) {
        if (!perm.isProtected) {
          await setUserPermissionOverride(targetUserId, perm.code, 'RESET');
        }
      }
      toast.info(`Reset custom permission overrides`);
    } finally {
      setIsBulkSaving(false);
    }
  };

  // Convert context users to RBACUser format for engine evaluation
  const rbacCurrentUser: RBACUser = {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    securityLevel: (ROLE_SECURITY_LEVELS as any)[currentUser.role] || 20,
    storeScope: currentUser.store,
    status: 'Active',
    permissions: ['ALL_PERMISSIONS'],
  };

  const rbacUsers: RBACUser[] = usersList.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    securityLevel: (u.securityLevel as any) || (ROLE_SECURITY_LEVELS as any)[u.role] || 20,
    storeScope: u.store,
    allowedStores: u.allowedStores || [u.store],
    status: u.status,
    permissions: u.permissions || [],
    overrides: u.overrides || [],
    avatarUrl: u.avatarUrl,
  }));

  // Server-Side Visibility Protection: Filter protected accounts based on caller security level
  const visibleUsers = useMemo(() => {
    let users = RBACEngine.filterVisibleUsers(rbacCurrentUser, rbacUsers);
    if (currentUser.role === 'Store Manager') {
      users = users.filter(
        (u) =>
          u.role === 'Sales Manager' &&
          (u.storeScope === currentUser.store ||
            (u.allowedStores && u.allowedStores.includes(currentUser.store)))
      );
    }
    if (statusFilter !== 'All') {
      users = users.filter((u) => u.status === statusFilter);
    }
    return users;
  }, [rbacCurrentUser, rbacUsers, currentUser.role, currentUser.store, statusFilter]);

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleDeleteClick = (u: UserAccount) => {
    if (u.role === 'Super Admin' && currentUser.role !== 'Super Admin') {
      toast.error(
        'Deny Access: Protected Boundary. Lower-level roles cannot delete Super Admin accounts.'
      );
      return;
    }
    if (
      currentUser.role === 'Store Manager' &&
      (u.role !== 'Sales Manager' || u.store !== currentUser.store)
    ) {
      toast.error('Store Managers can only delete Sales Manager accounts for their own store.');
      return;
    }
    setDeleteConfirmModal(u);
  };

  const openEdit = (u: UserAccount) => {
    if (u.role === 'Super Admin' && currentUser.role !== 'Super Admin') {
      toast.error(
        'Deny Access: Protected Boundary. Lower-level roles cannot edit Super Admin accounts.'
      );
      return;
    }
    if (
      currentUser.role === 'Store Manager' &&
      (u.role !== 'Sales Manager' || u.store !== currentUser.store)
    ) {
      toast.error('Store Managers can only edit Sales Manager accounts for their own store.');
      return;
    }
    setEditUserModal(u);
  };

  // Group permissions by Category for UI Sections
  const categoriesList = useMemo(() => {
    const cats: Record<string, PermissionDefinition[]> = {};
    PERMISSION_CATALOGUE.forEach((perm) => {
      if (!cats[perm.category]) cats[perm.category] = [];
      cats[perm.category].push(perm);
    });
    return cats;
  }, []);

  // Compute User Performance Analytics from real data
  const getUserPerformance = (user: UserAccount) => {
    const userSales = sales.filter(
      (s) =>
        s.customerName.toLowerCase().includes(user.name.toLowerCase()) || s.store === user.store
    );
    const userRevenue = userSales.reduce((sum, s) => sum + s.total, 0);
    const avgOrderValue = userSales.length > 0 ? userRevenue / userSales.length : 0;

    const userAuditCount = auditLogs.filter(
      (a) => a.userName.toLowerCase() === user.name.toLowerCase()
    ).length;
    const userPurchasesCount = purchases.filter((p) => p.store === user.store).length;
    const userExpensesCount = expenses.filter((e) => e.store === user.store).length;

    return {
      salesCount: userSales.length,
      revenue: userRevenue,
      aov: avgOrderValue,
      auditCount: userAuditCount,
      purchasesCount: userPurchasesCount,
      expensesCount: userExpensesCount,
    };
  };

  const roleDescriptions = [
    {
      role: 'Super Admin',
      level: 100,
      access:
        'Level 100 — Unrestricted enterprise authority, user provisioning, global settings & enterprise audit logs.',
      badge: 'badge-danger',
    },
    {
      role: 'Store Manager',
      level: 80,
      access:
        'Level 80 — Assigned store operations, local inventory CRUD, purchase orders, customer CRM & daily reporting.',
      badge: 'badge-warning',
    },
    {
      role: 'Sales Manager',
      level: 40,
      access:
        'Level 40 — POS terminal billing checkout, walk-in customer creation, receipt printing & sale photo proof.',
      badge: 'badge-primary',
    },
  ];

  if (currentUser.role === 'Sales Manager') {
    return (
      <AppLayout activeRoute="/users">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
              <span className="text-danger text-xl">🔒</span>
            </div>
            <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Sales Managers do not have permissions to manage user accounts.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeRoute="/users">
      <div className="space-y-4 md:space-y-6 fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Users & Roles</h1>
            <p className="page-subtitle">Accounts, permissions & security hierarchy</p>
          </div>
          <button
            onClick={() => setInviteModal(true)}
            className="btn-primary gap-1.5 text-xs flex-shrink-0"
          >
            <Icon name="UserPlusIcon" size={14} />
            <span className="hidden sm:inline">Add User</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Security Level Matrix Cards */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-[var(--page-gutter)] px-[var(--page-gutter)] md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-3 pb-1 md:pb-0">
          {roleDescriptions.map((rd) => (
            <div
              key={`matrix-${rd.role}`}
              className="card p-3 md:p-4 space-y-1.5 border-l-4 min-w-[160px] md:min-w-0 flex-shrink-0 md:flex-shrink"
              style={{
                borderColor:
                  rd.level === 100
                    ? 'var(--danger)'
                    : rd.level === 80
                      ? 'var(--warning)'
                      : 'var(--primary)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`${rd.badge} text-2xs`}>Lvl {rd.level}</span>
                <span className="text-3xs font-bold uppercase text-muted-foreground">
                  {rd.role}
                </span>
              </div>
              <p className="text-2xs md:text-xs text-muted-foreground leading-relaxed">
                {rd.access}
              </p>
            </div>
          ))}
        </div>

        {/* Filter Bar & User Roster */}
        <div className="card overflow-hidden">
          <div className="px-3 md:px-4 py-3 border-b border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h3 className="section-header">Accounts</h3>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              {(['All', 'Active', 'Inactive', 'Suspended'] as const).map((st) => (
                <button
                  key={`filter-${st}`}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === st
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile User Cards (<md) */}
          <div className="block md:hidden divide-y divide-border">
            {visibleUsers.map((u) => {
              const level =
                u.securityLevel ||
                (u.role === 'Super Admin' ? 100 : u.role === 'Store Manager' ? 80 : 40);
              const isProtectedSuperAdmin = u.role === 'Super Admin';
              const fullUserRecord = usersList.find((usr) => usr.id === u.id);
              const allowedStores = u.allowedStores || [u.storeScope];

              return (
                <div
                  key={`m-usr-${u.id}`}
                  className="p-4 space-y-3 bg-card hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt={u.name}
                          className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {u.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-sm text-foreground truncate">{u.name}</p>
                          {isProtectedSuperAdmin && (
                            <span className="text-3xs bg-danger/10 text-danger border border-danger/20 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              <Icon name="LockClosedIcon" size={10} /> Level 100
                            </span>
                          )}
                        </div>
                        <p className="text-2xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <select
                      value={u.status}
                      disabled={isProtectedSuperAdmin && currentUser.role !== 'Super Admin'}
                      onChange={(e) => toggleUserStatus(u.id, e.target.value as any)}
                      className={`text-3xs font-bold px-2 py-1 rounded-md border flex-shrink-0 ${
                        u.status === 'Active'
                          ? 'bg-positive/10 text-positive border-positive/30'
                          : u.status === 'Suspended'
                            ? 'bg-danger/10 text-danger border-danger/30'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      <option value="Active">ACTIVE</option>
                      <option value="Inactive">INACTIVE</option>
                      <option value="Suspended">SUSPENDED</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap text-2xs pt-1 border-t border-border/50">
                    <span
                      className={`badge ${level === 100 ? 'badge-danger' : level === 80 ? 'badge-warning' : 'badge-info'} text-3xs`}
                    >
                      Level {level} · {u.role}
                    </span>

                    <div className="flex items-center gap-1">
                      <span className="text-3xs text-muted-foreground font-semibold">Stores:</span>
                      {allowedStores.map((st) => (
                        <span
                          key={`st-m-${st}`}
                          className="badge-secondary text-3xs font-mono font-bold px-1.5 py-0.5"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <div className="flex items-center gap-1.5">
                      {fullUserRecord && (
                        <button
                          onClick={() => setPerformanceModalUser(fullUserRecord)}
                          className="btn-secondary text-3xs py-1 px-2 gap-1"
                        >
                          <Icon name="ChartBarIcon" size={13} />
                          Metrics
                        </button>
                      )}

                      {currentUser.role === 'Super Admin' &&
                        fullUserRecord &&
                        (isProtectedSuperAdmin ? (
                          <span className="badge-danger text-3xs py-1 px-2 gap-1 font-bold flex items-center">
                            <Icon name="ShieldCheckIcon" size={12} />
                            Full Root Access
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenPermissions(fullUserRecord)}
                            className="btn-primary text-3xs py-1 px-2 gap-1"
                          >
                            <Icon name="KeyIcon" size={13} />
                            Access Matrix
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop User Table (>=md) */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="table-header">
                  <th className="py-3 px-4 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    User Identity
                  </th>
                  <th className="py-3 px-4">Role & Security Level</th>
                  <th className="py-3 px-4">Store Scope & Access</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4 text-right">Security Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {visibleUsers.map((u) => {
                  const level =
                    u.securityLevel ||
                    (u.role === 'Super Admin' ? 100 : u.role === 'Store Manager' ? 80 : 40);
                  const isProtectedSuperAdmin = u.role === 'Super Admin';
                  const fullUserRecord = usersList.find((usr) => usr.id === u.id);
                  const allowedStores = u.allowedStores || [u.storeScope];

                  return (
                    <tr key={`usr-row-${u.id}`} className="table-row">
                      <td className="py-3 px-4 font-medium text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center gap-2.5">
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {u.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-foreground">{u.name}</p>
                              {isProtectedSuperAdmin && (
                                <span className="text-3xs bg-danger/10 text-danger border border-danger/20 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-0.5">
                                  <Icon name="LockClosedIcon" size={10} /> Level 100
                                </span>
                              )}
                            </div>
                            <p className="text-3xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`badge ${level === 100 ? 'badge-danger' : level === 80 ? 'badge-warning' : 'badge-info'} text-3xs`}
                        >
                          Level {level} · {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {allowedStores.map((st) => (
                            <span
                              key={`st-badge-${st}`}
                              className="badge-secondary text-3xs font-mono font-bold"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.status}
                          disabled={isProtectedSuperAdmin && currentUser.role !== 'Super Admin'}
                          onChange={(e) => toggleUserStatus(u.id, e.target.value as any)}
                          className={`text-3xs font-bold px-2 py-1 rounded-lg border ${
                            u.status === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : u.status === 'Suspended'
                                ? 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                                : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          <option value="Active">ACTIVE</option>
                          <option value="Inactive">INACTIVE</option>
                          <option value="Suspended">SUSPENDED</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {fullUserRecord && (
                            <button
                              onClick={() => setPerformanceModalUser(fullUserRecord)}
                              className="btn-secondary h-7 text-3xs py-1 px-2.5 gap-1"
                              title="Employee Performance Metrics"
                            >
                              <Icon name="ChartBarIcon" size={12} />
                              Metrics
                            </button>
                          )}

                          {currentUser.role === 'Super Admin' &&
                            fullUserRecord &&
                            (isProtectedSuperAdmin ? (
                              <span
                                className="inline-flex items-center gap-1 text-3xs font-extrabold px-2 py-1 rounded-lg bg-danger/10 text-danger border border-danger/20"
                                title="Super Admin holds unrestricted root-level access to all modules, pages, stores, and actions."
                              >
                                <Icon name="ShieldCheckIcon" size={12} />
                                Full Root Access
                              </span>
                            ) : (
                              <button
                                onClick={() => handleOpenPermissions(fullUserRecord)}
                                className="btn-primary h-7 text-3xs py-1 px-2.5 gap-1"
                                title="Config Granular Permissions"
                              >
                                <Icon name="KeyIcon" size={12} />
                                Access Matrix
                              </button>
                            ))}

                          {(!isProtectedSuperAdmin || currentUser.role === 'Super Admin') &&
                            fullUserRecord && (
                              <>
                                <button
                                  onClick={() => openEdit(fullUserRecord)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Edit User"
                                >
                                  <Icon name="PencilSquareIcon" size={14} />
                                </button>
                                {u.id !== currentUser.id && (
                                  <button
                                    onClick={() => handleDeleteClick(fullUserRecord)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                                    title="Delete User"
                                  >
                                    <Icon name="TrashIcon" size={14} />
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reusable Single-Source-of-Truth User Form Modal */}
      <UserFormModal
        open={inviteModal || !!editUserModal}
        onClose={() => {
          setInviteModal(false);
          setEditUserModal(null);
        }}
        user={editUserModal}
      />

      {/* Non-Super-Admin User Access & Permissions Matrix Modal */}
      {activePermissionsUser && activePermissionsUser.role !== 'Super Admin' && (
        <Modal
          open={!!permissionsModalUser}
          onClose={() => setPermissionsModalUser(null)}
          title={`User Access & Permissions — ${activePermissionsUser.name}`}
          subtitle={`${activePermissionsUser.email} · Role: ${activePermissionsUser.role} (Level ${activePermissionsUser.securityLevel || 80})`}
          size="lg"
        >
          <div className="space-y-5 py-2">
            {/* Authorized Store Scope */}
            <div className="card p-4 bg-muted/30 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  AUTHORIZED OPERATIONAL STORE
                </span>
                <span className="text-2xs text-muted-foreground">
                  Permanently scoped operational store
                </span>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <span className="badge-primary font-mono text-xs font-bold px-3 py-1">
                  {activePermissionsUser.store || 'BLR'}
                </span>
                <span className="text-2xs text-muted-foreground">
                  Store Manager and Sales Manager roles are strictly locked to exactly one
                  operational store.
                </span>
              </div>
            </div>

            {/* Quick Bulk Action Buttons */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-primary/5 p-3 rounded-xl border border-primary/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Icon name="AdjustmentsHorizontalIcon" size={16} className="text-primary" />
                <span>Quick Permission Toggles (Safe Actions Only)</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBulkSaving}
                  onClick={() => handleBulkAllowAll(activePermissionsUser.id)}
                  className="btn-secondary text-3xs font-bold text-success border-success/30 hover:bg-success/10 py-1 disabled:opacity-50"
                >
                  {isBulkSaving ? 'Saving...' : 'Enable All Allowed Permissions'}
                </button>

                <button
                  type="button"
                  disabled={isBulkSaving}
                  onClick={() => handleBulkResetAll(activePermissionsUser.id)}
                  className="btn-secondary text-3xs font-bold text-muted-foreground py-1 disabled:opacity-50"
                >
                  {isBulkSaving ? 'Saving...' : 'Disable All Optional Overrides'}
                </button>
              </div>
            </div>

            {/* Expandable Module Permission Groups */}
            <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-3">
              {Object.entries(categoriesList).map(([category, perms]) => {
                const isCollapsed = collapsedCategories[category];

                // Page View Permission Code
                const pageViewPerm = perms.find((p) => p.code.endsWith('.view'));
                const pageViewState = pageViewPerm
                  ? RBACEngine.getPermissionState(
                      {
                        id: activePermissionsUser.id,
                        name: activePermissionsUser.name,
                        email: activePermissionsUser.email,
                        role: activePermissionsUser.role,
                        securityLevel:
                          (activePermissionsUser.securityLevel as any) ||
                          (activePermissionsUser.role === 'Super Admin' ? 100 : 80),
                        storeScope: activePermissionsUser.store,
                        status: activePermissionsUser.status,
                        permissions: activePermissionsUser.permissions || [],
                        overrides: activePermissionsUser.overrides || [],
                      },
                      pageViewPerm.code
                    )
                  : 'Denied';

                const isPageOn = pageViewState === 'Allowed' || pageViewState === 'Custom Allow';

                return (
                  <div
                    key={`cat-sec-${category}`}
                    className="border border-border rounded-xl overflow-hidden bg-card"
                  >
                    {/* Module Header with Page ON/OFF Switch */}
                    <div
                      className="p-3 bg-muted/40 flex items-center justify-between gap-3 cursor-pointer select-none"
                      onClick={() => toggleCategoryCollapse(category)}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Icon
                            name={isCollapsed ? 'ChevronRightIcon' : 'ChevronDownIcon'}
                            size={16}
                          />
                        </button>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                          {category} MODULE
                        </h4>
                        <span className="text-3xs text-muted-foreground">
                          ({perms.length} actions)
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-2xs font-semibold text-muted-foreground hidden sm:inline">
                          {category} Access:
                        </span>
                        {pageViewPerm && !pageViewPerm.isProtected ? (
                          <ToggleSwitch
                            checked={isPageOn}
                            loading={Boolean(savingPermissionCodes[pageViewPerm.code])}
                            onChange={() =>
                              handleTogglePermission(
                                activePermissionsUser.id,
                                pageViewPerm.code,
                                isPageOn ? 'DENY' : 'ALLOW'
                              )
                            }
                            size="sm"
                            onText="ON"
                            offText="OFF"
                            title={`Toggle entire ${category} module access`}
                          />
                        ) : (
                          <span
                            className={`text-3xs font-bold px-2 py-0.5 rounded-full ${isPageOn ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}
                          >
                            {isPageOn ? 'ON' : 'OFF'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Toggles Inside Category */}
                    {!isCollapsed && (
                      <div className="p-3 divide-y divide-border space-y-2">
                        {perms.map((perm) => {
                          const permState = RBACEngine.getPermissionState(
                            {
                              id: activePermissionsUser.id,
                              name: activePermissionsUser.name,
                              email: activePermissionsUser.email,
                              role: activePermissionsUser.role,
                              securityLevel:
                                (activePermissionsUser.securityLevel as any) ||
                                (activePermissionsUser.role === 'Super Admin' ? 100 : 80),
                              storeScope: activePermissionsUser.store,
                              status: activePermissionsUser.status,
                              permissions: activePermissionsUser.permissions || [],
                              overrides: activePermissionsUser.overrides || [],
                            },
                            perm.code
                          );

                          const isActionOn =
                            permState === 'Allowed' || permState === 'Custom Allow';

                          return (
                            <div
                              key={`perm-item-${perm.code}`}
                              className="pt-2 flex items-center justify-between gap-4"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground">
                                    {perm.name}
                                  </span>
                                  <span className="text-3xs font-mono text-muted-foreground">
                                    ({perm.code})
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {perm.isProtected &&
                                (activePermissionsUser.securityLevel || 80) < 100 ? (
                                  <span className="badge-danger text-3xs flex items-center gap-1 font-bold">
                                    <Icon name="LockClosedIcon" size={11} /> 🔒 Super Admin Only
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-3xs font-bold px-1.5 py-0.5 rounded ${
                                        permState === 'Custom Allow'
                                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                          : permState === 'Custom Deny'
                                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                            : 'text-muted-foreground'
                                      }`}
                                    >
                                      {permState}
                                    </span>
                                    {/* Prominent ON / OFF Clickable Toggle Switch with Loading Indicator */}
                                    <ToggleSwitch
                                      checked={isActionOn}
                                      loading={Boolean(savingPermissionCodes[perm.code])}
                                      onChange={() =>
                                        handleTogglePermission(
                                          activePermissionsUser.id,
                                          perm.code,
                                          isActionOn ? 'DENY' : 'ALLOW'
                                        )
                                      }
                                      size="sm"
                                      onText="ON"
                                      offText="OFF"
                                      title={`Toggle ${perm.name} (${perm.code})`}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button onClick={() => setPermissionsModalUser(null)} className="btn-primary text-xs">
                Close Access Settings
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* User Activity & Real Performance Drawer / Modal */}
      {performanceModalUser && (
        <Modal
          open={!!performanceModalUser}
          onClose={() => setPerformanceModalUser(null)}
          title={`Real Performance Analytics — ${performanceModalUser.name}`}
          subtitle={`${performanceModalUser.role} (Level ${performanceModalUser.securityLevel || 80}) · Store Scope: ${performanceModalUser.store}`}
          size="lg"
        >
          {(() => {
            const perf = getUserPerformance(performanceModalUser);
            return (
              <div className="space-y-5 py-2">
                {/* Performance Metric Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-3.5 bg-muted/30 border border-border">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase">
                      Sales Revenue
                    </p>
                    <p className="text-lg font-bold text-foreground font-tabular mt-1">
                      {formatCurrency(perf.revenue)}
                    </p>
                    <p className="text-3xs text-muted-foreground mt-0.5">
                      {perf.salesCount} total transactions
                    </p>
                  </div>

                  <div className="card p-3.5 bg-muted/30 border border-border">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase">
                      Avg Order Value (AOV)
                    </p>
                    <p className="text-lg font-bold text-foreground font-tabular mt-1">
                      {formatCurrency(Math.round(perf.aov))}
                    </p>
                    <p className="text-3xs text-muted-foreground mt-0.5">Per order metric</p>
                  </div>

                  <div className="card p-3.5 bg-muted/30 border border-border">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase">
                      Activity Log Count
                    </p>
                    <p className="text-lg font-bold text-foreground font-tabular mt-1">
                      {perf.auditCount}
                    </p>
                    <p className="text-3xs text-muted-foreground mt-0.5">Verified server actions</p>
                  </div>
                </div>

                {/* Operations Summary */}
                <div className="card p-4 border border-border space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Store Operations Handled
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-muted-foreground">Purchase Orders (POs):</span>
                      <span className="font-bold text-foreground">{perf.purchasesCount}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border">
                      <span className="text-muted-foreground">Operating Expenses:</span>
                      <span className="font-bold text-foreground">{perf.expensesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={() => setPerformanceModalUser(null)}
                    className="btn-primary text-xs"
                  >
                    Close Performance View
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteConfirmModal && (
        <Modal
          open={!!deleteConfirmModal}
          onClose={() => setDeleteConfirmModal(null)}
          title="Delete User Account"
          subtitle={`Are you sure you want to remove ${deleteConfirmModal.name}?`}
          size="sm"
        >
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              If this account has historical sales, inventory adjustments, or audit log entries
              associated with it, consider setting status to{' '}
              <span className="font-bold text-danger">SUSPENDED</span> instead of deleting.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setDeleteConfirmModal(null)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteUserAccount(deleteConfirmModal.id);
                  setDeleteConfirmModal(null);
                }}
                className="btn-danger text-xs"
              >
                Delete Account
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}
