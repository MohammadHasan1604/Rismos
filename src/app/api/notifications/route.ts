import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';

/**
 * GET /api/notifications — Fetch user's notifications
 * Supports pagination, unread count, and category filtering.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const category = searchParams.get('category');

    const whereClause: any = { userId: user.id };
    if (unreadOnly) whereClause.isRead = false;
    if (category) whereClause.category = category;

    const [notifications, unreadCount, totalCount] = await Promise.all([
      (prisma as any).notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      (prisma as any).notification.count({
        where: { userId: user.id, isRead: false },
      }),
      (prisma as any).notification.count({
        where: { userId: user.id },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        notifications,
        unreadCount,
        totalCount,
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      }
    );
  } catch (error: any) {
    console.error('API /api/notifications GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications — Mark notification(s) as read
 * Body: { notificationId?: string, markAllRead?: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const body = await req.json();

    if (body.markAllRead) {
      await (prisma as any).notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      await broadcastRealtimeEvent(`user-${user.id}`, 'NOTIFICATION_UPDATED', {
        userId: user.id,
        action: 'all_read',
      });
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (body.notificationId) {
      await (prisma as any).notification.updateMany({
        where: { id: body.notificationId, userId: user.id },
        data: { isRead: true },
      });
      await broadcastRealtimeEvent(`user-${user.id}`, 'NOTIFICATION_UPDATED', {
        userId: user.id,
        notificationId: body.notificationId,
        action: 'read',
      });
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    return NextResponse.json(
      { error: 'notificationId or markAllRead is required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('API /api/notifications PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update notification' },
      { status: 500 }
    );
  }
}
