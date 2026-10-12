import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import {
  getConsolidatedPnL,
  getStoreOperationalPnL,
  getCentralTransferPnL,
} from '@/lib/services/accountingService';
import { getDateRange, parseDate } from '@/lib/dateUtils';

/**
 * GET /api/accounting
 * Comprehensive Multi-Store P&L Accounting Engine
 * Query params: store, period, startDate, endDate, view ('consolidated' | 'store' | 'central' | 'all')
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no access to financial accounting records
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level for financial accounting.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawStore = searchParams.get('store');
    const period = searchParams.get('period') || 'This Month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const rawView = searchParams.get('view');

    // Store isolation check: Super Admin Only for cross-store or consolidated accounting
    let effectiveStore: string;
    let effectiveView: string;

    if (user.role === 'Super Admin') {
      effectiveStore = rawStore || 'All Stores';
      effectiveView = rawView || 'all';
    } else {
      // Non-Super-Admin (Store Manager)
      if (rawStore && rawStore !== 'All Stores' && rawStore !== user.store) {
        return NextResponse.json(
          {
            error:
              "Forbidden: You do not have permission to access another store's accounting records.",
          },
          { status: 403 }
        );
      }
      if (rawStore === 'All Stores' || rawView === 'consolidated' || rawView === 'central') {
        return NextResponse.json(
          {
            error:
              'Forbidden: Consolidated and central views across stores are restricted to Super Admin only.',
          },
          { status: 403 }
        );
      }
      effectiveStore = user.store;
      effectiveView = 'store';
    }

    // Determine date boundary
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

    const filter = {
      store: effectiveStore,
      startDate,
      endDate,
    };

    // Parallel fetch required statements (non-Super Admin never gets consolidated or central statements)
    const isSuperAdmin = user.role === 'Super Admin';
    const [consolidated, storePnL, centralPnL] = await Promise.all([
      isSuperAdmin && (effectiveView === 'all' || effectiveView === 'consolidated')
        ? getConsolidatedPnL(filter)
        : null,
      effectiveView === 'all' || effectiveView === 'store' ? getStoreOperationalPnL(filter) : null,
      isSuperAdmin && (effectiveView === 'all' || effectiveView === 'central')
        ? getCentralTransferPnL({ startDate, endDate })
        : null,
    ]);

    return NextResponse.json(
      {
        success: true,
        scope: {
          store: effectiveStore,
          period,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
        },
        consolidated,
        storePnL,
        centralPnL,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/accounting GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate accounting statements' },
      { status: 500 }
    );
  }
}
