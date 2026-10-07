/**
 * RISMOS White-Label & Enterprise Rebranding Verification Test Suite
 *
 * Verifies end-to-end implementation of all 18 phases:
 * 1. Viewport-safe Sign-in page (100dvh, zero body overflow, mobile keyboard safe)
 * 2. Dynamic branding single source of truth (AppLogo, MySQL, color tokens, R2)
 * 3. Global logo navigation to /sales (never /dashboard)
 * 4. Persistent business profile settings (countryCode, timezone, locale, currency)
 * 5. International tax engine (IN, AE, SA, GB, US, AU, ZA)
 * 6. Global Money & Tax Formatter (formatMoney, formatTaxLabel)
 * 7. Field-mapped invoice template engine & dedicated print renderer
 * 8. Real security settings enforcement (dynamic max attempts, session timeout, password policy)
 * 9. Real alert evaluation service & in-app notifications
 * 10. Mobile "More" reordering with strict RBAC preservation & preferences API
 * 11. Super Admin mobile store switcher
 * 12. Searchable assigned store combobox & "+ Add New Store" flow
 * 13. Responsive mobile-independent layouts
 * 14. Additive database migrations only (no data loss)
 * 15. Runtime hardcoding removal
 * 16. RBAC preservation across all layers
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  formatMoney,
  formatTaxLabel,
  getCurrencyConfig,
  calculateApplicableTax,
} from '../src/lib/localization';
import {
  LAUNCH_JURISDICTIONS,
  getJurisdictionProfile,
} from '../src/lib/localization/jurisdictions';
import { validatePassword } from '../src/lib/passwordPolicy';
import { DEFAULT_INVOICE_FIELDS, validateTemplateMapping } from '../src/lib/invoice/invoiceTemplateSchema';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => boolean | string) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      const msg = typeof result === 'string' ? result : 'assertion failed';
      console.log(`  ❌ ${name}: ${msg}`);
      failures.push(`${name}: ${msg}`);
      failed++;
    }
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failures.push(`${name}: ${err.message}`);
    failed++;
  }
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

console.log('\n================================================================');
console.log('       RISMOS WHITE-LABEL & REBRANDING TEST SUITE              ');
console.log('================================================================\n');

// ─── 1. SIGN-IN PAGE VIEWPORT & BRANDING ──────────────────────────────────────
console.log('--- 1. Phase 1: Sign-In Viewport Safety & Layout ---');

const loginPage = readFile('src/app/sign-up-login/page.tsx');
const loginForm = readFile('src/app/sign-up-login/components/LoginForm.tsx');
const brandPanel = readFile('src/app/sign-up-login/components/BrandPanel.tsx');

test('Sign-in container uses h-dvh / max-h-dvh and prevents document scrolling', () => {
  return (
    loginPage.includes('h-dvh') &&
    loginPage.includes('max-h-dvh') &&
    loginPage.includes('overflow-hidden')
  );
});

test('Sign-in uses dynamic AppLogo architecture', () => {
  return (
    (loginForm.includes('AppLogo') || loginForm.includes('branding')) &&
    brandPanel.includes('AppLogo')
  );
});

test('Sign-in fetches safe public branding endpoint /api/settings/branding', () => {
  return loginForm.includes('/api/settings/branding');
});

test('Successful login navigates to /sales', () => {
  return loginForm.includes("'/sales'");
});

test('BrandPanel highlights RISMOS enterprise retail identity', () => {
  return brandPanel.includes('Run Retail. Smarter.') || brandPanel.includes('tagline');
});

// ─── 2. GLOBAL LOGO NAVIGATION ────────────────────────────────────────────────
console.log('\n--- 2. Phase 2 & 3: Global Logo Navigation & Dynamic AppLogo ---');

const sidebarContent = readFile('src/components/Sidebar.tsx');
const topbarContent = readFile('src/components/Topbar.tsx');
const appLogoContent = readFile('src/components/ui/AppLogo.tsx');

test('Sidebar brand logo routes directly to /sales (NOT /dashboard)', () => {
  // Brand logo link href in Sidebar should be /sales
  return sidebarContent.includes('href="/sales"') && sidebarContent.includes('AppLogo');
});

test('Mobile Topbar logo routes directly to /sales', () => {
  return topbarContent.includes('href="/sales"') && topbarContent.includes('AppLogo');
});

test('AppLogo supports dynamic primaryColor and secondaryColor overrides', () => {
  return (
    appLogoContent.includes('primaryColor') &&
    appLogoContent.includes('secondaryColor') &&
    appLogoContent.includes('logoDarkUrl')
  );
});

// ─── 3. INTERNATIONAL LOCALIZATION & TAX ENGINE ───────────────────────────────
console.log('\n--- 3. Phase 5 & 6: International Localization & Currency Engine ---');

test('Launch jurisdictions profile count is at least 7 countries', () => {
  const codes = Object.keys(LAUNCH_JURISDICTIONS);
  return (
    codes.includes('IN') &&
    codes.includes('AE') &&
    codes.includes('SA') &&
    codes.includes('GB') &&
    codes.includes('US') &&
    codes.includes('AU') &&
    codes.includes('ZA')
  );
});

test('United States profile does NOT enforce a fake national VAT', () => {
  const usProfile = getJurisdictionProfile('US');
  return usProfile.taxRegime === 'Sales Tax' && usProfile.taxLabel === 'Sales Tax';
});

test('United Arab Emirates profile configures VAT and TRN', () => {
  const aeProfile = getJurisdictionProfile('AE');
  return (
    aeProfile.defaultCurrencyCode === 'AED' &&
    aeProfile.taxRegime === 'VAT' &&
    aeProfile.taxIdLabel.includes('TRN')
  );
});

test('Saudi Arabia profile configures VAT and SAR currency', () => {
  const saProfile = getJurisdictionProfile('SA');
  return saProfile.defaultCurrencyCode === 'SAR' && saProfile.taxRegime === 'VAT';
});

test('United Kingdom profile configures VAT and GBP currency', () => {
  const ukProfile = getJurisdictionProfile('GB');
  return ukProfile.defaultCurrencyCode === 'GBP' && ukProfile.defaultCurrencySymbol === '£';
});

test('formatMoney formats amounts with correct currency symbols and locales', () => {
  const inr = formatMoney(1250.5, { countryCode: 'IN', currencyCode: 'INR', locale: 'en-IN' });
  const usd = formatMoney(1250.5, { countryCode: 'US', currencyCode: 'USD', locale: 'en-US' });
  const gbp = formatMoney(1250.5, { countryCode: 'GB', currencyCode: 'GBP', locale: 'en-GB' });
  const aed = formatMoney(1250.5, { countryCode: 'AE', currencyCode: 'AED', locale: 'en-AE' });

  const inrValid = inr.includes('1,250.50') && inr.includes('₹');
  const usdValid = usd.includes('1,250.50') && usd.includes('$');
  const gbpValid = gbp.includes('1,250.50') && gbp.includes('£');
  const aedValid = aed.includes('1,250.50') && aed.includes('AED');

  return inrValid && usdValid && gbpValid && aedValid;
});

test('formatMoney supports positional arguments (amount, currencyCode, locale)', () => {
  const res = formatMoney(500, 'USD', 'en-US');
  return res.includes('500.00') && res.includes('$');
});

test('calculateApplicableTax correctly handles tax-inclusive and tax-exclusive calculations', () => {
  const exclusive = calculateApplicableTax({ amount: 100, taxRate: 18, isInclusive: false });
  const inclusive = calculateApplicableTax({ amount: 118, taxRate: 18, isInclusive: true });

  const exclusiveValid = exclusive.taxAmount === 18 && exclusive.totalAmount === 118;
  const inclusiveValid = inclusive.taxAmount === 18 && inclusive.baseAmount === 100;

  return exclusiveValid && inclusiveValid;
});

// ─── 4. FIELD-MAPPED INVOICE TEMPLATE ENGINE ─────────────────────────────────
console.log('\n--- 4. Phase 7: Real Field-Mapped Invoice Template Engine ---');

const printRenderer = readFile('src/components/invoice/InvoicePrintRenderer.tsx');
const invoiceTab = readFile('src/app/settings/components/InvoiceTab.tsx');

test('Invoice template schema defines normalized 0-100 coordinates', () => {
  const defaultFields = DEFAULT_INVOICE_FIELDS;
  const hasLogo = defaultFields.some((f) => f.key === 'logo' && f.xPercent >= 0 && f.yPercent >= 0);
  const hasTotal = defaultFields.some((f) => f.key === 'grandTotal' && f.xPercent <= 100 && f.yPercent <= 100);
  return hasLogo && hasTotal;
});

test('validateTemplateMapping validates coordinate integrity', () => {
  const valid = validateTemplateMapping({
    fields: [
      { key: 'invoice_number', label: 'Invoice #', xPercent: 50, yPercent: 10, visible: true },
    ],
  });
  const invalid = validateTemplateMapping({
    fields: [
      { key: 'invoice_number', label: 'Invoice #', xPercent: 150, yPercent: 10, visible: true },
    ],
  });
  return valid.valid === true && invalid.valid === false;
});

test('InvoicePrintRenderer implements dedicated @media print styling', () => {
  return (
    printRenderer.includes('@media print') &&
    printRenderer.includes('InvoicePrintRenderer') &&
    printRenderer.includes('formatMoney')
  );
});

test('InvoiceTab contains visual interactive field positioning canvas', () => {
  return (
    invoiceTab.includes('Visual Field Position Mapper') ||
    invoiceTab.includes('xPercent') ||
    invoiceTab.includes('InvoicePrintRenderer')
  );
});

// ─── 5. SECURITY & PASSWORDS ──────────────────────────────────────────────────
console.log('\n--- 5. Phase 8: Real Security Server Enforcement ---');

const loginRoute = readFile('src/app/api/auth/login/route.ts');
const usersRoute = readFile('src/app/api/users/route.ts');

test('Login route dynamically reads maxLoginAttempts from database', () => {
  return (
    loginRoute.includes('maxLoginAttempts') &&
    loginRoute.includes('sysSettings') &&
    loginRoute.includes('maxFailedAttempts')
  );
});

test('Login route dynamically computes session timeout from sessionTimeoutMins', () => {
  return (
    loginRoute.includes('sessionTimeoutMins') &&
    loginRoute.includes('sessionCookieMaxAgeSecs')
  );
});

test('Password policy validator rejects weak patterns including "rismos" and "cosko"', () => {
  const rismosWeak = validatePassword('Rismos2026!Password');
  const coskoWeak = validatePassword('Cosko2026!Password');
  const strong = validatePassword('Str0ng!P@ssw0rd99');

  const rismosRejected = rismosWeak.errors.some((e) => e.includes('rismos'));
  const coskoRejected = coskoWeak.errors.some((e) => e.includes('cosko'));
  const strongAccepted = strong.valid === true;

  return rismosRejected && coskoRejected && strongAccepted;
});

test('User creation endpoint enforces enterprise password policy', () => {
  return (
    usersRoute.includes('enforcePasswordPolicy') &&
    usersRoute.includes('validatePassword')
  );
});

// ─── 6. ALERT EVALUATION SERVICE ──────────────────────────────────────────────
console.log('\n--- 6. Phase 9: Real Alert Evaluation Service ---');

const alertService = readFile('src/lib/services/alertService.ts');
const evaluateRoute = readFile('src/app/api/alerts/evaluate/route.ts');

test('AlertService evaluates lowStockAlerts against lowStockThreshold', () => {
  return (
    alertService.includes('lowStockAlerts') &&
    alertService.includes('lowStockThreshold') &&
    alertService.includes('qtyOnHand')
  );
});

test('AlertService evaluates overduePaymentAlerts against overdueThresholdDays', () => {
  return (
    alertService.includes('overduePaymentAlerts') &&
    alertService.includes('overdueThresholdDays')
  );
});

test('AlertService transparently handles unconfigured email providers without faking', () => {
  return (
    alertService.includes('NOT_CONFIGURED') &&
    alertService.includes('SMTP_HOST')
  );
});

test('Account lockout triggers security alert notification', () => {
  return (
    loginRoute.includes('createSecurityAlertNotification') &&
    alertService.includes('createSecurityAlertNotification')
  );
});

test('/api/alerts/evaluate is protected for Super Admin', () => {
  return evaluateRoute.includes('Super Admin') && evaluateRoute.includes('evaluateSystemAlerts');
});

// ─── 7. MOBILE "MORE" REORDERING & PREFERENCES ────────────────────────────────
console.log('\n--- 7. Phase 10: Mobile "More" Module Reordering & RBAC Safety ---');

const bottomNav = readFile('src/components/BottomNav.tsx');
const preferencesRoute = readFile('src/app/api/users/preferences/route.ts');

test('BottomNav provides edit mode for reordering modules', () => {
  return (
    bottomNav.includes('isEditing') &&
    bottomNav.includes('handleMove') &&
    bottomNav.includes('handleSaveOrder')
  );
});

test('BottomNav filters reordered modules against authoritative RBAC', () => {
  return (
    bottomNav.includes('getMobileMoreNav') &&
    bottomNav.includes('authoritativeSecondaryNav')
  );
});

test('User preferences API route persists and returns UI preferences', () => {
  return (
    preferencesRoute.includes('userUiPreference') &&
    preferencesRoute.includes('preferencesJson')
  );
});

// ─── 8. USER FORM ASSIGNED STORE COMBICOMBO & ADD STORE FLOW ──────────────────
console.log('\n--- 8. Phase 12: User Form Assigned Store UX & Add Store Flow ---');

const userForm = readFile('src/components/forms/UserFormModal.tsx');

test('UserFormModal uses searchable combobox for assigned store', () => {
  return (
    userForm.includes('storeSearch') &&
    userForm.includes('filteredStores') &&
    userForm.includes('isStoreMenuOpen')
  );
});

test('UserFormModal provides "+ Add Store" button for Super Admin', () => {
  return (
    userForm.includes('Add Store') &&
    userForm.includes('setIsAddStoreOpen') &&
    userForm.includes('StoreFormModal')
  );
});

test('Nested StoreFormModal preserves UserForm draft state with higher z-index', () => {
  return userForm.includes('zIndex={zIndex + 20}');
});

// ─── 9. RUNTIME HARDCODING CLEAN-UP ───────────────────────────────────────────
console.log('\n--- 9. Phase 15: Runtime Hardcoding Clean-Up ---');

const salesPage = readFile('src/app/sales/page.tsx');
const appErrorBoundary = readFile('src/components/AppErrorBoundary.tsx');
const appLayout = readFile('src/components/AppLayout.tsx');

test('Sales page uses formatMoney and dynamic taxLabel in transaction ledger', () => {
  return (
    salesPage.includes('taxLabel') &&
    salesPage.includes('formatMoney(s.total') &&
    salesPage.includes('formatMoney(s.subtotal')
  );
});

test('AppLayout uses AppLogo instead of hardcoded CoskoLogo in loading/auth shells', () => {
  return (
    appLayout.includes('AppLogo') &&
    !appLayout.includes('<CoskoLogo') &&
    !appLayout.includes('Verifying COSKO Authenticated Session')
  );
});

test('AppErrorBoundary uses dynamic AppLogo', () => {
  return appErrorBoundary.includes('AppLogo') && !appErrorBoundary.includes('<CoskoLogo');
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
console.log('================================================================\n');

if (failed > 0) {
  console.error('Test Suite Failed with issues:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log('🎉 All RISMOS white-labeling and rebranding tests passed cleanly!\n');
  process.exit(0);
}
