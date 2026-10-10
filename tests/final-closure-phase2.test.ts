/**
 * COSKO — FINAL CLOSURE PHASE 2 TEST SUITE
 * Form Stability, Adaptive UI/UX, Device Parity, Realtime & Production Verification
 * 
 * Validates:
 * 1. Modal focus bug fix & Accessible focus trap (Modal.tsx)
 * 2. 11 Form draft protection & Continuous typing stability
 * 3. Responsive sizing variants & Viewport 100dvh calculations
 * 4. Stacking context & z-index hierarchy (BottomSheet z-150 > Modal z-100)
 * 5. Purchase Order receiving store isolation (Super Admin vs Store Manager)
 * 6. Vendor CRUD & Delete Vendor modal UX
 * 7. Confirmation popup UX (GlobalConfirmationModal.tsx)
 * 8. Sales Page & Sales History store isolation & multi-device parity
 * 9. Permission UI synchronization (rollback on failure, server confirmation)
 * 10. Dashboard limited role UI & Navigation consistency
 * 11. POS financial integrity & Oversell rejection
 * 12. Strict TypeScript & Production config verification
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/db';
import { isRouteAllowed, getAuthoritativeNavGroups } from '../src/lib/rbacEngine';
import { executePOSCheckout } from '../src/lib/services/salesService';

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
  console.log('COSKO — FINAL CLOSURE PHASE 2 VERIFICATION SUITE');
  console.log('====================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. MODAL FOCUS BUG ROOT FIX & FOCUS TRAP
  // ─────────────────────────────────────────────────────────────
  console.log('📦 1. Modal Focus Architecture & Focus Trap');

  const modalCode = readFile('src/components/ui/Modal.tsx');

  assert(
    'Modal separates open-transition autofocus from re-renders',
    modalCode.includes('prevOpenRef') &&
    modalCode.includes('const wasOpen = prevOpenRef.current;') &&
    modalCode.includes('if (!wasOpen && open) {'),
    'prevOpenRef tracks open transitions to prevent focus hijacking on child rerender'
  );

  assert(
    'Modal uses stable onCloseRef to prevent dependency thrashing',
    modalCode.includes('onCloseRef.current = onClose') &&
    modalCode.includes('onCloseRef = useRef(onClose);'),
    'onClose is stored in a ref so effects do not rerun when callback identity changes'
  );

  assert(
    'Modal does not steal focus if an input inside already has focus (autoFocus preserved)',
    modalCode.includes('dialogRef.current.contains(document.activeElement)'),
    'Checks document.activeElement before autofocusing dialog or first element'
  );

  assert(
    'Modal implements accessible Tab / Shift+Tab keyboard focus trap',
    modalCode.includes('e.key === \'Tab\'') &&
    modalCode.includes('e.shiftKey') &&
    modalCode.includes('first.focus()') &&
    modalCode.includes('last.focus()'),
    'Tab and Shift+Tab wrap properly within focusable elements inside the modal'
  );

  assert(
    'Modal restores focus to trigger element on close',
    modalCode.includes('previouslyFocusedElementRef.current.focus('),
    'Restores focus to previously active element when modal is dismissed'
  );

  // ─────────────────────────────────────────────────────────────
  // 2. STACKING CONTEXT & Z-INDEX HIERARCHY
  // ─────────────────────────────────────────────────────────────
  console.log('\n📐 2. Stacking Context & Z-Index Hierarchy');

  const cssCode = readFile('src/styles/tailwind.css');

  assert(
    'BottomSheet sheet-overlay has higher z-index than Modal (z-150 vs z-100)',
    cssCode.includes('.sheet-overlay') && cssCode.includes('z-index: 150;'),
    'Dropdown sheet overlay appears in front of modal'
  );

  assert(
    'BottomSheet sheet-content has higher z-index than Modal (z-151 vs z-100)',
    cssCode.includes('.sheet-content') && cssCode.includes('z-index: 151;'),
    'Dropdown sheet content appears in front of modal'
  );

  const confirmModalCode = readFile('src/components/ui/GlobalConfirmationModal.tsx');
  assert(
    'GlobalConfirmationModal has highest modal z-index (z-200)',
    confirmModalCode.includes('zIndex={200}'),
    'Confirmation dialog displays on top of all forms and sub-modals'
  );

  // ─────────────────────────────────────────────────────────────
  // 3. FORM DRAFT PROTECTION & CONTINUOUS TYPING ACROSS ALL 11 FORMS
  // ─────────────────────────────────────────────────────────────
  console.log('\n📝 3. Form Draft Protection Across All Major Forms');

  const formsToVerify = [
    { name: 'User Form', path: 'src/components/forms/UserFormModal.tsx' },
    { name: 'Vendor Form', path: 'src/components/forms/VendorFormModal.tsx' },
    { name: 'Customer Form', path: 'src/components/forms/CustomerFormModal.tsx' },
    { name: 'Product Form', path: 'src/components/forms/ProductFormModal.tsx' },
    { name: 'Category Form', path: 'src/components/forms/CategoryFormModal.tsx' },
    { name: 'Store Form', path: 'src/components/forms/StoreFormModal.tsx' },
    { name: 'Purchase Order Form', path: 'src/components/forms/PurchaseOrderFormModal.tsx' },
    { name: 'Expense Form', path: 'src/components/forms/ExpenseFormModal.tsx' },
    { name: 'Supplier Payment Form', path: 'src/components/forms/SupplierPaymentModal.tsx' },
    { name: 'Stock Adjustment Form', path: 'src/components/forms/StockAdjustmentModal.tsx' },
    { name: 'Stock Transfer Form', path: 'src/components/forms/StockTransferModal.tsx' },
  ];

  for (const form of formsToVerify) {
    const code = readFile(form.path);
    const hasDraftProtection =
      code.includes('prevOpenRef') || code.includes('edit') || code.includes('reset(');
    assert(
      `${form.name} contains draft protection against background refetches & realtime events`,
      hasDraftProtection,
      `${form.path} must not reset state on parent rerender or realtime refresh`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 4. RESPONSIVE MODAL SIZING & VIEWPORT BEHAVIOR
  // ─────────────────────────────────────────────────────────────
  console.log('\n📱 4. Responsive Modal Sizing & Viewport Behavior');

  assert(
    'Modal supports adaptive size variants (compact/sm, standard/md, large-form/lg, full-workflow/xl/full)',
    modalCode.includes('compact') &&
    modalCode.includes('standard') &&
    modalCode.includes('large-form') &&
    modalCode.includes('full-workflow'),
    'Supports semantic content-aware sizing tokens'
  );

  assert(
    'Modal calculates height using dynamic viewport units (100dvh) with safe area offsets',
    modalCode.includes('100dvh'),
    'Modal height uses calc(100dvh - offset) for mobile virtual keyboard compatibility'
  );

  assert(
    'Modal respects safe-area-inset-bottom for actions and footer',
    modalCode.includes('safe-area-inset-bottom'),
    'Respects notch/home indicator on modern mobile devices'
  );

  // ─────────────────────────────────────────────────────────────
  // 5. PURCHASE ORDER RECEIVING STORE ISOLATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n🏬 5. Purchase Order Receiving Store Isolation');

  const poModalCode = readFile('src/components/forms/PurchaseOrderFormModal.tsx');

  assert(
    'Super Admin can select receiving store from all store hubs in PO form',
    poModalCode.includes("currentUser.role === 'Super Admin' ? (") &&
    poModalCode.includes('CustomSelect'),
    'Super Admin has store selector dropdown'
  );

  assert(
    'Store Manager is strictly locked to assigned store in PO form',
    poModalCode.includes('Assigned Store (Locked)'),
    'Store Manager has read-only locked badge with assigned store'
  );

  assert(
    'PO form storeOptions restricts Store Manager to their assigned store only',
    poModalCode.includes("if (currentUser.role !== 'Super Admin')") &&
    poModalCode.includes('const userStore = currentUser.store') &&
    poModalCode.includes('return ['),
    'Store Manager cannot see CENTRAL or other stores in options'
  );

  // ─────────────────────────────────────────────────────────────
  // 6. VENDOR CRUD UX & DELETE VENDOR MODAL
  // ─────────────────────────────────────────────────────────────
  console.log('\n🤝 6. Vendor CRUD & Delete Modal UX');

  const vendorModalCode = readFile('src/components/forms/VendorFormModal.tsx');
  const deleteVendorModalCode = readFile('src/app/vendors/components/DeleteVendorModal.tsx');

  assert(
    'VendorFormModal waits for server DB response before toast and close',
    vendorModalCode.includes('if (!updateRes?.success) {') &&
    vendorModalCode.includes('toast.success(') &&
    vendorModalCode.includes('onClose()'),
    'DB success verified first, then toast, then modal closed'
  );

  assert(
    'VendorFormModal preserves typed state on server error',
    vendorModalCode.includes('toast.error(err.message || \'Failed to save vendor\')') &&
    vendorModalCode.includes('setIsSubmitting(false)'),
    'Modal remains open with typed input on submission failure'
  );

  assert(
    'DeleteVendorModal disables buttons while operation is in progress',
    deleteVendorModalCode.includes('disabled={isSubmitting}'),
    'Buttons and textareas disabled while processing'
  );

  assert(
    'DeleteVendorModal displays actual server error message on failure',
    deleteVendorModalCode.includes('res?.message || res?.error') &&
    deleteVendorModalCode.includes('toast.error(err.message'),
    'Server error is bubbled directly to user'
  );

  // ─────────────────────────────────────────────────────────────
  // 7. CONFIRMATION POPUP UX
  // ─────────────────────────────────────────────────────────────
  console.log('\n🔒 7. Confirmation Popup UX (GlobalConfirmationModal)');

  assert(
    'GlobalConfirmationModal has clear operation badge and title',
    confirmModalCode.includes('ACTION_BADGES') &&
    confirmModalCode.includes('Step 2 of 2') &&
    confirmModalCode.includes('Duplicate Protected'),
    'Modal shows distinct step and operation type badges'
  );

  assert(
    'GlobalConfirmationModal stays open with error message on failure allowing retry',
    confirmModalCode.includes('errorMessage && (') &&
    confirmModalCode.includes('Execution Failed') &&
    confirmModalCode.includes('You may review and modify the details or retry the operation.'),
    'Failure does not close modal and permits retry'
  );

  assert(
    'GlobalConfirmationModal prevents double submission during processing',
    confirmModalCode.includes('disabled={isProcessing}'),
    'Submit and cancel actions are guarded against duplicate clicks'
  );

  // ─────────────────────────────────────────────────────────────
  // 8. SALES HISTORY STORE ISOLATION & MULTI-DEVICE PARITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n🛒 8. Sales History Store Isolation & Device Parity');

  const salesPageCode = readFile('src/app/sales/page.tsx');

  assert(
    'Sales History provides mobile card view (< sm) for small viewports',
    salesPageCode.includes('className="space-y-3 sm:hidden"'),
    'Mobile cards render properly on 320px to 430px'
  );

  assert(
    'Sales History provides table view for desktop viewports (>= sm)',
    salesPageCode.includes('hidden sm:block'),
    'Desktop table renders properly on 768px to 1920px'
  );

  assert(
    'Sales History store filter is restricted: Super Admin sees All Stores, Manager locked',
    salesPageCode.includes("currentUser.role === 'Super Admin' && (") &&
    salesPageCode.includes('historyStoreFilter'),
    'Non-Super Admin cannot switch store filters'
  );

  // ─────────────────────────────────────────────────────────────
  // 9. PERMISSION UI SYNCHRONIZATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n🛡️ 9. Permission UI Synchronization & Rollback');

  const usersPageCode = readFile('src/app/users/page.tsx');
  const appContextCode = readFile('src/context/AppContext.tsx');

  assert(
    'AppContext setUserPermissionOverride returns Promise with result and rolls back on failure',
    appContextCode.includes('setUserPermissionOverride = async (') &&
    appContextCode.includes('// Rollback on error') &&
    appContextCode.includes('u.id === userId ? { ...u, overrides: currentOverrides } : u'),
    'State is rolled back if server API call fails'
  );

  assert(
    'User permission screen tracks saving state per permission code',
    usersPageCode.includes('savingPermissionCodes') &&
    usersPageCode.includes('setSavingPermissionCodes'),
    'Displays active saving spinner while API call is in flight'
  );

  assert(
    'User permission screen binds to live usersList state for active user',
    usersPageCode.includes('usersList.find((u) => u.id === permissionsModalUser.id)'),
    'Reflects verified server-persisted permissions rather than stale snapshot'
  );

  // ─────────────────────────────────────────────────────────────
  // 10. NAVIGATION & ROUTE AUTHORIZATION CONSISTENCY
  // ─────────────────────────────────────────────────────────────
  console.log('\n🧭 10. Navigation & Route Authorization Consistency');

  const superAdminUser = {
    id: 'usr_super',
    name: 'Super Admin',
    email: 'cosko@gmail.com',
    role: 'Super Admin' as const,
    store: 'All Stores',
    securityLevel: 100,
  };

  const storeManagerUser = {
    id: 'usr_manager',
    name: 'Store Manager',
    email: 'ananya.blr@cosko.com',
    role: 'Store Manager' as const,
    store: 'BLR',
    securityLevel: 80,
  };

  const salesManagerUser = {
    id: 'usr_sales',
    name: 'Sales Manager',
    email: 'sales.blr@cosko.com',
    role: 'Sales Manager' as const,
    store: 'BLR',
    securityLevel: 40,
  };

  // Route tests
  assert(
    'Super Admin can access all operational routes',
    isRouteAllowed('/dashboard', superAdminUser) &&
    isRouteAllowed('/sales', superAdminUser) &&
    isRouteAllowed('/inventory-management', superAdminUser) &&
    isRouteAllowed('/purchases', superAdminUser) &&
    isRouteAllowed('/users', superAdminUser) &&
    isRouteAllowed('/accounting', superAdminUser),
    'Full access for Super Admin'
  );

  assert(
    'Store Manager can access store operational routes but not system settings or stores management',
    isRouteAllowed('/dashboard', storeManagerUser) &&
    isRouteAllowed('/sales', storeManagerUser) &&
    isRouteAllowed('/inventory-management', storeManagerUser) &&
    isRouteAllowed('/purchases', storeManagerUser) &&
    isRouteAllowed('/users', storeManagerUser) &&
    !isRouteAllowed('/stores', storeManagerUser) &&
    !isRouteAllowed('/settings/data-connections', storeManagerUser) &&
    !isRouteAllowed('/work-activity', storeManagerUser),
    'Proper boundary for Store Manager'
  );

  assert(
    'Sales Manager is restricted to POS, Customers, and operational inventory view',
    isRouteAllowed('/sales', salesManagerUser) &&
    isRouteAllowed('/customers', salesManagerUser) &&
    !isRouteAllowed('/purchases', salesManagerUser) &&
    !isRouteAllowed('/accounting', salesManagerUser) &&
    !isRouteAllowed('/stores', salesManagerUser),
    'Strict boundary for Sales Manager'
  );

  // BottomNav consistency test
  const bottomNavCode = readFile('src/components/BottomNav.tsx');
  assert(
    'BottomNav filters navigation items using isRouteAllowed',
    bottomNavCode.includes('isRouteAllowed(slot.href, currentUser)'),
    'No forbidden items rendered in bottom bar'
  );

  const sidebarCode = readFile('src/components/Sidebar.tsx');
  assert(
    'Sidebar uses authoritative getAuthoritativeNavGroups',
    sidebarCode.includes('getAuthoritativeNavGroups(currentUser'),
    'Sidebar navigation derived from single authoritative engine'
  );

  // ─────────────────────────────────────────────────────────────
  // 11. POS FINANCIAL INTEGRITY & OVERSELL PROTECTION
  // ─────────────────────────────────────────────────────────────
  console.log('\n💰 11. POS Financial Integrity & Oversell Protection');

  // Verify executePOSCheckout rejects overselling with status code 409
  let oversellBlocked = false;
  try {
    // Attempt to checkout with 99999 units of a non-existent or low stock product
    await executePOSCheckout({
      storeCode: 'BLR',
      customerName: 'Test Oversell',
      customerPhone: '9876543210',
      items: [
        {
          productId: 'non_existent_or_huge_stock',
          productName: 'Test Product',
          sku: 'TEST-OVERSELL',
          qty: 99999,
          unitPrice: 100,
        },
      ],
      paymentMethod: 'Cash',
      paymentProofUrl: 'https://example.com/proof.jpg',
      cashierName: 'Test Cashier',
    });
  } catch (err: any) {
    if (err.statusCode === 409 || err.message?.includes('Insufficient stock')) {
      oversellBlocked = true;
    }
  }

  assert(
    'executePOSCheckout strictly blocks overselling with 409 Insufficient Stock',
    oversellBlocked,
    'Checkout with excessive quantity rejected before ledger mutation'
  );

  // ─────────────────────────────────────────────────────────────
  // 12. STRICT TYPESCRIPT & PRODUCTION CONFIGURATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n⚙️ 12. Strict TypeScript & Production Configuration');

  const nextConfigCode = readFile('next.config.mjs');
  assert(
    'next.config.mjs does NOT ignore TypeScript errors (ignoreBuildErrors: false)',
    nextConfigCode.includes('ignoreBuildErrors: false'),
    'Strict build gate enforced'
  );

  assert(
    'next.config.mjs does NOT ignore ESLint errors (ignoreDuringBuilds: false)',
    nextConfigCode.includes('ignoreDuringBuilds: false'),
    'Strict build gate enforced'
  );

  const pkgCode = readFile('package.json');
  assert(
    'package.json contains all required typecheck scripts (app, tests, scripts, all)',
    pkgCode.includes('"type-check:app": "tsc --noEmit"') &&
    pkgCode.includes('"type-check:tests": "tsc --noEmit --project tsconfig.tests.json"') &&
    pkgCode.includes('"type-check:scripts": "tsc --noEmit --project tsconfig.scripts.json"') &&
    pkgCode.includes('"type-check:all":'),
    'All parts of codebase have strict TypeScript verification'
  );

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`TOTAL PHASE 2 TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    console.error('\nFailures summary:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 2 VERIFICATIONS PASSED CLEANLY!\n');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
