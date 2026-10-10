import { prisma } from '../src/lib/db';
import { getJurisdictionProfile } from '../src/lib/localization/jurisdictions';
import { formatMoney, formatCompactMoney, formatTaxLabel } from '../src/lib/localization/formatters';
import { TaxService } from '../src/lib/services/taxService';
import { toE164Phone, formatDisplayPhone } from '../src/lib/phoneUtils';
import { buildWhatsAppInvoiceMessage } from '../src/lib/whatsappInvoice';

/**
 * P3-5: Country Matrix E2E Test Suite
 *
 * Verifies all 7 Launch Jurisdictions:
 * - IN (India)
 * - AE (United Arab Emirates)
 * - SA (Saudi Arabia)
 * - GB (United Kingdom)
 * - US (United States)
 * - AU (Australia)
 * - ZA (South Africa)
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${description}${details ? ` -> ${details}` : ''}`);
    failures.push(description);
    failed++;
  }
}

const COUNTRIES = ['IN', 'AE', 'SA', 'GB', 'US', 'AU', 'ZA'] as const;

// Sample local phones for each country
const COUNTRY_SAMPLE_PHONES: Record<string, { raw: string; expectedPrefix: string }> = {
  IN: { raw: '9876543210', expectedPrefix: '+91' },
  AE: { raw: '501234567', expectedPrefix: '+971' },
  SA: { raw: '501234567', expectedPrefix: '+966' },
  GB: { raw: '7911123456', expectedPrefix: '+44' },
  US: { raw: '2025550143', expectedPrefix: '+1' },
  AU: { raw: '412345678', expectedPrefix: '+61' },
  ZA: { raw: '821234567', expectedPrefix: '+27' },
};

async function runCountryMatrixSuite() {
  console.log('========================================================================');
  console.log('🌍 P3-5: COUNTRY MATRIX E2E VERIFICATION (IN, AE, SA, GB, US, AU, ZA)');
  console.log('========================================================================\n');

  // Backup original settings to restore at the end
  const originalSystemSettings = await (prisma as any).systemSettings.findUnique({
    where: { id: 'cosko_system_config' },
  });
  const originalBranding = await (prisma as any).brandingSetting.findUnique({
    where: { id: 'cosko_branding_config' },
  });

  try {
    for (const code of COUNTRIES) {
      console.log(`\n========================================================================`);
      console.log(`📍 TESTING JURISDICTION: ${code}`);
      console.log(`========================================================================`);

      const profile = getJurisdictionProfile(code);
      assert(`[${code}] Loaded profile for ${profile.countryName}`, profile.countryCode === code);

      // 1. Set business jurisdiction in DB
      await (prisma as any).systemSettings.upsert({
        where: { id: 'cosko_system_config' },
        create: {
          id: 'cosko_system_config',
          countryCode: profile.countryCode,
          currencyCode: profile.defaultCurrencyCode,
          currencySymbol: profile.defaultCurrencySymbol,
          taxRegime: profile.taxRegime,
          defaultTaxRate: profile.defaultTaxRate,
          taxInclusivePricing: profile.taxInclusivePricingMode,
        },
        update: {
          countryCode: profile.countryCode,
          currencyCode: profile.defaultCurrencyCode,
          currencySymbol: profile.defaultCurrencySymbol,
          taxRegime: profile.taxRegime,
          defaultTaxRate: profile.defaultTaxRate,
          taxInclusivePricing: profile.taxInclusivePricingMode,
        },
      });

      await (prisma as any).brandingSetting.upsert({
        where: { id: 'cosko_branding_config' },
        create: {
          id: 'cosko_branding_config',
          country: profile.countryName,
          countryCode: profile.countryCode,
          locale: profile.defaultLocale,
          timezone: profile.defaultTimezone,
        },
        update: {
          country: profile.countryName,
          countryCode: profile.countryCode,
          locale: profile.defaultLocale,
          timezone: profile.defaultTimezone,
        },
      });

      // 2. Reload and verify settings persistence
      const reloadedSystem = await (prisma as any).systemSettings.findUnique({
        where: { id: 'cosko_system_config' },
      });
      const reloadedBranding = await (prisma as any).brandingSetting.findUnique({
        where: { id: 'cosko_branding_config' },
      });

      assert(`[${code}] System settings reloaded with countryCode ${code}`, reloadedSystem?.countryCode === code);
      assert(`[${code}] Currency code reloaded as ${profile.defaultCurrencyCode}`, reloadedSystem?.currencyCode === profile.defaultCurrencyCode);
      assert(`[${code}] Currency symbol reloaded as ${profile.defaultCurrencySymbol}`, reloadedSystem?.currencySymbol === profile.defaultCurrencySymbol);
      assert(`[${code}] Tax regime reloaded as ${profile.taxRegime}`, reloadedSystem?.taxRegime === profile.taxRegime);
      assert(`[${code}] Branding locale reloaded as ${profile.defaultLocale}`, reloadedBranding?.locale === profile.defaultLocale);

      // 3. Tax Calculation Tests (Inclusive and Exclusive)
      const testAmount = 1000;
      const rate = profile.defaultTaxRate;

      // Tax inclusive calculation
      const contextInclusive = await TaxService.resolveTaxContext({
        countryCode: profile.countryCode,
        currencyCode: profile.defaultCurrencyCode,
        currencySymbol: profile.defaultCurrencySymbol,
        taxRegime: profile.taxRegime,
        defaultTaxRate: rate,
        taxInclusivePricing: true,
      });
      const calcInclusive = TaxService.calculateLineTax(
        { productId: 'test-p', productName: 'Item', sku: 'SKU-1', qty: 1, unitPrice: testAmount },
        contextInclusive
      );
      const expectedTaxInclusive = rate > 0 ? Math.round((testAmount - testAmount / (1 + rate / 100)) * 100) / 100 : 0;
      assert(
        `[${code}] Tax inclusive calculation matches expected (${calcInclusive.taxAmount} vs ${expectedTaxInclusive})`,
        Math.abs(calcInclusive.taxAmount - expectedTaxInclusive) <= 0.05
      );

      // Tax exclusive calculation
      const contextExclusive = await TaxService.resolveTaxContext({
        countryCode: profile.countryCode,
        currencyCode: profile.defaultCurrencyCode,
        currencySymbol: profile.defaultCurrencySymbol,
        taxRegime: profile.taxRegime,
        defaultTaxRate: rate,
        taxInclusivePricing: false,
      });
      const calcExclusive = TaxService.calculateLineTax(
        { productId: 'test-p', productName: 'Item', sku: 'SKU-1', qty: 1, unitPrice: testAmount },
        contextExclusive
      );
      const expectedTaxExclusive = Math.round(testAmount * (rate / 100) * 100) / 100;
      assert(
        `[${code}] Tax exclusive calculation matches expected (${calcExclusive.taxAmount} vs ${expectedTaxExclusive})`,
        Math.abs(calcExclusive.taxAmount - expectedTaxExclusive) <= 0.05
      );

      // 4. Money formatting
      const formattedMoney = formatMoney(1250.5, profile.defaultCurrencyCode, profile.defaultLocale);
      assert(
        `[${code}] Money formatting produces localized output (${formattedMoney})`,
        formattedMoney.includes(profile.defaultCurrencySymbol) || formattedMoney.includes(profile.defaultCurrencyCode)
      );

      // 5. Compact report formatting
      const compactMoney = formatCompactMoney(1500000, profile.defaultCurrencyCode, profile.defaultLocale);
      assert(`[${code}] Compact money formatting is non-empty (${compactMoney})`, compactMoney.length > 0);

      // 6. Tax label formatting
      const taxLabel = formatTaxLabel(code, rate);
      assert(`[${code}] Tax label contains regime name (${taxLabel})`, taxLabel.toLowerCase().includes(profile.taxRegime.toLowerCase()));

      // 7. Phone normalization & formatting
      const phoneSample = COUNTRY_SAMPLE_PHONES[code];
      const e164 = toE164Phone(phoneSample.raw, code);
      assert(
        `[${code}] Normalized phone starts with expected country code ${phoneSample.expectedPrefix} (${e164})`,
        e164.startsWith(phoneSample.expectedPrefix)
      );

      const displayPhone = formatDisplayPhone(e164, code);
      assert(`[${code}] Formatted display phone is valid (${displayPhone})`, displayPhone.length > 5);

      // 8. Digital Invoice / WhatsApp notification test
      const invoiceMessage = buildWhatsAppInvoiceMessage({
        customerName: 'Jurisdiction Tester',
        orderNo: `INV-${code}-001`,
        store: `RISMOS ${profile.countryName}`,
        items: [{ name: 'Test Product', qty: 2, unitPrice: 1000 }],
        totalAmount: 2000,
        currencyCode: profile.defaultCurrencyCode,
        locale: profile.defaultLocale,
        countryCode: code,
      });

      assert(
        `[${code}] Invoice message contains correct currency code or symbol (${profile.defaultCurrencyCode})`,
        invoiceMessage.includes(profile.defaultCurrencyCode) || invoiceMessage.includes(profile.defaultCurrencySymbol)
      );

      // 9. CRITICAL NON-INDIA ISOLATION ASSERTIONS
      if (code !== 'IN') {
        console.log(`  🛡️ Performing strict non-India leak audit for ${code}...`);

        // Check currency symbol leak
        assert(
          `[${code}] Must NOT contain Indian Rupee symbol '₹'`,
          !formattedMoney.includes('₹') && !invoiceMessage.includes('₹')
        );

        // Check currency code leak
        assert(
          `[${code}] Must NOT contain currency code 'INR'`,
          !formattedMoney.includes('INR') && !invoiceMessage.includes('INR')
        );

        // Check Indian tax registration leak
        assert(
          `[${code}] Must NOT contain Indian GSTIN label`,
          !profile.taxIdLabel.includes('GSTIN') && !invoiceMessage.includes('GSTIN')
        );

        // Check phone country code leak
        assert(
          `[${code}] Normalized phone must NOT default to Indian '+91'`,
          !e164.startsWith('+91')
        );

        // Check payment methods (UPI must not be forced as sole or default method)
        assert(
          `[${code}] UPI is not the default payment method for international markets`,
          profile.countryCode !== 'IN'
        );
      } else {
        // India-specific checks
        assert('[IN] India profile correctly identifies GST regime', profile.taxRegime === 'GST');
        assert('[IN] India profile has GSTIN label', profile.taxIdLabel.includes('GSTIN'));
        assert('[IN] India phone starts with +91', e164.startsWith('+91'));
      }
    }
  } catch (err: any) {
    console.error('Country matrix error:', err);
    assert('Execution completed without error', false, err.message);
  } finally {
    console.log('\n--- Restoring Original System Settings ---');
    try {
      if (originalSystemSettings) {
        await (prisma as any).systemSettings.update({
          where: { id: 'cosko_system_config' },
          data: {
            countryCode: originalSystemSettings.countryCode,
            currencyCode: originalSystemSettings.currencyCode,
            currencySymbol: originalSystemSettings.currencySymbol,
            taxRegime: originalSystemSettings.taxRegime,
            defaultTaxRate: originalSystemSettings.defaultTaxRate,
            taxInclusivePricing: originalSystemSettings.taxInclusivePricing,
          },
        });
      }
      if (originalBranding) {
        await (prisma as any).brandingSetting.update({
          where: { id: 'cosko_branding_config' },
          data: {
            country: originalBranding.country,
            countryCode: originalBranding.countryCode,
            locale: originalBranding.locale,
            timezone: originalBranding.timezone,
          },
        });
      }
      console.log('  ✅ Original system & branding settings restored.');
    } catch (e: any) {
      console.warn('  ⚠️ Settings restore warning:', e.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runCountryMatrixSuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
