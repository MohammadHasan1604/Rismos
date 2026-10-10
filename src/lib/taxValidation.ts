import { getJurisdictionProfile, JurisdictionProfile } from './localization/jurisdictions';

export interface TaxIdValidationResult {
  valid: boolean;
  normalized: string;
  isOptionalOrUnregistered: boolean;
  error?: string;
  label: string;
}

const UNREGISTERED_SET = new Set([
  'URP',
  'UNREGISTERED',
  'NONE',
  'N/A',
  'NA',
  'EXEMPT',
  'CONSUMER',
  'PENDING',
]);

/**
 * Validates and normalizes tax registration numbers based on country jurisdiction.
 * - IN: 15-char Indian GSTIN
 * - AE: 15-digit UAE TRN (starting with 100)
 * - SA: 15-digit Saudi ZATCA VAT (starts and ends with 3)
 * - GB: 9-12 char HMRC VAT number (optional GB prefix)
 * - US: 9-digit Federal EIN (XX-XXXXXXX) or State permit
 * - AU: 11-digit Australian Business Number (ABN)
 * - ZA: 10-digit South African SARS VAT (starts with 4)
 */
export function validateTaxRegistrationId(
  input?: string | null,
  countryCode: string = 'IN'
): TaxIdValidationResult {
  const profile: JurisdictionProfile = getJurisdictionProfile(countryCode);
  const label = profile.taxIdLabel;

  if (input === undefined || input === null) {
    return {
      valid: true,
      normalized: '',
      isOptionalOrUnregistered: true,
      label,
    };
  }

  const raw = String(input).trim().toUpperCase();

  if (raw === '' || UNREGISTERED_SET.has(raw)) {
    const normalized = raw === 'PENDING' ? 'PENDING' : raw === 'URP' ? 'URP' : '';
    return {
      valid: true,
      normalized,
      isOptionalOrUnregistered: true,
      label,
    };
  }

  const clean = raw.replace(/[\s\-_/]/g, '');

  switch (profile.countryCode) {
    case 'IN': {
      if (clean.length !== 15) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `GSTIN must be 15 characters (entered ${clean.length}). For unregistered entities, leave blank or enter URP.`,
          label,
        };
      }
      if (profile.taxIdRegex && !profile.taxIdRegex.test(clean)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error:
            'Invalid GSTIN structure. Expected: 2-digit State Code + 10-char PAN + Entity Code + Z + Check Digit (e.g. 29AABCU9603R1ZM).',
          label,
        };
      }
      break;
    }

    case 'AE': {
      if (clean.length !== 15) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `UAE TRN must be 15 digits (entered ${clean.length}). Format: 100XXXXXXXXX003.`,
          label,
        };
      }
      if (profile.taxIdRegex && !profile.taxIdRegex.test(clean)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error:
            'Invalid UAE TRN format. Must be 15 digits starting with 100 (e.g. 100123456789003).',
          label,
        };
      }
      break;
    }

    case 'SA': {
      if (clean.length !== 15) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `Saudi VAT number must be 15 digits (entered ${clean.length}). Format: 300XXXXXXXXX003.`,
          label,
        };
      }
      if (profile.taxIdRegex && !profile.taxIdRegex.test(clean)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error:
            'Invalid ZATCA VAT registration number. Must be 15 digits starting and ending with 3.',
          label,
        };
      }
      break;
    }

    case 'GB': {
      if (profile.taxIdRegex && !profile.taxIdRegex.test(raw)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error:
            'Invalid UK VAT registration number. Expected 9 or 12 digits (e.g. GB 123 4567 89).',
          label,
        };
      }
      break;
    }

    case 'US': {
      if (profile.taxIdRegex && !profile.taxIdRegex.test(raw) && clean.length !== 9) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: 'Invalid US Federal EIN format. Expected 9 digits (e.g. 12-3456789).',
          label,
        };
      }
      break;
    }

    case 'AU': {
      if (clean.length !== 11) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `Australian Business Number (ABN) must be 11 digits (entered ${clean.length}).`,
          label,
        };
      }
      if (profile.taxIdRegex && !profile.taxIdRegex.test(raw)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: 'Invalid ABN format. Expected 11 digits (e.g. 51 824 753 556).',
          label,
        };
      }
      break;
    }

    case 'ZA': {
      if (clean.length !== 10) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `SARS VAT registration number must be 10 digits (entered ${clean.length}).`,
          label,
        };
      }
      if (profile.taxIdRegex && !profile.taxIdRegex.test(clean)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: 'Invalid SARS VAT number. Expected 10 digits starting with 4 (e.g. 4123456789).',
          label,
        };
      }
      break;
    }

    default: {
      if (profile.taxIdRegex && !profile.taxIdRegex.test(raw)) {
        return {
          valid: false,
          normalized: clean,
          isOptionalOrUnregistered: false,
          error: `Invalid ${profile.taxIdLabel} format.`,
          label,
        };
      }
    }
  }

  return {
    valid: true,
    normalized: clean,
    isOptionalOrUnregistered: false,
    label,
  };
}
