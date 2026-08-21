'use client';

// =============================================================================
// Battery View — V/I/P/Direction/SOC/Remaining Ah/Charge Ah/Discharge Ah/Net Ah/
// EFC/Estimated Usable Capacity/Peak Charge Current/Peak Discharge Current
// + Graphs (V/I/P/SOC, time ranges: 1h/6h/12h/24h/7d/30d)
// brief §54
// =============================================================================

import { useEffect, useState } from 'react';
import { useStatus } from '@/hooks/useApi';
import { useLanguage } from '@/components/providers/language-provider';
import { useUiStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Battery, BatteryCharging, BatteryWarning, Zap, Gauge, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  fmtV, fmtA, fmtW, fmtAh, fmtWh, fmtPct,
  formatRelativeTime,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { describeSoc } from '@/lib/soc';
import { MeasurementCard } from '@/components/dashboard/measurement-card';
import {
  VoltageChart, CurrentChart, PowerChart, SocChart, type ChartPoint,
} from '@/components/charts';
import { getRecentSamples, getRecentSamplesDays } from '@/lib/energyHistory';
import type { TranslationKey } from '@/lib/i18n';

const RANGES: { key: '1h' | '6h' | '12h' | '24h' | '7d' | '30d'; labelKey: TranslationKey; hours: number; days?: number }[] = [
  { key: '1h', labelKey: 'battery.time_range_1h', hours: 1 },
  { key: '6h', labelKey: 'battery.time_range_6h', hours: 6 },
  { key: '12h', labelKey: 'battery.time_range_12h', hours: 12 },
  { key: '24h', labelKey: 'battery.time_range_24h', hours: 24 },
  { key: '7d', labelKey: 'battery.time_range_7d', hours: 168, days: 7 },
  { key: '30d', labelKey: 'battery.time_range_30d', hours: 720, days: 30 },
];

export function BatteryView() {
  const { t, lang } = useLanguage();
  const { data: status, isLoading } = useStatus();
  const { chartTimeRange, setChartTimeRange } = useUiStore();
  const [voltageData, setVoltageData] = useState<ChartPoint[]>([]);
  const [currentData, setCurrentData] = useState<ChartPoint[]>([]);
  const [powerData, setPowerData] = useState<ChartPoint[]>([]);
  const [socData, setSocData] = useState<ChartPoint[]>([]);

  useEffect(() => {
    const refresh = () => {
      const r = RANGES.find((x) => x.key === chartTimeRange) ?? RANGES[0]!;
      const samples = r.days ? getRecentSamplesDays(r.days) : getRecentSamples(r.hours);
      setVoltageData(samples.map((s) => ({ ts: s.ts, value: s.battV })));
      setCurrentData(samples.map((s) => ({ ts: s.ts, value: s.battI })));
      setPowerData(samples.map((s) => ({ ts: s.ts, value: s.battP })));
      setSocData(samples.map((s) => ({ ts: s.ts, value: s.soc })));
    };
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [chartTimeRange]);

  if (isLoading || !status) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const b = status.battery;
  const socDisplay = describeSoc(b.soc);
  const directionInfo = {
    CHARGING: { label: t('battery.charging'), color: 'text-status-on', icon: TrendingUp },
    DISCHARGING: { label: t('battery.discharging'), color: 'text-status-warn', icon: TrendingDown },
    IDLE: { label: t('battery.idle'), color: 'text-muted-foreground', icon: Minus },
  }[b.direction];
  const DirIcon = directionInfo.icon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Battery className="w-6 h-6 text-primary" />
          {t('battery.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('battery.subtitle')}</p>
      </div>

      {/* Primary 4-measurement grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MeasurementCard label={t('battery.voltage')} measurement={b.voltage} icon={Battery} showFreshness />
        <MeasurementCard label={t('battery.current')} measurement={b.current} format="current" icon={Zap} />
        <MeasurementCard label={t('battery.power')} measurement={b.power} format="power" icon={Activity} />
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-lg bg-muted/50 p-1.5">
                <DirIcon className={cn('w-3.5 h-3.5', directionInfo.color)} />
              </div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {t('battery.direction')}
              </p>
            </div>
            <p className={cn('text-lg font-bold', directionInfo.color)}>{directionInfo.label}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Threshold: &lt;{status.config.idleCurrentThreshold}A = idle
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SOC card (prominent) */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              {t('battery.soc')}
            </span>
            <div className="flex gap-1">
              <Badge variant="outline" className={cn('text-[9px] px-1.5 h-4', socDisplay.badgeColor)}>
                {socDisplay.qualityLabel}
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-status-info/30 text-status-info">
                {socDisplay.sourceLabel}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <p className="text-4xl font-bold font-mono">{fmtPct(b.soc.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('battery.confidence')}:{' '}
                <span className={socDisplay.confidenceColor}>{socDisplay.confidenceLabel}</span>
                {' · '}
                {t('battery.last_sync')}: {socDisplay.lastSyncLabel ?? '—'}
              </p>
            </div>
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="relative h-6 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 transition-all',
                    b.direction === 'CHARGING' ? 'bg-status-on' : b.direction === 'DISCHARGING' ? 'bg-status-warn' : 'bg-muted-foreground',
                  )}
                  style={{ width: `${b.soc.value ?? 0}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-difference">
                  {fmtPct(b.soc.value)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charge / Discharge / Net Ah + EFC + Estimated Usable + Peak currents */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SimpleCard
          icon={BatteryCharging}
          label={t('battery.charge_ah')}
          value={fmtAh(b.chargeAh)}
          color="text-status-on"
        />
        <SimpleCard
          icon={BatteryWarning}
          label={t('battery.discharge_ah')}
          value={fmtAh(b.dischargeAh)}
          color="text-status-warn"
        />
        <SimpleCard
          icon={Activity}
          label={t('battery.net_ah')}
          value={fmtAh(b.netAh)}
          color={b.netAh >= 0 ? 'text-status-on' : 'text-status-warn'}
        />
        <SimpleCard
          icon={Gauge}
          label={t('battery.efc')}
          value={b.efc.toFixed(3)}
          color="text-muted-foreground"
        />
        <SimpleCard
          icon={Battery}
          label={t('battery.remaining_ah')}
          value={fmtAh(b.remainingAh)}
          color="text-status-info"
          badge="ESTIMATED"
        />
        <SimpleCard
          icon={Battery}
          label={t('battery.estimated_usable_capacity')}
          value={fmtAh(b.estimatedUsableCapacityAh)}
          color="text-muted-foreground"
        />
        <SimpleCard
          icon={TrendingUp}
          label={t('battery.peak_charge_current')}
          value={fmtA(b.peakChargeCurrent)}
          color="text-status-on"
        />
        <SimpleCard
          icon={TrendingDown}
          label={t('battery.peak_discharge_current')}
          value={fmtA(b.peakDischargeCurrent)}
          color="text-status-warn"
        />
      </div>

      {/* Energy totals */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Energy Counters</CardTitle>
          <CardDescription>
            Totals accumulated since last reset ({formatRelativeTime(status.timestamp, lang)})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SimpleCard icon={BatteryCharging} label={t('battery.charge_wh')} value={fmtWh(b.chargeWh)} color="text-status-on" />
            <SimpleCard icon={BatteryWarning} label={t('battery.discharge_wh')} value={fmtWh(b.dischargeWh)} color="text-status-warn" />
            <SimpleCard
              icon={Activity}
              label={t('battery.net_wh')}
              value={fmtWh(b.netWh)}
              color={b.netWh >= 0 ? 'text-status-on' : 'text-status-warn'}
            />
            <SimpleCard icon={Gauge} label="Round-trip η" value={`${((b.chargeWh / Math.max(b.dischargeWh, 1)) * 100).toFixed(1)}%`} color="text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Time range selector */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Historical Charts</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              variant={chartTimeRange === r.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartTimeRange(r.key)}
            >
              {t(r.labelKey)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VoltageChart data={voltageData} />
          <CurrentChart data={currentData} />
          <PowerChart data={powerData} />
          <SocChart data={socData} />
        </div>
      </div>
    </div>
  );
}

function SimpleCard({
  icon: Icon,
  label,
  value,
  color,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color?: string;
  badge?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="rounded-lg bg-muted/50 p-1.5">
            <Icon className={cn('w-3 h-3', color ?? 'text-muted-foreground')} />
          </div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">
            {label}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
          {badge && (
            <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-status-warn/30 text-status-warn">
              {badge}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
