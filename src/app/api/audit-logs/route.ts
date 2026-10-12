import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/audit-logs - Retrieve audit logs
 * REQUIRES: Super Admin only — enterprise audit is a privileged operation
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Super Admin only — audit logs are a privileged, enterprise-level feature
    if (user.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Audit log access is restricted to Super Admin only' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
    const moduleName = searchParams.get('module');
    const storeCode = searchParams.get('store');

    const whereClause: any = {};
    if (moduleName) {
      whereClause.module = moduleName;
    }
    if (storeCode && storeCode !== 'All Stores' && storeCode !== 'ALL') {
      whereClause.storeCode = storeCode;
    }

    const logs = await (prisma as any).auditLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(
      { success: true, logs },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/audit-logs GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve audit logs' }, { status: 500 });
  }
}

/**
 * POST /api/audit-logs - Create audit log entry
 * SECURITY: userEmail, userRole, and ipAddress are always derived from the session.
 * Client cannot spoof audit log attribution.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const body = await req.json();

    if (!body.module || !body.action) {
      return NextResponse.json({ error: 'Module and action are required' }, { status: 400 });
    }

    // SECURITY: Always use session-derived values — never trust client-supplied userEmail/userRole
    const log = await (prisma as any).auditLog.create({
      data: {
        module: body.module,
        action: body.action,
        details: body.details || '',
        userEmail: user.email || user.name, // from session, NOT body
        userRole: user.role, // from session, NOT body
        storeCode: body.storeCode || user.store || 'CENTRAL',
      },
    });

    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch (error: any) {
    console.error('API /api/audit-logs POST error:', error);
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 });
  }
}
