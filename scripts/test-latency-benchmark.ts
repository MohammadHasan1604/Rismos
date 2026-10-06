import { prisma } from '../src/lib/db';
import { getConnectionPoolStatus } from '../src/lib/db-pool';
import { ensureIndexes } from '../src/lib/query-optimizer';

async function runBenchmark(
  name: string,
  fn: () => Promise<any>,
  iterations: number = 20
) {
  const timings: number[] = [];

  // Warmup 2 iterations
  await fn();
  await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const avg = Math.round((timings.reduce((sum, t) => sum + t, 0) / timings.length) * 10) / 10;
  const p50 = Math.round(timings[Math.floor(timings.length * 0.5)] * 10) / 10;
  const p95 = Math.round(timings[Math.floor(timings.length * 0.95)] * 10) / 10;
  const min = Math.round(timings[0] * 10) / 10;
  const max = Math.round(timings[timings.length - 1] * 10) / 10;

  console.log(`📊 ${name.padEnd(28)} | Avg: ${avg.toFixed(1)}ms | p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | [${min}-${max}ms]`);
  return { name, avg, p50, p95, min, max };
}

async function testLatencyBenchmark() {
  console.log('========================================================================');
  console.log('⚡ DATABASE LATENCY & PERFORMANCE BENCHMARK SUITE');
  console.log('========================================================================\n');

  // Verify pool and indexes
  const pool = await getConnectionPoolStatus();
  console.log(`Connection Pool: Active=${pool.activeConnections}/${pool.maxAllowed} (${pool.poolUtilizationPct}% utilized, healthy: ${pool.healthy})`);

  await ensureIndexes();
  console.log('\nRunning latency benchmark queries...\n');

  // 1. Store Inventory Query
  await runBenchmark('Store Inventory Query', async () => {
    return prisma.inventory.findMany({
      where: { storeCode: 'BLR' },
      include: { product: { select: { name: true, sku: true, baseCostPrice: true } } },
      take: 50,
    });
  });

  // 2. Sales Trend Query
  await runBenchmark('Sales Trend Query', async () => {
    return prisma.salesOrder.findMany({
      where: { storeCode: 'BLR' },
      select: { id: true, orderNo: true, grandTotal: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  });

  // 3. Ledger Balance Query
  await runBenchmark('Ledger Balance Query', async () => {
    return prisma.financialLedgerEntry.findMany({
      where: { storeCode: 'BLR', isEliminated: false },
      select: { debit: true, credit: true, accountCategory: true },
      take: 100,
    });
  });

  // 4. Consolidated P&L Aggregation
  await runBenchmark('Consolidated P&L Query', async () => {
    return prisma.financialLedgerEntry.groupBy({
      by: ['accountCategory'],
      where: { isEliminated: false },
      _sum: { debit: true, credit: true },
    });
  });

  console.log('\n========================================================================');
  console.log('🎉 LATENCY BENCHMARK COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');
}

testLatencyBenchmark()
  .catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
