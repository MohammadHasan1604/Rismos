import { prisma } from '../../src/lib/db';
import bcrypt from 'bcryptjs';

export async function setupE2EUsers() {
  const db = prisma as any;

  // Clear rate limit records so repeated E2E runs don't encounter artificial rate-limiting
  await db.$executeRawUnsafe('DELETE FROM security_rate_limits;').catch(() => null);

  // 1. Super Admin
  const adminHash = await bcrypt.hash('SuperAdmin@2026!', 10);
  await db.userAccount.upsert({
    where: { email: 'cosko@gmail.com' },
    create: {
      name: 'Super Admin',
      email: 'cosko@gmail.com',
      passwordHash: adminHash,
      role: 'Super Admin',
      securityLevel: 100,
      storeScope: 'All Stores',
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash: adminHash,
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    },
  });

  // 2. Store Manager (BLR)
  const managerHash = await bcrypt.hash('StoreManager@2026!', 10);
  await db.userAccount.upsert({
    where: { email: 'hasan@cosko.com' },
    create: {
      name: 'Hasan Manager',
      email: 'hasan@cosko.com',
      passwordHash: managerHash,
      role: 'Store Manager',
      securityLevel: 80,
      storeScope: 'BLR',
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash: managerHash,
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    },
  });

  // 3. Sales Manager (BLR)
  const salesHash = await bcrypt.hash('SalesManager@2026!', 10);
  await db.userAccount.upsert({
    where: { email: 'wasiq@cosko.com' },
    create: {
      name: 'Wasiq Sales',
      email: 'wasiq@cosko.com',
      passwordHash: salesHash,
      role: 'Sales Manager',
      securityLevel: 40,
      storeScope: 'BLR',
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash: salesHash,
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    },
  });

  // 4. Force Password Change Test User
  const forceHash = await bcrypt.hash('TempPassword@2026!', 10);
  await db.userAccount.upsert({
    where: { email: 'forced_reset@cosko.com' },
    create: {
      name: 'Forced Reset User',
      email: 'forced_reset@cosko.com',
      passwordHash: forceHash,
      role: 'Sales Manager',
      securityLevel: 40,
      storeScope: 'BLR',
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
    },
    update: {
      passwordHash: forceHash,
      status: 'Active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
    },
  });

  // 5. Ensure at least one store product with stock exists for POS
  let prod = await db.product.findFirst({ where: { status: 'active' } });
  if (!prod) {
    prod = await db.product.create({
      data: {
        name: 'RISMOS Pro Widget',
        sku: 'RSM-WIDGET-01',
        category: 'Electronics',
        baseSellingPrice: 199,
        baseCostPrice: 120,
        gstRate: 18,
        status: 'active',
      },
    });
  }

  await db.inventory.upsert({
    where: { productId_storeCode: { productId: prod.id, storeCode: 'BLR' } },
    create: { productId: prod.id, storeCode: 'BLR', qtyOnHand: 100, reorderPt: 10 },
    update: { qtyOnHand: { increment: 50 } },
  });

  return { adminEmail: 'cosko@gmail.com', managerEmail: 'hasan@cosko.com', salesEmail: 'wasiq@cosko.com' };
}
