import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { authenticateRequest, createAuditLog } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { comparePassword, hashToken } from '@/lib/auth';

/**
 * POST /api/auth/step-up
 * Authoritative Server-Side Re-Authentication for Sensitive Actions.
 *
 * Flow:
 * 1. Authenticate caller's session.
 * 2. Verify current user password against stored bcrypt hash.
 * 3. Issue a cryptographically random, single-use step-up grant token valid for 5 minutes.
 * 4. Record grant in MySQL DB.
 * 5. Return token for use in subsequent sensitive action execution.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { password, actionType, reason } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Current password is required to authorize critical actions' },
        { status: 400 }
      );
    }

    if (!actionType || typeof actionType !== 'string') {
      return NextResponse.json(
        { error: 'actionType is required for step-up grant' },
        { status: 400 }
      );
    }

    // Fetch user's stored password hash
    const dbUser = await prisma.userAccount.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, name: true, email: true, role: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    const isValid = await comparePassword(password, dbUser.passwordHash);
    if (!isValid) {
      await createAuditLog(
        user,
        'Auth',
        'Step-Up Re-Authentication Failed',
        `Failed step-up authorization attempt for action "${actionType}". Invalid password entered.`
      );
      return NextResponse.json(
        { error: 'Incorrect password. Step-up authorization denied.' },
        { status: 401 }
      );
    }

    // Generate random 32-byte token and sha256 hash
    const stepUpToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(stepUpToken);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes window

    await (prisma as any).stepUpGrant.create({
      data: {
        userId: user.id,
        tokenHash,
        actionType: actionType.trim().toUpperCase(),
        expiresAt,
      },
    });

    await createAuditLog(
      user,
      'Auth',
      'Step-Up Re-Authentication Granted',
      `Granted 5-minute single-use step-up token for action "${actionType}". Reason: ${reason || 'N/A'}`
    );

    return NextResponse.json({
      success: true,
      stepUpToken,
      expiresAt: expiresAt.toISOString(),
      actionType: actionType.trim().toUpperCase(),
    });
  } catch (error: any) {
    console.error('API /api/auth/step-up POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process step-up authorization' },
      { status: 500 }
    );
  }
}
