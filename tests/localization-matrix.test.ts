/**
 * Multi-Country Jurisdiction & Localization Matrix Test Suite
 *
 * Validates complete end-to-end tax, currency, phone, and invoice behavior across all 7 launch markets:
 * - India (IN)
 * - United Arab Emirates (AE)
 * - Saudi Arabia (SA)
 * - United Kingdom (GB)
 * - United States (US)
 * - Australia (AU)
 * - South Africa (ZA)
 */

import {
  LAUNCH_JURISDICTIONS,
  getJurisdictionProfile,
} from '../src/lib/localization/jurisdictions';
import {
  formatMoney,
  formatCompactMoney,
  formatTaxLabel,
  getCurrencyConfig,
} from '../src/lib/localization/formatters';
import { TaxService } from '../src/lib/services/taxService';
import { toE164Phone, formatDisplayPhone } from '../src/lib/phoneUtils';
import { buildWhatsAppInvoiceMessage } from '../src/lib/whatsappInvoice';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}${details ? ` -> ${details}` : ''}`);
    failures.push(description);
    failed++;
  }
}

async function runMatrixTests() {
  console.log('\n========================================================================');
  console.log('🌍 RISMOS MULTI-COUNTRY JURISDICTION & LOCALIZATION MATRIX');
  console.log('========================================================================\n');

  const COUNTRIES = ['IN', 'AE', 'SA', 'GB', 'US', 'AU', 'ZA'] as const;

  for (const code of COUNTRIES) {
    console.log(`--- Testing Country: ${code} ---`);
    const profile = getJurisdictionProfile(code);

    assert(`[${code}] Profile exists with valid country code`, profile.countryCode === code);
    assert(`[${code}] Default currency is defined (${profile.defaultCurrencyCode})`, !!profile.defaultCurrencyCode);
    assert(`[${code}] Default currency symbol is defined (${profile.defaultCurrencySymbol})`, !!profile.defaultCurrencySymbol);
    assert(`[${code}] Default locale is defined (${profile.defaultLocale})`, !!profile.defaultLocale);
    assert(`[${code}] Default timezone is defined (${profile.defaultTimezone})`, !!profile.defaultTimezone);
    assert(`[${code}] Tax regime is defined (${profile.taxRegime})`, !!profile.taxRegime);

    // 1. Money formatting
    const formatted1000 = formatMoney(1000, profile.defaultCurrencyCode, profile.defaultLocale);
    assert(
      `[${code}] formatMoney formats 1000 properly (${formatted1000})`,
      formatted1000.includes(profile.defaultCurrencySymbol) || formatted1000.includes(profile.defaultCurrencyCode)
    );

    const compactVal = formatCompactMoney(1500000, profile.defaultCurrencyCode, profile.defaultLocale);
    assert(`[${code}] formatCompactMoney produces valid compact notation (${compactVal})`, compactVal.length > 0);

    // 2. Tax formatting & Tax Service calculations
    const taxLabel = formatTaxLabel(code, profile.defaultTaxRate);
    assert(`[${code}] formatTaxLabel incorporates tax regime (${taxLabel})`, taxLabel.includes(profile.taxLabel));

    const taxContext = await TaxService.resolveTaxContext({
      countryCode: code,
      defaultTaxRate: profile.defaultTaxRate,
      taxInclusivePricing: profile.taxInclusivePricingMode,
      taxRegime: profile.taxRegime,
    });

    assert(`[${code}] TaxService.resolveTaxContext resolves countryCode ${code}`, taxContext.countryCode === code);
    assert(`[${code}] TaxService.resolveTaxContext resolves correct currency ${profile.defaultCurrencyCode}`, taxContext.currencyCode === profile.defaultCurrencyCode);

    const txTax = TaxService.calculateTransactionTax(
      [
        {
          productId: `prod-${code}-1`,
          productName: 'Standard Retail Product',
          sku: `SKU-${code}-001`,
          qty: 2,
          unitPrice: 100,
          productTaxRate: profile.defaultTaxRate,
        },
      ],
      taxContext
    );

    assert(`[${code}] Transaction subtotal is calculated (${txTax.subtotal})`, txTax.subtotal > 0);
    assert(`[${code}] Transaction grand total is valid (${txTax.grandTotal})`, txTax.grandTotal >= txTax.subtotal);
    assert(`[${code}] Transaction invoice snapshot contains immutable currency (${txTax.invoiceSnapshot.currencyCode})`, txTax.invoiceSnapshot.currencyCode === profile.defaultCurrencyCode);
    assert(`[${code}] Transaction invoice snapshot contains legal header (${txTax.invoiceSnapshot.legalHeader})`, !!txTax.invoiceSnapshot.legalHeader);

    // 3. WhatsApp Invoice Sharing
    const waMsg = buildWhatsAppInvoiceMessage({
      orderNo: `INV-${code}-001`,
      customerName: 'Test Client',
      total: 250,
      currencyCode: profile.defaultCurrencyCode,
      locale: profile.defaultLocale,
      brandName: 'RISMOS',
      store: `${code} Flagship Store`,
      items: [{ name: 'Item Alpha', qty: 1 }],
    });

    assert(`[${code}] WhatsApp invoice uses correct brand name`, waMsg.includes('RISMOS'));
    assert(`[${code}] WhatsApp invoice uses correct order number`, waMsg.includes(`INV-${code}-001`));

    // Verify non-India countries do NOT leak INR or ₹
    if (code !== 'IN') {
      assert(`[${code}] Formatted money does NOT contain ₹ symbol`, !formatted1000.includes('₹'));
      assert(`[${code}] WhatsApp message does NOT contain ₹ symbol`, !waMsg.includes('₹'));
      assert(`[${code}] WhatsApp message does NOT contain INR text`, !waMsg.includes('INR'));
    }

    // Verify US does NOT have fake universal rate
    if (code === 'US') {
      assert('[US] Does not enforce a fake universal 18% or fake national VAT', profile.taxRegime === 'Sales Tax' && profile.defaultTaxRate === 0);
    }

    // Verify UAE uses AED and TRN
    if (code === 'AE') {
      assert('[AE] Uses AED currency code', profile.defaultCurrencyCode === 'AED');
      assert('[AE] Uses TRN tax label', profile.taxIdLabel.includes('TRN'));
      assert('[AE] Uses 5% default rate', profile.defaultTaxRate === 5);
    }

    // Verify Saudi Arabia uses SAR and 15% VAT
    if (code === 'SA') {
      assert('[SA] Uses SAR currency code', profile.defaultCurrencyCode === 'SAR');
      assert('[SA] Uses 15% default rate', profile.defaultTaxRate === 15);
    }

    // Verify UK uses GBP and HMRC VAT
    if (code === 'GB') {
      assert('[GB] Uses GBP currency code', profile.defaultCurrencyCode === 'GBP');
      assert('[GB] Uses 20% standard rate', profile.defaultTaxRate === 20);
    }

    // Verify Australia uses AUD and ABN
    if (code === 'AU') {
      assert('[AU] Uses AUD currency code', profile.defaultCurrencyCode === 'AUD');
      assert('[AU] Uses ABN tax ID label', profile.taxIdLabel.includes('ABN'));
    }

    // Verify South Africa uses ZAR and 15% VAT
    if (code === 'ZA') {
      assert('[ZA] Uses ZAR currency code', profile.defaultCurrencyCode === 'ZAR');
      assert('[ZA] Uses 15% standard VAT rate', profile.defaultTaxRate === 15);
    }
  }

  // 4. International Phone Normalization Tests
  console.log('\n--- International Phone Normalization Suite ---');
  const inPhone = toE164Phone('9876543210', 'IN');
  assert('Indian phone normalizes to E.164 (+919876543210)', inPhone === '+919876543210');

  const aePhone = toE164Phone('501234567', 'AE');
  assert('UAE phone normalizes to E.164 (+971501234567)', aePhone === '+971501234567');

  const usPhone = toE164Phone('4155552671', 'US');
  assert('US phone normalizes to E.164 (+14155552671)', usPhone === '+14155552671');

  const gbPhone = toE164Phone('7911123456', 'GB');
  assert('UK phone normalizes to E.164 (+447911123456)', gbPhone === '+447911123456');

  console.log('\n========================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMatrixTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
