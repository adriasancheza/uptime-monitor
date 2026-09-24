/** A single monitor definition loaded from monitors.yml. */
export interface MonitorConfig {
  name: string;
  url: string;
  method: string;
  expectedStatus: number;
  timeoutMs: number;
  keyword?: string;
}

/** Raw shape monitors.yml is parsed into, before defaults are applied. */
export interface RawMonitorConfig {
  name: string;
  url: string;
  method?: string;
  expectedStatus?: number;
  timeoutMs?: number;
  keyword?: string;
}

/** Result of TLS certificate inspection for an HTTPS URL. */
export interface TlsInfo {
  daysToExpiry: number | null;
  validTo: string | null;
}

/** Outcome of checking a single monitor once. */
export interface CheckResult {
  name: string;
  url: string;
  timestamp: string;
  ok: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  tls: TlsInfo | null;
}

/** One day of aggregated history for a single monitor. */
export interface DailyAggregate {
  date: string; // YYYY-MM-DD (UTC)
  totalChecks: number;
  successfulChecks: number;
  uptimePercent: number;
  averageLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  lastStatusCode: number | null;
  lastCheckedAt: string | null;
  lastTlsDaysToExpiry: number | null;
  incidents: number;
}

/** Persisted state machine data for incident detection per monitor. */
export interface IncidentState {
  consecutiveFailures: number;
  isDown: boolean;
  issueNumber: number | null;
  downSince: string | null;
}

/** Full history file persisted per monitor on the status-data branch. */
export interface MonitorHistory {
  name: string;
  url: string;
  days: DailyAggregate[];
  incidentState: IncidentState;
  lastResult: CheckResult | null;
}

/** Top-level index summarizing all monitors, used to render the site quickly. */
export interface StatusIndex {
  generatedAt: string;
  monitors: MonitorSummary[];
}

export interface MonitorSummary {
  name: string;
  url: string;
  overallOk: boolean;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  uptime90d: number | null;
  averageLatencyMs: number | null;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastTlsDaysToExpiry: number | null;
  days: DailyAggregate[];
}
