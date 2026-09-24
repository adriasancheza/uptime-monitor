import { describe, expect, it } from 'vitest';
import {
  applyRetention,
  averageLatencyForWindow,
  recordResult,
  RETENTION_DAYS,
  uptimeForWindow,
} from '../src/aggregate/aggregate.js';
import type { CheckResult, DailyAggregate, MonitorHistory } from '../src/checker/types.js';
import { INITIAL_INCIDENT_STATE } from '../src/aggregate/incidents.js';

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    name: 'Test',
    url: 'https://example.com',
    timestamp: '2026-01-15T10:00:00.000Z',
    ok: true,
    statusCode: 200,
    responseTimeMs: 100,
    error: null,
    tls: null,
    ...overrides,
  };
}

function emptyHistory(): MonitorHistory {
  return {
    name: 'Test',
    url: 'https://example.com',
    days: [],
    incidentState: INITIAL_INCIDENT_STATE,
    lastResult: null,
  };
}

describe('recordResult', () => {
  it('creates a new daily aggregate on the first check of the day', () => {
    const history = recordResult(emptyHistory(), makeResult());
    expect(history.days).toHaveLength(1);
    expect(history.days[0]).toMatchObject({
      date: '2026-01-15',
      totalChecks: 1,
      successfulChecks: 1,
      uptimePercent: 100,
      averageLatencyMs: 100,
    });
  });

  it('accumulates multiple checks on the same day', () => {
    let history = recordResult(emptyHistory(), makeResult({ responseTimeMs: 100 }));
    history = recordResult(history, makeResult({ responseTimeMs: 200, timestamp: '2026-01-15T11:00:00.000Z' }));
    expect(history.days).toHaveLength(1);
    expect(history.days[0]?.totalChecks).toBe(2);
    expect(history.days[0]?.averageLatencyMs).toBe(150);
    expect(history.days[0]?.minLatencyMs).toBe(100);
    expect(history.days[0]?.maxLatencyMs).toBe(200);
  });

  it('computes uptimePercent from successful vs. total checks', () => {
    let history = recordResult(emptyHistory(), makeResult({ ok: true }));
    history = recordResult(history, makeResult({ ok: false, statusCode: 500, timestamp: '2026-01-15T11:00:00.000Z' }));
    expect(history.days[0]?.uptimePercent).toBe(50);
  });

  it('starts a new daily aggregate when the date changes', () => {
    let history = recordResult(emptyHistory(), makeResult({ timestamp: '2026-01-15T23:59:00.000Z' }));
    history = recordResult(history, makeResult({ timestamp: '2026-01-16T00:01:00.000Z' }));
    expect(history.days).toHaveLength(2);
    expect(history.days.map((d) => d.date)).toEqual(['2026-01-15', '2026-01-16']);
  });

  it('records the latest TLS days-to-expiry', () => {
    const history = recordResult(
      emptyHistory(),
      makeResult({ tls: { daysToExpiry: 42, validTo: '2026-03-01T00:00:00.000Z' } }),
    );
    expect(history.days[0]?.lastTlsDaysToExpiry).toBe(42);
  });

  it('stores the raw last result', () => {
    const result = makeResult();
    const history = recordResult(emptyHistory(), result);
    expect(history.lastResult).toEqual(result);
  });
});

describe('applyRetention', () => {
  function days(n: number): DailyAggregate[] {
    return Array.from({ length: n }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      totalChecks: 1,
      successfulChecks: 1,
      uptimePercent: 100,
      averageLatencyMs: 100,
      minLatencyMs: 100,
      maxLatencyMs: 100,
      lastStatusCode: 200,
      lastCheckedAt: null,
      lastTlsDaysToExpiry: null,
      incidents: 0,
    }));
  }

  it('keeps all days when under the retention window', () => {
    expect(applyRetention(days(5), 90)).toHaveLength(5);
  });

  it('drops the oldest days beyond the retention window', () => {
    const result = applyRetention(days(12), 10);
    expect(result).toHaveLength(10);
    expect(result[0]?.date).toBe('2026-01-03');
  });

  it('defaults to a 90-day retention window', () => {
    expect(RETENTION_DAYS).toBe(90);
    const result = applyRetention(days(120));
    expect(result).toHaveLength(90);
  });
});

describe('uptimeForWindow', () => {
  it('returns null when there is no data', () => {
    expect(uptimeForWindow([], 7)).toBeNull();
  });

  it('weights uptime by total checks, not by day count', () => {
    const days: DailyAggregate[] = [
      {
        date: '2026-01-01',
        totalChecks: 10,
        successfulChecks: 10,
        uptimePercent: 100,
        averageLatencyMs: 100,
        minLatencyMs: 100,
        maxLatencyMs: 100,
        lastStatusCode: 200,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 0,
      },
      {
        date: '2026-01-02',
        totalChecks: 10,
        successfulChecks: 0,
        uptimePercent: 0,
        averageLatencyMs: 100,
        minLatencyMs: 100,
        maxLatencyMs: 100,
        lastStatusCode: 500,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 1,
      },
    ];
    expect(uptimeForWindow(days, 2)).toBe(50);
  });

  it('only considers the trailing N days', () => {
    const days: DailyAggregate[] = [
      {
        date: '2026-01-01',
        totalChecks: 10,
        successfulChecks: 0,
        uptimePercent: 0,
        averageLatencyMs: 100,
        minLatencyMs: 100,
        maxLatencyMs: 100,
        lastStatusCode: 500,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 1,
      },
      {
        date: '2026-01-02',
        totalChecks: 10,
        successfulChecks: 10,
        uptimePercent: 100,
        averageLatencyMs: 100,
        minLatencyMs: 100,
        maxLatencyMs: 100,
        lastStatusCode: 200,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 0,
      },
    ];
    expect(uptimeForWindow(days, 1)).toBe(100);
  });
});

describe('averageLatencyForWindow', () => {
  it('returns null with no data', () => {
    expect(averageLatencyForWindow([], 7)).toBeNull();
  });

  it('weights average latency by total checks', () => {
    const days: DailyAggregate[] = [
      {
        date: '2026-01-01',
        totalChecks: 1,
        successfulChecks: 1,
        uptimePercent: 100,
        averageLatencyMs: 100,
        minLatencyMs: 100,
        maxLatencyMs: 100,
        lastStatusCode: 200,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 0,
      },
      {
        date: '2026-01-02',
        totalChecks: 3,
        successfulChecks: 3,
        uptimePercent: 100,
        averageLatencyMs: 300,
        minLatencyMs: 300,
        maxLatencyMs: 300,
        lastStatusCode: 200,
        lastCheckedAt: null,
        lastTlsDaysToExpiry: null,
        incidents: 0,
      },
    ];
    // (100*1 + 300*3) / 4 = 250
    expect(averageLatencyForWindow(days, 2)).toBe(250);
  });
});
