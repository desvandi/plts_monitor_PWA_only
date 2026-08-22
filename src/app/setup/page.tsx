'use client';

import { useState, useMemo, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Zap, Upload, Save, Timer, KeyRound, Link as LinkIcon, Cpu, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  DEFAULT_DASHBOARD_SETTINGS,
  HandshakeResult,
  PltsSysConfig,
  pingGasEndpoint,
  validateSysConfig,
} from '@/lib/sysConfig';
import { useSysConfig } from '@/components/providers/sys-config-provider';
import { QrScannerButton } from '@/components/setup/qr-scanner-button';

type HandshakeStatus = 'idle' | 'testing' | 'success' | 'failed';

function SetupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAddMode = searchParams.get('mode') === 'add-device';
  const { config, save, addDevice } = useSysConfig();

  // In add-device mode we start from blank so the user configures a NEW device.
  const source = isAddMode ? null : config;

  const [gasUrl, setGasUrl] = useState(source?.gas_webapp_url ?? '');
  const [authToken, setAuthToken] = useState(source?.auth_token ?? '');
  const [deviceId, setDeviceId] = useState(source?.device_id ?? 'PLTS_MONITOR_01');
  const [label, setLabel] = useState(
    source?.devices.find((d) => d.device_id === source?.active_device_id)?.label ?? ''
  );
  const [refreshSec, setRefreshSec] = useState(
    source?.dashboard_settings.telemetry_refresh_interval_sec ?? DEFAULT_DASHBOARD_SETTINGS.telemetry_refresh_interval_sec
  );
  const [nominalV, setNominalV] = useState(
    source?.dashboard_settings.battery_nominal_voltage ?? DEFAULT_DASHBOARD_SETTINGS.battery_nominal_voltage
  );
  const [capacityAh, setCapacityAh] = useState(
    source?.dashboard_settings.battery_capacity_ah ?? DEFAULT_DASHBOARD_SETTINGS.battery_capacity_ah
  );
  const [lowV, setLowV] = useState(
    config?.dashboard_settings.low_battery_warning_threshold ?? DEFAULT_DASHBOARD_SETTINGS.low_battery_warning_threshold
  );
  const [audio, setAudio] = useState(
    config?.dashboard_settings.enable_audio_alarm ?? DEFAULT_DASHBOARD_SETTINGS.enable_audio_alarm
  );

  const [handshakeStatus, setHandshakeStatus] = useState<HandshakeStatus>('idle');
  const [handshake, setHandshake] = useState<HandshakeResult | null>(null);

  const handshakeStale = handshakeStatus !== 'success';

  const formValid = useMemo(
    () =>
      gasUrl.trim().startsWith('http') &&
      authToken.trim().length > 0 &&
      deviceId.trim().length > 0 &&
      refreshSec >= 1,
    [gasUrl, authToken, deviceId, refreshSec]
  );

  const runHandshake = useCallback(async () => {
    if (!formValid) {
      toast.error('Lengkapi URL GAS, token, dan device ID terlebih dahulu.');
      return;
    }
    setHandshakeStatus('testing');
    setHandshake(null);
    const result = await pingGasEndpoint(gasUrl.trim(), authToken.trim(), 7000);
    setHandshake(result);
    setHandshakeStatus(result.ok ? 'success' : 'failed');
    if (result.ok) {
      toast.success('Handshake sukses! Anda dapat menyimpan konfigurasi.');
    } else {
      toast.error(`Handshake gagal: ${result.message}`);
    }
  }, [gasUrl, authToken, deviceId, formValid, refreshSec]);

  const persist = useCallback(() => {
    if (!formValid || handshakeStatus !== 'success') return;
    const dashboard = {
      telemetry_refresh_interval_sec: refreshSec,
      battery_nominal_voltage: nominalV,
      battery_capacity_ah: capacityAh,
      low_battery_warning_threshold: lowV,
      enable_audio_alarm: audio,
      theme: DEFAULT_DASHBOARD_SETTINGS.theme,
    };
    if (isAddMode && config) {
      addDevice({
        device_id: deviceId.trim(),
        label: label.trim() || deviceId.trim(),
        gas_webapp_url: gasUrl.trim(),
        auth_token: authToken.trim(),
        dashboard_settings: dashboard,
      });
      toast.success(`Perangkat ${deviceId.trim()} ditambahkan & di-set aktif.`);
    } else {
      save({
        gas_webapp_url: gasUrl.trim(),
        auth_token: authToken.trim(),
        device_id: deviceId.trim(),
        label: label.trim() || deviceId.trim(),
        dashboard_settings: dashboard,
      });
      toast.success('Konfigurasi tersimpan di browser Anda.');
    }
    router.replace('/');
  }, [
    formValid,
    handshakeStatus,
    gasUrl,
    authToken,
    deviceId,
    label,
    refreshSec,
    nominalV,
    capacityAh,
    lowV,
    audio,
    save,
    addDevice,
    router,
    isAddMode,
    config,
  ]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const validated = validateSysConfig(parsed);
        if (!validated) {
          toast.error('File konfigurasi tidak valid.');
          return;
        }
        const restored: PltsSysConfig = validated;
        setGasUrl(restored.gas_webapp_url);
        setAuthToken(restored.auth_token);
        setDeviceId(restored.device_id);
        const activeProfile = restored.devices.find((d) => d.device_id === restored.active_device_id);
        setLabel(activeProfile?.label ?? restored.device_id);
        setRefreshSec(restored.dashboard_settings.telemetry_refresh_interval_sec);
        setNominalV(restored.dashboard_settings.battery_nominal_voltage);
        setCapacityAh(restored.dashboard_settings.battery_capacity_ah);
        setLowV(restored.dashboard_settings.low_battery_warning_threshold);
        setAudio(restored.dashboard_settings.enable_audio_alarm);
        setHandshakeStatus('idle');
        setHandshake(null);
        toast.success('Konfigurasi berhasil di-restore. Silakan uji handshake lalu simpan.');
      } catch {
        toast.error('Gagal membaca file konfigurasi.');
      }
    },
    []
  );

  /** Decode a QR text — accepts either `#plts=<b64>` URL or raw JSON payload. */
  const handleQrPayload = useCallback((raw: string) => {
    try {
      let jsonText = raw.trim();
      const hashMatch = jsonText.match(/#plts=([^&]+)/);
      if (hashMatch) {
        jsonText = decodeURIComponent(escape(window.atob(hashMatch[1])));
      } else if (/^[A-Za-z0-9+/=]+$/.test(jsonText) && jsonText.length > 40) {
        try {
          jsonText = decodeURIComponent(escape(window.atob(jsonText)));
        } catch {
          /* keep as-is */
        }
      }
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      if (typeof parsed.gas_url === 'string') setGasUrl(parsed.gas_url);
      if (typeof parsed.auth_token === 'string') setAuthToken(parsed.auth_token);
      if (typeof parsed.device_key === 'string') setDeviceId(parsed.device_key);
      if (typeof parsed.label === 'string') setLabel(parsed.label);
      if (typeof parsed.telemetry_interval_sec === 'number') setRefreshSec(parsed.telemetry_interval_sec);
      // Both new (i_calib_dc/i_calib_ac) and legacy (i_calib) keys silently
      // ignored here — Fleet-side calibration is stored elsewhere.
      setHandshakeStatus('idle');
      setHandshake(null);
    } catch {
      toast.error('QR tidak valid — payload harus JSON PLTS onboarding.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Zap className="w-6 h-6" />
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="setup-title">
              {isAddMode ? 'Tambah Perangkat Baru' : 'Setup Awal PLTS Monitor'}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAddMode
              ? 'Perangkat baru akan disimpan di daftar dan otomatis dijadikan perangkat aktif.'
              : 'Aplikasi ini bersifat stateless: seluruh kredensial Anda disimpan lokal di browser (localStorage) — tidak pernah dikirim ke server pihak ketiga selain Google Apps Script yang Anda daftarkan sendiri.'}
          </p>
        </header>

        <Card data-testid="setup-connection-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> 1. Google Apps Script Endpoint
            </CardTitle>
            <CardDescription>
              Tempel URL Web App hasil deploy Apps Script Anda beserta token otentikasi dari tab <code>Config</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="gas-url">GAS Web App URL</Label>
              <Input
                id="gas-url"
                data-testid="setup-input-gas-url"
                type="url"
                autoComplete="off"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={gasUrl}
                onChange={(e) => {
                  setGasUrl(e.target.value);
                  setHandshakeStatus('idle');
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-token" className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Auth Token
              </Label>
              <Input
                id="auth-token"
                data-testid="setup-input-token"
                type="password"
                autoComplete="off"
                placeholder="plts_sec_88x99y77z66a55b44"
                value={authToken}
                onChange={(e) => {
                  setAuthToken(e.target.value);
                  setHandshakeStatus('idle');
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="device-id" className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Device ID
              </Label>
              <Input
                id="device-id"
                data-testid="setup-input-device-id"
                placeholder="PLTS_MONITOR_01"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="device-label" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Label Perangkat
              </Label>
              <Input
                id="device-label"
                data-testid="setup-input-label"
                placeholder="Basecamp Tebo, Site A, dst."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Scan QR Onboarding</p>
                <p className="text-xs text-muted-foreground">
                  Arahkan kamera ke QR yang di-print dari PWA lain — form akan terisi otomatis.
                </p>
              </div>
              <QrScannerButton
                onDetected={handleQrPayload}
                label="Buka Kamera"
                data-testid="setup-qr-scan"
              />
            </div>

            <Separator />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Live Connection Test (PING/PONG)</p>
                <p className="text-xs text-muted-foreground">
                  Handshake wajib sukses sebelum tombol Simpan dapat aktif (§2.4).
                </p>
              </div>
              <Button
                onClick={runHandshake}
                disabled={!formValid || handshakeStatus === 'testing'}
                data-testid="setup-test-handshake"
                variant="secondary"
              >
                {handshakeStatus === 'testing' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengetes...
                  </>
                ) : (
                  <>
                    <Timer className="w-4 h-4 mr-2" /> Test Handshake
                  </>
                )}
              </Button>
            </div>

            {handshake && (
              <Alert
                variant={handshake.ok ? 'default' : 'destructive'}
                data-testid={handshake.ok ? 'handshake-alert-success' : 'handshake-alert-error'}
                className={handshake.ok ? 'border-emerald-500/40' : ''}
              >
                {handshake.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                <AlertTitle>
                  {handshake.ok ? 'Handshake Sukses' : 'Handshake Gagal'}
                  {handshake.latency_ms != null && (
                    <span className="ml-2 text-xs text-muted-foreground">({handshake.latency_ms} ms)</span>
                  )}
                </AlertTitle>
                <AlertDescription>{handshake.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Preferensi Dashboard</CardTitle>
            <CardDescription>Preferensi visual dan alarm sistem monitoring.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="refresh-sec">Refresh Telemetri (detik)</Label>
              <Input
                id="refresh-sec"
                type="number"
                min={1}
                max={300}
                value={refreshSec}
                data-testid="setup-input-refresh"
                onChange={(e) => setRefreshSec(Number(e.target.value) || 5)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nominal-v">Tegangan Nominal Baterai (V)</Label>
              <Input
                id="nominal-v"
                type="number"
                step={0.1}
                value={nominalV}
                onChange={(e) => setNominalV(Number(e.target.value) || 24)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity-ah">Kapasitas (Ah)</Label>
              <Input
                id="capacity-ah"
                type="number"
                value={capacityAh}
                onChange={(e) => setCapacityAh(Number(e.target.value) || 100)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="low-v">Threshold Low Battery (V)</Label>
              <Input
                id="low-v"
                type="number"
                step={0.1}
                value={lowV}
                onChange={(e) => setLowV(Number(e.target.value) || 22)}
              />
            </div>
            <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="audio-alarm" className="cursor-pointer">
                  Audio Alarm
                </Label>
                <p className="text-xs text-muted-foreground">Bunyikan alarm saat baterai kritis.</p>
              </div>
              <Switch id="audio-alarm" checked={audio} onCheckedChange={setAudio} data-testid="setup-switch-audio" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Import / Restore (Opsional)</CardTitle>
            <CardDescription>Muat file <code>plts_config_backup.json</code> yang pernah Anda ekspor.</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-3 cursor-pointer text-sm">
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 hover:bg-secondary/80 transition">
                <Upload className="w-4 h-4" /> Pilih file JSON
              </span>
              <span className="text-muted-foreground">Konfigurasi akan mengisi form namun tetap wajib melalui handshake.</span>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                data-testid="setup-input-import"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImport(file);
                  e.target.value = '';
                }}
              />
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-end">
          {handshakeStale && (
            <p className="text-xs text-amber-400 self-center" data-testid="setup-stale-warning">
              Handshake wajib sukses sebelum menyimpan.
            </p>
          )}
          <Button
            onClick={persist}
            disabled={!formValid || handshakeStatus !== 'success'}
            data-testid="setup-save-button"
            size="lg"
          >
            <Save className="w-4 h-4 mr-2" />
            {isAddMode ? 'Tambah Perangkat' : 'Simpan Konfigurasi & Buka Dashboard'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <SetupPageInner />
    </Suspense>
  );
}
