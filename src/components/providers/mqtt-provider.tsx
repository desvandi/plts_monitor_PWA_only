'use client';

// =============================================================================
// MqttProvider — manages MQTT connection lifecycle for the PWA.
// -----------------------------------------------------------------------------
// MONITORING-ONLY: subscribe to status/log/online topics. No publish, no ACK
// transaction, no command arbitration.
// =============================================================================

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  connectMqtt,
  disconnectMqtt,
  onOnlineChange,
  onStatusChange,
  onLog,
} from '@/lib/mqtt';
import type { SystemStatus, ActivityLog } from '@/lib/types';

type MqttContextValue = {
  configured: boolean;
  connected: boolean;
  deviceId: string | null;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => void;
};

const MqttContext = createContext<MqttContextValue | null>(null);

function getInitialDeviceId(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('plts-mqtt-device-id');
  }
  return null;
}

export function MqttProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceIdState] = useState<string | null>(getInitialDeviceId);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsubOnline = onOnlineChange((online) => setConnected(online));
    return () => {
      unsubOnline();
      disconnectMqtt();
    };
  }, []);

  const connect = useCallback(async (id: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('plts-mqtt-device-id', id);
    }
    setDeviceIdState(id);
    await connectMqtt(id);
    setConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    disconnectMqtt();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('plts-mqtt-device-id');
    }
    setDeviceIdState(null);
    setConnected(false);
  }, []);

  return (
    <MqttContext.Provider value={{
      configured: !!deviceId,
      connected,
      deviceId,
      connect,
      disconnect,
    }}>
      {children}
    </MqttContext.Provider>
  );
}

export function useMqtt() {
  const ctx = useContext(MqttContext);
  if (!ctx) throw new Error('useMqtt must be used within MqttProvider');
  return ctx;
}

// Hook for real-time status updates via MQTT
export function useMqttStatus(): SystemStatus | null {
  const { connected } = useMqtt();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    if (!connected) return;
    const unsub = onStatusChange((s) => setStatus(s));
    return unsub;
  }, [connected]);

  return connected ? status : null;
}

// Hook for real-time log stream via MQTT
export function useMqttLogs(maxLogs = 200): ActivityLog[] {
  const { connected } = useMqtt();
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!connected) return;
    const unsub = onLog((log) => {
      setLogs((prev) => [log, ...prev].slice(0, maxLogs));
    });
    return unsub;
  }, [connected, maxLogs]);

  return connected ? logs : [];
}
