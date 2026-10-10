'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { LAUNCH_JURISDICTIONS, JurisdictionProfile } from '@/lib/localization/jurisdictions';

interface TaxTabProps {
  countryCode: string;
  setCountryCode: (code: string) => void;
  taxRegime: string;
  setTaxRegime: (regime: string) => void;
  taxRegistrationNumber: string;
  setTaxRegistrationNumber: (val: string) => void;
  taxInclusivePricing: boolean;
  setTaxInclusivePricing: (val: boolean) => void;
  taxJurisdictionState: string;
  setTaxJurisdictionState: (state: string) => void;
  legalBusinessName: string;
  setLegalBusinessName: (val: string) => void;
  tradeName: string;
  setTradeName: (val: string) => void;
  gstBusinessAddress: string;
  setGstBusinessAddress: (val: string) => void;
  defaultTaxRate: number;
  setDefaultTaxRate: (rate: number) => void;
  hsnMandatory: boolean;
  setHsnMandatory: (val: boolean) => void;
  enableReverseCharge: boolean;
  setEnableReverseCharge: (val: boolean) => void;
  gstRegistrationType: string;
  setGstRegistrationType: (val: string) => void;
  isSuperAdmin: boolean;
}

export const TaxTab: React.FC<TaxTabProps> = ({
  countryCode = 'IN',
  setCountryCode,
  taxRegime,
  setTaxRegime,
  taxRegistrationNumber,
  setTaxRegistrationNumber,
  taxInclusivePricing,
  setTaxInclusivePricing,
  taxJurisdictionState,
  setTaxJurisdictionState,
  legalBusinessName,
  setLegalBusinessName,
  tradeName,
  setTradeName,
  gstBusinessAddress,
  setGstBusinessAddress,
  defaultTaxRate,
  setDefaultTaxRate,
  hsnMandatory,
  setHsnMandatory,
  enableReverseCharge,
  setEnableReverseCharge,
  gstRegistrationType,
  setGstRegistrationType,
  isSuperAdmin,
}) => {
  const currentJurisdiction: JurisdictionProfile =
    LAUNCH_JURISDICTIONS[countryCode] || LAUNCH_JURISDICTIONS.IN;

  const handleCountrySwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setCountryCode(code);
    const j = LAUNCH_JURISDICTIONS[code];
    if (j) {
      setTaxRegime(j.taxRegime);
      setDefaultTaxRate(j.defaultTaxRate);
      setTaxInclusivePricing(j.taxInclusivePricingMode);
      if (j.subdivisions && j.subdivisions.length > 0) {
        setTaxJurisdictionState(j.subdivisions[0].code);
      } else {
        setTaxJurisdictionState('');
      }
      if (j.registrationTypes.length > 0) {
        setGstRegistrationType(j.registrationTypes[0]);
      }
    }
  };

  // Tax ID validation for current jurisdiction
  const isValidTaxId = React.useMemo(() => {
    if (!taxRegistrationNumber) return false;
    if (currentJurisdiction.taxIdRegex) {
      return currentJurisdiction.taxIdRegex.test(taxRegistrationNumber.trim());
    }
    return taxRegistrationNumber.trim().length >= 4;
  }, [taxRegistrationNumber, currentJurisdiction]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-bold text-foreground">
          International Tax & Fiscal Compliance Engine
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure jurisdiction-specific tax rules, tax ID registration, inclusive/exclusive
          pricing modes, and billing compliance for your business location.
        </p>
      </div>

      {/* Country & Jurisdiction Selector */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground">
            Tax Jurisdiction & Legal Country *
          </label>
          <span className="text-3xs text-primary font-mono font-bold bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
            Regime: {currentJurisdiction.taxRegime}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <select
              disabled={!isSuperAdmin}
              value={countryCode}
              onChange={handleCountrySwitch}
              className="input-field text-xs font-bold"
            >
              {Object.values(LAUNCH_JURISDICTIONS).map((j) => (
                <option key={j.countryCode} value={j.countryCode}>
                  {j.countryName} — {j.taxRegime} ({j.taxLabel})
                </option>
              ))}
            </select>
            <p className="text-2xs text-muted-foreground mt-1">{currentJurisdiction.description}</p>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Pricing Mode (Shelf / Catalog Prices) *
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!isSuperAdmin}
                onClick={() => setTaxInclusivePricing(true)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  taxInclusivePricing
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                Tax-Inclusive (Gross)
              </button>
              <button
                type="button"
                disabled={!isSuperAdmin}
                onClick={() => setTaxInclusivePricing(false)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  !taxInclusivePricing
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                Tax-Exclusive (Net)
              </button>
            </div>
            <p className="text-2xs text-muted-foreground mt-1">
              {taxInclusivePricing
                ? 'Item shelf prices include tax (Standard in UK, EU, UAE, India, Australia).'
                : 'Item shelf prices exclude tax; taxes added at checkout (Standard in US).'}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Identification Banner & Input */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          isValidTaxId
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : taxRegistrationNumber
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-muted/40 border-border text-muted-foreground'
        }`}
      >
        <div className="flex items-start gap-3">
          <Icon
            name={isValidTaxId ? 'CheckCircleIcon' : 'ExclamationCircleIcon'}
            size={22}
            className="mt-0.5 flex-shrink-0"
          />
          <div>
            <h4 className="text-xs font-bold">
              {isValidTaxId
                ? `Valid ${currentJurisdiction.taxIdLabel}`
                : taxRegistrationNumber
                  ? `Invalid ${currentJurisdiction.taxLabel} Registration Format`
                  : `No ${currentJurisdiction.taxIdLabel} Configured`}
            </h4>
            <p className="text-2xs opacity-80 mt-0.5">
              {isValidTaxId
                ? `Registered for ${currentJurisdiction.countryName} ${currentJurisdiction.taxRegime} Compliance.`
                : `Format Example: ${currentJurisdiction.taxIdPlaceholder}`}
            </p>
          </div>
        </div>
        {taxRegistrationNumber && (
          <span
            className={`px-2.5 py-1 rounded-full text-2xs font-mono font-bold uppercase ${
              isValidTaxId ? 'bg-emerald-500/20 text-emerald-600' : 'bg-danger/20 text-danger'
            }`}
          >
            {isValidTaxId ? 'Verified Pattern' : 'Syntax Error'}
          </span>
        )}
      </div>

      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">
              {currentJurisdiction.taxIdLabel} *
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={taxRegistrationNumber}
              onChange={(e) => setTaxRegistrationNumber(e.target.value.toUpperCase())}
              placeholder={currentJurisdiction.taxIdPlaceholder}
              className="input-field text-xs font-mono font-bold uppercase tracking-wider"
            />
            <p className="text-2xs text-muted-foreground mt-1">
              Will appear on all customer sales invoices, credit notes, and tax reports.
            </p>
          </div>

          <div>
            <label className="font-bold text-foreground block mb-1">
              Default Standard {currentJurisdiction.taxLabel} Rate (%) *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={!isSuperAdmin}
                value={defaultTaxRate}
                onChange={(e) => setDefaultTaxRate(parseFloat(e.target.value) || 0)}
                className="input-field text-xs font-bold w-24"
              />
              <div className="flex flex-wrap gap-1">
                {currentJurisdiction.standardTaxRates.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    disabled={!isSuperAdmin}
                    onClick={() => setDefaultTaxRate(rate)}
                    className={`px-2.5 py-1.5 rounded-lg text-2xs font-bold border transition-colors ${
                      defaultTaxRate === rate
                        ? 'bg-primary text-white border-primary'
                        : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Jurisdiction Subdivisions (State / Emirate / County) if applicable */}
        {currentJurisdiction.subdivisions && currentJurisdiction.subdivisions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-foreground block mb-1">
                Registered Jurisdiction / Region ({currentJurisdiction.countryName}) *
              </label>
              <select
                disabled={!isSuperAdmin}
                value={taxJurisdictionState}
                onChange={(e) => setTaxJurisdictionState(e.target.value)}
                className="input-field text-xs"
              >
                {currentJurisdiction.subdivisions.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.code} — {sub.name}
                  </option>
                ))}
              </select>
            </div>

            {currentJurisdiction.registrationTypes.length > 0 && (
              <div>
                <label className="font-bold text-foreground block mb-1">
                  Registration Category
                </label>
                <select
                  disabled={!isSuperAdmin}
                  value={gstRegistrationType}
                  onChange={(e) => setGstRegistrationType(e.target.value)}
                  className="input-field text-xs"
                >
                  {currentJurisdiction.registrationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">
              Legal Registered Entity Name
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={legalBusinessName}
              onChange={(e) => setLegalBusinessName(e.target.value)}
              placeholder="e.g. Acme Retail Holdings LLC"
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="font-bold text-foreground block mb-1">
              Trade / Doing-Business-As (DBA)
            </label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="e.g. Acme Stores"
              className="input-field text-xs"
            />
          </div>
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">Registered Tax Address</label>
          <textarea
            rows={2}
            disabled={!isSuperAdmin}
            value={gstBusinessAddress}
            onChange={(e) => setGstBusinessAddress(e.target.value)}
            placeholder="Official tax registered address for invoices..."
            className="input-field text-xs"
          />
        </div>

        {/* Feature Toggles (HSN/SAC for India, Reverse charge, etc.) */}
        <div className="space-y-3 pt-3 border-t border-border">
          {currentJurisdiction.hasHsnSac && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
              <div>
                <p className="font-bold text-foreground">Mandatory HSN / SAC Code Enforcement</p>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  Require 4-8 digit Harmonized System of Nomenclature on product catalogs.
                </p>
              </div>
              <ToggleSwitch
                checked={hsnMandatory}
                onChange={setHsnMandatory}
                disabled={!isSuperAdmin}
              />
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
            <div>
              <p className="font-bold text-foreground">Reverse Charge Mechanism (RCM)</p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                Enable reverse charge tax calculations on qualifying B2B vendor purchases.
              </p>
            </div>
            <ToggleSwitch
              checked={enableReverseCharge}
              onChange={setEnableReverseCharge}
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
