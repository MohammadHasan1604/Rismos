import { NextRequest } from 'next/server';
import { prisma } from './db';
import { AuthenticatedUser } from './authPipeline';

export interface SensitiveActionVerificationResult {
  allowed: boolean;
  error?: string;
  status?: number;
}

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
 * Enforces step-up confirmation, mandatory rationale/notes, and privilege checks.
 */
export async function verifySensitiveAction(
  req: NextRequest | Request,
  body: any,
  user: AuthenticatedUser,
  actionType: 'VOID_SALE' | 'REFUND' | 'DELETE_USER' | 'ROLE_ESCALATION' | 'STOCK_WRITEOFF' | 'DELETE_STORE'
): Promise<SensitiveActionVerificationResult> {
  const requiresConfirm = await isSensitiveActionConfirmationEnabled();
  if (!requiresConfirm) {
    return { allowed: true };
  }

  // Check confirmation flag from body or header
  const bodyConfirmed = Boolean(
    body?.confirmAction ||
    body?.sensitiveConfirmed ||
    body?.confirmed ||
    body?.isConfirmed
  );
  const headerConfirmed = (req.headers as any).get?.('x-sensitive-action-confirm') === 'true';

  if (!bodyConfirmed && !headerConfirmed) {
    return {
      allowed: false,
      error: `Step-Up Confirmation Required: Action "${actionType}" is a critical operation requiring explicit authorization.`,
      status: 400,
    };
  }

  // Non-Super-Admins performing destructive actions must provide an audit reason
  const reason = (body?.reason || body?.notes || body?.comment || '').trim();
  if (user.role !== 'Super Admin' && reason.length < 3) {
    return {
      allowed: false,
      error: `Audit Trail Requirement: A valid reason or justification (min 3 characters) is mandatory to execute "${actionType}".`,
      status: 400,
    };
  }

  // Role escalation protection: Only Super Admin (Level 100) can escalate or modify roles
  if (actionType === 'ROLE_ESCALATION' && (user.role !== 'Super Admin' || user.securityLevel < 100)) {
    return {
      allowed: false,
      error: 'Forbidden: Role changes and privilege modifications require Super Admin credentials.',
      status: 403,
    };
  }

  return { allowed: true };
}
