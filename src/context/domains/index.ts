export * from './types';

/**
 * Domain-Oriented State Architecture Manifest
 *
 * Each domain encapsulates:
 * 1. Server Data Fetching (via authoritative DB/REST API)
 * 2. Client UI State & optimistic updates
 * 3. Domain Mutation Logic
 * 4. Business Invariants & Validations
 *
 * Authoritative source of truth remains MySQL Database V2.
 * localStorage is strictly used for offline cache and UI display preferences.
 */
export const DOMAIN_MANIFEST = {
  AUTH: 'Authentication, Sessions, Permissions, RBAC and Step-Up security',
  BRANDING: 'Organization Branding, Logos, Business Profiles and UI Palettes',
  SETTINGS: 'System Configuration, International Jurisdictions, Tax and Templates',
  STORES: 'Store Hubs, Canonical Store Isolation and Multi-Store Scope Filtering',
  CATALOG: 'Products Catalog, Categories Taxonomy, Types, Brands and Measurement Units',
  INVENTORY: 'Store Inventory, Stock Movements, Immutable Ledger and Stock Transfers',
  SALES: 'Point of Sale, Orders, Items, Invoices, Payment Evidence, Void and Refunds',
  PURCHASES: 'Vendor Management, Purchase Orders, Goods Received Notes and Payments',
  CUSTOMERS: 'Customer Directory, Store Profiles, Privacy Isolation and Repairs',
  FINANCE: 'Operating Expenses, Logistics, Financial Ledger and Accounting Reconciliations',
  REALTIME: 'Realtime SSE/WebSocket Subscriptions, Outbox Dispatch and Distributed Events',
  NOTIFICATIONS: 'System Alerts, User Notifications and Confirmation Approvals',
} as const;
