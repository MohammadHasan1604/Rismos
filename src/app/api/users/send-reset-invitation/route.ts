import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { authenticateRequest, createAuditLog } from '@/lib/authPipeline';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * POST /api/users/send-reset-invitation
 * Admin-initiated password reset invitation.
 *
 * RBAC Rules:
 * - Super Admin (Level 100): Can dispatch reset link to any Store Manager or Sales Manager.
 * - Store Manager (Level 80): Can dispatch reset link ONLY to Sales Managers within their own assigned store.
 * - Sales Manager (Level 40): Forbidden (403).
 * - Root Protection: Super Admin account cannot be reset via admin-initiated invitations.
 * - Store Isolation: Non-Super-Admin callers cannot trigger resets outside their assigned store.
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // Authenticate caller with fail-closed server-authoritative pipeline
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const authUser = auth.user;

    // Rate limiting per admin user
    const rateCheck = checkRateLimit(`admin-pwd-invite:${authUser.id}`, 20);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many reset invitations dispatched. Please wait ${rateCheck.retryAfterSeconds || 60} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || (!body.userId && !body.email)) {
      return NextResponse.json(
        { success: false, error: 'Target user ID or email is required' },
        { status: 400 }
      );
    }

    // Lookup target user in MySQL
    const targetUser = await prisma.userAccount.findFirst({
      where: body.userId
        ? { id: String(body.userId) }
        : { email: String(body.email).toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        storeScope: true,
        securityLevel: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User account not found' },
        { status: 404 }
      );
    }

    // 🔒 ROOT PROTECTION: Super Admin cannot be reset via invitation
    if (targetUser.role === 'Super Admin') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Forbidden: Super Admin password recovery is self-service only and cannot be triggered by external invitation.',
        },
        { status: 403 }
      );
    }

    // 🔒 ROLE-BASED ACCESS CONTROL & STORE ISOLATION
    if (authUser.role !== 'Super Admin') {
      // Sales Managers cannot send reset invitations
      if (authUser.role === 'Sales Manager') {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Sales Managers cannot dispatch password reset invitations.',
          },
          { status: 403 }
        );
      }

      // Store Managers can ONLY invite Sales Managers within their own store
      if (authUser.role === 'Store Manager') {
        if (targetUser.role !== 'Sales Manager') {
          return NextResponse.json(
            {
              success: false,
              error:
                'Forbidden: Store Managers can only dispatch reset invitations to Sales Managers.',
            },
            { status: 403 }
          );
        }

        const callerStores =
          authUser.allowedStores.length > 0 ? authUser.allowedStores : [authUser.store];
        if (!targetUser.storeScope || !callerStores.includes(targetUser.storeScope)) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Forbidden: You cannot dispatch reset invitations for staff outside your assigned store.',
            },
            { status: 403 }
          );
        }
      }
    }

    if (targetUser.status === 'Inactive' || targetUser.status === 'Suspended') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot send reset invitation: User account is currently ${targetUser.status.toLowerCase()}. Please activate the account first.`,
        },
        { status: 400 }
      );
    }

    // Generate secure 256-bit CSPRNG token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Token expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate existing unconsumed tokens for this user
    await (prisma as any).passwordReset.deleteMany({
      where: { userId: targetUser.id },
    });

    // Store hashed token in MySQL
    await (prisma as any).passwordReset.create({
      data: {
        userId: targetUser.id,
        token: hashedToken,
        expiresAt,
        ipAddress: clientIp,
      },
    });

    // Construct application reset URL
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      `${req.nextUrl.protocol}//${req.headers.get('host') || 'localhost:4028'}`;

    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    // Dispatch email
    const branding = await (prisma as any).brandingSetting.findFirst().catch(() => null);
    const appName = branding?.appName || 'RISMOS';

    await sendEmail({
      to: targetUser.email,
      subject: `${appName} POS - Password Reset Invitation`,
      template: 'password-reset',
      data: {
        userName: targetUser.name,
        resetUrl,
        expiresIn: '15 minutes',
        appName,
        invitedBy: authUser.name,
      },
    });

    // Audit log entry
    await createAuditLog(
      authUser,
      'Users & Roles',
      'PASSWORD_RESET_INVITATION_SENT',
      `Sent password reset invitation to user "${targetUser.name}" (${targetUser.email}, ${targetUser.role}) at store [${targetUser.storeScope}]. Link expires in 15m.`,
      targetUser.storeScope || authUser.store,
      clientIp
    );

    const responsePayload: any = {
      success: true,
      message: `Password reset invitation successfully dispatched to ${targetUser.email}. Link is valid for 15 minutes.`,
    };

    if (
      process.env.NODE_ENV !== 'production' &&
      req.headers.get('x-test-inspect-token') === 'true'
    ) {
      responsePayload._testOnlyToken = resetToken;
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[USERS] Send reset invitation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to dispatch password reset invitation.' },
      { status: 500 }
    );
  }
}
