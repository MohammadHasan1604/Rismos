/**
 * RISMOS Database V2 — Safe Master Data Seed Script
 * 
 * Safety Rule:
 * Seeds ONLY essential infrastructure master data.
 * NEVER creates fake business transactions, sales, purchases, or customer records.
 * Can be run idempotently (uses upserts) on a clean or target database.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(16);
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export async function seedV2Safe(customPrisma?: PrismaClient) {
  const db = customPrisma || prisma;
  console.log('🌱 [V2 SAFE SEED] Initializing authoritative master data...');

  // 1. STORE HUBS
  const storesData = [
    { code: 'CENTRAL', name: 'Central Warehouse & Hub', city: 'Bengaluru', address: 'Plot 42, Electronic City Phase 1', timezone: 'Asia/Kolkata', status: 'Active' },
    { code: 'BLR', name: 'Bengaluru Flagship Store', city: 'Bengaluru', address: 'Indiranagar 100ft Road', timezone: 'Asia/Kolkata', status: 'Active' },
    { code: 'HYD', name: 'Hyderabad Tech Hub Store', city: 'Hyderabad', address: 'HITEC City Cyber Towers', timezone: 'Asia/Kolkata', status: 'Active' },
    { code: 'DEL', name: 'Delhi NCR Experience Store', city: 'Delhi', address: 'Connaught Place Block A', timezone: 'Asia/Kolkata', status: 'Active' },
    { code: 'MUM', name: 'Mumbai Retail Store', city: 'Mumbai', address: 'Linking Road, Bandra West', timezone: 'Asia/Kolkata', status: 'Active' },
    { code: 'CHE', name: 'Chennai Experience Store', city: 'Chennai', address: 'Anna Salai, T. Nagar', timezone: 'Asia/Kolkata', status: 'Active' },
  ];

  for (const s of storesData) {
    await db.storeHub.upsert({
      where: { code: s.code },
      update: { name: s.name, city: s.city, address: s.address, timezone: s.timezone, status: s.status },
      create: s,
    });
  }
  console.log(`  ✓ Seeded ${storesData.length} canonical Store Hubs`);

  // 2. SUPER ADMIN ACCOUNT
  const superAdminEmail = 'cosko@gmail.com';
  let superAdmin = await db.userAccount.findUnique({ where: { email: superAdminEmail } });
  if (!superAdmin) {
    const tempPassword = generateSecurePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    superAdmin = await db.userAccount.create({
      data: {
        email: superAdminEmail,
        passwordHash,
        name: 'Super Admin',
        role: 'Super Admin',
        securityLevel: 100,
        storeScope: 'ALL',
        status: 'Active',
        mustChangePassword: false,
      },
    });
    console.log(`  ✓ Super Admin created: ${superAdminEmail}`);
    console.log(`    Temporary credentials: ${tempPassword}`);
  } else {
    console.log(`  ✓ Super Admin exists: ${superAdminEmail}`);
  }

  // Canonical store assignment for Super Admin across all stores
  for (const s of storesData) {
    await db.userStoreAssignment.upsert({
      where: { userId_storeCode: { userId: superAdmin.id, storeCode: s.code } },
      update: {},
      create: { userId: superAdmin.id, storeCode: s.code },
    });
  }
  console.log(`  ✓ Super Admin store assignments verified`);

  // 3. CATEGORY TYPES
  const categoryTypes = [
    { code: 'PRODUCT', name: 'Product', description: 'Physical retail goods and inventory', color: 'primary', isSystem: true },
    { code: 'SERVICE', name: 'Service', description: 'Labor, installation and repair services', color: 'info', isSystem: true },
    { code: 'ACCESSORY', name: 'Accessory', description: 'Add-ons and complementary products', color: 'accent', isSystem: true },
    { code: 'SPARE_PART', name: 'Spare Part', description: 'Replacement components', color: 'warning', isSystem: true },
  ];

  for (const ct of categoryTypes) {
    await db.categoryType.upsert({
      where: { code: ct.code },
      update: { name: ct.name, description: ct.description, color: ct.color, isSystem: ct.isSystem },
      create: ct,
    });
  }
  console.log(`  ✓ Seeded ${categoryTypes.length} Category Types`);

  // 4. AUTHORITATIVE PAYMENT METHODS
  const paymentMethods = [
    { code: 'CASH', name: 'Cash', type: 'Cash', description: 'Physical currency payment', isSystem: true, sortOrder: 1, status: 'Active' },
    { code: 'CARD', name: 'Debit/Credit Card', type: 'Card', description: 'Point of sale card swipe / chip terminal', isSystem: true, sortOrder: 2, status: 'Active' },
    { code: 'UPI', name: 'UPI / QR Code', type: 'Digital', description: 'Instant unified payments interface', isSystem: true, sortOrder: 3, status: 'Active' },
    { code: 'BANK_TRANSFER', name: 'Bank Transfer (NEFT/RTGS/IMPS)', type: 'Bank', description: 'Direct bank account transfer', isSystem: true, sortOrder: 4, status: 'Active' },
    { code: 'STORE_CREDIT', name: 'Store Credit / Account', type: 'Credit', description: 'Customer credit account deduction', isSystem: true, sortOrder: 5, status: 'Active' },
    { code: 'OTHER', name: 'Other Payment Method', type: 'Other', description: 'Custom verified payment method', isSystem: true, sortOrder: 6, status: 'Active' },
  ];

  for (const pm of paymentMethods) {
    await db.paymentMethod.upsert({
      where: { code: pm.code },
      update: { name: pm.name, type: pm.type, description: pm.description, sortOrder: pm.sortOrder, status: pm.status },
      create: pm,
    });
  }
  console.log(`  ✓ Seeded ${paymentMethods.length} Authoritative Payment Methods`);

  // 5. STANDARD MEASUREMENT UNITS
  const units = [
    { code: 'PCS', name: 'Pieces', symbol: 'pcs', description: 'Individual units', status: 'Active' },
    { code: 'BOX', name: 'Box', symbol: 'box', description: 'Standard packaged box', status: 'Active' },
    { code: 'KG', name: 'Kilograms', symbol: 'kg', description: 'Weight in kilograms', status: 'Active' },
    { code: 'MTR', name: 'Meters', symbol: 'm', description: 'Length in meters', status: 'Active' },
    { code: 'SET', name: 'Set', symbol: 'set', description: 'Multi-piece bundled set', status: 'Active' },
    { code: 'PKT', name: 'Packet', symbol: 'pkt', description: 'Packaged pouch or packet', status: 'Active' },
  ];

  for (const u of units) {
    await db.unit.upsert({
      where: { code: u.code },
      update: { name: u.name, symbol: u.symbol, description: u.description, status: u.status },
      create: u,
    });
  }
  console.log(`  ✓ Seeded ${units.length} Measurement Units`);

  // 6. BRANDING & SYSTEM CONFIGURATION
  await db.brandingSetting.upsert({
    where: { id: 'cosko_branding_config' },
    update: {},
    create: {
      id: 'cosko_branding_config',
      appName: 'RISMOS',
      tagline: 'Run Retail. Smarter.',
      primaryColor: '#002E86',
      secondaryColor: '#009ADF',
      accentColor: '#2563EB',
      supportEmail: 'support@rismos.com',
      country: 'India',
      countryCode: 'IN',
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      baseCurrency: 'INR (₹)',
    },
  });

  await db.systemSettings.upsert({
    where: { id: 'cosko_system_config' },
    update: {},
    create: {
      id: 'cosko_system_config',
      countryCode: 'IN',
      currencyCode: 'INR',
      currencySymbol: '₹',
      taxRegime: 'GST',
      taxInclusivePricing: false,
      taxConfigVersion: 1,
      defaultTaxRate: 18.00,
      sessionTimeoutMins: 43200,
      maxLoginAttempts: 5,
      enforcePasswordPolicy: true,
      sensitiveActionConfirm: true,
      lowStockAlerts: true,
      lowStockThreshold: 5,
      overduePaymentAlerts: true,
      overdueThresholdDays: 30,
      dailySalesDigest: false,
      securityEventAlerts: true,
    },
  });
  console.log('  ✓ Verified Branding and System Settings baseline');
  console.log('✅ [V2 SAFE SEED] Completed successfully without creating synthetic transaction records.');
}

if (require.main === module) {
  seedV2Safe()
    .catch((err) => {
      console.error('❌ Safe seed failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
