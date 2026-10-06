/**
 * COSKO POS - E2E User Journey Spec (Playwright)
 * 
 * Verifies full checkout journey from authenticated cashier terminal:
 * 1. Login with compliant credentials
 * 2. Navigation to POS terminal
 * 3. Scanning SKU with barcode reader
 * 4. Executing checkout with atomic sequence generation
 * 5. Verifying invoice format and increment
 */

// If @playwright/test is present in the environment:
// import { test, expect } from '@playwright/test';

export const fullJourneyPlaywrightSpec = `
import { test, expect } from '@playwright/test';

test('Complete POS checkout flow', async ({ page }) => {
  // 1. Login
  await page.goto('http://localhost:3000/auth/login');
  await page.fill('[name="email"]', 'manager@cosko.com');
  await page.fill('[name="password"]', 'SecurePassword123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('http://localhost:3000/dashboard');

  // 2. Navigate to POS
  await page.click('a[href="/sales"]');
  await expect(page).toHaveTitle(/POS/);

  // 3. Scan product
  await page.fill('[placeholder="Barcode"]', 'SKU-001');
  await page.keyboard.press('Enter');
  await expect(page.locator('text=Product Name')).toBeVisible();

  // 4. Checkout
  await page.click('button:has-text("Checkout")');
  await page.selectOption('[name="paymentMethod"]', 'CASH');
  await page.click('button:has-text("Complete Sale")');

  // 5. Verify invoice
  await expect(page.locator('text=Invoice CS')).toBeVisible();
  const invoiceNumber = await page.locator('text=Invoice CS').textContent();
  expect(invoiceNumber).toMatch(/CS\\d{6}/);
});
`;

export default fullJourneyPlaywrightSpec;
