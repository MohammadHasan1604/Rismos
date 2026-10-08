import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, hasPermission, createAuditLog } from '@/lib/authPipeline';
import { searchCustomerWithLegacyBridge } from '@/lib/services/legacyCustomerService';

/**
 * GET /api/customers/legacy/search - Search Customer across COSKO Master and Legacy DB
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone') || '';

    const result = await searchCustomerWithLegacyBridge(phone, user.role, user.store);

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('API /api/customers/legacy/search error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          'Historical customer/repair lookup is temporarily unavailable. You can continue with the current customer record.',
      },
      { status: 200 } // Return 200 with error flag to prevent UI crash
    );
  }
}
