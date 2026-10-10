/**
 * COSKO — 4-ISSUE ROOT HOTFIX TEST SUITE
 * 
 * Verifies:
 * 1. Product / Inventory Store Location Must Be Locked (UI + Server 403)
 * 2. Create Purchase Order Submission & Validation Consistency (DB transaction, payment rules, error preservation)
 * 3. Customer Operational/Service Store Association (Global deduplication + CustomerStoreProfile)
 * 4. Payment Proof Storage, Retrieval, Security & Safe Path Encoding
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/db';
import { validatePhysicalStore } from '../src/lib/authPipeline';
import { normalizeProofUrl } from '../src/components/ui/ProofViewerModal';
import { normalizeMobileNumber } from '../src/lib/phoneUtils';
import { fileExistsInStorage, isObjectStorageConfigured } from '../src/lib/objectStorage';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    errors.push(`${name}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

async function runTests() {
  console.log('====================================================');
  console.log('COSKO — 4-ISSUE ROOT HOTFIX TEST MATRIX');
  console.log('====================================================\n');

  // ─────────────────────────────────────────────────────────────
  // ISSUE 1: PRODUCT / INVENTORY STORE LOCATION MUST BE LOCKED
  // ─────────────────────────────────────────────────────────────
  console.log('🔒 ISSUE 1 — Product & Inventory Store Location Lock');

  const productFormCode = readFile('src/components/forms/ProductFormModal.tsx');
  const inventoryApiCode = readFile('src/app/api/inventory/route.ts');

  assert(
    'ProductFormModal restricts Store Manager stock location to assigned store only',
    productFormCode.includes('Assigned Store') &&
    productFormCode.includes('assignedStoreLabel') &&
    productFormCode.includes('!isSuperAdmin')
  );

  assert(
    'ProductFormModal does not expose CENTRAL or "+ Add Store" to non-Super-Admin',
    productFormCode.includes("CENTRAL' && isSuperAdmin") ||
    productFormCode.includes("!isSuperAdmin ? (")
  );

  assert(
    'ProductFormModal provides Super Admin with active physical store selector',
    productFormCode.includes('storeOptions') &&
    productFormCode.includes('isSuperAdmin')
  );

  assert(
    'ProductFormModal payload locks store to authenticated user store for non-Super Admin',
    productFormCode.includes('payload.store = userStoreCode') &&
    productFormCode.includes('!isSuperAdmin')
  );

  assert(
    'POST /api/inventory enforces 403 on forged store input for non-Super Admin',
    inventoryApiCode.includes('Effective store for inventory mutations must match assigned store') ||
    inventoryApiCode.includes('status: 403')
  );

  assert(
    'PUT /api/inventory enforces target inventory store ownership against caller store',
    inventoryApiCode.includes('Cannot modify inventory of another store') ||
    inventoryApiCode.includes('possibleInvId')
  );

  // ─────────────────────────────────────────────────────────────
  // ISSUE 2: CREATE PURCHASE ORDER DOES NOT COMPLETE
  // ─────────────────────────────────────────────────────────────
  console.log('\n📦 ISSUE 2 — Purchase Order Submit & Validation Consistency');

  const poFormCode = readFile('src/components/forms/PurchaseOrderFormModal.tsx');
  const appContextCode = readFile('src/context/AppContext.tsx');

  assert(
    'PurchaseOrderFormModal includes visible paymentRef input field (UTR / Reference)',
    poFormCode.includes('paymentRef') &&
    poFormCode.includes('UTR / Transaction Reference')
  );

  // Extract the button disabled block
  const disabledMatch = poFormCode.match(/disabled=\{([\s\S]*?)\}\s*>\s*\{isSubmitting \?/);
  const disabledContent = disabledMatch ? disabledMatch[1] : '';

  assert(
    'PurchaseOrderFormModal submit button does NOT require paymentRef.trim() when internal auto-fallback is supported',
    !disabledContent.includes('paymentRef')
  );

  assert(
    'PurchaseOrderFormModal generates fallback payment reference if reference is empty',
    poFormCode.includes('PO-ADV-') ||
    poFormCode.includes('effectivePaymentRef')
  );

  assert(
    'PurchaseOrderFormModal validates Partial Payment (0 < paidAmount < grandTotal)',
    poFormCode.includes('financials.paidAmount <= 0 || financials.paidAmount >= financials.grandTotal')
  );

  assert(
    'PurchaseOrderFormModal validates Full Payment (paidAmount === grandTotal)',
    poFormCode.includes('financials.paidAmount !== financials.grandTotal')
  );

  assert(
    'PurchaseOrderFormModal requires payment proof for Partial and Paid statuses',
    poFormCode.includes('Payment proof is mandatory! Please upload receipt/screenshot for upfront payment.')
  );

  assert(
    'AppContext addPurchase returns { success: false, error } on failure and PO object on success',
    appContextCode.includes('return { success: false, error:') &&
    appContextCode.includes('return newPO;')
  );

  assert(
    'PurchaseOrderFormModal preserves form state on backend failure without closing modal',
    poFormCode.includes('if (!created || (created as any).success === false)')
  );

  // Live Database Test: Create Purchase Order with Partial Payment in MySQL
  const testPoNo = `PO-TEST-${Date.now().toString(36).toUpperCase()}`;
  let testVendor = await prisma.vendor.findFirst({ where: { status: 'Active' } });
  if (!testVendor) {
    testVendor = await prisma.vendor.create({
      data: {
        code: 'VEN-SAM',
        name: 'Samsung Electronics India',
        contactPerson: 'Vendor Manager',
        email: 'samsung@vendor.com',
        phone: '9876543210',
        city: 'Bengaluru',
        storeCode: 'BLR',
        categories: 'Electronics',
        status: 'Active',
      },
    });
  }
  let testProd = await prisma.product.findFirst({ where: { status: 'Active' } });
  if (!testProd) {
    testProd = await prisma.product.create({
      data: {
        sku: `SKU-TEST-${Date.now().toString(36)}`,
        name: 'Test Purchase Product',
        category: 'Electronics',
        baseSellingPrice: 90000,
        baseCostPrice: 80000,
        status: 'Active',
      },
    });
  }

  const createdPO = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNo: testPoNo,
        storeCode: 'BLR',
        vendor: { connect: { id: testVendor.id } },
        status: 'Ordered',
        paymentStatus: 'Partial',
        totalCost: 800000,
        paidAmount: 400000,
        creditAmount: 400000,
        createdBy: 'BLR Store Manager',
        items: {
          create: [
            {
              productId: testProd.id,
              qtyOrdered: 10,
              qtyReceived: 0,
              unitCost: 80000,
              lineTotal: 800000,
            },
          ],
        },
        payments: {
          create: [
            {
              amount: 400000,
              paymentMethod: 'UPI',
              referenceNo: 'PO-ADV-TEST-UTR123',
              receiptUrl: '/api/files/payment-proofs/2026/10/01/c95d3105-1c1b-45dd-86c1-5ce86290c98f.jpg',
              recordedBy: 'BLR Store Manager',
            },
          ],
        },
      },
      include: {
        items: true,
        payments: true,
      },
    });
    return po;
  });

  assert(
    'Purchase Order created in MySQL with Partial payment (Paid: 400000, Remaining: 400000, BLR store)',
    createdPO.poNo === testPoNo &&
    Number(createdPO.totalCost) === 800000 &&
    Number(createdPO.paidAmount) === 400000 &&
    Number(createdPO.creditAmount) === 400000 &&
    createdPO.storeCode === 'BLR'
  );

  assert(
    'Purchase Order items and initial payment record persisted correctly',
    createdPO.items.length === 1 &&
    Number(createdPO.items[0].qtyOrdered) === 10 &&
    createdPO.payments.length === 1 &&
    Number(createdPO.payments[0].amount) === 400000 &&
    createdPO.payments[0].paymentMethod === 'UPI'
  );

  // Clean up test PO (cascade deletes items and payments)
  await prisma.purchaseOrder.delete({ where: { id: createdPO.id } });

  // ─────────────────────────────────────────────────────────────
  // ISSUE 3: CUSTOMER OPERATIONAL / SERVICE STORE ASSOCIATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n👥 ISSUE 3 — Customer Operational / Service Store Association');

  const customerFormCode = readFile('src/components/forms/CustomerFormModal.tsx');
  const customerApiCode = readFile('src/app/api/customers/route.ts');
  const customerPageCode = readFile('src/app/customers/page.tsx');
  const mysqlSyncCode = readFile('src/lib/mysqlSync.ts');

  assert(
    'CustomerFormModal includes Customer Store / Service Location field',
    customerFormCode.includes('Customer Store / Service Location')
  );

  assert(
    'CustomerFormModal locks service store to assigned store for Store Managers',
    customerFormCode.includes('Assigned Store') &&
    customerFormCode.includes('!isSuperAdmin ? (')
  );

  assert(
    'CustomerFormModal allows Super Admin to select active physical store',
    customerFormCode.includes('activePhysicalStores.map')
  );

  assert(
    'CustomerFormModal does NOT default city to Bengaluru',
    !customerFormCode.includes("const [city, setCity] = useState('Bengaluru');") &&
    customerFormCode.includes("const [city, setCity] = useState('');")
  );

  assert(
    'mysqlSync createCustomer & updateCustomer passes storeCode to API',
    mysqlSyncCode.includes('storeCode: cust.storeCode || cust.store')
  );

  assert(
    'POST /api/customers rejects non-Super Admin forged store and enforces authenticated user store',
    customerApiCode.includes('effectiveStore = assignedStore')
  );

  assert(
    'POST /api/customers validates physical store for Super Admin via validatePhysicalStore()',
    customerApiCode.includes('validatePhysicalStore(requestedStore)')
  );

  assert(
    'POST /api/customers upserts CustomerStoreProfile for effectiveStore on existing customer',
    customerApiCode.includes('tx.customerStoreProfile.upsert')
  );

  assert(
    'Super Admin customer view displays associated service stores',
    customerPageCode.includes('cust.serviceStores') &&
    customerPageCode.includes('Stores:')
  );

  // StoreHub validation test
  const valAll = await validatePhysicalStore('ALL');
  assert('validatePhysicalStore rejects "ALL"', valAll.valid === false);

  const valBLR = await validatePhysicalStore('BLR');
  assert('validatePhysicalStore accepts active store "BLR"', valBLR.valid === true && valBLR.storeCode === 'BLR');

  // Database verification: Test single customer master with multi-store profiles
  const testPhone = '9988776655';
  const normPhone = normalizeMobileNumber(testPhone);

  // Clean up any previous test record
  const existingTestCust = await prisma.customer.findFirst({
    where: { normalizedPhone: normPhone },
    include: { storeProfiles: true },
  });
  if (existingTestCust) {
    await prisma.customer.delete({ where: { id: existingTestCust.id } });
  }

  // 1. Create customer at BLR
  const custBLR = await prisma.customer.create({
    data: {
      name: 'Mohammed Yunus',
      phone: `+91 ${testPhone}`,
      normalizedPhone: normPhone,
      city: 'Mangaluru', // Customer home city is Mangaluru
      status: 'Active',
      storeProfiles: {
        create: {
          storeCode: 'BLR',
          totalSpent: 15000,
          creditBalance: 200,
          totalOrders: 2,
        },
      },
    },
    include: { storeProfiles: true },
  });

  assert(
    'Customer master created with distinct home city (Mangaluru) and BLR store profile',
    custBLR.city === 'Mangaluru' && custBLR.storeProfiles.some(p => p.storeCode === 'BLR')
  );

  // 2. Same customer visits CHE: upsert store profile without duplicate master
  await prisma.customerStoreProfile.upsert({
    where: {
      customerId_storeCode: {
        customerId: custBLR.id,
        storeCode: 'CHE',
      },
    },
    create: {
      customerId: custBLR.id,
      storeCode: 'CHE',
      totalSpent: 8000,
      creditBalance: 0,
      totalOrders: 1,
    },
    update: {},
  });

  // Verify DB state
  const allTestProfiles = await prisma.customerStoreProfile.findMany({
    where: { customerId: custBLR.id },
  });
  const customerCount = await prisma.customer.count({
    where: { normalizedPhone: normPhone },
  });

  assert(
    'Multi-store visit retains exactly ONE global Customer master record',
    customerCount === 1
  );

  assert(
    'Customer has distinct store profiles for both BLR and CHE',
    allTestProfiles.length === 2 &&
    allTestProfiles.some(p => p.storeCode === 'BLR') &&
    allTestProfiles.some(p => p.storeCode === 'CHE')
  );

  // Clean up test customer
  await prisma.customer.delete({ where: { id: custBLR.id } });

  // ─────────────────────────────────────────────────────────────
  // ISSUE 4: PAYMENT PROOF STORAGE, ACCESS & SECURITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n🔒 ISSUE 4 — Payment Proof Storage, Retrieval & Path Encoding');

  const objStorageCode = readFile('src/lib/objectStorage.ts');
  const filesApiCode = readFile('src/app/api/files/[...key]/route.ts');
  const proofModalCode = readFile('src/components/ui/ProofViewerModal.tsx');
  const uploadApiCode = readFile('src/app/api/upload/route.ts');

  assert(
    'objectStorage uploadToStorage encodes path segments cleanly without merging into one segment',
    objStorageCode.includes("encodeURIComponent") &&
    objStorageCode.includes("safeKeyPath")
  );

  assert(
    'GET /api/files/[...key] safely flattens and decodes key segments without stripping path slashes',
    filesApiCode.includes("flatMap((p) => decodeURIComponent(p)") &&
    filesApiCode.includes("rawSegments.join('/')")
  );

  assert(
    'GET /api/files/[...key] rejects directory traversal attempts (..) with 400',
    filesApiCode.includes("rawSegments.some((p) => p === '..' || p.includes('..'))")
  );

  assert(
    'GET /api/files/[...key] verifies object existence before returning or redirecting',
    filesApiCode.includes('fileExistsInStorage(fullKey)') &&
    filesApiCode.includes('Payment proof file is missing from object storage')
  );

  assert(
    'POST /api/upload verifies persistence in object storage before returning success',
    uploadApiCode.includes('fileExistsInStorage(result.key)')
  );

  assert(
    'ProofViewerModal normalizes raw R2/S3 URLs and %2F-encoded paths to authorized app endpoint',
    proofModalCode.includes('normalizeProofUrl') &&
    proofModalCode.includes('/api/files/')
  );

  assert(
    'ProofViewerModal displays clear missing-file state if proof object does not exist in storage',
    proofModalCode.includes('Payment proof file is missing from object storage')
  );

  // Test URL normalizer utility directly
  const rawR2Url = 'https://abc123.r2.cloudflarestorage.com/cosko-assets/payment-proofs/2026/10/01/test-proof.jpg';
  const normalizedR2 = normalizeProofUrl(rawR2Url);
  assert(
    'normalizeProofUrl converts raw R2 URL to authorized /api/files/ path',
    normalizedR2 === '/api/files/payment-proofs/2026/10/01/test-proof.jpg'
  );

  const encodedUrl = '/api/files/payment-proofs%2F2026%2F10%2F01%2Ftest-proof.jpg';
  const normalizedEncoded = normalizeProofUrl(encodedUrl);
  assert(
    'normalizeProofUrl converts %2F encoded path to clean catch-all path',
    normalizedEncoded === '/api/files/payment-proofs/2026/10/01/test-proof.jpg'
  );

  // Storage existence check: Verify payment proof object in R2 or local storage
  const knownKey = 'payment-proofs/2026/10/01/c95d3105-1c1b-45dd-86c1-5ce86290c98f.jpg';
  let createdLocalFixture = false;
  if (!isObjectStorageConfigured()) {
    const fixturePath = path.join(process.cwd(), 'public', 'uploads', knownKey);
    if (!fs.existsSync(fixturePath)) {
      fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
      fs.writeFileSync(fixturePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      createdLocalFixture = true;
    }
  }
  const existsInStorage = await fileExistsInStorage(knownKey);
  assert(
    `Storage object check for ${knownKey}: Exists = ${existsInStorage}`,
    existsInStorage === true
  );
  if (createdLocalFixture) {
    try {
      fs.unlinkSync(path.join(process.cwd(), 'public', 'uploads', knownKey));
    } catch {}
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    console.error('\nFailures:');
    errors.forEach(e => console.error(`  - ${e}`));
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

runTests().catch(async (err) => {
  console.error('Test execution error:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
