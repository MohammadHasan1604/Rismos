import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, recordFailedAttempt, getClientIp } from '@/lib/rateLimit';

/**
 * POST /api/auth/send-reset-link
 * Initiates self-service password reset flow.
 * Rate-limited: Maximum 3 attempts per hour per email/IP.
 * Security: Generic response on unknown email (prevents account enumeration).
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Rate-limiting by IP (max 10 requests per 15 minutes)
    const ipCheck = checkRateLimit(`pwd-reset:ip:${clientIp}`, 10);
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

    // Rate-limiting by email: max 3 requests per hour
    const emailCheck = checkRateLimit(`pwd-reset:email:${cleanEmail}`, 3);
    if (!emailCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many reset requests for this account. Please wait ${emailCheck.retryAfterSeconds || 3600} seconds before trying again.`,
          retryAfter: emailCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }
    recordFailedAttempt(`pwd-reset:email:${cleanEmail}`, 3);

    // Lookup user in MySQL
    const user = await prisma.userAccount.findUnique({
      where: { email: cleanEmail },
      select: { id: true, name: true, email: true, status: true, storeScope: true },
    });

    if (!user || user.status === 'Inactive' || user.status === 'Suspended') {
      // 🔒 Anti-Enumeration: Return generic success even if user does not exist
      return NextResponse.json({
        success: true,
        message: 'If the provided email corresponds to an active account, a password reset link has been dispatched.',
      });
    }

    // Generate secure 256-bit (32 bytes) hex token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Token expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

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

    // Build reset URL
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      `${req.nextUrl.protocol}//${req.headers.get('host') || 'localhost:4028'}`;

    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    // Send email with reset instructions
    await sendEmail({
      to: user.email,
      subject: 'COSKO POS - Password Reset Request',
      template: 'password-reset',
      data: {
        userName: user.name,
        resetUrl,
        expiresIn: '24 hours',
      },
    });

    // Record in Audit Log
    try {
      await prisma.auditLog.create({
        data: {
          module: 'Auth',
          action: 'PASSWORD_RESET_REQUESTED',
          details: `Self-serve password reset token generated for user "${user.name}" (${user.email}). Expires in 24h.`,
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

    return NextResponse.json({
      success: true,
      message: 'Password reset link sent to email',
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined, // Useful for automated tests
    });
  } catch (error: any) {
    console.error('[AUTH] Send reset link error:', error);
    return NextResponse.json(
      { error: 'Failed to process password reset request. Please try again later.' },
      { status: 500 }
    );
  }
}
