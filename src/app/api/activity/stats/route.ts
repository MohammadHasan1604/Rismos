import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import {
  buildUserActivitySummary,
  formatHHMMSS,
  getLocalDateString,
} from '@/lib/services/activityCalculationService';

/**
 * GET /api/activity/stats - Phase 2 activity stats using activityCalculationService
 *
 * Uses server-calculated durations. Shows HH:MM:SS precision.
 * Includes anomaly detection and disclaimer about browser activity.
 * Enforces strict RBAC: non-admin sees only their own data.
 */
function computeDateRange(
  range: string,
  customStart?: string,
  customEnd?: string,
  timezone = 'Asia/Kolkata'
) {
  const now = new Date();
  const todayStr = getLocalDateString(now, timezone);

  if (range === 'today') {
    return { startDate: todayStr, endDate: todayStr };
  }

  if (range === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yStr = getLocalDateString(yesterday, timezone);
    return { startDate: yStr, endDate: yStr };
  }

  if (range === 'this_week') {
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
    return {
      startDate: getLocalDateString(monday, timezone),
      endDate: todayStr,
    };
  }

  if (range === 'this_month') {
    const startOfMonth = todayStr.substring(0, 8) + '01';
    return {
      startDate: startOfMonth,
      endDate: todayStr,
    };
  }

  if (range === 'custom') {
    return {
      startDate: customStart || todayStr,
      endDate: customEnd || todayStr,
    };
  }

  // 'all_time'
  return {
    startDate: '2020-01-01',
    endDate: '2099-12-31',
  };
}

export async function GET(req: NextRequest) {
  try {
    const _auth = await authenticateRequest(req);
    if (!_auth.user) {
      return NextResponse.json({ error: _auth.error }, { status: _auth.status });
    }
    const caller = _auth.user;

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || 'today';
    const customStart = searchParams.get('startDate') || undefined;
    const customEnd = searchParams.get('endDate') || undefined;
    const reqUserId = searchParams.get('userId') || undefined;
    const reqStore = searchParams.get('storeCode') || undefined;
    const timezone = searchParams.get('timezone') || 'Asia/Kolkata';

    // Strict RBAC: Work Activity stats is SUPER ADMIN ONLY (Requirement I)
    const isSuperAdmin = caller.role === 'Super Admin' || caller.securityLevel >= 100;
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Work Activity data is restricted to Super Admin only.' },
        { status: 403 }
      );
    }

    const { startDate, endDate } = computeDateRange(range, customStart, customEnd, timezone);

    // Fetch relevant users based on caller role
    const userWhere: any = {};
    if (reqUserId && reqUserId !== 'all') {
      userWhere.id = reqUserId;
    } else if (reqStore && reqStore !== 'All Stores' && reqStore !== 'all') {
      userWhere.storeScope = reqStore;
    }

    const users = await prisma.userAccount.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        storeScope: true,
        avatarUrl: true,
        status: true,
        lastLogin: true,
      },
      orderBy: { name: 'asc' },
    });

    // Use the centralized activity calculation service
    const userStats = await buildUserActivitySummary(users, startDate, endDate, timezone);

    // Compute aggregate summary metrics
    const totalTeamActiveSeconds = userStats.reduce((acc, u) => acc + u.totalActiveSeconds, 0);
    const totalTeamSessions = userStats.reduce((acc, u) => acc + u.sessionCount, 0);
    const activeStaffTodayCount = userStats.filter((u) => u.liveStatus === 'ONLINE').length;
    const totalWorkingDaysAllUsers = userStats.reduce((acc, u) => acc + u.workingDays, 0);
    const averageDailyHours =
      totalWorkingDaysAllUsers > 0
        ? (totalTeamActiveSeconds / 3600 / totalWorkingDaysAllUsers).toFixed(1)
        : '0.0';

    return NextResponse.json({
      success: true,
      range,
      filter: { startDate, endDate, timezone },
      summary: {
        totalWorkingMinutes: Math.floor(totalTeamActiveSeconds / 60),
        totalWorkingHours: (totalTeamActiveSeconds / 3600).toFixed(1),
        formattedTotalActive: formatHHMMSS(totalTeamActiveSeconds),
        totalSessions: totalTeamSessions,
        activeStaffOnline: activeStaffTodayCount,
        averageDailyHours,
        totalUsersCount: userStats.length,
      },
      users: userStats.map((u) => ({
        ...u,
        formattedActiveTotal: formatHHMMSS(u.totalActiveSeconds),
        formattedIdleTotal: formatHHMMSS(u.totalIdleSeconds),
        formattedAuthenticatedTotal: formatHHMMSS(u.totalAuthenticatedSeconds),
        totalWorkingMinutes: Math.floor(u.totalActiveSeconds / 60),
        totalWorkingHours: (u.totalActiveSeconds / 3600).toFixed(1),
        totalIdleMinutes: Math.floor(u.totalIdleSeconds / 60),
      })),
      disclaimer:
        'Browser activity tracking measures tab visibility and heartbeat responsiveness. It does not prove physical presence or productive work output.',
      isSuperAdmin,
    });
  } catch (err: any) {
    console.error('API /api/activity/stats error:', err);
    return NextResponse.json({ error: err.message || 'Stats error' }, { status: 500 });
  }
}
