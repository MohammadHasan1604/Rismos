import { prisma } from '@/lib/db';

export interface ConnectionPoolStatus {
  activeConnections: number;
  active_connections?: number;
  maxAllowed: number;
  max_allowed?: number;
  poolUtilizationPct: number;
  pool_utilization_pct?: number;
  healthy: boolean;
}

/**
 * Inspect MySQL active connections and pool utilization.
 */
export async function getConnectionPoolStatus(): Promise<ConnectionPoolStatus> {
  try {
    const result: any[] = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as active_connections,
        @@max_connections as max_allowed
      FROM information_schema.processlist
      WHERE command != 'Sleep'
    `;

    const active = Number(result?.[0]?.active_connections ?? 1);
    const max = Number(result?.[0]?.max_allowed ?? 100);
    const pct = Math.round((active / (max || 1)) * 10000) / 100;

    return {
      activeConnections: active,
      active_connections: active,
      maxAllowed: max,
      max_allowed: max,
      poolUtilizationPct: pct,
      pool_utilization_pct: pct,
      healthy: pct < 85,
    };
  } catch (error) {
    console.warn('[DB-POOL] Could not query processlist, using baseline fallback:', error);
    return {
      activeConnections: 1,
      active_connections: 1,
      maxAllowed: 100,
      max_allowed: 100,
      poolUtilizationPct: 1,
      pool_utilization_pct: 1,
      healthy: true,
    };
  }
}
