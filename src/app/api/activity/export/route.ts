import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { getClientIp } from '@/lib/rateLimit';

function getLocalDateString(date: Date, timezone = 'Asia/Kolkata'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function computeDateRange(
  range: string,
  customStart?: string,
  customEnd?: string,
  timezone = 'Asia/Kolkata'
) {
  const now = new Date();
  const todayStr = getLocalDateString(now, timezone);

  if (range === 'today') return { startDate: todayStr, endDate: todayStr };
  if (range === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yStr = getLocalDateString(yesterday, timezone);
    return { startDate: yStr, endDate: yStr };
  }
  if (range === 'this_week') {
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
    return { startDate: getLocalDateString(monday, timezone), endDate: todayStr };
  }
  if (range === 'this_month') {
    return { startDate: todayStr.substring(0, 8) + '01', endDate: todayStr };
  }
  if (range === 'custom') {
    return { startDate: customStart || todayStr, endDate: customEnd || todayStr };
  }
  return { startDate: '2020-01-01', endDate: '2099-12-31' };
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

    // Strict RBAC: Work Activity export is SUPER ADMIN ONLY (Requirement I)
    const isSuperAdmin = caller.role === 'Super Admin' || caller.securityLevel >= 100;
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Work Activity data export is restricted to Super Admin only.' },
        { status: 403 }
      );
    }

    const { startDate, endDate } = computeDateRange(range, customStart, customEnd, timezone);

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
        status: true,
        lastLogin: true,
      },
      orderBy: { name: 'asc' },
    });

    const userIds = users.map((u) => u.id);

    const dailyRecords: any[] = await (prisma as any).attendanceDay.findMany({
      where: {
        userId: { in: userIds },
        localDate: { gte: startDate, lte: endDate },
      },
      orderBy: { shiftStartUtc: 'desc' },
    });

    // Create Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          module: 'Work Activity',
          action: 'EXPORT_REPORT',
          details: `Exported work activity report for period [${range}: ${startDate} to ${endDate}] with ${users.length} users.`,
          userEmail: caller.email,
          userRole: caller.role,
          storeCode: caller.store || 'CENTRAL',
          ipAddress: getClientIp(req),
        },
      });
    } catch (auditErr) {
      console.warn('Could not record export audit log:', auditErr);
    }

    // Generate CSV
    const rows = [
      [
        'User Name',
        'Email Address',
        'Role',
        'Store Scope',
        'Working Days',
        'Total Working Minutes',
        'Total Working Hours',
        'Total Idle Minutes',
        'Total Sessions',
        'First Login (Range)',
        'Last Activity (Range)',
        'Account Status',
      ],
    ];

    const now = new Date();
    for (const u of users) {
      const userDays = dailyRecords.filter((d: any) => d.userId === u.id);
      const totalActiveSeconds = userDays.reduce((acc: number, curr: any) => {
        let dur = curr.totalSeconds;
        if (curr.status === 'ACTIVE') {
          dur = Math.max(
            0,
            Math.floor((now.getTime() - new Date(curr.shiftStartUtc).getTime()) / 1000)
          );
        }
        return acc + dur;
      }, 0);
      const totalIdleSeconds = 0;
      const workingDays = userDays.length;
      const sessionsCount = userDays.length;

      const firstLogin =
        userDays.length > 0 ? userDays[userDays.length - 1].shiftStartUtc : u.lastLogin;
      const lastActivity =
        userDays.length > 0
          ? userDays[0].shiftEndUtc ||
            (userDays[0].status === 'ACTIVE' ? now : userDays[0].shiftStartUtc)
          : u.lastLogin;

      rows.push([
        `"${u.name.replace(/"/g, '""')}"`,
        `"${u.email.replace(/"/g, '""')}"`,
        `"${u.role.replace(/"/g, '""')}"`,
        `"${u.storeScope.replace(/"/g, '""')}"`,
        `${workingDays}`,
        `${Math.floor(totalActiveSeconds / 60)}`,
        `${(totalActiveSeconds / 3600).toFixed(2)}`,
        `${Math.floor(totalIdleSeconds / 60)}`,
        `${sessionsCount}`,
        firstLogin ? `"${new Date(firstLogin).toISOString()}"` : '""',
        lastActivity ? `"${new Date(lastActivity).toISOString()}"` : '""',
        `"${u.status}"`,
      ]);
    }

    const csvContent = rows.map((r) => r.join(',')).join('\r\n');
    const filename = `work_activity_report_${range}_${startDate}_to_${endDate}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('API /api/activity/export error:', err);
    return NextResponse.json({ error: err.message || 'Export error' }, { status: 500 });
  }
}
