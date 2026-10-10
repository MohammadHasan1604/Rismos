/**
 * RISMOS White-Label Branding System
 * Single Source of Truth for White-Label Identity
 */

export interface AppBrandingConfig {
  appName: string;
  tagline: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  appIconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  timezone?: string | null;
  locale?: string | null;
  baseCurrency?: string;
  taxNumber?: string | null;
  updatedAt?: string | Date;
}

export const DEFAULT_BRANDING: AppBrandingConfig = {
  appName: 'RISMOS',
  tagline: 'Run Retail. Smarter.',
  logoUrl: null,
  logoDarkUrl: null,
  appIconUrl: null,
  faviconUrl: null,
  primaryColor: '#0B1F3A',
  secondaryColor: '#123A63',
  accentColor: '#123A63',
  supportEmail: 'support@rismos.com',
  supportPhone: '',
  businessName: 'RISMOS Retail Enterprise',
  businessAddress: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  countryCode: 'IN',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  baseCurrency: 'INR (₹)',
  taxNumber: null,
};

// In-memory cache for fast SSR / API responses
let memoryBrandingCache: AppBrandingConfig | null = null;
let memoryCacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function getCachedBranding(): AppBrandingConfig | null {
  if (memoryBrandingCache && Date.now() - memoryCacheTimestamp < CACHE_TTL_MS) {
    return memoryBrandingCache;
  }
  return null;
}

export function setCachedBranding(branding: AppBrandingConfig): void {
  memoryBrandingCache = branding;
  memoryCacheTimestamp = Date.now();
}

export function invalidateBrandingCache(): void {
  memoryBrandingCache = null;
  memoryCacheTimestamp = 0;
}
