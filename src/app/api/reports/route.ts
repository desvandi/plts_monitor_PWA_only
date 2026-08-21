import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDailyEnergy } from '@/lib/mockStore';
import { ok, unauthorized, fail } from '@/lib/apiResponse';
import { aggregateDaily } from '@/lib/reports';

export const runtime = 'nodejs';

// POST /api/reports — fetch aggregated daily energy records.
// Body: { range: 'daily'|'weekly'|'monthly'|'custom', from: ms, to: ms, format: 'csv'|'pdf'|'json' }
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return unauthorized(auth.message);
  let body: { range?: string; from?: number; to?: number; format?: string; requestId?: string };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body');
  }
  const { requestId: _requestId, range, from, to, format } = body;
  void _requestId;
  if (!range || !from || !to) return fail('range, from, to are required');
  if (!['daily', 'weekly', 'monthly', 'custom'].includes(range)) return fail('Invalid range');
  if (!['csv', 'pdf', 'json'].includes(format ?? 'json')) return fail('Invalid format');

  const allRecords = getDailyEnergy();
  const filtered = allRecords.filter((r) => {
    const rTs = new Date(r.date + 'T00:00:00Z').getTime();
    return rTs >= from && rTs <= to;
  });
  // Aggregate per day (if range is weekly/monthly, multiple records per day may exist).
  const records = aggregateDaily(filtered);
  return ok({ records, generatedAt: Date.now() }, `Report generated (${range}, ${records.length} records)`);
}
