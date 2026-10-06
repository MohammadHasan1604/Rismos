import { prisma } from '@/lib/db';

/**
 * Apply automatic database index optimizations for high-throughput queries:
 * - Inventory multi-column lookups by storeCode and productId
 * - Sales order filtering by storeCode and createdAt DESC
 * - Financial ledger queries by storeCode and entryDate DESC
 */
export async function ensureIndexes(): Promise<void> {
  const indexSpecs = [
    {
      table: 'inventory',
      indexName: 'idx_inventory_storeCode_productId',
      sql: 'ALTER TABLE inventory ADD INDEX idx_inventory_storeCode_productId (store_code, product_id)',
    },
    {
      table: 'sales',
      indexName: 'idx_sales_storeCode_createdAt',
      sql: 'ALTER TABLE sales ADD INDEX idx_sales_storeCode_createdAt (store_code, created_at DESC)',
    },
    {
      table: 'financial_ledger',
      indexName: 'idx_ledger_storeCode_entryDate',
      sql: 'ALTER TABLE financial_ledger ADD INDEX idx_ledger_storeCode_entryDate (store_code, entry_date DESC)',
    },
  ];

  for (const spec of indexSpecs) {
    try {
      const existing: any[] = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.statistics 
        WHERE table_schema = DATABASE() 
          AND table_name = ${spec.table} 
          AND index_name = ${spec.indexName}
      `;

      if (Number(existing?.[0]?.count ?? 0) === 0) {
        await prisma.$executeRawUnsafe(spec.sql);
        console.log(`[QUERY-OPTIMIZER] Created index ${spec.indexName} on ${spec.table}`);
      }
    } catch (err: any) {
      // Non-fatal if index exists or table structure differs
      if (!err.message?.includes('Duplicate key name')) {
        console.warn(`[QUERY-OPTIMIZER] Index notice for ${spec.indexName}:`, err.message);
      }
    }
  }

  console.log('[QUERY-OPTIMIZER] Database index optimizations verified.');
}
