import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { validatePasswordAgainstPolicy } from '@/lib/passwordPolicyServer';
import { invalidateUserSessions } from '@/lib/authPipeline';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * POST /api/auth/reset-password
 * Consumes a tokenized reset request to securely set a new user password.
 * Enforces enterprise password policy (12+ chars, uppercase, lowercase, numbers, symbols).
 * Uses atomic conditional consumption to prevent concurrent race conditions.
 * Revokes all existing user sessions upon password reset.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Rate limiting on password submission attempts (max 20 per 15 mins per IP)
    const ipCheck = checkRateLimit(`pwd-reset-submit:ip:${clientIp}`, 20);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many password reset attempts. Please retry in ${ipCheck.retryAfterSeconds || 900} seconds.`,
          retryAfter: ipCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body || !body.resetToken || !body.newPassword) {
      return NextResponse.json(
        { error: 'Reset token and new password are required' },
        { status: 400 }
      );
    }

    const { resetToken, newPassword } = body;

    // 1. Validate password strength with authoritative server-side policy
    const passwordValidation = await validatePasswordAgainstPolicy(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          error: 'Password does not meet security requirements',
          requirements: passwordValidation.errors,
          details: passwordValidation.errors,
          suggested: 'Use 12+ chars with uppercase, lowercase, numbers, and symbols',
          score: passwordValidation.score,
        },
        { status: 400 }
      );
    }

    // 2. Hash token to look up in MySQL
    const hashedToken = crypto.createHash('sha256').update(String(resetToken).trim()).digest('hex');

    // 3. Find active, non-expired, unconsumed reset token
    const resetRecord = await (prisma as any).passwordReset.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            storeScope: true,
          },
        },
      },
    });

    if (!resetRecord || !resetRecord.user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token. Please request a new link.' },
        { status: 401 }
      );
    }

    if (resetRecord.user.status === 'Inactive' || resetRecord.user.status === 'Suspended') {
      return NextResponse.json(
        { error: 'Account is inactive or suspended. Cannot reset password.' },
        { status: 403 }
      );
    }

    // 4. Hash new password with bcrypt (cost factor 12)
    const hashedPassword = await hashPassword(newPassword);

    // 5. Atomic transaction: conditional token consumption + password update + audit logging
    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        // Atomic conditional consumption: Must match unused status and valid expiration
        const tokenConsumption = await (tx as any).passwordReset.updateMany({
          where: {
            id: resetRecord.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });

        if (tokenConsumption.count === 0) {
          throw new Error('TOKEN_ALREADY_CONSUMED_OR_EXPIRED');
        }

        // Update password and clear any failed login lockouts
        await tx.userAccount.update({
          where: { id: resetRecord.userId },
          data: {
            passwordHash: hashedPassword,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // Audit log entry
        await tx.auditLog.create({
          data: {
            module: 'Auth',
            action: 'PASSWORD_RESET_COMPLETED',
            details: `User "${resetRecord.user.name}" (${resetRecord.user.email}) successfully reset their password via tokenized recovery.`,
            userId: resetRecord.userId,
            userEmail: resetRecord.user.email,
            userRole: resetRecord.user.role,
            storeCode: resetRecord.user.storeScope || 'CENTRAL',
            ipAddress: clientIp,
          },
        });
      });
    } catch (txError: any) {
      if (txError.message === 'TOKEN_ALREADY_CONSUMED_OR_EXPIRED') {
        return NextResponse.json(
          { error: 'Reset token has already been used or has expired. Please request a new link.' },
          { status: 401 }
        );
      }
      throw txError;
    }

    // 6. Invalidate all existing sessions (prevents unauthorized access from old sessions)
    await invalidateUserSessions(resetRecord.userId);

    return NextResponse.json({
      success: true,
      message: 'Password reset successful. Please log in with your new password.',
      score: passwordValidation.score,
    });
  } catch (error: any) {
    console.error('[AUTH] Reset password failed:', error);
    return NextResponse.json(
      { error: 'Password reset failed. Please retry or contact system administrator.' },
      { status: 500 }
    );
  }
}
