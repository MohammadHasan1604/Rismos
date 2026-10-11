/**
 * RISMOS Database V2 - Domain-Oriented State Architecture Types
 * Defines clean domain contracts for:
 * - Auth & Security
 * - Branding & Settings
 * - Stores & Catalog
 * - Inventory & Stock Transfers
 * - Sales & POS
 * - Purchases & Vendors
 * - Finance & Accounting
 * - Realtime & Notifications
 */

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
  taxNumber?: string | null;
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
  store: string;
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
  type: string;
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

export interface StoreHubItem {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  timezone: string;
  ownerName?: string;
  managerName?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
}

export interface UserAccountItem {
  id: string;
  email: string;
  name: string;
  role: 'Super Admin' | 'Store Manager' | 'Sales Manager';
  storeScope: string;
  assignedStores?: string[];
  status: 'Active' | 'Inactive';
  securityLevel: number;
  phone?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string | null;
  lastLogin?: string;
}

export interface SalesOrderItem {
  id: string;
  sku: string;
  productName: string;
  qty: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
  taxRate?: number;
  taxAmount?: number;
  discountPercent?: number;
}

export interface SalesOrderRecord {
  id: string;
  orderNo: string;
  storeCode: string;
  customerPhone: string;
  customerName: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  grandTotal: number;
  totalCost: number;
  grossProfit: number;
  paymentMethod: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | 'Refunded';
  cashierName: string;
  items: SalesOrderItem[];
  createdAt: string;
}
