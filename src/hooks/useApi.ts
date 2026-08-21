'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.status(),
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: () => api.version(),
    staleTime: 60000,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.config(),
  });
}

export function useAlarms() {
  return useQuery({
    queryKey: ['alarms'],
    queryFn: () => api.alarms(),
    refetchInterval: 5000,
  });
}

export function useDiagnostics() {
  return useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => api.diagnostics(),
    refetchInterval: 10000,
  });
}

export function useCalibration() {
  return useQuery({
    queryKey: ['calibration'],
    queryFn: () => api.calibration(),
  });
}

export function useAiInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: () => api.insights(),
    refetchInterval: 300000,
  });
}

export function useReboot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.reboot(),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useAckAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alarmId: string) => api.acknowledgeAlarm(alarmId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alarms'] }),
  });
}
