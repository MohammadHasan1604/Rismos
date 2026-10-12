/**
 * COSKO Distributed Realtime Client Manager
 *
 * Handles client-side realtime subscriptions:
 * 1. Distributed WebSocket via Pusher Channels when configured
 * 2. Reliable DB-authoritative Outbox Sync fallback when Pusher is not configured
 * 3. Graceful reconnection with exponential backoff
 * 4. Offline event recovery (catches up on missed mutations via /api/realtime/sync)
 * 5. Targeted domain invalidation dispatch
 */

export interface RealtimeConfig {
  provider: 'pusher' | 'fallback-polling';
  isDistributed: boolean;
  mode: string;
  key: string | null;
  cluster: string | null;
}

export interface RealtimeEventDetail {
  channel: string;
  event: string;
  payload: any;
  timestamp: string;
}

export type RealtimeEventHandler = (detail: RealtimeEventDetail) => void;

class RealtimeClientManager {
  private pusherInstance: any = null;
  private subscribedChannels = new Set<string>();
  private listeners: RealtimeEventHandler[] = [];
  private fallbackInterval: any = null;
  private lastCursor: string = new Date().toISOString();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private currentMode = 'Initializing';

  public getStatus() {
    return {
      connected: this.isConnected,
      mode: this.currentMode,
      channels: Array.from(this.subscribedChannels),
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  public subscribe(handler: RealtimeEventHandler) {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  private dispatchEvent(detail: RealtimeEventDetail) {
    this.listeners.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.warn('[RealtimeClient] Listener error:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cosko:realtime', { detail }));
    }
  }

  /**
   * Initializes client realtime subscription based on server authorization
   */
  public async initialize(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // 1. Fetch authoritative realtime config and authorized channels
      const res = await fetch('/api/realtime', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) {
        this.startFallbackSync();
        return;
      }

      const data = await res.json();
      const config: RealtimeConfig = data.realtime;
      const authorizedChannels: string[] = data.authorizedChannels || [];

      if (config.isDistributed && config.key && config.cluster) {
        await this.initPusher(config.key, config.cluster, authorizedChannels);
      } else {
        this.currentMode = 'DB-Authoritative Fallback Sync (Pusher not configured in env)';
        console.info(`[RISMOS Realtime] ${this.currentMode}`);
        this.startFallbackSync();
      }
    } catch (err) {
      console.warn('[RISMOS Realtime] Init error, starting fallback sync:', err);
      this.startFallbackSync();
    }
  }

  /**
   * Initialize Pusher WebSocket connection
   */
  private async initPusher(key: string, cluster: string, channels: string[]) {
    try {
      const Pusher = (await import('pusher-js')).default;
      this.pusherInstance = new Pusher(key, {
        cluster,
        forceTLS: true,
        channelAuthorization: {
          endpoint: '/api/realtime/auth',
          transport: 'ajax',
        },
        authEndpoint: '/api/realtime/auth',
      });

      this.currentMode = `Distributed WebSocket (Pusher Cluster: ${cluster})`;

      this.pusherInstance.connection.bind('connected', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.info('[RISMOS Realtime] Connected to distributed realtime cluster');
        // Recover any events missed during disconnection
        this.catchUpMissedEvents();
      });

      this.pusherInstance.connection.bind('disconnected', () => {
        this.isConnected = false;
        console.warn('[RISMOS Realtime] WebSocket disconnected. Attempting auto-reconnect...');
        this.handleReconnect();
      });

      this.pusherInstance.connection.bind('error', (err: any) => {
        console.warn('[RISMOS Realtime] WebSocket connection warning:', err?.message || err);
      });

      // Subscribe strictly to server-authorized channels
      channels.forEach((channelName: string) => {
        if (!this.subscribedChannels.has(channelName)) {
          const channel = this.pusherInstance.subscribe(channelName);
          this.subscribedChannels.add(channelName);

          channel.bind_global((eventName: string, data: any) => {
            // Ignore internal pusher events (e.g. pusher:subscription_succeeded)
            if (eventName.startsWith('pusher:')) return;

            this.lastCursor = new Date().toISOString();
            this.dispatchEvent({
              channel: channelName,
              event: eventName,
              payload: data,
              timestamp: this.lastCursor,
            });
          });
        }
      });
    } catch (err) {
      console.warn('[COSKO Realtime] Pusher client init failed, falling back:', err);
      this.startFallbackSync();
    }
  }

  /**
   * Reconnection with exponential backoff
   */
  private handleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => {
      if (this.pusherInstance && !this.isConnected) {
        this.pusherInstance.connect();
      }
    }, delay);
  }

  /**
   * Catch up on mutations that committed while offline or disconnected
   */
  public async catchUpMissedEvents() {
    if (!this.lastCursor) return;
    try {
      const res = await fetch(`/api/realtime/sync?cursor=${encodeURIComponent(this.lastCursor)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
          data.events.forEach((ev: any) => {
            this.dispatchEvent({
              channel: ev.channel,
              event: ev.event,
              payload: ev.payload,
              timestamp: ev.createdAt,
            });
          });
          if (data.cursor) {
            this.lastCursor = data.cursor;
          }
        }
      }
    } catch {}
  }

  /**
   * Start DB-Authoritative Fallback Sync when distributed realtime is unconfigured
   */
  private startFallbackSync() {
    if (this.fallbackInterval) return;

    this.isConnected = true;
    this.currentMode = 'DB-Authoritative Fallback Sync';

    // Poll every 10 seconds for new outbox events
    this.fallbackInterval = setInterval(async () => {
      // Don't poll if document is hidden to conserve bandwidth and battery
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      await this.catchUpMissedEvents();
    }, 10000);
  }

  /**
   * Cleanup connections and timers
   */
  public destroy() {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    if (this.pusherInstance) {
      try {
        this.subscribedChannels.forEach((ch) => this.pusherInstance.unsubscribe(ch));
        this.pusherInstance.disconnect();
      } catch {}
      this.pusherInstance = null;
    }
    this.subscribedChannels.clear();
    this.listeners = [];
    this.isConnected = false;
  }
}

export const realtimeClient = new RealtimeClientManager();
