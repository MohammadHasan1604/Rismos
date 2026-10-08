import { prisma } from '../db';
import { getJurisdictionProfile } from '../localization/jurisdictions';

export interface TaxContext {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
  taxRegime: string;
  taxLabel: string;
  defaultTaxRate: number;
  taxInclusivePricing: boolean;
  taxRegistrationNumber?: string | null;
  taxJurisdictionState?: string | null;
  taxConfigVersion: number;
}

export interface LineTaxItem {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  discountPercent?: number;
  productTaxRate?: number | null;
  hsnSac?: string | null;
}

export interface CalculatedTaxLine {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  taxAmount: number;
  lineSubtotal: number;
  lineTotal: number;
  hsnSac?: string | null;
  breakdown: Array<{ name: string; rate: number; amount: number }>;
}

export interface TransactionTaxResult {
  context: TaxContext;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  grandTotal: number;
  lines: CalculatedTaxLine[];
  taxBreakdown: Array<{ name: string; rate: number; amount: number }>;
  invoiceSnapshot: {
    countryCode: string;
    currencyCode: string;
    currencySymbol: string;
    taxRegime: string;
    taxInclusive: boolean;
    taxConfigVersion: number;
    taxRegistrationNumber: string | null;
    taxJurisdictionState: string | null;
    legalHeader: string;
    taxIdLabel: string;
    taxBreakdown: Array<{ name: string; rate: number; amount: number }>;
  };
}

export class TaxService {
  /**
   * Resolves the authoritative tax context from store/system settings
   */
  public static async resolveTaxContext(storeCodeOrOverrides?: string | any): Promise<TaxContext> {
    let sysSettings: any = null;
    let branding: any = null;

    if (storeCodeOrOverrides && typeof storeCodeOrOverrides === 'object') {
      sysSettings = storeCodeOrOverrides;
      branding = storeCodeOrOverrides;
    } else {
      sysSettings = await (prisma as any).systemSettings.findFirst().catch(() => null);
      branding = await (prisma as any).brandingSetting.findFirst().catch(() => null);
    }

    const countryCode = (
      sysSettings?.countryCode ||
      branding?.countryCode ||
      'IN'
    ).toUpperCase().trim();

    const jurProfile = getJurisdictionProfile(countryCode);

    const currencyCode = sysSettings?.currencyCode || jurProfile.defaultCurrencyCode;
    const currencySymbol = sysSettings?.currencySymbol || jurProfile.defaultCurrencySymbol;
    const locale = branding?.locale || jurProfile.defaultLocale;
    const timezone = branding?.timezone || jurProfile.defaultTimezone;
    const taxRegime = sysSettings?.taxRegime || jurProfile.taxRegime;
    const taxInclusivePricing =
      sysSettings?.taxInclusivePricing !== undefined
        ? Boolean(sysSettings.taxInclusivePricing)
        : jurProfile.taxInclusivePricingMode;

    const taxRegistrationNumber =
      sysSettings?.taxRegistrationNumber ||
      sysSettings?.gstin ||
      null;

    const taxJurisdictionState =
      sysSettings?.taxJurisdictionState ||
      sysSettings?.gstState ||
      null;

    const defaultTaxRate =
      sysSettings?.defaultTaxRate !== undefined && !isNaN(Number(sysSettings.defaultTaxRate))
        ? Number(sysSettings.defaultTaxRate)
        : jurProfile.defaultTaxRate;

    const taxConfigVersion = Number(sysSettings?.taxConfigVersion) || 1;

    return {
      countryCode,
      countryName: jurProfile.countryName,
      currencyCode,
      currencySymbol,
      locale,
      timezone,
      taxRegime,
      taxLabel: jurProfile.taxLabel,
      defaultTaxRate,
      taxInclusivePricing,
      taxRegistrationNumber,
      taxJurisdictionState,
      taxConfigVersion,
    };
  }

  /**
   * Calculates taxes on a single line item
   */
  public static calculateLineTax(
    item: LineTaxItem,
    context: TaxContext,
    options?: { customerState?: string | null }
  ): CalculatedTaxLine {
    const qty = Math.max(1, Number(item.qty) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));

    const lineGross = qty * unitPrice;
    const lineDiscount = lineGross * (discountPercent / 100);
    const effectiveLinePrice = lineGross - lineDiscount;

    // Resolve line tax rate: use product-specific rate if available, else fall back to context default
    let taxRate = context.defaultTaxRate;
    if (item.productTaxRate !== undefined && item.productTaxRate !== null) {
      const pRate = Number(item.productTaxRate);
      if (!isNaN(pRate) && pRate >= 0) {
        taxRate = pRate;
      }
    }

    let lineSubtotal: number;
    let taxAmount: number;
    let lineTotal: number;

    if (context.taxInclusivePricing) {
      // Shelf price includes tax
      lineTotal = Math.round(effectiveLinePrice * 100) / 100;
      lineSubtotal = Math.round((effectiveLinePrice / (1 + taxRate / 100)) * 100) / 100;
      taxAmount = Math.round((lineTotal - lineSubtotal) * 100) / 100;
    } else {
      // Shelf price is exclusive of tax
      lineSubtotal = Math.round(effectiveLinePrice * 100) / 100;
      taxAmount = Math.round(((lineSubtotal * taxRate) / 100) * 100) / 100;
      lineTotal = Math.round((lineSubtotal + taxAmount) * 100) / 100;
    }

    // Breakdown generation
    const breakdown: Array<{ name: string; rate: number; amount: number }> = [];

    if (context.countryCode === 'IN' && taxRate > 0) {
      // Intrastate vs Interstate determination
      const storeState = context.taxJurisdictionState?.toLowerCase().trim() || 'karnataka';
      const custState = options?.customerState?.toLowerCase().trim() || storeState;
      const isIntrastate = storeState === custState;

      if (isIntrastate) {
        const halfRate = Math.round((taxRate / 2) * 100) / 100;
        const halfTax = Math.round((taxAmount / 2) * 100) / 100;
        breakdown.push({ name: 'CGST', rate: halfRate, amount: halfTax });
        breakdown.push({
          name: 'SGST',
          rate: halfRate,
          amount: Math.round((taxAmount - halfTax) * 100) / 100,
        });
      } else {
        breakdown.push({ name: 'IGST', rate: taxRate, amount: taxAmount });
      }
    } else if (context.countryCode === 'US' && taxRate > 0) {
      const stateRate = Math.min(taxRate, 6.0);
      const localRate = Math.max(0, taxRate - stateRate);
      const stateTax = Math.round(((lineSubtotal * stateRate) / 100) * 100) / 100;
      const localTax = Math.round((taxAmount - stateTax) * 100) / 100;
      breakdown.push({ name: 'State Tax', rate: stateRate, amount: stateTax });
      if (localRate > 0) {
        breakdown.push({ name: 'Local/City Tax', rate: localRate, amount: localTax });
      }
    } else if (taxRate > 0) {
      breakdown.push({ name: context.taxLabel, rate: taxRate, amount: taxAmount });
    }

    return {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      qty,
      unitPrice,
      discountPercent,
      taxRate,
      taxAmount,
      lineSubtotal,
      lineTotal,
      hsnSac: item.hsnSac || null,
      breakdown,
    };
  }

  /**
   * Authoritative transaction tax calculation over full cart
   */
  public static calculateTransactionTax(
    items: LineTaxItem[],
    context: TaxContext,
    discountAmount: number = 0,
    options?: { customerState?: string | null }
  ): TransactionTaxResult {
    let subtotal = 0;
    let totalTaxAmount = 0;
    const lines: CalculatedTaxLine[] = [];
    const aggregatedBreakdown = new Map<string, { rate: number; amount: number }>();

    for (const item of items) {
      const line = this.calculateLineTax(item, context, options);
      lines.push(line);
      subtotal += line.lineSubtotal;
      totalTaxAmount += line.taxAmount;

      for (const bd of line.breakdown) {
        const existing = aggregatedBreakdown.get(bd.name) || { rate: bd.rate, amount: 0 };
        existing.amount = Math.round((existing.amount + bd.amount) * 100) / 100;
        aggregatedBreakdown.set(bd.name, existing);
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
    const safeDiscount = Math.max(0, Math.round(Number(discountAmount || 0) * 100) / 100);

    const grandTotal = context.taxInclusivePricing
      ? Math.max(0, Math.round((subtotal + totalTaxAmount - safeDiscount) * 100) / 100)
      : Math.max(0, Math.round((subtotal + totalTaxAmount - safeDiscount) * 100) / 100);

    const taxBreakdown = Array.from(aggregatedBreakdown.entries()).map(([name, val]) => ({
      name,
      rate: val.rate,
      amount: val.amount,
    }));

    const jurProfile = getJurisdictionProfile(context.countryCode);

    return {
      context,
      subtotal,
      taxAmount: totalTaxAmount,
      discountAmount: safeDiscount,
      grandTotal,
      lines,
      taxBreakdown,
      invoiceSnapshot: {
        countryCode: context.countryCode,
        currencyCode: context.currencyCode,
        currencySymbol: context.currencySymbol,
        taxRegime: context.taxRegime,
        taxInclusive: context.taxInclusivePricing,
        taxConfigVersion: context.taxConfigVersion,
        taxRegistrationNumber: context.taxRegistrationNumber || null,
        taxJurisdictionState: context.taxJurisdictionState || null,
        legalHeader: `${jurProfile.taxLabel} INVOICE`,
        taxIdLabel: jurProfile.taxIdLabel,
        taxBreakdown,
      },
    };
  }

  /**
   * Helper to format localized tax labels
   */
  public static getInvoiceLabels(countryCode?: string | null, rate?: number | string | null): string {
    const profile = getJurisdictionProfile(countryCode);
    const numRate = rate !== undefined && rate !== null ? Number(rate) : profile.defaultTaxRate;
    if (isNaN(numRate) || numRate <= 0) {
      return profile.taxLabel;
    }
    return `${profile.taxLabel} (${numRate}%)`;
  }
}
