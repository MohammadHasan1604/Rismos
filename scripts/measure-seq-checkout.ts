import { prisma } from '../src/lib/db';
import { executePOSCheckout } from '../src/lib/services/salesService';
import * as fs from 'fs';
import * as path from 'path';

async function measureSequentialCheckouts() {
  console.log('Measuring sequential POS checkouts latency...');
  const latencies: number[] = [];
  const orderIds: string[] = [];

  const product = await prisma.product.findFirst({
    where: { sku: 'SKU-LOAD-BENCHMARK-001' },
  });
  if (!product) throw new Error('Product not found');

  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const sale = await executePOSCheckout({
      storeCode: 'BLR',
      customerName: `Seq Customer ${i}`,
      customerPhone: '9888877777',
      items: [
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          qty: 1,
          unitPrice: 100,
          unitCost: 50,
        },
      ],
      paymentMethod: 'UPI',
      cashierName: 'Seq Terminal',
      paymentProofUrl: '/api/files/payment-proofs/test-seq.jpg',
      referenceNo: `SEQ-REF-${Date.now()}-${i}`,
    });
    const dur = performance.now() - t0;
    latencies.push(dur);
    if (sale && sale.id) orderIds.push(sale.id);
    console.log(`Checkout ${i + 1}/20: ${dur.toFixed(2)}ms (Order: ${sale.orderNo})`);
  }

  // Cleanup
  for (const id of orderIds) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (order) {
      await (prisma as any).financialLedgerEntry.deleteMany({ where: { refNo: order.orderNo } });
      await (prisma as any).inventoryLedger.deleteMany({ where: { refNo: order.orderNo } });
      await prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
      await prisma.salesOrder.delete({ where: { id } });
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[sorted.length - 1];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  console.log(`Sequential Latency: p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms, avg=${avg.toFixed(2)}ms`);

  const resultsPath = path.join(__dirname, 'benchmark-results.json');
  const existing = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  existing['sequential_pos_checkout'] = {
    count: latencies.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    p50,
    p95,
    p99,
  };
  fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));

  await prisma.$disconnect();
}

measureSequentialCheckouts().catch(console.error);
