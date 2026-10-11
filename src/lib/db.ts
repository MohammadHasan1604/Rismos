import { PrismaClient } from '@prisma/client';

// Models in our schema that have a `createdAt` column
const MODELS_WITH_CREATED_AT = new Set([
  'product',
  'inventory',
  'inventoryLedger',
  'stockTransfer',
  'customer',
  'customerExternalLink',
  'repairEnquiry',
  'vendor',
  'purchaseOrder',
  'purchasePayment',
  'goodsReceivedNote',
  'salesOrder',
  'expense',
  'centralExpense',
  'auditLog',
  'storeHub',
  'userAccount',
  'category',
  'categoryType',
  'systemSettings',
  'brandingSetting',
  'financialLedgerEntry',
  'idempotencyRecord',
  'deleteRequest',
  'notification',
  'attendanceDay',
  'fileAsset',
  'realtimeOutbox',
  'sequenceCounter',
  'passwordReset',
]);

function createPrismaClient() {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  const extendedClient = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const lowerModel = model ? model.charAt(0).toLowerCase() + model.slice(1) : '';
          if (
            MODELS_WITH_CREATED_AT.has(lowerModel) &&
            (operation === 'findMany' || operation === 'findFirst')
          ) {
            if (args && !(args as any).orderBy) {
              (args as any).orderBy = { createdAt: 'desc' };
            }
          }
          let attempts = 0;
          while (true) {
            try {
              return await query(args);
            } catch (err: any) {
              attempts++;
              const isTransient =
                err.message?.includes('1040') ||
                err.message?.includes('Too many connections') ||
                err.message?.includes('connection_limit');
              if (isTransient && attempts <= 15) {
                await new Promise((r) => setTimeout(r, Math.min(2000, 500 * attempts)));
                continue;
              }
              throw err;
            }
          }
        },
      },
    },
  });

  // Cloud MySQL Safe Transaction Limits (15s connection wait, 45s execution limit)
  const DEFAULT_TX_OPTIONS = {
    maxWait: 15000,
    timeout: 45000,
  };

  const originalTransaction = extendedClient.$transaction.bind(extendedClient);

  // Transparently inject safe timeouts so all interactive transactions throughout the project are protected
  (extendedClient as any).$transaction = function (arg: any, options?: any) {
    if (typeof arg === 'function') {
      return originalTransaction(arg, {
        ...DEFAULT_TX_OPTIONS,
        ...options,
      });
    }
    return originalTransaction(arg, options);
  };

  return extendedClient;
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Always cache Prisma Client instance on globalThis to prevent connection leaks across serverless function warm starts
globalForPrisma.prisma = prisma;

/**
 * Execute an atomic transaction with serverless/cloud-safe connection pooling and timeouts.
 */
export async function executeTransaction<T>(
  callback: (tx: any) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: any }
): Promise<T> {
  return (prisma as any).$transaction(callback, options);
}

export default prisma;

// Cleanly close database connections when node script finishes
if (typeof process !== 'undefined' && process.on) {
  process.on('beforeExit', async () => {
    try {
      await (prisma as any).$disconnect();
    } catch {}
  });
}
