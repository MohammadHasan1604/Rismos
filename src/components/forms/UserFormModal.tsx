'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import StoreFormModal from '@/components/forms/StoreFormModal';
import { useApp, UserAccount } from '@/context/AppContext';
import { toast } from 'sonner';

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  user?: UserAccount | null;
  onSuccess?: (user: UserAccount) => void;
  zIndex?: number;
}

// 🔒 STRICT RBAC: Exactly 2 assignable roles. Super Admin is singleton.
const AVAILABLE_ROLES: Array<{
  role: 'Store Manager' | 'Sales Manager';
  level: number;
  desc: string;
}> = [
  { role: 'Store Manager', level: 80, desc: 'Full Store Operations, Staff & Inventory Control' },
  { role: 'Sales Manager', level: 40, desc: 'POS Sales, Inventory View & Customer Management' },
];

export default function UserFormModal({
  open,
  onClose,
  user,
  onSuccess,
  zIndex = 100,
}: UserFormModalProps) {
  const { currentUser, storesList, addUserAccount, updateUserAccount, confirmAction } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'Store Manager' | 'Sales Manager'>('Store Manager');
  // Single source of truth for store access: assignedStores
  const [assignedStores, setAssignedStores] = useState<string[]>([]);
  const [status, setStatus] = useState<'Active' | 'Inactive' | 'Suspended'>('Active');

  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(user);
  const isProtectedSuperAdmin = user?.role === 'Super Admin';
  const isCallerSuperAdmin = currentUser.role === 'Super Admin';

  // Rule 11: Role selector must show only roles caller is permitted to create. Hide forbidden roles.
  const permittedRoles = useMemo(() => {
    if (isCallerSuperAdmin) {
      return AVAILABLE_ROLES;
    }
    if (currentUser.role === 'Store Manager') {
      return AVAILABLE_ROLES.filter((r) => r.role === 'Sales Manager');
    }
    return [];
  }, [isCallerSuperAdmin, currentUser.role]);

  // Caller's allowed stores to assign (avoid stale 'BLR' fallback if not exists)
  const callerAccessibleStores = useMemo(() => {
    if (isCallerSuperAdmin) {
      return storesList.map((s) => s.code);
    }
    if (currentUser.allowedStores && currentUser.allowedStores.length > 0) {
      return currentUser.allowedStores;
    }
    if (currentUser.store && storesList.some((s) => s.code === currentUser.store)) {
      return [currentUser.store];
    }
    return storesList.length > 0 ? [storesList[0].code] : [];
  }, [isCallerSuperAdmin, storesList, currentUser]);

  // Stores available in the selector
  const availableStoreHubs = useMemo(() => {
    return storesList
      .filter((s) => callerAccessibleStores.includes(s.code))
      .sort((a, b) => {
        if (a.code === 'CENTRAL') return -1;
        if (b.code === 'CENTRAL') return 1;
        return a.code.localeCompare(b.code);
      });
  }, [storesList, callerAccessibleStores]);

  // Canonical SelectOption mapping
  const storeOptions: SelectOption[] = useMemo(() => {
    return availableStoreHubs.map((st) => ({
      value: st.code,
      label: `${st.code} — ${st.name}`,
      sublabel: st.city ? st.city : undefined,
      badge: st.code,
    }));
  }, [availableStoreHubs]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  // Initialize ONLY on closed -> open transition or when target user?.id intentionally changes.
  // Never re-initialize due to background sync, storesList refetch, or parent rerenders.
  const prevOpenRef = React.useRef(false);
  const editUserIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetUserChanging = open && Boolean(user?.id) && user?.id !== editUserIdRef.current;

    if (isOpening || isTargetUserChanging) {
      prevOpenRef.current = open;
      editUserIdRef.current = user?.id || null;
      setSubmitError(null);

      if (user) {
        setName(user.name || '');
        setEmail(user.email || '');
        setPhone(user.phone || '');
        setPassword('');
        setShowPassword(false);
        if (user.role !== 'Super Admin') {
          const userRole = (user.role as any) || 'Sales Manager';
          setRole(
            permittedRoles.some((r) => r.role === userRole)
              ? userRole
              : permittedRoles[0]?.role || 'Sales Manager'
          );
        }
        const initialStores = isCallerSuperAdmin
          ? user.allowedStores && user.allowedStores.length > 0
            ? user.allowedStores
            : user.store
              ? [user.store]
              : callerAccessibleStores.length > 0
                ? [callerAccessibleStores[0]]
                : []
          : [currentUser.store || callerAccessibleStores[0] || ''];
        setAssignedStores(initialStores.filter(Boolean));
        setStatus((user.status as any) || 'Active');
      } else {
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setShowPassword(false);
        // Default role: Super Admin can choose Store Manager, Store Manager only gets Sales Manager
        setRole(isCallerSuperAdmin ? 'Store Manager' : 'Sales Manager');
        // Store Manager always automatically uses manager's own store
        const defaultStore = isCallerSuperAdmin
          ? callerAccessibleStores[0] || ''
          : currentUser.store || callerAccessibleStores[0] || '';
        setAssignedStores(defaultStore ? [defaultStore] : []);
        setStatus('Active');
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editUserIdRef.current = null;
    }
  }, [open, user?.id]);

  // Dirty form protection
  const isDirty = useMemo(() => {
    if (isEdit) {
      return (
        name !== (user?.name || '') ||
        email !== (user?.email || '') ||
        phone !== (user?.phone || '') ||
        password !== ''
      );
    }
    return Boolean(name || email || phone || password);
  }, [isEdit, user, name, email, phone, password]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this form. Discard them?')
      ) {
        return;
      }
    }
    setSubmitError(null);
    onClose();
  };

  // Rule 11: Sales Manager must not access user creation
  if (!open || currentUser.role === 'Sales Manager') return null;

  // Enforce exactly one operational store for Store Manager / Sales Manager
  const selectSingleStore = (code: string) => {
    setAssignedStores([code]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      toast.error('Full Name and Email are required.');
      return;
    }

    if (!isEdit && !password) {
      toast.error('Account initial password is required.');
      return;
    }

    if (!isProtectedSuperAdmin && assignedStores.length === 0) {
      toast.error('Please assign the team member to at least one store.');
      return;
    }

    const assignedSummary = isProtectedSuperAdmin
      ? 'All Stores (Enterprise Unrestricted)'
      : assignedStores.join(', ');

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Confirm Team Member Update: ${cleanName}` : 'Confirm Register Team Member',
      subtitle: 'Please review credentials, operational role, and assigned store access.',
      confirmLabel: isEdit ? 'Confirm & Update Member' : 'Confirm & Register Member',
      summaryItems: [
        { label: 'Full Name', value: cleanName, highlighted: true },
        { label: 'Official Email', value: cleanEmail },
        {
          label: 'Operational Role',
          value: isProtectedSuperAdmin ? 'Super Admin (Level 100)' : role,
        },
        {
          label: 'Assigned Store(s)',
          value: `${assignedSummary} (${assignedStores.length} store${assignedStores.length > 1 ? 's' : ''})`,
        },
        { label: 'Account Status', value: status },
      ],
      warningMessage: isProtectedSuperAdmin
        ? 'NOTE: Modifying profile details for the protected system Super Admin.'
        : 'Team member permissions and assigned store access will be synchronized across MySQL and real-time sessions.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const primaryStore = assignedStores[0] || 'BLR';

      if (isEdit && user) {
        const updatePayload: any = {
          name: cleanName,
          email: cleanEmail,
          phone: phone.trim() || undefined,
          status,

          assignedStores: isProtectedSuperAdmin ? undefined : assignedStores,
          allowedStores: isProtectedSuperAdmin ? undefined : assignedStores,
          store: isProtectedSuperAdmin ? 'All Stores' : primaryStore,
        };

        if (!isProtectedSuperAdmin) {
          updatePayload.role = role;
        }

        if (password) {
          updatePayload.password = password;
        }

        const res = await updateUserAccount(user.id, updatePayload);
        if (res?.success !== false && !res?.error) {
          toast.success(`Team member "${cleanName}" updated successfully!`);
          if (onSuccess) {
            onSuccess({
              ...user,
              name: cleanName,
              email: cleanEmail,
              phone: phone.trim(),
              role: isProtectedSuperAdmin ? 'Super Admin' : role,
              store: isProtectedSuperAdmin ? 'All Stores' : primaryStore,
              allowedStores: assignedStores,
              status,
            });
          }
          onClose();
        } else {
          const errMsg =
            res?.error || res?.message || 'Failed to update team member. Please retry.';
          setSubmitError(errMsg);
          toast.error(errMsg);
        }
      } else {
        const res = await addUserAccount({
          name: cleanName,
          email: cleanEmail,
          password,
          phone: phone.trim() || undefined,
          role,
          store: primaryStore,
          assignedStores,
          allowedStores: assignedStores,
          status,
        } as any);

        if (res?.success && !res?.error) {
          toast.success(`Team member "${cleanName}" registered successfully!`);
          if (onSuccess && res) onSuccess((res as any).user || res);
          onClose();
        } else {
          const errMsg =
            res?.error ||
            res?.message ||
            'Failed to register team member. Please verify fields and retry.';
          setSubmitError(errMsg);
          toast.error(errMsg);
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to save team member';
      setSubmitError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={isEdit ? `Edit Team Member: ${user?.name}` : 'Register New Team Member'}
        subtitle={
          isEdit
            ? `Manage operational profile and store assignments for ${user?.email}`
            : 'Provision new staff account, operational role, and assigned store access'
        }
        size="standard"
        zIndex={zIndex}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={handleSafeClose}
              className="btn-secondary text-xs flex-1 sm:flex-initial"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="user-form"
              className="btn-primary text-xs gap-1.5 font-bold flex-1 sm:flex-initial"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  {isEdit ? 'Update Team Member' : 'Register Team Member'}
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Error Alert Banner with Retry Guidance */}
          {submitError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} className="flex-shrink-0" />
                <span>{submitError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="text-xs text-danger/80 hover:text-danger font-semibold cursor-pointer underline flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Protected Super Admin Notice Banner */}
          {isProtectedSuperAdmin && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="ShieldCheckIcon" size={18} />
                <div>
                  <p className="font-bold text-xs">Protected System Root Account</p>
                  <p className="text-3xs text-danger/80">
                    Role: Super Admin (Level 100) · Unrestricted System Authority
                  </p>
                </div>
              </div>
              <span className="badge-danger text-3xs font-extrabold flex items-center gap-1">
                <Icon name="LockClosedIcon" size={11} /> Locked
              </span>
            </div>
          )}

          {/* 1. Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Full Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Ananya Rao"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Official Email <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="ananya@cosko.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field text-xs"
              />
            </div>
          </div>

          {/* 2. Phone & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Contact Phone</label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                {isEdit ? 'Change Password (Leave blank to keep)' : 'Initial Password *'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!isEdit}
                  placeholder={isEdit ? '••••••••' : 'Min 8 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field text-xs pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* 3. Operational Role & RBAC Level */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              System Role & RBAC Clearance <span className="text-danger">*</span>
            </label>
            {isProtectedSuperAdmin ? (
              <div className="input-field text-xs font-semibold bg-muted text-muted-foreground flex items-center justify-between cursor-not-allowed">
                <span>Super Admin (Level 100 — System Root)</span>
                <Icon name="LockClosedIcon" size={13} className="text-muted-foreground" />
              </div>
            ) : (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="input-field text-xs font-medium"
              >
                {permittedRoles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.role} (Level {r.level}) — {r.desc}
                  </option>
                ))}
              </select>
            )}
            <p className="text-3xs text-muted-foreground mt-1">
              Defines module access clearances, financial reporting authorities, and POS terminal
              privileges.
            </p>
          </div>

          {/* 4. Assigned Store — Exactly ONE operational store for Store Manager / Sales Manager */}
          {isCallerSuperAdmin ? (
            <div className="space-y-2 p-3.5 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="BuildingStorefrontIcon" size={15} className="text-primary" />
                    <label className="text-xs font-bold text-foreground">
                      Assigned Operational Store <span className="text-danger">*</span>
                    </label>
                  </div>
                  <p className="text-3xs text-muted-foreground mt-0.5">
                    Every Store Manager and Sales Manager account is strictly assigned to exactly
                    ONE operational store.
                  </p>
                </div>

                {/* + Add New Store button for Super Admin */}
                <button
                  type="button"
                  onClick={() => setIsAddStoreOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <Icon name="PlusIcon" size={13} />
                  <span>Add Store</span>
                </button>
              </div>

              {/* Canonical CustomSelect Architecture */}
              <CustomSelect
                value={assignedStores[0] || ''}
                onChange={(val) => setAssignedStores([val])}
                options={storeOptions}
                placeholder="Select an operational store..."
                searchPlaceholder="Search store by name, code, city..."
                searchable={true}
                addNewLabel="+ Add New Store"
                onAddNew={() => setIsAddStoreOpen(true)}
              />
            </div>
          ) : (
            /* Store Manager creating staff: Control MUST NOT render; store is displayed as read-only contextual info */
            <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-foreground block">Assigned Store Location</span>
                <p className="text-3xs text-muted-foreground">
                  Staff member will automatically be assigned to your branch (
                  {currentUser.store || callerAccessibleStores[0] || 'Branch'}).
                </p>
              </div>
              <span className="badge-primary text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                {currentUser.store || callerAccessibleStores[0] || 'Branch'}
              </span>
            </div>
          )}

          {/* 5. Account Status */}
          <div className="p-3 rounded-xl border border-border bg-card">
            <div>
              <label className="text-2xs font-semibold text-foreground block mb-1">
                Account Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="input-field text-xs font-medium"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Nested Add Store Modal for Super Admin — Higher z-index preserves UserForm draft state */}
      {isCallerSuperAdmin && isAddStoreOpen && (
        <StoreFormModal
          open={isAddStoreOpen}
          onClose={() => setIsAddStoreOpen(false)}
          zIndex={zIndex + 20}
          onSuccess={(newStore) => {
            if (newStore?.code) {
              setAssignedStores([newStore.code]);
            }
            setIsAddStoreOpen(false);
          }}
        />
      )}
    </>
  );
}
