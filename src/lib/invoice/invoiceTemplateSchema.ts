/**
 * Structured Invoice Template & Field Mapping Engine Schema
 *
 * Normalizes field positions as percentage coordinates (0-100%) so invoices
 * render deterministically across A4, Letter, and thermal print formats.
 */

export interface InvoiceFieldPlacement {
  id: string;
  key: string;
  label: string;
  visible: boolean;
  xPercent: number; // 0 - 100% horizontal coordinate
  yPercent: number; // 0 - 100% vertical coordinate
  widthPercent?: number; // 0 - 100% width percentage
  fontSize: number; // 8 - 32 px
  fontWeight: 'normal' | 'medium' | 'bold' | 'extrabold';
  textAlign: 'left' | 'center' | 'right';
  color?: string;
}

export interface InvoiceTemplateConfig {
  version: number;
  templateName: string;
  templateMode?: 'standard' | 'custom_mapped';
  pageSize: 'A4' | 'Letter' | 'Thermal80mm';
  orientation: 'portrait' | 'landscape';
  backgroundUrl?: string | null;
  backgroundOpacity: number; // 0 - 100%
  watermarkOpacity: number; // 0 - 100%
  showGridOverlay?: boolean;
  fields: InvoiceFieldPlacement[];
  tableConfig: {
    visible: boolean;
    startYPercent: number;
    showSku: boolean;
    showHsn: boolean;
    showWarranty: boolean;
    showTaxBreakdown: boolean;
  };
}

export const DEFAULT_INVOICE_FIELDS: InvoiceFieldPlacement[] = [
  {
    id: 'f-logo',
    key: 'logo',
    label: 'Brand Logo',
    visible: true,
    xPercent: 5,
    yPercent: 4,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  {
    id: 'f-biz-name',
    key: 'businessName',
    label: 'Business Name',
    visible: true,
    xPercent: 5,
    yPercent: 10,
    fontSize: 16,
    fontWeight: 'extrabold',
    textAlign: 'left',
  },
  {
    id: 'f-biz-addr',
    key: 'registeredAddress',
    label: 'Registered Address & Contact',
    visible: true,
    xPercent: 5,
    yPercent: 14,
    fontSize: 10,
    fontWeight: 'normal',
    textAlign: 'left',
  },
  {
    id: 'f-tax-num',
    key: 'taxRegistrationNumber',
    label: 'Tax Registration (GST/VAT/TRN)',
    visible: true,
    xPercent: 5,
    yPercent: 18,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  {
    id: 'f-inv-title',
    key: 'invoiceTitle',
    label: 'TAX INVOICE Header',
    visible: true,
    xPercent: 95,
    yPercent: 4,
    fontSize: 20,
    fontWeight: 'extrabold',
    textAlign: 'right',
  },
  {
    id: 'f-inv-meta',
    key: 'invoiceMeta',
    label: 'Invoice Number & Date',
    visible: true,
    xPercent: 95,
    yPercent: 11,
    fontSize: 11,
    fontWeight: 'medium',
    textAlign: 'right',
  },
  {
    id: 'f-customer',
    key: 'customerDetails',
    label: 'Billed To (Customer Details)',
    visible: true,
    xPercent: 5,
    yPercent: 24,
    fontSize: 11,
    fontWeight: 'normal',
    textAlign: 'left',
  },
  {
    id: 'f-store-loc',
    key: 'storeLocation',
    label: 'Store Terminal Location',
    visible: true,
    xPercent: 95,
    yPercent: 24,
    fontSize: 11,
    fontWeight: 'medium',
    textAlign: 'right',
  },
  {
    id: 'f-subtotal',
    key: 'subtotal',
    label: 'Taxable Subtotal',
    visible: true,
    xPercent: 95,
    yPercent: 72,
    fontSize: 11,
    fontWeight: 'medium',
    textAlign: 'right',
  },
  {
    id: 'f-tax-total',
    key: 'taxTotal',
    label: 'Tax Total Breakdown',
    visible: true,
    xPercent: 95,
    yPercent: 76,
    fontSize: 11,
    fontWeight: 'medium',
    textAlign: 'right',
  },
  {
    id: 'f-grand-total',
    key: 'grandTotal',
    label: 'Grand Total Amount',
    visible: true,
    xPercent: 95,
    yPercent: 81,
    fontSize: 15,
    fontWeight: 'extrabold',
    textAlign: 'right',
  },
  {
    id: 'f-payment',
    key: 'paymentDetails',
    label: 'Payment Method & Ref',
    visible: true,
    xPercent: 5,
    yPercent: 74,
    fontSize: 10,
    fontWeight: 'normal',
    textAlign: 'left',
  },
  {
    id: 'f-qr',
    key: 'paymentQr',
    label: 'UPI / Digital Payment QR',
    visible: true,
    xPercent: 5,
    yPercent: 82,
    fontSize: 10,
    fontWeight: 'normal',
    textAlign: 'left',
  },
  {
    id: 'f-terms',
    key: 'terms',
    label: 'Terms & Warranty Policy',
    visible: true,
    xPercent: 5,
    yPercent: 92,
    fontSize: 9,
    fontWeight: 'normal',
    textAlign: 'left',
  },
  {
    id: 'f-footer',
    key: 'footer',
    label: 'Thank You Footer',
    visible: true,
    xPercent: 50,
    yPercent: 98,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
];

export const DEFAULT_INVOICE_CONFIG: InvoiceTemplateConfig = {
  version: 2,
  templateName: 'Standard High-Density Retail Invoice',
  pageSize: 'A4',
  orientation: 'portrait',
  backgroundUrl: null,
  backgroundOpacity: 12,
  watermarkOpacity: 6,
  showGridOverlay: false,
  fields: DEFAULT_INVOICE_FIELDS,
  tableConfig: {
    visible: true,
    startYPercent: 32,
    showSku: true,
    showHsn: true,
    showWarranty: true,
    showTaxBreakdown: true,
  },
};

/**
 * Validates and parses serialized invoice field mapping JSON
 */
export function parseInvoiceTemplateConfig(rawJson: string | null | undefined): InvoiceTemplateConfig {
  if (!rawJson) return DEFAULT_INVOICE_CONFIG;
  try {
    const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    if (parsed && Array.isArray(parsed.fields)) {
      return {
        ...DEFAULT_INVOICE_CONFIG,
        ...parsed,
        templateMode: parsed.templateMode || 'standard',
        fields: parsed.fields.map((f: any) => ({
          id: f.id || `f-${f.key}`,
          key: f.key,
          label: f.label || f.key,
          visible: f.visible !== false,
          xPercent: Math.max(0, Math.min(100, Number(f.xPercent) || 0)),
          yPercent: Math.max(0, Math.min(100, Number(f.yPercent) || 0)),
          widthPercent: f.widthPercent !== undefined ? Math.max(0, Math.min(100, Number(f.widthPercent))) : undefined,
          fontSize: Math.max(8, Math.min(32, Number(f.fontSize) || 11)),
          fontWeight: f.fontWeight || 'normal',
          textAlign: f.textAlign || 'left',
          color: f.color || undefined,
        })),
        tableConfig: {
          ...DEFAULT_INVOICE_CONFIG.tableConfig,
          ...(parsed.tableConfig || {}),
        },
      };
    }
  } catch (err) {
    console.warn('Failed to parse invoiceFieldMapping, using defaults:', err);
  }
  return DEFAULT_INVOICE_CONFIG;
}

/**
 * Validates invoice template coordinate boundaries and schema integrity
 */
export function validateTemplateMapping(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || !Array.isArray(config.fields)) {
    return { valid: false, errors: ['Missing fields array'] };
  }
  for (const f of config.fields) {
    const x = f.xPercent !== undefined ? f.xPercent : f.x;
    const y = f.yPercent !== undefined ? f.yPercent : f.y;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 100 || y < 0 || y > 100) {
      errors.push(`Coordinates out of bounds for field ${f.key || f.fieldKey || f.id || 'unknown'}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

