import { getJurisdictionProfile, JurisdictionProfile, LAUNCH_JURISDICTIONS } from './jurisdictions';

export interface MoneyFormatOptions {
  currencyCode?: string;
  currencySymbol?: string;
  locale?: string;
  showSymbol?: boolean;
  decimals?: number;
  countryCode?: string;
}

/**
 * Universal Money Formatter
 *
 * Formats numeric monetary amounts accurately according to the active jurisdiction:
 * - Proper currency symbols (₹, AED, SAR, £, $, A$, R)
 * - Number group formatting (Indian lakhs/crores for en-IN, thousands comma for en-US/en-GB)
 * - Safe null/undefined/NaN handling
 */
export function formatMoney(
  amount: number | string | null | undefined,
  optionsOrCurrency?: MoneyFormatOptions | string,
  localeParam?: string
): string {
  const options: MoneyFormatOptions =
    typeof optionsOrCurrency === 'string'
      ? { currencyCode: optionsOrCurrency, locale: localeParam }
      : optionsOrCurrency || {};

  const numeric = typeof amount === 'number' ? amount : Number(amount || 0);
  const safeAmount = isNaN(numeric) ? 0 : numeric;

  const profile: JurisdictionProfile = getJurisdictionProfile(options.countryCode || 'IN');
  const locale = options.locale || profile.defaultLocale;

  let symbol = options.currencySymbol;
  if (!symbol) {
    if (options.currencyCode) {
      const match = Object.values(LAUNCH_JURISDICTIONS).find(
        (p) => p.defaultCurrencyCode.toUpperCase() === options.currencyCode?.toUpperCase()
      );
      if (match) {
        symbol = match.defaultCurrencySymbol;
      }
    }
    if (!symbol) {
      symbol = profile.defaultCurrencySymbol;
    }
  }

  const decimals = options.decimals !== undefined ? options.decimals : 2;
  const showSymbol = options.showSymbol !== false;

  // Format with Intl.NumberFormat
  let formattedNumber: string;
  try {
    formattedNumber = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeAmount);
  } catch {
    formattedNumber = safeAmount.toFixed(decimals);
  }

  if (!showSymbol) {
    return formattedNumber;
  }

  // Symbol placement:
  // Postfix/space for multi-char currencies like 'AED 100.00', 'SAR 100.00'
  if (symbol.length > 1 && !symbol.startsWith('$') && !symbol.startsWith('A$')) {
    return `${symbol} ${formattedNumber}`;
  }

  // Prefix for single glyphs: ₹100.00, $100.00, £100.00, R 100.00
  if (symbol === 'R') {
    return `R ${formattedNumber}`;
  }
  return `${symbol}${formattedNumber}`;
}

/**
 * Compact currency formatter: e.g. "1.5M", "500K"
 */
export function formatCompactMoney(
  amount: number | string | null | undefined,
  currencyCodeOrOptions?: string | MoneyFormatOptions,
  localeParam?: string
): string {
  const options: MoneyFormatOptions =
    typeof currencyCodeOrOptions === 'string'
      ? { currencyCode: currencyCodeOrOptions, locale: localeParam }
      : currencyCodeOrOptions || {};

  const numeric = typeof amount === 'number' ? amount : Number(amount || 0);
  const safeAmount = isNaN(numeric) ? 0 : numeric;
  const profile = getJurisdictionProfile(options.countryCode || 'IN');
  const locale = options.locale || profile.defaultLocale;

  try {
    const compactStr = new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(safeAmount);

    let symbol = options.currencySymbol;
    if (!symbol && options.currencyCode) {
      const match = Object.values(LAUNCH_JURISDICTIONS).find(
        (p) => p.defaultCurrencyCode.toUpperCase() === options.currencyCode?.toUpperCase()
      );
      if (match) symbol = match.defaultCurrencySymbol;
    }
    if (!symbol) symbol = profile.defaultCurrencySymbol;

    if (symbol.length > 1 && !symbol.startsWith('$') && !symbol.startsWith('A$')) {
      return `${symbol} ${compactStr}`;
    }
    return `${symbol}${compactStr}`;
  } catch {
    return formatMoney(safeAmount, options);
  }
}

/**
 * Returns currency context for the active or given jurisdiction
 */
export function getCurrencyContext(countryCode?: string | null): {
  countryCode: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
} {
  const profile = getJurisdictionProfile(countryCode);
  return {
    countryCode: profile.countryCode,
    currencyCode: profile.defaultCurrencyCode,
    currencySymbol: profile.defaultCurrencySymbol,
    locale: profile.defaultLocale,
    timezone: profile.defaultTimezone,
  };
}

/**
 * Formats tax labels dynamically based on country profile:
 * e.g. "GST (18%)", "VAT (5%)", "Sales Tax (6.25%)"
 */
export function formatTaxLabel(
  countryOrSettings?: string | { countryCode?: string; defaultTaxRate?: number; taxRegime?: string } | null,
  rate?: number | string | null
): string {
  let countryCode: string | undefined;
  let taxRate = rate;

  if (countryOrSettings && typeof countryOrSettings === 'object') {
    countryCode = (countryOrSettings as any).countryCode || (countryOrSettings as any).taxRegime;
    if (taxRate === undefined || taxRate === null) {
      taxRate = (countryOrSettings as any).defaultTaxRate;
    }
  } else if (typeof countryOrSettings === 'string') {
    countryCode = countryOrSettings;
  }

  // If directly passed a known regime name like 'VAT', 'GST', 'Sales Tax'
  if (countryCode && ['VAT', 'GST', 'SALES TAX'].includes(countryCode.toUpperCase())) {
    const numRate = taxRate !== undefined && taxRate !== null ? Number(taxRate) : null;
    if (numRate === null || isNaN(numRate) || numRate <= 0) {
      return countryCode.toUpperCase();
    }
    return `${countryCode.toUpperCase()} (${numRate}%)`;
  }

  const profile = getJurisdictionProfile(countryCode);
  const numRate = taxRate !== undefined && taxRate !== null ? Number(taxRate) : profile.defaultTaxRate;
  if (isNaN(numRate) || numRate <= 0) {
    return profile.taxLabel;
  }
  return `${profile.taxLabel} (${numRate}%)`;
}

/**
 * Tax Calculation Model
 */
export interface TaxCalculationParams {
  amount: number;
  taxRate: number;
  isInclusive?: boolean;
  countryCode?: string;
  intrastate?: boolean; // For India: true = CGST + SGST; false = IGST
}

export interface TaxCalculationResult {
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  effectiveRate: number;
  isInclusive: boolean;
  breakdown: Array<{
    name: string;
    rate: number;
    amount: number;
  }>;
}

/**
 * Accurately calculates applicable taxes across inclusive and exclusive regimes
 */
export function calculateApplicableTax(params: TaxCalculationParams): TaxCalculationResult {
  const { amount = 0, taxRate = 0, isInclusive = false, countryCode = 'IN', intrastate = true } = params;
  const safeAmount = Math.max(0, Number(amount) || 0);
  const safeRate = Math.max(0, Number(taxRate) || 0);

  let baseAmount: number;
  let taxAmount: number;
  let totalAmount: number;

  if (isInclusive) {
    // Shelf price includes tax: base = total / (1 + rate / 100)
    totalAmount = Math.round(safeAmount * 100) / 100;
    baseAmount = Math.round((safeAmount / (1 + safeRate / 100)) * 100) / 100;
    taxAmount = Math.round((totalAmount - baseAmount) * 100) / 100;
  } else {
    // Shelf price is exclusive: tax = base * (rate / 100)
    baseAmount = Math.round(safeAmount * 100) / 100;
    taxAmount = Math.round(((baseAmount * safeRate) / 100) * 100) / 100;
    totalAmount = Math.round((baseAmount + taxAmount) * 100) / 100;
  }

  const breakdown: Array<{ name: string; rate: number; amount: number }> = [];

  // Regional breakdown logic
  if (countryCode.toUpperCase() === 'IN' && safeRate > 0) {
    if (intrastate) {
      const halfRate = safeRate / 2;
      const halfTax = Math.round((taxAmount / 2) * 100) / 100;
      breakdown.push({ name: 'CGST', rate: halfRate, amount: halfTax });
      breakdown.push({ name: 'SGST', rate: halfRate, amount: Math.round((taxAmount - halfTax) * 100) / 100 });
    } else {
      breakdown.push({ name: 'IGST', rate: safeRate, amount: taxAmount });
    }
  } else if (countryCode.toUpperCase() === 'US' && safeRate > 0) {
    breakdown.push({ name: `Sales Tax (${safeRate}%)`, rate: safeRate, amount: taxAmount });
  } else {
    const profile = getJurisdictionProfile(countryCode);
    breakdown.push({ name: profile.taxLabel, rate: safeRate, amount: taxAmount });
  }

  return {
    baseAmount,
    taxAmount,
    totalAmount,
    effectiveRate: safeRate,
    isInclusive,
    breakdown,
  };
}

/**
 * Returns currency configuration for a jurisdiction
 */
export function getCurrencyConfig(countryCode?: string) {
  const profile = getJurisdictionProfile(countryCode);
  return {
    code: profile.defaultCurrencyCode,
    symbol: profile.defaultCurrencySymbol,
    locale: profile.defaultLocale,
  };
}
