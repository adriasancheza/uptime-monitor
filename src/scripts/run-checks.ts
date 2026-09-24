import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkMonitor } from '../checker/check.js';
import { loadMonitors } from '../checker/config.js';
import type { MonitorHistory } from '../checker/types.js';
import { dateKey, incrementIncidentCount, recordResult } from '../aggregate/aggregate.js';
import { INITIAL_INCIDENT_STATE, transitionIncidentState } from '../aggregate/incidents.js';
import { slugify } from '../aggregate/slug.js';
import { closeIncidentIssue, getGithubEnv, openIncidentIssue } from './github-issues.js';
import { notifyWebhooks } from './notify.js';

const DATA_DIR = process.env.DATA_DIR ?? 'data';

async function loadHistory(slug: string, name: string, url: string): Promise<MonitorHistory> {
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as MonitorHistory;
  } catch {
    return { name, url, days: [], incidentState: INITIAL_INCIDENT_STATE, lastResult: null };
  }
}

async function saveHistory(slug: string, history: MonitorHistory): Promise<void> {
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(history, null, 2) + '\n', 'utf-8');
}

export async function runChecks(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const monitors = await loadMonitors();
  const githubEnv = getGithubEnv();

  for (const monitor of monitors) {
    const slug = slugify(monitor.name);
    const history = await loadHistory(slug, monitor.name, monitor.url);

    const result = await checkMonitor(monitor);
    console.log(
      `[${result.ok ? 'UP  ' : 'DOWN'}] ${monitor.name} (${monitor.url}) - status=${result.statusCode ?? 'n/a'} time=${result.responseTimeMs}ms${result.error ? ` error="${result.error}"` : ''}`,
    );

    let updated = recordResult(history, result);
    const { state: nextIncidentState, action } = transitionIncidentState(updated.incidentState, result);

    if (action.type === 'open') {
      updated = { ...updated, days: incrementIncidentCount(updated.days, dateKey(result.timestamp)) };
      const body = [
        `**${monitor.name}** started failing checks at ${action.downSince}.`,
        '',
        `- URL: ${monitor.url}`,
        `- Last status code: ${result.statusCode ?? 'n/a'}`,
        `- Error: ${result.error ?? 'n/a'}`,
        '',
        '_This issue was opened automatically by uptime-monitor._',
      ].join('\n');

      let issueNumber: number | null = null;
      if (githubEnv) {
        issueNumber = await openIncidentIssue(githubEnv, monitor.name, body);
      } else {
        console.warn('GITHUB_TOKEN/GITHUB_REPOSITORY not set; skipping issue creation.');
      }
      nextIncidentState.issueNumber = issueNumber;
      await notifyWebhooks(
        `🔴 **${monitor.name}** is DOWN (${monitor.url}) - ${result.error ?? `status ${result.statusCode}`}`,
      );
    } else if (action.type === 'recover') {
      const downSince = action.downSince ?? 'an earlier check';
      const comment = `✅ **${monitor.name}** recovered at ${result.timestamp} (was down since ${downSince}).`;
      if (githubEnv && history.incidentState.issueNumber != null) {
        await closeIncidentIssue(githubEnv, history.incidentState.issueNumber, comment);
      }
      await notifyWebhooks(`🟢 **${monitor.name}** recovered (${monitor.url}).`);
    }

    updated = { ...updated, incidentState: nextIncidentState };
    await saveHistory(slug, updated);
  }
}

runChecks().catch((err) => {
  console.error('Fatal error running checks:', err);
  process.exitCode = 1;
});
