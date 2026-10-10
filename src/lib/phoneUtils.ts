/**
 * Country Dialing Codes & International Phone Handling
 */
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  IN: '+91',
  AE: '+971',
  SA: '+966',
  GB: '+44',
  US: '+1',
  AU: '+61',
  ZA: '+27',
};

/**
 * Normalizes Indian and International phone numbers.
 * - For Indian numbers: Returns canonical 10-digit format (preserving existing index & search compatibility)
 * - For International numbers: Normalizes to digits or E.164 without truncation
 */
export function normalizeMobileNumber(phone: string, defaultCountry: string = 'IN'): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  // If starts with + (international format), keep full digits
  if (trimmed.startsWith('+')) {
    return digitsOnly;
  }

  // Indian numbers (12-digit with 91 prefix or 10-digit)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.substring(2);
  }
  if (digitsOnly.length === 10 && (defaultCountry === 'IN' || !defaultCountry)) {
    return digitsOnly;
  }

  return digitsOnly;
}

/**
 * Converts any phone number to standard E.164 format (+<country><number>)
 */
export function toE164Phone(phone: string, countryCode: string = 'IN'): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.replace(/\D/g, '')}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  const dialCode = COUNTRY_DIAL_CODES[countryCode.toUpperCase()] || '+91';
  const prefixDigits = dialCode.replace(/\D/g, '');

  if (digits.startsWith(prefixDigits)) {
    return `+${digits}`;
  }

  return `${dialCode}${digits}`;
}

/**
 * Formats a phone number for user-friendly display
 */
export function formatDisplayPhone(phone: string, countryCode: string = 'IN'): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && countryCode === 'IN') {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return trimmed;
}
