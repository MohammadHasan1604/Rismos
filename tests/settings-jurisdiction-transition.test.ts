import { prisma } from '../src/lib/db';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { GET as getSettings, POST as postSettings } from '../src/app/api/settings/route';
import { hashPassword, signSessionToken, hashSessionToken, hashToken } from '../src/lib/auth';

async function runSettingsJurisdictionTests() {
  console.log('========================================================================================');
  console.log('🏛️ RISMOS SETTINGS & JURISDICTION DATA INTEGRITY TEST SUITE');
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

  // 1. Create a Super Admin test account and active session
  const adminEmail = `superadmin.jur.${Date.now()}@rismos-test.com`;
  const passwordHash = await hashPassword('AdminSecurePass123!');
  const adminUser = await prisma.userAccount.create({
    data: {
      email: adminEmail,
      name: 'Jurisdiction Test Admin',
      passwordHash,
      role: 'Super Admin',
      securityLevel: 100,
      storeScope: 'All Stores',
      status: 'Active',
      mustChangePassword: false,
    },
  });

  const sessionId = crypto.randomUUID();
  const sessionToken = signSessionToken({ id: adminUser.id } as any, sessionId);
  const tokenHash = hashSessionToken(sessionToken);

  await (prisma as any).userSession.create({
    data: {
      id: sessionId,
      userId: adminUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revokedAt: null,
    },
  });

  async function createStepUpGrant() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const stepUpHash = hashToken(rawToken);
    await (prisma as any).stepUpGrant.create({
      data: {
        userId: adminUser.id,
        tokenHash: stepUpHash,
        actionType: 'CONFIG_CHANGE',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return rawToken;
  }

  function createAuthedRequest(method: string, url: string, body?: any, stepUpToken?: string) {
    const headers = new Headers();
    headers.set('authorization', `Bearer ${sessionToken}`);
    if (body) {
      headers.set('Content-Type', 'application/json');
    }
    if (stepUpToken) {
      headers.set('x-step-up-token', stepUpToken);
    }
    return new NextRequest(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  try {
    // ─── STEP 1: Baseline India Setup ───
    console.log('--- TEST 1: Baseline India Jurisdiction Setup ---');
    const indiaProfileReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'profile',
      data: {
        businessName: 'RISMOS India HQ',
        countryCode: 'IN',
        country: 'India',
        businessAddress: '100 Feet Ring Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
    });
    const indiaProfileRes = await postSettings(indiaProfileReq);
    assert('India profile save returns HTTP 200', indiaProfileRes.status === 200);

    const stepUp1 = await createStepUpGrant();
    const indiaTaxReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'tax',
      data: {
        countryCode: 'IN',
        taxRegime: 'GST',
        taxRegistrationNumber: '29AABCU9603R1ZM',
        defaultTaxRate: 18,
        taxInclusivePricing: true,
      },
    }, stepUp1);
    const indiaTaxRes = await postSettings(indiaTaxReq);
    assert('India GST save returns HTTP 200', indiaTaxRes.status === 200);

    // Verify GET in India mode
    const getIndiaReq = createAuthedRequest('GET', 'http://localhost/api/settings?fresh=true');
    const getIndiaRes = await getSettings(getIndiaReq);
    const getIndiaData = await getIndiaRes.json();

    assert('GET in India mode returns countryCode IN', getIndiaData.systemSettings.countryCode === 'IN');
    assert('GET in India mode returns GSTIN 29AABCU9603R1ZM', getIndiaData.systemSettings.gstin === '29AABCU9603R1ZM');
    assert('GET in India mode returns Karnataka state code 29', getIndiaData.systemSettings.gstStateCode === '29');
    assert('GET in India mode returns taxRegistrationNumber equal to GSTIN', getIndiaData.systemSettings.taxRegistrationNumber === '29AABCU9603R1ZM');

    // ─── STEP 2: Transition from India to UAE (Profile) ───
    console.log('\n--- TEST 2: India to UAE Jurisdiction Transition ---');
    const uaeProfileReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'profile',
      data: {
        businessName: 'RISMOS Middle East FZCO',
        countryCode: 'AE',
        country: 'United Arab Emirates',
        businessAddress: 'Sheikh Zayed Road, DIFC',
        city: 'Dubai',
        state: 'Dubai',
        pincode: '',
      },
    });
    const uaeProfileRes = await postSettings(uaeProfileReq);
    const uaeProfileData = await uaeProfileRes.json();

    assert('UAE profile save returns HTTP 200', uaeProfileRes.status === 200);
    assert('UAE profile save returns branding and systemSettings in lockstep', Boolean(uaeProfileData.branding && uaeProfileData.systemSettings));
    assert('UAE profile syncs currency to AED', uaeProfileData.systemSettings.currencyCode === 'AED');
    assert('UAE profile syncs tax regime to VAT', uaeProfileData.systemSettings.taxRegime === 'VAT');
    assert('UAE profile clears incompatible Indian GSTIN', uaeProfileData.systemSettings.gstin === null);
    assert('UAE profile clears incompatible taxRegistrationNumber', uaeProfileData.systemSettings.taxRegistrationNumber === null);

    // ─── STEP 3: Verify GET in UAE Mode (No Stale India Leaks) ───
    console.log('\n--- TEST 3: GET /api/settings under UAE Jurisdiction ---');
    const getUaeReq = createAuthedRequest('GET', 'http://localhost/api/settings?fresh=true');
    const getUaeRes = await getSettings(getUaeReq);
    const getUaeData = await getUaeRes.json();

    assert('GET in UAE mode returns countryCode AE', getUaeData.systemSettings.countryCode === 'AE');
    assert('GET in UAE mode returns taxRegime VAT', getUaeData.systemSettings.taxRegime === 'VAT');
    assert('GET in UAE mode does NOT leak GSTIN', getUaeData.systemSettings.gstin === null);
    assert('GET in UAE mode does NOT leak Indian taxRegistrationNumber', getUaeData.systemSettings.taxRegistrationNumber === null);
    assert('GET in UAE mode does NOT leak Indian GST state', getUaeData.systemSettings.gstState === null);
    assert('GET in UAE mode does NOT leak Indian GST state code', getUaeData.systemSettings.gstStateCode === null);
    assert('GET in UAE mode branding countryCode is AE', getUaeData.branding.countryCode === 'AE');
    assert('GET in UAE mode branding timezone is Asia/Dubai', getUaeData.branding.timezone === 'Asia/Dubai');

    // ─── STEP 4: Incompatible Tax Registration Rejection ───
    console.log('\n--- TEST 4: Rejection of Indian GSTIN submitted as UAE TRN ---');
    const stepUp2 = await createStepUpGrant();
    const invalidUaeTaxReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'tax',
      data: {
        countryCode: 'AE',
        taxRegime: 'VAT',
        taxRegistrationNumber: '29AABCU9603R1ZM', // ❌ Indian GSTIN submitted as UAE TRN
      },
    }, stepUp2);
    const invalidUaeTaxRes = await postSettings(invalidUaeTaxReq);
    const invalidUaeTaxData = await invalidUaeTaxRes.json();

    assert('Submitting Indian GSTIN as UAE TRN returns HTTP 400', invalidUaeTaxRes.status === 400);
    assert('Error message specifically identifies invalid UAE TRN format', Boolean(invalidUaeTaxData.error?.includes('TRN')));

    // ─── STEP 5: Valid UAE TRN Acceptance ───
    console.log('\n--- TEST 5: Valid UAE TRN Acceptance & Persistence ---');
    const stepUp3 = await createStepUpGrant();
    const validUaeTaxReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'tax',
      data: {
        countryCode: 'AE',
        taxRegime: 'VAT',
        taxRegistrationNumber: '100123456789003', // ✅ Valid 15-digit UAE TRN starting with 100
        defaultTaxRate: 5,
        taxInclusivePricing: true,
      },
    }, stepUp3);
    const validUaeTaxRes = await postSettings(validUaeTaxReq);
    const validUaeTaxData = await validUaeTaxRes.json();

    assert('Submitting valid UAE TRN returns HTTP 200', validUaeTaxRes.status === 200);
    assert('System settings records UAE TRN', validUaeTaxData.systemSettings.taxRegistrationNumber === '100123456789003');
    assert('System settings defaultTaxRate is 5%', Number(validUaeTaxData.systemSettings.defaultTaxRate) === 5);
    assert('System settings does NOT have gstin', validUaeTaxData.systemSettings.gstin === null);
    assert('Branding is synchronized with countryCode AE', validUaeTaxData.branding.countryCode === 'AE');

    // ─── STEP 6: Transition Back from UAE to India ───
    console.log('\n--- TEST 6: UAE to India Transition (Invalid UAE TRN not accepted as GSTIN) ---');
    const backToIndiaProfileReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'profile',
      data: {
        businessName: 'RISMOS India Flagship',
        countryCode: 'IN',
        country: 'India',
        businessAddress: 'MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
      },
    });
    const backToIndiaRes = await postSettings(backToIndiaProfileReq);
    const backToIndiaData = await backToIndiaRes.json();

    assert('Transitioning back to India returns HTTP 200', backToIndiaRes.status === 200);
    assert('System settings countryCode is IN', backToIndiaData.systemSettings.countryCode === 'IN');
    assert('System settings taxRegime is GST', backToIndiaData.systemSettings.taxRegime === 'GST');
    assert('System settings currencyCode is INR', backToIndiaData.systemSettings.currencyCode === 'INR');
    assert('UAE TRN was NOT preserved as Indian GSTIN', backToIndiaData.systemSettings.gstin === null);

    // Save valid GSTIN
    const stepUp4 = await createStepUpGrant();
    const validIndiaTaxReq = createAuthedRequest('POST', 'http://localhost/api/settings', {
      section: 'tax',
      data: {
        countryCode: 'IN',
        taxRegime: 'GST',
        taxRegistrationNumber: '29AABCU9603R1ZM',
        defaultTaxRate: 18,
      },
    }, stepUp4);
    const validIndiaTaxRes = await postSettings(validIndiaTaxReq);
    const validIndiaTaxData = await validIndiaTaxRes.json();

    assert('Valid Indian GSTIN save returns HTTP 200', validIndiaTaxRes.status === 200);
    assert('GST state Karnataka auto-derived from state code 29', validIndiaTaxData.systemSettings.gstState === 'Karnataka');
    assert('GST state code 29 auto-derived', validIndiaTaxData.systemSettings.gstStateCode === '29');

  } finally {
    // Cleanup test user & sessions & step-up grants
    await (prisma as any).stepUpGrant.deleteMany({ where: { userId: adminUser.id } });
    await (prisma as any).userSession.deleteMany({ where: { userId: adminUser.id } });
    await (prisma as any).userAccount.delete({ where: { id: adminUser.id } });
  }

  console.log('\n========================================================================================');
  console.log(`📊 SETTINGS JURISDICTION TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================================');

  if (failed > 0) {
    await prisma.$disconnect();
    process.exit(1);
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runSettingsJurisdictionTests().catch(async (err) => {
  console.error('Fatal error running settings tests:', err);
  await prisma.$disconnect();
  process.exit(1);
});
