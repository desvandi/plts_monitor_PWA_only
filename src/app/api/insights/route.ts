import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getInsights } from '@/lib/mockStore';
import { ok, unauthorized } from '@/lib/apiResponse';

export const runtime = 'nodejs';

// GET /api/insights — proxy placeholder for AI insights.
// In production, the ESP32 firmware proxies this to GAS → Gemini via HMAC.
// In mock mode, returns mock insights for development.
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return unauthorized(auth.message);
  // req is used to satisfy the route signature; no query params consumed.
  void req;
  const result = getInsights();
  return ok(
    {
      success: true,
      insights: result.insights,
      cached: false,
      mock: result.mock,
    },
    result.mock ? 'Mock insights (device unreachable)' : 'AI insights fetched',
  );
}
