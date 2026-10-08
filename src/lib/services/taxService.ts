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
  allocatedCartDiscount: number;
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
  netSalesRevenue: number;
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
    options?: {
      customerState?: string | null;
      allocatedCartDiscount?: number;
      taxComponents?: Array<{ name: string; rate: number }>;
    }
  ): CalculatedTaxLine {
    const qty = Math.max(1, Number(item.qty) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));

    const lineGross = Math.round(qty * unitPrice * 100) / 100;
    const itemDiscount = Math.round(lineGross * (discountPercent / 100) * 100) / 100;
    const lineNetBeforeCart = Math.max(0, Math.round((lineGross - itemDiscount) * 100) / 100);

    const allocatedCartDiscount = Math.max(
      0,
      Math.min(lineNetBeforeCart, Math.round(Number(options?.allocatedCartDiscount || 0) * 100) / 100)
    );

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
      lineTotal = Math.max(0, Math.round((lineNetBeforeCart - allocatedCartDiscount) * 100) / 100);
      if (taxRate > 0) {
        lineSubtotal = Math.round((lineTotal / (1 + taxRate / 100)) * 100) / 100;
        taxAmount = Math.max(0, Math.round((lineTotal - lineSubtotal) * 100) / 100);
      } else {
        lineSubtotal = lineTotal;
        taxAmount = 0;
      }
    } else {
      // Shelf price is exclusive of tax
      lineSubtotal = Math.max(0, Math.round((lineNetBeforeCart - allocatedCartDiscount) * 100) / 100);
      if (taxRate > 0) {
        taxAmount = Math.round(((lineSubtotal * taxRate) / 100) * 100) / 100;
      } else {
        taxAmount = 0;
      }
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
      if (options?.taxComponents && options.taxComponents.length > 0) {
        for (const comp of options.taxComponents) {
          const compTax = Math.round(((lineSubtotal * comp.rate) / 100) * 100) / 100;
          breakdown.push({ name: comp.name, rate: comp.rate, amount: compTax });
        }
      } else {
        breakdown.push({ name: `Sales Tax (${taxRate}%)`, rate: taxRate, amount: taxAmount });
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
      allocatedCartDiscount,
      taxRate,
      taxAmount,
      lineSubtotal,
      lineTotal,
      hsnSac: item.hsnSac || null,
      breakdown,
    };
  }

  /**
   * Authoritative transaction tax calculation over full cart with deterministic proportional discount allocation
   */
  public static calculateTransactionTax(
    items: LineTaxItem[],
    context: TaxContext,
    discountAmount: number = 0,
    options?: {
      customerState?: string | null;
      taxComponents?: Array<{ name: string; rate: number }>;
    }
  ): TransactionTaxResult {
    // 1. Calculate line bases before cart discount
    const preCartLineBases: number[] = [];
    let totalCartEligible = 0;

    for (const item of items) {
      const qty = Math.max(1, Number(item.qty) || 1);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));

      const lineGross = Math.round(qty * unitPrice * 100) / 100;
      const itemDiscount = Math.round(lineGross * (discountPercent / 100) * 100) / 100;
      const lineNetBeforeCart = Math.max(0, Math.round((lineGross - itemDiscount) * 100) / 100);

      preCartLineBases.push(lineNetBeforeCart);
      totalCartEligible += lineNetBeforeCart;
    }

    totalCartEligible = Math.round(totalCartEligible * 100) / 100;

    const safeDiscount = Math.max(
      0,
      Math.min(totalCartEligible, Math.round(Number(discountAmount || 0) * 100) / 100)
    );

    // 2. Proportionally allocate cart discount across applicable lines
    const allocatedDiscounts: number[] = new Array(items.length).fill(0);
    if (safeDiscount > 0 && totalCartEligible > 0) {
      let allocatedTotal = 0;
      let maxBaseIndex = 0;
      let maxBase = -1;

      for (let i = 0; i < items.length; i++) {
        const base = preCartLineBases[i];
        if (base > maxBase) {
          maxBase = base;
          maxBaseIndex = i;
        }
        const lineShare = Math.round((safeDiscount * (base / totalCartEligible)) * 100) / 100;
        allocatedDiscounts[i] = lineShare;
        allocatedTotal += lineShare;
      }

      // Reconcile rounding difference to the largest eligible line
      allocatedTotal = Math.round(allocatedTotal * 100) / 100;
      const diff = Math.round((safeDiscount - allocatedTotal) * 100) / 100;
      if (diff !== 0 && maxBase > 0) {
        allocatedDiscounts[maxBaseIndex] = Math.round((allocatedDiscounts[maxBaseIndex] + diff) * 100) / 100;
      }
    }

    // 3. Calculate taxes for each line on its adjusted taxable amount
    let netSalesRevenue = 0;
    let totalTaxAmount = 0;
    let grandTotal = 0;
    const lines: CalculatedTaxLine[] = [];
    const aggregatedBreakdown = new Map<string, { rate: number; amount: number }>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const allocatedDiscount = allocatedDiscounts[i];
      const line = this.calculateLineTax(item, context, {
        ...options,
        allocatedCartDiscount: allocatedDiscount,
      });

      lines.push(line);
      netSalesRevenue += line.lineSubtotal;
      totalTaxAmount += line.taxAmount;
      grandTotal += line.lineTotal;

      for (const bd of line.breakdown) {
        const existing = aggregatedBreakdown.get(bd.name) || { rate: bd.rate, amount: 0 };
        existing.amount = Math.round((existing.amount + bd.amount) * 100) / 100;
        aggregatedBreakdown.set(bd.name, existing);
      }
    }

    netSalesRevenue = Math.round(netSalesRevenue * 100) / 100;
    totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
    grandTotal = Math.round(grandTotal * 100) / 100;

    const subtotal = context.taxInclusivePricing
      ? Math.round((netSalesRevenue + totalTaxAmount + safeDiscount) * 100) / 100
      : Math.round((netSalesRevenue + safeDiscount) * 100) / 100;

    const taxBreakdown = Array.from(aggregatedBreakdown.entries()).map(([name, val]) => ({
      name,
      rate: val.rate,
      amount: val.amount,
    }));

    const jurProfile = getJurisdictionProfile(context.countryCode);

    return {
      context,
      subtotal,
      netSalesRevenue,
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
  public static getInvoiceLabels(
    countryCode?: string | null,
    rate?: number | string | null
  ): string {
    const profile = getJurisdictionProfile(countryCode);
    const numRate = rate !== undefined && rate !== null ? Number(rate) : profile.defaultTaxRate;
    if (isNaN(numRate) || numRate <= 0) {
      return profile.taxLabel;
    }
    return `${profile.taxLabel} (${numRate}%)`;
  }
}

