import { prisma } from './db';

/**
 * Enterprise Password Policy Validator & Entropy Scorer
 * Enforces NIST SP 800-63B standards:
 * - Minimum 12 characters (or 8 for baseline)
 * - Uppercase letters (A-Z)
 * - Lowercase letters (a-z)
 * - Decimal numbers (0-9)
 * - Special characters (!@#$%^&* etc.)
 * - Rejection of common weak sequences (qwerty, 123456, admin, cosko, rismos, repeating chars)
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  score: number; // 0-100 (entropy score)
}

export function validatePassword(
  password: string,
  options?: { enforceEnterprise?: boolean }
): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;
  const isEnterprise = options?.enforceEnterprise !== false;

  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      errors: [isEnterprise ? 'Password must be at least 12 characters long' : 'Password must be at least 8 characters long'],
      score: 0,
    };
  }

  // 1. Length Check
  const minLength = isEnterprise ? 12 : 8;
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  } else {
    score += 20;
  }

  // 2. Uppercase Letters
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
  } else {
    score += 15;
  }

  // 3. Lowercase Letters
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
  } else {
    score += 15;
  }

  // 4. Numbers
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
  } else {
    score += 15;
  }

  // 5. Special Characters (Enterprise requirement)
  if (isEnterprise) {
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`^]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&* etc.)');
    } else {
      score += 15;
    }
  } else {
    score += 15;
  }

  // 6. Common Weak Patterns
  const weakPatterns: Array<{ pattern: RegExp; desc: string }> = [
    { pattern: /123456/, desc: 'sequential numbers' },
    { pattern: /qwerty/i, desc: 'keyboard pattern "qwerty"' },
    { pattern: /password/i, desc: 'the word "password"' },
    { pattern: /admin/i, desc: 'the word "admin"' },
    { pattern: /cosko/i, desc: 'brand name "cosko"' },
    { pattern: /rismos/i, desc: 'brand name "rismos"' },
    { pattern: /(.)\1{4,}/, desc: '5 or more repeated identical characters' },
  ];

  let weakPatternFound = false;
  for (const { pattern, desc } of weakPatterns) {
    if (pattern.test(password)) {
      errors.push(`Password contains an easily guessable pattern (${desc})`);
      weakPatternFound = true;
    }
  }
  if (weakPatternFound) {
    score -= 20;
  }

  // Length Bonuses for high entropy
  if (password.length >= 15) {
    score += 10;
  }
  if (password.length >= 18) {
    score += 10;
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    valid: errors.length === 0,
    errors,
    score: finalScore,
  };
}

/**
 * Generates password strength visual feedback display string.
 * @example "Password strength: ████████░░ 85% (Strong)"
 */
export function getPasswordStrengthDisplay(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round(clamped / 10);
  const empty = 10 - filled;
  const strength = clamped < 40 ? 'Weak' : clamped < 70 ? 'Fair' : clamped < 90 ? 'Good' : 'Strong';

  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${clamped}% (${strength})`;
}

/**
 * Authoritative Server-Side Password Policy Resolver
 * Checks database systemSettings.enforcePasswordPolicy
 */
export async function validatePasswordAgainstPolicy(password: string): Promise<PasswordValidationResult> {
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

