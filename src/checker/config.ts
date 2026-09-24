import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { MonitorConfig, RawMonitorConfig } from './types.js';

const DEFAULT_METHOD = 'GET';
const DEFAULT_EXPECTED_STATUS = 200;
const DEFAULT_TIMEOUT_MS = 10_000;

export function applyDefaults(raw: RawMonitorConfig): MonitorConfig {
  if (!raw.name || !raw.url) {
    throw new Error(`Invalid monitor entry: ${JSON.stringify(raw)} (name and url are required)`);
  }
  return {
    name: raw.name,
    url: raw.url,
    method: raw.method ?? DEFAULT_METHOD,
    expectedStatus: raw.expectedStatus ?? DEFAULT_EXPECTED_STATUS,
    timeoutMs: raw.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    keyword: raw.keyword,
  };
}

export function parseMonitorsYaml(content: string): MonitorConfig[] {
  const parsed = parse(content) as { monitors?: RawMonitorConfig[] } | null;
  const monitors = parsed?.monitors ?? [];
  if (!Array.isArray(monitors) || monitors.length === 0) {
    throw new Error('monitors.yml must define a non-empty "monitors" array');
  }
  return monitors.map(applyDefaults);
}

export async function loadMonitors(path = 'monitors.yml'): Promise<MonitorConfig[]> {
  const content = await readFile(path, 'utf-8');
  return parseMonitorsYaml(content);
}
