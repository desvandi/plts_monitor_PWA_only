'use client';
import { useAlarms, useAckAlarm } from '@/hooks/useApi';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export function AlarmCenter() {
  const { data: alarmData, isLoading } = useAlarms();
  const ackMutation = useAckAlarm();

  if (isLoading) return <div className="p-4">Loading alarms...</div>;
  const alarms = (alarmData as any)?.data || (alarmData as any) || [];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Alarm Center</h2>
      <div className="grid gap-3">
        {!alarms || alarms.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            No active alarms
          </Card>
        ) : (
          alarms.map((alarm: any, i: number) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-5 h-5 ${alarm.severity === 'CRITICAL' ? 'text-red-500' : alarm.severity === 'WARNING' ? 'text-yellow-500' : 'text-blue-500'}`} />
                  <div>
                    <div className="font-semibold">{alarm.code}</div>
                    <div className="text-sm text-muted-foreground">{alarm.message}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={alarm.severity === 'CRITICAL' ? 'destructive' : 'secondary'}>{alarm.severity}</Badge>
                  {alarm.lifecycle === 'ACTIVE' && (
                    <Button size="sm" variant="outline" onClick={() => ackMutation.mutate(alarm.code)}>ACK</Button>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
