'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSysConfig } from '@/components/providers/sys-config-provider';
import { useFleetStatus } from '@/hooks/useFleetStatus';

const PERMISSION_LS_KEY = 'PLTS_BROWSER_NOTIFY_ENABLED';
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // don't nag more than 1×/30min per device

const lastAlertPerDevice = new Map<string, number>();

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationState(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export function isNotificationEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PERMISSION_LS_KEY) === 'true';
}

export async function requestNotificationConsent(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  window.localStorage.setItem(PERMISSION_LS_KEY, perm === 'granted' ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('plts:notify-toggle'));
  return perm as NotificationPermissionState;
}

export function disableNotifications(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PERMISSION_LS_KEY, 'false');
  window.dispatchEvent(new CustomEvent('plts:notify-toggle'));
}

async function fireLocalNotification(title: string, body: string, tag: string): Promise<void> {
  if (getNotificationState() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: '/icon.svg',
        badge: '/favicon-32.png',
        data: { url: '/fleet' },
      });
      return;
    }
  } catch {
    // Fallback to plain Notification below.
  }
  new Notification(title, { body, tag, icon: '/icon.svg' });
}

/**
 * Watches every registered device via the Fleet status hook. When any device
 * reports v_bat < low_battery_warning_threshold (from active device dashboard
 * settings), fire a browser notification (cooldown 30 min per device).
 */
export function useLowBatteryNotifier(): void {
  const { config } = useSysConfig();
  const { statuses } = useFleetStatus();
  const enabledRef = useRef(isNotificationEnabled());

  useEffect(() => {
    const sync = () => {
      enabledRef.current = isNotificationEnabled();
    };
    window.addEventListener('plts:notify-toggle', sync);
    return () => window.removeEventListener('plts:notify-toggle', sync);
  }, []);

  useEffect(() => {
    if (!config || !enabledRef.current) return;
    const threshold = config.dashboard_settings.low_battery_warning_threshold;
    const now = Date.now();
    for (const row of statuses) {
      const v = row.telemetry?.v_bat;
      if (v == null || v >= threshold) continue;
      const last = lastAlertPerDevice.get(row.device.device_id) ?? 0;
      if (now - last < ALERT_COOLDOWN_MS) continue;
      lastAlertPerDevice.set(row.device.device_id, now);
      void fireLocalNotification(
        `⚠ Baterai kritis — ${row.device.label}`,
        `V-Bat ${v.toFixed(2)} V < cutoff ${threshold.toFixed(2)} V. Segera cek beban / charger.`,
        `plts-low-${row.device.device_id}`
      );
    }
  }, [statuses, config]);
}

// -----------------------------------------------------------------------------
// Toggle UI helper — hook returning stateful helpers for a Switch component.
// -----------------------------------------------------------------------------

export function useNotificationToggle(): {
  state: NotificationPermissionState;
  enabled: boolean;
  toggle: (value: boolean) => Promise<void>;
} {
  const [state, setState] = useState<NotificationPermissionState>('default');
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setState(getNotificationState());
    setEnabled(isNotificationEnabled() && getNotificationState() === 'granted');
    const sync = () => {
      setState(getNotificationState());
      setEnabled(isNotificationEnabled() && getNotificationState() === 'granted');
    };
    window.addEventListener('plts:notify-toggle', sync);
    return () => window.removeEventListener('plts:notify-toggle', sync);
  }, []);

  const toggle = useCallback(async (value: boolean) => {
    if (!value) {
      disableNotifications();
      setEnabled(false);
      return;
    }
    const result = await requestNotificationConsent();
    setState(result);
    setEnabled(result === 'granted');
  }, []);

  return { state, enabled, toggle };
}
