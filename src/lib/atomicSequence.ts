import { prisma } from '@/lib/db';
import crypto from 'crypto';

/**
 * Generates atomic, collision-proof sequence numbers for sales orders and business documents.
 * Employs MySQL InnoDB exclusive row-locking (`SELECT ... FOR UPDATE` & sequential `UPDATE`)
 * within an atomic transaction. This guarantees zero duplicate sequence numbers under peak
 * concurrency (e.g., 50+ POS checkouts executing in the exact same millisecond).
 *
 * @param prefix - Sequence prefix (e.g. 'CS', 'CS26001', 'PO', 'EXP')
 * @param padLength - Minimum digits to pad sequence number (default: 6 for sales)
 * @param client - Optional Prisma transaction client (tx)
 * @returns Next sequence number (e.g. 'CS260001', 'CS260002')
 */
export async function getNextSequenceNumber(
  prefix: string = 'CS',
  padLength: number = 6,
  client?: any
): Promise<string> {
  const db = client || prisma;

  const executeAtomicIncrement = async (tx: any): Promise<string> => {
    // 1. Lock the specific prefix row exclusively in InnoDB
    const rows: any[] = await tx.$queryRaw`
      SELECT current_value 
      FROM sequence_counters 
      WHERE prefix = ${prefix} 
      FOR UPDATE
    `;

    let nextValue: bigint;

    if (!rows || rows.length === 0) {
      // Counter row does not exist yet for this prefix.
      // Compute safe starting value by checking existing max records in target table if applicable.
      let startVal = BigInt(1);

      if (prefix === 'CS') {
        startVal = BigInt(260001);
      } else if (prefix.startsWith('CS26')) {
        // Store-specific invoice prefix e.g. CS26001 -> find current max in sales
        const latestSale = await tx.salesOrder.findFirst({
          where: { orderNo: { startsWith: prefix } },
          select: { orderNo: true },
          orderBy: { orderNo: 'desc' },
        });
        if (latestSale?.orderNo) {
          const numPart = latestSale.orderNo.replace(prefix, '');
          const parsed = parseInt(numPart, 10);
          if (!isNaN(parsed) && parsed > 0) {
            startVal = BigInt(parsed) + BigInt(1);
          }
        }
      }

      await tx.$executeRaw`
        INSERT INTO sequence_counters (prefix, current_value, updated_at) 
        VALUES (${prefix}, ${startVal}, NOW())
        ON DUPLICATE KEY UPDATE current_value = current_value + 1, updated_at = NOW()
      `;

      // Read back the committed counter value with lock
      const refetched: any[] = await tx.$queryRaw`
        SELECT current_value 
        FROM sequence_counters 
        WHERE prefix = ${prefix} 
        FOR UPDATE
      `;
      nextValue =
        refetched?.[0]?.current_value !== undefined
          ? BigInt(refetched[0].current_value)
          : startVal;
    } else {
      const current = BigInt(rows[0].current_value ?? 0);
      nextValue = current + BigInt(1);

      await tx.$executeRaw`
        UPDATE sequence_counters 
        SET current_value = ${nextValue}, updated_at = NOW() 
        WHERE prefix = ${prefix}
      `;
    }

    const numStr = nextValue.toString();
    const padded = numStr.length >= padLength ? numStr : numStr.padStart(padLength, '0');
    return `${prefix}${padded}`;
  };

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (client) {
        // Caller already provided an active interactive transaction
        return await executeAtomicIncrement(client);
      } else {
        // Self-contained transaction
        return await prisma.$transaction(
          async (tx) => {
            return await executeAtomicIncrement(tx);
          },
          {
            maxWait: 15000,
            timeout: 45000,
            isolationLevel: 'ReadCommitted',
          }
        );
      }
    } catch (error: any) {
      lastError = error;
      if (client) {
        // Don't retry inside caller-managed transaction
        break;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
  }

  console.error(`[SEQUENCE] Failed to atomically generate "${prefix}" sequence:`, lastError);
  // Cryptographically secure fallback to prevent catastrophic checkout failure
  const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${prefix}-${uuid}`;
}

/**
 * Initialize sequence counters with production starting values.
 * Safe to run repeatedly (idempotent).
 */
export async function initializeSequenceCounters(): Promise<void> {
  const prefixes = [
    { prefix: 'CS', startValue: BigInt(260000) }, // Sales
    { prefix: 'CS26001', startValue: BigInt(10) }, // BLR store sales
    { prefix: 'CS26002', startValue: BigInt(10) }, // HYD store sales
    { prefix: 'CS26003', startValue: BigInt(10) }, // DEL store sales
    { prefix: 'CS26004', startValue: BigInt(10) }, // MUM store sales
    { prefix: 'PO', startValue: BigInt(10000) }, // Purchase orders
    { prefix: 'PO-2026-', startValue: BigInt(100) }, // Date-prefixed POs
    { prefix: 'EXP', startValue: BigInt(5000) }, // Expenses
    { prefix: 'EXP-2026-', startValue: BigInt(100) }, // Date-prefixed expenses
    { prefix: 'TRF-2026-', startValue: BigInt(10) }, // Stock transfers
  ];

  for (const { prefix, startValue } of prefixes) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO sequence_counters (prefix, current_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value))`,
        prefix,
        startValue
      );
    } catch (err: any) {
      console.warn(`[SEQUENCE] Warning initializing prefix ${prefix}:`, err.message);
    }
  }

  console.log('[SEQUENCE] Counters initialized successfully.');
}
