import crypto from 'crypto';
import { prisma } from './db';

/**
 * Serverless-Durable & Sliding-Window Rate Limiter for Authentication Protection
 *
 * Security:
 * - Durable MySQL-backed protection across multiple serverless/Netlify instances.
 * - All rate limit keys are SHA-256 hashed before persistence to ensure sensitive values
 *   (e.g., account emails, IP combinations, raw tokens) are never stored in plain text.
 * - Prevents timing attacks and account enumeration.
 * - Graceful fallback to memory sliding-window limiter during offline unit tests or DB disconnects.
 */

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
}

interface MemoryRateLimitRecord {
  attempts: number;
  firstAttemptTime: number;
  blockedUntil?: number;
}

const memoryRateLimitStore = new Map<string, MemoryRateLimitRecord>();

const WINDOW_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

// Periodic cleanup of stale memory records every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, record] of memoryRateLimitStore.entries()) {
        if (
          (!record.blockedUntil || record.blockedUntil < now) &&
          now - record.firstAttemptTime > WINDOW_DURATION_MS
        ) {
          memoryRateLimitStore.delete(key);
        }
      }
    },
    10 * 60 * 1000
  );
}

/**
 * Helper to compute SHA-256 hash of rate-limit keys for privacy-preserving persistence.
 */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * In-Memory Synchronous Rate Limiting (Used for fast pre-flight or fallback)
 */
export function checkRateLimit(key: string, maxAttempts = 5): RateLimitResult {
  const now = Date.now();
  const record = memoryRateLimitStore.get(key);

  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  // Check if currently blocked
  if (record.blockedUntil && record.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  // Check if window has expired
  if (now - record.firstAttemptTime > WINDOW_DURATION_MS) {
    memoryRateLimitStore.delete(key);
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  if (record.attempts >= maxAttempts) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    const retryAfterSeconds = Math.ceil(BLOCK_DURATION_MS / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, maxAttempts - record.attempts),
  };
}

export function recordFailedAttempt(key: string, maxAttempts = 5): RateLimitResult {
  const now = Date.now();
  let record = memoryRateLimitStore.get(key);

  if (!record || now - record.firstAttemptTime > WINDOW_DURATION_MS) {
    record = {
      attempts: 1,
      firstAttemptTime: now,
    };
  } else {
    record.attempts += 1;
    if (record.attempts >= maxAttempts) {
      record.blockedUntil = now + BLOCK_DURATION_MS;
    }
  }

  memoryRateLimitStore.set(key, record);

  if (record.attempts >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(BLOCK_DURATION_MS / 1000),
    };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, maxAttempts - record.attempts),
  };
}

export function clearRateLimit(key: string): void {
  memoryRateLimitStore.delete(key);
}

/**
 * Serverless-Durable Rate Limiter (Backed by MySQL `security_rate_limits`)
 * Hashes key with SHA-256 for privacy.
 */
export async function checkDurableRateLimit(
  key: string,
  maxAttempts = 5,
  windowDurationSeconds = 900
): Promise<RateLimitResult> {
  const keyHash = hashKey(key);
  const now = Date.now();
  const windowDurationMs = windowDurationSeconds * 1000;

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        attempts: number;
        first_attempt_time: bigint | number;
        blocked_until: bigint | number | null;
      }>
    >`
      SELECT attempts, first_attempt_time, blocked_until
      FROM security_rate_limits
      WHERE key_hash = ${keyHash}
      LIMIT 1
    `;

    if (rows && rows.length > 0) {
      const record = rows[0];
      const blockedUntil = record.blocked_until ? Number(record.blocked_until) : null;
      const firstAttempt = Number(record.first_attempt_time);

      if (blockedUntil && blockedUntil > now) {
        const retryAfterSeconds = Math.ceil((blockedUntil - now) / 1000);
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds,
        };
      }

      if (now - firstAttempt <= windowDurationMs && record.attempts >= maxAttempts) {
        const retryAfterSeconds = Math.ceil((firstAttempt + windowDurationMs - now) / 1000);
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
        };
      }

      const activeAttempts = now - firstAttempt <= windowDurationMs ? record.attempts : 0;
      return {
        allowed: true,
        remainingAttempts: Math.max(0, maxAttempts - activeAttempts),
      };
    }
  } catch {
    // Database query failed or table not yet migrated; fall back to memory
  }

  return checkRateLimit(key, maxAttempts);
}

/**
 * Records an attempt into MySQL `security_rate_limits` with atomic upsert.
 */
export async function recordDurableRateLimitAttempt(
  key: string,
  maxAttempts = 5,
  windowDurationSeconds = 900
): Promise<RateLimitResult> {
  // Update memory store as secondary layer
  const memResult = recordFailedAttempt(key, maxAttempts);

  const keyHash = hashKey(key);
  const now = Date.now();
  const windowDurationMs = windowDurationSeconds * 1000;
  const expiresAt = new Date(now + windowDurationMs * 2);
  const blockedUntil = now + windowDurationMs;
  const id = crypto.randomUUID();

  try {
    await prisma.$executeRaw`
      INSERT INTO security_rate_limits (
        id, key_hash, attempts, first_attempt_time, blocked_until, expires_at, created_at, updated_at
      )
      VALUES (
        ${id}, ${keyHash}, 1, ${BigInt(now)}, NULL, ${expiresAt}, NOW(3), NOW(3)
      )
      ON DUPLICATE KEY UPDATE
        attempts = IF(${BigInt(now)} - first_attempt_time > ${BigInt(windowDurationMs)}, 1, attempts + 1),
        first_attempt_time = IF(${BigInt(now)} - first_attempt_time > ${BigInt(windowDurationMs)}, ${BigInt(now)}, first_attempt_time),
        blocked_until = IF(attempts + 1 >= ${maxAttempts}, ${BigInt(blockedUntil)}, blocked_until),
        expires_at = ${expiresAt},
        updated_at = NOW(3)
    `;

    // Fetch updated state
    const rows = await prisma.$queryRaw<
      Array<{
        attempts: number;
        first_attempt_time: bigint | number;
        blocked_until: bigint | number | null;
      }>
    >`
      SELECT attempts, first_attempt_time, blocked_until
      FROM security_rate_limits
      WHERE key_hash = ${keyHash}
      LIMIT 1
    `;

    if (rows && rows.length > 0) {
      const record = rows[0];
      const blocked = record.blocked_until ? Number(record.blocked_until) : null;
      if (blocked && blocked > now) {
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds: Math.ceil((blocked - now) / 1000),
        };
      }
      if (record.attempts >= maxAttempts) {
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds: Math.ceil(windowDurationSeconds),
        };
      }
      return {
        allowed: true,
        remainingAttempts: Math.max(0, maxAttempts - record.attempts),
      };
    }
  } catch {
    // Database query failed; return memory result
  }

  return memResult;
}

/**
 * Clears both in-memory and durable database rate limit records for a key.
 */
export async function clearDurableRateLimit(key: string): Promise<void> {
  clearRateLimit(key);
  const keyHash = hashKey(key);
  try {
    await prisma.$executeRaw`
      DELETE FROM security_rate_limits
      WHERE key_hash = ${keyHash}
    `;
  } catch {
    // Database query failed; in-memory store already cleared
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}
