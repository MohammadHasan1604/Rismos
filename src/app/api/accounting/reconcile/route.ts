import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { runRootFinancialReconciliation } from '@/lib/services/accountingService';

/**
 * GET / POST /api/accounting/reconcile
 * Runs full root data integrity and mathematical reconciliation across all transactions, ledger, and P&L.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Root financial reconciliation across all transactions is SUPER ADMIN ONLY
    if (user.role !== 'Super Admin' || user.securityLevel < 100) {
      return NextResponse.json(
        { error: 'Forbidden: Root reconciliation is restricted to Super Admin only.' },
        { status: 403 }
      );
    }

    const audit = await runRootFinancialReconciliation();
    return NextResponse.json(
      {
        success: true,
        audit,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/accounting/reconcile GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run root reconciliation' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
