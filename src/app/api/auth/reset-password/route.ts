import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { validatePasswordAgainstPolicy } from '@/lib/passwordPolicyServer';
import { invalidateUserSessions } from '@/lib/authPipeline';
import { getClientIp } from '@/lib/rateLimit';

/**
 * POST /api/auth/reset-password
 * Consumes a 24-hour tokenized reset request to securely set a new user password.
 * Enforces enterprise password policy (12+ chars, uppercase, lowercase, numbers, symbols).
 * Revokes all existing user sessions upon password reset.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
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

    // 4. Hash new password with bcrypt (cost factor 12)
    const hashedPassword = await hashPassword(newPassword);

    // 5. Atomic update: change password, mark token used, invalidate sessions
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.userAccount.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash: hashedPassword,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // Mark token consumed
      await (tx as any).passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          module: 'Auth',
          action: 'PASSWORD_RESET_COMPLETED',
          details: `User "${resetRecord.user.name}" (${resetRecord.user.email}) successfully reset their password via self-service reset token.`,
          userId: resetRecord.userId,
          userEmail: resetRecord.user.email,
          userRole: resetRecord.user.role,
          storeCode: resetRecord.user.storeScope || 'CENTRAL',
          ipAddress: clientIp,
        },
      });
    });

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
