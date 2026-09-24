import type { DailyAggregate, MonitorSummary, StatusIndex } from '../checker/types.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/index.json`;
const DISPLAY_DAYS = 90;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );
}

function formatPercent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function formatLatency(value: number | null): string {
  return value == null ? '—' : `${Math.round(value)} ms`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

function dayStatus(day: DailyAggregate | undefined): 'empty' | 'ok' | 'degraded' | 'down' {
  if (!day || day.totalChecks === 0) return 'empty';
  if (day.uptimePercent >= 99.9) return 'ok';
  if (day.uptimePercent > 0) return 'degraded';
  return 'down';
}

/** Builds the last `DISPLAY_DAYS` calendar days, filling gaps with empty ticks. */
function buildDayWindow(days: DailyAggregate[]): (DailyAggregate | undefined)[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: (DailyAggregate | undefined)[] = [];
  const today = new Date();
  for (let i = DISPLAY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key));
  }
  return out;
}

function renderUptimeBar(days: DailyAggregate[]): string {
  const window = buildDayWindow(days);
  const ticks = window
    .map((day, i) => {
      const status = dayStatus(day);
      const title = day
        ? `${day.date}: ${formatPercent(day.uptimePercent)} uptime (${day.successfulChecks}/${day.totalChecks} checks)`
        : `${window.length - i} day(s) ago: no data`;
      return `<span class="tick ${status}" title="${escapeHtml(title)}"></span>`;
    })
    .join('');
  return `<div class="uptime-bar" role="img" aria-label="90-day uptime history">${ticks}</div>`;
}

function renderSparkline(days: DailyAggregate[]): string {
  const points = days.filter((d) => d.averageLatencyMs != null).slice(-30);
  const width = 160;
  const height = 32;
  if (points.length < 2) {
    return `<span class="sparkline-caption">Not enough data yet for a latency trend.</span>`;
  }
  const latencies = points.map((d) => d.averageLatencyMs as number);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = latencies.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
        points="${coords.join(' ')}" />
    </svg>
    <span class="sparkline-caption">${formatLatency(min)} – ${formatLatency(max)} (30d)</span>
  `;
}

function tlsMetric(days: DailyAggregate | undefined): { value: string; className: string } {
  const lastDay = days;
  const expiry = lastDay?.lastTlsDaysToExpiry;
  if (expiry == null) return { value: '—', className: '' };
  if (expiry < 14) return { value: `${expiry} d`, className: 'down' };
  if (expiry < 30) return { value: `${expiry} d`, className: 'warn' };
  return { value: `${expiry} d`, className: '' };
}

function renderMonitorCard(monitor: MonitorSummary): string {
  const statusLabel = monitor.overallOk ? 'Operational' : 'Down';
  const statusClass = monitor.overallOk ? 'ok' : 'down';
  const lastDay = monitor.days.at(-1);
  const tls = tlsMetric(lastDay);

  return `
    <article class="monitor-card">
      <div class="monitor-card__head">
        <div class="monitor-card__title">
          ${escapeHtml(monitor.name)}
          <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>
        <a class="monitor-card__url" href="${escapeHtml(monitor.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(monitor.url)}</a>
      </div>

      <div class="metrics-row">
        <div class="metric">
          <span class="value">${formatPercent(monitor.uptime24h)}</span>
          <span class="label">24h uptime</span>
        </div>
        <div class="metric">
          <span class="value">${formatPercent(monitor.uptime7d)}</span>
          <span class="label">7d uptime</span>
        </div>
        <div class="metric">
          <span class="value">${formatPercent(monitor.uptime30d)}</span>
          <span class="label">30d uptime</span>
        </div>
        <div class="metric">
          <span class="value">${formatPercent(monitor.uptime90d)}</span>
          <span class="label">90d uptime</span>
        </div>
        <div class="metric">
          <span class="value">${formatLatency(monitor.averageLatencyMs)}</span>
          <span class="label">avg latency</span>
        </div>
        <div class="metric">
          <span class="value ${tls.className}">${tls.value}</span>
          <span class="label">TLS expiry</span>
        </div>
      </div>

      ${renderUptimeBar(monitor.days)}
      <div class="uptime-bar-caption">
        <span>90 days ago</span>
        <span>Today</span>
      </div>

      <div class="sparkline-row">
        ${renderSparkline(monitor.days)}
      </div>

      <div class="monitor-card__footer">
        Last checked ${formatRelativeTime(monitor.lastCheckedAt)}${monitor.lastStatusCode ? ` · HTTP ${monitor.lastStatusCode}` : ''}
      </div>
    </article>
  `;
}

function render(index: StatusIndex): string {
  const overallOk = index.monitors.every((m) => m.overallOk);
  const hasMonitors = index.monitors.length > 0;

  const banner = hasMonitors
    ? `<div class="banner ${overallOk ? 'ok' : 'down'}">
         <span class="dot"></span>
         ${overallOk ? 'All systems operational' : 'Some systems are experiencing issues'}
       </div>`
    : '';

  const body = hasMonitors
    ? `<div class="monitor-list">${index.monitors.map(renderMonitorCard).join('')}</div>`
    : `<div class="empty-state">No monitors configured yet. Add entries to <code>monitors.yml</code> to get started.</div>`;

  const generated = new Date(index.generatedAt);

  return `
    <header class="page-header">
      <h1>uptime-monitor</h1>
      <p class="subtitle">Serverless status page, checked every 30 minutes via GitHub Actions.</p>
    </header>
    ${banner}
    ${body}
    <footer class="page-footer">
      Last updated ${generated.toISOString().replace('T', ' ').slice(0, 19)} UTC ·
      <a href="https://github.com/adriasancheza/uptime-monitor" target="_blank" rel="noopener noreferrer">View source on GitHub</a>
    </footer>
  `;
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load status data (${res.status})`);
    const index = (await res.json()) as StatusIndex;
    app.innerHTML = render(index);
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <header class="page-header">
        <h1>uptime-monitor</h1>
      </header>
      <div class="error-state">
        Couldn't load status data right now. Please refresh in a moment.
      </div>
    `;
  }
}

main();
