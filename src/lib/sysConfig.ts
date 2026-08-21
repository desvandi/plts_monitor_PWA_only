/**
 * PLTS_SYS_CONFIG — Runtime dynamic configuration stored in browser localStorage.
 *
 * Contract enforced by §2.3 of the technical brief (Zero-Touch Deployment).
 * The PWA is deployed once; each user pastes their own GAS URL + token, which
 * is persisted in localStorage under the key `PLTS_SYS_CONFIG`.
 *
 * This module MUST NOT read from any Next.js build-time env variable.
 */
export const SYS_CONFIG_KEY = 'PLTS_SYS_CONFIG';
export const SYS_CONFIG_VERSION = '1.0.0';

export interface DashboardSettings {
  telemetry_refresh_interval_sec: number;
  battery_nominal_voltage: number;
  battery_capacity_ah: number;
  low_battery_warning_threshold: number;
  enable_audio_alarm: boolean;
  theme: 'dark' | 'light';
}

export interface PltsSysConfig {
  version: string;
  updated_at: string;
  gas_webapp_url: string;
  auth_token: string;
  device_id: string;
  dashboard_settings: DashboardSettings;
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  telemetry_refresh_interval_sec: 5,
  battery_nominal_voltage: 24,
  battery_capacity_ah: 100,
  low_battery_warning_threshold: 22.0,
  enable_audio_alarm: true,
  theme: 'dark',
};

const isBrowser = () => typeof window !== 'undefined';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Schema validation — returns null if config is missing or malformed. */
export function validateSysConfig(raw: unknown): PltsSysConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (!isNonEmptyString(obj.version)) return null;
  if (!isNonEmptyString(obj.gas_webapp_url)) return null;
  if (!obj.gas_webapp_url.toString().startsWith('http')) return null;
  if (!isNonEmptyString(obj.auth_token)) return null;
  if (!isNonEmptyString(obj.device_id)) return null;

  const ds = (obj.dashboard_settings ?? {}) as Record<string, unknown>;
  const dashboard: DashboardSettings = {
    telemetry_refresh_interval_sec: isFiniteNumber(ds.telemetry_refresh_interval_sec)
      ? ds.telemetry_refresh_interval_sec
      : DEFAULT_DASHBOARD_SETTINGS.telemetry_refresh_interval_sec,
    battery_nominal_voltage: isFiniteNumber(ds.battery_nominal_voltage)
      ? ds.battery_nominal_voltage
      : DEFAULT_DASHBOARD_SETTINGS.battery_nominal_voltage,
    battery_capacity_ah: isFiniteNumber(ds.battery_capacity_ah)
      ? ds.battery_capacity_ah
      : DEFAULT_DASHBOARD_SETTINGS.battery_capacity_ah,
    low_battery_warning_threshold: isFiniteNumber(ds.low_battery_warning_threshold)
      ? ds.low_battery_warning_threshold
      : DEFAULT_DASHBOARD_SETTINGS.low_battery_warning_threshold,
    enable_audio_alarm:
      typeof ds.enable_audio_alarm === 'boolean'
        ? ds.enable_audio_alarm
        : DEFAULT_DASHBOARD_SETTINGS.enable_audio_alarm,
    theme: ds.theme === 'light' ? 'light' : 'dark',
  };

  return {
    version: obj.version as string,
    updated_at: isNonEmptyString(obj.updated_at) ? (obj.updated_at as string) : new Date().toISOString(),
    gas_webapp_url: obj.gas_webapp_url as string,
    auth_token: obj.auth_token as string,
    device_id: obj.device_id as string,
    dashboard_settings: dashboard,
  };
}

export function readSysConfig(): PltsSysConfig | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(SYS_CONFIG_KEY);
    if (!raw) return null;
    return validateSysConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSysConfig(config: Omit<PltsSysConfig, 'version' | 'updated_at'>): PltsSysConfig {
  const enriched: PltsSysConfig = {
    ...config,
    version: SYS_CONFIG_VERSION,
    updated_at: new Date().toISOString(),
  };
  if (isBrowser()) {
    window.localStorage.setItem(SYS_CONFIG_KEY, JSON.stringify(enriched));
    window.dispatchEvent(new CustomEvent('plts:config-updated'));
  }
  return enriched;
}

export function clearSysConfig(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SYS_CONFIG_KEY);
  window.dispatchEvent(new CustomEvent('plts:config-updated'));
}

/** Live PING/PONG handshake against user-supplied GAS Web App URL. §2.4 */
export interface HandshakeResult {
  ok: boolean;
  message: string;
  status?: string;
  code?: number;
  latency_ms?: number;
}

export async function pingGasEndpoint(
  gasUrl: string,
  token: string,
  timeoutMs = 7000
): Promise<HandshakeResult> {
  if (!gasUrl || !gasUrl.startsWith('http')) {
    return { ok: false, message: 'URL GAS tidak valid (harus diawali http/https).' };
  }
  if (!token) {
    return { ok: false, message: 'Auth token tidak boleh kosong.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'PING', token }),
      // GAS Web Apps do not respect a CORS preflight when Content-Type is
      // application/json, so we use text/plain (still parsed correctly by GAS).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return { ok: false, message: `GAS mengembalikan HTTP ${response.status}.`, code: response.status, latency_ms: latency };
    }

    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      code?: number;
      message?: string;
    } | null;

    if (!payload) {
      return { ok: false, message: 'Respons GAS tidak dapat di-parse (bukan JSON).', latency_ms: latency };
    }

    const isSuccess = payload.status === 'SUCCESS' && String(payload.message || '').toUpperCase() === 'PONG';
    return {
      ok: isSuccess,
      status: payload.status,
      code: payload.code,
      message: isSuccess ? 'Handshake sukses (PING/PONG).' : payload.message || 'Handshake gagal.',
      latency_ms: latency,
    };
  } catch (err) {
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startedAt);
    if ((err as Error).name === 'AbortError') {
      return { ok: false, message: `Timeout > ${timeoutMs}ms saat menghubungi GAS.`, latency_ms: latency };
    }
    return { ok: false, message: `Kesalahan jaringan/CORS: ${(err as Error).message}`, latency_ms: latency };
  }
}

/** Serialize current config to a download-ready JSON blob. §2.5 */
export function exportSysConfigBlob(config: PltsSysConfig): Blob {
  return new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
}
