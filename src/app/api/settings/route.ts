import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';
import { ensureStoredImage } from '@/lib/objectStorage';
import { DEFAULT_BRANDING, invalidateBrandingCache } from '@/lib/branding';
import { getJurisdictionProfile, LAUNCH_JURISDICTIONS } from '@/lib/localization/jurisdictions';

const BRANDING_ID = 'cosko_branding_config';
const SYSTEM_SETTINGS_ID = 'cosko_system_config';

// GSTIN validation regex: 2-digit state code + 10-char PAN + 1 entity + Z + 1 checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z0-9A-Z]{1}[0-9A-Z]{1}$/;

const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/**
 * Ensures branding row exists, returns it
 */
async function getOrCreateBranding(): Promise<any> {
  let setting: any = await (prisma as any).brandingSetting.findUnique({ where: { id: BRANDING_ID } });
  if (!setting) {
    setting = await (prisma as any).brandingSetting.create({
      data: {
        id: BRANDING_ID,
        appName: DEFAULT_BRANDING.appName,
        tagline: DEFAULT_BRANDING.tagline,
        supportEmail: DEFAULT_BRANDING.supportEmail,
        primaryColor: DEFAULT_BRANDING.primaryColor,
        secondaryColor: DEFAULT_BRANDING.secondaryColor,
        accentColor: DEFAULT_BRANDING.accentColor,
        country: DEFAULT_BRANDING.country,
        countryCode: DEFAULT_BRANDING.countryCode,
        timezone: DEFAULT_BRANDING.timezone,
        locale: DEFAULT_BRANDING.locale,
        logoUrl: null,
        faviconUrl: null,
      },
    });
  }
  return setting;
}

/**
 * Ensures system settings row exists, returns it
 */
async function getOrCreateSystemSettings() {
  let settings = await (prisma as any).systemSettings.findUnique({
    where: { id: SYSTEM_SETTINGS_ID },
  });
  if (!settings) {
    settings = await (prisma as any).systemSettings.create({
      data: {
        id: SYSTEM_SETTINGS_ID,
        invoiceHeader: 'RISMOS Retail Enterprise',
      },
    });
  }
  return settings;
}

/**
 * Logs a settings change to the audit log
 */
async function logSettingsAudit(
  section: string,
  action: string,
  details: string,
  user: { email: string; role: string; store?: string }
) {
  try {
    await prisma.auditLog.create({
      data: {
        module: 'Settings',
        action: `${section.toUpperCase()}_${action}`,
        details,
        userEmail: user.email,
        userRole: user.role,
        storeCode: user.store || 'CENTRAL',
      },
    });
  } catch (err) {
    console.error('Failed to write settings audit log:', err);
  }
}

let cachedSettingsPayload: any = null;
let lastSettingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30_000;

function invalidateSettingsCache() {
  cachedSettingsPayload = null;
  lastSettingsCacheTime = 0;
  invalidateBrandingCache();
}

/**
 * GET /api/settings - Retrieve all settings (branding + system) from MySQL
 * REQUIRES: Authenticated Super Admin — contains GSTIN, tax, and security config
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;
    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can access system settings' },
        { status: 403 }
      );
    }

    const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
    if (
      !forceFresh &&
      cachedSettingsPayload &&
      Date.now() - lastSettingsCacheTime < SETTINGS_CACHE_TTL
    ) {
      return NextResponse.json(cachedSettingsPayload, {
        headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
      });
    }

    const [branding, systemSettings] = await Promise.all([
      getOrCreateBranding(),
      getOrCreateSystemSettings(),
    ]);

    const payload = {
      success: true,
      branding: {
        appName: branding.appName || DEFAULT_BRANDING.appName,
        tagline: branding.tagline || DEFAULT_BRANDING.tagline,
        supportEmail: branding.supportEmail || DEFAULT_BRANDING.supportEmail,
        supportPhone: (branding as any).supportPhone || null,
        logoUrl: branding.logoUrl,
        logoDarkUrl: (branding as any).logoDarkUrl || null,
        appIconUrl: (branding as any).appIconUrl || null,
        faviconUrl: branding.faviconUrl,
        primaryColor: (branding as any).primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: (branding as any).secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: (branding as any).accentColor || DEFAULT_BRANDING.accentColor,
        businessName: (branding as any).businessName || null,
        businessAddress: (branding as any).businessAddress || null,
        city: (branding as any).city || null,
        state: (branding as any).state || null,
        pincode: (branding as any).pincode || null,
        country: (branding as any).country || 'India',
        countryCode: (branding as any).countryCode || 'IN',
        timezone: (branding as any).timezone || 'Asia/Kolkata',
        locale: (branding as any).locale || 'en-IN',
        baseCurrency: (branding as any).baseCurrency || 'INR (₹)',
        updatedAt: branding.updatedAt,
      },
      systemSettings: {
        // International Jurisdiction & Tax
        countryCode: (systemSettings as any).countryCode || 'IN',
        currencyCode: (systemSettings as any).currencyCode || 'INR',
        currencySymbol: (systemSettings as any).currencySymbol || '₹',
        taxRegime: (systemSettings as any).taxRegime || 'GST',
        taxInclusivePricing: Boolean((systemSettings as any).taxInclusivePricing),
        taxRegistrationNumber: (systemSettings as any).taxRegistrationNumber || systemSettings.gstin,
        taxJurisdictionState: (systemSettings as any).taxJurisdictionState || systemSettings.gstState,
        jurisdictionConfig: (systemSettings as any).jurisdictionConfig || null,
        taxConfigVersion: Number((systemSettings as any).taxConfigVersion) || 1,
        // Legacy GST Explicit Fields
        gstin: systemSettings.gstin,
        legalBusinessName: systemSettings.legalBusinessName,
        tradeName: systemSettings.tradeName,
        gstState: systemSettings.gstState,
        gstStateCode: systemSettings.gstStateCode,
        gstRegistrationType: systemSettings.gstRegistrationType,
        defaultTaxRate: Number(systemSettings.defaultTaxRate),
        hsnMandatory: systemSettings.hsnMandatory,
        enableReverseCharge: systemSettings.enableReverseCharge,
        gstBusinessAddress: systemSettings.gstBusinessAddress,
        // Invoice
        invoiceHeader: systemSettings.invoiceHeader || 'RISMOS Retail Enterprise',
        invoiceFooter: systemSettings.invoiceFooter,
        invoiceTerms: systemSettings.invoiceTerms,
        invoiceAccentColor: systemSettings.invoiceAccentColor,
        watermarkOpacity: systemSettings.watermarkOpacity,
        showStoreAddress: systemSettings.showStoreAddress,
        invoiceTemplateUrl: systemSettings.invoiceTemplateUrl,
        invoiceTemplateVersion: systemSettings.invoiceTemplateVersion,
        invoiceFieldMapping: systemSettings.invoiceFieldMapping,
        showPaymentQr: systemSettings.showPaymentQr,
        paymentUpiId: systemSettings.paymentUpiId,
        paymentBankDetails: systemSettings.paymentBankDetails,
        // Security
        sessionTimeoutMins: systemSettings.sessionTimeoutMins,
        maxLoginAttempts: systemSettings.maxLoginAttempts,
        enforcePasswordPolicy: systemSettings.enforcePasswordPolicy,
        sensitiveActionConfirm: systemSettings.sensitiveActionConfirm,
        // Alerts
        lowStockAlerts: systemSettings.lowStockAlerts,
        lowStockThreshold: systemSettings.lowStockThreshold,
        overduePaymentAlerts: systemSettings.overduePaymentAlerts,
        overdueThresholdDays: systemSettings.overdueThresholdDays,
        dailySalesDigest: systemSettings.dailySalesDigest,
        securityEventAlerts: systemSettings.securityEventAlerts,
        alertRecipientEmails: systemSettings.alertRecipientEmails,
        updatedAt: systemSettings.updatedAt,
      },
    };

    cachedSettingsPayload = payload;
    lastSettingsCacheTime = Date.now();

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('API /api/settings GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve system settings' }, { status: 500 });
  }
}

/**
 * POST /api/settings - Save settings by section
 * Body: { section: 'branding' | 'profile' | 'tax' | 'invoice' | 'security' | 'alerts', data: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can modify system settings' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { section, data } = body;

    if (!section || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: section and data' },
        { status: 400 }
      );
    }

    invalidateSettingsCache();

    // ────────────────────────────────────────────
    // SECTION: branding
    // ────────────────────────────────────────────
    if (section === 'branding') {
      const updateData: any = {};
      if (data.appName !== undefined)
        updateData.appName = String(data.appName).trim().slice(0, 128) || DEFAULT_BRANDING.appName;
      if (data.tagline !== undefined)
        updateData.tagline = String(data.tagline).trim().slice(0, 255);
      if (data.supportEmail !== undefined) {
        const email = String(data.supportEmail).trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return NextResponse.json({ error: 'Invalid support email format' }, { status: 400 });
        }
        updateData.supportEmail = email || DEFAULT_BRANDING.supportEmail;
      }
      if (data.supportPhone !== undefined) {
        updateData.supportPhone = data.supportPhone ? String(data.supportPhone).trim().slice(0, 32) : null;
      }
      if (data.businessName !== undefined) {
        updateData.businessName = data.businessName ? String(data.businessName).trim().slice(0, 255) : null;
      }
      if (data.primaryColor !== undefined) {
        updateData.primaryColor = String(data.primaryColor).trim().slice(0, 32);
      }
      if (data.secondaryColor !== undefined) {
        updateData.secondaryColor = String(data.secondaryColor).trim().slice(0, 32);
      }
      if (data.accentColor !== undefined) {
        updateData.accentColor = String(data.accentColor).trim().slice(0, 32);
      }
      if (data.logoUrl !== undefined) {
        updateData.logoUrl = data.logoUrl ? await ensureStoredImage(data.logoUrl, 'branding', user.name) : null;
      }
      if (data.logoDarkUrl !== undefined) {
        updateData.logoDarkUrl = data.logoDarkUrl ? await ensureStoredImage(data.logoDarkUrl, 'branding', user.name) : null;
      }
      if (data.appIconUrl !== undefined) {
        updateData.appIconUrl = data.appIconUrl ? await ensureStoredImage(data.appIconUrl, 'branding', user.name) : null;
      }
      if (data.faviconUrl !== undefined) {
        updateData.faviconUrl = data.faviconUrl ? await ensureStoredImage(data.faviconUrl, 'branding', user.name) : null;
      }

      const updated = await prisma.brandingSetting.upsert({
        where: { id: BRANDING_ID },
        create: { id: BRANDING_ID, ...updateData },
        update: updateData,
      });

      await logSettingsAudit(
        'BRANDING',
        'UPDATED',
        `Updated branding: ${Object.keys(updateData).join(', ')}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'BRANDING_UPDATED', {
        appName: updated.appName,
        tagline: updated.tagline,
        logoUrl: updated.logoUrl,
        primaryColor: (updated as any).primaryColor,
        secondaryColor: (updated as any).secondaryColor,
      });

      return NextResponse.json({
        success: true,
        branding: updated,
        message: 'Branding settings saved successfully',
      });
    }

    // ────────────────────────────────────────────
    // SECTION: profile (business profile in branding table & jurisdiction sync)
    // ────────────────────────────────────────────
    if (section === 'profile') {
      const updateData: any = {};
      if (data.businessName !== undefined)
        updateData.businessName = String(data.businessName).trim().slice(0, 255);
      if (data.supportEmail !== undefined) {
        const email = String(data.supportEmail).trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return NextResponse.json({ error: 'Invalid support email format' }, { status: 400 });
        }
        updateData.supportEmail = email;
      }
      if (data.supportPhone !== undefined)
        updateData.supportPhone = String(data.supportPhone).trim().slice(0, 32);
      if (data.businessAddress !== undefined)
        updateData.businessAddress = String(data.businessAddress).trim();
      if (data.city !== undefined) updateData.city = String(data.city).trim().slice(0, 64);
      if (data.state !== undefined) updateData.state = String(data.state).trim().slice(0, 64);
      if (data.pincode !== undefined) {
        updateData.pincode = String(data.pincode).trim().slice(0, 32);
      }

      // Authoritative Single Jurisdiction Sync
      let jurProfile = null;
      if (data.countryCode || data.country) {
        const targetCode = String(data.countryCode || 'IN').trim().toUpperCase().slice(0, 8);
        jurProfile = getJurisdictionProfile(targetCode);
        updateData.countryCode = jurProfile.countryCode;
        updateData.country = data.country ? String(data.country).trim().slice(0, 64) : jurProfile.countryName;
        updateData.timezone = data.timezone ? String(data.timezone).trim().slice(0, 64) : jurProfile.defaultTimezone;
        updateData.locale = data.locale ? String(data.locale).trim().slice(0, 16) : jurProfile.defaultLocale;
        updateData.baseCurrency = `${jurProfile.defaultCurrencyCode} (${jurProfile.defaultCurrencySymbol})`;
      } else {
        if (data.timezone !== undefined) updateData.timezone = String(data.timezone).trim().slice(0, 64);
        if (data.locale !== undefined) updateData.locale = String(data.locale).trim().slice(0, 16);
        if (data.baseCurrency !== undefined) updateData.baseCurrency = String(data.baseCurrency).trim().slice(0, 32);
      }

      const updated = await prisma.brandingSetting.upsert({
        where: { id: BRANDING_ID },
        create: { id: BRANDING_ID, ...updateData },
        update: updateData,
      });

      // Synchronize systemSettings jurisdiction in lockstep
      if (jurProfile) {
        await (prisma as any).systemSettings.upsert({
          where: { id: SYSTEM_SETTINGS_ID },
          create: {
            id: SYSTEM_SETTINGS_ID,
            countryCode: jurProfile.countryCode,
            currencyCode: jurProfile.defaultCurrencyCode,
            currencySymbol: jurProfile.defaultCurrencySymbol,
            taxRegime: jurProfile.taxRegime,
            defaultTaxRate: jurProfile.defaultTaxRate,
          },
          update: {
            countryCode: jurProfile.countryCode,
            currencyCode: jurProfile.defaultCurrencyCode,
            currencySymbol: jurProfile.defaultCurrencySymbol,
            taxRegime: jurProfile.taxRegime,
          },
        });
      }

      await logSettingsAudit(
        'PROFILE',
        'UPDATED',
        `Updated business profile & synchronized jurisdiction: ${Object.keys(updateData).join(', ')}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'PROFILE_UPDATED', {
        businessName: updated.businessName,
        countryCode: (updated as any).countryCode,
        currencyCode: jurProfile?.defaultCurrencyCode,
      });

      return NextResponse.json({
        success: true,
        branding: updated,
        message: 'Business profile saved successfully',
      });
    }


    // ────────────────────────────────────────────
    // SECTION: tax
    // ────────────────────────────────────────────
    if (section === 'tax') {
      const updateData: any = {};
      const targetCountryCode = (data.countryCode || 'IN').toUpperCase().trim();
      updateData.countryCode = targetCountryCode;

      // Automatically sync currency and tax regime from jurisdiction if not explicit
      const jurProfile = getJurisdictionProfile(targetCountryCode);
      updateData.currencyCode = data.currencyCode || jurProfile.defaultCurrencyCode;
      updateData.currencySymbol = data.currencySymbol || jurProfile.defaultCurrencySymbol;
      updateData.taxRegime = data.taxRegime || jurProfile.taxRegime;

      if (data.taxInclusivePricing !== undefined) {
        updateData.taxInclusivePricing = Boolean(data.taxInclusivePricing);
      }

      if (data.taxRegistrationNumber !== undefined) {
        updateData.taxRegistrationNumber = String(data.taxRegistrationNumber).trim().slice(0, 64);
      }

      if (data.taxJurisdictionState !== undefined) {
        updateData.taxJurisdictionState = String(data.taxJurisdictionState).trim().slice(0, 64);
      }

      if (data.jurisdictionConfig !== undefined) {
        updateData.jurisdictionConfig =
          typeof data.jurisdictionConfig === 'string'
            ? data.jurisdictionConfig
            : JSON.stringify(data.jurisdictionConfig);
      }

      // GSTIN Validation (Strict only for India when GSTIN is provided)
      if (targetCountryCode === 'IN') {
        const gstinInput = data.gstin || data.taxRegistrationNumber;
        if (gstinInput !== undefined) {
          const gstin = String(gstinInput).trim().toUpperCase();
          if (gstin && !GSTIN_REGEX.test(gstin)) {
            return NextResponse.json(
              {
                error:
                  'Invalid GSTIN format. Must be 15 characters: 2-digit state code + PAN + entity number + Z + checksum (e.g. 29AABCU9603R1ZM)',
              },
              { status: 400 }
            );
          }
          updateData.gstin = gstin || null;
          updateData.taxRegistrationNumber = gstin || null;

          if (gstin) {
            const stateCode = gstin.substring(0, 2);
            const stateName = INDIAN_STATES[stateCode];
            if (stateName) {
              updateData.gstState = stateName;
              updateData.gstStateCode = stateCode;
              updateData.taxJurisdictionState = stateName;
            }
          }
        }
      } else {
        // Non-India country: tax registration number is saved as general tax number
        if (data.taxRegistrationNumber !== undefined || data.gstin !== undefined) {
          const regNum = String(data.taxRegistrationNumber || data.gstin || '').trim();
          updateData.taxRegistrationNumber = regNum || null;
          updateData.gstin = regNum || null;
        }
      }

      if (data.legalBusinessName !== undefined)
        updateData.legalBusinessName = String(data.legalBusinessName).trim().slice(0, 255);
      if (data.tradeName !== undefined)
        updateData.tradeName = String(data.tradeName).trim().slice(0, 255);
      if (data.gstState !== undefined)
        updateData.gstState = String(data.gstState).trim().slice(0, 64);
      if (data.gstStateCode !== undefined)
        updateData.gstStateCode = String(data.gstStateCode).trim().slice(0, 16);
      if (data.gstRegistrationType !== undefined)
        updateData.gstRegistrationType = String(data.gstRegistrationType).trim().slice(0, 32);

      if (data.defaultTaxRate !== undefined) {
        const rate = Number(data.defaultTaxRate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ error: 'Tax rate must be between 0 and 100%' }, { status: 400 });
        }
        updateData.defaultTaxRate = rate;
      }
      if (data.hsnMandatory !== undefined) updateData.hsnMandatory = Boolean(data.hsnMandatory);
      if (data.enableReverseCharge !== undefined)
        updateData.enableReverseCharge = Boolean(data.enableReverseCharge);
      if (data.gstBusinessAddress !== undefined)
        updateData.gstBusinessAddress = String(data.gstBusinessAddress).trim();

      // Increment version for audit trail
      const current = await (prisma as any).systemSettings.findUnique({
        where: { id: SYSTEM_SETTINGS_ID },
      });
      updateData.taxConfigVersion = ((current as any)?.taxConfigVersion || 1) + 1;

      const updated = await (prisma as any).systemSettings.upsert({
        where: { id: SYSTEM_SETTINGS_ID },
        create: { id: SYSTEM_SETTINGS_ID, ...updateData },
        update: updateData,
      });

      // Synchronize branding table country/currency in lockstep
      await (prisma as any).brandingSetting.upsert({
        where: { id: BRANDING_ID },
        create: {
          id: BRANDING_ID,
          appName: DEFAULT_BRANDING.appName,
          country: jurProfile.countryName,
          countryCode: jurProfile.countryCode,
          timezone: jurProfile.defaultTimezone,
          locale: jurProfile.defaultLocale,
          baseCurrency: `${jurProfile.defaultCurrencyCode} (${jurProfile.defaultCurrencySymbol})`,
        },
        update: {
          country: jurProfile.countryName,
          countryCode: jurProfile.countryCode,
          timezone: jurProfile.defaultTimezone,
          locale: jurProfile.defaultLocale,
          baseCurrency: `${jurProfile.defaultCurrencyCode} (${jurProfile.defaultCurrencySymbol})`,
        },
      });

      await logSettingsAudit(
        'TAX',
        'UPDATED',
        `Updated Tax/Jurisdiction (${targetCountryCode}) config v${updateData.taxConfigVersion}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'TAX_UPDATED', {
        countryCode: targetCountryCode,
        currencyCode: updateData.currencyCode,
        currencySymbol: updateData.currencySymbol,
        taxRegime: updateData.taxRegime,
        defaultTaxRate: updateData.defaultTaxRate,
      });

      return NextResponse.json({
        success: true,
        systemSettings: updated,
        message: `${jurProfile.countryName} (${jurProfile.taxLabel}) settings saved successfully`,
      });
    }

    // ────────────────────────────────────────────
    // SECTION: invoice
    // ────────────────────────────────────────────
    if (section === 'invoice') {
      const updateData: any = {};
      if (data.invoiceHeader !== undefined)
        updateData.invoiceHeader = String(data.invoiceHeader).trim().slice(0, 255);
      if (data.invoiceFooter !== undefined)
        updateData.invoiceFooter = String(data.invoiceFooter).trim().slice(0, 500);
      if (data.invoiceTerms !== undefined)
        updateData.invoiceTerms = String(data.invoiceTerms).trim();
      if (data.invoiceAccentColor !== undefined) {
        const validColors = ['primary', 'emerald', 'navy', 'amber', 'slate', 'rose'];
        updateData.invoiceAccentColor = validColors.includes(data.invoiceAccentColor)
          ? data.invoiceAccentColor
          : 'primary';
      }
      if (data.watermarkOpacity !== undefined) {
        const opacity = Math.max(0, Math.min(20, Number(data.watermarkOpacity) || 5));
        updateData.watermarkOpacity = opacity;
      }
      if (data.showStoreAddress !== undefined)
        updateData.showStoreAddress = Boolean(data.showStoreAddress);
      if (data.invoiceTemplateUrl !== undefined)
        updateData.invoiceTemplateUrl = data.invoiceTemplateUrl
          ? await ensureStoredImage(data.invoiceTemplateUrl, 'branding', user.name)
          : null;
      if (data.invoiceFieldMapping !== undefined)
        updateData.invoiceFieldMapping =
          typeof data.invoiceFieldMapping === 'string'
            ? data.invoiceFieldMapping
            : JSON.stringify(data.invoiceFieldMapping);
      if (data.showPaymentQr !== undefined) updateData.showPaymentQr = Boolean(data.showPaymentQr);
      if (data.paymentUpiId !== undefined)
        updateData.paymentUpiId = String(data.paymentUpiId).trim().slice(0, 128);
      if (data.paymentBankDetails !== undefined)
        updateData.paymentBankDetails = String(data.paymentBankDetails).trim();

      // Increment template version if template or mapping changed
      if (data.invoiceTemplateUrl !== undefined || data.invoiceFieldMapping !== undefined) {
        const current = await (prisma as any).systemSettings.findUnique({
          where: { id: SYSTEM_SETTINGS_ID },
        });
        updateData.invoiceTemplateVersion = ((current as any)?.invoiceTemplateVersion || 0) + 1;
      }

      const updated = await (prisma as any).systemSettings.upsert({
        where: { id: SYSTEM_SETTINGS_ID },
        create: { id: SYSTEM_SETTINGS_ID, ...updateData },
        update: updateData,
      });

      await logSettingsAudit(
        'INVOICE',
        'UPDATED',
        `Updated invoice template settings: ${Object.keys(updateData).join(', ')}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'INVOICE_UPDATED', {
        invoiceTemplateVersion: (updated as any).invoiceTemplateVersion,
      });

      return NextResponse.json({
        success: true,
        systemSettings: updated,
        message: 'Invoice template settings saved successfully',
      });
    }

    // ────────────────────────────────────────────
    // SECTION: security
    // ────────────────────────────────────────────
    if (section === 'security') {
      const updateData: any = {};
      if (data.sessionTimeoutMins !== undefined) {
        const timeout = Math.max(5, Math.min(43200, Number(data.sessionTimeoutMins) || 43200));
        updateData.sessionTimeoutMins = timeout;
      }
      if (data.maxLoginAttempts !== undefined) {
        const attempts = Math.max(3, Math.min(20, Number(data.maxLoginAttempts) || 5));
        updateData.maxLoginAttempts = attempts;
      }
      if (data.enforcePasswordPolicy !== undefined)
        updateData.enforcePasswordPolicy = Boolean(data.enforcePasswordPolicy);
      if (data.sensitiveActionConfirm !== undefined)
        updateData.sensitiveActionConfirm = Boolean(data.sensitiveActionConfirm);

      const updated = await (prisma as any).systemSettings.upsert({
        where: { id: SYSTEM_SETTINGS_ID },
        create: { id: SYSTEM_SETTINGS_ID, ...updateData },
        update: updateData,
      });

      await logSettingsAudit(
        'SECURITY',
        'UPDATED',
        `Updated security settings: ${Object.keys(updateData).join(', ')}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'SECURITY_UPDATED', {
        sessionTimeoutMins: (updated as any).sessionTimeoutMins,
        maxLoginAttempts: (updated as any).maxLoginAttempts,
      });

      return NextResponse.json({
        success: true,
        systemSettings: updated,
        message: 'Security settings saved successfully',
      });
    }

    // ────────────────────────────────────────────
    // SECTION: alerts
    // ────────────────────────────────────────────
    if (section === 'alerts') {
      const updateData: any = {};
      if (data.lowStockAlerts !== undefined)
        updateData.lowStockAlerts = Boolean(data.lowStockAlerts);
      if (data.lowStockThreshold !== undefined) {
        const threshold = Math.max(1, Math.min(1000, Number(data.lowStockThreshold) || 5));
        updateData.lowStockThreshold = threshold;
      }
      if (data.overduePaymentAlerts !== undefined)
        updateData.overduePaymentAlerts = Boolean(data.overduePaymentAlerts);
      if (data.overdueThresholdDays !== undefined) {
        const days = Math.max(1, Math.min(365, Number(data.overdueThresholdDays) || 30));
        updateData.overdueThresholdDays = days;
      }
      if (data.dailySalesDigest !== undefined)
        updateData.dailySalesDigest = Boolean(data.dailySalesDigest);
      if (data.securityEventAlerts !== undefined)
        updateData.securityEventAlerts = Boolean(data.securityEventAlerts);
      if (data.alertRecipientEmails !== undefined) {
        const emails = String(data.alertRecipientEmails).trim();
        if (emails) {
          const emailList = emails.split(',').map((e: string) => e.trim());
          const invalidEmails = emailList.filter(
            (e: string) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
          );
          if (invalidEmails.length > 0) {
            return NextResponse.json(
              { error: `Invalid email addresses: ${invalidEmails.join(', ')}` },
              { status: 400 }
            );
          }
        }
        updateData.alertRecipientEmails = emails || null;
      }

      const updated = await (prisma as any).systemSettings.upsert({
        where: { id: SYSTEM_SETTINGS_ID },
        create: { id: SYSTEM_SETTINGS_ID, ...updateData },
        update: updateData,
      });

      await logSettingsAudit(
        'ALERTS',
        'UPDATED',
        `Updated alert settings: ${Object.keys(updateData).join(', ')}`,
        user as any
      );

      await broadcastRealtimeEvent('settings', 'ALERTS_UPDATED', {
        lowStockAlerts: (updated as any).lowStockAlerts,
        overduePaymentAlerts: (updated as any).overduePaymentAlerts,
      });

      return NextResponse.json({
        success: true,
        systemSettings: updated,
        message: 'Alert settings saved successfully',
      });
    }

    return NextResponse.json({ error: `Unknown settings section: "${section}"` }, { status: 400 });
  } catch (error: any) {
    console.error('API /api/settings POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update system settings' },
      { status: 500 }
    );
  }
}
