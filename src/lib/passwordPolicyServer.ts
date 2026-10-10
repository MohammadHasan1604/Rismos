import { prisma } from './db';
import { validatePassword, type PasswordValidationResult } from './passwordPolicy';

/**
 * Authoritative Server-Side Password Policy Resolver
 * Checks database systemSettings.enforcePasswordPolicy
 * SERVER-ONLY: Never import this file into client components ('use client')
 */
export async function validatePasswordAgainstPolicy(
  password: string
): Promise<PasswordValidationResult> {
  let enforceEnterprise = true;
  try {
    const sys = await (prisma as any).systemSettings.findFirst({
      select: { enforcePasswordPolicy: true },
    });
    if (sys && sys.enforcePasswordPolicy !== undefined) {
      enforceEnterprise = Boolean(sys.enforcePasswordPolicy);
    }
  } catch {
    // Fail safe to enterprise
  }
  return validatePassword(password, { enforceEnterprise });
}
