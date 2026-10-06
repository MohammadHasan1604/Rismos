import { validatePassword, getPasswordStrengthDisplay } from '../src/lib/passwordPolicy';

async function testPasswordPolicy() {
  console.log('========================================================================');
  console.log('🔒 ENTERPRISE PASSWORD POLICY VALIDATION TEST SUITE (NIST SP 800-63B)');
  console.log('========================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assertTest(name: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passedTests++;
    } else {
      console.error(`  ❌ ${name} — ${detail || 'FAILED'}`);
      failedTests++;
    }
  }

  // 1. Valid compliant password (12+ chars, upper, lower, number, symbol)
  const valid1 = validatePassword('SecurePass123!');
  console.log('Test 1: "SecurePass123!" ->', getPasswordStrengthDisplay(valid1.score));
  assertTest('SecurePass123! passes validation', valid1.valid === true);
  assertTest('SecurePass123! has 0 errors', valid1.errors.length === 0);
  assertTest('SecurePass123! has strong score >= 70', valid1.score >= 70);

  // 2. Weak pattern rejection: "password123"
  const weak1 = validatePassword('password123');
  console.log('Test 2: "password123" ->', getPasswordStrengthDisplay(weak1.score));
  assertTest('password123 is rejected', weak1.valid === false);
  assertTest(
    'password123 reports missing uppercase and weak pattern',
    weak1.errors.some((e) => e.includes('uppercase')) &&
      weak1.errors.some((e) => e.includes('guessable') || e.includes('pattern') || e.includes('special'))
  );

  // 3. Short password rejection: "Pass1!"
  const short1 = validatePassword('Pass1!');
  console.log('Test 3: "Pass1!" ->', getPasswordStrengthDisplay(short1.score));
  assertTest('Pass1! (6 chars) is rejected', short1.valid === false);
  assertTest(
    'Pass1! flags length < 12',
    short1.errors.some((e) => e.includes('12 characters'))
  );

  // 4. Sequential pattern rejection: "123456Aa!@#$"
  const sequential = validatePassword('123456Aa!@#$');
  assertTest('123456 sequential pattern is rejected', sequential.valid === false);

  // 5. Brand pattern rejection: "CoskoRetail2026!"
  const brandWord = validatePassword('CoskoRetail2026!');
  assertTest('Brand name "cosko" pattern is flagged in weak pattern list', brandWord.errors.some((e) => e.includes('cosko')));

  // 6. Very strong long compliant password (18+ chars)
  const strongLong = validatePassword('EnterpriseRetail@SuperSecure2026!Platform');
  assertTest('18+ characters password achieves >= 90 score', strongLong.score >= 90);

  console.log('\n========================================================================');
  console.log(`📊 Password Policy Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

testPasswordPolicy().catch((err) => {
  console.error(err);
  process.exit(1);
});
