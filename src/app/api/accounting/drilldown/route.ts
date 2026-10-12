import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireStoreScope } from '@/lib/authPipeline';
import { getDrillDownRecords } from '@/lib/services/accountingService';
import { getDateRange, parseDate } from '@/lib/dateUtils';

/**
 * GET /api/accounting/drilldown
 * Returns exact underlying records and line items that compose any clicked metric.
 * Query params: metric, store, period, startDate, endDate
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no access to financial drilldowns
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level for financial drilldown.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const metric = searchParams.get('metric');
    const requestedStore = searchParams.get('store');
    const period = searchParams.get('period') || 'This Month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    if (!metric) {
      return NextResponse.json({ error: 'Metric key is required' }, { status: 400 });
    }

    const storeScope = requireStoreScope(user, requestedStore, {
      allowAllStoresForSuperAdmin: true,
    });
    if (!storeScope.authorized) {
      return NextResponse.json({ error: storeScope.error }, { status: storeScope.status });
    }

    const effectiveStore = storeScope.effectiveStore || 'All Stores';

    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;

    if (startDateParam && endDateParam) {
      const s = parseDate(startDateParam);
      const e = parseDate(endDateParam);
      if (s) startDate = s;
      if (e) {
        e.setHours(23, 59, 59, 999);
        endDate = e;
      }
    } else if (period && period !== 'All Time') {
      const range = getDateRange(period);
      startDate = range.start;
      endDate = range.end;
    }

    const drilldown = await getDrillDownRecords(metric, {
      store: effectiveStore,
      startDate,
      endDate,
    });

    return NextResponse.json(
      {
        success: true,
        metric,
        scope: {
          store: effectiveStore,
          period,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
        },
        drilldown,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/accounting/drilldown GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve drill-down records' },
      { status: 500 }
    );
  }
}
