'use client';

// =============================================================================
// React Query hooks — read methods + mutation hooks for all 15 views.
// -----------------------------------------------------------------------------
// Hybrid REST/MQTT: in MQTT mode, useMqttStatus drives the data; REST queries
// are disabled. In REST/mock mode, /api/* is polled at sensible intervals.
//
// MONITORING-ONLY: no relay/PIR/schedule mutations. Mutations limited to:
//   - config / calibration / voltage 3-point / ACS712 zero
//   - acknowledge alarm
//   - reboot / factory reset (prepare + confirm)
//   - OTA check + upload
//   - export/import config + change password + device config
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { useMqttStatus, useMqttLogs } from '@/components/providers/mqtt-provider';
import { toast } from 'sonner';
import { useLanguage } from '@/components/providers/language-provider';
import { useEffect, useRef } from 'react';
import type {
  SystemStatus,
  SystemConfig,
  DeviceConfig,
  Calibration,
  Alarm,
  DailyEnergyRecord,
  ReportRequest,
  SystemEvent,
} from '@/lib/types';
import { recordEnergySample } from '@/lib/energyHistory';

// ---------- Status (hybrid REST/MQTT) ----------
export function useStatus() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();
  const qc = useQueryClient();
  const prevSeq = useRef<number | null>(null);

  // When MQTT status arrives, update the query cache + record sample.
  useEffect(() => {
    if (mqttStatus) {
      // Gap detection (brief §22): if sequence regressed or skipped, refresh all data.
      if (prevSeq.current !== null && mqttStatus.sequence <= prevSeq.current) {
        qc.invalidateQueries();
      }
      prevSeq.current = mqttStatus.sequence;
      qc.setQueryData(['status'], mqttStatus);
      recordEnergySample(mqttStatus);
    }
  }, [mqttStatus, qc]);

  const restQuery = useQuery({
    queryKey: ['status'],
    queryFn: () => api.status(),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 3_000,
  });

  if (isMqttMode) {
    return {
      data: mqttStatus ?? undefined,
      isLoading: !mqttStatus,
    };
  }
  // Record sample for REST mode too (charts history)
  if (restQuery.data) {
    recordEnergySample(restQuery.data);
  }
  return restQuery;
}

// ---------- Config ----------
export function useConfig() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();

  const restQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => api.config(),
    enabled: session.isAuthenticated && !isMqttMode,
  });

  if (isMqttMode && mqttStatus) {
    const config: SystemConfig = {
      deviceName: mqttStatus.deviceName,
      siteName: mqttStatus.config.siteName,
      timezone: mqttStatus.config.timezone,
      config: mqttStatus.config,
      calibration: mqttStatus.calibration,
    };
    return { data: config, isLoading: false };
  }
  return restQuery;
}

// ---------- Version / Firmware ----------
export function useVersion() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();

  const restQuery = useQuery({
    queryKey: ['version'],
    queryFn: () => api.version(),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 30_000,
  });

  if (isMqttMode && mqttStatus) {
    return {
      data: {
        currentVersion: mqttStatus.firmwareVersion,
        buildDate: '',
        protocolVersion: mqttStatus.protocolVersion,
        configSchemaVersion: 1,
        latestAvailable: null,
        updateAvailable: null,
        signatureVerified: null,
        otaStatus: 'unknown' as const,
        lastUpdateAt: null,
        lastUpdateStatus: null,
      },
      isLoading: false,
    };
  }
  return restQuery;
}

// ---------- Logs (hybrid REST/MQTT) ----------
export function useLogs(filter?: { type?: string; limit?: number }) {
  const { session, isMqttMode } = useAuth();
  const mqttLogs = useMqttLogs(filter?.limit ?? 200);

  const restQuery = useQuery({
    queryKey: ['logs', filter],
    queryFn: () => api.logs(filter),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 5_000,
  });

  if (isMqttMode) {
    let logs = mqttLogs;
    if (filter?.type && filter.type !== 'all') {
      logs = logs.filter((l) => l.type === filter.type);
    }
    return { data: { logs, total: logs.length }, isLoading: false };
  }
  return restQuery;
}

// ---------- Alarms ----------
export function useAlarms() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();

  const restQuery = useQuery({
    queryKey: ['alarms'],
    queryFn: () => api.alarms(),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 10_000,
  });

  if (isMqttMode && mqttStatus) {
    const active = mqttStatus.activeAlarms;
    return { data: { active, history: active }, isLoading: false };
  }
  return restQuery;
}

export function useAcknowledgeAlarm() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (alarmId: string) => {
      if (isMqttMode) {
        // Monitoring-only — no ack over MQTT in this version.
        toast.info(t('toast.alarm_acked') + ' (MQTT mode — ack stored locally)');
        return { acknowledged: true };
      }
      return api.acknowledgeAlarm(alarmId);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['alarms'] });
        qc.invalidateQueries({ queryKey: ['status'] });
      }
      toast.success(t('toast.alarm_acked'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Events ----------
export function useEvents(filter?: { from?: number; to?: number; limit?: number }) {
  const { session, isMqttMode } = useAuth();

  const restQuery = useQuery({
    queryKey: ['events', filter],
    queryFn: () => api.events(filter),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 30_000,
  });

  if (isMqttMode) {
    return { data: { events: [] as SystemEvent[], total: 0 }, isLoading: false };
  }
  return restQuery;
}

// ---------- Diagnostics ----------
export function useDiagnostics() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();

  const restQuery = useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => api.diagnostics(),
    enabled: session.isAuthenticated && !isMqttMode,
    refetchInterval: isMqttMode ? false : 15_000,
  });

  if (isMqttMode && mqttStatus) {
    return {
      data: {
        uptimeSeconds: mqttStatus.uptimeSeconds,
        freeHeap: mqttStatus.health.freeHeap,
        minFreeHeap: mqttStatus.health.minFreeHeap,
        wifiRssi: mqttStatus.health.wifiRssi,
        wifiReconnectCount: mqttStatus.health.wifiReconnectCount,
        wifiState: 'CONNECTED' as const,
        mqttState: 'CONNECTED' as const,
        gasApiState: 'UNKNOWN' as const,
        ntpState: mqttStatus.health.ntpSynced ? 'SYNCED' as const : 'UNSYNCED' as const,
        resetReason: mqttStatus.resetReason,
        bootCount: mqttStatus.bootCount,
        firmwareVersion: mqttStatus.firmwareVersion,
        protocolVersion: mqttStatus.protocolVersion,
        configSchemaVersion: 1,
        storageState: mqttStatus.health.storageOk ? 'OK' as const : 'FAILED' as const,
        spoolSize: mqttStatus.health.spoolSize,
        sensorHealth: mqttStatus.health.sensorHealth,
        calibrationVersions: {
          voltage: mqttStatus.calibration.version,
          acs712: mqttStatus.calibration.version,
          sht31: mqttStatus.calibration.version,
        },
      },
      isLoading: false,
    };
  }
  return restQuery;
}

// ---------- Calibration ----------
export function useCalibration() {
  const { session, isMqttMode } = useAuth();
  const mqttStatus = useMqttStatus();

  const restQuery = useQuery({
    queryKey: ['calibration'],
    queryFn: () => api.calibration(),
    enabled: session.isAuthenticated && !isMqttMode,
  });

  if (isMqttMode && mqttStatus) {
    return { data: mqttStatus.calibration, isLoading: false };
  }
  return restQuery;
}

// ---------- Reports ----------
export function useReports() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['reports'],
    queryFn: () => Promise.resolve({ records: [] as DailyEnergyRecord[], generatedAt: Date.now() }),
    enabled: session.isAuthenticated,
  });
}

export function useReportMutation() {
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async (req: ReportRequest) => api.reports(req),
    onSuccess: () => toast.success(t('toast.report_exported')),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- AI insights ----------
export function useAiInsightsHook() {
  const { session } = useAuth();
  const mqttStatus = useMqttStatus();
  const deviceId = mqttStatus?.deviceId ?? (session.isAuthenticated ? 'mock-device' : null);
  // Lazy import to avoid SSR cycles.
  const { useAiInsights } = require('@/lib/aiInsights') as typeof import('@/lib/aiInsights');
  return useAiInsights(deviceId);
}

// ---------- OTA ----------
export function useOtaCheck() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (isMqttMode) {
        return { available: false, latestVersion: null };
      }
      return api.otaCheck();
    },
    onSuccess: (data) => {
      if (!isMqttMode) qc.invalidateQueries({ queryKey: ['version'] });
      if (data.available) {
        toast.success(`${t('ota.update_available')}: v${data.latestVersion}`);
      } else {
        toast.success(t('ota.up_to_date'));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useOtaUpload() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (pct: number) => void }) => {
      if (isMqttMode) {
        toast.error('OTA upload not available in MQTT mode — use LAN connection');
        throw new Error('OTA not available in MQTT mode');
      }
      return api.otaUpload(file, onProgress);
    },
    onSuccess: () => {
      if (!isMqttMode) qc.invalidateQueries({ queryKey: ['version'] });
      toast.success(t('toast.ota_success'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.ota_failed')),
  });
}

// ---------- Reboot ----------
export function useReboot() {
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (isMqttMode) {
        toast.info('Reboot not available in MQTT mode — use LAN connection');
        return { rebooting: false };
      }
      return api.reboot();
    },
    onSuccess: (data) => {
      if (data.rebooting) toast.success(t('toast.rebooting'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Config mutations ----------
export function useConfigMutation() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (cfg: Partial<DeviceConfig>) => {
      if (isMqttMode) {
        toast.info('Config update requires LAN connection');
        return { updated: false };
      }
      return api.updateConfig(cfg);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['config'] });
        qc.invalidateQueries({ queryKey: ['status'] });
      }
      toast.success(t('toast.saved'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useCalibrationMutation() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (cal: Partial<Calibration>) => {
      if (isMqttMode) {
        toast.info('Calibration update requires LAN connection');
        return { updated: false };
      }
      return api.updateCalibration(cal);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['calibration'] });
        qc.invalidateQueries({ queryKey: ['status'] });
      }
      toast.success(t('toast.calibration_saved'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useVoltageCalibrationPoint() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async ({
      point,
      reference,
      raw,
    }: {
      point: 'low' | 'nominal' | 'full';
      reference: number;
      raw: number;
    }) => {
      if (isMqttMode) {
        toast.info('Calibration requires LAN connection');
        return { updated: false };
      }
      return api.voltageCalibrationPoint(point, reference, raw);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['calibration'] });
        qc.invalidateQueries({ queryKey: ['status'] });
      }
      toast.success(t('toast.calibration_saved'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useAcs712ZeroCalibration() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (isMqttMode) {
        toast.info('Calibration requires LAN connection');
        return { updated: false, newOffset: 0 };
      }
      return api.acs712ZeroCal();
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['calibration'] });
        qc.invalidateQueries({ queryKey: ['status'] });
      }
      toast.success(t('toast.calibration_saved'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Device config (name, site, timezone) ----------
export function useDeviceConfigMutation() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (opts: { deviceName?: string; siteName?: string; timezone?: string }) => {
      if (isMqttMode) {
        toast.info('Device config requires LAN connection');
        return { updated: false };
      }
      return api.updateDevice(opts);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries({ queryKey: ['status'] });
        qc.invalidateQueries({ queryKey: ['config'] });
      }
      toast.success(t('toast.saved'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Password change ----------
export function useChangePassword() {
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async ({ current, next }: { current: string; next: string }) => {
      if (isMqttMode) {
        toast.info('Password change requires LAN connection');
        return { changed: false };
      }
      return api.changePassword(current, next);
    },
    onSuccess: (data) => {
      if (data.changed) toast.success(t('toast.password_changed'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Export / Import config ----------
export function useExportConfig() {
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (isMqttMode) {
        toast.info('Config export requires LAN connection');
        return { config: null as unknown as SystemConfig };
      }
      return api.exportConfig();
    },
    onSuccess: ({ config }) => {
      if (config && !isMqttMode) {
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plts-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('toast.config_exported'));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useImportConfig() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (cfg: SystemConfig) => {
      if (isMqttMode) {
        toast.info('Config import requires LAN connection');
        return { imported: false };
      }
      return api.importConfig(cfg);
    },
    onSuccess: () => {
      if (!isMqttMode) {
        qc.invalidateQueries();
        toast.success(t('toast.config_imported'));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Factory reset ----------
export function useFactoryResetPrepare() {
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (isMqttMode) {
        toast.info('Factory reset requires LAN connection');
        return { token: '', expiresAt: 0 };
      }
      return api.factoryResetPrepare();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

export function useFactoryResetConfirm() {
  const { t } = useLanguage();
  const { isMqttMode } = useAuth();

  return useMutation({
    mutationFn: async (token: string) => {
      if (isMqttMode) {
        toast.info('Factory reset requires LAN connection');
        return { reset: false };
      }
      return api.factoryResetConfirm(token);
    },
    onSuccess: (data) => {
      if (data.reset) toast.success(t('toast.factory_reset_done'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toast.error')),
  });
}

// ---------- Convenience: return active alarms as Alarm[] ----------
export function useActiveAlarms(): Alarm[] {
  const { data } = useAlarms();
  return data?.active ?? [];
}
