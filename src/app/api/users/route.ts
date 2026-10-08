import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma, executeTransaction } from '@/lib/db';
import { broadcastRealtimeEvent, getStoreChannel } from '@/lib/realtime';
import {
  authenticateRequest,
  createAuditLog,
  invalidateUserSessions,
  hasPermission,
  generateSecureTemporaryPassword,
} from '@/lib/authPipeline';
import { ensureStoredImage } from '@/lib/objectStorage';
import { validatePasswordAgainstPolicy, validatePassword } from '@/lib/passwordPolicy';
import { verifySensitiveAction } from '@/lib/sensitiveAction';
import {
  ROLE_SECURITY_LEVELS,
  SUPER_ADMIN_PROTECTED_PERMISSIONS,
  getEffectivePermissions,
  type UserRole,
} from '@/lib/rbacEngine';

// Whitelist allowed roles and map to security levels — prevent mass assignment
// Super Admin (100) is a SINGLETON and cannot be created via this API
const ROLE_LEVEL_MAP: Record<string, number> = {
  'Store Manager': 80,
  'Sales Manager': 40,
};

/**
 * GET /api/users - Retrieve user accounts list with store assignments
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'users.view')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to view users' },
        { status: 403 }
      );
    }

    // Strict RBAC: Sales Manager has no access to user management
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers do not have permission to view or manage users' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const whereClause: any = {};
    if (!includeInactive) {
      whereClause.status = { notIn: ['Inactive', 'Suspended'] };
    }

    if (user.role === 'Store Manager') {
      // Store Manager can ONLY view Sales Manager accounts belonging to their own store
      whereClause.role = 'Sales Manager';
      whereClause.storeScope = user.store;
    }

    const users = await prisma.userAccount.findMany({
      where: whereClause,
      include: {
        storeAssignments: true,
        permissionOverrides: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const safeUsers = users.map((u: any) => {
      const singleStore = u.storeScope || u.storeAssignments?.[0]?.storeCode || 'BLR';
      const overrides = (u.permissionOverrides || []).map((ov: any) => ({
        permissionCode: ov.permissionCode,
        overrideType: ov.overrideType,
      }));
      const effectivePermissions = getEffectivePermissions({
        role: u.role,
        securityLevel: u.securityLevel,
        overrides,
      });

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        securityLevel: u.securityLevel,
        store: u.role === 'Super Admin' ? 'All Stores' : singleStore,
        storeScope: u.role === 'Super Admin' ? 'All Stores' : singleStore,
        status: u.status,
        permissions: effectivePermissions,
        overrides,
        assignedStores:
          u.role === 'Super Admin'
            ? u.storeAssignments?.map((a: any) => a.storeCode) || []
            : [singleStore],
        allowedStores:
          u.role === 'Super Admin'
            ? u.storeAssignments?.map((a: any) => a.storeCode) || ['CENTRAL']
            : [singleStore],
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLogin,
      };
    });

    return NextResponse.json(
      { success: true, users: safeUsers },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/users GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve users' }, { status: 500 });
  }
}

/**
 * POST /api/users - Create/Provision a new user account (AUTHORITATIVE ENDPOINT)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const authUser = auth.user;

    if (!hasPermission(authUser, 'users.create')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions to create users' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, password, phone, store, status } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required' },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password is required (minimum 8 characters)' },
        { status: 400 }
      );
    }

    // Authoritatively enforce enterprise password policy (enforcePasswordPolicy) via validatePassword/validatePasswordAgainstPolicy
    const policyRes = await validatePasswordAgainstPolicy(password);
    if (!policyRes.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Password does not meet policy requirements: ${policyRes.errors.join('; ')}`,
        },
        { status: 400 }
      );
    }

    const requestedRole = body.role || 'Sales Manager';
    const requestedLevel =
      body.securityLevel !== undefined ? Number(body.securityLevel) : undefined;

    // 🔒 STRICT SUPER ADMIN SINGLETON: No user can create another Super Admin
    if (requestedRole === 'Super Admin' || requestedLevel === 100) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Forbidden: System enforces exactly ONE protected Super Admin. Creating additional Super Admin accounts is prohibited.',
        },
        { status: 403 }
      );
    }

    // Validate role is in the allowed set
    if (!ROLE_LEVEL_MAP[requestedRole]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid role: "${requestedRole}". Allowed roles: ${Object.keys(ROLE_LEVEL_MAP).join(', ')}`,
        },
        { status: 400 }
      );
    }

    // 🔒 securityLevel derived server-side from role - client value ignored
    const targetLevel = ROLE_LEVEL_MAP[requestedRole];

    // 🔒 LEVEL CEILING: Caller cannot create users at or above their own level
    if (authUser.role !== 'Super Admin' && targetLevel >= authUser.securityLevel) {
      return NextResponse.json(
        {
          success: false,
          error: `Forbidden: You cannot create users at or above your own security level (${authUser.securityLevel}).`,
        },
        { status: 403 }
      );
    }

    // 🔒 Store Manager: can create Sales Manager only.
    if (authUser.role === 'Store Manager' && requestedRole !== 'Sales Manager') {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Store Manager can only create Sales Manager accounts.',
        },
        { status: 403 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    const existing = await prisma.userAccount.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // 🔒 Store Scope Validation: Non-Super Admin cannot assign stores outside their own scope
    if (authUser.role !== 'Super Admin') {
      const requestedStores: string[] =
        Array.isArray(body.assignedStores) && body.assignedStores.length > 0
          ? body.assignedStores
          : Array.isArray(body.allowedStores) && body.allowedStores.length > 0
            ? body.allowedStores
            : body.store
              ? [body.store]
              : [];

      const hasUnauthorizedStore = requestedStores.some(
        (s: string) => !authUser.allowedStores.includes(s) && authUser.store !== s
      );

      if (hasUnauthorizedStore) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: You can only assign stores you are authorized for',
          },
          { status: 403 }
        );
      }
    }

    // Resolve assigned stores: Store Manager is automatically forced to their own store
    let targetAssignedStores: string[];
    if (authUser.role === 'Store Manager') {
      const managerStore =
        authUser.store && authUser.store !== 'All Stores'
          ? authUser.store
          : authUser.allowedStores[0] || 'BLR';
      targetAssignedStores = [managerStore];
    } else {
      const rawStores: string[] =
        Array.isArray(body.assignedStores) && body.assignedStores.length > 0
          ? body.assignedStores
          : Array.isArray(body.allowedStores) && body.allowedStores.length > 0
            ? body.allowedStores
            : [store || 'BLR'];

      const validHubs = await prisma.storeHub.findMany({ select: { code: true } });
      const validCodes = new Set(validHubs.map((s) => s.code));
      const filtered = rawStores.filter((c: string) => validCodes.has(c));

      if (filtered.length === 0) {
        return NextResponse.json(
          { success: false, error: 'User must be assigned to at least one valid store' },
          { status: 400 }
        );
      }

      // Non-Super-Admin accounts must have EXACTLY ONE operational store assignment
      targetAssignedStores = [filtered[0]];
    }

    // 🔒 Check protected permission overrides
    if (Array.isArray(body.overrides)) {
      for (const ov of body.overrides) {
        if (
          ov.overrideType === 'ALLOW' &&
          SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(ov.permissionCode) &&
          targetLevel < 100
        ) {
          return NextResponse.json(
            {
              success: false,
              error: `Cannot grant protected permission "${ov.permissionCode}" to roles below Level 100`,
            },
            { status: 403 }
          );
        }
      }
    }

    const hashedPassword = await hashPassword(password);
    const primaryStore = targetAssignedStores[0];
    const cleanPhone = phone ? String(phone).trim() : null;

    // Requirement 10: Atomic single database transaction
    const newUser = await executeTransaction(async (tx: any) => {
      const user = await tx.userAccount.create({
        data: {
          email: cleanEmail,
          passwordHash: hashedPassword,
          name: name.trim(),
          phone: cleanPhone || null,
          role: requestedRole,
          securityLevel: targetLevel,
          storeScope: primaryStore,
          status: status || 'Active',
          mustChangePassword: true,
        },
      });

      for (const sCode of targetAssignedStores) {
        await tx.userStoreAssignment.create({
          data: { userId: user.id, storeCode: sCode },
        });
      }

      if (Array.isArray(body.overrides) && requestedRole !== 'Super Admin') {
        for (const ov of body.overrides) {
          if (ov.permissionCode && (ov.overrideType === 'ALLOW' || ov.overrideType === 'DENY')) {
            await tx.userPermissionOverride.create({
              data: {
                userId: user.id,
                permissionCode: ov.permissionCode,
                overrideType: ov.overrideType,
              },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          module: 'Users',
          action: 'User Created',
          details: `Created user "${user.name}" (${user.email}) with role ${requestedRole} at stores [${targetAssignedStores.join(', ')}]`,
          userId: authUser.id,
          userEmail: authUser.email,
          userRole: authUser.role,
          storeCode: primaryStore,
        },
      });

      return user;
    });

    const sanitizedUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      securityLevel: newUser.securityLevel,
      store: newUser.storeScope,
      status: newUser.status,
      assignedStores: targetAssignedStores,
      allowedStores: targetAssignedStores,
      createdAt: newUser.createdAt,
      mustChangePassword: true,
    };

    await broadcastRealtimeEvent('users', 'USER_CREATED', {
      userId: newUser.id,
      email: newUser.email,
      storeCode: newUser.storeScope,
      stores: targetAssignedStores,
    });

    for (const st of targetAssignedStores) {
      if (st && st !== 'All Stores') {
        await broadcastRealtimeEvent(getStoreChannel(st), 'USER_CREATED', {
          userId: newUser.id,
          email: newUser.email,
          storeCode: st,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        user: sanitizedUser,
        userId: newUser.id,
        message: `User "${newUser.name}" provisioned successfully.`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('API /api/users POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users - Update user account details (AUTHORITATIVE ENDPOINT)
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const authUser = auth.user;

    if (!hasPermission(authUser, 'users.edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions to modify users' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, email, name, store, status, password, allowedStores, assignedStores, overrides } =
      body;

    if (!id && !email) {
      return NextResponse.json(
        { success: false, error: 'User ID or Email is required' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.userAccount.findFirst({
      where: id ? { id } : { email: email?.toLowerCase().trim() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User account not found' },
        { status: 404 }
      );
    }

    const requestedRole = body.role;
    const requestedLevel =
      body.securityLevel !== undefined ? Number(body.securityLevel) : undefined;

    // 🔒 STRICT SUPER ADMIN SINGLETON: Cannot promote any user to Super Admin
    if (
      targetUser.role !== 'Super Admin' &&
      (requestedRole === 'Super Admin' || requestedLevel === 100)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Forbidden: System enforces exactly ONE protected Super Admin. Promoting accounts to Super Admin is prohibited.',
        },
        { status: 403 }
      );
    }

    // 🔒 Super Admin cannot be demoted/deleted/deactivated
    if (targetUser.role === 'Super Admin') {
      if (requestedRole && requestedRole !== 'Super Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Super Admin cannot be demoted' },
          { status: 403 }
        );
      }
      if (status === 'Inactive' || status === 'Suspended') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Super Admin cannot be deactivated or suspended' },
          { status: 403 }
        );
      }
    }

    if (authUser.role !== 'Super Admin') {
      if (targetUser.role === 'Super Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only Super Admin can modify Super Admin accounts' },
          { status: 403 }
        );
      }
      // Store Manager can ONLY manage Sales Manager accounts belonging to their own store
      if (authUser.role === 'Store Manager') {
        if (targetUser.role !== 'Sales Manager' || targetUser.storeScope !== authUser.store) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Forbidden: Store Manager can only manage Sales Manager accounts belonging to their own store.',
            },
            { status: 403 }
          );
        }
        if (requestedRole && requestedRole !== 'Sales Manager') {
          return NextResponse.json(
            {
              success: false,
              error: 'Forbidden: Store Manager cannot promote or change roles.',
            },
            { status: 403 }
          );
        }
      }
      // Store scope check
      const callerAllowed =
        authUser.allowedStores.length > 0 ? authUser.allowedStores : [authUser.store];
      if (targetUser.storeScope && !callerAllowed.includes(targetUser.storeScope)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: You cannot modify users outside your assigned stores',
          },
          { status: 403 }
        );
      }
      // Level ceiling
      if (requestedRole && ROLE_LEVEL_MAP[requestedRole] !== undefined) {
        if (ROLE_LEVEL_MAP[requestedRole] >= authUser.securityLevel) {
          return NextResponse.json(
            {
              success: false,
              error: `Forbidden: Cannot assign role "${requestedRole}" at or above your own level.`,
            },
            { status: 403 }
          );
        }
      }
      // Cannot edit users at equal or higher level
      if (targetUser.securityLevel >= authUser.securityLevel) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Cannot modify users at equal or higher security level',
          },
          { status: 403 }
        );
      }
      // Validate store assignments are within caller's scope
      const rawStoresToCheck = Array.isArray(assignedStores)
        ? assignedStores
        : Array.isArray(allowedStores)
          ? allowedStores
          : null;
      if (rawStoresToCheck) {
        const hasInvalidAssignment = rawStoresToCheck.some(
          (s: string) => !callerAllowed.includes(s)
        );
        if (hasInvalidAssignment) {
          return NextResponse.json(
            {
              success: false,
              error: 'Forbidden: You can only assign stores you are authorized for',
            },
            { status: 403 }
          );
        }
      }
    }

    // 🔒 Check protected permission overrides
    const effectiveTargetLevel =
      (requestedRole && ROLE_LEVEL_MAP[requestedRole]) || targetUser.securityLevel;

    if (body.permissionOverride && targetUser.role !== 'Super Admin') {
      const ov = body.permissionOverride;
      if (
        ov.overrideType === 'ALLOW' &&
        SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(ov.permissionCode) &&
        effectiveTargetLevel < 100
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot grant protected permission "${ov.permissionCode}" to roles below Level 100`,
          },
          { status: 403 }
        );
      }
    }

    if (Array.isArray(overrides)) {
      for (const ov of overrides) {
        if (
          ov.overrideType === 'ALLOW' &&
          SUPER_ADMIN_PROTECTED_PERMISSIONS.includes(ov.permissionCode) &&
          effectiveTargetLevel < 100
        ) {
          return NextResponse.json(
            {
              success: false,
              error: `Cannot grant protected permission "${ov.permissionCode}" to roles below Level 100`,
            },
            { status: 403 }
          );
        }
      }
    }

    // 🔒 Enforce Server-Authoritative Step-Up Authentication for Role Escalation & Permission Modifications
    const isEscalatingOrChangingPermissions = Boolean(
      (requestedRole && requestedRole !== targetUser.role) ||
      body.permissionOverride ||
      (Array.isArray(overrides) && overrides.length > 0)
    );
    if (isEscalatingOrChangingPermissions) {
      const stepUp = await verifySensitiveAction(req, body, authUser, 'ROLE_ESCALATION');
      if (!stepUp.allowed) {
        return NextResponse.json(
          { error: stepUp.error, stepUpRequired: stepUp.stepUpRequired },
          { status: stepUp.status || 403 }
        );
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (requestedRole && targetUser.role !== 'Super Admin') {
      if (ROLE_LEVEL_MAP[requestedRole]) {
        updateData.role = requestedRole;
        updateData.securityLevel = ROLE_LEVEL_MAP[requestedRole]; // Server-derived
      }
    }
    if (status) updateData.status = status;
    if (body.avatarUrl !== undefined || body.avatar !== undefined) {
      const rawAvatar = body.avatarUrl !== undefined ? body.avatarUrl : body.avatar;
      updateData.avatarUrl = await ensureStoredImage(rawAvatar, 'branding', authUser.name);
    }

    // 🔒 Protected Super Admin preserves role and scope unconditionally
    if (targetUser.role === 'Super Admin') {
      updateData.role = 'Super Admin';
      updateData.securityLevel = 100;
      updateData.storeScope = 'All Stores';
    }

    if (password) {
      const policyRes = await validatePasswordAgainstPolicy(password);
      if (!policyRes.valid) {
        return NextResponse.json(
          {
            success: false,
            error: `Password does not meet policy requirements: ${policyRes.errors.join('; ')}`,
          },
          { status: 400 }
        );
      }
      updateData.passwordHash = await hashPassword(password);
      updateData.mustChangePassword = true;
    }

    const isSuperAdmin = targetUser.role === 'Super Admin';

    // Resolve assigned stores
    const rawStoresToSync: string[] | null = Array.isArray(assignedStores)
      ? assignedStores
      : Array.isArray(allowedStores)
        ? allowedStores
        : store
          ? [store]
          : null;

    let targetStores: string[] | null = null;
    if (rawStoresToSync && !isSuperAdmin) {
      const validHubs = await prisma.storeHub.findMany({ select: { code: true } });
      const validCodes = new Set(validHubs.map((s) => s.code));
      const filtered = rawStoresToSync.filter((c: string) => validCodes.has(c));
      targetStores = filtered.length > 0 ? [filtered[0]] : null;
      if (authUser.role === 'Store Manager') {
        targetStores = [authUser.store];
      }
      if (targetStores && targetStores.length > 0) {
        updateData.storeScope = targetStores[0];
      }
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.update({
        where: { id: targetUser.id },
        data: updateData,
      });

      if (targetStores && targetStores.length > 0 && !isSuperAdmin) {
        await tx.userStoreAssignment.deleteMany({
          where: { userId: user.id, storeCode: { notIn: targetStores } },
        });
        for (const sCode of targetStores) {
          await tx.userStoreAssignment.upsert({
            where: { userId_storeCode: { userId: user.id, storeCode: sCode } },
            create: { userId: user.id, storeCode: sCode },
            update: {},
          });
        }
      }

      // 🔒 Persist permission overrides
      if (!isSuperAdmin) {
        if (body.permissionOverride) {
          const ov = body.permissionOverride;
          if (ov.overrideType === 'RESET') {
            await tx.userPermissionOverride.deleteMany({
              where: {
                userId: user.id,
                permissionCode: ov.permissionCode,
              },
            });
          } else if (ov.overrideType === 'ALLOW' || ov.overrideType === 'DENY') {
            await tx.userPermissionOverride.upsert({
              where: {
                userId_permissionCode: {
                  userId: user.id,
                  permissionCode: ov.permissionCode,
                },
              },
              create: {
                userId: user.id,
                permissionCode: ov.permissionCode,
                overrideType: ov.overrideType,
              },
              update: {
                overrideType: ov.overrideType,
              },
            });
          }
        } else if (Array.isArray(overrides)) {
          await tx.userPermissionOverride.deleteMany({
            where: { userId: user.id },
          });
          for (const ov of overrides) {
            if (ov.permissionCode && (ov.overrideType === 'ALLOW' || ov.overrideType === 'DENY')) {
              await tx.userPermissionOverride.create({
                data: {
                  userId: user.id,
                  permissionCode: ov.permissionCode,
                  overrideType: ov.overrideType,
                },
              });
            }
          }
        }
      }

      return user;
    });

    // 🔒 Invalidate sessions on status change or password reset
    if (status === 'Inactive' || status === 'Suspended' || password) {
      await invalidateUserSessions(targetUser.id);
    }

    // Audit log
    const changes: string[] = [];
    if (name) changes.push(`name="${name}"`);
    if (body.role) changes.push(`role=${body.role}`);
    if (status) changes.push(`status=${status}`);
    if (password) changes.push('password=reset');
    if (targetStores) changes.push(`stores=[${targetStores.join(',')}]`);
    if (body.permissionOverride) {
      changes.push(
        `permissionOverride=${body.permissionOverride.permissionCode}:${body.permissionOverride.overrideType}`
      );
    }
    await createAuditLog(
      authUser,
      'Users',
      'User Updated',
      `Updated user "${targetUser.name}" (${targetUser.email}): ${changes.join(', ')}`
    );

    await broadcastRealtimeEvent('users', 'USER_UPDATED', {
      userId: updatedUser.id,
      email: updatedUser.email,
      action: 'updated',
    });

    if (body.permissionOverride || Array.isArray(overrides)) {
      await broadcastRealtimeEvent(`private-user-${updatedUser.id}`, 'USER_PERMISSIONS_UPDATED', {
        userId: updatedUser.id,
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        securityLevel: updatedUser.securityLevel,
        store: updatedUser.storeScope,
        status: updatedUser.status,
      },
      message: 'User profile updated successfully',
    });
  } catch (error: any) {
    console.error('API /api/users PUT error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users - Safe deactivate or delete user account (AUTHORITATIVE ENDPOINT)
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const session = auth.user;

    if (session.role === 'Sales Manager' || session.securityLevel < 80) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Insufficient permissions to deactivate or delete users',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    let id = idParam;
    let email: string | undefined = undefined;

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
      email = body.email;
    }

    if (!id && !email) {
      return NextResponse.json(
        { success: false, error: 'User ID or Email is required' },
        { status: 400 }
      );
    }

    let target = id ? await prisma.userAccount.findUnique({ where: { id } }) : null;
    if (!target && email) {
      target = await prisma.userAccount.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    }

    if (!target) {
      return NextResponse.json({ success: true, message: 'User already removed or non-existent' });
    }

    // 🔒 STRICT SUPER ADMIN SINGLETON: Protected account cannot be deleted or deactivated
    if (target.role === 'Super Admin') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Forbidden: The protected Super Admin root account cannot be deleted or deactivated.',
        },
        { status: 403 }
      );
    }

    if (target.email === session.email) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete or deactivate your own logged-in account' },
        { status: 400 }
      );
    }

    // 🔒 Enforce Server-Authoritative Step-Up Authentication for User Deletion / Deactivation
    const stepUp = await verifySensitiveAction(req, null, session, 'DELETE_USER');
    if (!stepUp.allowed) {
      return NextResponse.json(
        { success: false, error: stepUp.error, stepUpRequired: stepUp.stepUpRequired },
        { status: stepUp.status || 403 }
      );
    }

    // Store Manager can ONLY manage Sales Manager accounts belonging to their own store
    if (session.role === 'Store Manager') {
      if (target.role !== 'Sales Manager' || target.storeScope !== session.store) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Forbidden: Store Manager can only manage Sales Manager accounts belonging to their own store.',
          },
          { status: 403 }
        );
      }
    }

    // Check if user has audit logs or sales orders
    const [auditCount, salesCount] = await Promise.all([
      prisma.auditLog.count({ where: { userEmail: target.email } }),
      prisma.salesOrder.count({ where: { cashierName: target.name } }),
    ]);

    const hasHistory = auditCount > 0 || salesCount > 0;

    // 🔒 Invalidate all sessions for the target user
    await invalidateUserSessions(target.id);

    if (hasHistory || !permanent) {
      await prisma.userAccount.update({
        where: { id: target.id },
        data: { status: 'Inactive' },
      });

      await createAuditLog(
        session,
        'Users',
        'User Deactivated',
        `Deactivated user "${target.name}" (${target.email}). History: ${auditCount} audit logs, ${salesCount} sales`
      );

      await broadcastRealtimeEvent('users', 'USER_UPDATED', {
        userId: target.id,
        email: target.email,
        action: 'deactivated',
      });

      return NextResponse.json({
        success: true,
        mode: 'archived',
        hasHistory,
        message: hasHistory
          ? `User "${target.name}" has business records (${auditCount} logs, ${salesCount} sales) and was deactivated safely.`
          : `User "${target.name}" deactivated successfully.`,
      });
    }

    // Hard-delete if 0 history
    await prisma.$transaction(async (tx: any) => {
      await tx.userStoreAssignment.deleteMany({ where: { userId: target.id } });
      await tx.userSession.deleteMany({ where: { userId: target.id } });
      await tx.userAccount.delete({ where: { id: target.id } });
    });

    await createAuditLog(
      session,
      'Users',
      'User Deleted',
      `Permanently deleted user "${target.name}" (${target.email})`
    );

    await broadcastRealtimeEvent('users', 'USER_UPDATED', {
      userId: target.id,
      email: target.email,
      action: 'deleted',
    });

    return NextResponse.json({
      success: true,
      mode: 'deleted',
      message: `User account "${target.name}" permanently deleted from database.`,
    });
  } catch (error: any) {
    console.error('API /api/users DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Server error' },
      { status: 500 }
    );
  }
}
