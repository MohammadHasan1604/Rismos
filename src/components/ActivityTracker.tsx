'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';

// Heartbeat every 15 seconds (within the recommended 10–20s range)
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
// Considered IDLE if no user interaction for > 2 minutes
const IDLE_THRESHOLD_MS = 2 * 60 * 1000;

export default function ActivityTracker() {
  const { authStatus, currentUser } = useApp();
  const lastActiveTimeRef = useRef<number>(Date.now());
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (authStatus !== 'AUTHENTICATED' || !currentUser?.id) return;

    // Safe, non-invasive user interaction listener (no keystroke content captured)
    const handleUserInteraction = () => {
      lastActiveTimeRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserInteraction, { passive: true }));

    const sendHeartbeat = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const timeSinceActive = Date.now() - lastActiveTimeRef.current;
        const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const isIdle = isHidden || timeSinceActive > IDLE_THRESHOLD_MS;

        await fetch('/api/activity/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isIdle }),
        });
      } catch {
        // Network drops are handled silently
      } finally {
        inFlightRef.current = false;
      }
    };

    // Send immediate initial heartbeat
    sendHeartbeat();

    // Periodic heartbeat every 15 seconds
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Also send heartbeat when tab visibility changes back to visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActiveTimeRef.current = Date.now();
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      events.forEach((ev) => window.removeEventListener(ev, handleUserInteraction));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authStatus, currentUser?.id]);

  return null;
}
