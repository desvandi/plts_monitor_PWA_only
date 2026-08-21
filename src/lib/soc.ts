// =============================================================================
// SOC state machine display helpers (brief §17-19, §58).
// -----------------------------------------------------------------------------
// SOC is ALWAYS ESTIMATED unless synchronized at full-charge (brief §17).
// `confidence` degrades over time since last sync (BASELINE_AGING).
// =============================================================================

import type { SocState } from "./types";

export type SocDisplay = {
  label: string;                       // "Synchronized" | "Estimated (Coulomb Counting)" | etc.
  badgeColor: string;                  // Tailwind classes (text + bg)
  qualityLabel: string;                // "VALID" | "ESTIMATED" | etc.
  sourceLabel: string;                 // "Coulomb Counting" | "Voltage Sync" | "Full Charge Detected"
  confidenceLabel: string;             // "High" | "Medium" | "Low" | "Baseline Aging"
  confidenceColor: string;             // Tailwind text color
  lastSyncLabel: string | null;        // formatted "last synced Xs ago"
};

export function describeSoc(soc: SocState, now: number = Date.now()): SocDisplay {
  const sourceLabels: Record<SocState["source"], string> = {
    COULOMB_COUNTING: "Coulomb Counting",
    VOLTAGE_SYNC: "Voltage Sync",
    FULL_CHARGE_DETECTED: "Full Charge Detected",
  };
  const confidenceLabels: Record<SocState["confidence"], { label: string; color: string }> = {
    HIGH: { label: "High", color: "text-status-on" },
    MEDIUM: { label: "Medium", color: "text-status-info" },
    LOW: { label: "Low", color: "text-status-warn" },
    BASELINE_AGING: { label: "Baseline Aging", color: "text-status-error" },
  };
  const conf = confidenceLabels[soc.confidence];

  if (soc.method === "SYNCHRONIZED") {
    return {
      label: "Synchronized",
      badgeColor: "border-status-on/30 text-status-on",
      qualityLabel: "VALID",
      sourceLabel: sourceLabels[soc.source],
      confidenceLabel: conf.label,
      confidenceColor: conf.color,
      lastSyncLabel: soc.lastSync ? formatLastSync(soc.lastSync, now) : null,
    };
  }
  return {
    label: `Estimated (${sourceLabels[soc.source]})`,
    badgeColor: "border-status-warn/30 text-status-warn",
    qualityLabel: "ESTIMATED",
    sourceLabel: sourceLabels[soc.source],
    confidenceLabel: conf.label,
    confidenceColor: conf.color,
    lastSyncLabel: soc.lastSync ? formatLastSync(soc.lastSync, now) : "Never",
  };
}

function formatLastSync(syncMs: number, now: number): string {
  const diff = now - syncMs;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Estimate confidence from last sync age (used by mock only — firmware computes
// this directly from internal state).
export function estimateConfidenceFromAge(lastSyncMs: number | null): SocState["confidence"] {
  if (lastSyncMs == null) return "LOW";
  const daysSince = (Date.now() - lastSyncMs) / 86_400_000;
  if (daysSince < 1) return "HIGH";
  if (daysSince < 7) return "MEDIUM";
  if (daysSince < 30) return "LOW";
  return "BASELINE_AGING";
}
