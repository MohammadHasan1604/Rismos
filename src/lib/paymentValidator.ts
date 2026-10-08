/**
 * Authoritative Canonical Payment Method Validator
 *
 * Operational payment transactions across RISMOS accept configured retail methods:
 * - 'Cash'
 * - 'Card'
 * - 'UPI'
 * - 'Bank Transfer'
 * - 'Credit'
 * - 'Other'
 *
 * Arbitrary or non-approved payment methods (e.g. 'Crypto', etc.) are rejected.
 * Country configurations (e.g. UAE/UK/US) can use Card/Cash/Bank Transfer without UPI dependency.
 */

export const ALLOWED_PAYMENT_METHODS = [
  'Cash',
  'Card',
  'UPI',
  'Bank Transfer',
  'Credit',
  'Other',
] as const;

export type AllowedPaymentMethod = (typeof ALLOWED_PAYMENT_METHODS)[number];

export interface PaymentValidationResult {
  valid: boolean;
  normalized?: AllowedPaymentMethod;
  error?: string;
}

const METHOD_ALIASES: Record<string, AllowedPaymentMethod> = {
  cash: 'Cash',
  card: 'Card',
  'credit card': 'Card',
  'debit card': 'Card',
  upi: 'UPI',
  'bank transfer': 'Bank Transfer',
  bank: 'Bank Transfer',
  wire: 'Bank Transfer',
  'net banking': 'Bank Transfer',
  credit: 'Credit',
  other: 'Other',
};

export function validatePaymentMethod(method: unknown): PaymentValidationResult {
  if (!method || typeof method !== 'string') {
    return {
      valid: false,
      error: `Payment method is required and must be one of: ${ALLOWED_PAYMENT_METHODS.join(', ')}.`,
    };
  }

  const trimmed = method.trim().toLowerCase();
  const normalized = METHOD_ALIASES[trimmed];

  if (!normalized) {
    return {
      valid: false,
      error: `Invalid payment method "${method}". Operational transactions must use one of: ${ALLOWED_PAYMENT_METHODS.join(', ')}.`,
    };
  }

  return {
    valid: true,
    normalized,
  };
}

export function isAllowedPaymentMethod(method: unknown): method is AllowedPaymentMethod {
  return validatePaymentMethod(method).valid;
}

