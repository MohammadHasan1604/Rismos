/**
 * COSKO Authoritative Server-Side Authentication Pipeline
 *
 * SINGLE SOURCE OF TRUTH for all API route authentication and authorization.
 * Every protected API/action MUST call authenticateRequest() which verifies:
 *
 * 1. Valid authenticated session (HttpOnly cookie or Bearer token)
 * 2. Cryptographically valid JWT (signed with AUTH_SECRET)
 * 3. DB UserSession MUST exist
 * 4. Session not revoked
 * 5. Session not expired
 * 6. UserAccount still exists in DB
 * 7. User status is Active (not Suspended/Inactive)
 * 8. Current role/securityLevel comes from DB (not JWT cache)
 * 9. Assigned stores come from DB
 * 10. Current permissions come from DB
 *
 * FAILS CLOSED — any check failure returns null.
 * NO JWT-ONLY FALLBACK. DB session is MANDATORY.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifySessionToken, hashToken } from './auth';
import { prisma } from './db';
import {
  RBACEngine,
  ROLE_SECURITY_LEVELS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  hasEffectivePermission,
  type UserRole,
  type SecurityLevel,
} from './rbacEngine';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  securityLevel: SecurityLevel;
  store: string;
  allowedStores: string[];
  status: string;
  avatarUrl?: string;
  mustChangePassword: boolean;
  sessionId: string;
  permissions: string[];
  overrides: { permissionCode: string; overrideType: 'ALLOW' | 'DENY' }[];
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: string | null;
  status: number;
}

/**
 * Extract raw JWT token from request (cookie or Authorization header)
 */
function extractToken(req: NextRequest | Request): string | null {
  try {
    // 1. HttpOnly cookie (primary, secure method)
    const cookieToken = (req as any).cookies?.get?.('cosko_session')?.value;
    if (cookieToken) return cookieToken;

    // 2. Authorization Bearer header (for API clients)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  } catch {
    return null;
  }
}

let cachedTimeoutMins = 43200;
let lastTimeoutFetch = 0;

async function getSessionTimeoutMins(): Promise<number> {
  if (Date.now() - lastTimeoutFetch < 60_000) return cachedTimeoutMins;
  try {
    const sys = await (prisma as any).systemSettings.findFirst({
      select: { sessionTimeoutMins: true },
    });
    if (sys?.sessionTimeoutMins) {
      cachedTimeoutMins = Number(sys.sessionTimeoutMins);
    }
    lastTimeoutFetch = Date.now();
  } catch {
    // Keep fallback
  }
  return cachedTimeoutMins;
}

/**
 * AUTHORITATIVE SERVER-SIDE AUTHENTICATION PIPELINE
 *
 * FAIL CLOSED. No JWT-only fallback. DB session is MANDATORY.
 */
export async function authenticateRequest(req: NextRequest | Request): Promise<AuthResult> {
  // Step 1: Extract token
  const token = extractToken(req);
  if (!token) {
    return { user: null, error: 'Unauthorized: No active session', status: 401 };
  }

  // Step 2: Cryptographic JWT verification
  const jwtResult = verifySessionToken(token);
  if (!jwtResult?.user?.id) {
    return { user: null, error: 'Unauthorized: Invalid or expired session token', status: 401 };
  }

  // Step 3-5: DB session verification — MANDATORY. NO FALLBACK.
  const tokenDigest = hashToken(token);
  let dbSessionId: string;

  try {
    // Lookup DB session by session ID from JWT or token hash
    let dbSession = jwtResult.sid
      ? await (prisma as any).userSession.findUnique({
          where: { id: jwtResult.sid },
        })
      : null;

    if (!dbSession) {
      dbSession = await (prisma as any).userSession.findUnique({
        where: { tokenHash: tokenDigest },
      });
    }

    // FAIL CLOSED: No DB session found -> reject
    if (!dbSession) {
      return { user: null, error: 'Session not found. Please log in again.', status: 401 };
    }

    // Authoritative check: Token hash must match DB session token_hash
    if (dbSession.tokenHash !== tokenDigest) {
      return { user: null, error: 'Session token mismatch. Please log in again.', status: 401 };
    }

    // Authoritative check: User ID must match
    if (dbSession.userId !== jwtResult.user.id) {
      return { user: null, error: 'Session user mismatch. Please log in again.', status: 401 };
    }

    // Check revocation
    if (dbSession.revokedAt) {
      return { user: null, error: 'Session has been revoked. Please log in again.', status: 401 };
    }

    // Check expiration
    if (dbSession.expiresAt < new Date()) {
      return { user: null, error: 'Session has expired. Please log in again.', status: 401 };
    }

    // Check server-authoritative inactivity expiration
    const now = Date.now();
    const timeoutMins = await getSessionTimeoutMins();
    const maxInactivityMs = timeoutMins * 60 * 1000;

    if (dbSession.lastSeenAt) {
      const elapsedSinceLastSeen = now - new Date(dbSession.lastSeenAt).getTime();
      if (elapsedSinceLastSeen > maxInactivityMs) {
        return { user: null, error: 'Session expired due to inactivity. Please log in again.', status: 401 };
      }
    }

    // Throttled update of lastSeenAt (once every 60 seconds)
    if (!dbSession.lastSeenAt || now - new Date(dbSession.lastSeenAt).getTime() > 60_000) {
      (prisma as any).userSession.update({
        where: { id: dbSession.id },
        data: { lastSeenAt: new Date() },
      }).catch((err: any) => console.warn('[AuthPipeline] Throttled lastSeenAt update warning:', err));
    }

    dbSessionId = dbSession.id;
  } catch (sessionCheckErr) {
    console.error('[AuthPipeline] DB session check failed:', sessionCheckErr);
    // FAIL CLOSED on DB error — do NOT fall back to JWT-only
    return { user: null, error: 'Authentication service temporarily unavailable', status: 503 };
  }

  // Step 6: Verify UserAccount exists in DB
  let dbUser: any;
  try {
    dbUser = await prisma.userAccount.findUnique({
      where: { id: jwtResult.user.id },
      include: {
        storeAssignments: true,
        permissionOverrides: true,
      },
    });
  } catch (dbErr) {
    console.error('[AuthPipeline] DB user lookup error:', dbErr);
    return { user: null, error: 'Authentication service temporarily unavailable', status: 503 };
  }

  if (!dbUser) {
    return { user: null, error: 'Account no longer exists', status: 401 };
  }

  // Step 7: Check user status (Active only)
  if (dbUser.status === 'Suspended') {
    return { user: null, error: 'Account is suspended. All access revoked.', status: 403 };
  }
  if (dbUser.status === 'Inactive') {
    return { user: null, error: 'Account is inactive. Access denied.', status: 403 };
  }

  // Step 8-10: Build authoritative user from DB (NOT from JWT cache)
  const allowedStores = dbUser.storeAssignments.map((a: any) => a.storeCode);
  if (dbUser.storeScope && !allowedStores.includes(dbUser.storeScope)) {
    allowedStores.push(dbUser.storeScope);
  }

  const effectiveStore =
    dbUser.role === 'Super Admin'
      ? dbUser.storeScope || 'All Stores'
      : dbUser.storeScope && dbUser.storeScope !== 'All Stores'
        ? dbUser.storeScope
        : allowedStores[0] || 'BLR';

  const dbRole = dbUser.role as UserRole;
  const dbSecurityLevel = (ROLE_SECURITY_LEVELS[dbRole] ?? dbUser.securityLevel) as SecurityLevel;

  const rolePerms = DEFAULT_ROLE_PERMISSIONS[dbRole] || [];
  const dbOverrides = ((dbUser as any).permissionOverrides || []).map((ov: any) => ({
    permissionCode: ov.permissionCode,
    overrideType: ov.overrideType as 'ALLOW' | 'DENY',
  }));

  const effectivePerms = getEffectivePermissions({
    role: dbRole,
    securityLevel: dbSecurityLevel,
    permissions: rolePerms,
    overrides: dbOverrides,
  });

  const authenticatedUser: AuthenticatedUser = {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbRole,
    securityLevel: dbSecurityLevel,
    store: effectiveStore,
    allowedStores:
      dbRole === 'Super Admin'
        ? allowedStores.length > 0
          ? allowedStores
          : ['CENTRAL', 'BLR', 'HYD', 'DEL', 'MUM', 'CHE']
        : [effectiveStore], // CRITICAL: Non-Super-Admin strictly bounded to ONE assigned store
    status: dbUser.status,
    avatarUrl: dbUser.avatarUrl || undefined,
    mustChangePassword: dbUser.mustChangePassword || false,
    sessionId: dbSessionId,
    permissions: effectivePerms,
    overrides: dbOverrides,
  };

  return { user: authenticatedUser, error: null, status: 200 };
}

/**
 * Check if the authenticated user has a specific permission.
 */
export function hasPermission(
  user: AuthenticatedUser,
  permissionCode: string,
  targetStore?: string
): boolean {
  if (user.role === 'Super Admin' || user.securityLevel === 100) {
    return true;
  }

  // First verify effective permission (role default + per-user override + protected boundaries)
  if (!hasEffectivePermission(user, permissionCode)) {
    return false;
  }

  const result = RBACEngine.authorize(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      securityLevel: user.securityLevel,
      storeScope: user.store,
      allowedStores: user.allowedStores,
      status: user.status as any,
      permissions: user.permissions,
      overrides: user.overrides,
      isSessionValid: true,
    },
    {
      resourceName: permissionCode,
      classification: 'STORE_SCOPED',
      minSecurityLevel: 40,
      requiredPermission: permissionCode,
      targetStore: targetStore,
    }
  );

  return result.allowed;
}

/**
 * Validate physical StoreHub code against active database records.
 * Rejects 'All Stores', 'ALL', empty values, and non-existent codes.
 */
let storeCache: { codes: Set<string>; lastFetch: number } = { codes: new Set(), lastFetch: 0 };
const STORE_CACHE_TTL = 30_000;

export async function validatePhysicalStore(
  storeCode: string | null | undefined
): Promise<{ valid: boolean; storeCode?: string; error?: string }> {
  if (!storeCode || typeof storeCode !== 'string' || !storeCode.trim()) {
    return { valid: false, error: 'Physical store code is required.' };
  }
  const upper = storeCode.trim().toUpperCase();
  if (upper === 'ALL' || upper === 'ALL STORES') {
    return {
      valid: false,
      error:
        '"All Stores" is a reporting/aggregation scope only. Physical store operations must target a valid store hub.',
    };
  }

  const now = Date.now();
  if (now - storeCache.lastFetch > STORE_CACHE_TTL || !storeCache.codes.has(upper)) {
    try {
      const activeStores = await prisma.storeHub.findMany({
        where: { status: 'Active' },
        select: { code: true },
      });
      storeCache = {
        codes: new Set(activeStores.map((s) => s.code.toUpperCase())),
        lastFetch: now,
      };
    } catch (_err) {
      // In case of transient DB error, fall back to direct single query
      const single = await prisma.storeHub.findUnique({ where: { code: upper } }).catch(() => null);
      if (single && single.status === 'Active') {
        return { valid: true, storeCode: upper };
      }
      return { valid: false, error: `Failed to validate store code "${upper}".` };
    }
  }

  if (!storeCache.codes.has(upper)) {
    return {
      valid: false,
      error: `Store code "${upper}" is not a recognized active store location.`,
    };
  }

  return { valid: true, storeCode: upper };
}

export interface StoreScopeResult {
  authorized: boolean;
  authorizedStore: string;
  effectiveStore: string;
  isAllStores: boolean;
  enterpriseScope: boolean;
  physicalStoreCode: string | null;
  status: number;
  error: string | null;
}

/**
 * Authoritative Server-Side Store Scope Guard
 * Single source of truth for scoping API routes.
 *
 * Rules:
 * Super Admin:
 *   - May access any valid StoreHub store and enterprise reporting scopes ('All Stores') where allowed.
 *   - When isAllStores is true: enterpriseScope is true, physicalStoreCode is null (omit store filter!).
 * Store Manager / Sales Manager:
 *   - The only valid operational store is user.store.
 *   - Client-provided store values must NEVER expand this scope.
 *   - If a lower role supplies a different store: returns 403 Forbidden.
 *   - Never silently substitutes another store for mutation requests.
 */
export function requireStoreScope(
  user: AuthenticatedUser,
  requestedStore?: string | null,
  options?: { allowAllStoresForSuperAdmin?: boolean }
): StoreScopeResult {
  const isSuperAdmin = user.role === 'Super Admin' || user.securityLevel >= 100;
  const allowAllStores = options?.allowAllStoresForSuperAdmin ?? false;

  if (isSuperAdmin) {
    if (!requestedStore || requestedStore === 'All Stores' || requestedStore === 'ALL') {
      if (allowAllStores) {
        return {
          authorized: true,
          authorizedStore: 'All Stores',
          effectiveStore: 'All Stores',
          isAllStores: true,
          enterpriseScope: true,
          physicalStoreCode: null,
          status: 200,
          error: null,
        };
      }
      // Mutation requiring physical store defaults to CENTRAL or user's assigned store
      const defaultPhysical =
        user.store && user.store !== 'All Stores' && user.store !== 'ALL' ? user.store : 'CENTRAL';
      return {
        authorized: true,
        authorizedStore: defaultPhysical,
        effectiveStore: defaultPhysical,
        isAllStores: false,
        enterpriseScope: false,
        physicalStoreCode: defaultPhysical,
        status: 200,
        error: null,
      };
    }

    const cleanReq = requestedStore.trim().toUpperCase();
    return {
      authorized: true,
      authorizedStore: cleanReq,
      effectiveStore: cleanReq,
      isAllStores: false,
      enterpriseScope: false,
      physicalStoreCode: cleanReq,
      status: 200,
      error: null,
    };
  }

  // Non-Super-Admin (Store Manager & Sales Manager)
  const canonicalStore = (
    user.store && user.store !== 'All Stores' && user.store !== 'ALL'
      ? user.store
      : user.allowedStores[0] || 'BLR'
  ).toUpperCase();

  if (requestedStore) {
    const cleanReq = requestedStore.trim().toUpperCase();
    if (cleanReq === 'ALL STORES' || cleanReq === 'ALL') {
      return {
        authorized: false,
        authorizedStore: canonicalStore,
        effectiveStore: canonicalStore,
        isAllStores: false,
        enterpriseScope: false,
        physicalStoreCode: canonicalStore,
        status: 403,
        error: 'Forbidden: Consolidated view across all stores is restricted to Super Admin only',
      };
    }

    if (cleanReq !== canonicalStore) {
      return {
        authorized: false,
        authorizedStore: canonicalStore,
        effectiveStore: canonicalStore,
        isAllStores: false,
        enterpriseScope: false,
        physicalStoreCode: canonicalStore,
        status: 403,
        error: `Forbidden: As ${user.role}, you are restricted to store "${canonicalStore}". Access to "${cleanReq}" is denied.`,
      };
    }
  }

  return {
    authorized: true,
    authorizedStore: canonicalStore,
    effectiveStore: canonicalStore,
    isAllStores: false,
    enterpriseScope: false,
    physicalStoreCode: canonicalStore,
    status: 200,
    error: null,
  };
}

/**
 * Validate that the user can access the target store.
 */
export function canAccessStore(user: AuthenticatedUser, targetStore: string): boolean {
  if (user.role === 'Super Admin' || user.securityLevel === 100) {
    return true;
  }
  if (!targetStore || targetStore === 'All Stores' || targetStore === 'ALL') {
    return false; // Non-Super Admin cannot access "All Stores"
  }
  return user.allowedStores.includes(targetStore);
}

/**
 * Create an audit log entry.
 */
export async function createAuditLog(
  user: AuthenticatedUser,
  module: string,
  action: string,
  details: string,
  storeCode?: string,
  ipAddress?: string
): Promise<void> {
  try {
    const effectiveStore =
      storeCode && storeCode !== 'All Stores'
        ? storeCode
        : user.store && user.store !== 'All Stores'
          ? user.store
          : 'CENTRAL';

    await (prisma as any).auditLog.create({
      data: {
        module,
        action,
        details: details.substring(0, 65535),
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        storeCode: effectiveStore,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to create audit log:', err);
  }
}

/**
 * Invalidate all active sessions for a user.
 * Called on: deactivate, suspend, password reset, password change.
 */
export async function invalidateUserSessions(
  userId: string,
  excludeSessionId?: string
): Promise<void> {
  try {
    const whereClause: any = {
      userId,
      revokedAt: null,
    };
    if (excludeSessionId) {
      whereClause.id = { not: excludeSessionId };
    }
    await (prisma as any).userSession.updateMany({
      where: whereClause,
      data: { revokedAt: new Date() },
    });
  } catch (err) {
    console.error('[AuthPipeline] Failed to invalidate sessions:', err);
  }
}

/**
 * Generate a secure random temporary password.
 * NEVER uses a hardcoded default.
 */
export function generateSecureTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(16);
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}
