'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DeviceProfile } from '@/lib/sysConfig';
import { useSysConfig } from '@/components/providers/sys-config-provider';

export interface FleetTelemetry {
  v_bat: number | null;
  i_bat: number | null;
  soc_percent: number | null;
  rssi: number | null;
  free_heap: number | null;
  fw_version: string | null;
  temp_celsius: number | null;
  timestamp: string | null;
}

export interface FleetDeviceStatus {
  device: DeviceProfile;
  loading: boolean;
  online: boolean;
  latency_ms: number | null;
  telemetry: FleetTelemetry | null;
  error: string | null;
  last_checked_at: string | null;
}

const FLEET_TIMEOUT_MS = 8000;
const FLEET_POLL_MS = 30000;

async function fetchLatestFor(device: DeviceProfile): Promise<{
  ok: boolean;
  latency_ms: number;
  telemetry: FleetTelemetry | null;
  error: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLEET_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const res = await fetch(device.gas_webapp_url, {
      method: 'POST',
      body: JSON.stringify({ action: 'LATEST', token: device.auth_token }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startedAt);
    if (!res.ok) return { ok: false, latency_ms: latency, telemetry: null, error: `HTTP ${res.status}` };
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      message?: string;
      data?: Partial<FleetTelemetry>;
    } | null;
    if (!json || json.status !== 'SUCCESS') {
      return { ok: false, latency_ms: latency, telemetry: null, error: json?.message ?? 'ERROR' };
    }
    const d = json.data ?? {};
    const asNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      ok: true,
      latency_ms: latency,
      telemetry: {
        v_bat: asNum(d.v_bat),
        i_bat: asNum(d.i_bat),
        soc_percent: asNum(d.soc_percent),
        rssi: asNum(d.rssi),
        free_heap: asNum(d.free_heap),
        fw_version: (d.fw_version as string | null) ?? null,
        temp_celsius: asNum(d.temp_celsius),
        timestamp: (d.timestamp as string | null) ?? null,
      },
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startedAt);
    return {
      ok: false,
      latency_ms: latency,
      telemetry: null,
      error: (err as Error).name === 'AbortError' ? 'Timeout' : (err as Error).message,
    };
  }
}

export function useFleetStatus(pollMs = FLEET_POLL_MS): {
  statuses: FleetDeviceStatus[];
  refresh: () => Promise<void>;
  lastRefreshAt: string | null;
} {
  const { config } = useSysConfig();
  const [statuses, setStatuses] = useState<FleetDeviceStatus[]>([]);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      setStatuses([]);
      return;
    }
    setStatuses((prev) =>
      config.devices.map((device) => {
        const existing = prev.find((p) => p.device.device_id === device.device_id);
        return (
          existing ?? {
            device,
            loading: true,
            online: false,
            latency_ms: null,
            telemetry: null,
            error: null,
            last_checked_at: null,
          }
        );
      })
    );
  }, [config]);

  const refresh = useCallback(async () => {
    if (!config) return;
    const results = await Promise.all(
      config.devices.map(async (device) => {
        const r = await fetchLatestFor(device);
        return {
          device,
          loading: false,
          online: r.ok,
          latency_ms: r.latency_ms,
          telemetry: r.telemetry,
          error: r.error,
          last_checked_at: new Date().toISOString(),
        } satisfies FleetDeviceStatus;
      })
    );
    setStatuses(results);
    setLastRefreshAt(new Date().toISOString());
  }, [config]);

  useEffect(() => {
    if (!config) return;
    void refresh();
    const id = window.setInterval(refresh, Math.max(pollMs, 15000));
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [config, pollMs, refresh]);

  return { statuses, refresh, lastRefreshAt };
}
