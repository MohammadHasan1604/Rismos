'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { useApp, PaymentMethodItem } from '@/context/AppContext';
import { toast } from 'sonner';
import PaymentMethodModal from '@/components/forms/PaymentMethodModal';
import SuperAdminGuard from '@/components/SuperAdminGuard';
import { StorageService } from '@/lib/storageService';

import { BrandingTab, BrandingUploadStatus } from './components/BrandingTab';
import { ProfileTab } from './components/ProfileTab';
import { TaxTab } from './components/TaxTab';
import { InvoiceTab } from './components/InvoiceTab';
import { SecurityTab } from './components/SecurityTab';
import { AlertsTab } from './components/AlertsTab';
import { PaymentMethodsTab } from './components/PaymentMethodsTab';

import { LAUNCH_JURISDICTIONS } from '@/lib/localization/jurisdictions';

// GSTIN Regex: 2 digit state code + 10-char PAN + 1 entity code + Z + 1 checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function getInitialTaxRegistrationNumber(settings: any): string {
  if (!settings) return '';
  const code = settings.countryCode || 'IN';
  if (code === 'IN') {
    return settings.taxRegistrationNumber || settings.gstin || '';
  }
  // For UAE and other non-India jurisdictions: never populate with old Indian GSTIN
  const raw = settings.taxRegistrationNumber || '';
  if (!raw) return '';
  if (GSTIN_REGEX.test(raw)) return '';
  const j = LAUNCH_JURISDICTIONS[code];
  if (j?.taxIdRegex && !j.taxIdRegex.test(raw.trim())) {
    return '';
  }
  return raw;
}

export default function SettingsPage() {
  const {
    branding,
    resetBranding,
    systemSettings,
    updateSystemSettings,
    reloadSettings,
    currentUser,
    paymentMethods,
    updatePaymentMethod,
    deletePaymentMethod,
    confirmAction,
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'branding' | 'profile' | 'tax' | 'invoice' | 'security' | 'alerts' | 'payment-methods'
  >('branding');
  const [isSaving, setIsSaving] = useState(false);

  // ─── Tab 7: Payment Methods Master State ───
  const [pmSearch, setPmSearch] = useState('');
  const [pmStatusFilter, setPmStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [selectedPmForEdit, setSelectedPmForEdit] = useState<PaymentMethodItem | null>(null);
  const [pmModalOpen, setPmModalOpen] = useState(false);

  const isSuperAdmin = currentUser?.role === 'Super Admin';

  // ─── Tab 1: Branding State ───
  const [appName, setAppName] = useState(branding.appName || 'RISMOS');
  const [logoUrl, setLogoUrl] = useState<string | null>(branding.logoUrl || null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(branding.faviconUrl || null);
  const [tagline, setTagline] = useState(branding.tagline || 'Run Retail. Smarter.');
  const [logoStatus, setLogoStatus] = useState<BrandingUploadStatus>('idle');
  const [faviconStatus, setFaviconStatus] = useState<BrandingUploadStatus>('idle');

  // ─── Tab 2: Profile State ───
  const [businessName, setBusinessName] = useState(
    branding.businessName || 'RISMOS Retail Enterprise'
  );
  const [supportEmail, setSupportEmail] = useState(branding.supportEmail || 'support@rismos.com');
  const [supportPhone, setSupportPhone] = useState(branding.supportPhone || '');
  const [businessAddress, setBusinessAddress] = useState(branding.businessAddress || '');
  const [city, setCity] = useState(branding.city || '');
  const [state, setState] = useState(branding.state || '');
  const [pincode, setPincode] = useState(branding.pincode || '');
  const [country, setCountry] = useState(branding.country || 'India');
  const [countryCode, setCountryCode] = useState(branding.countryCode || 'IN');
  const [timezone, setTimezone] = useState(branding.timezone || 'Asia/Kolkata');
  const [locale, setLocale] = useState(branding.locale || 'en-IN');
  const [baseCurrency, setBaseCurrency] = useState(branding.baseCurrency || 'INR (₹)');

  // ─── Tab 3: Tax State ───
  const [taxCountryCode, setTaxCountryCode] = useState(systemSettings.countryCode || 'IN');
  const [taxRegime, setTaxRegime] = useState(systemSettings.taxRegime || 'GST');
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(
    getInitialTaxRegistrationNumber(systemSettings)
  );
  const [taxInclusivePricing, setTaxInclusivePricing] = useState(
    systemSettings.taxInclusivePricing !== undefined ? systemSettings.taxInclusivePricing : true
  );
  const [taxJurisdictionState, setTaxJurisdictionState] = useState(
    systemSettings.taxJurisdictionState ||
      (systemSettings.countryCode === 'IN' ? systemSettings.gstStateCode || '' : '')
  );
  const [legalBusinessName, setLegalBusinessName] = useState(
    systemSettings.legalBusinessName || ''
  );
  const [tradeName, setTradeName] = useState(systemSettings.tradeName || '');
  const [defaultTaxRate, setDefaultTaxRate] = useState(systemSettings.defaultTaxRate ?? 18);
  const [hsnMandatory, setHsnMandatory] = useState(systemSettings.hsnMandatory ?? true);
  const [enableReverseCharge, setEnableReverseCharge] = useState(
    systemSettings.enableReverseCharge ?? false
  );
  const [gstRegistrationType, setGstRegistrationType] = useState(
    systemSettings.gstRegistrationType || 'Regular'
  );
  const [gstBusinessAddress, setGstBusinessAddress] = useState(
    systemSettings.gstBusinessAddress || ''
  );

  // ─── Tab 4: Invoice Template State ───
  const [invoiceHeader, setInvoiceHeader] = useState(
    systemSettings.invoiceHeader || 'RISMOS Retail Enterprise'
  );
  const [invoiceFooter, setInvoiceFooter] = useState(
    systemSettings.invoiceFooter ||
      'Thank you for shopping with us! Goods once sold cannot be returned without original receipt.'
  );
  const [invoiceTerms, setInvoiceTerms] = useState(
    systemSettings.invoiceTerms ||
      '1. Standard 12-month warranty on manufacturing defects.\n2. Retain this invoice for warranty & service support.\n3. Physical and liquid damage are excluded.'
  );
  const [invoiceAccentColor, setInvoiceAccentColor] = useState(
    systemSettings.invoiceAccentColor || 'primary'
  );
  const [watermarkOpacity, setWatermarkOpacity] = useState(
    systemSettings.watermarkOpacity !== undefined ? systemSettings.watermarkOpacity : 8
  );
  const [showStoreAddress, setShowStoreAddress] = useState(
    systemSettings.showStoreAddress !== undefined ? systemSettings.showStoreAddress : true
  );
  const [invoiceTemplateUrl, setInvoiceTemplateUrl] = useState<string | null>(
    systemSettings.invoiceTemplateUrl || null
  );
  const [showPaymentQr, setShowPaymentQr] = useState(
    systemSettings.showPaymentQr !== undefined ? systemSettings.showPaymentQr : true
  );
  const [paymentUpiId, setPaymentUpiId] = useState(systemSettings.paymentUpiId || '');
  const [paymentBankDetails, setPaymentBankDetails] = useState(
    systemSettings.paymentBankDetails || ''
  );
  const [invoiceFieldMapping, setInvoiceFieldMapping] = useState<string | null>(
    systemSettings.invoiceFieldMapping || null
  );

  // ─── Tab 5: Security & Access State ───
  const [sessionTimeoutMins, setSessionTimeoutMins] = useState(
    systemSettings.sessionTimeoutMins ?? 43200
  );
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(systemSettings.maxLoginAttempts ?? 5);
  const [enforcePasswordPolicy, setEnforcePasswordPolicy] = useState(
    systemSettings.enforcePasswordPolicy ?? true
  );
  const [sensitiveActionConfirm, setSensitiveActionConfirm] = useState(
    systemSettings.sensitiveActionConfirm ?? true
  );

  // ─── Tab 6: Alerts & Automation State ───
  const [lowStockAlerts, setLowStockAlerts] = useState(systemSettings.lowStockAlerts ?? true);
  const [lowStockThreshold, setLowStockThreshold] = useState(systemSettings.lowStockThreshold ?? 5);
  const [overduePaymentAlerts, setOverduePaymentAlerts] = useState(
    systemSettings.overduePaymentAlerts ?? true
  );
  const [overdueThresholdDays, setOverdueThresholdDays] = useState(
    systemSettings.overdueThresholdDays ?? 30
  );
  const [dailySalesDigest, setDailySalesDigest] = useState(
    systemSettings.dailySalesDigest ?? false
  );
  const [securityEventAlerts, setSecurityEventAlerts] = useState(
    systemSettings.securityEventAlerts ?? true
  );
  const [alertRecipientEmails, setAlertRecipientEmails] = useState(
    systemSettings.alertRecipientEmails || 'alerts@rismos.com'
  );

  // Sync state if branding or systemSettings change from remote reload
  useEffect(() => {
    if (branding) {
      setAppName(branding.appName || 'RISMOS');
      setLogoUrl(branding.logoUrl || null);
      setFaviconUrl(branding.faviconUrl || null);
      setTagline(branding.tagline || 'Run Retail. Smarter.');
      setBusinessName(branding.businessName || 'RISMOS Retail Enterprise');
      setSupportEmail(branding.supportEmail || 'support@rismos.com');
      setSupportPhone(branding.supportPhone || '');
      setBusinessAddress(branding.businessAddress || '');
      setCity(branding.city || '');
      setState(branding.state || '');
      setPincode(branding.pincode || '');
      setCountry(branding.country || 'India');
      setCountryCode(branding.countryCode || 'IN');
      setTimezone(branding.timezone || 'Asia/Kolkata');
      setLocale(branding.locale || 'en-IN');
      setBaseCurrency(branding.baseCurrency || 'INR (₹)');
    }
  }, [branding]);

  useEffect(() => {
    if (systemSettings) {
      setTaxCountryCode(systemSettings.countryCode || 'IN');
      setTaxRegime(systemSettings.taxRegime || 'GST');
      setTaxRegistrationNumber(getInitialTaxRegistrationNumber(systemSettings));
      setTaxInclusivePricing(
        systemSettings.taxInclusivePricing !== undefined ? systemSettings.taxInclusivePricing : true
      );
      setTaxJurisdictionState(
        systemSettings.taxJurisdictionState ||
          (systemSettings.countryCode === 'IN' ? systemSettings.gstStateCode || '' : '')
      );
      setLegalBusinessName(systemSettings.legalBusinessName || '');
      setTradeName(systemSettings.tradeName || '');
      setDefaultTaxRate(systemSettings.defaultTaxRate ?? 18);
      setHsnMandatory(systemSettings.hsnMandatory ?? true);
      setEnableReverseCharge(systemSettings.enableReverseCharge ?? false);
      setGstRegistrationType(systemSettings.gstRegistrationType || 'Regular');
      setGstBusinessAddress(systemSettings.gstBusinessAddress || '');

      setInvoiceHeader(systemSettings.invoiceHeader || 'RISMOS Retail Enterprise');
      setInvoiceFooter(
        systemSettings.invoiceFooter ||
          'Thank you for shopping with us! Goods once sold cannot be returned without original receipt.'
      );
      setInvoiceTerms(
        systemSettings.invoiceTerms ||
          '1. Standard 12-month warranty on manufacturing defects.\n2. Retain this invoice for warranty & service support.\n3. Physical and liquid damage are excluded.'
      );
      setInvoiceAccentColor(systemSettings.invoiceAccentColor || 'primary');
      setWatermarkOpacity(
        systemSettings.watermarkOpacity !== undefined ? systemSettings.watermarkOpacity : 8
      );
      setShowStoreAddress(
        systemSettings.showStoreAddress !== undefined ? systemSettings.showStoreAddress : true
      );
      setInvoiceTemplateUrl(systemSettings.invoiceTemplateUrl || null);
      setShowPaymentQr(
        systemSettings.showPaymentQr !== undefined ? systemSettings.showPaymentQr : true
      );
      setPaymentUpiId(systemSettings.paymentUpiId || '');
      setPaymentBankDetails(systemSettings.paymentBankDetails || '');
      setInvoiceFieldMapping(systemSettings.invoiceFieldMapping || null);

      setSessionTimeoutMins(systemSettings.sessionTimeoutMins ?? 43200);
      setMaxLoginAttempts(systemSettings.maxLoginAttempts ?? 5);
      setEnforcePasswordPolicy(systemSettings.enforcePasswordPolicy ?? true);
      setSensitiveActionConfirm(systemSettings.sensitiveActionConfirm ?? true);

      setLowStockAlerts(systemSettings.lowStockAlerts ?? true);
      setLowStockThreshold(systemSettings.lowStockThreshold ?? 5);
      setOverduePaymentAlerts(systemSettings.overduePaymentAlerts ?? true);
      setOverdueThresholdDays(systemSettings.overdueThresholdDays ?? 30);
      setDailySalesDigest(systemSettings.dailySalesDigest ?? false);
      setSecurityEventAlerts(systemSettings.securityEventAlerts ?? true);
      setAlertRecipientEmails(systemSettings.alertRecipientEmails || 'alerts@rismos.com');
    }
  }, [systemSettings]);

  // File Upload Handlers with Direct Database Persistence
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setLogoStatus('upload_failed');
      toast.error('Invalid file type! Upload a PNG, JPG, WebP, or SVG logo image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoStatus('upload_failed');
      toast.error('File size exceeds 5MB! Please upload a smaller logo.');
      return;
    }

    setLogoStatus('uploading');
    try {
      const res = await StorageService.uploadFile('branding', file, file.name);
      if (!res?.url) {
        setLogoStatus('upload_failed');
        toast.error('Failed to upload logo image to permanent storage.');
        return;
      }

      setLogoStatus('saving');
      const saveRes = await updateSystemSettings('branding', {
        appName: appName || 'RISMOS',
        tagline,
        logoUrl: res.url,
        faviconUrl,
      });

      if (saveRes.success) {
        setLogoUrl(res.url);
        setLogoStatus('saved');
        toast.success('Universal brand logo saved and synchronized across all terminals!');
      } else {
        setLogoStatus('save_failed');
        toast.error(saveRes.error || 'Failed to persist logo to database.');
      }
    } catch (err: any) {
      setLogoStatus('upload_failed');
      toast.error('Failed to upload logo: ' + (err.message || 'Storage error'));
    }
  };

  const handleRemoveLogo = async () => {
    setLogoStatus('saving');
    try {
      const saveRes = await updateSystemSettings('branding', {
        appName: appName || 'RISMOS',
        tagline,
        logoUrl: null,
        faviconUrl,
      });
      if (saveRes.success) {
        setLogoUrl(null);
        setLogoStatus('saved');
        toast.success('Brand logo removed. Reverted to default mark.');
      } else {
        setLogoStatus('save_failed');
        toast.error(saveRes.error || 'Failed to update database.');
      }
    } catch {
      setLogoStatus('save_failed');
      toast.error('Error removing brand logo');
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setFaviconStatus('upload_failed');
      toast.error('Favicon must be under 1MB.');
      return;
    }

    setFaviconStatus('uploading');
    try {
      const res = await StorageService.uploadFile('branding', file, file.name);
      if (!res?.url) {
        setFaviconStatus('upload_failed');
        toast.error('Failed to upload favicon to permanent storage.');
        return;
      }

      setFaviconStatus('saving');
      const saveRes = await updateSystemSettings('branding', {
        appName: appName || 'RISMOS',
        tagline,
        logoUrl,
        faviconUrl: res.url,
      });

      if (saveRes.success) {
        setFaviconUrl(res.url);
        setFaviconStatus('saved');
        toast.success('Browser favicon saved and updated!');
      } else {
        setFaviconStatus('save_failed');
        toast.error(saveRes.error || 'Failed to persist favicon to database.');
      }
    } catch (err: any) {
      setFaviconStatus('upload_failed');
      toast.error('Failed to upload favicon: ' + (err.message || 'Storage error'));
    }
  };

  const handleRemoveFavicon = async () => {
    setFaviconStatus('saving');
    try {
      const saveRes = await updateSystemSettings('branding', {
        appName: appName || 'RISMOS',
        tagline,
        logoUrl,
        faviconUrl: null,
      });
      if (saveRes.success) {
        setFaviconUrl(null);
        setFaviconStatus('saved');
        toast.success('Browser favicon removed.');
      } else {
        setFaviconStatus('save_failed');
        toast.error(saveRes.error || 'Failed to update database.');
      }
    } catch {
      setFaviconStatus('save_failed');
      toast.error('Error removing favicon');
    }
  };

  const handleInvoiceTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      toast.error(
        'Please upload an image (PNG, JPG, WebP, SVG) or PDF exported from Canva or design software.'
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Template size exceeds 10MB limit.');
      return;
    }
    StorageService.uploadFile('branding', file, file.name)
      .then((res) => {
        if (res.url) {
          setInvoiceTemplateUrl(res.url);
          toast.success('Custom invoice template uploaded! Check live preview and save.');
        }
      })
      .catch((err) => toast.error('Failed to upload template: ' + err.message));
  };

  // Section Save Handlers
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      toast.error('Permission denied: Only Super Admin can modify system settings.');
      return;
    }

    setIsSaving(true);
    try {
      if (activeTab === 'branding') {
        const payload = {
          appName: appName || 'RISMOS',
          tagline,
          logoUrl,
          faviconUrl,
        };
        const res = await updateSystemSettings('branding', payload);
        if (res.success) {
          setLogoStatus('saved');
          setFaviconStatus('saved');
          toast.success('Branding identity settings saved successfully!');
        } else {
          toast.error(res.error || 'Failed to save branding settings');
        }
      } else if (activeTab === 'profile') {
        await updateSystemSettings('profile', {
          businessName,
          supportEmail,
          supportPhone,
          businessAddress,
          city,
          state,
          pincode,
          country,
          countryCode,
          timezone,
          locale,
          baseCurrency,
        });
      } else if (activeTab === 'tax') {
        await updateSystemSettings('tax', {
          countryCode: taxCountryCode,
          taxRegime,
          taxRegistrationNumber,
          taxInclusivePricing,
          taxJurisdictionState,
          legalBusinessName,
          tradeName,
          defaultTaxRate: Number(defaultTaxRate),
          hsnMandatory,
          enableReverseCharge,
          gstRegistrationType,
          gstBusinessAddress,
          gstin: taxCountryCode === 'IN' ? taxRegistrationNumber : '',
        });
      } else if (activeTab === 'invoice') {
        await updateSystemSettings('invoice', {
          invoiceHeader,
          invoiceFooter,
          invoiceTerms,
          invoiceAccentColor,
          watermarkOpacity: Number(watermarkOpacity),
          showStoreAddress,
          invoiceTemplateUrl,
          showPaymentQr,
          paymentUpiId,
          paymentBankDetails,
          invoiceFieldMapping,
        });
      } else if (activeTab === 'security') {
        await updateSystemSettings('security', {
          sessionTimeoutMins: Number(sessionTimeoutMins),
          maxLoginAttempts: Number(maxLoginAttempts),
          enforcePasswordPolicy,
          sensitiveActionConfirm,
        });
      } else if (activeTab === 'alerts') {
        await updateSystemSettings('alerts', {
          lowStockAlerts,
          lowStockThreshold: Number(lowStockThreshold),
          overduePaymentAlerts,
          overdueThresholdDays: Number(overdueThresholdDays),
          dailySalesDigest,
          securityEventAlerts,
          alertRecipientEmails,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetBrandingTab = () => {
    if (!isSuperAdmin) return;
    resetBranding();
    setAppName('RISMOS');
    setLogoUrl(null);
    setFaviconUrl(null);
    setTagline('Run Retail. Smarter.');
  };

  return (
    <SuperAdminGuard moduleName="Settings">
      <AppLayout activeRoute="/settings">
        <div className="space-y-4 md:space-y-6 fade-in max-w-5xl">
          {/* Page Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title">Settings</h1>
              <p className="page-subtitle">
                White-label branding, fiscal tax rules, invoicing & security
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isSuperAdmin && <span className="badge-warning text-3xs">Read-Only</span>}
              <button
                type="button"
                onClick={reloadSettings}
                className="btn-secondary btn-sm gap-1"
                title="Refresh settings"
              >
                <Icon name="ArrowPathIcon" size={13} />
                <span className="hidden sm:inline">Sync</span>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 border-b border-border/80 pb-2 overflow-x-auto scrollbar-none -mx-[var(--page-gutter)] px-[var(--page-gutter)] md:mx-0 md:px-0">
            {(
              [
                { id: 'branding', label: 'Branding', icon: 'SparklesIcon' },
                { id: 'profile', label: 'Profile', icon: 'BuildingStorefrontIcon' },
                { id: 'tax', label: 'Tax & Compliance', icon: 'DocumentCheckIcon' },
                { id: 'invoice', label: 'Invoice', icon: 'DocumentTextIcon' },
                { id: 'security', label: 'Security', icon: 'ShieldCheckIcon' },
                { id: 'alerts', label: 'Alerts', icon: 'BellIcon' },
                { id: 'payment-methods', label: 'Payments', icon: 'CreditCardIcon' },
              ] as const
            ).map((tab) => (
              <button
                key={`tab-set-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Icon name={tab.icon as any} size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Main Form Container */}
          <form onSubmit={handleSave} className="card p-4 md:p-6 space-y-5 md:space-y-6">
            {activeTab === 'branding' && (
              <BrandingTab
                appName={appName}
                setAppName={setAppName}
                tagline={tagline}
                setTagline={setTagline}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                faviconUrl={faviconUrl}
                setFaviconUrl={setFaviconUrl}
                handleLogoUpload={handleLogoUpload}
                handleFaviconUpload={handleFaviconUpload}
                handleRemoveLogo={handleRemoveLogo}
                handleRemoveFavicon={handleRemoveFavicon}
                logoStatus={logoStatus}
                faviconStatus={faviconStatus}
                handleResetBrandingTab={handleResetBrandingTab}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileTab
                businessName={businessName}
                setBusinessName={setBusinessName}
                supportEmail={supportEmail}
                setSupportEmail={setSupportEmail}
                supportPhone={supportPhone}
                setSupportPhone={setSupportPhone}
                businessAddress={businessAddress}
                setBusinessAddress={setBusinessAddress}
                city={city}
                setCity={setCity}
                state={state}
                setState={setState}
                pincode={pincode}
                setPincode={setPincode}
                country={country}
                setCountry={setCountry}
                countryCode={countryCode}
                setCountryCode={setCountryCode}
                timezone={timezone}
                setTimezone={setTimezone}
                locale={locale}
                setLocale={setLocale}
                baseCurrency={baseCurrency}
                setBaseCurrency={setBaseCurrency}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {activeTab === 'tax' && (
              <TaxTab
                countryCode={taxCountryCode}
                setCountryCode={setTaxCountryCode}
                taxRegime={taxRegime}
                setTaxRegime={setTaxRegime}
                taxRegistrationNumber={taxRegistrationNumber}
                setTaxRegistrationNumber={setTaxRegistrationNumber}
                taxInclusivePricing={taxInclusivePricing}
                setTaxInclusivePricing={setTaxInclusivePricing}
                taxJurisdictionState={taxJurisdictionState}
                setTaxJurisdictionState={setTaxJurisdictionState}
                legalBusinessName={legalBusinessName}
                setLegalBusinessName={setLegalBusinessName}
                tradeName={tradeName}
                setTradeName={setTradeName}
                gstBusinessAddress={gstBusinessAddress}
                setGstBusinessAddress={setGstBusinessAddress}
                defaultTaxRate={defaultTaxRate}
                setDefaultTaxRate={setDefaultTaxRate}
                hsnMandatory={hsnMandatory}
                setHsnMandatory={setHsnMandatory}
                enableReverseCharge={enableReverseCharge}
                setEnableReverseCharge={setEnableReverseCharge}
                gstRegistrationType={gstRegistrationType}
                setGstRegistrationType={setGstRegistrationType}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {activeTab === 'invoice' && (
              <InvoiceTab
                invoiceHeader={invoiceHeader}
                setInvoiceHeader={setInvoiceHeader}
                invoiceFooter={invoiceFooter}
                setInvoiceFooter={setInvoiceFooter}
                invoiceTerms={invoiceTerms}
                setInvoiceTerms={setInvoiceTerms}
                invoiceAccentColor={invoiceAccentColor}
                setInvoiceAccentColor={setInvoiceAccentColor}
                watermarkOpacity={watermarkOpacity}
                setWatermarkOpacity={setWatermarkOpacity}
                showStoreAddress={showStoreAddress}
                setShowStoreAddress={setShowStoreAddress}
                invoiceTemplateUrl={invoiceTemplateUrl}
                setInvoiceTemplateUrl={setInvoiceTemplateUrl}
                showPaymentQr={showPaymentQr}
                setShowPaymentQr={setShowPaymentQr}
                paymentUpiId={paymentUpiId}
                setPaymentUpiId={setPaymentUpiId}
                paymentBankDetails={paymentBankDetails}
                setPaymentBankDetails={setPaymentBankDetails}
                handleInvoiceTemplateUpload={handleInvoiceTemplateUpload}
                logoUrl={logoUrl}
                businessAddress={businessAddress}
                city={city}
                supportPhone={supportPhone}
                gstin={taxRegistrationNumber}
                defaultTaxRate={defaultTaxRate}
                isSuperAdmin={isSuperAdmin}
                invoiceFieldMapping={invoiceFieldMapping}
                setInvoiceFieldMapping={setInvoiceFieldMapping}
              />
            )}

            {activeTab === 'security' && (
              <SecurityTab
                sessionTimeoutMins={sessionTimeoutMins}
                setSessionTimeoutMins={setSessionTimeoutMins}
                maxLoginAttempts={maxLoginAttempts}
                setMaxLoginAttempts={setMaxLoginAttempts}
                enforcePasswordPolicy={enforcePasswordPolicy}
                setEnforcePasswordPolicy={setEnforcePasswordPolicy}
                sensitiveActionConfirm={sensitiveActionConfirm}
                setSensitiveActionConfirm={setSensitiveActionConfirm}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsTab
                lowStockAlerts={lowStockAlerts}
                setLowStockAlerts={setLowStockAlerts}
                lowStockThreshold={lowStockThreshold}
                setLowStockThreshold={setLowStockThreshold}
                overduePaymentAlerts={overduePaymentAlerts}
                setOverduePaymentAlerts={setOverduePaymentAlerts}
                overdueThresholdDays={overdueThresholdDays}
                setOverdueThresholdDays={setOverdueThresholdDays}
                dailySalesDigest={dailySalesDigest}
                setDailySalesDigest={setDailySalesDigest}
                securityEventAlerts={securityEventAlerts}
                setSecurityEventAlerts={setSecurityEventAlerts}
                alertRecipientEmails={alertRecipientEmails}
                setAlertRecipientEmails={setAlertRecipientEmails}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {activeTab === 'payment-methods' && (
              <PaymentMethodsTab
                paymentMethods={paymentMethods}
                pmSearch={pmSearch}
                setPmSearch={setPmSearch}
                pmStatusFilter={pmStatusFilter}
                setPmStatusFilter={setPmStatusFilter}
                onAddNew={() => {
                  setSelectedPmForEdit(null);
                  setPmModalOpen(true);
                }}
                onEdit={(pm) => {
                  setSelectedPmForEdit(pm);
                  setPmModalOpen(true);
                }}
                onToggleStatus={async (id, newChecked) => {
                  const newStatus = newChecked ? 'Active' : 'Inactive';
                  await updatePaymentMethod(id, { status: newStatus });
                }}
                onDelete={async (pm) => {
                  const confirmed = await confirmAction({
                    actionType: 'delete',
                    title: `Delete Payment Method: ${pm.name}`,
                    subtitle:
                      'Are you sure you want to permanently remove this custom payment instrument?',
                    confirmLabel: 'Delete Method',
                    variant: 'danger',
                    warningMessage:
                      'Deleting this payment method will remove it from the master list. Historical records referencing this method will still maintain their audit names.',
                  });
                  if (confirmed) {
                    await deletePaymentMethod(pm.id);
                  }
                }}
                isSuperAdmin={isSuperAdmin}
              />
            )}

            {/* Form Submit Footer */}
            {isSuperAdmin && activeTab !== 'payment-methods' && (
              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary gap-2 text-xs font-bold px-6 py-2.5 shadow-sm"
                >
                  {isSaving ? (
                    <>
                      <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="CheckIcon" size={16} />
                      <span>
                        {activeTab === 'branding' && 'Save Branding Settings'}
                        {activeTab === 'profile' && 'Save Business Profile'}
                        {activeTab === 'tax' &&
                          (taxCountryCode === 'IN'
                            ? 'Save GST & Compliance'
                            : `Save ${taxRegime || 'Tax'} & Compliance`)}
                        {activeTab === 'invoice' && 'Save Invoice Template'}
                        {activeTab === 'security' && 'Save Security Policies'}
                        {activeTab === 'alerts' && 'Save Alert Settings'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Centralized Reusable Payment Method Modal */}
        <PaymentMethodModal
          open={pmModalOpen}
          onClose={() => {
            setPmModalOpen(false);
            setSelectedPmForEdit(null);
          }}
          paymentMethod={selectedPmForEdit}
          zIndex={1200}
        />
      </AppLayout>
    </SuperAdminGuard>
  );
}
