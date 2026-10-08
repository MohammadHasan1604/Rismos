'use client';

import React, { useMemo } from 'react';
import { getJurisdictionProfile, JurisdictionProfile } from '@/lib/localization/jurisdictions';
import { validateTaxRegistrationId } from '@/lib/taxValidation';

export interface TaxRegistrationFieldProps {
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
  entityType?: 'Customer' | 'Vendor' | 'Business';
  label?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  showValidationHint?: boolean;
  onValidationChange?: (isValid: boolean, error?: string) => void;
}

export default function TaxRegistrationField({
  value,
  onChange,
  countryCode = 'IN',
  entityType = 'Customer',
  label,
  placeholder,
  size = 'md',
  required = false,
  disabled = false,
  className = '',
  inputClassName = '',
  showValidationHint = true,
  onValidationChange,
}: TaxRegistrationFieldProps) {
  const profile: JurisdictionProfile = useMemo(() => {
    return getJurisdictionProfile(countryCode);
  }, [countryCode]);

  const validation = useMemo(() => {
    const res = validateTaxRegistrationId(value, countryCode);
    if (onValidationChange) {
      onValidationChange(res.valid, res.error);
    }
    return res;
  }, [value, countryCode, onValidationChange]);

  const shortLabel = useMemo(() => {
    switch (profile.countryCode) {
      case 'IN':
        return `${entityType} GSTIN`;
      case 'AE':
        return `${entityType} TRN`;
      case 'GB':
      case 'ZA':
        return `${entityType} VAT Number`;
      case 'AU':
        return `${entityType} ABN`;
      case 'US':
        return `${entityType} EIN / Tax Permit`;
      case 'SA':
        return `${entityType} VAT / Tax ID`;
      default:
        return `${entityType} Tax ID`;
    }
  }, [entityType, profile.countryCode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    onChange(raw.toUpperCase());
  };

  const hasValue = Boolean(value && value.trim());
  const isInvalid = hasValue && !validation.valid && !validation.isOptionalOrUnregistered;

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label className={`${size === 'sm' ? 'text-3xs' : 'text-xs'} font-bold text-foreground block`}>
          {label || shortLabel} {required && <span className="text-danger">*</span>}
          {!label && !required && (
            <span className="text-muted-foreground font-normal ml-1">(Optional)</span>
          )}
        </label>
        <span className="text-4xs font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
          {profile.countryCode} · {profile.taxRegime}
        </span>
      </div>

      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder || profile.taxIdPlaceholder || 'Tax Registration Number'}
          maxLength={profile.countryCode === 'IN' || profile.countryCode === 'AE' ? 15 : 24}
          className={`input-field ${size === 'sm' ? 'text-2xs py-1' : 'text-xs'} font-mono uppercase ${
            isInvalid ? 'border-danger focus:ring-danger/25' : ''
          } ${inputClassName}`}
        />
      </div>

      {showValidationHint && (
        <>
          {isInvalid && validation.error && (
            <p className="text-2xs text-danger font-medium mt-0.5 leading-tight">
              {validation.error}
            </p>
          )}
          {!isInvalid && hasValue && (
            <p className="text-3xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
              <span>✓ Validated {profile.countryCode} {profile.taxRegime} format</span>
            </p>
          )}
          {!hasValue && !required && (
            <p className="text-4xs text-muted-foreground">
              For unregistered suppliers/buyers, leave blank.
            </p>
          )}
        </>
      )}
    </div>
  );
}
