'use client';
import { useConfig } from '@/hooks/useApi';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function SettingsView() {
  const { data } = useConfig();
  const config = (data as any)?.data || data || {};

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Settings</h2>
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Device Configuration</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Device Name</Label><Input defaultValue={config.deviceName} /></div>
          <div><Label>Site Name</Label><Input defaultValue={config.siteName} /></div>
          <div><Label>Timezone</Label><Input defaultValue={config.timezone || 'Asia/Jakarta'} /></div>
          <div><Label>Battery Capacity (Ah)</Label><Input type="number" defaultValue={config.batteryCapacityAh || 200} /></div>
          <div><Label>Full Voltage</Label><Input type="number" defaultValue={config.fullVoltage || 54.0} /></div>
          <div><Label>Low Voltage</Label><Input type="number" defaultValue={config.lowVoltage || 45.0} /></div>
        </div>
        <Button>Save Configuration</Button>
      </Card>
    </div>
  );
}
