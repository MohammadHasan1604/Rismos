import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { checkDurableRateLimit, recordDurableRateLimitAttempt, getClientIp } from '@/lib/rateLimit';
import { buildTrustedResetUrl } from '@/lib/trustedOrigin';

/**
 * POST /api/auth/send-reset-link
 * Initiates self-service password reset flow.
 * Rate-limited: Maximum 3 attempts per hour per account, 10 per 15 minutes per IP.
 * Security: Generic response on unknown email (prevents account enumeration).
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Rate-limiting by IP (max 10 requests per 15 minutes)
    const ipCheck = await checkDurableRateLimit(`pwd-reset:ip:${clientIp}`, 10, 900);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many password reset requests from this network. Please retry in ${ipCheck.retryAfterSeconds || 900} seconds.`,
          retryAfter: ipCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.email || typeof body.email !== 'string') {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const cleanEmail = body.email.toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(cleanEmail).digest('hex');

    // Rate-limiting by account (hashed key): max 3 requests per hour
    const emailCheck = await checkDurableRateLimit(`pwd-reset:account:${emailHash}`, 3, 3600);
    if (!emailCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many reset requests for this account. Please wait ${emailCheck.retryAfterSeconds || 3600} seconds before trying again.`,
          retryAfter: emailCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }
    await recordDurableRateLimitAttempt(`pwd-reset:account:${emailHash}`, 3, 3600);

    // Lookup user in MySQL
    const user = await prisma.userAccount.findUnique({
      where: { email: cleanEmail },
      select: { id: true, name: true, email: true, status: true, storeScope: true },
    });

    const GENERIC_SUCCESS_MESSAGE =
      'If the provided email corresponds to an active account, a password reset link has been dispatched.';

    if (!user || user.status === 'Inactive' || user.status === 'Suspended') {
      // 🔒 Anti-Enumeration: Return generic success even if user does not exist or is inactive
      return NextResponse.json({
        success: true,
        message: GENERIC_SUCCESS_MESSAGE,
      });
    }

    // Generate secure 256-bit (32 bytes) CSPRNG hex token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Token expires strictly in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate any previously unconsumed tokens for this user
    await (prisma as any).passwordReset.deleteMany({
      where: { userId: user.id },
    });

    // Store hashed token in MySQL
    await (prisma as any).passwordReset.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
        ipAddress: clientIp,
      },
    });

    // Build trusted canonical reset URL (HTTPS enforced in prod, no host header injection)
    const resetUrl = buildTrustedResetUrl(req, resetToken);

    // Send email with reset instructions
    const branding = await (prisma as any).brandingSetting.findFirst().catch(() => null);
    const appName = branding?.appName || 'RISMOS';

    const emailResult = await sendEmail({
      to: user.email,
      subject: `${appName} POS - Password Reset Request`,
      template: 'password-reset',
      data: {
        userName: user.name,
        resetUrl,
        expiresIn: '15 minutes',
        appName,
      },
    });

    if (!emailResult.success) {
      console.warn(`[AUTH] Reset email dispatch failed for user ${user.id}: ${emailResult.error}`);
    }

    // Record in Audit Log without exposing token
    try {
      await prisma.auditLog.create({
        data: {
          module: 'Auth',
          action: 'PASSWORD_RESET_REQUESTED',
          details: `Self-serve password reset token generated for user "${user.name}" (${user.email}). Expires in 15m.`,
          userId: user.id,
          userEmail: user.email,
          userRole: 'Staff',
          storeCode: user.storeScope || 'CENTRAL',
          ipAddress: clientIp,
        },
      });
    } catch (auditErr) {
      console.warn('[AUTH] Could not write reset audit log:', auditErr);
    }

    // Anti-Enumeration: Return exact same message as non-existent user
    const responsePayload: any = {
      success: true,
      message: GENERIC_SUCCESS_MESSAGE,
    };

    // Only allow test runner inspection in non-production with explicit private test header or test runner execution
    if (
      process.env.NODE_ENV !== 'production' &&
      (req.headers.get('x-test-inspect-token') === 'true' ||
        process.env.npm_lifecycle_event?.includes('test') ||
        process.env.TEST_MODE === 'true')
    ) {
      responsePayload._testOnlyToken = resetToken;
      responsePayload.resetToken = resetToken;
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[AUTH] Send reset link error:', error);
    return NextResponse.json(
      { error: 'Failed to process password reset request. Please try again later.' },
      { status: 500 }
    );
  }
}
