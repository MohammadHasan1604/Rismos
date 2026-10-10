'use client';

import React from 'react';
import { LAUNCH_JURISDICTIONS } from '@/lib/localization/jurisdictions';

interface ProfileTabProps {
  businessName: string;
  setBusinessName: (name: string) => void;
  supportEmail: string;
  setSupportEmail: (email: string) => void;
  supportPhone: string;
  setSupportPhone: (phone: string) => void;
  businessAddress: string;
  setBusinessAddress: (address: string) => void;
  city: string;
  setCity: (city: string) => void;
  state: string;
  setState: (state: string) => void;
  pincode: string;
  setPincode: (pin: string) => void;
  country: string;
  setCountry: (country: string) => void;
  countryCode: string;
  setCountryCode: (code: string) => void;
  timezone: string;
  setTimezone: (tz: string) => void;
  locale: string;
  setLocale: (loc: string) => void;
  baseCurrency: string;
  setBaseCurrency: (currency: string) => void;
  isSuperAdmin: boolean;
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST · UTC+05:30)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST · UTC+04:00)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (AST · UTC+03:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST · UTC+00:00)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT · UTC-05:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT · UTC-06:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT · UTC-08:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST · UTC+10:00)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST · UTC+02:00)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

const COMMON_LOCALES = [
  { value: 'en-IN', label: 'English (India) · en-IN' },
  { value: 'en-AE', label: 'English (United Arab Emirates) · en-AE' },
  { value: 'ar-AE', label: 'Arabic (United Arab Emirates) · ar-AE' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia) · ar-SA' },
  { value: 'en-GB', label: 'English (United Kingdom) · en-GB' },
  { value: 'en-US', label: 'English (United States) · en-US' },
  { value: 'en-AU', label: 'English (Australia) · en-AU' },
  { value: 'en-ZA', label: 'English (South Africa) · en-ZA' },
];

const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹) — Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', label: 'AED (د.إ) — UAE Dirham' },
  { code: 'SAR', symbol: '﷼', label: 'SAR (﷼) — Saudi Riyal' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) — British Pound' },
  { code: 'USD', symbol: '$', label: 'USD ($) — US Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) — Australian Dollar' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR (R) — South African Rand' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) — Euro' },
];

export const ProfileTab: React.FC<ProfileTabProps> = ({
  businessName,
  setBusinessName,
  supportEmail,
  setSupportEmail,
  supportPhone,
  setSupportPhone,
  businessAddress,
  setBusinessAddress,
  city,
  setCity,
  state,
  setState,
  pincode,
  setPincode,
  country,
  setCountry,
  countryCode,
  setCountryCode,
  timezone,
  setTimezone,
  locale,
  setLocale,
  baseCurrency,
  setBaseCurrency,
  isSuperAdmin,
}) => {
  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    setCountryCode(selectedCode);
    const jurisdiction = LAUNCH_JURISDICTIONS[selectedCode];
    if (jurisdiction) {
      setCountry(jurisdiction.countryName);
      setTimezone(jurisdiction.defaultTimezone);
      setLocale(jurisdiction.defaultLocale);
      setBaseCurrency(
        `${jurisdiction.defaultCurrencyCode} (${jurisdiction.defaultCurrencySymbol})`
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-bold text-foreground">
          Global Business & Enterprise Profile
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Authoritative legal headquarters, international jurisdiction, contact information, and
          default currency applied to invoices and receipts.
        </p>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <label className="font-bold text-foreground block mb-1">Registered Business Name *</label>
          <input
            type="text"
            required
            disabled={!isSuperAdmin}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. RISMOS Retail Enterprise Private Limited"
            className="input-field text-xs font-bold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">Official Support Email *</label>
            <input
              type="email"
              required
              disabled={!isSuperAdmin}
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@company.com"
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="font-bold text-foreground block mb-1">Central Phone / Hotline</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+1 800 555 0199"
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* International Jurisdiction & Location Configuration */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Jurisdiction & Regional Localization
            </span>
            <span className="text-3xs text-primary font-mono font-bold bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
              ISO-Standardized
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-bold text-foreground block mb-1">Country / Territory *</label>
              <select
                disabled={!isSuperAdmin}
                value={countryCode || 'IN'}
                onChange={handleCountryChange}
                className="input-field text-xs"
              >
                {Object.values(LAUNCH_JURISDICTIONS).map((j) => (
                  <option key={j.countryCode} value={j.countryCode}>
                    {j.countryName} ({j.countryCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-foreground block mb-1">Business Timezone</label>
              <select
                disabled={!isSuperAdmin}
                value={timezone || 'Asia/Kolkata'}
                onChange={(e) => setTimezone(e.target.value)}
                className="input-field text-xs"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-foreground block mb-1">System Locale</label>
              <select
                disabled={!isSuperAdmin}
                value={locale || 'en-IN'}
                onChange={(e) => setLocale(e.target.value)}
                className="input-field text-xs"
              >
                {COMMON_LOCALES.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">
            Registered Corporate Address
          </label>
          <textarea
            rows={2}
            disabled={!isSuperAdmin}
            value={businessAddress}
            onChange={(e) => setBusinessAddress(e.target.value)}
            placeholder="Headquarters street address, landmark, suite..."
            className="input-field text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">City / Municipality</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. London, Dubai, New York, Bengaluru"
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="font-bold text-foreground block mb-1">
              State / Province / Region
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="e.g. England, Dubai, California, Karnataka"
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="font-bold text-foreground block mb-1">Postal / ZIP Code</label>
            <input
              type="text"
              maxLength={32}
              disabled={!isSuperAdmin}
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="e.g. SW1A 1AA, 90210, 560038"
              className="input-field text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">Base Store Currency</label>
          <select
            disabled={!isSuperAdmin}
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="input-field text-xs font-medium"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={`${c.code} (${c.symbol})`}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-2xs text-muted-foreground mt-1">
            All prices, inventory valuations, register totals, and transactions will format using
            this base currency and symbol.
          </p>
        </div>
      </div>
    </div>
  );
};
