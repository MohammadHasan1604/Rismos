import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { disableDataConnection } from '@/lib/services/dataConnectionConfigStore';

/**
 * POST /api/settings/data-connections/disable - Disable the legacy data connection
 */
export async function POST(req: NextRequest) {
  try {
    const _authResult = await authenticateRequest(req);
    if (!_authResult.user) {
      return NextResponse.json({ error: _authResult.error }, { status: _authResult.status });
    }
    const user = _authResult.user;

    if (!user || user.role !== 'Super Admin' || user.securityLevel < 100) {
      return NextResponse.json({ error: 'Unauthorized: Super Admin only' }, { status: 403 });
    }

    disableDataConnection(user.name);

    await (prisma as any).auditLog.create({
      data: {
        module: 'Settings',
        action: 'DATA_CONNECTION_DISABLED',
        details: `Disabled Legacy Data Connection by Super Admin (${user.email})`,
        userEmail: user.email,
        userRole: user.role,
        storeCode: user.store,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Legacy database connection disabled successfully.',
    });
  } catch (error: any) {
    console.error('API /api/settings/data-connections/disable error:', error);
    return NextResponse.json({ error: 'Failed to disable connection' }, { status: 500 });
  }
}
