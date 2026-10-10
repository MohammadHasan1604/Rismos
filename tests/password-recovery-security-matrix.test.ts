import { prisma } from '../src/lib/db';
import { hashPassword, comparePassword, signSessionToken, hashSessionToken } from '../src/lib/auth';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST as postSendResetLink } from '../src/app/api/auth/send-reset-link/route';
import { GET as getVerifyResetToken } from '../src/app/api/auth/verify-reset-token/route';
import { POST as postResetPassword } from '../src/app/api/auth/reset-password/route';
import { POST as postSendResetInvitation } from '../src/app/api/users/send-reset-invitation/route';

async function runPasswordSecurityMatrix() {
  console.log('========================================================================================');
  console.log('🛡️ RISMOS ENTERPRISE PASSWORD RECOVERY & ACCOUNT MANAGEMENT SECURITY MATRIX');
  console.log('========================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name} — ${details || 'FAILED'}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const createdUserIds: string[] = [];

  // Helper to create test user accounts
  async function createTestUser(
    role: 'Super Admin' | 'Store Manager' | 'Sales Manager',
    storeScope: string,
    emailPrefix: string,
    status = 'Active'
  ) {
    const email = `${emailPrefix}.${timestamp}@rismos-test.com`;
    const initialPass = 'InitialStrongP@ss2026!';
    const passwordHash = await hashPassword(initialPass);
    const securityLevel = role === 'Super Admin' ? 100 : role === 'Store Manager' ? 80 : 40;

    const user = await prisma.userAccount.create({
      data: {
        email,
        name: `Test ${role}`,
        passwordHash,
        role,
        securityLevel,
        storeScope,
        status,
        mustChangePassword: false,
      },
    });

    await prisma.userStoreAssignment.create({
      data: {
        userId: user.id,
        storeCode: storeScope,
      },
    });

    createdUserIds.push(user.id);
    return { user, email, initialPass };
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 1: ROLE-BASED SELF-SERVICE RECOVERY (SUPER ADMIN, STORE MGR, SALES MGR)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 1: Role-Based Self-Service Recovery ---');

    for (const role of ['Super Admin', 'Store Manager', 'Sales Manager'] as const) {
      const store = role === 'Super Admin' ? 'All Stores' : role === 'Store Manager' ? 'BLR' : 'MUM';
      const { user, email, initialPass } = await createTestUser(role, store, `self.${role.toLowerCase().replace(' ', '')}`);

      // Step A: Request reset link
      const req = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-inspect-token': 'true',
        },
        body: JSON.stringify({ email }),
      });
      const res = await postSendResetLink(req);
      const data = await res.json();

      assert(`[${role}] Request reset link returns HTTP 200`, res.status === 200);
      assert(`[${role}] Received anti-enumeration generic response`, data.success === true && typeof data.message === 'string');
      const token = data._testOnlyToken;

      // Step B: Pre-flight verify token
      const verifyReq = new NextRequest(`http://localhost:4028/api/auth/verify-reset-token?token=${token}`);
      const verifyRes = await getVerifyResetToken(verifyReq);
      const verifyData = await verifyRes.json();

      assert(`[${role}] Pre-flight verification returns valid: true`, verifyData.valid === true);
      assert(`[${role}] Pre-flight returns masked email`, typeof verifyData.emailMasked === 'string');

      // Step C: Complete password reset with strong compliant password (avoid forbidden words: admin, password, rismos, cosko)
      const roleTag = role === 'Super Admin' ? 'SuperRoot' : role.replace(' ', '');
      const newPass = `NewStrongCredentials2026!${roleTag}`;
      const resetReq = new NextRequest('http://localhost:4028/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: token, newPassword: newPass }),
      });
      const resetRes = await postResetPassword(resetReq);
      const resetData = await resetRes.json();

      assert(`[${role}] Password reset succeeds with HTTP 200`, resetRes.status === 200 && resetData.success === true);

      // Step D: Verify user credentials & role preservation
      const updatedUser = await prisma.userAccount.findUnique({ where: { id: user.id } });
      const newValid = await comparePassword(newPass, updatedUser!.passwordHash);
      const oldValid = await comparePassword(initialPass, updatedUser!.passwordHash);

      assert(`[${role}] New password hash verifies correctly with bcrypt`, newValid === true);
      assert(`[${role}] Old password hash is invalidated`, oldValid === false);
      assert(`[${role}] Role assignment preserved (${updatedUser?.role})`, updatedUser?.role === role);
      assert(`[${role}] Store scope preserved (${updatedUser?.storeScope})`, updatedUser?.storeScope === store);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 2: ANTI-ENUMERATION & ACCOUNT STATUS DEFENSES
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 2: Anti-Enumeration & Inactive/Suspended Defenses ---');

    // Non-existent email
    const unknownEmail = `nonexistent.${Date.now()}@rismos-unknown.com`;
    const reqUnknown = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unknownEmail }),
    });
    const resUnknown = await postSendResetLink(reqUnknown);
    const bodyUnknown = await resUnknown.json();

    assert('Non-existent email returns HTTP 200 (prevents enumeration)', resUnknown.status === 200);
    assert(
      'Non-existent email returns identical generic message',
      bodyUnknown.message === 'If the provided email corresponds to an active account, a password reset link has been dispatched.'
    );

    // Suspended account
    const { user: suspendedUser, email: suspendedEmail } = await createTestUser(
      'Sales Manager',
      'BLR',
      'suspended.staff',
      'Suspended'
    );
    const reqSuspended = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: suspendedEmail }),
    });
    const resSuspended = await postSendResetLink(reqSuspended);
    const bodySuspended = await resSuspended.json();

    assert('Suspended account returns generic HTTP 200', resSuspended.status === 200);
    assert('Suspended account returns identical generic message', bodySuspended.message === bodyUnknown.message);

    const suspendedTokens = await (prisma as any).passwordReset.findMany({
      where: { userId: suspendedUser.id },
    });
    assert('No reset token was written to database for suspended account', suspendedTokens.length === 0);

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 3: 15-MINUTE EXPIRATION WINDOW ENFORCEMENT
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 3: 15-Minute Expiration Enforcement ---');

    const { user: expUser } = await createTestUser('Store Manager', 'HYD', 'expiry.test');
    const expiredTokenRaw = crypto.randomBytes(32).toString('hex');
    const expiredTokenHash = crypto.createHash('sha256').update(expiredTokenRaw).digest('hex');

    // Create token expired 5 minutes ago
    await (prisma as any).passwordReset.create({
      data: {
        userId: expUser.id,
        token: expiredTokenHash,
        expiresAt: new Date(Date.now() - 5 * 60 * 1000), // in the past
      },
    });

    // Pre-flight check on expired token
    const reqExpVerify = new NextRequest(`http://localhost:4028/api/auth/verify-reset-token?token=${expiredTokenRaw}`);
    const resExpVerify = await getVerifyResetToken(reqExpVerify);
    const bodyExpVerify = await resExpVerify.json();
    assert('Expired token pre-flight verification returns valid: false', bodyExpVerify.valid === false);
    assert('Expired token pre-flight identifies reason as EXPIRED', bodyExpVerify.reason === 'EXPIRED');

    // Attempt redemption of expired token
    const reqExpRedeem = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: expiredTokenRaw, newPassword: 'StrongNewPass2026!' }),
    });
    const resExpRedeem = await postResetPassword(reqExpRedeem);
    assert('Redemption of expired token fails with HTTP 401', resExpRedeem.status === 401);

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 4: REPLAY ATTACK PREVENTION
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 4: Replay Attack (Token Reuse) Prevention ---');

    const { user: replayUser, email: replayEmail } = await createTestUser('Sales Manager', 'BLR', 'replay.staff');
    const reqReplayLink = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-inspect-token': 'true' },
      body: JSON.stringify({ email: replayEmail }),
    });
    const resReplayLink = await postSendResetLink(reqReplayLink);
    const replayToken = (await resReplayLink.json())._testOnlyToken;

    // First redemption succeeds
    const reqReplay1 = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: replayToken, newPassword: 'FirstRedemption2026!' }),
    });
    const resReplay1 = await postResetPassword(reqReplay1);
    assert('First token redemption succeeds with HTTP 200', resReplay1.status === 200);

    // Second redemption with same token fails
    const reqReplay2 = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: replayToken, newPassword: 'SecondRedemptionAttempt2026!' }),
    });
    const resReplay2 = await postResetPassword(reqReplay2);
    assert('Replay attack rejected with HTTP 401', resReplay2.status === 401);

    // Pre-flight check on consumed token returns USED
    const reqUsedVerify = new NextRequest(`http://localhost:4028/api/auth/verify-reset-token?token=${replayToken}`);
    const resUsedVerify = await getVerifyResetToken(reqUsedVerify);
    const bodyUsedVerify = await resUsedVerify.json();
    assert('Consumed token identifies as reason: USED', bodyUsedVerify.reason === 'USED');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 5: CONCURRENCY RACE CONDITION (ATOMIC REDEMPTION)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 5: Concurrency Race Condition (Atomic Redemption) ---');

    const { user: raceUser, email: raceEmail } = await createTestUser('Store Manager', 'DEL', 'concurrency.test');
    const reqRaceLink = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-inspect-token': 'true' },
      body: JSON.stringify({ email: raceEmail }),
    });
    const resRaceLink = await postSendResetLink(reqRaceLink);
    const raceToken = (await resRaceLink.json())._testOnlyToken;

    // Fire 5 concurrent requests at the exact same millisecond
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      postResetPassword(
        new NextRequest('http://localhost:4028/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetToken: raceToken, newPassword: `ParallelP@ssword2026!_${i}` }),
        })
      )
    );

    const concurrentResponses = await Promise.all(concurrentRequests);
    const statuses = concurrentResponses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200).length;
    const rejections = statuses.filter((s) => s === 401).length;

    assert('Concurrent race condition: Exactly 1 request succeeds (HTTP 200)', successes === 1, `Got ${successes} successes`);
    assert('Concurrent race condition: Remaining 4 requests fail (HTTP 401)', rejections === 4, `Got ${rejections} rejections`);

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 6: ACTIVE SESSION REVOCATION
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 6: Session Invalidation Across All Devices ---');

    const { user: sessionUser, email: sessionEmail } = await createTestUser('Sales Manager', 'BLR', 'session.revocation');

    // Create 3 active DB user sessions for this user
    const sid1 = crypto.randomUUID();
    const sid2 = crypto.randomUUID();
    const sid3 = crypto.randomUUID();
    const token1 = signSessionToken({ id: sessionUser.id } as any, sid1);
    const token2 = signSessionToken({ id: sessionUser.id } as any, sid2);
    const token3 = signSessionToken({ id: sessionUser.id } as any, sid3);

    for (const [sid, tok] of [[sid1, token1], [sid2, token2], [sid3, token3]]) {
      await (prisma as any).userSession.create({
        data: {
          id: sid,
          userId: sessionUser.id,
          tokenHash: hashSessionToken(tok),
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          revokedAt: null,
        },
      });
    }

    // Perform password reset
    const reqSessLink = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-inspect-token': 'true' },
      body: JSON.stringify({ email: sessionEmail }),
    });
    const sessToken = (await (await postSendResetLink(reqSessLink)).json())._testOnlyToken;

    const reqSessReset = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: sessToken, newPassword: 'NewRevocationSecret2026!Key' }),
    });
    const resSessReset = await postResetPassword(reqSessReset);
    assert('Session revocation password reset succeeds with HTTP 200', resSessReset.status === 200);

    // Verify all sessions were marked revoked
    const activeSessions = await (prisma as any).userSession.findMany({
      where: { userId: sessionUser.id, revokedAt: null },
    });
    const revokedSessions = await (prisma as any).userSession.findMany({
      where: { userId: sessionUser.id, revokedAt: { not: null } },
    });

    assert('All active user sessions revoked upon password recovery', activeSessions.length === 0);
    assert('Three revoked session records exist in database', revokedSessions.length === 3);

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST SECTION 7: ADMIN-INITIATED INVITATIONS & STORE ISOLATION
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 7: Admin-Initiated Reset Invitations & Store Isolation ---');

    const { user: superAdminUser } = await createTestUser('Super Admin', 'All Stores', 'root.admin');
    const { user: storeMgrBLR } = await createTestUser('Store Manager', 'BLR', 'manager.blr');
    const { user: salesMgrBLR } = await createTestUser('Sales Manager', 'BLR', 'sales.blr');
    const { user: salesMgrMUM } = await createTestUser('Sales Manager', 'MUM', 'sales.mum');

    // Create session tokens for callers
    function makeAuthHeader(user: any) {
      const sid = crypto.randomUUID();
      const jwtToken = signSessionToken(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          securityLevel: user.securityLevel,
          store: user.storeScope,
          allowedStores: [user.storeScope],
          avatar: 'U',
        },
        sid
      );
      // Create DB session so authenticateRequest passes
      return (prisma as any).userSession
        .create({
          data: {
            id: sid,
            userId: user.id,
            tokenHash: hashSessionToken(jwtToken),
            expiresAt: new Date(Date.now() + 3600 * 1000),
          },
        })
        .then(() => ({ Authorization: `Bearer ${jwtToken}` }));
    }

    const superAdminHeaders = await makeAuthHeader(superAdminUser);
    const storeMgrHeaders = await makeAuthHeader(storeMgrBLR);
    const salesMgrHeaders = await makeAuthHeader(salesMgrBLR);

    // 1. Super Admin can invite Store Manager
    const reqSaToSm = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...superAdminHeaders },
      body: JSON.stringify({ userId: storeMgrBLR.id }),
    });
    const resSaToSm = await postSendResetInvitation(reqSaToSm);
    assert('Super Admin can dispatch reset invitation to Store Manager (HTTP 200)', resSaToSm.status === 200);

    // 2. Store Manager can invite Sales Manager in their OWN store
    const reqSmToSameStore = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...storeMgrHeaders },
      body: JSON.stringify({ userId: salesMgrBLR.id }),
    });
    const resSmToSameStore = await postSendResetInvitation(reqSmToSameStore);
    assert('Store Manager can dispatch reset invitation to Sales Manager in same store (HTTP 200)', resSmToSameStore.status === 200);

    // 3. Store Manager CANNOT invite Sales Manager in ANOTHER store (Strict Store Isolation)
    const reqSmToOtherStore = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...storeMgrHeaders },
      body: JSON.stringify({ userId: salesMgrMUM.id }),
    });
    const resSmToOtherStore = await postSendResetInvitation(reqSmToOtherStore);
    assert('Store Manager CANNOT dispatch reset invitation to other store (HTTP 403 Store Isolation)', resSmToOtherStore.status === 403);

    // 4. Store Manager CANNOT invite Super Admin
    const reqSmToSa = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...storeMgrHeaders },
      body: JSON.stringify({ userId: superAdminUser.id }),
    });
    const resSmToSa = await postSendResetInvitation(reqSmToSa);
    assert('Store Manager CANNOT dispatch reset invitation to Super Admin (HTTP 403 Root Protection)', resSmToSa.status === 403);

    // 5. Sales Manager CANNOT dispatch any invitations
    const reqSalesInvite = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...salesMgrHeaders },
      body: JSON.stringify({ userId: salesMgrBLR.id }),
    });
    const resSalesInvite = await postSendResetInvitation(reqSalesInvite);
    assert('Sales Manager CANNOT dispatch reset invitations (HTTP 403)', resSalesInvite.status === 403);

    // 6. Super Admin account cannot be reset even by Super Admin via invitation (self-service only)
    const reqSaToSa = new NextRequest('http://localhost:4028/api/users/send-reset-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...superAdminHeaders },
      body: JSON.stringify({ userId: superAdminUser.id }),
    });
    const resSaToSa = await postSendResetInvitation(reqSaToSa);
    assert('Super Admin cannot be reset via invitation endpoint (HTTP 403 Self-Service Root Only)', resSaToSa.status === 403);

    console.log('\n========================================================================================');
    console.log(`📊 FINAL RESULTS: ${passed} passed, ${failed} failed across 7 enterprise security domains`);
    console.log('========================================================================================\n');
  } finally {
    // Clean up all temporary test users, tokens, and sessions
    try {
      if (createdUserIds.length > 0) {
        await (prisma as any).passwordReset.deleteMany({ where: { userId: { in: createdUserIds } } });
        await (prisma as any).userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.userStoreAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.userAccount.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runPasswordSecurityMatrix()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
