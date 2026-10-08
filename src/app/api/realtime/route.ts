import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { getRealtimeStatus, getStoreChannel, getGlobalChannel } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/realtime
 *
 * Returns authoritative realtime connection configuration and server-determined
 * channel authorizations. Non-admins cannot forge subscriptions to other stores.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;
    const isSuperAdmin = user.role === 'Super Admin' || user.securityLevel >= 100;

    // Server-Authoritative Subscription Channels:
    // Super Admin: May subscribe to enterprise and all authorized stores
    // Store Manager / Sales Manager: Restricted strictly to own assigned store + own user channel
    const authorizedChannels: string[] = [];

    if (isSuperAdmin) {
      authorizedChannels.push(getGlobalChannel()); // private-enterprise
      authorizedChannels.push('private-settings');
      authorizedChannels.push('private-work-activity');
      authorizedChannels.push('private-attendance');
      authorizedChannels.push(`private-user-${user.id}`);
      // Also allow individual store channels
      user.allowedStores.forEach((st) => {
        authorizedChannels.push(getStoreChannel(st));
      });
    } else {
      const userStore = user.store && user.store !== 'All Stores' ? user.store : 'BLR';
      authorizedChannels.push(getGlobalChannel()); // private-enterprise (for branding/settings synchronization)
      authorizedChannels.push('private-settings');
      authorizedChannels.push(getStoreChannel(userStore)); // private-store-<store>
      authorizedChannels.push(`private-user-${user.id}`);
    }

    const config = getRealtimeStatus();

    return NextResponse.json({
      success: true,
      realtime: config,
      authorizedChannels: Array.from(new Set(authorizedChannels)),
      user: {
        id: user.id,
        role: user.role,
        store: user.store,
        allowedStores: user.allowedStores,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('API /api/realtime error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to get realtime config' },
      { status: 500 }
    );
  }
}
