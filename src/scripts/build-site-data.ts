import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MonitorHistory, MonitorSummary, StatusIndex } from '../checker/types.js';
import { averageLatencyForWindow, uptimeForWindow } from '../aggregate/aggregate.js';

const DATA_DIR = process.env.DATA_DIR ?? 'data';
const OUT_DIR = path.join('public', 'data');

function summarize(history: MonitorHistory): MonitorSummary {
  const lastDay = history.days.at(-1);
  return {
    name: history.name,
    url: history.url,
    overallOk: !history.incidentState.isDown,
    uptime24h: uptimeForWindow(history.days, 1),
    uptime7d: uptimeForWindow(history.days, 7),
    uptime30d: uptimeForWindow(history.days, 30),
    uptime90d: uptimeForWindow(history.days, 90),
    averageLatencyMs: averageLatencyForWindow(history.days, 30),
    lastCheckedAt: history.lastResult?.timestamp ?? lastDay?.lastCheckedAt ?? null,
    lastStatusCode: history.lastResult?.statusCode ?? lastDay?.lastStatusCode ?? null,
    lastTlsDaysToExpiry: history.lastResult?.tls?.daysToExpiry ?? lastDay?.lastTlsDaysToExpiry ?? null,
    days: history.days,
  };
}

export async function buildSiteData(): Promise<StatusIndex> {
  await mkdir(OUT_DIR, { recursive: true });

  let files: string[] = [];
  try {
    files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }

  const monitors: MonitorSummary[] = [];
  for (const file of files.sort()) {
    const raw = await readFile(path.join(DATA_DIR, file), 'utf-8');
    const history = JSON.parse(raw) as MonitorHistory;
    monitors.push(summarize(history));
  }

  const index: StatusIndex = { generatedAt: new Date().toISOString(), monitors };
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf-8');
  return index;
}

buildSiteData()
  .then((index) => {
    console.log(`Wrote status data for ${index.monitors.length} monitor(s) to ${path.join(OUT_DIR, 'index.json')}`);
  })
  .catch((err) => {
    console.error('Failed to build site data:', err);
    process.exitCode = 1;
  });
