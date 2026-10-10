import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * GET /api/auth/verify-reset-token?token=...
 * Pre-flight verification for password reset links before rendering the form.
 *
 * Checks:
 * - Token existence in MySQL password_resets
 * - Token non-expired status (< 15 mins)
 * - Token unconsumed status (usedAt === null)
 * - User account active status
 *
 * Returns masked email and status without consuming the token.
 */
export async function GET(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Rate-limiting check to prevent token scanning (max 30 requests per 15m)
    const ipCheck = checkRateLimit(`pwd-verify:ip:${clientIp}`, 30);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          valid: false,
          reason: 'RATE_LIMITED',
          error: `Too many token verification requests. Please retry in ${ipCheck.retryAfterSeconds || 900} seconds.`,
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawToken = searchParams.get('token');

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return NextResponse.json(
        { valid: false, reason: 'INVALID', error: 'Missing reset token' },
        { status: 400 }
      );
    }

    const cleanToken = rawToken.trim();
    const hashedToken = crypto.createHash('sha256').update(cleanToken).digest('hex');

    const resetRecord = await (prisma as any).passwordReset.findFirst({
      where: { token: hashedToken },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!resetRecord || !resetRecord.user) {
      return NextResponse.json({
        valid: false,
        reason: 'INVALID',
        error: 'The reset link is invalid or has expired.',
      });
    }

    if (resetRecord.usedAt) {
      return NextResponse.json({
        valid: false,
        reason: 'USED',
        error: 'This password reset link has already been used. Please request a new link.',
      });
    }

    if (resetRecord.expiresAt < new Date()) {
      return NextResponse.json({
        valid: false,
        reason: 'EXPIRED',
        error: 'This password reset link has expired (15-minute window). Please request a new link.',
      });
    }

    if (resetRecord.user.status === 'Inactive' || resetRecord.user.status === 'Suspended') {
      return NextResponse.json({
        valid: false,
        reason: 'INVALID',
        error: 'The account associated with this link is not active. Please contact administrator.',
      });
    }

    // Safely mask email for UI confirmation without full data exposure
    const emailParts = resetRecord.user.email.split('@');
    const local = emailParts[0];
    const domain = emailParts[1] || '';
    const maskedLocal =
      local.length > 2
        ? `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}`
        : `${local[0]}***`;
    const emailMasked = `${maskedLocal}@${domain}`;

    return NextResponse.json({
      valid: true,
      userName: resetRecord.user.name,
      emailMasked,
      expiresAt: resetRecord.expiresAt,
    });
  } catch (error: any) {
    console.error('[AUTH] Verify reset token error:', error);
    return NextResponse.json(
      { valid: false, reason: 'ERROR', error: 'Unable to verify reset token at this time.' },
      { status: 500 }
    );
  }
}
