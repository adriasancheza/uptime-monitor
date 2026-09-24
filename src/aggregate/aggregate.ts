import type { CheckResult, DailyAggregate, MonitorHistory } from '../checker/types.js';

export const RETENTION_DAYS = 90;

/** Returns the UTC calendar date (YYYY-MM-DD) for an ISO timestamp. */
export function dateKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/**
 * Folds a single check result into a monitor's history: updates (or creates)
 * today's daily aggregate and records the raw last-check snapshot.
 */
export function recordResult(history: MonitorHistory, result: CheckResult): MonitorHistory {
  const key = dateKey(result.timestamp);
  const days = [...history.days];
  const idx = days.findIndex((d) => d.date === key);
  const existing = idx >= 0 ? days[idx] : undefined;

  const totalChecks = (existing?.totalChecks ?? 0) + 1;
  const successfulChecks = (existing?.successfulChecks ?? 0) + (result.ok ? 1 : 0);

  // Reconstruct the running sum from the stored average (existing.totalChecks
  // samples) and fold in this result, so we never need to store raw samples.
  const priorSum = existing?.averageLatencyMs != null ? existing.averageLatencyMs * (existing.totalChecks ?? 0) : 0;
  const priorCount = existing?.averageLatencyMs != null ? (existing.totalChecks ?? 0) : 0;
  const sumLatency = priorSum + (result.responseTimeMs ?? 0);
  const countLatency = priorCount + (result.responseTimeMs != null ? 1 : 0);
  const averageLatencyMs = countLatency > 0 ? Math.round(sumLatency / countLatency) : null;

  const minLatencyMs =
    result.responseTimeMs != null
      ? Math.min(existing?.minLatencyMs ?? Infinity, result.responseTimeMs)
      : (existing?.minLatencyMs ?? null);
  const maxLatencyMs =
    result.responseTimeMs != null
      ? Math.max(existing?.maxLatencyMs ?? -Infinity, result.responseTimeMs)
      : (existing?.maxLatencyMs ?? null);

  const updated: DailyAggregate = {
    date: key,
    totalChecks,
    successfulChecks,
    uptimePercent: totalChecks > 0 ? Math.round((successfulChecks / totalChecks) * 10000) / 100 : 0,
    averageLatencyMs,
    minLatencyMs: minLatencyMs === Infinity ? null : minLatencyMs,
    maxLatencyMs: maxLatencyMs === -Infinity ? null : maxLatencyMs,
    lastStatusCode: result.statusCode,
    lastCheckedAt: result.timestamp,
    lastTlsDaysToExpiry: result.tls?.daysToExpiry ?? existing?.lastTlsDaysToExpiry ?? null,
    incidents: existing?.incidents ?? 0,
  };

  if (idx >= 0) {
    days[idx] = updated;
  } else {
    days.push(updated);
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...history,
    days: applyRetention(days),
    lastResult: result,
  };
}

/** Marks today's aggregate as having recorded a new incident (down transition). */
export function incrementIncidentCount(days: DailyAggregate[], date: string): DailyAggregate[] {
  return days.map((d) => (d.date === date ? { ...d, incidents: d.incidents + 1 } : d));
}

/** Drops daily aggregates older than the retention window. */
export function applyRetention(days: DailyAggregate[], retentionDays = RETENTION_DAYS): DailyAggregate[] {
  if (days.length <= retentionDays) return days;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(sorted.length - retentionDays);
}

/** Computes uptime percentage across the trailing N days of aggregates (from the most recent day back). */
export function uptimeForWindow(days: DailyAggregate[], windowDays: number): number | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const window = sorted.slice(-windowDays);
  const totalChecks = window.reduce((sum, d) => sum + d.totalChecks, 0);
  if (totalChecks === 0) return null;
  const successfulChecks = window.reduce((sum, d) => sum + d.successfulChecks, 0);
  return Math.round((successfulChecks / totalChecks) * 10000) / 100;
}

/** Computes the average latency across the trailing N days of aggregates. */
export function averageLatencyForWindow(days: DailyAggregate[], windowDays: number): number | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const window = sorted.slice(-windowDays).filter((d) => d.averageLatencyMs != null && d.totalChecks > 0);
  if (window.length === 0) return null;
  const totalChecks = window.reduce((sum, d) => sum + d.totalChecks, 0);
  const weightedSum = window.reduce((sum, d) => sum + (d.averageLatencyMs ?? 0) * d.totalChecks, 0);
  return totalChecks > 0 ? Math.round(weightedSum / totalChecks) : null;
}
