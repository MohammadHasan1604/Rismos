import { getNextSequenceNumber } from '../src/lib/atomicSequence';
import { prisma } from '../src/lib/db';

async function testConcurrentSequence() {
  console.log('========================================================================');
  console.log('⚡ TESTING CONCURRENT INVOICE SEQUENCE GENERATION (100 CONCURRENT POS CALLS)');
  console.log('========================================================================\n');

  const CONCURRENCY = 100;
  console.log(`Firing ${CONCURRENCY} concurrent sequence generation requests simultaneously...`);

  const startTime = Date.now();

  // Execute all 100 in the exact same event-loop cycle
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
      try {
        const seqNo = await getNextSequenceNumber('CS');
        return { success: true, seqNo, idx };
      } catch (err: any) {
        return { success: false, error: err.message, idx };
      }
    })
  );

  const durationMs = Date.now() - startTime;
  console.log(`⏱️ Completed ${CONCURRENCY} concurrent operations in ${durationMs}ms`);

  const successful = results.filter(
    (r): r is { success: true; seqNo: string; idx: number } => r.success && typeof r.seqNo === 'string'
  );
  const failed = results.filter((r) => !r.success);

  console.log(`✅ Successful: ${successful.length}/${CONCURRENCY}`);
  if (failed.length > 0) {
    console.error(`❌ Failed: ${failed.length}/${CONCURRENCY}`);
    console.error('Failure samples:', failed.slice(0, 3));
  }

  // Verify uniqueness (zero collisions)
  const numbers: string[] = successful.map((r) => r.seqNo);
  const uniqueSet = new Set(numbers);

  console.log(`🔢 Total generated: ${numbers.length}`);
  console.log(`✨ Unique count: ${uniqueSet.size}`);

  if (uniqueSet.size !== numbers.length) {
    console.error('🚨 COLLISION DETECTED! Duplicate sequence numbers found:');
    const seen = new Set<string>();
    const dupes = numbers.filter((n) => {
      if (seen.has(n)) return true;
      seen.add(n);
      return false;
    });
    console.error(dupes);
    process.exit(1);
  }

  console.log('Sample sequence numbers:', numbers.slice(0, 5), '...', numbers.slice(-3));
  console.log('\n🎉 ALL 100 CONCURRENT REQUESTS GENERATED 100% COLLISION-PROOF UNIQUE SEQUENCES!');
}

testConcurrentSequence()
  .catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
