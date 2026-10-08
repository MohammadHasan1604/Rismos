import type { Config } from '@netlify/functions';
import { evaluateSystemAlerts } from '../../src/lib/services/alertService';

/**
 * Netlify Scheduled Function: Automated Background Alert Evaluator
 * Runs automatically every hour to evaluate:
 * - Low-stock alerts
 * - Overdue vendor bills
 * - Daily retail sales digest (in business timezone)
 */
export default async (_req: Request) => {
  console.log('[scheduled-alerts] Triggering automated alert evaluation...');
  try {
    const summary = await evaluateSystemAlerts();
    console.log('[scheduled-alerts] Alert evaluation finished successfully:', summary);
    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[scheduled-alerts] Evaluation failure:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  schedule: '@hourly',
};
