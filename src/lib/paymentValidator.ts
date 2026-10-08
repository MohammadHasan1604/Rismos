import { prisma } from './db';

/**
 * Authoritative Canonical Payment Method Validator & Cache Engine
 *
 * Operational payment transactions across RISMOS accept configured retail methods
 * from the database `PaymentMethod` table.
 *
 * System default baseline:
 * - 'Cash'
 * - 'Card'
 * - 'UPI'
 * - 'Bank Transfer'
 * - 'Credit'
 * - 'Other'
 *
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

export type AllowedPaymentMethod = string;

export interface PaymentValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
  isInactive?: boolean;
}

const METHOD_ALIASES: Record<string, string> = {
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
  cheque: 'Other',
  check: 'Other',
  other: 'Other',
};

// In-memory cache for active DB payment methods (60 seconds TTL)
let activeMethodsCache: string[] | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 60_000;

export function invalidatePaymentMethodCache(): void {
  activeMethodsCache = null;
  lastCacheFetchTime = 0;
}

/**
 * Fetches and caches active payment method names from the DB PaymentMethod table.
 */
export async function getActivePaymentMethods(): Promise<string[]> {
  const now = Date.now();
  if (activeMethodsCache && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return activeMethodsCache;
  }

  try {
    const dbMethods = await prisma.paymentMethod.findMany({
      where: { status: 'Active' },
      select: { name: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (dbMethods.length > 0) {
      activeMethodsCache = dbMethods.map((m) => m.name);
      lastCacheFetchTime = now;
      return activeMethodsCache;
    }
  } catch (err) {
    console.warn('[paymentValidator] Failed to query DB payment methods, using baseline:', err);
  }

  // Fallback to baseline
  activeMethodsCache = [...ALLOWED_PAYMENT_METHODS];
  lastCacheFetchTime = now;
  return activeMethodsCache;
}

/**
 * Authoritative async validation against the live database PaymentMethod table.
 */
export async function validatePaymentMethodAgainstDb(
  method: unknown,
  options?: { allowHistorical?: boolean }
): Promise<PaymentValidationResult> {
  if (!method || typeof method !== 'string') {
    return {
      valid: false,
      error: 'Payment method is required.',
    };
  }

  const trimmed = method.trim();
  const lower = trimmed.toLowerCase();

  // 1. Query the DB record directly
  try {
    const record = await prisma.paymentMethod.findFirst({
      where: {
        OR: [{ name: { equals: trimmed } }, { code: { equals: trimmed.toUpperCase() } }],
      },
    });

    if (record) {
      if (record.status === 'Inactive') {
        if (options?.allowHistorical) {
          return { valid: true, normalized: record.name, isInactive: true };
        }
        return {
          valid: false,
          error: `Payment method "${record.name}" is currently deactivated. Please select an active payment method.`,
          isInactive: true,
        };
      }
      return { valid: true, normalized: record.name };
    }
  } catch (err) {
    console.warn('[paymentValidator] DB lookup error:', err);
  }

  // 2. Check alias mapping against active methods
  const aliased = METHOD_ALIASES[lower] || trimmed;
  const activeMethods = await getActivePaymentMethods();
  const matched = activeMethods.find(
    (m) => m.toLowerCase() === lower || m.toLowerCase() === aliased.toLowerCase()
  );

  if (matched) {
    return { valid: true, normalized: matched };
  }

  // If allowHistorical is set and it was a valid string, allow display
  if (options?.allowHistorical) {
    return { valid: true, normalized: trimmed };
  }

  return {
    valid: false,
    error: `Invalid payment method "${trimmed}". Active payment methods: ${activeMethods.join(', ')}.`,
  };
}

/**
 * Synchronous validation using cached DB methods or baseline defaults.
 */
export function validatePaymentMethod(method: unknown): PaymentValidationResult {
  if (!method || typeof method !== 'string') {
    const activeList = activeMethodsCache || ALLOWED_PAYMENT_METHODS;
    return {
      valid: false,
      error: `Payment method is required and must be one of: ${activeList.join(', ')}.`,
    };
  }

  const trimmed = method.trim();
  const lower = trimmed.toLowerCase();
  const aliased = METHOD_ALIASES[lower];

  // If active methods are cached, check against them
  if (activeMethodsCache && activeMethodsCache.length > 0) {
    const matched = activeMethodsCache.find(
      (m) => m.toLowerCase() === lower || (aliased && m.toLowerCase() === aliased.toLowerCase())
    );
    if (matched) {
      return { valid: true, normalized: matched };
    }
  }

  // Fallback to baseline alias
  if (aliased) {
    return { valid: true, normalized: aliased };
  }

  // Allow custom name if not blank
  const activeList = activeMethodsCache || ALLOWED_PAYMENT_METHODS;
  const matchedBaseline = activeList.find((m) => m.toLowerCase() === lower);
  if (matchedBaseline) {
    return { valid: true, normalized: matchedBaseline };
  }

  return {
    valid: false,
    error: `Invalid payment method "${trimmed}". Operational transactions must use one of: ${activeList.join(', ')}.`,
  };
}

export function isAllowedPaymentMethod(method: unknown): method is AllowedPaymentMethod {
  return validatePaymentMethod(method).valid;
}
