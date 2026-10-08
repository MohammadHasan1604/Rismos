import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { evaluateSystemAlerts } from '@/lib/services/alertService';

/**
 * POST /api/alerts/evaluate
 * Authenticated endpoint for Super Admin or automated cron trigger
 * to run alert evaluation against inventory, purchases, and digests.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronHeader = req.headers.get('x-cron-key');
    const configuredCronSecret = process.env.CRON_SECRET || 'rismos_scheduled_cron_secret_2026';
    const isCronAuthorized =
      (authHeader && authHeader === `Bearer ${configuredCronSecret}`) ||
      (cronHeader && cronHeader === configuredCronSecret);

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
