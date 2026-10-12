import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import {
  createDeleteRequest,
  approveDeleteRequest,
  rejectDeleteRequest,
  DELETABLE_ENTITY_TYPES,
} from '@/lib/services/deleteApprovalService';

/**
 * GET /api/delete-requests — List delete requests
 * Super Admin: all requests
 * Store Manager: own requests only
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 80) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const entityType = searchParams.get('entityType');

    const whereClause: any = {};

    // Non-super-admin users only see their own requests
    if (user.securityLevel < 100) {
      whereClause.requesterId = user.id;
    }

    if (status) {
      whereClause.status = status.toUpperCase();
    }

    if (entityType && DELETABLE_ENTITY_TYPES.includes(entityType as any)) {
      whereClause.entityType = entityType;
    }

    const requests = await (prisma as any).deleteRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        requester: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
      },
    });

    // Parse JSON fields for display
    const formatted = requests.map((r: any) => ({
      ...r,
      dependencyImpact: r.dependencyImpact ? JSON.parse(r.dependencyImpact) : null,
      financialImpact: r.financialImpact ? JSON.parse(r.financialImpact) : null,
    }));

    const pendingCount = await (prisma as any).deleteRequest.count({
      where: { ...whereClause, status: 'PENDING' },
    });

    return NextResponse.json(
      {
        success: true,
        requests: formatted,
        pendingCount,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/delete-requests GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch delete requests' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/delete-requests — Create a new delete request
 * Required body: { entityType, entityId, reason }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to request deletions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { entityType, entityId, reason } = body;

    if (!entityType || !entityId || !reason) {
      return NextResponse.json(
        { error: 'entityType, entityId, and reason are required' },
        { status: 400 }
      );
    }

    const result = await createDeleteRequest(user as any, { entityType, entityId, reason });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(
      {
        success: true,
        deleteRequest: result.deleteRequest,
        message: 'Delete request submitted successfully. A Super Admin will review it.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('API /api/delete-requests POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create delete request' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/delete-requests — Approve or reject a delete request
 * Super Admin only.
 * Required body: { requestId, action: 'approve' | 'reject', rejectionReason? }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 100) {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can review delete requests' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { requestId, action, rejectionReason } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'requestId and action are required' }, { status: 400 });
    }

    if (action === 'approve') {
      const result = await approveDeleteRequest(user, requestId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        result: result.result,
        message: 'Delete request approved and executed.',
      });
    }

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json(
          { error: 'rejectionReason is required when rejecting' },
          { status: 400 }
        );
      }
      const result = await rejectDeleteRequest(user, requestId, rejectionReason);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: 'Delete request rejected.',
      });
    }

    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  } catch (error: any) {
    console.error('API /api/delete-requests PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process delete request' },
      { status: 500 }
    );
  }
}
