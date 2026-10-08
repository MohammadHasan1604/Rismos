import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { evaluateSystemAlerts } from '@/lib/services/alertService';

/**
 * Constant-time string equality check to protect against timing attacks.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/alerts/evaluate
 * Authenticated endpoint for Super Admin or automated cron trigger
 * to run alert evaluation against inventory, purchases, and digests.
 *
 * Security:
 * - NO fallback cron secret. Fails closed if CRON_SECRET is not configured.
 * - Constant-time comparison prevents timing side-channels.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronHeader = req.headers.get('x-cron-key');

    // Production security: Fail-closed if CRON_SECRET is absent
    const cronSecret = process.env.CRON_SECRET ? process.env.CRON_SECRET.trim() : null;
    let isCronAuthorized = false;

    if (cronSecret && cronSecret.length > 0) {
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      isCronAuthorized =
        (bearerToken ? timingSafeEqualStrings(bearerToken, cronSecret) : false) ||
        (cronHeader ? timingSafeEqualStrings(cronHeader.trim(), cronSecret) : false);
    }

    if (!isCronAuthorized) {
      const auth = await authenticateRequest(req);
      if (!auth.user) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }

      if (auth.user.role !== 'Super Admin') {
        return NextResponse.json(
          { error: 'Forbidden: Only Super Admin can evaluate system alerts' },
          { status: 403 }
        );
      }
    }

    const summary = await evaluateSystemAlerts();

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error('API /api/alerts/evaluate POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to evaluate alerts' },
      { status: 500 }
    );
  }
}
