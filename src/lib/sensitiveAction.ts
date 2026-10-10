import { NextRequest } from 'next/server';
import { prisma } from './db';
import { AuthenticatedUser, createAuditLog } from './authPipeline';
import { hashToken } from './auth';

export interface SensitiveActionVerificationResult {
  allowed: boolean;
  error?: string;
  status?: number;
  stepUpRequired?: boolean;
}

export type SensitiveActionType =
  | 'VOID_SALE'
  | 'REFUND'
  | 'DELETE_USER'
  | 'ROLE_ESCALATION'
  | 'STOCK_WRITEOFF'
  | 'DELETE_STORE'
  | 'CONFIG_CHANGE';

/**
 * Checks whether sensitiveActionConfirm is enabled in database system settings
 */
export async function isSensitiveActionConfirmationEnabled(): Promise<boolean> {
  try {
    const sys = await (prisma as any).systemSettings.findFirst({
      select: { sensitiveActionConfirm: true },
    });
    return sys?.sensitiveActionConfirm !== false;
  } catch {
    return true; // Fail safe to requiring confirmation
  }
}

/**
 * Server-authoritative verification of sensitive/destructive actions.
 * Enforces real server-side step-up proof (via single-use grant token),
 * mandatory rationale/notes, and RBAC privilege checks.
 */
export async function verifySensitiveAction(
  req: NextRequest | Request,
  body: any,
  user: AuthenticatedUser,
  actionType: SensitiveActionType
): Promise<SensitiveActionVerificationResult> {
  // 1. RBAC Pre-checks: Role escalation or store deletion strictly requires Super Admin
  if (
    actionType === 'ROLE_ESCALATION' &&
    (user.role !== 'Super Admin' || user.securityLevel < 100)
  ) {
    return {
      allowed: false,
      error: 'Forbidden: Role changes and privilege modifications require Super Admin credentials.',
      status: 403,
    };
  }

  if (actionType === 'DELETE_STORE' && (user.role !== 'Super Admin' || user.securityLevel < 100)) {
    return {
      allowed: false,
      error: 'Forbidden: Store deletion requires Super Admin credentials.',
      status: 403,
    };
  }

  // 2. Audit Trail Requirement: Non-Super-Admins must provide justification (min 3 characters)
  const reason = (body?.reason || body?.notes || body?.comment || '').trim();
  if (user.role !== 'Super Admin' && reason.length < 3) {
    return {
      allowed: false,
      error: `Audit Trail Requirement: A valid reason or justification (min 3 characters) is mandatory to execute "${actionType}".`,
      status: 400,
    };
  }

  // 3. Check if sensitive action confirmation is globally required
  const requiresConfirm = await isSensitiveActionConfirmationEnabled();
  if (!requiresConfirm) {
    return { allowed: true };
  }

  // 4. Extract Real Server-Side Step-Up Proof Token
  const headers = req.headers as any;
  const rawToken =
    headers.get?.('x-step-up-token') ||
    headers.get?.('x-step-up-grant') ||
    headers['x-step-up-token'] ||
    headers['x-step-up-grant'] ||
    body?.stepUpToken ||
    body?.stepUpGrant;

  if (!rawToken || typeof rawToken !== 'string') {
    return {
      allowed: false,
      error: `Step-Up Authentication Required: Action "${actionType}" is a critical operation requiring recent re-authentication. Please provide a valid step-up token.`,
      status: 403,
      stepUpRequired: true,
    };
  }

  // 5. Validate Step-Up Grant in MySQL Database
  const tokenHash = hashToken(rawToken.trim());
  const grant = await (prisma as any).stepUpGrant.findUnique({
    where: { tokenHash },
  });

  if (!grant) {
    return {
      allowed: false,
      error: 'Invalid step-up grant token. Please re-authenticate.',
      status: 403,
      stepUpRequired: true,
    };
  }

  // Verify grant belongs to the authenticated user
  if (grant.userId !== user.id) {
    return {
      allowed: false,
      error: 'Step-up grant user mismatch. Re-authentication token does not belong to this user.',
      status: 403,
      stepUpRequired: true,
    };
  }

  // Verify action type match (allow ALL or wildcard)
  const normalizedAction = actionType.toUpperCase();
  if (
    grant.actionType !== normalizedAction &&
    grant.actionType !== 'ALL' &&
    grant.actionType !== '*'
  ) {
    return {
      allowed: false,
      error: `Step-up grant was issued for "${grant.actionType}", but requested action is "${normalizedAction}".`,
      status: 403,
      stepUpRequired: true,
    };
  }

  // Verify expiration
  if (grant.expiresAt < new Date()) {
    return {
      allowed: false,
      error: 'Step-up grant has expired (valid for 5 minutes). Please re-authenticate.',
      status: 403,
      stepUpRequired: true,
    };
  }

  // Verify single-use
  if (grant.usedAt !== null) {
    return {
      allowed: false,
      error: 'Step-up grant has already been used. Tokens are single-use only.',
      status: 403,
      stepUpRequired: true,
    };
  }

  // 6. Atomically Consume Grant (Single-Use Guarantee)
  const consumeResult = await (prisma as any).stepUpGrant.updateMany({
    where: {
      id: grant.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  if (consumeResult.count === 0) {
    return {
      allowed: false,
      error: 'Step-up grant conflict: token was already consumed concurrently.',
      status: 403,
      stepUpRequired: true,
    };
  }

  // 7. Audit Log the Verified Step-Up Action Execution
  await createAuditLog(
    user,
    'Security',
    'Step-Up Sensitive Action Executed',
    `Verified step-up execution for action "${actionType}". Reason: ${reason || 'N/A'}`
  );

  return { allowed: true };
}
