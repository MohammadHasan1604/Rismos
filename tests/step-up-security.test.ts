import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/db';
import {
  verifySensitiveAction,
  SensitiveActionType,
} from '../src/lib/sensitiveAction';
import { hashToken } from '../src/lib/auth';
import crypto from 'crypto';

/**
 * P3-8: Step-Up Security Test Suite
 *
 * Requirements:
 * When enabled:
 * - Critical destructive request without valid step-up token -> fail
 * - Fake confirmAction=true must NOT be enough -> fail
 * - Valid recent step-up grant -> succeed if RBAC also allows it
 * - Expired grant -> fail
 * - Reused grant -> fail (single-use only)
 * - Wrong user grant -> fail
 * - Wrong action grant -> fail
 * When disabled:
 * - Normal RBAC still applies, step-up check bypassed
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${description}${details ? ` -> ${details}` : ''}`);
    failures.push(description);
    failed++;
  }
}

async function createStepUpGrant(userId: string, actionType: string, options?: { isExpired?: boolean; isUsed?: boolean }): Promise<string> {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  if (options?.isExpired) {
    expiresAt.setMinutes(expiresAt.getMinutes() - 10); // 10 minutes ago
  } else {
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes in future
  }

  await (prisma as any).stepUpGrant.create({
    data: {
      userId,
      tokenHash,
      actionType,
      expiresAt,
      usedAt: options?.isUsed ? new Date() : null,
    },
  });

  return rawToken;
}

async function runStepUpSecuritySuite() {
  console.log('========================================================================');
  console.log('🔐 P3-8: STEP-UP AUTHENTICATION & SINGLE-USE GRANT SECURITY TEST');
  console.log('========================================================================\n');

  // Load test users
  const superAdmin = await prisma.userAccount.findFirst({ where: { role: 'Super Admin' } });
  const storeManager = await prisma.userAccount.findFirst({ where: { role: 'Store Manager' } });

  if (!superAdmin || !storeManager) {
    throw new Error('Database must have seeded users for Super Admin and Store Manager');
  }

  const saUser: any = {
    id: superAdmin.id,
    name: superAdmin.name,
    email: superAdmin.email,
    role: superAdmin.role as any,
    securityLevel: superAdmin.securityLevel,
    store: superAdmin.storeScope || 'BLR',
    allowedStores: [superAdmin.storeScope || 'BLR'],
    status: 'Active',
    mustChangePassword: false,
    sessionId: 'test-session-id',
    permissions: ['*'],
    overrides: {},
  };

  const smUser: any = {
    id: storeManager.id,
    name: storeManager.name,
    email: storeManager.email,
    role: storeManager.role as any,
    securityLevel: storeManager.securityLevel,
    store: storeManager.storeScope || 'BLR',
    allowedStores: [storeManager.storeScope || 'BLR'],
    status: 'Active',
    mustChangePassword: false,
    sessionId: 'test-session-id-2',
    permissions: [],
    overrides: {},
  };

  // Ensure step-up is enabled in DB
  const originalSystem = await (prisma as any).systemSettings.findFirst();
  await (prisma as any).systemSettings.upsert({
    where: { id: 'cosko_system_config' },
    create: { id: 'cosko_system_config', sensitiveActionConfirm: true },
    update: { sensitiveActionConfirm: true },
  });

  try {
    // ─────────────────────────────────────────────────────────────────────
    // 1. STEP-UP ENABLED: REJECTION WITHOUT TOKEN
    // ─────────────────────────────────────────────────────────────────────
    console.log('--- 1. Testing Destructive Requests Without Step-Up Token ---');
    const emptyReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Voiding duplicate' }),
    });
    const resNoToken = await verifySensitiveAction(emptyReq, { reason: 'Voiding duplicate' }, saUser, 'VOID_SALE');
    assert('Request with missing step-up token is rejected (allowed=false)', !resNoToken.allowed);
    assert('Error indicates Step-Up Authentication Required', resNoToken.error?.includes('Step-Up Authentication Required') ?? false);
    assert('Returns HTTP 403 status code', resNoToken.status === 403);
    assert('Flags stepUpRequired=true in response payload', resNoToken.stepUpRequired === true);

    // ─────────────────────────────────────────────────────────────────────
    // 2. FAKE "confirmAction=true" MUST NOT BE ENOUGH
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Testing Fake confirmAction=true Bypass Attempts ---');
    const fakeConfirmBodies = [
      { confirmAction: true, reason: 'Emergency void' },
      { confirmed: true, reason: 'Emergency void' },
      { isConfirmed: true, confirmAction: 'true', reason: 'Emergency void' },
    ];
    for (const fakeBody of fakeConfirmBodies) {
      const fakeReq = new NextRequest('http://localhost:3000/api/sales/void', {
        method: 'POST',
        body: JSON.stringify(fakeBody),
      });
      const resFake = await verifySensitiveAction(fakeReq, fakeBody, saUser, 'VOID_SALE');
      assert(
        `Fake client confirmation (${JSON.stringify(fakeBody)}) is strictly rejected`,
        !resFake.allowed && resFake.status === 403 && resFake.stepUpRequired === true
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. VALID STEP-UP GRANT TOKEN (SUCCESS & CONSUMPTION)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Testing Valid Step-Up Grant Execution ---');
    const validToken = await createStepUpGrant(superAdmin.id, 'VOID_SALE');

    const validReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      headers: { 'x-step-up-token': validToken },
      body: JSON.stringify({ reason: 'Valid administrative void' }),
    });
    const resValid = await verifySensitiveAction(
      validReq,
      { reason: 'Valid administrative void' },
      saUser,
      'VOID_SALE'
    );
    assert('Valid recent step-up grant token is accepted (allowed=true)', resValid.allowed === true);

    // ─────────────────────────────────────────────────────────────────────
    // 4. SINGLE-USE REPLAY ATTACK (REUSED GRANT MUST FAIL)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Testing Replay Protection (Reused Token) ---');
    const replayReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      headers: { 'x-step-up-token': validToken },
      body: JSON.stringify({ reason: 'Replay attempt with same token' }),
    });
    const resReplay = await verifySensitiveAction(
      replayReq,
      { reason: 'Replay attempt with same token' },
      saUser,
      'VOID_SALE'
    );
    assert('Replaying the consumed step-up token is rejected (allowed=false)', !resReplay.allowed);
    assert('Replay error indicates token was already used', resReplay.error?.includes('already been used') ?? false);

    // ─────────────────────────────────────────────────────────────────────
    // 5. EXPIRED STEP-UP GRANT TOKEN
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Testing Expired Grant Rejection ---');
    const expiredToken = await createStepUpGrant(superAdmin.id, 'VOID_SALE', { isExpired: true });
    const expiredReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      headers: { 'x-step-up-token': expiredToken },
      body: JSON.stringify({ reason: 'Expired grant test' }),
    });
    const resExpired = await verifySensitiveAction(
      expiredReq,
      { reason: 'Expired grant test' },
      saUser,
      'VOID_SALE'
    );
    assert('Expired grant token is rejected (allowed=false)', !resExpired.allowed);
    assert('Error indicates grant has expired', resExpired.error?.includes('expired') ?? false);

    // ─────────────────────────────────────────────────────────────────────
    // 6. WRONG USER GRANT TOKEN (CROSS-USER THEFT ATTEMPT)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Testing Cross-User Grant Theft Rejection ---');
    // Token was generated by Super Admin, but presented by Store Manager
    const stolenToken = await createStepUpGrant(superAdmin.id, 'VOID_SALE');
    const stolenReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      headers: { 'x-step-up-token': stolenToken },
      body: JSON.stringify({ reason: 'Store manager presents super admin grant' }),
    });
    const resStolen = await verifySensitiveAction(
      stolenReq,
      { reason: 'Store manager presents super admin grant' },
      smUser,
      'VOID_SALE'
    );
    assert('Step-up grant belonging to different user is rejected (allowed=false)', !resStolen.allowed);
    assert('Error indicates step-up grant user mismatch', resStolen.error?.includes('mismatch') ?? false);

    // ─────────────────────────────────────────────────────────────────────
    // 7. WRONG ACTION TYPE (ACTION MISMATCH)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Testing Wrong Action Scope Rejection ---');
    // Grant issued for VOID_SALE but presented for CONFIG_CHANGE
    const wrongActionToken = await createStepUpGrant(superAdmin.id, 'VOID_SALE');
    const wrongActionReq = new NextRequest('http://localhost:3000/api/settings', {
      method: 'POST',
      headers: { 'x-step-up-token': wrongActionToken },
      body: JSON.stringify({ reason: 'Admin changes config' }),
    });
    const resWrongAction = await verifySensitiveAction(
      wrongActionReq,
      { reason: 'Admin changes config' },
      saUser,
      'CONFIG_CHANGE'
    );
    assert('Grant issued for VOID_SALE is rejected when used for CONFIG_CHANGE', !resWrongAction.allowed);
    assert('Error indicates action mismatch', resWrongAction.error?.includes('issued for') ?? false);

    // ─────────────────────────────────────────────────────────────────────
    // 8. MANDATORY AUDIT TRAIL (REASON < 3 CHARS FOR NON-SUPER-ADMIN)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 8. Testing Mandatory Justification Audit Requirement ---');
    const smGrant = await createStepUpGrant(storeManager.id, 'VOID_SALE');
    const smNoReasonReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      headers: { 'x-step-up-token': smGrant },
      body: JSON.stringify({ reason: 'ok' }), // only 2 chars
    });
    const resNoReason = await verifySensitiveAction(
      smNoReasonReq,
      { reason: 'ok' },
      smUser,
      'VOID_SALE'
    );
    assert('Non-Super-Admin without >=3 char justification is rejected (400)', !resNoReason.allowed && resNoReason.status === 400);

    // ─────────────────────────────────────────────────────────────────────
    // 9. RBAC PRE-CHECK PRECEDENCE (INSUFFICIENT ROLE CANNOT BYPASS)
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 9. Testing RBAC Precedence Over Step-Up ---');
    // Store Manager attempts ROLE_ESCALATION with a valid grant -> RBAC must fail first!
    const smEscalationToken = await createStepUpGrant(storeManager.id, 'ROLE_ESCALATION');
    const smEscalationReq = new NextRequest('http://localhost:3000/api/users/role', {
      method: 'POST',
      headers: { 'x-step-up-token': smEscalationToken },
      body: JSON.stringify({ reason: 'Attempting self escalation' }),
    });
    const resRbac = await verifySensitiveAction(
      smEscalationReq,
      { reason: 'Attempting self escalation' },
      smUser,
      'ROLE_ESCALATION'
    );
    assert('Store Manager attempting ROLE_ESCALATION is rejected by RBAC pre-check (403)', !resRbac.allowed && resRbac.status === 403);

    // ─────────────────────────────────────────────────────────────────────
    // 10. STEP-UP DISABLED BEHAVIOR
    // ─────────────────────────────────────────────────────────────────────
    console.log('\n--- 10. Testing Behavior When Step-Up is Globally Disabled ---');
    await (prisma as any).systemSettings.update({
      where: { id: 'cosko_system_config' },
      data: { sensitiveActionConfirm: false },
    });

    const disabledReq = new NextRequest('http://localhost:3000/api/sales/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Voiding when disabled' }),
    });
    const resDisabled = await verifySensitiveAction(
      disabledReq,
      { reason: 'Voiding when disabled' },
      saUser,
      'VOID_SALE'
    );
    assert('When sensitiveActionConfirm=false, step-up token requirement is bypassed for Super Admin', resDisabled.allowed === true);

  } catch (err: any) {
    console.error('Step-up test error:', err);
    assert('Execution completed without error', false, err.message);
  } finally {
    console.log('\n--- Restoring Original System Settings ---');
    try {
      if (originalSystem) {
        await (prisma as any).systemSettings.update({
          where: { id: 'cosko_system_config' },
          data: { sensitiveActionConfirm: originalSystem.sensitiveActionConfirm ?? true },
        });
      }
      // Clean up test grants
      await (prisma as any).stepUpGrant.deleteMany({
        where: { userId: { in: [superAdmin.id, storeManager.id] } },
      });
      console.log('  ✅ Step-up test state restored and test grants cleaned up.');
    } catch (e: any) {
      console.warn('  ⚠️ Restore warning:', e.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runStepUpSecuritySuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
