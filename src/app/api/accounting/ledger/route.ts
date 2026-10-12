import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireStoreScope } from '@/lib/authPipeline';
import { getGeneralLedgerEntries } from '@/lib/services/accountingService';
import { getDateRange, parseDate } from '@/lib/dateUtils';

/**
 * GET /api/accounting/ledger
 * Returns paginated, searchable, categorized Financial General Ledger entries.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no access to financial ledger
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level for financial ledger.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedStore = searchParams.get('store');
    const period = searchParams.get('period');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const category = searchParams.get('category') || 'ALL';
    const refType = searchParams.get('refType') || 'ALL';
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

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

    const result = await getGeneralLedgerEntries({
      store: effectiveStore,
      startDate,
      endDate,
      category,
      refType,
      search,
      page,
      limit,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/accounting/ledger GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve ledger entries' },
      { status: 500 }
    );
  }
}
