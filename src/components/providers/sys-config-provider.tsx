'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { readSysConfig, writeSysConfig, clearSysConfig, PltsSysConfig } from '@/lib/sysConfig';

interface SysConfigContextValue {
  config: PltsSysConfig | null;
  ready: boolean;
  save: (next: Omit<PltsSysConfig, 'version' | 'updated_at'>) => PltsSysConfig;
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

  const save = useCallback((next: Omit<PltsSysConfig, 'version' | 'updated_at'>) => {
    const persisted = writeSysConfig(next);
    setConfig(persisted);
    return persisted;
  }, []);

  const reset = useCallback(() => {
    clearSysConfig();
    setConfig(null);
  }, []);

  return (
    <SysConfigContext.Provider value={{ config, ready, save, reset, refresh }}>
      {children}
    </SysConfigContext.Provider>
  );
}

export function useSysConfig(): SysConfigContextValue {
  const ctx = useContext(SysConfigContext);
  if (!ctx) throw new Error('useSysConfig must be used inside <SysConfigProvider>');
  return ctx;
}
