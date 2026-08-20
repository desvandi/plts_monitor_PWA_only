// =============================================================================
// AI Insights — advisory only (brief §94-95).
// -----------------------------------------------------------------------------
// PWA fetches from ESP32's authenticated /api/insights endpoint (HMAC proxy to
// GAS → Gemini). The PWA NEVER calls GAS directly. Mock fallback is used when
// the ESP32 is unreachable or returns an error.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { AiInsight } from "./types";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useAiInsights(deviceId: string | null) {
  return useQuery({
    queryKey: ["ai-insights", deviceId],
    queryFn: async (): Promise<AiInsight[]> => {
      if (!deviceId) {
        return getMockInsights();
      }
      try {
        const envelope = await api.insights();
        const insights = envelope.insights ?? [];
        return insights.filter((ins) => isValidInsight(ins));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return getMockInsights();
        }
        console.warn("[aiInsights] fetch failed, falling back to mock:", err);
        return getMockInsights();
      }
    },
    enabled: !!deviceId,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
  });
}

const ALLOWED_CATEGORIES = [
  "battery_analysis",
  "energy_analysis",
  "energy_anomaly",
  "maintenance_suggestion",
  "environment_alert",
] as const;
const ALLOWED_SEVERITIES = ["info", "warning", "critical"] as const;

function isValidInsight(ins: unknown): ins is AiInsight {
  if (!ins || typeof ins !== "object") return false;
  const i = ins as Record<string, unknown>;
  if (typeof i.id !== "string" || !i.id) return false;
  if (
    typeof i.category !== "string" ||
    !(ALLOWED_CATEGORIES as readonly string[]).includes(i.category)
  )
    return false;
  if (
    typeof i.severity !== "string" ||
    !(ALLOWED_SEVERITIES as readonly string[]).includes(i.severity)
  )
    return false;
  if (typeof i.title !== "string" || !i.title) return false;
  if (typeof i.body !== "string" || !i.body) return false;
  if (typeof i.generatedAt !== "number") return false;
  if (typeof i.source !== "string" || !["gemini", "mock"].includes(i.source)) return false;
  if (i.advisoryOnly !== true) return false; // brief §94-95: ALWAYS advisory
  return true;
}

function getMockInsights(): AiInsight[] {
  return [
    {
      id: "mock-battery-1",
      category: "battery_analysis",
      severity: "info",
      title: "Waiting for AI insights",
      body: "Once the ESP32 begins posting telemetry to Google Apps Script, Gemini will analyze battery state and recommend maintenance windows.",
      generatedAt: Date.now(),
      source: "mock",
      advisoryOnly: true,
    },
    {
      id: "mock-energy-1",
      category: "energy_analysis",
      severity: "info",
      title: "Energy pattern analysis pending",
      body: "Daily charge/discharge cycles and EFC trend will be analyzed to surface degradation patterns and propose schedule optimization.",
      generatedAt: Date.now(),
      source: "mock",
      advisoryOnly: true,
    },
  ];
}
