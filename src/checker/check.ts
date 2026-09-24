import { connect as tlsConnect } from 'node:tls';
import type { CheckResult, MonitorConfig, TlsInfo } from './types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Inspects the TLS certificate of an https:// URL and returns how many days
 * remain until it expires. Returns null for non-https URLs or on any
 * connection failure (the main HTTP check already reports those failures).
 */
export function getTlsInfo(urlString: string, timeoutMs = 8000): Promise<TlsInfo | null> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return Promise.resolve(null);
  }
  if (url.protocol !== 'https:') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const port = url.port ? Number(url.port) : 443;
    const socket = tlsConnect(
      {
        host: url.hostname,
        port,
        servername: url.hostname,
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            resolve(null);
          } else {
            const validTo = new Date(cert.valid_to);
            const daysToExpiry = Math.floor((validTo.getTime() - Date.now()) / MS_PER_DAY);
            resolve({ daysToExpiry, validTo: validTo.toISOString() });
          }
        } catch {
          resolve(null);
        } finally {
          socket.end();
        }
      },
    );
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/** Runs a single HTTP(S) check against a monitor and measures response time. */
export async function checkMonitor(monitor: MonitorConfig): Promise<CheckResult> {
  const timestamp = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), monitor.timeoutMs);
  const start = performance.now();

  let statusCode: number | null = null;
  let ok = false;
  let error: string | null = null;
  let bodyText: string | null = null;

  try {
    const response = await fetch(monitor.url, {
      method: monitor.method,
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'uptime-monitor (+https://github.com/adriasancheza/uptime-monitor)' },
    });
    statusCode = response.status;
    ok = response.status === monitor.expectedStatus;

    if (ok && monitor.keyword) {
      bodyText = await response.text();
      ok = bodyText.includes(monitor.keyword);
      if (!ok) {
        error = `Keyword "${monitor.keyword}" not found in response body`;
      }
    } else if (!ok) {
      error = `Expected status ${monitor.expectedStatus}, got ${response.status}`;
    }
  } catch (err) {
    ok = false;
    if (err instanceof Error && err.name === 'AbortError') {
      error = `Request timed out after ${monitor.timeoutMs}ms`;
    } else {
      error = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearTimeout(timeout);
  }

  const responseTimeMs = Math.round(performance.now() - start);
  const tls = await getTlsInfo(monitor.url);

  return {
    name: monitor.name,
    url: monitor.url,
    timestamp,
    ok,
    statusCode,
    responseTimeMs,
    error,
    tls,
  };
}
