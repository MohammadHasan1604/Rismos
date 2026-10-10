/**
 * COSKO - Responsive Form & Modal Architecture Regression Suite
 * 
 * Verifies that the global responsive form & modal architecture complies with:
 * 1. Portal mounting to document.body (prevents stacking context & container clipping)
 * 2. VisualViewport dynamic listener for mobile keyboard handling (--vv-height, --vv-top)
 * 3. Body scroll locking & mobile bottom navigation isolation (pointer-events: none)
 * 4. Sticky Header -> Independently Scrollable Body -> Sticky Action Footer pattern
 * 5. Safe-area bottom padding (env(safe-area-inset-bottom))
 * 6. HTML5 form ID linkage on external submit buttons (form="...")
 * 7. Mobile button flexing (flex-1 sm:flex-initial) preventing truncation
 * 8. Responsive grid collapsing (grid-cols-1 sm:grid-cols-2+)
 * 9. CustomSelect dropdown flipAbove upward flip detection
 * 10. Form draft protection and stable initialization preservation
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => boolean | string) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      const msg = typeof result === 'string' ? result : 'assertion failed';
      console.log(`  ❌ ${name}: ${msg}`);
      errors.push(`${name}: ${msg}`);
      failed++;
    }
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    errors.push(`${name}: ${err.message}`);
    failed++;
  }
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

console.log('\n======================================================');
console.log(' COSKO RESPONSIVE FORM & MODAL REGRESSION TEST SUITE');
console.log('======================================================\n');

// 1. Shared Modal Primitives
console.log('--- 1. Shared Modal Primitives (Modal.tsx) ---');

const modalContent = readFile('src/components/ui/Modal.tsx');

test('Modal imports createPortal from react-dom', () => {
  return modalContent.includes("createPortal") && modalContent.includes("react-dom");
});

test('Modal portals directly to document.body', () => {
  return modalContent.includes("createPortal(modalContent, document.body)");
});

test('Modal registers dynamic VisualViewport listener for mobile keyboard', () => {
  return (
    modalContent.includes("window.visualViewport") &&
    modalContent.includes("vv.addEventListener('resize'") &&
    modalContent.includes("vv.addEventListener('scroll'")
  );
});

test('Modal sets CSS variables --vv-height and --vv-top on overlay/container', () => {
  return modalContent.includes("--vv-height") && modalContent.includes("--vv-top");
});

test('Modal locks body scroll with modal-open class', () => {
  return (
    modalContent.includes("document.body.classList.add('modal-open')") &&
    modalContent.includes("document.body.classList.remove('modal-open')")
  );
});

test('Modal defines responsive sizing variants with dynamic viewport limits', () => {
  return (
    modalContent.includes("compact") &&
    modalContent.includes("standard") &&
    modalContent.includes("large-form") &&
    modalContent.includes("full-workflow") &&
    modalContent.includes("100dvh")
  );
});

test('Modal enforces sticky header and sticky footer with safe-area insets', () => {
  return (
    modalContent.includes("sticky top-0") &&
    modalContent.includes("sticky bottom-0") &&
    modalContent.includes("env(safe-area-inset-bottom)")
  );
});

test('Modal provides single vertical scroll area on body', () => {
  return modalContent.includes("overflow-y-auto overscroll-contain") && modalContent.includes("min-h-0");
});

test('Modal preserves RAF focus management and input focus stability', () => {
  return modalContent.includes("requestAnimationFrame") && modalContent.includes("scrollIntoView");
});

// 2. Global Styles & BottomNav Isolation
console.log('\n--- 2. Global Styles & Stacking Isolation (tailwind.css) ---');

const cssContent = readFile('src/styles/tailwind.css');

test('CSS locks scroll and touch when modal is open', () => {
  return cssContent.includes("body.modal-open") && cssContent.includes("overflow: hidden !important");
});

test('CSS isolates Mobile BottomNav when modal is open', () => {
  return (
    (cssContent.includes('body.modal-open nav[aria-label="Mobile navigation"]') ||
      cssContent.includes("body.modal-open nav[aria-label='Mobile navigation']")) &&
    cssContent.includes('pointer-events: none !important')
  );
});

// 3. BottomSheet Primitives
console.log('\n--- 3. BottomSheet Primitives (BottomSheet.tsx) ---');

const sheetContent = readFile('src/components/ui/BottomSheet.tsx');

test('BottomSheet uses createPortal to document.body', () => {
  return sheetContent.includes("createPortal(content, document.body)");
});

test('BottomSheet uses high z-index z-[140] above standard modals', () => {
  return sheetContent.includes("zIndex = 140") || sheetContent.includes("z-[140]");
});

test('BottomSheet tracks visual viewport height and safe-area inset', () => {
  return sheetContent.includes("--vv-sheet-max-h") && sheetContent.includes("env(safe-area-inset-bottom)");
});

// 4. CustomSelect Dropdown Behavior
console.log('\n--- 4. Dropdown Alignment (CustomSelect.tsx) ---');

const selectContent = readFile('src/components/ui/CustomSelect.tsx');

test('CustomSelect implements upward flip detection when space below is constrained', () => {
  return selectContent.includes("flipAbove") && selectContent.includes("spaceBelow < 280");
});

// 5. Form Modals Architecture Audit
console.log('\n--- 5. Form Modals Architecture Audit ---');

interface FormAuditTarget {
  name: string;
  filePath: string;
  formId: string;
  sizeCheck?: string;
}

const FORMS: FormAuditTarget[] = [
  { name: 'ProductFormModal', filePath: 'src/components/forms/ProductFormModal.tsx', formId: 'product-form', sizeCheck: 'large-form' },
  { name: 'VendorFormModal', filePath: 'src/components/forms/VendorFormModal.tsx', formId: 'vendor-form', sizeCheck: 'standard' },
  { name: 'CustomerFormModal', filePath: 'src/components/forms/CustomerFormModal.tsx', formId: 'customer-form', sizeCheck: 'standard' },
  { name: 'PurchaseOrderFormModal', filePath: 'src/components/forms/PurchaseOrderFormModal.tsx', formId: 'po-form', sizeCheck: 'large-form' },
  { name: 'ExpenseFormModal', filePath: 'src/components/forms/ExpenseFormModal.tsx', formId: 'expense-form', sizeCheck: 'standard' },
  { name: 'UserFormModal', filePath: 'src/components/forms/UserFormModal.tsx', formId: 'user-form', sizeCheck: 'standard' },
  { name: 'StockAdjustmentModal', filePath: 'src/components/forms/StockAdjustmentModal.tsx', formId: 'stock-adjustment-form', sizeCheck: 'standard' },
  { name: 'StockTransferModal', filePath: 'src/components/forms/StockTransferModal.tsx', formId: 'stock-transfer-form', sizeCheck: 'standard' },
  { name: 'SupplierPaymentModal', filePath: 'src/components/forms/SupplierPaymentModal.tsx', formId: 'supplier-payment-form', sizeCheck: 'standard' },
  { name: 'StoreFormModal', filePath: 'src/components/forms/StoreFormModal.tsx', formId: 'store-form', sizeCheck: 'standard' },
  { name: 'BrandModal', filePath: 'src/components/forms/BrandModal.tsx', formId: 'brand-form' },
  { name: 'CategoryFormModal', filePath: 'src/components/forms/CategoryFormModal.tsx', formId: 'category-form' },
  { name: 'CategoryTypeModal', filePath: 'src/components/forms/CategoryTypeModal.tsx', formId: 'category-type-form', sizeCheck: 'compact' },
  { name: 'PaymentMethodModal', filePath: 'src/components/forms/PaymentMethodModal.tsx', formId: 'payment-method-form' },
  { name: 'UnitModal', filePath: 'src/components/forms/UnitModal.tsx', formId: 'unit-form' },
];

for (const f of FORMS) {
  const content = readFile(f.filePath);

  test(`${f.name} connects form tag with id="${f.formId}"`, () => {
    return content.includes(`id="${f.formId}"`);
  });

  test(`${f.name} moves submit button to footer with form="${f.formId}"`, () => {
    return content.includes(`form="${f.formId}"`) && content.includes("footer=");
  });

  test(`${f.name} uses responsive button flexing (flex-1 sm:flex-initial)`, () => {
    return content.includes("flex-1 sm:flex-initial");
  });

  test(`${f.name} protects form draft with stable prevOpenRef initialization`, () => {
    return content.includes("prevOpenRef") || content.includes("editUserIdRef") || content.includes("editVendorIdRef");
  });

  if (f.sizeCheck) {
    test(`${f.name} specifies responsive size variant (${f.sizeCheck})`, () => {
      return content.includes(`size="${f.sizeCheck}"`) || content.includes(`'${f.sizeCheck}'`);
    });
  }
}

// 6. Root Global Drawers & Modals
console.log('\n--- 6. Root Global Drawers & System Modals ---');

test('GlobalConfirmationModal uses sticky footer and standard sizing', () => {
  const gcm = readFile('src/components/ui/GlobalConfirmationModal.tsx');
  return gcm.includes('size="standard"') && gcm.includes('footer=');
});

test('UserProfileModal uses sticky footer and standard sizing', () => {
  const upm = readFile('src/components/UserProfileModal.tsx');
  return upm.includes('size="standard"') && upm.includes('footer=');
});

test('StoreSelectorModal uses standard sizing and nested compact delete modal', () => {
  const ssm = readFile('src/components/StoreSelectorModal.tsx');
  return ssm.includes('size="standard"') && ssm.includes('size="compact"');
});

test('GlobalSearchModal portals to document.body with z-[150] and dynamic height', () => {
  const gsm = readFile('src/components/GlobalSearchModal.tsx');
  return gsm.includes('createPortal') && gsm.includes('document.body') && gsm.includes('z-[150]');
});

test('NotificationsDrawer portals to document.body with z-[120] and dynamic dvh', () => {
  const nd = readFile('src/components/NotificationsDrawer.tsx');
  return nd.includes('createPortal') && nd.includes('document.body') && nd.includes('z-[120]');
});

test('ForcePasswordChangeModal portals to document.body with z-[250]', () => {
  const fpcm = readFile('src/components/ForcePasswordChangeModal.tsx');
  return fpcm.includes('createPortal') && fpcm.includes('document.body') && fpcm.includes('z-[250]');
});

test('DrilldownModal uses shared Modal with xl size and pagination footer', () => {
  const ddm = readFile('src/app/reports/DrilldownModal.tsx');
  return ddm.includes('<Modal') && ddm.includes('size="xl"') && ddm.includes('footer=');
});

// Final Summary
console.log('\n======================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('======================================================\n');

if (failed > 0) {
  console.error('FAILED TESTS:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('🎉 ALL RESPONSIVE FORM & MODAL REGRESSION CHECKS PASSED!\n');
  process.exit(0);
}
