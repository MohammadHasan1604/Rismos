/**
 * Trusted Application Origin & Reset URL Construction for RISMOS
 *
 * Security:
 * - Production URLs must derive from validated environment configuration (APP_URL / NEXT_PUBLIC_APP_URL / URL).
 * - Enforces HTTPS in production; strips trailing slashes.
 * - Rejects arbitrary Host / X-Forwarded-Host header injection.
 * - Development & test environments safely fall back to localhost:4028.
 */

export function getTrustedAppOrigin(req?: Request): string {
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Inspect authoritative server/app configuration
  const rawConfigUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL; // Standard Netlify deployment variable

  if (rawConfigUrl) {
    try {
      const parsed = new URL(rawConfigUrl.trim());
      if (isProduction) {
        // Enforce HTTPS in production
        parsed.protocol = 'https:';
      }
      return parsed.origin;
    } catch {
      if (isProduction) {
        console.error(`[SECURITY] Malformed APP_URL configured: "${rawConfigUrl}".`);
      }
    }
  }

  // 2. In non-production (development / test), inspect request if safe local host
  if (!isProduction) {
    if (req) {
      try {
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        const cleanHost = host.split(',')[0].trim();
        // Only allow localhost or loopback in development request fallback
        if (cleanHost && (cleanHost.startsWith('localhost') || cleanHost.startsWith('127.0.0.1'))) {
          const proto = req.headers.get('x-forwarded-proto') || 'http';
          return `${proto}://${cleanHost}`;
        }
      } catch {}
    }
    return 'http://localhost:4028';
  }

  // 3. Fallback in production if APP_URL missing: fail-safe to canonical HTTPS domain
  return 'https://rismos.app';
}

export function buildTrustedResetUrl(req: Request | undefined, rawToken: string): string {
  const origin = getTrustedAppOrigin(req);
  const cleanToken = encodeURIComponent(String(rawToken).trim());
  return `${origin}/auth/reset-password?token=${cleanToken}`;
}
