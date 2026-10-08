'use client';
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { MySQLDataService } from '@/lib/mysqlSync';
import { realtimeClient } from '@/lib/realtimeClient';
import {
  round2,
  calculateTransferTotals,
  validateTransferHeader,
  validateTransferItem,
} from '@/lib/stockTransferCalculations';
import { ActionConfirmationConfig } from '@/components/ui/GlobalConfirmationModal';
export type { ActionConfirmationConfig };
import { getEffectivePermissions } from '@/lib/rbacEngine';

import { normalizeMobileNumber } from '@/lib/phoneUtils';
export { normalizeMobileNumber };
import { formatMoney } from '@/lib/localization/formatters';

export interface AppBranding {
  appName: string;
  logoUrl: string | null;
  logoDarkUrl?: string | null;
  appIconUrl?: string | null;
  faviconUrl: string | null;
  tagline: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  supportEmail: string;
  supportPhone?: string;
  businessName?: string;
  businessAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  countryCode?: string;
  timezone?: string;
  locale?: string;
  baseCurrency?: string;
  taxNumber?: string;
}

export interface SystemSettings {
  countryCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  taxRegime?: string;
  taxInclusivePricing?: boolean;
  taxRegistrationNumber?: string | null;
  taxJurisdictionState?: string | null;
  jurisdictionConfig?: string | null;
  taxConfigVersion?: number;
  gstin: string | null;
  legalBusinessName: string | null;
  tradeName: string | null;
  gstState: string | null;
  gstStateCode: string | null;
  gstRegistrationType: string;
  defaultTaxRate: number;
  hsnMandatory: boolean;
  enableReverseCharge: boolean;
  gstBusinessAddress: string | null;
  invoiceHeader: string;
  invoiceFooter: string;
  invoiceTerms: string | null;
  invoiceAccentColor: string;
  watermarkOpacity: number;
  showStoreAddress: boolean;
  invoiceTemplateUrl: string | null;
  invoiceTemplateVersion: number;
  invoiceFieldMapping: string | null;
  showPaymentQr: boolean;
  paymentUpiId: string | null;
  paymentBankDetails: string | null;
  sessionTimeoutMins: number;
  maxLoginAttempts: number;
  enforcePasswordPolicy: boolean;
  sensitiveActionConfirm: boolean;
  lowStockAlerts: boolean;
  lowStockThreshold: number;
  overduePaymentAlerts: boolean;
  overdueThresholdDays: number;
  dailySalesDigest: boolean;
  securityEventAlerts: boolean;
  alertRecipientEmails: string | null;
}

export interface InventoryItem {
  id: string;
  productId?: string;
  sku: string;
  barcode?: string;
  name: string;
  brand: string;
  model?: string;
  category: string;
  subcategory: string;
  store: string; // 'CENTRAL' | 'BLR' | 'HYD' | 'DEL' | 'MUM'
  qtyOnHand: number;
  reorderPt: number;
  costPrice: number;
  transferPrice: number;
  sellingPrice: number;
  mrp?: number;
  description?: string;
  hsn?: string;
  taxRate: number;
  warrantyMonths: number;
  minStock: number;
  status: 'active' | 'inactive' | 'discontinued';
  fifoLots: number;
  lastMovement: string;
  images?: string[];
  primaryImage?: string;
  imageUrl?: string;
  locationStock?: Record<string, number>;
  createdAt?: string;
}

export interface ProductStoreTransferPrice {
  id: string;
  productId: string;
  storeCode: string;
  defaultTransferPrice: number;
}

export interface StockTransferRecord {
  id: string;
  transferNo: string;
  sourceStore: string;
  destStore: string;
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  totalUnits?: number;
  purchaseCost: number;
  transferPrice: number;
  totalCost: number;
  totalTransferValue: number;
  grossProfit: number;
  transferProfit: number;
  grossMarginPercent?: number;
  notes?: string;
  status: 'Completed' | 'Received' | 'Draft' | 'In Transit' | 'Cancelled';
  createdBy: string;
  createdAt: string;
  items?: any[];
}

export interface InventoryLedgerEntry {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  storeCode: string;
  movementType: 'PURCHASE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'SALE' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  unitCost: number;
  totalValue: number;
  fromLocation?: string;
  toLocation?: string;
  referenceNo: string;
  createdBy: string;
  createdAt: string;
}

export interface CategoryTypeItem {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  isSystem?: boolean;
  categoryCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parentCategoryId?: string | null;
  parentCategoryName?: string;
  categoryType: string;
  description?: string;
  imageUrl?: string;
  icon?: string;
  status: 'Active' | 'Inactive' | 'Archived';
  sortOrder: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentMethodItem {
  id: string;
  name: string;
  code: string;
  type: string; // 'Cash' | 'Bank' | 'Digital' | 'Card' | 'Credit' | 'Other'
  description?: string | null;
  status: 'Active' | 'Inactive';
  isSystem?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandItem {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitItem {
  id: string;
  name: string;
  code: string;
  symbol: string;
  description?: string | null;
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface RepairEnquiry {
  id: string;
  ticketNo?: string;
  customerPhone: string;
  customerName: string;
  enquiryDate: string;
  deviceType?:
    | 'Mobile'
    | 'Tablet'
    | 'Laptop'
    | 'Smartwatch'
    | 'EV'
    | 'AC'
    | 'TV'
    | 'Washing Machine'
    | 'Refrigerator'
    | 'Other';
  deviceName?: string;
  repairStatus:
    | 'Received'
    | 'Diagnosing'
    | 'In Progress'
    | 'Ready for Delivery'
    | 'Delivered'
    | 'Cancelled';
  repairRequested: string;
  technicianNotes?: string;
  internalCost?: number;
  estimatedCost?: number;
  assignedTech?: string;
  storeCode?: string;
  warrantyStatus?: string;
  createdAt: string;
}

export interface SalePhoto {
  id: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  purpose?: string;
}

export interface SalesOrder {
  id: string;
  orderNo: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  store: string;
  items: {
    itemId: string;
    name: string;
    qty: number;
    unitPrice: number;
    taxRate: number;
    sku?: string;
    warrantyMonths?: number;
    warrantyExpiryDate?: string;
  }[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  total: number;
  grossProfit?: number;
  totalCost?: number;
  taxEnabled: boolean;
  paymentMethod: string;
  referenceNo?: string;
  paymentProofUrl?: string;
  cashierName?: string;
  status: 'Completed' | 'Refunded' | 'Pending' | 'Cancelled' | 'Voided';
  createdAt: string;
  period:
    | 'Today'
    | 'Yesterday'
    | 'Last 7 Days'
    | 'This Month'
    | 'Last Month'
    | 'This Quarter'
    | 'This Year'
    | 'DB';
  salePhotos?: SalePhoto[];
  warrantyExpiryDate?: string;
  idempotencyKey?: string;
}

export interface PurchaseOrderItemData {
  id?: string;
  itemId?: string;
  productId?: string;
  name: string;
  sku?: string;
  qty: number;
  unitCost: number;
  taxRate?: number;
  taxAmount?: number;
  discount?: number;
  lineTotal?: number;
  qtyReceived?: number;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  invoiceNo?: string;
  vendorName: string;
  vendorId?: string;
  store: string;
  items: PurchaseOrderItemData[];
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  totalCost?: number;
  paidAmount?: number;
  creditAmount?: number;
  remainingAmount?: number;
  status:
    | 'Draft'
    | 'Sent'
    | 'Ordered'
    | 'Pending'
    | 'Received'
    | 'Completed'
    | 'Cancelled'
    | 'Archived';
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  expectedDate: string;
  dueDate?: string;
  receivedDate?: string;
  createdAt: string;
  notes?: string;
  payments?: any[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address?: string;
  status?: string;
  tier: 'VIP' | 'Regular' | 'New';
  totalSpend: number;
  creditBalance: number;
  lastPurchase: string;
  gstin?: string;
  notes?: string;
  createdAt?: string;
  storeCode?: string;
  storeProfiles?: any[];
  serviceStores?: string[];
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  category: string;
  city?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
  status?: string;
  outstandingPayable: number;
  totalBilledAmount?: number;
  totalPaidAmount?: number;
  totalCreditsAmount?: number;
  totalBillsCount?: number;
  unpaidBillsCount?: number;
  overdueBillsCount?: number;
  rating: number;
  leadTimeDays?: number;
  createdAt?: string;
}

export interface Expense {
  id: string;
  referenceNo: string;
  category: string;
  description: string;
  store: string;
  amount: number;
  paymentMethod: string;
  referenceNoText?: string;
  receiptUrl?: string;
  recordedBy?: string;
  approvedBy?: string;
  status: 'Approved' | 'Pending' | 'Rejected';
  date: string;
  createdAt?: string;
}

export interface StoreHub {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  owner: string;
  manager?: string;
  phone: string;
  status: 'Active' | 'Inactive';
  createdAt?: string;
}

export interface UserPermissionOverride {
  permissionCode: string;
  overrideType: 'ALLOW' | 'DENY';
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role: 'Super Admin' | 'Store Manager' | 'Sales Manager';
  securityLevel?: number;
  store: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  lastLogin: string;
  permissions: string[];
  overrides?: UserPermissionOverride[];
  allowedStores?: string[];
  avatarUrl?: string;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  module: string;
  action: string;
  details: string;
  ipAddress: string;
  storeCode?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'warning' | 'info' | 'success' | 'danger';
  read: boolean;
}

const defaultBranding: AppBranding = {
  appName: 'RISMOS',
  logoUrl: null,
  logoDarkUrl: null,
  appIconUrl: null,
  faviconUrl: null,
  tagline: 'Run Retail. Smarter.',
  primaryColor: '#002E86',
  secondaryColor: '#009ADF',
  accentColor: '#2563EB',
  supportEmail: 'support@rismos.com',
  supportPhone: '+91 80 4000 8800',
  businessName: 'RISMOS Retail Enterprise',
  businessAddress: '100 Feet Ring Road, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560038',
  country: 'India',
  countryCode: 'IN',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  baseCurrency: 'INR (₹)',
  taxNumber: '29AABCU9603R1ZM',
};

export const defaultSystemSettings: SystemSettings = {
  countryCode: 'IN',
  currencyCode: 'INR',
  currencySymbol: '₹',
  taxRegime: 'GST',
  taxInclusivePricing: true,
  taxRegistrationNumber: '29AABCU9603R1ZM',
  taxJurisdictionState: 'Karnataka',
  jurisdictionConfig: null,
  taxConfigVersion: 1,
  gstin: '29AABCU9603R1ZM',
  legalBusinessName: 'RISMOS Retail Enterprise Private Limited',
  tradeName: 'RISMOS Stores',
  gstState: 'Karnataka',
  gstStateCode: '29',
  gstRegistrationType: 'Regular',
  defaultTaxRate: 18,
  hsnMandatory: true,
  enableReverseCharge: false,
  gstBusinessAddress: '100 Feet Ring Road, Indiranagar, Bengaluru, Karnataka - 560038',
  invoiceHeader: 'RISMOS Retail Enterprise',
  invoiceFooter:
    'Thank you for shopping with RISMOS! Goods once sold cannot be returned without original receipt.',
  invoiceTerms:
    '1. Standard 12-month warranty on manufacturing defects.\n2. Retain this invoice for warranty & service support.\n3. Physical and liquid damage are excluded.',
  invoiceAccentColor: 'primary',
  watermarkOpacity: 5,
  showStoreAddress: true,
  invoiceTemplateUrl: null,
  invoiceTemplateVersion: 1,
  invoiceFieldMapping: null,
  showPaymentQr: false,
  paymentUpiId: 'rismos@icici',
  paymentBankDetails: 'HDFC Bank · A/C 50200012345678 · IFSC HDFC0001234',
  sessionTimeoutMins: 43200,
  maxLoginAttempts: 5,
  enforcePasswordPolicy: true,
  sensitiveActionConfirm: true,
  lowStockAlerts: true,
  lowStockThreshold: 5,
  overduePaymentAlerts: true,
  overdueThresholdDays: 30,
  dailySalesDigest: false,
  securityEventAlerts: true,
  alertRecipientEmails: 'alerts@company.com',
};

const initialStoreHubs: StoreHub[] = [];

export const initialCategoryTypes: CategoryTypeItem[] = [
  {
    id: 'type-prod',
    name: 'Product',
    code: 'product',
    description: 'General retail products and inventory goods',
    color: 'primary',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-exp',
    name: 'Expense',
    code: 'expense',
    description: 'Operational, administrative and store expenses',
    color: 'danger',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-dev',
    name: 'Device',
    code: 'device',
    description: 'Smartphones, Tablets, Smartwatches, Laptops and finished electronics',
    color: 'info',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-spare',
    name: 'Spare Part',
    code: 'spare-part',
    description: 'Replacement parts, repair components and hardware',
    color: 'warning',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-acc',
    name: 'Accessory',
    code: 'accessory',
    description: 'Cables, cases, chargers and peripherals',
    color: 'success',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-serv',
    name: 'Service',
    code: 'service',
    description: 'Labor, diagnostic services and maintenance packages',
    color: 'purple',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-ev',
    name: 'EV',
    code: 'ev',
    description: 'Electric vehicle components, battery packs and drives',
    color: 'emerald',
    isSystem: true,
    categoryCount: 0,
  },
  {
    id: 'type-app',
    name: 'Home Appliance',
    code: 'home-appliance',
    description: 'ACs, TVs, Refrigerators, Washing machines and spares',
    color: 'amber',
    isSystem: true,
    categoryCount: 0,
  },
];

export const initialPaymentMethods: PaymentMethodItem[] = [
  {
    id: 'pm-cash',
    name: 'Cash',
    code: 'CASH',
    type: 'Cash',
    description: 'Cash on counter / cash payment',
    isSystem: true,
    sortOrder: 1,
    status: 'Active',
  },
  {
    id: 'pm-upi',
    name: 'UPI',
    code: 'UPI',
    type: 'Digital',
    description: 'Instant UPI / QR Code transfer (GPay, PhonePe, Paytm)',
    isSystem: true,
    sortOrder: 2,
    status: 'Active',
  },
  {
    id: 'pm-other',
    name: 'Other',
    code: 'OTHER',
    type: 'Other',
    description: 'Other verified payment method',
    isSystem: true,
    sortOrder: 3,
    status: 'Active',
  },
];

export const initialBrands: BrandItem[] = [
  { id: 'br-apple', name: 'Apple', code: 'apple', status: 'Active' },
  { id: 'br-samsung', name: 'Samsung', code: 'samsung', status: 'Active' },
  { id: 'br-google', name: 'Google', code: 'google', status: 'Active' },
  { id: 'br-oneplus', name: 'OnePlus', code: 'oneplus', status: 'Active' },
  { id: 'br-xiaomi', name: 'Xiaomi', code: 'xiaomi', status: 'Active' },
  { id: 'br-generic', name: 'Generic / OEM', code: 'generic', status: 'Active' },
];

export const initialUnits: UnitItem[] = [
  { id: 'u-pcs', name: 'Piece', code: 'pcs', symbol: 'pcs', status: 'Active' },
  { id: 'u-box', name: 'Box', code: 'box', symbol: 'bx', status: 'Active' },
  { id: 'u-set', name: 'Set', code: 'set', symbol: 'set', status: 'Active' },
  { id: 'u-kg', name: 'Kilogram', code: 'kg', symbol: 'kg', status: 'Active' },
  { id: 'u-m', name: 'Meter', code: 'meter', symbol: 'm', status: 'Active' },
  { id: 'u-pack', name: 'Pack', code: 'pack', symbol: 'pk', status: 'Active' },
];

export const initialCategories: CategoryItem[] = [];

const initialInventory: InventoryItem[] = [];

const initialStockTransfers: StockTransferRecord[] = [];

const initialInventoryLedger: InventoryLedgerEntry[] = [];

const initialRepairsEnquiries: RepairEnquiry[] = [];

const initialSales: SalesOrder[] = [];

const initialPurchases: PurchaseOrder[] = [];

const initialCustomers: Customer[] = [];

const initialVendors: Vendor[] = [];

const initialExpenses: Expense[] = [];

const initialUsers: UserAccount[] = [];

const initialAuditLogs: AuditLog[] = [];

const initialNotifications: NotificationItem[] = [];

interface AppContextType {
  branding: AppBranding;
  updateBranding: (updated: Partial<AppBranding>) => void;
  resetBranding: () => void;
  systemSettings: SystemSettings;
  updateSystemSettings: (
    section: 'branding' | 'profile' | 'tax' | 'invoice' | 'security' | 'alerts',
    data: any
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  reloadSettings: () => Promise<void>;
  selectedStore: string;
  setSelectedStore: (store: string) => void;
  datePeriod: string;
  setDatePeriod: (period: string) => void;
  customDateRange: { start: string; end: string };
  setCustomDateRange: (range: { start: string; end: string }) => void;
  authStatus: 'AUTH_LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: UserAccount['role'];
    store: string;
    allowedStores?: string[];
    avatar: string;
    avatarUrl?: string;
    mustChangePassword?: boolean;
    permissions?: string[];
    overrides?: UserPermissionOverride[];
  };
  setCurrentUser: (user: any) => void;
  logoutUser: () => void;
  toggleCurrentUserShift: () => void;
  updateProfileAvatar: (avatarUrl: string | null) => void;
  storesList: StoreHub[];
  addStoreHub: (store: Omit<StoreHub, 'id'>) => Promise<any>;
  updateStoreHub: (id: string, updated: Partial<StoreHub>) => Promise<any>;
  deleteStoreHub: (
    id: string,
    permanent?: boolean
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  usersList: UserAccount[];
  addUserAccount: (user: Omit<UserAccount, 'id' | 'lastLogin' | 'permissions'>) => Promise<any>;
  updateUserAccount: (id: string, updated: Partial<UserAccount>) => Promise<any>;

  toggleUserStatus: (id: string, nextStatus: 'Active' | 'Inactive' | 'Suspended') => void;
  setUserPermissionOverride: (
    userId: string,
    permissionCode: string,
    overrideType: 'ALLOW' | 'DENY' | 'RESET'
  ) => Promise<{ success: boolean; error?: string }>;
  toggleUserStoreAccess: (userId: string, storeCode: string) => void;
  deleteUserAccount: (
    id: string,
    permanent?: boolean
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  categoriesList: CategoryItem[];
  categoryTypes: CategoryTypeItem[];
  addCategoryType: (type: { name: string; description?: string; color?: string }) => Promise<any>;
  updateCategoryType: (type: {
    id: string;
    name?: string;
    description?: string;
    color?: string;
  }) => Promise<any>;
  deleteCategoryType: (id: string) => Promise<{ success: boolean; message?: string }>;
  refreshCategoryTypes: () => Promise<void>;
  addCategory: (cat: Omit<CategoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any>;
  updateCategory: (id: string, updated: Partial<CategoryItem>) => Promise<any>;
  toggleCategoryStatus: (id: string) => void;
  deleteCategory: (
    id: string,
    permanent?: boolean
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  changeUserPassword: (
    currentPass: string,
    newPass: string,
    confirmPass: string
  ) => Promise<{ success: boolean; message: string }>;
  updateUserProfile: (
    name: string,
    phone?: string,
    avatarUrl?: string
  ) => Promise<{ success: boolean; message: string }>;
  inventory: InventoryItem[];
  addItem: (item: Omit<InventoryItem, 'id'>) => Promise<any>;
  updateItem: (id: string, updated: Partial<InventoryItem>) => Promise<any>;
  deleteItem: (
    id: string,
    permanent?: boolean
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  adjustStock: (id: string, qtyChange: number, reason: string) => void;
  transferStock: (
    fromStore: string,
    toStore: string,
    itemId: string,
    qty: number,
    customTransferPrice?: number,
    status?: 'Completed' | 'Draft',
    notes?: string
  ) => Promise<any>;
  updateTransferStatus: (id: string, nextStatus: 'Completed' | 'Cancelled') => Promise<any> | void;
  deleteTransfer: (id: string) => Promise<{ success: boolean; message?: string }>;
  defaultStoreTransferPrices: ProductStoreTransferPrice[];
  setDefaultStoreTransferPrice: (productId: string, storeCode: string, price: number) => void;
  stockTransfers: StockTransferRecord[];
  inventoryLedger: InventoryLedgerEntry[];
  repairsEnquiries: RepairEnquiry[];
  sales: SalesOrder[];
  addSale: (
    sale: Omit<SalesOrder, 'id' | 'orderNo' | 'createdAt' | 'period'>
  ) => Promise<SalesOrder | null>;
  updateSale: (id: string, updated: Partial<SalesOrder>) => Promise<any>;
  voidSale: (id: string) => Promise<{ success: boolean; message?: string }>;
  purchases: PurchaseOrder[];
  addPurchase: (po: Omit<PurchaseOrder, 'id' | 'poNo' | 'createdAt'>) => Promise<any>;
  updatePurchase: (id: string, updated: Partial<PurchaseOrder>) => Promise<any>;
  deletePurchase: (id: string) => Promise<{ success: boolean; mode?: string; message?: string }>;
  recordPurchasePayment: (paymentData: {
    purchaseId: string;
    amount: number;
    paymentMethod?: string;
    paymentDate?: string;
    referenceNo?: string;
    notes?: string;
    receiptUrl?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
    payment?: any;
    receiptVoucher?: any;
    remaining?: number;
  }>;
  customers: Customer[];
  addCustomer: (
    cust: Omit<Customer, 'id' | 'totalSpend' | 'lastPurchase'>
  ) => Promise<any> | Customer;
  updateCustomer: (id: string, updated: Partial<Customer>) => Promise<any>;
  deleteCustomer: (
    id: string,
    permanent?: boolean
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  vendors: Vendor[];
  addVendor: (vendor: Omit<Vendor, 'id' | 'code'>) => Promise<any>;
  updateVendor: (id: string, updated: Partial<Vendor>) => Promise<any>;
  deleteVendor: (
    id: string,
    permanent?: boolean,
    reason?: string
  ) => Promise<{ success: boolean; mode?: string; message?: string }>;
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'referenceNo' | 'date'>) => Promise<any>;
  updateExpense: (id: string, updated: Partial<Expense>) => Promise<any>;
  deleteExpense: (id: string) => Promise<{ success: boolean; mode?: string; message?: string }>;
  paymentMethods: PaymentMethodItem[];
  addPaymentMethod: (method: {
    name: string;
    code?: string;
    type?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
    sortOrder?: number;
  }) => Promise<any>;
  updatePaymentMethod: (id: string, updated: Partial<PaymentMethodItem>) => Promise<any>;
  deletePaymentMethod: (id: string) => Promise<{ success: boolean; message?: string }>;
  refreshPaymentMethods: () => Promise<void>;
  brands: BrandItem[];
  addBrand: (brand: {
    name: string;
    code?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
  }) => Promise<any>;
  updateBrand: (id: string, updated: Partial<BrandItem>) => Promise<any>;
  deleteBrand: (id: string) => Promise<{ success: boolean; message?: string }>;
  refreshBrands: () => Promise<void>;
  units: UnitItem[];
  addUnit: (unit: {
    name: string;
    code?: string;
    symbol?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
  }) => Promise<any>;
  updateUnit: (id: string, updated: Partial<UnitItem>) => Promise<any>;
  deleteUnit: (id: string) => Promise<{ success: boolean; message?: string }>;
  refreshUnits: () => Promise<void>;
  auditLogs: AuditLog[];
  addAuditLog: (module: string, action: string, details: string) => void;
  refreshAllData: () => Promise<void>;
  refreshDomainData?: (channel: string) => Promise<any>;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  storeSelectorOpen: boolean;
  setStoreSelectorOpen: (open: boolean) => void;
  userProfileOpen: boolean;
  setUserProfileOpen: (open: boolean) => void;
  // Two-Step Action Confirmation System
  confirmAction: (config: ActionConfirmationConfig) => Promise<boolean>;
  confirmationModalState: {
    open: boolean;
    config: ActionConfirmationConfig | null;
    isProcessing: boolean;
    errorMessage: string | null;
  };
  closeConfirmationModal: () => void;
  executeConfirmationAction: () => Promise<void>;
  formatCurrency: (
    amount: number | string | null | undefined,
    options?: { decimals?: number; showSymbol?: boolean }
  ) => string;
  dateLocale: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<AppBranding>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cosko_branding');
        if (saved) return { ...defaultBranding, ...JSON.parse(saved) };
      } catch {}
    }
    return defaultBranding;
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cosko_system_settings');
        if (saved) return { ...defaultSystemSettings, ...JSON.parse(saved) };
      } catch {}
    }
    return defaultSystemSettings;
  });

  // Cross-tab live synchronization for white-label branding & system settings updates
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cosko_branding' && e.newValue) {
        try {
          setBranding(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === 'cosko_system_settings' && e.newValue) {
        try {
          setSystemSettings(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const formatCurrency = useCallback(
    (
      amount: number | string | null | undefined,
      options?: { decimals?: number; showSymbol?: boolean }
    ) => {
      const activeCurrencyCode =
        systemSettings?.currencyCode || branding?.baseCurrency?.slice(0, 3) || 'INR';
      const activeCurrencySymbol = systemSettings?.currencySymbol || '₹';
      const activeLocale = branding?.locale || 'en-IN';
      const activeCountry = systemSettings?.countryCode || branding?.countryCode || 'IN';

      return formatMoney(amount, {
        currencyCode: activeCurrencyCode,
        currencySymbol: activeCurrencySymbol,
        locale: activeLocale,
        countryCode: activeCountry,
        ...options,
      });
    },
    [
      systemSettings?.currencyCode,
      systemSettings?.currencySymbol,
      systemSettings?.countryCode,
      branding?.baseCurrency,
      branding?.locale,
      branding?.countryCode,
    ]
  );

  const dateLocale = branding?.locale || (systemSettings as any)?.locale || 'en-IN';

  const [selectedStore, setSelectedStoreState] = useState<string>('All Stores');
  const [datePeriod, setDatePeriod] = useState<string>('This Month');
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const [usersList, setUsersList] = useState<UserAccount[]>(initialUsers);

  const [storesList, setStoresList] = useState<StoreHub[]>(initialStoreHubs);
  const [categoriesList, setCategoriesList] = useState<CategoryItem[]>(initialCategories);
  const [categoryTypes, setCategoryTypes] = useState<CategoryTypeItem[]>(initialCategoryTypes);
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [stockTransfers, setStockTransfers] =
    useState<StockTransferRecord[]>(initialStockTransfers);
  const [inventoryLedger, setInventoryLedger] =
    useState<InventoryLedgerEntry[]>(initialInventoryLedger);
  const [repairsEnquiries, setRepairsEnquiries] =
    useState<RepairEnquiry[]>(initialRepairsEnquiries);
  const [sales, setSales] = useState<SalesOrder[]>(initialSales);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>(initialPurchases);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>(initialPaymentMethods);
  const [brands, setBrands] = useState<BrandItem[]>(initialBrands);
  const [units, setUnits] = useState<UnitItem[]>(initialUnits);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [storeSelectorOpen, setStoreSelectorOpen] = useState(false);
  const [userProfileOpen, setUserProfileOpen] = useState(false);

  // Global Two-Step Action Confirmation System State
  const [confirmationModalState, setConfirmationModalState] = useState<{
    open: boolean;
    config: ActionConfirmationConfig | null;
    isProcessing: boolean;
    errorMessage: string | null;
  }>({
    open: false,
    config: null,
    isProcessing: false,
    errorMessage: null,
  });

  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirmAction = useCallback((config: ActionConfirmationConfig): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmationModalState({
        open: true,
        config,
        isProcessing: false,
        errorMessage: null,
      });
    });
  }, []);

  const closeConfirmationModal = useCallback(() => {
    if (confirmationModalState.isProcessing) return; // Prevent closing while action is in flight
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
      confirmResolverRef.current = null;
    }
    setConfirmationModalState({
      open: false,
      config: null,
      isProcessing: false,
      errorMessage: null,
    });
  }, [confirmationModalState.isProcessing]);

  const executeConfirmationAction = useCallback(async () => {
    if (!confirmationModalState.config || confirmationModalState.isProcessing) return;

    setConfirmationModalState((prev) => ({ ...prev, isProcessing: true, errorMessage: null }));

    try {
      if (confirmationModalState.config.onConfirm) {
        await confirmationModalState.config.onConfirm();
      }
      if (confirmResolverRef.current) {
        confirmResolverRef.current(true);
        confirmResolverRef.current = null;
      }
      setConfirmationModalState({
        open: false,
        config: null,
        isProcessing: false,
        errorMessage: null,
      });
    } catch (err: any) {
      console.error('[GlobalConfirmation] Execution error:', err);
      // Re-enable only on genuine failure, keeping modal open and details intact for retry
      setConfirmationModalState((prev) => ({
        ...prev,
        isProcessing: false,
        errorMessage: err?.message || 'Operation failed. Please verify details and try again.',
      }));
    }
  }, [confirmationModalState.config, confirmationModalState.isProcessing]);

  // Invoice sequence is now handled server-side in salesService.ts via DB count

  const unauthenticatedUser = {
    id: '',
    name: 'Unauthenticated User',
    email: '',
    role: 'Sales Manager' as const,
    store: '',
    avatar: 'UN',
    permissions: [] as string[],
    overrides: [] as UserPermissionOverride[],
  };

  const [authStatus, setAuthStatus] = useState<
    'AUTH_LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED'
  >('AUTH_LOADING');
  const [currentUser, setCurrentUserState] = useState<{
    id: string;
    name: string;
    email: string;
    role: UserAccount['role'];
    store: string;
    allowedStores?: string[];
    avatar: string;
    avatarUrl?: string;
    mustChangePassword?: boolean;
    permissions?: string[];
    overrides?: UserPermissionOverride[];
  }>(unauthenticatedUser);

  // Restore active user session from server-authoritative /api/auth/me
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user && isMounted) {
            const user = data.user;
            setCurrentUserState(user);
            setAuthStatus('AUTHENTICATED');
            if (user.role !== 'Super Admin') {
              const effectiveStore =
                user.store && user.store !== 'All Stores'
                  ? user.store
                  : user.allowedStores?.[0] || 'BLR';
              setSelectedStoreState(effectiveStore);
            }
            return;
          }
        }

        if (isMounted) {
          setCurrentUserState(unauthenticatedUser);
          setAuthStatus('UNAUTHENTICATED');
          setDataLoaded(true);
        }
      } catch (err) {
        console.warn('[COSKO] Session init check:', err);
        if (isMounted) {
          setCurrentUserState(unauthenticatedUser);
          setAuthStatus('UNAUTHENTICATED');
          setDataLoaded(true);
        }
      }
    };

    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // ─── INACTIVITY SESSION MONITOR (30 DAYS ENFORCEMENT) ────────────────────
  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED' || typeof window === 'undefined') return;

    const timeoutMins = systemSettings.sessionTimeoutMins || 43200; // 30 days
    const maxInactivityMs = timeoutMins * 60 * 1000;

    const recordActivity = () => {
      try {
        localStorage.setItem('cosko_last_active_time', String(Date.now()));
      } catch {}
    };

    const checkExpiry = () => {
      try {
        const lastStr = localStorage.getItem('cosko_last_active_time');
        if (lastStr) {
          const lastTime = parseInt(lastStr, 10);
          if (Date.now() - lastTime > maxInactivityMs) {
            toast.error('Session expired due to 30 days of inactivity. Please sign in again.');
            logoutUser();
            return;
          }
        } else {
          recordActivity();
        }
      } catch {}
    };

    checkExpiry();
    recordActivity();

    let lastThrottledTime = Date.now();
    const handleInteraction = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 30000) {
        lastThrottledTime = now;
        recordActivity();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleInteraction, { passive: true }));
    const interval = setInterval(checkExpiry, 60000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleInteraction));
      clearInterval(interval);
    };
  }, [authStatus, systemSettings.sessionTimeoutMins]);

  // ─── LOAD ALL DATA FROM MySQL API ON MOUNT & REFRESH ─────────────────────
  // Authoritative persistence: fetch real data from MySQL database with connection starvation protection
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshTimestampRef = useRef<number>(0);
  const domainRefreshInFlightRef = useRef<Record<string, Promise<any> | null>>({});

  const getAuthOpts = useCallback((): RequestInit => {
    return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }, []);

  const safeFetchJson = async (url: string, opts: RequestInit) => {
    try {
      const res = await fetch(url, opts);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return null;
  };

  const fetchStoresData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/stores', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.stores)) {
        setStoresList(
          res.stores.map((s: any) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            city: s.city,
            address: s.address,
            owner: s.ownerName || s.managerName || '',
            manager: s.ownerName || s.managerName || '',
            phone: s.phone || '',
            status: s.status,
            createdAt: s.createdAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchCategoryTypesData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/category-types', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.categoryTypes)) {
        setCategoryTypes(
          res.categoryTypes.map((t: any) => ({
            id: t.id,
            name: t.name,
            code: t.code,
            description: t.description || '',
            color: t.color || 'primary',
            isSystem: Boolean(t.isSystem),
            categoryCount: Number(t.categoryCount) || 0,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchCategoriesData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/categories', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.categories)) {
        setCategoriesList(
          res.categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parentCategoryId: c.parentCategoryId || null,
            parentCategoryName: c.parent?.name,
            categoryType: c.categoryType || 'Product',
            description: c.description || '',
            icon: c.icon,
            imageUrl: c.imageUrl,
            status: c.status || 'Active',
            sortOrder: c.sortOrder || 0,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchInventoryData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/inventory', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.products)) {
        const items: InventoryItem[] = [];
        for (const p of res.products) {
          if (p.status === 'deleted' || p.status === 'archived') continue;
          const locStock: Record<string, number> = {};
          if (p.inventoryItems && p.inventoryItems.length > 0) {
            p.inventoryItems.forEach((inv: any) => {
              locStock[inv.storeCode] = inv.qtyOnHand;
            });
          }
          const productMrp =
            p.mrp !== null && p.mrp !== undefined ? Number(p.mrp) : Number(p.baseSellingPrice) || 0;
          const productImg = p.imageUrl || undefined;

          if (p.inventoryItems && p.inventoryItems.length > 0) {
            for (const inv of p.inventoryItems) {
              items.push({
                id: inv.id || `${p.id}-${inv.storeCode}`,
                productId: p.id,
                sku: p.sku,
                barcode: p.barcode || '',
                name: p.name,
                brand: p.brand || '',
                model: p.model || '',
                category: p.category,
                subcategory: p.subcategory || '',
                description: p.description || '',
                store: inv.storeCode,
                qtyOnHand: inv.qtyOnHand,
                reorderPt: inv.reorderPt || 5,
                costPrice: Number(p.baseCostPrice),
                transferPrice: Number(p.baseCostPrice),
                sellingPrice: Number(p.baseSellingPrice),
                mrp: productMrp,
                hsn: '',
                taxRate: Number(p.gstRate) || 0,
                warrantyMonths: p.warrantyMonths || 0,
                minStock: inv.reorderPt || 10,
                status: p.status as any,
                fifoLots: 1,
                lastMovement: 'Synced',
                imageUrl: productImg,
                primaryImage: productImg,
                images: productImg ? [productImg] : [],
                locationStock: locStock,
                createdAt: p.createdAt,
              });
            }
          } else {
            items.push({
              id: `${p.id}-UNASSIGNED`,
              productId: p.id,
              sku: p.sku,
              barcode: p.barcode || '',
              name: p.name,
              brand: p.brand || '',
              model: p.model || '',
              category: p.category,
              subcategory: p.subcategory || '',
              description: p.description || '',
              store: 'UNASSIGNED',
              qtyOnHand: 0,
              reorderPt: 5,
              costPrice: Number(p.baseCostPrice),
              transferPrice: Number(p.baseCostPrice),
              sellingPrice: Number(p.baseSellingPrice),
              mrp: productMrp,
              hsn: '',
              taxRate: Number(p.gstRate) || 0,
              warrantyMonths: p.warrantyMonths || 0,
              minStock: 10,
              status: p.status as any,
              fifoLots: 0,
              lastMovement: 'Never',
              imageUrl: productImg,
              primaryImage: productImg,
              images: productImg ? [productImg] : [],
              locationStock: locStock,
              createdAt: p.createdAt,
            });
          }
        }
        setInventory(items);
      }
    },
    [getAuthOpts]
  );

  const fetchSalesData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/sales', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.sales)) {
        setSales(
          res.sales.map((s: any) => ({
            id: s.id,
            orderNo: s.orderNo,
            customerName: s.customerName,
            customerPhone: s.customerPhone,
            store: s.storeCode,
            cashierName: s.cashierName || 'Sales Staff',
            items:
              s.items?.map((it: any) => ({
                itemId: it.productId,
                name: it.productName,
                sku: it.sku,
                qty: it.qty,
                unitPrice: Number(it.unitPrice),
                unitCost: Number(it.unitCost) || 0,
                lineTotal: Number(it.lineTotal) || 0,
                lineProfit: Number(it.lineProfit) || 0,
                taxRate: 18,
              })) || [],
            subtotal: Number(s.subtotal),
            taxTotal: Number(s.taxAmount),
            discount: Number(s.discountAmount) || 0,
            total: Number(s.grandTotal),
            taxEnabled: true,
            paymentMethod: s.paymentMethod,
            status: s.status,
            referenceNo: s.referenceNo || undefined,
            paymentProofUrl:
              s.paymentProofUrl || (s.photosJson ? JSON.parse(s.photosJson)?.[0] : undefined),
            createdAt: s.createdAt,
            grossProfit: Number(s.grossProfit) || 0,
            totalCost: Number(s.totalCost) || 0,
            period: 'DB',
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchPurchasesData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/purchases', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.purchases)) {
        setPurchases(
          res.purchases.map((p: any) => {
            const total = Number(p.totalCost) || 0;
            const subtotal =
              p.subtotal !== null && p.subtotal !== undefined ? Number(p.subtotal) : total;
            const taxAmount =
              p.taxAmount !== null && p.taxAmount !== undefined ? Number(p.taxAmount) : 0;
            const discountAmount =
              p.discountAmount !== null && p.discountAmount !== undefined
                ? Number(p.discountAmount)
                : 0;
            const credit = Number(p.creditAmount) || 0;
            const realPaid =
              p.payments?.reduce((sum: number, pay: any) => sum + (Number(pay.amount) || 0), 0) ??
              (p.paidAmount !== undefined && p.paidAmount !== null ? Number(p.paidAmount) : 0);
            const remaining = Math.max(0, Math.round((total - realPaid - credit) * 100) / 100);
            const paymentStatus =
              remaining <= 0.01 && total > 0 ? 'Paid' : realPaid > 0.005 ? 'Partial' : 'Unpaid';

            return {
              id: p.id,
              poNo: p.poNo,
              invoiceNo: p.invoiceNo || p.poNo,
              vendorName: p.vendor?.name || 'Vendor',
              vendorId: p.vendorId,
              store: p.storeCode || 'CENTRAL',
              items:
                p.items?.map((it: any) => ({
                  id: it.id,
                  itemId: it.productId,
                  productId: it.productId,
                  name: it.product?.name || it.productName || it.name || 'Item',
                  sku: it.product?.sku || it.sku || '',
                  qty: it.qtyOrdered || it.qty || 1,
                  unitCost: Number(it.unitCost) || 0,
                  taxRate:
                    it.taxRate !== null && it.taxRate !== undefined
                      ? Number(it.taxRate)
                      : Number(it.product?.gstRate || 0),
                  taxAmount:
                    it.taxAmount !== null && it.taxAmount !== undefined ? Number(it.taxAmount) : 0,
                  discount:
                    it.discount !== null && it.discount !== undefined ? Number(it.discount) : 0,
                  lineTotal:
                    Number(it.lineTotal) ||
                    (it.qtyOrdered || it.qty || 1) * (Number(it.unitCost) || 0),
                  qtyReceived: it.qtyReceived || 0,
                })) || [],
              subtotal,
              taxAmount,
              discountAmount,
              totalAmount: total,
              totalCost: total,
              paidAmount: realPaid,
              creditAmount: credit,
              remainingAmount: remaining,
              status: p.status,
              paymentStatus: paymentStatus,
              notes: p.notes || '',
              createdAt: p.createdAt,
              expectedDate: p.expectedDate ? p.expectedDate : '',
              dueDate: p.dueDate ? p.dueDate : p.expectedDate ? p.expectedDate : '',
              receivedDate: p.receivedDate || undefined,
              payments: p.payments || [],
            };
          })
        );
      }
    },
    [getAuthOpts]
  );

  const fetchCustomersData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/customers', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.customers)) {
        setCustomers(
          res.customers
            .filter((c: any) => c.status !== 'Archived')
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              email: c.email || '',
              city: c.city || '',
              address: c.address || '',
              status: c.status || 'Active',
              tier: Number(c.totalSpent) > 50000 ? 'VIP' : 'Regular',
              totalSpend: Number(c.totalSpent) || 0,
              creditBalance: Number(c.creditBalance) || 0,
              lastPurchase: c.updatedAt
                ? new Date(c.updatedAt).toLocaleDateString('en-IN')
                : 'Never',
              createdAt: c.createdAt,
              storeCode: c.storeCode,
              storeProfiles: c.storeProfiles || [],
              serviceStores:
                c.serviceStores || (c.storeProfiles || []).map((p: any) => p.storeCode),
            }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchVendorsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/vendors', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.vendors)) {
        setVendors(
          res.vendors
            .filter((v: any) => v.status !== 'Archived')
            .map((v: any) => ({
              id: v.id,
              code: v.code,
              name: v.name,
              contactPerson: v.contactPerson,
              email: v.email,
              phone: v.phone,
              city: v.city,
              address: v.address || '',
              category: v.categories || 'General',
              gstin: v.gstin || '',
              paymentTerms: v.paymentTerms || 'Net 30',
              status: v.status || 'Active',
              outstandingPayable: Number(v.outstandingPayable) || 0,
              totalBilledAmount: Number(v.totalBilledAmount) || 0,
              totalPaidAmount: Number(v.totalPaidAmount) || 0,
              totalCreditsAmount: Number(v.totalCreditsAmount) || 0,
              totalBillsCount: Number(v.totalBillsCount) || 0,
              unpaidBillsCount: Number(v.unpaidBillsCount) || 0,
              overdueBillsCount: Number(v.overdueBillsCount) || 0,
              rating: Number(v.rating) || 5.0,
              leadTimeDays: Number(v.leadTimeDays) || 3,
              createdAt: v.createdAt,
            }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchExpensesData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/expenses', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.expenses)) {
        setExpenses(
          res.expenses.map((e: any) => ({
            id: e.id,
            referenceNo: e.expenseNo,
            category: e.category,
            amount: Number(e.amount),
            store: e.storeCode,
            description: e.description,
            paymentMethod: e.paymentMethod,
            status: 'Approved',
            referenceNoText: e.referenceNo || e.expenseNo,
            receiptUrl: e.receiptUrl,
            recordedBy: e.recordedBy || e.approvedBy,
            date: e.date || e.createdAt,
            createdAt: e.createdAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchPaymentMethodsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/payment-methods', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.paymentMethods)) {
        setPaymentMethods(
          res.paymentMethods.map((pm: any) => ({
            id: pm.id,
            name: pm.name,
            code: pm.code,
            type: pm.type || 'Bank',
            description: pm.description || '',
            status: pm.status || 'Active',
            isSystem: Boolean(pm.isSystem),
            sortOrder: Number(pm.sortOrder) || 0,
            createdAt: pm.createdAt,
            updatedAt: pm.updatedAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchBrandsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/brands', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.brands)) {
        setBrands(
          res.brands.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            description: b.description || '',
            status: b.status || 'Active',
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchUnitsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/units', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.units)) {
        setUnits(
          res.units.map((u: any) => ({
            id: u.id,
            name: u.name,
            code: u.code,
            symbol: u.symbol || u.code,
            description: u.description || '',
            status: u.status || 'Active',
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchUsersData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/users', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.users)) {
        setUsersList(
          res.users.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            securityLevel: u.securityLevel,
            store: u.store,
            allowedStores: u.allowedStores || u.assignedStores || [u.store || 'CENTRAL'],
            status: u.status || 'Active',

            lastLogin: u.lastLoginAt
              ? new Date(u.lastLoginAt).toLocaleDateString('en-IN')
              : 'Recent',
            permissions: u.role === 'Super Admin' ? ['ALL_PERMISSIONS'] : u.permissions || [],
            overrides: u.overrides || [],
            avatarUrl: u.avatarUrl,
            createdAt: u.createdAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchRepairsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/repairs', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.repairs)) {
        setRepairsEnquiries(
          res.repairs.map((r: any) => ({
            id: r.id,
            ticketNo: r.ticketNo,
            customerPhone: r.customerPhone,
            customerName: r.customerName,
            enquiryDate:
              r.enquiryDate ||
              (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : 'Recent'),
            deviceType: r.deviceType || 'Mobile',
            deviceName: r.deviceName,
            repairStatus: r.status,
            repairRequested: r.issueDescription,
            technicianNotes: r.technicianNotes || '',
            estimatedCost: Number(r.estimatedCost) || 0,
            assignedTech: r.assignedTech || '',
            storeCode: r.storeCode || 'CENTRAL',
            createdAt: r.createdAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchSettingsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/settings', opts || getAuthOpts());
      if (res?.success) {
        if (res.branding) {
          setBranding((prev) => {
            const updated = {
              ...prev,
              ...res.branding,
              taxNumber: res.systemSettings?.gstin || res.branding.taxNumber || prev.taxNumber,
            };
            try {
              localStorage.setItem('cosko_branding', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }
        if (res.systemSettings) {
          setSystemSettings((prev) => {
            const updated = {
              ...prev,
              ...res.systemSettings,
              defaultTaxRate: Number(res.systemSettings.defaultTaxRate) || prev.defaultTaxRate,
            };
            try {
              localStorage.setItem('cosko_system_settings', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }
      }
    },
    [getAuthOpts]
  );

  const fetchTransfersData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/transfers', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.transfers)) {
        setStockTransfers(
          res.transfers.map((t: any) => {
            const totalUnits = Number(t.totalUnits) || 0;
            const totalCost = round2(Number(t.totalCost) || 0);
            const totalTransferValue = round2(Number(t.totalTransferValue) || 0);
            const grossProfit = round2(
              t.grossProfit !== undefined && t.grossProfit !== null && !isNaN(Number(t.grossProfit))
                ? Number(t.grossProfit)
                : totalTransferValue - totalCost
            );
            const purchaseCost =
              totalUnits > 0
                ? round2(totalCost / totalUnits)
                : Number(t.items?.[0]?.costPerUnit) || 0;
            const transferPrice =
              totalUnits > 0
                ? round2(totalTransferValue / totalUnits)
                : Number(t.items?.[0]?.transferPricePerUnit) || 0;
            const grossMarginPercent =
              totalTransferValue > 0 ? round2((grossProfit / totalTransferValue) * 100) : 0;

            return {
              id: t.id,
              transferNo: t.transferNo,
              sourceStore: t.sourceStore,
              destStore: t.destStore,
              status: t.status,
              qty: totalUnits,
              totalUnits,
              transferPrice,
              purchaseCost,
              totalCost,
              totalTransferValue,
              grossProfit,
              transferProfit: grossProfit,
              grossMarginPercent,
              notes: t.notes || '',
              productName: t.items?.[0]?.product?.name || 'Stock Item',
              sku: t.items?.[0]?.product?.sku || 'SKU',
              productId: t.items?.[0]?.productId || '',
              createdAt: t.createdAt,
              items: t.items || [],
            };
          })
        );
      }
    },
    [getAuthOpts]
  );

  const fetchLedgerData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/inventory/ledger', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.ledger)) {
        setInventoryLedger(
          res.ledger.map((l: any) => ({
            id: l.id,
            productId: l.productId,
            productName: l.product?.name || 'Item',
            sku: l.product?.sku || '',
            storeCode: l.storeCode,
            movementType: l.type,
            qtyChange: l.qtyChange,
            costPerUnit: Number(l.costPerUnit),
            balanceAfter: l.balanceAfter,
            referenceNo: l.refNo,
            notes: l.notes || '',
            userEmail: l.createdBy || 'System',
            createdAt: l.createdAt,
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const fetchAuditLogsData = useCallback(
    async (opts?: RequestInit) => {
      const res = await safeFetchJson('/api/audit-logs?limit=200', opts || getAuthOpts());
      if (res?.success && Array.isArray(res.logs)) {
        setAuditLogs(
          res.logs.map((a: any) => ({
            id: a.id,
            timestamp: a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN') : 'Recent',
            userName: a.userName || a.userEmail || 'System',
            userRole: a.userRole || 'Admin',
            module: a.module || 'System',
            action: a.action || 'Action',
            details: a.details || a.description || '',
            ipAddress: a.ipAddress || '127.0.0.1',
          }))
        );
      }
    },
    [getAuthOpts]
  );

  const refreshAllData = useCallback(async () => {
    // Return existing in-flight promise if a refresh is already running
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    // Debounce calls within 300ms to avoid flooding remote MySQL connection pool
    const now = Date.now();
    if (now - lastRefreshTimestampRef.current < 300) {
      return;
    }
    lastRefreshTimestampRef.current = now;

    const doRefresh = async () => {
      try {
        const opts = getAuthOpts();
        // Fetch all authoritative data concurrently via modular domain handlers
        await Promise.allSettled([
          fetchStoresData(opts),
          fetchCategoriesData(opts),
          fetchCategoryTypesData(opts),
          fetchPaymentMethodsData(opts),
          fetchBrandsData(opts),
          fetchUnitsData(opts),
          fetchInventoryData(opts),
          fetchSalesData(opts),
          fetchPurchasesData(opts),
          fetchCustomersData(opts),
          fetchVendorsData(opts),
          fetchExpensesData(opts),
          fetchRepairsData(opts),
          fetchUsersData(opts),
          fetchTransfersData(opts),
          fetchLedgerData(opts),
          fetchSettingsData(opts),
          fetchAuditLogsData(opts),
        ]);

        setDataLoaded(true);
        console.log('[COSKO] Authoritative data loaded from MySQL database');
      } catch (err) {
        console.warn('[COSKO] Data loading error:', err);
        setDataLoaded(true);
      } finally {
        refreshInFlightRef.current = null;
      }
    };

    const promise = doRefresh();
    refreshInFlightRef.current = promise;
    return promise;
  }, [
    getAuthOpts,
    fetchStoresData,
    fetchCategoriesData,
    fetchCategoryTypesData,
    fetchPaymentMethodsData,
    fetchBrandsData,
    fetchUnitsData,
    fetchInventoryData,
    fetchSalesData,
    fetchPurchasesData,
    fetchCustomersData,
    fetchVendorsData,
    fetchExpensesData,
    fetchRepairsData,
    fetchUsersData,
    fetchTransfersData,
    fetchLedgerData,
    fetchSettingsData,
    fetchAuditLogsData,
  ]);

  // Targeted domain refresh: refreshes ONLY the affected entities rather than pounding all 15 endpoints
  const refreshDomainData = useCallback(
    async (channel: string) => {
      const c = (channel || '').toLowerCase().trim();
      if (domainRefreshInFlightRef.current[c]) {
        return domainRefreshInFlightRef.current[c];
      }

      const doDomainRefresh = async () => {
        try {
          const opts = getAuthOpts();
          if (c === 'sales') {
            await Promise.allSettled([
              fetchSalesData(opts),
              fetchInventoryData(opts),
              fetchCustomersData(opts),
            ]);
          } else if (c === 'inventory') {
            await Promise.allSettled([
              fetchInventoryData(opts),
              fetchTransfersData(opts),
              fetchLedgerData(opts),
              fetchBrandsData(opts),
              fetchUnitsData(opts),
            ]);
          } else if (c === 'transfers') {
            await Promise.allSettled([
              fetchTransfersData(opts),
              fetchInventoryData(opts),
              fetchLedgerData(opts),
            ]);
          } else if (c === 'purchases') {
            await Promise.allSettled([
              fetchPurchasesData(opts),
              fetchVendorsData(opts),
              fetchInventoryData(opts),
              fetchPaymentMethodsData(opts),
            ]);
          } else if (c === 'expenses') {
            await Promise.allSettled([fetchExpensesData(opts), fetchPaymentMethodsData(opts)]);
          } else if (c === 'repairs') {
            await fetchRepairsData(opts);
          } else if (c === 'customers') {
            await fetchCustomersData(opts);
          } else if (c === 'vendors') {
            await fetchVendorsData(opts);
          } else if (c === 'users') {
            await fetchUsersData(opts);
          } else if (c === 'settings') {
            await fetchSettingsData(opts);
          } else if (c === 'categories') {
            await Promise.allSettled([fetchCategoriesData(opts), fetchCategoryTypesData(opts)]);
          } else if (c === 'payment-methods' || c === 'paymentmethods') {
            await fetchPaymentMethodsData(opts);
          } else if (c === 'brands') {
            await fetchBrandsData(opts);
          } else if (c === 'units') {
            await fetchUnitsData(opts);
          } else if (c === 'stores') {
            await fetchStoresData(opts);
          } else {
            // Unrecognized domain: do NOT reload whole app to avoid resetting open forms
          }
        } catch (err) {
          console.warn(`[COSKO] Domain refresh error (${c}):`, err);
        } finally {
          domainRefreshInFlightRef.current[c] = null;
        }
      };

      const promise = doDomainRefresh();
      domainRefreshInFlightRef.current[c] = promise;
      return promise;
    },
    [
      getAuthOpts,
      fetchSalesData,
      fetchInventoryData,
      fetchCustomersData,
      fetchTransfersData,
      fetchLedgerData,
      fetchPurchasesData,
      fetchVendorsData,
      fetchExpensesData,
      fetchRepairsData,
      fetchUsersData,
      fetchSettingsData,
      fetchCategoriesData,
      fetchCategoryTypesData,
      fetchStoresData,
      refreshAllData,
    ]
  );

  // Load data immediately whenever user is authenticated
  useEffect(() => {
    if (authStatus === 'AUTHENTICATED') {
      refreshAllData();
    }
  }, [authStatus, refreshAllData]);

  // Multi-Device Synchronization: Window Focus, Visibility Change, and Distributed Realtime
  useEffect(() => {
    if (typeof window === 'undefined' || authStatus !== 'AUTHENTICATED') return;

    // 1. Revalidate on window focus only if stale (> 30 seconds since last refresh)
    const handleFocus = () => {
      if (Date.now() - lastRefreshTimestampRef.current > 30000) {
        refreshAllData();
      }
    };

    // 2. Revalidate on tab visibility change only if stale (> 30 seconds since last refresh)
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastRefreshTimestampRef.current > 30000
      ) {
        refreshAllData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Initialize Distributed Realtime Client Manager (Pusher or DB Outbox Fallback)
    realtimeClient.initialize();

    const unsubscribe = realtimeClient.subscribe((msg) => {
      const event = (msg.event || '').toLowerCase();

      // Targeted domain invalidation — avoids whole-app reload and preserves open form drafts (Requirements R & T)
      if (event.includes('sale')) {
        refreshDomainData('sales');
        refreshDomainData('inventory');
      } else if (event.includes('stock') || event.includes('inventory')) {
        refreshDomainData('inventory');
      } else if (event.includes('transfer')) {
        refreshDomainData('transfers');
        refreshDomainData('inventory');
      } else if (event.includes('user') || event.includes('permission')) {
        refreshDomainData('users');
        fetch('/api/auth/me', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.authenticated && data?.user) {
              setCurrentUserState(data.user);
            }
          })
          .catch(() => {});
      } else if (event.includes('customer')) {
        refreshDomainData('customers');
      } else if (event.includes('vendor')) {
        refreshDomainData('vendors');
      } else if (event.includes('purchase')) {
        refreshDomainData('purchases');
        refreshDomainData('inventory');
      } else if (event.includes('expense')) {
        refreshDomainData('expenses');
      } else if (event.includes('category')) {
        refreshDomainData('categories');
      } else if (event.includes('brand')) {
        refreshDomainData('brands');
      } else if (event.includes('unit')) {
        refreshDomainData('units');
      } else if (event.includes('store')) {
        refreshDomainData('stores');
      } else if (
        event.includes('setting') ||
        event.includes('branding') ||
        event.includes('tax') ||
        event.includes('profile') ||
        event.includes('invoice') ||
        event.includes('security') ||
        event.includes('alert')
      ) {
        refreshDomainData('settings');
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
      realtimeClient.destroy();
    };
  }, [authStatus, refreshAllData, refreshDomainData]);

  const setCurrentUser = (user: any) => {
    if (!user || !user.id) {
      logoutUser();
      return;
    }

    if (user.role !== 'Super Admin') {
      const effectiveStore =
        user.store && user.store !== 'All Stores' ? user.store : user.allowedStores?.[0] || 'BLR';
      user.store = effectiveStore;
      setSelectedStoreState(effectiveStore);
    }

    setCurrentUserState(user);
    setAuthStatus('AUTHENTICATED');

    refreshAllData();
  };

  const logoutUser = async () => {
    try {
      if (typeof window !== 'undefined') {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      }
    } catch {}
    setCurrentUserState(unauthenticatedUser);
    setAuthStatus('UNAUTHENTICATED');
    setSelectedStoreState('All Stores');
  };

  const updateBranding = (updatedPartial: Partial<AppBranding>) => {
    setBranding((prev) => {
      const updated = { ...prev, ...updatedPartial };
      try {
        const jsonStr = JSON.stringify(updated);
        localStorage.setItem('cosko_branding', jsonStr);
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'cosko_branding', newValue: jsonStr })
        );
      } catch {}
      return updated;
    });

    MySQLDataService.updateBrandingSettings(updatedPartial).catch((err) => {
      console.warn('Failed to sync branding to MySQL:', err);
    });

    addAuditLog('Settings', 'Update White-Label Branding', `Updated app branding logo & details`);
    toast.success('Application branding updated successfully across the entire system!');
  };

  const updateSystemSettings = async (
    section: 'branding' | 'profile' | 'tax' | 'invoice' | 'security' | 'alerts',
    data: any
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section, data }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        const errMsg = result.error || 'Failed to update settings';
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      if (section === 'branding' && result.branding) {
        setBranding((prev) => {
          const updated = { ...prev, ...result.branding };
          try {
            localStorage.setItem('cosko_branding', JSON.stringify(updated));
            window.dispatchEvent(
              new StorageEvent('storage', {
                key: 'cosko_branding',
                newValue: JSON.stringify(updated),
              })
            );
          } catch {}
          return updated;
        });
      } else if (section === 'profile' && result.branding) {
        setBranding((prev) => {
          const updated = { ...prev, ...result.branding };
          try {
            localStorage.setItem('cosko_branding', JSON.stringify(updated));
            window.dispatchEvent(
              new StorageEvent('storage', {
                key: 'cosko_branding',
                newValue: JSON.stringify(updated),
              })
            );
          } catch {}
          return updated;
        });
      } else if (result.systemSettings) {
        setSystemSettings((prev) => {
          const updated = {
            ...prev,
            ...result.systemSettings,
            defaultTaxRate: Number(result.systemSettings.defaultTaxRate) || prev.defaultTaxRate,
          };
          try {
            localStorage.setItem('cosko_system_settings', JSON.stringify(updated));
            window.dispatchEvent(
              new StorageEvent('storage', {
                key: 'cosko_system_settings',
                newValue: JSON.stringify(updated),
              })
            );
          } catch {}
          return updated;
        });
        if (result.systemSettings.gstin) {
          setBranding((prev) => ({ ...prev, taxNumber: result.systemSettings.gstin }));
        }
      }

      addAuditLog(
        'Settings',
        `Update ${section.toUpperCase()} Settings`,
        `Updated ${section} settings in system`
      );
      toast.success(result.message || `${section.toUpperCase()} settings saved successfully`);
      return { success: true, message: result.message };
    } catch (err: any) {
      toast.error(err.message || 'Network error updating settings');
      return { success: false, error: err.message };
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.branding) setBranding((prev) => ({ ...prev, ...data.branding }));
        if (data.systemSettings) setSystemSettings((prev) => ({ ...prev, ...data.systemSettings }));
      }
    } catch (err) {
      console.warn('Failed to reload settings:', err);
    }
  };

  const resetBranding = () => {
    setBranding(defaultBranding);
    try {
      localStorage.removeItem('cosko_branding');
      MySQLDataService.updateBrandingSettings({
        appName: defaultBranding.appName,
        logoUrl: null,
        tagline: defaultBranding.tagline,
        supportEmail: defaultBranding.supportEmail,
      }).catch((err) => console.warn('Failed to reset branding in MySQL:', err));
    } catch {}
    addAuditLog('Settings', 'Reset Branding', 'Reset white-label branding to system default');
    toast.info('Application branding reset to defaults');
  };

  const toggleCurrentUserShift = async () => {
    // Shift status now handled by AttendanceDay model
    toast.info('Use the Attendance system to manage shift status');
  };

  const updateProfileAvatar = (avatarUrl: string | null) => {
    if (authStatus !== 'AUTHENTICATED') return;
    setCurrentUserState((prev) => ({ ...prev, avatarUrl: avatarUrl || undefined }));
    setUsersList((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, avatarUrl: avatarUrl || undefined } : u))
    );
    toast.success('Profile avatar updated');
  };

  const setSelectedStore = (store: string) => {
    if (currentUser.role !== 'Super Admin') {
      const assignedStore =
        currentUser.store && currentUser.store !== 'All Stores' ? currentUser.store : 'BLR';
      setSelectedStoreState(assignedStore);
      return;
    }
    setSelectedStoreState(store);
  };

  const addStoreHub = async (storeData: Omit<StoreHub, 'id'>) => {
    try {
      const res = await MySQLDataService.syncStore(storeData);
      if (res?.success && res.store) {
        const newStore: StoreHub = {
          id: res.store.id,
          code: res.store.code,
          name: res.store.name,
          city: res.store.city,
          address: res.store.address,
          owner: res.store.ownerName || res.store.managerName || '',
          manager: res.store.ownerName || res.store.managerName || '',
          phone: res.store.phone || '',
          status: res.store.status,
          createdAt: res.store.createdAt,
        };
        setStoresList((prev) => [
          newStore,
          ...prev.filter((s) => s.id !== newStore.id && s.code !== newStore.code),
        ]);
        addAuditLog(
          'Stores',
          'Create Store Hub',
          `Created store hub "${newStore.name}" (${newStore.code})`
        );
        toast.success(`Store Hub "${newStore.name}" (${newStore.code}) saved to MySQL!`);
        refreshAllData();
        return { success: true, store: newStore };
      } else {
        toast.error(res?.error || 'Failed to save store hub');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving store');
      return { success: false, error: err.message };
    }
  };

  const updateStoreHub = async (id: string, updated: Partial<StoreHub>) => {
    const target = storesList.find((s) => s.id === id || s.code === id);
    if (!target) return;
    const merged = { ...target, ...updated };
    try {
      const res = await MySQLDataService.syncStore(merged);
      if (res?.success) {
        setStoresList((prev) => prev.map((s) => (s.id === id || s.code === id ? merged : s)));
        addAuditLog('Stores', 'Edit Store Hub', `Updated store #${id}`);
        toast.success('Store details updated in MySQL');
        await refreshAllData();
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update store');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating store');
      return { success: false, error: err.message };
    }
  };

  const deleteStoreHub = async (id: string, permanent = false) => {
    const s = storesList.find(
      (st) => st.id === id || st.code === id || st.code.toUpperCase() === id.toUpperCase()
    );
    if (s?.code === 'CENTRAL' || id === 'CENTRAL' || id.toUpperCase() === 'CENTRAL') {
      toast.error(
        'The default Central Warehouse & Owner Store (CENTRAL) is permanent and cannot be deleted.'
      );
      return { success: false, message: 'CENTRAL store cannot be deleted' };
    }
    const lookupId = s ? s.code : id;
    try {
      const res = await MySQLDataService.deleteStore(lookupId, permanent);
      if (res?.success) {
        setStoresList((prev) =>
          prev.filter(
            (st) =>
              st.id !== id && st.code !== id && (s ? st.id !== s.id && st.code !== s.code : true)
          )
        );
        if (selectedStore === (s?.code || id)) {
          setSelectedStoreState('All Stores');
        }
        if (s) {
          addAuditLog(
            'Stores',
            res.mode === 'archived' ? 'Deactivate Store Hub' : 'Delete Store Hub',
            `${res.message || `Removed store "${s.name}"`}`
          );
        }
        toast.success(res.message || `Removed store "${s?.name || id}"`);
        refreshAllData();
        return { success: true, mode: res.mode, message: res.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to remove store hub');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error('Network error while deleting store');
      return { success: false, message: err.message };
    }
  };

  const addUserAccount = async (
    userData: Omit<UserAccount, 'id' | 'lastLogin' | 'permissions'>
  ) => {
    try {
      const res = await MySQLDataService.createProfile(userData);
      if (res?.success && res.user) {
        const newAccount: UserAccount = {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          securityLevel: res.user.securityLevel,
          store: res.user.store,
          allowedStores: res.user.assignedStores || [res.user.store],
          status: res.user.status,

          lastLogin: 'Never',
          permissions: res.user.role === 'Super Admin' ? ['ALL_PERMISSIONS'] : [],
          createdAt: res.user.createdAt,
        };
        setUsersList((prev) => [
          newAccount,
          ...prev.filter((u) => u.id !== newAccount.id && u.email !== newAccount.email),
        ]);
        addAuditLog(
          'Users & Roles',
          'Provision User',
          `Provisioned account for ${newAccount.name} (${newAccount.role})`
        );
        toast.success(`User "${newAccount.name}" created & persisted to MySQL!`);
        refreshAllData();
        return { success: true, user: newAccount };
      } else {
        toast.error(res?.error || 'Failed to create user');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating user');
      return { success: false, error: err.message };
    }
  };

  const updateUserAccount = async (id: string, updated: Partial<UserAccount>) => {
    const updatedUser = usersList.find((u) => u.id === id);
    if (!updatedUser) return;
    const merged = { ...updatedUser, ...updated };
    try {
      const res = await MySQLDataService.updateProfile(merged);
      if (res?.success) {
        setUsersList((prev) => prev.map((u) => (u.id === id ? merged : u)));
        addAuditLog('Users & Roles', 'Edit User Profile', `Updated user profile #${id}`);
        toast.success('User record updated in MySQL');
        await refreshAllData();
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update user profile');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating user profile');
      return { success: false, error: err.message };
    }
  };

  const toggleUserShiftStatus = async (_id: string) => {
    // Shift status now handled by AttendanceDay model
    toast.info('Use the Attendance system to manage shift status');
  };

  const toggleUserStatus = async (id: string, nextStatus: 'Active' | 'Inactive' | 'Suspended') => {
    const u = usersList.find((usr) => usr.id === id);
    if (!u) return;
    const updatedUser = { ...u, status: nextStatus };
    try {
      const res = await MySQLDataService.updateProfile(updatedUser);
      if (res?.success) {
        setUsersList((prev) => prev.map((usr) => (usr.id === id ? updatedUser : usr)));
        addAuditLog(
          'Users & Roles',
          'Change Account Status',
          `Set account #${id} status to ${nextStatus}`
        );
        toast.success(`Account status changed to ${nextStatus}`);
        await refreshAllData();
      } else {
        toast.error(res?.error || 'Failed to change account status');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error changing account status');
    }
  };

  const setUserPermissionOverride = async (
    userId: string,
    permissionCode: string,
    overrideType: 'ALLOW' | 'DENY' | 'RESET'
  ): Promise<{ success: boolean; error?: string }> => {
    const targetUser = usersList.find((u) => u.id === userId);
    if (targetUser?.role === 'Super Admin') {
      toast.info(
        'Super Admin holds full root-level enterprise access. Permissions cannot be overridden.'
      );
      return { success: false, error: 'Cannot override Super Admin permissions' };
    }
    const currentOverrides = targetUser?.overrides || [];
    let updatedOverrides: UserPermissionOverride[];
    if (overrideType === 'RESET') {
      updatedOverrides = currentOverrides.filter((o) => o.permissionCode !== permissionCode);
    } else {
      updatedOverrides = [
        ...currentOverrides.filter((o) => o.permissionCode !== permissionCode),
        { permissionCode, overrideType },
      ];
    }

    // 1. Optimistic visual update
    setUsersList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, overrides: updatedOverrides } : u))
    );
    if (userId === currentUser.id) {
      setCurrentUserState((prev) => ({
        ...prev,
        overrides: updatedOverrides,
        permissions: getEffectivePermissions({ role: prev.role, overrides: updatedOverrides }),
      }));
    }

    // 2. Persist to MySQL database
    try {
      const res = await MySQLDataService.updateProfile({
        id: userId,
        permissionOverride: { permissionCode, overrideType },
        overrides: updatedOverrides,
      });
      if (!res?.success) {
        const errorMsg = res?.error || 'Failed to persist permission override to database';
        toast.error(errorMsg);
        // Rollback on error
        setUsersList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, overrides: currentOverrides } : u))
        );
        if (userId === currentUser.id) {
          setCurrentUserState((prev) => ({
            ...prev,
            overrides: currentOverrides,
            permissions: getEffectivePermissions({ role: prev.role, overrides: currentOverrides }),
          }));
        }
        return { success: false, error: errorMsg };
      }

      toast.success(`Permission ${permissionCode} override saved to database`);
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.message || 'Network error saving permission override';
      toast.error(errorMsg);
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, overrides: currentOverrides } : u))
      );
      if (userId === currentUser.id) {
        setCurrentUserState((prev) => ({
          ...prev,
          overrides: currentOverrides,
          permissions: getEffectivePermissions({ role: prev.role, overrides: currentOverrides }),
        }));
      }
      return { success: false, error: errorMsg };
    }
  };

  const toggleUserStoreAccess = async (userId: string, storeCode: string) => {
    const targetUser = usersList.find((u) => u.id === userId);
    if (targetUser?.role === 'Super Admin') {
      toast.info('Super Admin has unrestricted access to all store locations.');
      return;
    }
    const currentAllowed =
      targetUser?.allowedStores && targetUser.allowedStores.length > 0
        ? targetUser.allowedStores
        : [targetUser?.store || 'BLR'];
    const hasAccess = currentAllowed.includes(storeCode);
    if (hasAccess && currentAllowed.length === 1) {
      toast.error('A user must be assigned to at least one store.');
      return;
    }
    const nextAllowed = hasAccess
      ? currentAllowed.filter((s) => s !== storeCode)
      : [...currentAllowed, storeCode];
    const finalAllowed = nextAllowed.length > 0 ? nextAllowed : [targetUser?.store || 'BLR'];
    const primaryStore = finalAllowed[0] || 'BLR';

    // 1. Optimistic instant visual update
    setUsersList((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, allowedStores: finalAllowed, store: primaryStore } : u
      )
    );
    toast.success(`Updated store scope access for ${storeCode}`);

    // 2. Persist to MySQL database
    try {
      const res = await MySQLDataService.updateProfile({
        id: userId,
        assignedStores: finalAllowed,
        allowedStores: finalAllowed,
        store: primaryStore,
      });
      if (!res?.success) {
        toast.error(res?.error || 'Failed to persist store scope to database');
        // Rollback on error
        setUsersList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, allowedStores: currentAllowed } : u))
        );
      }
    } catch (err: any) {
      toast.error('Network error saving store scope access');
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, allowedStores: currentAllowed } : u))
      );
    }
  };

  const deleteUserAccount = async (id: string, permanent = false) => {
    const u = usersList.find((usr) => usr.id === id);
    try {
      const res = await MySQLDataService.deleteProfile(id, permanent);
      if (res?.success) {
        setUsersList((prev) => prev.filter((usr) => usr.id !== id));
        if (u) {
          addAuditLog(
            'Users & Roles',
            res.mode === 'archived' ? 'Deactivate User Account' : 'Delete User Account',
            res.message || `Removed account "${u.name}"`
          );
        }
        toast.success(res.message || `Removed account "${u?.name || id}"`);
        refreshAllData();
        return { success: true, mode: res.mode, message: res.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete user account');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error('Network error while deleting user');
      return { success: false, message: err.message };
    }
  };

  const addCategory = async (catData: Omit<CategoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const res = await MySQLDataService.createCategory(catData);
      if (res?.success && res.category) {
        const c = res.category;
        const newCat: CategoryItem = {
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentCategoryId: c.parentCategoryId,
          categoryType: c.categoryType || 'Product',
          description: c.description || '',
          icon: c.icon,
          imageUrl: c.imageUrl,
          status: c.status || 'Active',
          sortOrder: c.sortOrder || 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
        setCategoriesList((prev) => [newCat, ...prev.filter((cat) => cat.id !== newCat.id)]);
        addAuditLog(
          'Categories',
          'Create Category',
          `Created category "${newCat.name}" (${newCat.categoryType})`
        );
        toast.success(`Category "${newCat.name}" saved to MySQL!`);
        refreshAllData();
        return { success: true, category: newCat };
      } else {
        toast.error(res?.error || 'Failed to save category');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving category');
      return { success: false, error: err.message };
    }
  };

  const updateCategory = async (id: string, updated: Partial<CategoryItem>) => {
    try {
      const res = await MySQLDataService.updateCategory({ id, ...updated });
      if (res?.success) {
        setCategoriesList((prev) =>
          prev.map((c) => {
            if (c.id === id) {
              const parent =
                updated.parentCategoryId !== undefined
                  ? updated.parentCategoryId
                    ? prev.find((p) => p.id === updated.parentCategoryId)?.name
                    : undefined
                  : c.parentCategoryName;
              return {
                ...c,
                ...updated,
                parentCategoryName: parent,
                updatedAt: new Date().toISOString(),
              };
            }
            return c;
          })
        );
        addAuditLog('Categories', 'Update Category', `Updated category #${id}`);
        toast.success('Category updated successfully');
        await refreshAllData();
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update category');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating category');
      return { success: false, error: err.message };
    }
  };

  const toggleCategoryStatus = async (id: string) => {
    const c = categoriesList.find((cat) => cat.id === id);
    if (!c) return;
    const nextStatus: 'Active' | 'Inactive' = c.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await MySQLDataService.updateCategory({ id: c.id, status: nextStatus });
      if (res?.success) {
        setCategoriesList((prev) =>
          prev.map((cat) =>
            cat.id === id
              ? { ...cat, status: nextStatus, updatedAt: new Date().toISOString() }
              : cat
          )
        );
        addAuditLog(
          'Categories',
          'Toggle Category Status',
          `Changed category "${c.name}" status to ${nextStatus}`
        );
        toast.success(`Category "${c.name}" is now ${nextStatus}`);
        await refreshAllData();
      } else {
        toast.error(res?.error || 'Failed to update category status');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating category status');
    }
  };

  const deleteCategory = async (id: string, permanent = false) => {
    const target = categoriesList.find((c) => c.id === id || c.slug === id);
    try {
      const res = await MySQLDataService.deleteCategory(id, permanent);
      if (res?.success) {
        setCategoriesList((prev) => prev.filter((c) => c.id !== id && c.slug !== id));
        if (target) {
          addAuditLog(
            'Categories',
            res?.mode === 'archived' ? 'Archive Category' : 'Delete Category',
            res?.message || `Removed category "${target.name}"`
          );
        }
        toast.success(res?.message || `Category "${target?.name || id}" removed`);
        refreshAllData();
        return { success: true, mode: res?.mode || 'deleted', message: res?.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to remove category');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error removing category');
      return { success: false, message: err.message };
    }
  };

  const refreshCategoryTypes = async () => {
    try {
      const res = await MySQLDataService.fetchCategoryTypes();
      if (res?.success && Array.isArray(res.categoryTypes)) {
        setCategoryTypes(
          res.categoryTypes.map((t: any) => ({
            id: t.id,
            name: t.name,
            code: t.code,
            description: t.description || '',
            color: t.color || 'primary',
            isSystem: Boolean(t.isSystem),
            categoryCount: Number(t.categoryCount) || 0,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }))
        );
      }
    } catch (err: any) {
      console.error('Failed to refresh category types:', err);
    }
  };

  const addCategoryType = async (typeData: {
    name: string;
    description?: string;
    color?: string;
  }) => {
    try {
      const res = await MySQLDataService.createCategoryType(typeData);
      if (res?.success && res.categoryType) {
        const newT: CategoryTypeItem = {
          id: res.categoryType.id,
          name: res.categoryType.name,
          code: res.categoryType.code,
          description: res.categoryType.description || '',
          color: res.categoryType.color || 'primary',
          isSystem: Boolean(res.categoryType.isSystem),
          categoryCount: 0,
          createdAt: res.categoryType.createdAt,
          updatedAt: res.categoryType.updatedAt,
        };
        setCategoryTypes((prev) => [
          newT,
          ...prev.filter(
            (t) => t.id !== newT.id && t.name.toLowerCase() !== newT.name.toLowerCase()
          ),
        ]);
        addAuditLog('Categories', 'Create Category Type', `Created category type "${newT.name}"`);
        toast.success(`Category Type "${newT.name}" created!`);
        refreshCategoryTypes();
        return { success: true, categoryType: newT };
      } else {
        toast.error(res?.error || res?.message || 'Failed to create category type');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating category type');
      return { success: false, error: err.message };
    }
  };

  const updateCategoryType = async (typeData: {
    id: string;
    name?: string;
    description?: string;
    color?: string;
  }) => {
    try {
      const res = await MySQLDataService.updateCategoryType(typeData);
      if (res?.success && res.categoryType) {
        const u = res.categoryType;
        setCategoryTypes((prev) => prev.map((t) => (t.id === u.id ? { ...t, ...u } : t)));
        addAuditLog('Categories', 'Update Category Type', `Updated category type "${u.name}"`);
        toast.success(`Category Type "${u.name}" updated!`);
        refreshCategoryTypes();
        refreshAllData();
        return { success: true, categoryType: u };
      } else {
        toast.error(res?.error || res?.message || 'Failed to update category type');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating category type');
      return { success: false, error: err.message };
    }
  };

  const deleteCategoryType = async (id: string) => {
    try {
      const target = categoryTypes.find((t) => t.id === id);
      const res = await MySQLDataService.deleteCategoryType(id);
      if (res?.success) {
        setCategoryTypes((prev) => prev.filter((t) => t.id !== id));
        if (target) {
          addAuditLog(
            'Categories',
            'Delete Category Type',
            `Deleted category type "${target.name}"`
          );
        }
        toast.success(res?.message || 'Category type removed');
        refreshCategoryTypes();
        return { success: true };
      } else {
        toast.error(res?.message || res?.error || 'Failed to delete category type');
        return { success: false, message: res?.message || res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting category type');
      return { success: false, message: err.message };
    }
  };

  // ─── PAYMENT METHODS ────────────────────────────────
  const refreshPaymentMethods = async () => {
    try {
      const res = await MySQLDataService.fetchPaymentMethods();
      if (res?.success && Array.isArray(res.paymentMethods)) {
        setPaymentMethods(
          res.paymentMethods.map((pm: any) => ({
            id: pm.id,
            name: pm.name,
            code: pm.code,
            type: pm.type || 'Bank',
            description: pm.description || '',
            status: pm.status || 'Active',
            isSystem: Boolean(pm.isSystem),
            sortOrder: Number(pm.sortOrder) || 0,
            createdAt: pm.createdAt,
            updatedAt: pm.updatedAt,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to refresh payment methods:', err);
    }
  };

  const addPaymentMethod = async (methodData: {
    name: string;
    code?: string;
    type?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
    sortOrder?: number;
  }) => {
    try {
      const res = await MySQLDataService.createPaymentMethod(methodData);
      if (res?.success && res.paymentMethod) {
        const newM = res.paymentMethod;
        setPaymentMethods((prev) => [
          newM,
          ...prev.filter(
            (m) => m.id !== newM.id && m.name.toLowerCase() !== newM.name.toLowerCase()
          ),
        ]);
        addAuditLog('Accounting', 'Create Payment Method', `Created payment method "${newM.name}"`);
        toast.success(`Payment Method "${newM.name}" created!`);
        refreshPaymentMethods();
        return { success: true, paymentMethod: newM };
      } else {
        toast.error(res?.error || res?.message || 'Failed to create payment method');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating payment method');
      return { success: false, error: err.message };
    }
  };

  const updatePaymentMethod = async (id: string, updated: Partial<PaymentMethodItem>) => {
    try {
      const res = await MySQLDataService.updatePaymentMethod({ id, ...updated });
      if (res?.success && res.paymentMethod) {
        const u = res.paymentMethod;
        setPaymentMethods((prev) => prev.map((m) => (m.id === u.id ? { ...m, ...u } : m)));
        addAuditLog('Accounting', 'Update Payment Method', `Updated payment method "${u.name}"`);
        toast.success(`Payment Method "${u.name}" updated!`);
        refreshPaymentMethods();
        return { success: true, paymentMethod: u };
      } else {
        toast.error(res?.error || res?.message || 'Failed to update payment method');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating payment method');
      return { success: false, error: err.message };
    }
  };

  const deletePaymentMethod = async (id: string) => {
    try {
      const target = paymentMethods.find((m) => m.id === id);
      const res = await MySQLDataService.deletePaymentMethod(id);
      if (res?.success) {
        setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
        if (target) {
          addAuditLog(
            'Accounting',
            'Delete Payment Method',
            `Deleted payment method "${target.name}"`
          );
        }
        toast.success(res?.message || 'Payment method deleted');
        refreshPaymentMethods();
        return { success: true };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete payment method');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting payment method');
      return { success: false, message: err.message };
    }
  };

  // ─── BRANDS ─────────────────────────────────────────
  const refreshBrands = async () => {
    try {
      const res = await MySQLDataService.fetchBrands();
      if (res?.success && Array.isArray(res.brands)) {
        setBrands(
          res.brands.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            description: b.description || '',
            status: b.status || 'Active',
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to refresh brands:', err);
    }
  };

  const addBrand = async (brandData: {
    name: string;
    code?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
  }) => {
    try {
      const res = await MySQLDataService.createBrand(brandData);
      if (res?.success && res.brand) {
        const newB = res.brand;
        setBrands((prev) => [
          ...prev.filter(
            (b) => b.id !== newB.id && b.name.toLowerCase() !== newB.name.toLowerCase()
          ),
          newB,
        ]);
        addAuditLog('Catalog', 'Create Brand', `Created brand "${newB.name}"`);
        toast.success(`Brand "${newB.name}" created!`);
        refreshBrands();
        return { success: true, brand: newB };
      } else {
        toast.error(res?.error || res?.message || 'Failed to create brand');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating brand');
      return { success: false, error: err.message };
    }
  };

  const updateBrand = async (id: string, updated: Partial<BrandItem>) => {
    try {
      const res = await MySQLDataService.updateBrand({ id, ...updated });
      if (res?.success && res.brand) {
        const u = res.brand;
        setBrands((prev) => prev.map((b) => (b.id === u.id ? { ...b, ...u } : b)));
        addAuditLog('Catalog', 'Update Brand', `Updated brand "${u.name}"`);
        toast.success(`Brand "${u.name}" updated!`);
        refreshBrands();
        return { success: true, brand: u };
      } else {
        toast.error(res?.error || res?.message || 'Failed to update brand');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating brand');
      return { success: false, error: err.message };
    }
  };

  const deleteBrand = async (id: string) => {
    try {
      const target = brands.find((b) => b.id === id);
      const res = await MySQLDataService.deleteBrand(id);
      if (res?.success) {
        setBrands((prev) => prev.filter((b) => b.id !== id));
        if (target) {
          addAuditLog('Catalog', 'Delete Brand', `Deleted brand "${target.name}"`);
        }
        toast.success(res?.message || 'Brand deleted');
        refreshBrands();
        return { success: true };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete brand');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting brand');
      return { success: false, message: err.message };
    }
  };

  // ─── UNITS ──────────────────────────────────────────
  const refreshUnits = async () => {
    try {
      const res = await MySQLDataService.fetchUnits();
      if (res?.success && Array.isArray(res.units)) {
        setUnits(
          res.units.map((u: any) => ({
            id: u.id,
            name: u.name,
            code: u.code,
            symbol: u.symbol || u.code,
            description: u.description || '',
            status: u.status || 'Active',
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to refresh units:', err);
    }
  };

  const addUnit = async (unitData: {
    name: string;
    code?: string;
    symbol?: string;
    description?: string;
    status?: 'Active' | 'Inactive';
  }) => {
    try {
      const res = await MySQLDataService.createUnit(unitData);
      if (res?.success && res.unit) {
        const newU = res.unit;
        setUnits((prev) => [
          ...prev.filter(
            (u) => u.id !== newU.id && u.name.toLowerCase() !== newU.name.toLowerCase()
          ),
          newU,
        ]);
        addAuditLog('Catalog', 'Create Unit', `Created unit "${newU.name}" (${newU.symbol})`);
        toast.success(`Unit "${newU.name}" created!`);
        refreshUnits();
        return { success: true, unit: newU };
      } else {
        toast.error(res?.error || res?.message || 'Failed to create unit');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating unit');
      return { success: false, error: err.message };
    }
  };

  const updateUnit = async (id: string, updated: Partial<UnitItem>) => {
    try {
      const res = await MySQLDataService.updateUnit({ id, ...updated });
      if (res?.success && res.unit) {
        const u = res.unit;
        setUnits((prev) => prev.map((item) => (item.id === u.id ? { ...item, ...u } : item)));
        addAuditLog('Catalog', 'Update Unit', `Updated unit "${u.name}"`);
        toast.success(`Unit "${u.name}" updated!`);
        refreshUnits();
        return { success: true, unit: u };
      } else {
        toast.error(res?.error || res?.message || 'Failed to update unit');
        return { success: false, error: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating unit');
      return { success: false, error: err.message };
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      const target = units.find((u) => u.id === id);
      const res = await MySQLDataService.deleteUnit(id);
      if (res?.success) {
        setUnits((prev) => prev.filter((u) => u.id !== id));
        if (target) {
          addAuditLog('Catalog', 'Delete Unit', `Deleted unit "${target.name}"`);
        }
        toast.success(res?.message || 'Unit deleted');
        refreshUnits();
        return { success: true };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete unit');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting unit');
      return { success: false, message: err.message };
    }
  };

  const changeUserPassword = async (currentPass: string, newPass: string, confirmPass: string) => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPass,
          newPassword: newPass,
          confirmPassword: confirmPass,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addAuditLog(
          'Authentication',
          'Change Password',
          `Password successfully updated for ${currentUser.email}`
        );
        toast.success(data.message || 'Password changed successfully!');
        return { success: true, message: data.message };
      } else {
        toast.error(data.message || 'Failed to change password');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      toast.error('Network error during password update');
      return { success: false, message: err.message };
    }
  };

  const updateUserProfile = async (name: string, phone?: string, avatarUrl?: string) => {
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, avatarUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUserState((prev) => ({
          ...prev,
          name: data.user.name,
          avatarUrl: data.user.avatarUrl,
        }));
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === currentUser.id
              ? {
                  ...u,
                  name: data.user.name,
                  avatarUrl: data.user.avatarUrl,
                  phone: phone || u.phone,
                }
              : u
          )
        );
        addAuditLog(
          'Authentication',
          'Update Profile',
          `Profile details updated for ${currentUser.email}`
        );
        toast.success('Profile details updated!');
        return { success: true, message: 'Profile updated successfully' };
      } else {
        toast.error(data.message || 'Failed to update profile');
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      toast.error('Network error during profile update');
      return { success: false, message: err.message };
    }
  };

  const addItem = async (itemData: Omit<InventoryItem, 'id'>) => {
    // Check barcode duplicate
    if (itemData.barcode && itemData.barcode.trim()) {
      const cleanBarcode = itemData.barcode.trim();
      const duplicate = inventory.find((i) => i.barcode === cleanBarcode);
      if (duplicate) {
        toast.error(
          `Barcode "${cleanBarcode}" is already assigned to "${duplicate.name}" (${duplicate.sku})!`
        );
        return { success: false, error: 'Duplicate barcode' };
      }
    }

    try {
      const res = await MySQLDataService.createProduct(itemData);
      if (res?.success && res.product) {
        const p = res.product;
        const newItem: InventoryItem = {
          id: p.id,
          productId: p.id,
          sku: p.sku,
          barcode: p.barcode || '',
          name: p.name,
          brand: p.brand || '',
          model: p.model || '',
          category: p.category,
          subcategory: p.subcategory || '',
          description: p.description || '',
          store: itemData.store || 'CENTRAL',
          qtyOnHand: itemData.qtyOnHand || 0,
          reorderPt: itemData.reorderPt || 5,
          costPrice: Number(p.baseCostPrice),
          transferPrice: Math.round(Number(p.baseCostPrice) * 1.18),
          sellingPrice: Number(p.baseSellingPrice),
          mrp: p.mrp !== null && p.mrp !== undefined ? Number(p.mrp) : Number(itemData.mrp) || 0,
          taxRate: Number(p.gstRate) || 18,
          warrantyMonths: p.warrantyMonths || 12,
          minStock: itemData.minStock || 10,
          status: p.status as any,
          fifoLots: 1,
          lastMovement: 'Created',
          imageUrl: p.imageUrl || itemData.imageUrl,
          primaryImage: p.imageUrl || itemData.primaryImage || itemData.imageUrl,
          images: itemData.images || (p.imageUrl ? [p.imageUrl] : []),
          createdAt: p.createdAt,
        };
        setInventory((prev) => [
          newItem,
          ...prev.filter((i) => i.id !== newItem.id && i.sku !== newItem.sku),
        ]);
        addAuditLog(
          'Inventory',
          'Add Product',
          `Created new item "${newItem.name}" (${newItem.sku})`
        );
        toast.success(`Successfully saved "${newItem.name}" to MySQL inventory`);
        await refreshAllData();
        return { success: true, item: newItem };
      } else {
        toast.error(res?.error || 'Failed to save product to database');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving product');
      return { success: false, error: err.message };
    }
  };

  const updateItem = async (id: string, updated: Partial<InventoryItem>) => {
    // Check barcode duplicate
    if (updated.barcode && updated.barcode.trim()) {
      const cleanBarcode = updated.barcode.trim();
      const duplicate = inventory.find(
        (i) => i.id !== id && i.productId !== id && i.barcode === cleanBarcode
      );
      if (duplicate) {
        toast.error(
          `Barcode "${cleanBarcode}" is already assigned to "${duplicate.name}" (${duplicate.sku})!`
        );
        return { success: false, error: 'Duplicate barcode' };
      }
    }

    const currentItem = inventory.find((i) => i.id === id || i.productId === id || i.sku === id);
    const targetProductId = currentItem?.productId || id;

    try {
      const res = await MySQLDataService.updateProduct({
        id,
        productId: targetProductId,
        sku: currentItem?.sku,
        ...updated,
      });
      if (res?.success) {
        setInventory((prev) =>
          prev.map((item) => {
            if (item.id === id || item.productId === targetProductId) {
              return { ...item, ...updated };
            }
            return item;
          })
        );
        addAuditLog(
          'Inventory',
          'Edit Product',
          `Updated details for item "${currentItem?.name || id}"`
        );
        toast.success('Inventory item updated in MySQL');
        await refreshAllData();
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update item in database');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating item');
      return { success: false, error: err.message };
    }
  };

  const deleteItem = async (id: string, permanent = false) => {
    const itemToDelete = inventory.find(
      (i) => i.id === id || i.sku === id || (i as any).productId === id
    );
    const targetProductId =
      (itemToDelete as any)?.productId ||
      (id.includes('-') && id.split('-').length > 5 ? id.split('-').slice(0, 5).join('-') : id);
    try {
      const res = await MySQLDataService.deleteProduct(targetProductId, permanent);
      if (res?.success) {
        setInventory((prev) =>
          prev.filter(
            (i) =>
              i.id !== id &&
              i.sku !== (itemToDelete?.sku || id) &&
              (i as any).productId !== targetProductId
          )
        );
        if (itemToDelete) {
          addAuditLog(
            'Inventory',
            res?.mode === 'archived' ? 'Archive Product' : 'Delete Product',
            res?.message || `Removed item "${itemToDelete.name}" (${itemToDelete.sku})`
          );
        }
        toast.success(res?.message || `Removed "${itemToDelete?.name || id}" from inventory`);
        refreshAllData();
        return { success: true, mode: res?.mode || 'deleted', message: res?.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to remove inventory item');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error removing item');
      return { success: false, message: err.message };
    }
  };

  const adjustStock = async (id: string, qtyChange: number, reason: string) => {
    const itemToAdjust = inventory.find((i) => i.id === id);
    if (!itemToAdjust) return;

    try {
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: itemToAdjust.productId || id,
          storeCode: itemToAdjust.store,
          qtyChange,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to adjust stock');
        return;
      }

      toast.success(`Stock adjusted successfully (new qty: ${data.newQty})`);
      await refreshAllData();
    } catch (err: any) {
      toast.error(err.message || 'Error adjusting stock');
    }
  };

  const [defaultStoreTransferPrices, setDefaultStoreTransferPrices] = useState<
    ProductStoreTransferPrice[]
  >([]);

  const setDefaultStoreTransferPrice = (productId: string, storeCode: string, price: number) => {
    setDefaultStoreTransferPrices((prev) => {
      const idx = prev.findIndex((p) => p.productId === productId && p.storeCode === storeCode);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], defaultTransferPrice: price };
        return updated;
      }
      return [
        ...prev,
        { id: `stp-${Date.now()}`, productId, storeCode, defaultTransferPrice: price },
      ];
    });
    addAuditLog(
      'Inventory',
      'Set Default Store Transfer Price',
      `Updated transfer price for product #${productId} at store ${storeCode} to ${formatCurrency(price)}`
    );
    toast.success(`Default transfer price set to ${formatCurrency(price)} for ${storeCode}`);
  };

  const transferStock = async (
    fromStore: string,
    toStore: string,
    itemId: string,
    qty: number,
    customTransferPrice?: number,
    status: 'Completed' | 'Draft' = 'Completed',
    notes?: string
  ) => {
    try {
      const headerValidation = validateTransferHeader({
        sourceStore: fromStore,
        destStore: toStore,
        itemsCount: 1,
      });
      if (!headerValidation.isValid) {
        toast.error(headerValidation.error);
        return { success: false, error: headerValidation.error };
      }

      // Find the item matching the product AND the source store
      const sourceItem =
        inventory.find(
          (i) =>
            (i.id === itemId || i.sku === itemId || i.productId === itemId) && i.store === fromStore
        ) || inventory.find((i) => i.id === itemId || i.sku === itemId || i.productId === itemId);

      if (!sourceItem) {
        toast.error(`Source product not found in ${fromStore}!`);
        return { success: false, error: 'Source item not found' };
      }

      const unitCost = round2(Number(sourceItem.costPrice) || 0);
      const effectiveTransferPrice =
        customTransferPrice !== undefined &&
        customTransferPrice !== null &&
        !isNaN(Number(customTransferPrice))
          ? round2(Number(customTransferPrice))
          : sourceItem.transferPrice && sourceItem.transferPrice > 0
            ? round2(sourceItem.transferPrice)
            : unitCost;

      const itemValidation = validateTransferItem({
        qty,
        costPerUnit: unitCost,
        transferPricePerUnit: effectiveTransferPrice,
        availableStock: sourceItem.qtyOnHand,
      });
      if (!itemValidation.isValid) {
        toast.error(itemValidation.error);
        return { success: false, error: itemValidation.error };
      }

      const realProductId =
        sourceItem.productId ||
        (sourceItem.id.includes('-') ? sourceItem.id.split('-')[0] : sourceItem.id);

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceStore: fromStore,
          destStore: toStore,
          notes: notes || `Transfer from ${fromStore} to ${toStore}`,
          items: [
            {
              productId: realProductId,
              qty: Math.floor(qty),
              costPerUnit: unitCost,
              transferPricePerUnit: effectiveTransferPrice,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Transfer failed');
      }

      toast.success(
        `Transferred ${qty} units from ${fromStore} to ${toStore} (${data.transfer.transferNo})`
      );
      await refreshAllData();
      return { success: true, transfer: data.transfer };
    } catch (err: any) {
      console.error('[COSKO] transferStock error:', err);
      toast.error(err.message || 'Failed to complete stock transfer');
      return { success: false, error: err.message };
    }
  };

  const updateTransferStatus = async (id: string, nextStatus: 'Completed' | 'Cancelled') => {
    const target = stockTransfers.find((t) => t.id === id);
    if (!target) return;

    if (
      target.status === 'Completed' &&
      nextStatus === 'Cancelled' &&
      currentUser?.role !== 'Super Admin'
    ) {
      toast.warning(
        'Only Super Admin can cancel completed transfers with automatic inventory reversal.'
      );
      return;
    }

    try {
      const res = await fetch('/api/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id,
          status: nextStatus === 'Completed' ? 'Received' : 'Cancelled',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update transfer status');
      }

      toast.success(
        `Transfer ${target.transferNo} ${nextStatus === 'Cancelled' ? 'cancelled with inventory reversal' : 'completed'}!`
      );
      await refreshAllData();
      return { success: true };
    } catch (err: any) {
      console.error('[COSKO] updateTransferStatus error:', err);
      toast.error(err.message || 'Failed to update transfer status');
      return { success: false, error: err.message };
    }
  };

  const deleteTransfer = async (id: string) => {
    try {
      const res = await fetch(`/api/transfers?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel/reverse transfer');
      }
      toast.success(data.message || 'Stock transfer reversed successfully');
      await refreshAllData();
      return { success: true, message: data.message };
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel transfer');
      return { success: false, message: err.message };
    }
  };

  const addSale = async (
    saleData: Omit<SalesOrder, 'id' | 'orderNo' | 'createdAt' | 'period'>
  ): Promise<SalesOrder | null> => {
    const storeCode = saleData.store || selectedStore || 'BLR';

    try {
      // Build sale items with real cost from product master — never fabricate unitCost
      const apiItems = saleData.items.map((it) => {
        const invItem = inventory.find(
          (i) => i.id === it.itemId || i.productId === it.itemId || i.sku === it.name
        );
        const realCost = invItem?.costPrice || 0;
        return {
          productId: invItem?.productId || it.itemId,
          productName: it.name,
          sku: invItem?.sku || it.sku || it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          unitCost: realCost,
          discountPercent: 0,
        };
      });

      // Call API FIRST — only show success after DB commit
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storeCode,
          customerId: saleData.customerId || null,
          customerName: saleData.customerName,
          customerPhone: saleData.customerPhone,
          items: apiItems,
          taxAmount: saleData.taxTotal || 0,
          discountAmount: saleData.discount || 0,
          paymentMethod: saleData.paymentMethod,
          referenceNo: saleData.referenceNo || undefined,
          paymentProofUrl: saleData.paymentProofUrl || undefined,
          cashierName: currentUser.name,
          photos:
            saleData.salePhotos?.map((p) => p.url) ||
            (saleData.paymentProofUrl ? [saleData.paymentProofUrl] : undefined),
          idempotencyKey: saleData.idempotencyKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to process checkout transaction');
        return null;
      }

      const dbSale = data.sale;

      // Build client-side sale object from DB response
      const saleItemsWithWarranty = saleData.items.map((item) => {
        const invItem = inventory.find((i) => i.id === item.itemId || i.sku === item.name);
        const months = invItem?.warrantyMonths || 0;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + (months || 12));
        const formattedExpiry = expiryDate.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        return {
          ...item,
          warrantyMonths: months,
          warrantyExpiryDate: formattedExpiry,
        };
      });

      const newSale: SalesOrder = {
        ...saleData,
        id: dbSale.id,
        orderNo: dbSale.orderNo,
        store: dbSale.storeCode || saleData.store || storeCode,
        items: saleItemsWithWarranty,
        referenceNo: dbSale.referenceNo || saleData.referenceNo,
        paymentProofUrl: dbSale.paymentProofUrl || saleData.paymentProofUrl,
        taxEnabled: saleData.taxEnabled !== undefined ? saleData.taxEnabled : true,
        createdAt: dbSale.createdAt || new Date().toISOString(),
        grossProfit:
          Number(dbSale.grossProfit) || Number(dbSale.grandTotal) - Number(dbSale.totalCost),
        totalCost: Number(dbSale.totalCost) || 0,
        period: 'Today',
      };

      // Update client state AFTER DB success
      setSales((prev) => [newSale, ...prev]);

      const photoMsg =
        saleData.salePhotos && saleData.salePhotos.length > 0
          ? ` with ${saleData.salePhotos.length} photo(s)`
          : '';
      addAuditLog(
        'Sales',
        'POS Sale Checkout',
        `Completed order ${newSale.orderNo} for ${formatCurrency(newSale.total)}${photoMsg}`
      );
      toast.success(`Invoice ${newSale.orderNo} generated successfully!`);

      // Refresh targeted sales domain to sync inventory, customer totals, etc. without hammering all 15 endpoints
      await refreshDomainData('sales');
      return newSale;
    } catch (err: any) {
      console.error('[App] addSale error:', err);
      toast.error(err.message || 'Failed to process sale. No changes were made.');
      return null;
    }
  };

  const updateSale = async (id: string, updated: Partial<SalesOrder>) => {
    try {
      const res = await MySQLDataService.updateSale({ id, ...updated });
      if (res?.success) {
        toast.success(res.message || 'Sale order updated');
        await refreshDomainData('sales');
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update sale order');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating sale order');
      return { success: false, error: err.message };
    }
  };

  const voidSale = async (id: string) => {
    try {
      const res = await MySQLDataService.deleteSale(id);
      if (res?.success) {
        toast.success(res.message || 'Sale order voided and stock restored');
        await refreshDomainData('sales');
        return { success: true, message: res.message };
      } else {
        toast.error(res?.error || 'Failed to void sale order');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error voiding sale order');
      return { success: false, error: err.message };
    }
  };

  const addPurchase = async (poData: Omit<PurchaseOrder, 'id' | 'poNo' | 'createdAt'>) => {
    try {
      const res = await MySQLDataService.createPurchase(poData);
      if (res?.success && res.purchaseOrder) {
        const p = res.purchaseOrder;
        const newPO: PurchaseOrder = {
          id: p.id,
          poNo: p.poNo,
          invoiceNo: p.invoiceNo || p.poNo,
          vendorName: poData.vendorName,
          vendorId: p.vendorId,
          store: p.storeCode || 'CENTRAL',
          items:
            p.items?.map((it: any) => ({
              id: it.id,
              itemId: it.productId,
              productId: it.productId,
              name: it.product?.name || it.name || 'Item',
              sku: it.product?.sku || it.sku || '',
              qty: it.qtyOrdered || it.qty || 1,
              unitCost: Number(it.unitCost) || 0,
              taxRate: Number(it.taxRate) || 0,
              taxAmount: Number(it.taxAmount) || 0,
              discount: Number(it.discount) || 0,
              lineTotal: Number(it.lineTotal) || 0,
            })) ||
            poData.items ||
            [],
          subtotal:
            p.subtotal !== null && p.subtotal !== undefined
              ? Number(p.subtotal)
              : Number(p.totalCost),
          taxAmount: p.taxAmount !== null && p.taxAmount !== undefined ? Number(p.taxAmount) : 0,
          discountAmount:
            p.discountAmount !== null && p.discountAmount !== undefined
              ? Number(p.discountAmount)
              : 0,
          totalAmount: Number(p.totalCost),
          totalCost: Number(p.totalCost),
          paidAmount: Number(p.paidAmount) || 0,
          creditAmount: Number(p.creditAmount) || 0,
          remainingAmount: Math.max(
            0,
            Number(p.totalCost) - (Number(p.paidAmount) || 0) - (Number(p.creditAmount) || 0)
          ),
          status: p.status,
          paymentStatus: p.paymentStatus,
          createdAt: new Date(p.createdAt).toLocaleDateString('en-IN'),
          expectedDate: poData.expectedDate || 'ASAP',
          dueDate: p.dueDate || poData.dueDate || undefined,
          receivedDate: p.receivedDate || undefined,
          notes: p.notes || poData.notes || undefined,
        };
        setPurchases((prev) => [newPO, ...prev.filter((po) => po.id !== newPO.id)]);
        addAuditLog(
          'Purchases',
          'Create Purchase Order',
          `Generated ${newPO.poNo} for ${newPO.vendorName} (${newPO.items.length} items, ${formatCurrency(newPO.totalAmount)})`
        );
        toast.success(`Purchase Order ${newPO.poNo} saved with ${newPO.items.length} items!`);
        refreshDomainData('purchases');
        return newPO;
      } else {
        const errorMsg = res?.error || 'Failed to create purchase order';
        toast.error(errorMsg);
        return { success: false, error: errorMsg } as any;
      }
    } catch (err: any) {
      toast.error(err.message || 'Error creating purchase order');
      return { success: false, error: err.message || 'Error creating purchase order' } as any;
    }
  };

  const updatePurchase = async (id: string, updated: Partial<PurchaseOrder>) => {
    try {
      const res = await fetch('/api/purchases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, ...updated }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'Failed to update purchase order in database';
        toast.error(errorMsg);
        return { success: false, error: errorMsg };
      }

      if (data.purchaseOrder) {
        const p = data.purchaseOrder;
        setPurchases((prev) =>
          prev.map((po) =>
            po.id === id
              ? {
                  ...po,
                  ...updated,
                  status: p.status,
                  paymentStatus: p.paymentStatus,
                  paidAmount: Number(p.paidAmount) || 0,
                  totalAmount: Number(p.totalCost) || po.totalAmount,
                  totalCost: Number(p.totalCost) || po.totalAmount,
                  remainingAmount: Math.max(
                    0,
                    (Number(p.totalCost) || po.totalAmount) -
                      (Number(p.paidAmount) || 0) -
                      (Number(p.creditAmount) || 0)
                  ),
                  items:
                    p.items?.map((it: any) => ({
                      id: it.id,
                      itemId: it.productId,
                      productId: it.productId,
                      name: it.product?.name || it.name || 'Item',
                      sku: it.product?.sku || it.sku || '',
                      qty: it.qtyOrdered || it.qty || 1,
                      unitCost: Number(it.unitCost) || 0,
                      taxRate: Number(it.taxRate) || 0,
                      taxAmount: Number(it.taxAmount) || 0,
                      discount: Number(it.discount) || 0,
                      lineTotal: Number(it.lineTotal) || 0,
                    })) || po.items,
                }
              : po
          )
        );
      } else {
        setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      }

      addAuditLog('Purchases', 'Edit Purchase Order', `Updated PO #${id}`);
      toast.success('Purchase Order updated in MySQL');
      await refreshDomainData('purchases');
      return { success: true };
    } catch (err: any) {
      toast.error(err.message || 'Error updating purchase order');
      return { success: false, error: err.message || 'Error updating purchase order' };
    }
  };

  const deletePurchase = async (id: string) => {
    const poToDelete = purchases.find((p) => p.id === id);
    try {
      const res = await MySQLDataService.deletePurchase(id);
      if (res?.success) {
        setPurchases((prev) => prev.filter((p) => p.id !== id));
        if (poToDelete) {
          addAuditLog(
            'Purchases',
            res.mode === 'archived' ? 'Cancel Purchase Order' : 'Delete Purchase Order',
            res.message || `Removed PO ${poToDelete.poNo}`
          );
        }
        toast.success(res.message || `Removed Purchase Order ${poToDelete?.poNo || id}`);
        refreshDomainData('purchases');
        return { success: true, mode: res.mode, message: res.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete purchase order');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error('Network error while deleting purchase order');
      return { success: false, message: err.message };
    }
  };

  const recordPurchasePayment = async (paymentData: {
    purchaseId: string;
    amount: number;
    paymentMethod?: string;
    paymentDate?: string;
    referenceNo?: string;
    notes?: string;
    receiptUrl?: string;
  }) => {
    try {
      const res = await fetch('/api/purchases/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(paymentData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Failed to record payment in database');
        return { success: false, error: data.error };
      }

      if (data.payment) {
        setPurchases((prev) =>
          prev.map((po) => {
            if (po.id !== paymentData.purchaseId) return po;
            const updatedPayments = [data.payment, ...(po.payments || [])];
            const sumPaid = updatedPayments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
            const total = Number(po.totalCost || po.totalAmount);
            const credit = Number(po.creditAmount) || 0;
            const rem = Math.max(0, Math.round((total - sumPaid - credit) * 100) / 100);
            const status =
              rem <= 0.01 && total > 0 ? 'Paid' : sumPaid > 0.005 ? 'Partial' : 'Unpaid';
            return {
              ...po,
              paidAmount: sumPaid,
              remainingAmount: rem,
              paymentStatus: status,
              payments: updatedPayments,
            };
          })
        );
      }

      toast.success(
        `Payment of ${formatCurrency(paymentData.amount)} recorded successfully!`
      );
      await refreshDomainData('purchases');
      return {
        success: true,
        payment: data.payment,
        receiptVoucher: data.receiptVoucher,
        purchaseOrder: data.purchaseOrder,
        remaining: data.remaining,
      };
    } catch (err: any) {
      toast.error(err.message || 'Error recording purchase payment');
      return { success: false, error: err.message };
    }
  };

  const addCustomer = async (custData: Omit<Customer, 'id' | 'totalSpend' | 'lastPurchase'>) => {
    try {
      const res = await MySQLDataService.createCustomer(custData);
      if (res?.success && res.customer) {
        const c = res.customer;
        const newCust: Customer = {
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email || '',
          city: c.city || custData.city || '',
          address: c.address || custData.address || '',
          status: c.status || custData.status || 'Active',
          tier: 'Regular',
          totalSpend: Number(c.totalSpent) || 0,
          creditBalance: Number(c.creditBalance) || 0,
          lastPurchase: 'Never',
          createdAt: c.createdAt,
          storeCode: c.storeCode || custData.storeCode,
          storeProfiles: c.storeProfiles || [],
          serviceStores:
            c.serviceStores || (c.storeProfiles || []).map((p: any) => p.storeCode),
        };
        setCustomers((prev) => [newCust, ...prev.filter((cust) => cust.id !== newCust.id)]);
        addAuditLog('Customers', 'Add Customer', `Registered customer "${newCust.name}"`);
        toast.success(`Customer "${newCust.name}" saved to MySQL!`);
        refreshDomainData('customers');
        return newCust;
      } else {
        toast.error(res?.error || 'Failed to save customer');
        return null;
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving customer');
      return null;
    }
  };

  const updateCustomer = async (id: string, updated: Partial<Customer>) => {
    const cust = customers.find((c) => c.id === id);
    if (!cust) return;
    const merged = { ...cust, ...updated };
    try {
      const res = await MySQLDataService.updateCustomer({ id, ...updated });
      if (res?.success) {
        setCustomers((prev) => prev.map((c) => (c.id === id ? merged : c)));
        addAuditLog('Customers', 'Edit Customer', `Updated profile for customer #${id}`);
        toast.success('Customer record updated in MySQL');
        await refreshDomainData('customers');
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update customer');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating customer');
      return { success: false, error: err.message };
    }
  };

  const deleteCustomer = async (id: string, permanent = false) => {
    const cust = customers.find((c) => c.id === id);
    try {
      const res = await MySQLDataService.deleteCustomer(id, permanent);
      if (res?.success) {
        setCustomers((prev) => prev.filter((c) => c.id !== id));
        if (cust) {
          addAuditLog(
            'Customers',
            res?.mode === 'archived' ? 'Archive Customer' : 'Delete Customer',
            res?.message || `Removed customer "${cust.name}"`
          );
        }
        toast.success(res?.message || `Customer "${cust?.name || id}" removed`);
        refreshDomainData('customers');
        return { success: true, mode: res?.mode || 'deleted', message: res?.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to remove customer');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error removing customer');
      return { success: false, message: err.message };
    }
  };

  const addVendor = async (vendorData: Omit<Vendor, 'id' | 'code'>) => {
    try {
      const res = await MySQLDataService.createVendor(vendorData);
      if (res?.success && res.vendor) {
        const v = res.vendor;
        const newVendor: Vendor = {
          id: v.id,
          code: v.code,
          name: v.name,
          contactPerson: v.contactPerson || '',
          email: v.email || '',
          phone: v.phone || '',
          city: v.city || '',
          address: v.address || '',
          category: v.categories || 'General',
          gstin: v.gstin || '',
          outstandingPayable: 0,
          rating: Number(v.rating) || Number(vendorData.rating) || 5.0,
          leadTimeDays: Number(v.leadTimeDays) || Number(vendorData.leadTimeDays) || 3,
          createdAt: v.createdAt,
        };
        setVendors((prev) => [newVendor, ...prev.filter((vnd) => vnd.id !== newVendor.id)]);
        addAuditLog('Vendors', 'Add Vendor', `Onboarded supplier "${newVendor.name}"`);
        toast.success(`Vendor "${newVendor.name}" saved to MySQL!`);
        await refreshDomainData('vendors');
        return newVendor;
      } else {
        toast.error(res?.error || 'Failed to save vendor');
        return null;
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving vendor');
      return null;
    }
  };

  const updateVendor = async (id: string, updated: Partial<Vendor>) => {
    const vend = vendors.find((v) => v.id === id);
    if (!vend) return;
    const merged = { ...vend, ...updated };
    try {
      const res = await MySQLDataService.updateVendor({ id, ...updated });
      if (res?.success) {
        setVendors((prev) => prev.map((v) => (v.id === id ? merged : v)));
        addAuditLog('Vendors', 'Edit Vendor', `Updated supplier #${id}`);
        toast.success('Vendor profile updated in MySQL');
        await refreshDomainData('vendors');
        return { success: true };
      } else {
        toast.error(res?.error || 'Failed to update vendor');
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating vendor');
      return { success: false, error: err.message };
    }
  };

  const deleteVendor = async (id: string, permanent = false, reason = '') => {
    const v = vendors.find((vend) => vend.id === id || vend.code === id);
    try {
      const res = await MySQLDataService.deleteVendor(id, permanent, reason);
      if (res?.success) {
        if (res?.mode !== 'pending_approval') {
          setVendors((prev) => prev.filter((vend) => vend.id !== id && vend.code !== id));
        }
        if (v) {
          addAuditLog(
            'Vendors',
            res?.mode === 'archived'
              ? 'Archive Vendor'
              : res?.mode === 'pending_approval'
                ? 'Request Vendor Deletion'
                : 'Delete Vendor',
            res?.message || `Removed supplier "${v.name}"`
          );
        }
        toast.success(res?.message || `Vendor "${v?.name || id}" removed`);
        refreshDomainData('vendors');
        return { success: true, mode: res?.mode || 'deleted', message: res?.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to remove vendor');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error removing vendor');
      return { success: false, message: err.message };
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'referenceNo' | 'date'>) => {
    try {
      const res = await MySQLDataService.createExpense(expenseData);
      if (res?.success && res.expense) {
        const e = res.expense;
        const newExp: Expense = {
          id: e.id,
          referenceNo: e.expenseNo,
          category: e.category,
          amount: Number(e.amount),
          store: e.storeCode,
          description: e.description,
          paymentMethod: e.paymentMethod,
          referenceNoText: e.referenceNo || e.expenseNo,
          receiptUrl: e.receiptUrl,
          recordedBy: e.recordedBy || e.approvedBy,
          status: 'Approved',
          date: new Date(e.date).toLocaleDateString('en-IN'),
          createdAt: e.createdAt,
        };
        setExpenses((prev) => [newExp, ...prev.filter((exp) => exp.id !== newExp.id)]);
        addAuditLog(
          'Expenses',
          'Create Expense Record',
          `Logged expense "${newExp.description}" for ${formatCurrency(newExp.amount)} (${newExp.store})`
        );
        toast.success(`Expense record ${newExp.referenceNo} saved to MySQL!`);
        refreshDomainData('expenses');
        return newExp;
      } else {
        toast.error(res?.error || 'Failed to record expense');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error recording expense');
    }
  };

  const deleteExpense = async (id: string) => {
    const exp = expenses.find((e) => e.id === id || e.referenceNo === id);
    try {
      const res = await MySQLDataService.deleteExpense(id);
      if (res?.success) {
        setExpenses((prev) => prev.filter((e) => e.id !== id && e.referenceNo !== id));
        if (exp) {
          addAuditLog(
            'Expenses',
            'Delete Expense Record',
            `Deleted expense "${exp.description}" (${exp.referenceNo})`
          );
        }
        toast.success(res?.message || `Expense record ${exp?.referenceNo || id} deleted`);
        refreshDomainData('expenses');
        return { success: true, mode: 'deleted', message: res?.message };
      } else {
        toast.error(res?.error || res?.message || 'Failed to delete expense record');
        return { success: false, message: res?.error || res?.message };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting expense');
      return { success: false, message: err.message };
    }
  };

  const updateExpense = async (id: string, updated: Partial<Expense>) => {
    try {
      const res = await MySQLDataService.updateExpense(id, updated);
      if (res?.success && res.expense) {
        const e = res.expense;
        const updatedExp: Expense = {
          id: e.id,
          referenceNo: e.expenseNo,
          category: e.category,
          amount: Number(e.amount),
          store: e.storeCode,
          description: e.description,
          paymentMethod: e.paymentMethod,
          referenceNoText: e.referenceNo || e.expenseNo,
          receiptUrl: e.receiptUrl,
          recordedBy: e.recordedBy || e.approvedBy,
          status: 'Approved',
          date: new Date(e.date).toLocaleDateString(branding?.locale || 'en-IN'),
          createdAt: e.createdAt,
        };
        setExpenses((prev) =>
          prev.map((item) => (item.id === id || item.referenceNo === id ? updatedExp : item))
        );
        addAuditLog(
          'Expenses',
          'Update Expense Record',
          `Updated expense "${updatedExp.description}" for ${formatCurrency(updatedExp.amount)} (${updatedExp.store})`
        );
        toast.success(`Expense record ${updatedExp.referenceNo} updated successfully`);
        refreshDomainData('expenses');
        return { success: true, expense: updatedExp };
      } else {
        toast.error(res?.error || 'Failed to update expense record');
        return { success: false, message: res?.error };
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating expense');
      return { success: false, message: err.message };
    }
  };

  const addRepairEnquiry = async (_repairData: any) => {
    return { success: false, message: 'Repairs module has been decommissioned' };
  };

  const updateRepairEnquiry = async (_id: string, _updated: any) => {
    return { success: false, message: 'Repairs module has been decommissioned' };
  };

  const deleteRepairEnquiry = async (_id: string) => {
    return { success: false, message: 'Repairs module has been decommissioned' };
  };

  const addAuditLog = (module: string, action: string, details: string) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      userName: currentUser.name || 'System',
      userRole: currentUser.role || 'Super Admin',
      module,
      action,
      details,
      ipAddress: '127.0.0.1',
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    MySQLDataService.syncAuditLog(newLog);
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const contextValue = useMemo(
    () => ({
      branding,
      updateBranding,
      resetBranding,
      systemSettings,
      updateSystemSettings,
      reloadSettings,
      selectedStore,
      setSelectedStore,
      datePeriod,
      setDatePeriod,
      customDateRange,
      setCustomDateRange,
      authStatus,
      currentUser,
      setCurrentUser,
      logoutUser,
      toggleCurrentUserShift,
      updateProfileAvatar,
      storesList,
      addStoreHub,
      updateStoreHub,
      deleteStoreHub,
      usersList,
      addUserAccount,
      updateUserAccount,
      toggleUserShiftStatus,
      toggleUserStatus,
      setUserPermissionOverride,
      toggleUserStoreAccess,
      deleteUserAccount,
      categoriesList,
      categoryTypes,
      addCategoryType,
      updateCategoryType,
      deleteCategoryType,
      refreshCategoryTypes,
      addCategory,
      updateCategory,
      toggleCategoryStatus,
      deleteCategory,
      changeUserPassword,
      updateUserProfile,
      inventory,
      addItem,
      updateItem,
      deleteItem,
      adjustStock,
      transferStock,
      updateTransferStatus,
      deleteTransfer,
      defaultStoreTransferPrices,
      setDefaultStoreTransferPrice,
      stockTransfers,
      inventoryLedger,
      repairsEnquiries,
      addRepairEnquiry,
      updateRepairEnquiry,
      deleteRepairEnquiry,
      sales,
      addSale,
      updateSale,
      voidSale,
      purchases,
      addPurchase,
      updatePurchase,
      deletePurchase,
      recordPurchasePayment,
      customers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      vendors,
      addVendor,
      updateVendor,
      deleteVendor,
      expenses,
      addExpense,
      updateExpense,
      deleteExpense,
      paymentMethods,
      addPaymentMethod,
      updatePaymentMethod,
      deletePaymentMethod,
      refreshPaymentMethods,
      brands,
      addBrand,
      updateBrand,
      deleteBrand,
      refreshBrands,
      units,
      addUnit,
      updateUnit,
      deleteUnit,
      refreshUnits,
      auditLogs,
      addAuditLog,
      refreshAllData,
      refreshDomainData,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      searchOpen,
      setSearchOpen,
      notificationsOpen,
      setNotificationsOpen,
      storeSelectorOpen,
      setStoreSelectorOpen,
      userProfileOpen,
      setUserProfileOpen,
      confirmAction,
      confirmationModalState,
      closeConfirmationModal,
      executeConfirmationAction,
      formatCurrency,
      dateLocale,
    }),
    [
      branding,
      systemSettings,
      dateLocale,
      selectedStore,
      datePeriod,
      customDateRange,
      authStatus,
      currentUser,
      storesList,
      usersList,
      categoriesList,
      categoryTypes,
      inventory,
      defaultStoreTransferPrices,
      stockTransfers,
      inventoryLedger,
      repairsEnquiries,
      sales,
      purchases,
      customers,
      vendors,
      expenses,
      paymentMethods,
      brands,
      units,
      auditLogs,
      refreshAllData,
      refreshDomainData,
      notifications,
      searchOpen,
      notificationsOpen,
      storeSelectorOpen,
      userProfileOpen,
      confirmAction,
      confirmationModalState,
      closeConfirmationModal,
      executeConfirmationAction,
      formatCurrency,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
