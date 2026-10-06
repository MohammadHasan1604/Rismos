import { prisma } from '../src/lib/db';
import { executePOSCheckout } from '../src/lib/services/salesService';
import { getConsolidatedPnL } from '../src/lib/services/accountingService';
import * as fs from 'fs';
import * as path from 'path';

interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

function calculatePercentiles(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / count) * 100) / 100;
  const min = sorted[0];
  const max = sorted[count - 1];
  const p50 = sorted[Math.floor(count * 0.5)];
  const p95 = sorted[Math.min(count - 1, Math.floor(count * 0.95))];
  const p99 = sorted[Math.min(count - 1, Math.floor(count * 0.99))];

  return { count, min, max, avg, p50, p95, p99 };
}

async function runBenchmarks() {
  console.log('========================================================================');
  console.log('⚡ COSKO PRODUCTION LOAD & PERFORMANCE BENCHMARK SUITE');
  console.log('========================================================================\n');

  const results: Record<string, any> = {};

  // ─────────────────────────────────────────────────────────────────────────
  // 1. DATABASE QUERY PERFORMANCE BENCHMARKS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('📌 1. Database Query Performance Benchmarks...');

  // 1.1 Store Inventory Query (Indexed on storeCode)
  const invLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    await prisma.inventory.findMany({
      where: { storeCode: 'BLR' },
      include: { product: true },
      take: 100,
    });
    invLatencies.push(performance.now() - t0);
  }
  const invStats = calculatePercentiles(invLatencies);
  console.log(`  - Inventory by storeCode (BLR): p50=${invStats.p50.toFixed(2)}ms, p95=${invStats.p95.toFixed(2)}ms, avg=${invStats.avg.toFixed(2)}ms`);
  results['db_inventory_query'] = invStats;

  // 1.2 Sales 30-Day Aggregate Query
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const salesTrendLatencies: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    await prisma.salesOrder.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        grandTotal: true,
        grossProfit: true,
        storeCode: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    salesTrendLatencies.push(performance.now() - t0);
  }
  const salesStats = calculatePercentiles(salesTrendLatencies);
  console.log(`  - Sales 30-Day Trend Query: p50=${salesStats.p50.toFixed(2)}ms, p95=${salesStats.p95.toFixed(2)}ms, avg=${salesStats.avg.toFixed(2)}ms`);
  results['db_sales_trend_query'] = salesStats;

  // 1.3 General Ledger Balance Invariant Query
  const ledgerLatencies: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    const ledgerAgg = await (prisma as any).financialLedgerEntry.aggregate({
      where: { isEliminated: false },
      _sum: {
        debit: true,
        credit: true,
      },
    });
    ledgerLatencies.push(performance.now() - t0);
  }
  const ledgerStats = calculatePercentiles(ledgerLatencies);
  console.log(`  - Ledger Balance Invariant Query: p50=${ledgerStats.p50.toFixed(2)}ms, p95=${ledgerStats.p95.toFixed(2)}ms, avg=${ledgerStats.avg.toFixed(2)}ms`);
  results['db_ledger_invariant_query'] = ledgerStats;

  // Raw SQL Invariant Verification:
  const rawBalanceResult: any[] = await prisma.$queryRaw`
    SELECT 
      SUM(CAST(debit AS DECIMAL(15,2))) AS total_debit,
      SUM(CAST(credit AS DECIMAL(15,2))) AS total_credit,
      SUM(CAST(debit AS DECIMAL(15,2))) - SUM(CAST(credit AS DECIMAL(15,2))) AS imbalance
    FROM financial_ledger
    WHERE is_eliminated = 0;
  `;
  const rawImbalance = Number(rawBalanceResult[0]?.imbalance || 0);
  console.log(`  - Raw SQL Ledger Balance Imbalance: ${rawImbalance} (Must be 0.00)`);
  results['ledger_imbalance'] = rawImbalance;
  results['ledger_total_debit'] = Number(rawBalanceResult[0]?.total_debit || 0);
  results['ledger_total_credit'] = Number(rawBalanceResult[0]?.total_credit || 0);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CONCURRENT USER / POS CHECKOUT LOAD BENCHMARK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 2. Simulating 50 Concurrent POS Terminals...');

  // Ensure high-stock product for load simulation
  let loadTestProduct = await prisma.product.findFirst({
    where: { sku: 'SKU-LOAD-BENCHMARK-001' },
  });
  if (!loadTestProduct) {
    loadTestProduct = await prisma.product.create({
      data: {
        sku: 'SKU-LOAD-BENCHMARK-001',
        name: 'Load Test High Velocity Item',
        category: 'Accessories',
        baseCostPrice: 50,
        baseSellingPrice: 100,
        status: 'active',
      },
    });
  }

  // Ensure 10,000 units in stock for BLR
  await prisma.inventory.upsert({
    where: {
      productId_storeCode: {
        productId: loadTestProduct.id,
        storeCode: 'BLR',
      },
    },
    create: {
      productId: loadTestProduct.id,
      storeCode: 'BLR',
      qtyOnHand: 10000,
    },
    update: {
      qtyOnHand: 10000,
    },
  });

  const CONCURRENT_CLIENTS = 50;
  const checkoutLatencies: number[] = [];
  const successfulOrderIds: string[] = [];
  let connectionPoolErrors = 0;

  const runConcurrentBatch = async () => {
    const promises = Array.from({ length: CONCURRENT_CLIENTS }).map(async (_, idx) => {
      const t0 = performance.now();
      try {
        const sale = await executePOSCheckout({
          storeCode: 'BLR',
          customerName: `Load Test Customer ${idx + 1}`,
          customerPhone: `98000${(10000 + idx).toString().slice(-5)}`,
          items: [
            {
              productId: loadTestProduct!.id,
              productName: loadTestProduct!.name,
              sku: loadTestProduct!.sku,
              qty: 1,
              unitPrice: 100,
              unitCost: 50,
            },
          ],
          paymentMethod: 'UPI',
          cashierName: `Terminal-${(idx % 10) + 1}`,
          paymentProofUrl: '/api/files/payment-proofs/test-load-proof.jpg',
          referenceNo: `LOAD-REF-${Date.now()}-${idx}`,
        });
        checkoutLatencies.push(performance.now() - t0);
        if (sale && sale.id) {
          successfulOrderIds.push(sale.id);
        }
      } catch (err: any) {
        console.error(`Client ${idx} failed:`, err.message);
        if (err.message.includes('connection') || err.message.includes('timeout')) {
          connectionPoolErrors++;
        }
      }
    });

    await Promise.all(promises);
  };

  const batchStart = performance.now();
  await runConcurrentBatch();
  const totalBatchTime = performance.now() - batchStart;

  const checkoutStats = calculatePercentiles(checkoutLatencies);
  console.log(`  - 50 Concurrent POS Terminals Batch Completed in ${totalBatchTime.toFixed(2)}ms`);
  console.log(`  - Successful Orders: ${successfulOrderIds.length}/${CONCURRENT_CLIENTS}`);
  console.log(`  - Connection Pool Errors: ${connectionPoolErrors}`);
  console.log(`  - Response Time Distribution: p50=${checkoutStats.p50.toFixed(2)}ms, p95=${checkoutStats.p95.toFixed(2)}ms, p99=${checkoutStats.p99.toFixed(2)}ms, min=${checkoutStats.min.toFixed(2)}ms, max=${checkoutStats.max.toFixed(2)}ms`);

  results['concurrent_pos_load'] = {
    total_clients: CONCURRENT_CLIENTS,
    successful_checkouts: successfulOrderIds.length,
    connection_pool_errors: connectionPoolErrors,
    total_batch_time_ms: Math.round(totalBatchTime),
    stats: checkoutStats,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. APPLICATION SERVICE BENCHMARKS (P&L, Ledger)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📌 3. Measuring Application Service Performance...');

  const pnlLatencies: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    await getConsolidatedPnL({});
    pnlLatencies.push(performance.now() - t0);
  }
  const pnlStats = calculatePercentiles(pnlLatencies);
  console.log(`  - Consolidated P&L Calculation: p50=${pnlStats.p50.toFixed(2)}ms, p95=${pnlStats.p95.toFixed(2)}ms, avg=${pnlStats.avg.toFixed(2)}ms`);
  results['pnl_calculation'] = pnlStats;

  // Cleanup benchmark test sales and restore inventory
  console.log('\n🧹 Cleaning up load test benchmark orders...');
  for (const id of successfulOrderIds) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (order) {
      await (prisma as any).financialLedgerEntry.deleteMany({ where: { refNo: order.orderNo } });
      await (prisma as any).inventoryLedger.deleteMany({ where: { refNo: order.orderNo } });
      await prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.salesOrder.delete({ where: { id } });
    }
  }

  // Restore inventory
  await prisma.inventory.update({
    where: {
      productId_storeCode: {
        productId: loadTestProduct.id,
        storeCode: 'BLR',
      },
    },
    data: { qtyOnHand: 1000 },
  });

  // Write out results JSON
  const outputPath = path.join(__dirname, 'benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Benchmark metrics successfully recorded to ${outputPath}`);

  await prisma.$disconnect();
}

runBenchmarks().catch((err) => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
