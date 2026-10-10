import { prisma } from '../src/lib/db';
import { hashPassword, comparePassword } from '../src/lib/auth';
import { NextRequest } from 'next/server';
import { POST as postSendResetLink } from '../src/app/api/auth/send-reset-link/route';
import { POST as postResetPassword } from '../src/app/api/auth/reset-password/route';

async function testPasswordResetFlow() {
  console.log('========================================================================');
  console.log('🔑 TESTING SELF-SERVE TOKENIZED PASSWORD RESET FLOW (15-MIN EXPIRY)');
  console.log('========================================================================\n');

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

  // 1. Setup a dedicated temporary test user
  const testEmail = `reset.tester.${Date.now()}@rismos.com`;
  const initialPassword = 'InitialOldPassword123!';
  const hashedPassword = await hashPassword(initialPassword);

  const testUser = await prisma.userAccount.create({
    data: {
      email: testEmail,
      name: 'Reset Test Staff',
      passwordHash: hashedPassword,
      role: 'Sales Manager',
      securityLevel: 40,
      storeScope: 'BLR',
      status: 'Active',
    },
  });
  console.log(`Created test user: ${testUser.email} (ID: ${testUser.id})`);

  try {
    // 2. Request password reset link via API
    console.log('\n--- Step 1: Requesting reset link ---');
    const req1 = new NextRequest('http://localhost:4028/api/auth/send-reset-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-inspect-token': 'true',
      },
      body: JSON.stringify({ email: testEmail }),
    });
    const res1 = await postSendResetLink(req1);
    const body1 = await res1.json();

    assert('POST /api/auth/send-reset-link returns HTTP 200', res1.status === 200);
    assert('Response indicates reset link dispatched with anti-enumeration message', body1.success === true);
    assert('Test runner inspects reset token via test header', typeof body1._testOnlyToken === 'string');

    const resetToken = body1._testOnlyToken;

    // Verify token record in database
    const dbRecord = await (prisma as any).passwordReset.findFirst({
      where: { userId: testUser.id, usedAt: null },
    });
    assert('Token record exists in database password_resets table', Boolean(dbRecord));
    assert(
      'Token expiration is set to 15 minutes in the future',
      dbRecord.expiresAt > new Date(Date.now() + 14 * 60 * 1000) &&
        dbRecord.expiresAt <= new Date(Date.now() + 16 * 60 * 1000)
    );

    // 3. Attempt reset with weak password (rejection test)
    console.log('\n--- Step 2: Testing weak password rejection ---');
    const reqWeak = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'weak' }),
    });
    const resWeak = await postResetPassword(reqWeak);
    const bodyWeak = await resWeak.json();
    assert('Weak password rejected with HTTP 400', resWeak.status === 400);
    assert('Weak password error details provided', Boolean(bodyWeak.requirements || bodyWeak.details));

    // 4. Reset password with strong enterprise password
    console.log('\n--- Step 3: Completing password reset with strong password ---');
    const newStrongPassword = 'NewSecureCredential2026!Success';
    const reqStrong = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: newStrongPassword }),
    });
    const resStrong = await postResetPassword(reqStrong);
    const bodyStrong = await resStrong.json();

    assert('Strong password reset succeeds with HTTP 200', resStrong.status === 200);
    assert('Success confirmation received', bodyStrong.success === true);

    // 5. Verify database password was updated and token consumed
    const updatedUser = await prisma.userAccount.findUnique({
      where: { id: testUser.id },
    });
    const isNewPassValid = await comparePassword(newStrongPassword, updatedUser!.passwordHash);
    const isOldPassValid = await comparePassword(initialPassword, updatedUser!.passwordHash);

    assert('New password hash verifies correctly with bcrypt', isNewPassValid === true);
    assert('Old password is no longer valid', isOldPassValid === false);

    const consumedToken = await (prisma as any).passwordReset.findFirst({
      where: { id: dbRecord.id },
    });
    assert('Token marked as consumed (usedAt timestamp recorded)', consumedToken?.usedAt !== null);

    // 6. Attempt token reuse (replay attack prevention)
    console.log('\n--- Step 4: Testing replay attack prevention ---');
    const reqReplay = new NextRequest('http://localhost:4028/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'AnotherStrongSecret2026!' }),
    });
    const resReplay = await postResetPassword(reqReplay);
    assert('Replay attack rejected with HTTP 401', resReplay.status === 401);

    // 7. Verify audit log entry was created
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        userId: testUser.id,
        action: 'PASSWORD_RESET_COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert('PASSWORD_RESET_COMPLETED action recorded in audit log', Boolean(auditRecord));

    console.log('\n========================================================================');
    console.log(`📊 Self-Serve Password Reset Results: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');
  } finally {
    // Cleanup test user and tokens
    try {
      await (prisma as any).passwordReset.deleteMany({ where: { userId: testUser.id } });
      await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
      await prisma.userAccount.delete({ where: { id: testUser.id } });
    } catch {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

testPasswordResetFlow()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
