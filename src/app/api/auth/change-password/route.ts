import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  comparePassword,
  hashPassword,
  signSessionToken,
  hashToken,
  isValidAuthOrigin,
} from '@/lib/auth';
import { authenticateRequest, invalidateUserSessions, createAuditLog } from '@/lib/authPipeline';
import { validatePassword } from '@/lib/passwordPolicy';

/**
 * POST /api/auth/change-password
 * Secure password change for currently authenticated user.
 * Invalidates all other sessions after password change.
 */
export async function POST(req: NextRequest) {
  if (!isValidAuthOrigin(req)) {
    return NextResponse.json(
      { success: false, message: 'Forbidden: Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, message: auth.error || 'Unauthorized' },
        { status: auth.status }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: 'All password fields are required' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: 'New password and confirmation do not match' },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: passwordValidation.errors[0] || 'Password does not meet security requirements',
          message: passwordValidation.errors[0] || 'Password does not meet security requirements',
          details: passwordValidation.errors,
          strength: passwordValidation.score,
        },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, message: 'New password cannot be the same as current password' },
        { status: 400 }
      );
    }

    // Lookup user in MySQL
    const user = await prisma.userAccount.findUnique({
      where: { id: auth.user.id },
      include: { storeAssignments: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User account not found' },
        { status: 404 }
      );
    }

    // Verify current password against salted hash
    const isCurrentValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, message: 'Incorrect current password' },
        { status: 400 }
      );
    }

    // Hash new password with salted bcrypt (work factor 12)
    const newPasswordHash = await hashPassword(newPassword);

    // Commit new password and reset mustChangePassword flag
    const updatedUser = await prisma.userAccount.update({
      where: { id: auth.user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    // 🔒 SECURITY: Invalidate all OTHER sessions (password change = force re-login on other devices)
    await invalidateUserSessions(user.id, auth.user.sessionId);

    // Audit log
    await createAuditLog(
      auth.user,
      'Auth',
      'Password Changed',
      `User "${user.name}" changed their password. Other sessions invalidated.`
    );

    // Issue new token with updated session
    const allowedStores = user.storeAssignments.map((a) => a.storeCode);
    const updatedSessionUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role as any,
      securityLevel: updatedUser.securityLevel,
      store: updatedUser.storeScope,
      allowedStores:
        allowedStores.length > 0
          ? allowedStores
          : updatedUser.role === 'Super Admin'
            ? ['CENTRAL', 'BLR', 'HYD', 'DEL', 'MUM']
            : [updatedUser.storeScope],
      avatar: updatedUser.name.substring(0, 2).toUpperCase(),
      avatarUrl: updatedUser.avatarUrl || undefined,
      mustChangePassword: false,
      sessionId: auth.user.sessionId,
    };

    const newToken = signSessionToken(updatedSessionUser, auth.user.sessionId);

    // Update DB session with new token hash
    if (auth.user.sessionId && auth.user.sessionId !== 'jwt-only') {
      try {
        const newTokenHash = hashToken(newToken);
        await (prisma as any).userSession.update({
          where: { id: auth.user.sessionId },
          data: { tokenHash: newTokenHash },
        });
      } catch {}
    }

    const response = NextResponse.json({
      success: true,
      message: 'Password changed successfully. Other sessions have been invalidated.',
      user: updatedSessionUser,
    });

    // Update HttpOnly cookie with new token
    response.cookies.set('cosko_session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to change password.' },
      { status: 500 }
    );
  }
}
