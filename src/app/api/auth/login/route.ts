import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  comparePassword,
  signSessionToken,
  isValidAuthOrigin,
  hashToken,
  hashSessionToken,
} from '@/lib/auth';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getClientIp } from '@/lib/rateLimit';
import { createSecurityAlertNotification } from '@/lib/services/alertService';

const DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes temporary lockout
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days default in seconds
const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30-day session expiry constant in ms

export async function POST(req: NextRequest) {
  // 1. Origin / CSRF validation
  if (!isValidAuthOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.email || !body.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = body.email.toLowerCase().trim();
    const password = body.password;

    // Load authoritative security configuration from database
    const sysSettings = await prisma.systemSettings.findFirst().catch(() => null);
    const maxFailedAttempts =
      sysSettings?.maxLoginAttempts && sysSettings.maxLoginAttempts > 0
        ? sysSettings.maxLoginAttempts
        : DEFAULT_MAX_FAILED_LOGIN_ATTEMPTS;
    const sessionTimeoutMins =
      sysSettings?.sessionTimeoutMins && sysSettings.sessionTimeoutMins > 0
        ? sysSettings.sessionTimeoutMins
        : 43200; // 30 days in minutes
    const sessionCookieMaxAgeSecs = sessionTimeoutMins ? sessionTimeoutMins * 60 : SESSION_COOKIE_MAX_AGE;


    // 2. Fast In-Memory Rate Limiting Check (IP DDoS protection: 50 requests/15m; Account lockout: dynamic attempts/15m)
    const ipRateLimit = checkRateLimit(`ip:${clientIp}`, 50);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many login attempts from this network. Please try again in ${ipRateLimit.retryAfterSeconds || 900} seconds.`,
          retryAfter: ipRateLimit.retryAfterSeconds,
          locked: true,
        },
        { status: 429 }
      );
    }

    // 3. User Lookup in MySQL
    let user: any;
    try {
      user = await prisma.userAccount.findUnique({
        where: { email: cleanEmail },
        include: { storeAssignments: true },
      });
    } catch (dbError: any) {
      console.error('Database connection error during login lookup:', dbError?.message || dbError);
      return NextResponse.json(
        { error: 'Authentication service is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    // 4. Generic rejection on missing user (prevents account enumeration)
    if (!user) {
      recordFailedAttempt(`ip:${clientIp}`, 50);
      const r = recordFailedAttempt(`email:${cleanEmail}`, maxFailedAttempts);
      if (!r.allowed) {
        return NextResponse.json(
          {
            error: `Account is temporarily locked due to ${maxFailedAttempts} consecutive failed login attempts. Please try again in ${r.retryAfterSeconds || 900} seconds.`,
            retryAfter: r.retryAfterSeconds,
            locked: true,
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 5. Database-Authoritative Account Lockout Check (Cannot be bypassed by refresh, new tab, or IP change)
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
      return NextResponse.json(
        {
          error: `Account is temporarily locked due to ${maxFailedAttempts} consecutive failed login attempts. Please try again in ${retryAfterSeconds} seconds.`,
          retryAfter: retryAfterSeconds,
          locked: true,
        },
        { status: 429 }
      );
    }

    // If lockout window has expired, reset counter safely
    if (user.lockedUntil && user.lockedUntil <= now) {
      try {
        await prisma.userAccount.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        clearRateLimit(`email:${cleanEmail}`);
      } catch {}
    }

    // 6. Check if user is suspended or inactive
    if (user.status === 'Suspended' || user.status === 'Inactive') {
      return NextResponse.json(
        { error: 'Account is inactive or suspended. Please contact Super Admin.' },
        { status: 403 }
      );
    }

    // 7. Verify salted bcrypt hash
    let passwordMatch = false;
    try {
      passwordMatch = await comparePassword(password, user.passwordHash);
    } catch (hashError) {
      console.error('Error verifying password hash:', hashError);
      passwordMatch = false;
    }

    if (!passwordMatch) {
      const currentFailed = (user.failedLoginAttempts || 0) + 1;
      const isNowLocked = currentFailed >= maxFailedAttempts;
      const lockoutDate = isNowLocked ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

      try {
        await prisma.userAccount.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: currentFailed,
            lockedUntil: lockoutDate,
          },
        });
      } catch (dbUpdateErr) {
        console.error('Failed to update failed login attempts counter:', dbUpdateErr);
      }

      recordFailedAttempt(`ip:${clientIp}`, 50);
      recordFailedAttempt(`email:${cleanEmail}`, maxFailedAttempts);

      if (isNowLocked) {
        createSecurityAlertNotification({
          title: `Security Alert: Account Locked (${user.email})`,
          message: `User account "${user.email}" (${user.name}) was locked after ${maxFailedAttempts} consecutive failed login attempts from IP ${clientIp}.`,
          severity: 'error',
          userId: user.id,
          relatedEntityType: 'UserAccount',
          relatedEntityId: user.id,
        }).catch((err) => console.error('Failed to dispatch security alert:', err));

        return NextResponse.json(
          {
            error: `Account is temporarily locked due to ${maxFailedAttempts} consecutive failed login attempts. Please try again in 900 seconds.`,
            retryAfter: 900,
            locked: true,
          },
          { status: 429 }
        );
      }

      const remaining = Math.max(0, maxFailedAttempts - currentFailed);
      return NextResponse.json(
        {
          error: `Invalid email or password (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary account lockout)`,
          remainingAttempts: remaining,
        },
        { status: 401 }
      );
    }

    // 8. Successful Authentication - Clear rate limit & reset database lockout counters
    clearRateLimit(`ip:${clientIp}`);
    clearRateLimit(`email:${cleanEmail}`);

    try {
      await prisma.userAccount.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch (updateErr) {
      console.warn('Could not update last login & reset lockout timestamp:', updateErr);
    }

    const allowedStores = user.storeAssignments.map((a: any) => a.storeCode);
    if (user.storeScope && !allowedStores.includes(user.storeScope)) {
      allowedStores.push(user.storeScope);
    }

    // Enforce strict store scope RBAC: Non-Super Admin MUST be permanently assigned to a physical store
    const effectiveStore =
      user.role === 'Super Admin'
        ? user.storeScope || 'All Stores'
        : user.storeScope && user.storeScope !== 'All Stores'
          ? user.storeScope
          : allowedStores[0] || 'BLR';

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      securityLevel: user.securityLevel,
      store: effectiveStore,
      allowedStores:
        user.role === 'Super Admin'
          ? allowedStores.length > 0
            ? allowedStores
            : ['CENTRAL', 'BLR', 'HYD', 'DEL', 'MUM']
          : allowedStores.length > 0
            ? allowedStores
            : [effectiveStore],
      avatar: user.name.substring(0, 2).toUpperCase(),
      avatarUrl: user.avatarUrl || undefined,
      mustChangePassword: user.mustChangePassword || false,
    };

    // 9. Authoritative Session Creation:
    // Generate session ID -> Sign final JWT containing session ID -> Hash final JWT -> Create DB UserSession in MySQL
    // ONLY THEN set HttpOnly cookie and return success. NO JWT-only fallback.
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + sessionCookieMaxAgeSecs * 1000);
    const finalToken = signSessionToken({ ...sessionUser, sessionId }, sessionId);
    const finalTokenHash = hashSessionToken(finalToken);

    try {
      await (prisma as any).userSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: finalTokenHash,
          expiresAt,
          ipAddress: clientIp,
          userAgent: req.headers.get('user-agent')?.substring(0, 255) || null,
        },
      });
    } catch (sessionErr: any) {
      console.error('[Auth] CRITICAL: Failed to create database UserSession:', sessionErr);
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    // 10. Return response — token is ONLY in the HttpOnly cookie, NOT in the response body
    const response = NextResponse.json({
      success: true,
      user: sessionUser,
      mustChangePassword: sessionUser.mustChangePassword,
    });

    // Set secure HttpOnly session cookie matching configured timeout
    response.cookies.set('cosko_session', finalToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Unhandled login error:', error);
    return NextResponse.json(
      { error: 'Authentication service is temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  }
}
