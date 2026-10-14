/**
 * COSKO RBAC Engine — Exactly 3 Roles
 *
 * SECURITY HIERARCHY:
 * LEVEL 100 — Super Admin (Full Enterprise Authority, ONE protected account)
 * LEVEL 80  — Store Manager (Assigned Store Scope, full local operations)
 * LEVEL 40  — Sales Manager (Assigned Store Scope, POS/sales/inventory only)
 *
 * NO OTHER ROLES EXIST. Period.
 */

export type SecurityLevel = 100 | 80 | 40;

export type UserRole = 'Super Admin' | 'Store Manager' | 'Sales Manager';

export type ResourceClassification =
  'PUBLIC' | 'AUTHENTICATED' | 'SELF_ONLY' | 'STORE_SCOPED' | 'ENTERPRISE' | 'SUPER_ADMIN_ONLY';

export interface PermissionDefinition {
  code: string;
  name: string;
  category:
    | 'Dashboard'
    | 'Sales'
    | 'Inventory'
    | 'Purchases'
    | 'Customers'
    | 'Vendors'
    | 'Expenses'
    | 'Accounting'
    | 'Reports'
    | 'Employees'
    | 'Stores'
    | 'Users & Roles'
    | 'Audit Logs'
    | 'Settings'
    | 'Branding'
    | 'Delete Approval'
    | 'System'
    | 'Attendance';
  isProtected: boolean;
  minSecurityLevel: SecurityLevel;
}

export interface UserPermissionOverride {
  permissionCode: string;
  overrideType: 'ALLOW' | 'DENY';
}

export interface RBACUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  securityLevel: SecurityLevel;
  storeScope: string;
  allowedStores?: string[];
  status: 'Active' | 'Inactive' | 'Suspended';
  permissions: string[];
  overrides?: UserPermissionOverride[];
  avatarUrl?: string | null;
  shiftStatus?: string;
  isSessionValid?: boolean;
}

export interface ResourceRequest {
  resourceName: string;
  classification: ResourceClassification;
  minSecurityLevel: SecurityLevel;
  requiredPermission?: string;
  targetStore?: string;
  targetUserId?: string;
  targetUserSecurityLevel?: SecurityLevel;
  explicitDenyList?: string[];
}

export const ROLE_SECURITY_LEVELS: Record<UserRole, SecurityLevel> = {
  'Super Admin': 100,
  'Store Manager': 80,
  'Sales Manager': 40,
};

/**
 * Modules restricted to Super Admin only (Level 100).
 */
export const SUPER_ADMIN_ONLY_MODULES = [
  'Stock Transfers',
  'Central Profit',
  'Audit Logs',
  'Stores',
  'Settings',
  'Work Activity',
  'Attendance Management',
  'Delete Approvals',
] as const;

/**
 * CANONICAL NAVIGATION & FEATURE MATRIX — Single authoritative source of truth.
 * Drives Desktop Sidebar, Mobile Sidebar, Mobile BottomNav, More Sheet, and AppLayout route guards.
 * Exactly THREE roles: Super Admin (100), Store Manager (80), Sales Manager (40).
 */
export interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  category: 'Overview' | 'Commerce' | 'Finance' | 'Organization' | 'System';
  allowedRoles: UserRole[];
  badgeKey?: 'lowStock' | 'pendingPO';
  badgeVariant?: 'warning' | 'info' | 'danger';
}

export const NAVIGATION_REGISTRY: NavigationItem[] = [
  // Overview
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    icon: 'HomeIcon',
    href: '/dashboard',
    category: 'Overview',
    allowedRoles: ['Super Admin', 'Store Manager', 'Sales Manager'],
  },

  // Commerce
  {
    id: 'nav-sales',
    label: 'Sales & POS',
    icon: 'ShoppingCartIcon',
    href: '/sales',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager', 'Sales Manager'],
  },
  {
    id: 'nav-inventory',
    label: 'Inventory',
    icon: 'CubeIcon',
    href: '/inventory-management',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager', 'Sales Manager'],
    badgeKey: 'lowStock',
    badgeVariant: 'warning',
  },
  {
    id: 'nav-stock-transfers',
    label: 'Stock Transfers',
    icon: 'ArrowsRightLeftIcon',
    href: '/stock-transfers',
    category: 'Commerce',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-categories',
    label: 'Categories',
    icon: 'TagIcon',
    href: '/categories',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager', 'Sales Manager'],
  },
  {
    id: 'nav-purchases',
    label: 'Purchases',
    icon: 'TruckIcon',
    href: '/purchases',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager'],
    badgeKey: 'pendingPO',
    badgeVariant: 'info',
  },
  {
    id: 'nav-customers',
    label: 'Customers',
    icon: 'UsersIcon',
    href: '/customers',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager', 'Sales Manager'],
  },
  {
    id: 'nav-vendors',
    label: 'Vendors',
    icon: 'BuildingStorefrontIcon',
    href: '/vendors',
    category: 'Commerce',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },

  // Finance
  {
    id: 'nav-expenses',
    label: 'Expenses',
    icon: 'BanknotesIcon',
    href: '/expenses',
    category: 'Finance',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },
  {
    id: 'nav-accounting',
    label: 'Accounting',
    icon: 'CalculatorIcon',
    href: '/accounting',
    category: 'Finance',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },
  {
    id: 'nav-central-profit',
    label: 'Central Profit',
    icon: 'ArrowTrendingUpIcon',
    href: '/central-profit',
    category: 'Finance',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-reports',
    label: 'Reports',
    icon: 'ChartBarIcon',
    href: '/reports',
    category: 'Finance',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },

  // Organization
  {
    id: 'nav-attendance',
    label: 'Attendance',
    icon: 'ClockIcon',
    href: '/attendance',
    category: 'Organization',
    allowedRoles: ['Super Admin'], // Super Admin ONLY per Requirement G
  },
  {
    id: 'nav-employees',
    label: 'Staff Roster',
    icon: 'UserGroupIcon',
    href: '/employees',
    category: 'Organization',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },
  {
    id: 'nav-stores',
    label: 'Stores',
    icon: 'MapPinIcon',
    href: '/stores',
    category: 'Organization',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-users',
    label: 'Users & Roles',
    icon: 'ShieldCheckIcon',
    href: '/users',
    category: 'Organization',
    allowedRoles: ['Super Admin', 'Store Manager'],
  },
  {
    id: 'nav-work-activity',
    label: 'Work Activity',
    icon: 'ChartBarIcon',
    href: '/work-activity',
    category: 'Organization',
    allowedRoles: ['Super Admin'], // Super Admin ONLY per Requirement I
  },

  // System
  {
    id: 'nav-delete-requests',
    label: 'Delete Requests',
    icon: 'TrashIcon',
    href: '/delete-requests',
    category: 'System',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-audit',
    label: 'Audit Logs',
    icon: 'ClipboardDocumentListIcon',
    href: '/audit-logs',
    category: 'System',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-settings',
    label: 'Settings',
    icon: 'Cog6ToothIcon',
    href: '/settings',
    category: 'System',
    allowedRoles: ['Super Admin'],
  },
  {
    id: 'nav-settings-connections',
    label: 'Data Connections',
    icon: 'CircleStackIcon',
    href: '/settings/data-connections',
    category: 'System',
    allowedRoles: ['Super Admin'],
  },
];

/**
 * CANONICAL ROUTE ACCESS MATRIX — Single authoritative source of truth for all routes.
 * Derived directly from NAVIGATION_REGISTRY plus sub-route exceptions.
 */
export const CANONICAL_ROUTE_ACCESS: Record<string, UserRole[]> = {
  '/': ['Super Admin', 'Store Manager', 'Sales Manager'],
  ...NAVIGATION_REGISTRY.reduce(
    (acc, item) => {
      acc[item.href] = item.allowedRoles;
      return acc;
    },
    {} as Record<string, UserRole[]>
  ),
  '/customers/existing': ['Super Admin', 'Store Manager', 'Sales Manager'],
  '/customers/360': ['Super Admin', 'Store Manager', 'Sales Manager'],
};

/**
 * Route-to-Permission mapping for per-user override resolution.
 */
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  '/': 'dashboard.view',
  '/dashboard': 'dashboard.view',
  '/sales': 'sales.view',
  '/inventory-management': 'inventory.view',
  '/stock-transfers': 'transfers.view',
  '/categories': 'inventory.view',
  '/purchases': 'purchases.view',
  '/customers': 'customers.view',
  '/customers/existing': 'customers.view',
  '/customers/360': 'customers.view',
  '/vendors': 'vendors.view',
  '/expenses': 'expenses.view',
  '/accounting': 'accounting.view',
  '/reports': 'reports.view',
  '/employees': 'employees.view',
  '/users': 'users.view',
};

/**
 * Mandatory security boundaries: Super Admin-only routes that can NEVER be bypassed by user overrides.
 */
export const PROTECTED_SUPER_ADMIN_ROUTES = new Set([
  '/stock-transfers',
  '/central-profit',
  '/audit-logs',
  '/stores',
  '/settings',
  '/settings/data-connections',
  '/work-activity',
  '/attendance',
  '/delete-requests',
]);

export interface UserPermissionContext {
  role: UserRole | string;
  securityLevel?: number;
  permissions?: string[];
  overrides?: UserPermissionOverride[];
}

/**
 * Authoritative Effective Permission Resolver:
 * effective access = mandatory security boundaries + base role permissions + persisted per-user overrides
 */
export function getEffectivePermissions(user: UserPermissionContext): string[] {
  if (
    user.role === 'Super Admin' ||
    (user.securityLevel !== undefined && user.securityLevel >= 100)
  ) {
    return ['ALL_PERMISSIONS', ...PERMISSION_CATALOGUE.map((p) => p.code)];
  }

  const role = user.role as UserRole;
  const basePermissions = new Set<string>(DEFAULT_ROLE_PERMISSIONS[role] || []);
  const userSecurityLevel = user.securityLevel ?? ROLE_SECURITY_LEVELS[role] ?? 40;

  if (Array.isArray(user.overrides)) {
    for (const ov of user.overrides) {
      if (ov.overrideType === 'DENY') {
        basePermissions.delete(ov.permissionCode);
      } else if (ov.overrideType === 'ALLOW') {
        const permDef = PERMISSION_CATALOGUE.find((p) => p.code === ov.permissionCode);
        const isProtected =
          permDef?.isProtected ||
          SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(ov.permissionCode) ||
          (permDef?.minSecurityLevel && permDef.minSecurityLevel > userSecurityLevel);

        if (!isProtected) {
          basePermissions.add(ov.permissionCode);
        }
      }
    }
  }

  return Array.from(basePermissions);
}

/**
 * Check whether a user has an effective permission considering mandatory security boundaries,
 * base role permissions, and persisted per-user overrides.
 */
export function hasEffectivePermission(
  user: UserPermissionContext | UserRole | string,
  permissionCode: string
): boolean {
  if (typeof user === 'string') {
    if (user === 'Super Admin') return true;
    return (DEFAULT_ROLE_PERMISSIONS[user as UserRole] || []).includes(permissionCode);
  }

  if (
    user.role === 'Super Admin' ||
    (user.securityLevel !== undefined && user.securityLevel >= 100)
  ) {
    return true;
  }

  if (SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(permissionCode)) {
    return false;
  }

  if (Array.isArray(user.overrides)) {
    const override = user.overrides.find((o) => o.permissionCode === permissionCode);
    if (override) {
      if (override.overrideType === 'DENY') return false;
      if (override.overrideType === 'ALLOW') {
        const permDef = PERMISSION_CATALOGUE.find((p) => p.code === permissionCode);
        const userLevel = user.securityLevel ?? ROLE_SECURITY_LEVELS[user.role as UserRole] ?? 40;
        if (
          permDef?.isProtected ||
          (permDef?.minSecurityLevel && permDef.minSecurityLevel > userLevel)
        ) {
          return false;
        }
        return true;
      }
    }
  }

  const rolePerms = DEFAULT_ROLE_PERMISSIONS[user.role as UserRole] || [];
  return (
    rolePerms.includes(permissionCode) || (user.permissions?.includes(permissionCode) ?? false)
  );
}

/**
 * Check whether a given route is authorized for a user or role under the canonical access matrix.
 * Enforces protected module boundaries and dynamic per-user overrides.
 */
export function isRouteAllowed(
  route: string,
  userOrRole: UserPermissionContext | UserRole | string
): boolean {
  const role: string = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const isSuperAdmin =
    role === 'Super Admin' ||
    (typeof userOrRole !== 'string' && (userOrRole.securityLevel ?? 0) >= 100);

  if (isSuperAdmin) return true;

  const normalizedRoute = route === '' ? '/' : route;

  // 🔒 Protected Boundaries: Super Admin ONLY modules can NEVER be bypassed
  for (const protectedRoute of PROTECTED_SUPER_ADMIN_ROUTES) {
    if (normalizedRoute === protectedRoute || normalizedRoute.startsWith(`${protectedRoute}/`)) {
      return false;
    }
  }

  // Base role route access check
  let allowedRoles = CANONICAL_ROUTE_ACCESS[normalizedRoute];
  if (!allowedRoles) {
    const matchedPrefix = Object.keys(CANONICAL_ROUTE_ACCESS).find(
      (r) => normalizedRoute.startsWith(r) && r !== '/'
    );
    if (matchedPrefix) {
      allowedRoles = CANONICAL_ROUTE_ACCESS[matchedPrefix];
    }
  }

  if (!allowedRoles || !(allowedRoles as string[]).includes(role)) {
    return false;
  }

  // If user context object is provided, evaluate effective per-user permission overrides
  if (typeof userOrRole === 'object') {
    let requiredPermission = ROUTE_PERMISSION_MAP[normalizedRoute];
    if (!requiredPermission) {
      const matchedPrefix = Object.keys(ROUTE_PERMISSION_MAP).find(
        (r) => normalizedRoute.startsWith(r) && r !== '/'
      );
      if (matchedPrefix) {
        requiredPermission = ROUTE_PERMISSION_MAP[matchedPrefix];
      }
    }

    if (requiredPermission) {
      return hasEffectivePermission(userOrRole, requiredPermission);
    }
  }

  return true;
}

/**
 * Get all routes authorized for a given role or user under the canonical access matrix.
 */
export function getAllowedRoutes(userOrRole: UserPermissionContext | UserRole | string): string[] {
  const role: string = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  if (role === 'Super Admin') {
    return Object.keys(CANONICAL_ROUTE_ACCESS);
  }
  return Object.keys(CANONICAL_ROUTE_ACCESS).filter((route) => isRouteAllowed(route, userOrRole));
}

/**
 * Get unified navigation groups for Sidebar (Desktop & Mobile) filtered by role and effective permissions.
 */
export function getAuthoritativeNavGroups(
  userOrRole: UserPermissionContext | UserRole | string,
  badges?: { lowStock?: number; pendingPO?: number }
) {
  const categories: Array<'Overview' | 'Commerce' | 'Finance' | 'Organization' | 'System'> = [
    'Overview',
    'Commerce',
    'Finance',
    'Organization',
    'System',
  ];

  return categories
    .map((cat) => {
      const items = NAVIGATION_REGISTRY.filter(
        (nav) =>
          nav.category === cat &&
          nav.href !== '/settings/data-connections' && // sub-page of settings
          isRouteAllowed(nav.href, userOrRole)
      ).map((nav) => {
        let badge: number | undefined = undefined;
        if (nav.badgeKey === 'lowStock' && badges?.lowStock !== undefined) {
          badge = badges.lowStock;
        } else if (nav.badgeKey === 'pendingPO' && badges?.pendingPO !== undefined) {
          badge = badges.pendingPO;
        }
        return {
          id: nav.id,
          label: nav.label,
          icon: nav.icon,
          href: nav.href,
          badge,
          badgeVariant: nav.badgeVariant,
        };
      });

      return {
        id: `group-${cat.toLowerCase()}`,
        label: cat,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}

/**
 * Get secondary navigation items for the Mobile BottomNav "More" bottom sheet.
 * Excludes primary navigation bar slots (/dashboard, /inventory-management, /sales, /customers).
 */
export function getMobileMoreNav(userOrRole: UserPermissionContext | UserRole | string) {
  const primarySlots = new Set(['/dashboard', '/inventory-management', '/sales', '/customers']);
  return NAVIGATION_REGISTRY.filter(
    (nav) =>
      !primarySlots.has(nav.href) &&
      nav.href !== '/settings/data-connections' &&
      isRouteAllowed(nav.href, userOrRole)
  ).map((nav) => ({
    id: `more-${nav.id.replace('nav-', '')}`,
    label: nav.label,
    icon: nav.icon,
    href: nav.href,
  }));
}

/**
 * Check if caller can manage a target role.
 */
export function canManageRole(callerLevel: number, targetLevel: number): boolean {
  return callerLevel > targetLevel;
}

/**
 * Returns the maximum security level a caller can assign.
 */
export function getMaxAssignableLevel(callerLevel: number): number {
  return Math.max(40, callerLevel - 1);
}

/**
 * PROTECTED PERMISSIONS — Only Super Admin (Level 100) can hold these.
 */
export const SUPER_ADMIN_PROTECTED_PERMISSIONS = [
  'super_admin.create',
  'super_admin.manage',
  'roles.manage',
  'permissions.manage',
  'security.manage',
  'audit_logs.enterprise_view',
  'settings.global_manage',
  'branding.edit_name',
  'branding.edit_logo',
  'branding.edit_favicon',
  'branding.edit_receipt',
  'stores.manage',
  'transfers.manage',
  'delete_requests.review',
];

/**
 * MASTER PERMISSION CATALOGUE
 */
export const PERMISSION_CATALOGUE: PermissionDefinition[] = [
  // Dashboard
  {
    code: 'dashboard.view',
    name: 'Dashboard Module Access',
    category: 'Dashboard',
    isProtected: false,
    minSecurityLevel: 40,
  },

  // Sales
  {
    code: 'sales.view',
    name: 'Sales & POS Page Access',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.create',
    name: 'Create Sale / Checkout',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.discount',
    name: 'Apply Order Discount',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'sales.pay_cash',
    name: 'Accept Cash Payment',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.pay_upi',
    name: 'Accept UPI Payment',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.print_receipt',
    name: 'Print Sales Receipt',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.history',
    name: 'View Sale History',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'sales.cancel',
    name: 'Cancel / Void Sale',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'sales.refund',
    name: 'Process Sale Refund',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'sales.attach_photo',
    name: 'Attach Sale Photo Proof',
    category: 'Sales',
    isProtected: false,
    minSecurityLevel: 40,
  },

  // Inventory
  {
    code: 'inventory.view',
    name: 'Inventory Page Access',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'inventory.add',
    name: 'Add New Product',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'inventory.edit',
    name: 'Edit Product Details',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'inventory.archive',
    name: 'Archive / Delete Product',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'inventory.adjust',
    name: 'Perform Stock Adjustment',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'inventory.transfer',
    name: 'Initiate Stock Transfer',
    category: 'Inventory',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'inventory.history',
    name: 'View Stock Movement History',
    category: 'Inventory',
    isProtected: false,
    minSecurityLevel: 40,
  },

  // Purchases
  {
    code: 'purchases.view',
    name: 'Purchases Page Access',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'purchases.create',
    name: 'Create Purchase Order',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'purchases.edit',
    name: 'Edit Purchase Order',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'purchases.cancel',
    name: 'Cancel Purchase Order',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'purchases.approve',
    name: 'Approve Purchase Order',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'purchases.receive_grn',
    name: 'Receive Goods (GRN)',
    category: 'Purchases',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Customers
  {
    code: 'customers.view',
    name: 'Customers Page Access',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'customers.add',
    name: 'Add New Customer',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'customers.edit',
    name: 'Edit Customer Profile',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'customers.archive',
    name: 'Archive / Delete Customer',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'customers.view_credit',
    name: 'View Customer Credit',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'customers.adjust_credit',
    name: 'Adjust Customer Credit',
    category: 'Customers',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Vendors
  {
    code: 'vendors.view',
    name: 'Vendors Page Access',
    category: 'Vendors',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'vendors.add',
    name: 'Add New Vendor',
    category: 'Vendors',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'vendors.edit',
    name: 'Edit Vendor Details',
    category: 'Vendors',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'vendors.archive',
    name: 'Archive / Delete Vendor',
    category: 'Vendors',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'vendors.view_payables',
    name: 'View Vendor Payables',
    category: 'Vendors',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Expenses
  {
    code: 'expenses.view',
    name: 'Expenses Page Access',
    category: 'Expenses',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'expenses.create',
    name: 'Create Expense Record',
    category: 'Expenses',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'expenses.edit',
    name: 'Edit Expense Record',
    category: 'Expenses',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'expenses.approve',
    name: 'Approve Expense',
    category: 'Expenses',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Accounting
  {
    code: 'accounting.view',
    name: 'Accounting Page Access',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'accounting.pnl',
    name: 'View P&L Statement',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'accounting.balance_sheet',
    name: 'View Balance Sheet',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'accounting.gst',
    name: 'View GST Reports',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'accounting.margin',
    name: 'View Gross Margins',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'accounting.export',
    name: 'Export Accounting Ledgers',
    category: 'Accounting',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Reports
  {
    code: 'reports.view',
    name: 'Reports Page Access',
    category: 'Reports',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'reports.export',
    name: 'Export Reports',
    category: 'Reports',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'reports.store_comparison',
    name: 'Multi-Store Comparison',
    category: 'Reports',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'reports.user_performance',
    name: 'User Performance',
    category: 'Reports',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Employees
  {
    code: 'employees.view',
    name: 'Employees Page Access',
    category: 'Employees',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'employees.add',
    name: 'Add Employee',
    category: 'Employees',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'employees.edit',
    name: 'Edit Employee',
    category: 'Employees',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'employees.archive',
    name: 'Archive Employee',
    category: 'Employees',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Attendance
  {
    code: 'attendance.view_own',
    name: 'View Own Attendance',
    category: 'Attendance',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'attendance.view_store',
    name: 'View Store Attendance',
    category: 'Attendance',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'attendance.view_all',
    name: 'View All Attendance',
    category: 'Attendance',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'attendance.start_shift',
    name: 'Start Shift',
    category: 'Attendance',
    isProtected: false,
    minSecurityLevel: 40,
  },
  {
    code: 'attendance.end_shift',
    name: 'End Shift',
    category: 'Attendance',
    isProtected: false,
    minSecurityLevel: 40,
  },

  // Stores
  {
    code: 'stores.view',
    name: 'Stores Page Access',
    category: 'Stores',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'stores.edit',
    name: 'Edit Store Details',
    category: 'Stores',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'stores.manage',
    name: 'Manage Stores',
    category: 'Stores',
    isProtected: true,
    minSecurityLevel: 100,
  },

  // Users
  {
    code: 'users.view',
    name: 'Users Directory Access',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.create',
    name: 'Create User Account',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.edit',
    name: 'Edit User',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.suspend',
    name: 'Suspend User',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.activate',
    name: 'Activate User',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.assign_role',
    name: 'Assign Role',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.assign_store',
    name: 'Assign Store',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'users.reset_password',
    name: 'Reset Password',
    category: 'Users & Roles',
    isProtected: false,
    minSecurityLevel: 80,
  },

  // Audit Logs
  {
    code: 'audit_logs.view',
    name: 'View Audit Logs',
    category: 'Audit Logs',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'audit_logs.enterprise_view',
    name: 'Enterprise Audit Logs',
    category: 'Audit Logs',
    isProtected: true,
    minSecurityLevel: 100,
  },

  // Settings
  {
    code: 'settings.view',
    name: 'Settings Page Access',
    category: 'Settings',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'settings.global_manage',
    name: 'Manage Global Settings',
    category: 'Settings',
    isProtected: true,
    minSecurityLevel: 100,
  },

  // Branding
  {
    code: 'branding.view',
    name: 'View Branding',
    category: 'Branding',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'branding.edit_name',
    name: 'Edit Business Name',
    category: 'Branding',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'branding.edit_logo',
    name: 'Edit Logo',
    category: 'Branding',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'branding.edit_favicon',
    name: 'Edit Favicon',
    category: 'Branding',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'branding.edit_receipt',
    name: 'Edit Receipt Branding',
    category: 'Branding',
    isProtected: true,
    minSecurityLevel: 100,
  },

  // Delete Approval
  {
    code: 'delete_requests.view',
    name: 'View Delete Requests',
    category: 'Delete Approval',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'delete_requests.create',
    name: 'Submit Delete Request',
    category: 'Delete Approval',
    isProtected: false,
    minSecurityLevel: 80,
  },
  {
    code: 'delete_requests.review',
    name: 'Approve/Reject Deletes',
    category: 'Delete Approval',
    isProtected: true,
    minSecurityLevel: 100,
  },

  // Notifications
  {
    code: 'notifications.view',
    name: 'View Notifications',
    category: 'System',
    isProtected: false,
    minSecurityLevel: 40,
  },

  // Stock Transfers
  {
    code: 'transfers.view',
    name: 'View Transfers',
    category: 'Inventory',
    isProtected: true,
    minSecurityLevel: 100,
  },
  {
    code: 'transfers.manage',
    name: 'Manage Transfers',
    category: 'Inventory',
    isProtected: true,
    minSecurityLevel: 100,
  },
];

/**
 * Default permissions per role — EXACTLY 3 ROLES
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  'Super Admin': ['ALL_PERMISSIONS'],
  'Store Manager': [
    'dashboard.view',
    'sales.view',
    'sales.create',
    'sales.discount',
    'sales.pay_cash',
    'sales.pay_upi',
    'sales.print_receipt',
    'sales.history',
    'sales.cancel',
    'sales.refund',
    'sales.attach_photo',
    'inventory.view',
    'inventory.add',
    'inventory.edit',
    'inventory.archive',
    'inventory.adjust',
    'inventory.history',
    'purchases.view',
    'purchases.create',
    'purchases.edit',
    'purchases.cancel',
    'purchases.receive_grn',
    'customers.view',
    'customers.add',
    'customers.edit',
    'customers.archive',
    'customers.view_credit',
    'customers.adjust_credit',
    'vendors.view',
    'vendors.add',
    'vendors.edit',
    'vendors.view_payables',
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.approve',
    'accounting.view',
    'accounting.pnl',
    'accounting.balance_sheet',
    'accounting.gst',
    'accounting.margin',
    'reports.view',
    'reports.export',
    'reports.user_performance',
    'employees.view',
    'employees.add',
    'employees.edit',
    'attendance.view_own',
    'attendance.start_shift',
    'attendance.end_shift',
    'users.view',
    'users.create',
    'users.edit',
    'users.reset_password',
    'delete_requests.view',
    'delete_requests.create',
    'notifications.view',
  ],
  'Sales Manager': [
    'dashboard.view',
    'sales.view',
    'sales.create',
    'sales.pay_cash',
    'sales.pay_upi',
    'sales.print_receipt',
    'sales.history',
    'sales.attach_photo',
    'inventory.view',
    'inventory.add',
    'inventory.edit',
    'inventory.adjust',
    'inventory.history',
    'customers.view',
    'customers.add',
    'customers.edit',
    'customers.view_credit',
    'attendance.view_own',
    'attendance.start_shift',
    'attendance.end_shift',
    'notifications.view',
  ],
};

export class RBACEngine {
  /**
   * COSKO Permission Resolution Pipeline:
   * 1. User Authenticated
   * 2. Session Valid
   * 3. Account Active
   * 4. Super Admin bypass
   * 5. Resource Classification
   * 6. Security Level
   * 7. Explicit Deny
   * 8. Required Permission
   * 9. User Override
   * 10. Role Permission
   * 11. Store Isolation
   * 12. Target Protection
   */
  static authorize(
    user: RBACUser | null,
    request: ResourceRequest
  ): { allowed: boolean; reason?: string } {
    if (!user) {
      return { allowed: false, reason: 'Deny: Not authenticated' };
    }

    if (user.isSessionValid === false) {
      return { allowed: false, reason: 'Deny: Session invalid or revoked' };
    }

    if (user.status === 'Suspended') {
      return { allowed: false, reason: 'Deny: Account SUSPENDED' };
    }
    if (user.status === 'Inactive') {
      return { allowed: false, reason: 'Deny: Account INACTIVE' };
    }

    // Validate that required permission exists in system catalogue
    if (request.requiredPermission) {
      const exists = PERMISSION_CATALOGUE.some((p) => p.code === request.requiredPermission);
      if (!exists) {
        return { allowed: false, reason: 'Integrations permission unresolvable' };
      }
    }

    // Super Admin always passes valid permissions
    if (user.role === 'Super Admin' || user.securityLevel === 100) {
      return { allowed: true };
    }

    // SUPER_ADMIN_ONLY resource
    if (request.classification === 'SUPER_ADMIN_ONLY' && user.securityLevel < 100) {
      return { allowed: false, reason: '403: SUPER_ADMIN_ONLY resource' };
    }

    // Security level floor
    if (user.securityLevel < request.minSecurityLevel) {
      return {
        allowed: false,
        reason: `Deny: Level ${user.securityLevel} below required ${request.minSecurityLevel}`,
      };
    }

    // Explicit deny list
    if (
      request.explicitDenyList &&
      request.requiredPermission &&
      request.explicitDenyList.includes(request.requiredPermission)
    ) {
      return { allowed: false, reason: 'Deny: Permission explicitly revoked' };
    }

    // Permission check
    if (request.requiredPermission) {
      // Protected permissions cannot be granted to non-100
      if (
        SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(request.requiredPermission) &&
        user.securityLevel < 100
      ) {
        return { allowed: false, reason: 'Deny: Protected permission requires Level 100' };
      }

      // User override check
      const userOverride = user.overrides?.find(
        (o) => o.permissionCode === request.requiredPermission
      );
      if (userOverride) {
        if (userOverride.overrideType === 'DENY') {
          return {
            allowed: false,
            reason: `Deny: Custom DENY for "${request.requiredPermission}"`,
          };
        }
        // ALLOW override → continue to store check
      } else {
        // Role permission check
        const defaultRolePerms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
        const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
        const hasPermission =
          userPerms.includes(request.requiredPermission) ||
          userPerms.includes('ALL_PERMISSIONS') ||
          defaultRolePerms.includes(request.requiredPermission);
        if (!hasPermission) {
          return {
            allowed: false,
            reason: `Deny: Missing permission "${request.requiredPermission}"`,
          };
        }
      }
    }

    // Store isolation
    if (request.targetStore && request.targetStore !== 'All Stores') {
      if (user.storeScope !== 'All Stores') {
        const allowedStores = user.allowedStores || [user.storeScope];
        if (!allowedStores.includes(request.targetStore)) {
          return { allowed: false, reason: `Deny: No access to store ${request.targetStore}` };
        }
      }
    }

    // Target user protection
    if (
      request.targetUserSecurityLevel !== undefined &&
      user.securityLevel <= request.targetUserSecurityLevel &&
      user.securityLevel < 100
    ) {
      return { allowed: false, reason: 'Deny: Cannot manage equal or higher level accounts' };
    }

    return { allowed: true };
  }

  /**
   * Filters visible users — hides Level 100 from lower levels, enforces store scope.
   */
  static filterVisibleUsers(currentUser: RBACUser, targetUsers: RBACUser[]): RBACUser[] {
    if (currentUser.securityLevel === 100) {
      return targetUsers;
    }

    return targetUsers.filter((u) => {
      if (u.securityLevel === 100) return false;
      if (currentUser.storeScope !== 'All Stores' && u.storeScope !== currentUser.storeScope) {
        const allowedStores = currentUser.allowedStores || [currentUser.storeScope];
        if (!allowedStores.includes(u.storeScope)) return false;
      }
      return u.securityLevel < currentUser.securityLevel;
    });
  }

  /**
   * Permission state for UI display.
   */
  static getPermissionState(
    user: RBACUser,
    permissionCode: string
  ): 'Protected' | 'Custom Allow' | 'Custom Deny' | 'Allowed' | 'Denied' {
    if (user.role === 'Super Admin' || user.securityLevel === 100) {
      return 'Allowed';
    }

    if (SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(permissionCode) && user.securityLevel < 100) {
      return 'Protected';
    }

    const override = user.overrides?.find((o) => o.permissionCode === permissionCode);
    if (override) {
      return override.overrideType === 'ALLOW' ? 'Custom Allow' : 'Custom Deny';
    }

    const defaultRolePerms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    const hasRolePermission =
      user.permissions.includes(permissionCode) ||
      user.permissions.includes('ALL_PERMISSIONS') ||
      defaultRolePerms.includes(permissionCode);
    return hasRolePermission ? 'Allowed' : 'Denied';
  }
}
