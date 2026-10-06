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
        async findMany({ model, args, query }) {
          const lowerModel = model ? model.charAt(0).toLowerCase() + model.slice(1) : '';
          if (MODELS_WITH_CREATED_AT.has(lowerModel)) {
            if (!args.orderBy) {
              (args as any).orderBy = { createdAt: 'desc' };
            }
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          const lowerModel = model ? model.charAt(0).toLowerCase() + model.slice(1) : '';
          if (MODELS_WITH_CREATED_AT.has(lowerModel)) {
            if (!args.orderBy) {
              (args as any).orderBy = { createdAt: 'desc' };
            }
          }
          return query(args);
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
