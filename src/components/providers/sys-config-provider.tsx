'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import {
  readSysConfig,
  writeSysConfig,
  clearSysConfig,
  addDeviceToConfig,
  removeDeviceFromConfig,
  switchActiveDevice,
  PltsSysConfig,
  DeviceProfile,
  DashboardSettings,
} from '@/lib/sysConfig';

interface SysConfigContextValue {
  config: PltsSysConfig | null;
  ready: boolean;
  save: (next: {
    gas_webapp_url: string;
    auth_token: string;
    device_id: string;
    label?: string;
    dashboard_settings: DashboardSettings;
  }) => PltsSysConfig;
  addDevice: (profile: DeviceProfile) => PltsSysConfig | null;
  removeDevice: (deviceId: string) => PltsSysConfig | null;
  switchDevice: (deviceId: string) => PltsSysConfig | null;
  reset: () => void;
  refresh: () => void;
}

const SysConfigContext = createContext<SysConfigContextValue | null>(null);

export function SysConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PltsSysConfig | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setConfig(readSysConfig());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const handler = () => refresh();
    window.addEventListener('plts:config-updated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('plts:config-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  const save = useCallback(
    (next: {
      gas_webapp_url: string;
      auth_token: string;
      device_id: string;
      label?: string;
      dashboard_settings: DashboardSettings;
    }) => {
      const persisted = writeSysConfig(next);
      setConfig(persisted);
      return persisted;
    },
    []
  );

  const addDevice = useCallback((profile: DeviceProfile) => {
    if (!config) return null;
    const persisted = addDeviceToConfig(config, profile);
    setConfig(persisted);
    return persisted;
  }, [config]);

  const removeDevice = useCallback((deviceId: string) => {
    if (!config) return null;
    const persisted = removeDeviceFromConfig(config, deviceId);
    setConfig(persisted);
    return persisted;
  }, [config]);

  const switchDevice = useCallback((deviceId: string) => {
    if (!config) return null;
    const persisted = switchActiveDevice(config, deviceId);
    setConfig(persisted);
    return persisted;
  }, [config]);

  const reset = useCallback(() => {
    clearSysConfig();
    setConfig(null);
  }, []);

  return (
    <SysConfigContext.Provider
      value={{ config, ready, save, addDevice, removeDevice, switchDevice, reset, refresh }}
    >
      {children}
    </SysConfigContext.Provider>
  );
}

export function useSysConfig(): SysConfigContextValue {
  const ctx = useContext(SysConfigContext);
  if (!ctx) throw new Error('useSysConfig must be used inside <SysConfigProvider>');
  return ctx;
}
