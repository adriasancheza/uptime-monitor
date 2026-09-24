import { describe, expect, it } from 'vitest';
import { applyDefaults, parseMonitorsYaml } from '../src/checker/config.js';

describe('applyDefaults', () => {
  it('fills in defaults for optional fields', () => {
    const monitor = applyDefaults({ name: 'Site', url: 'https://example.com' });
    expect(monitor).toEqual({
      name: 'Site',
      url: 'https://example.com',
      method: 'GET',
      expectedStatus: 200,
      timeoutMs: 10000,
      keyword: undefined,
    });
  });

  it('preserves explicit overrides', () => {
    const monitor = applyDefaults({
      name: 'API',
      url: 'https://api.example.com/health',
      method: 'HEAD',
      expectedStatus: 204,
      timeoutMs: 5000,
      keyword: 'ok',
    });
    expect(monitor.method).toBe('HEAD');
    expect(monitor.expectedStatus).toBe(204);
    expect(monitor.timeoutMs).toBe(5000);
    expect(monitor.keyword).toBe('ok');
  });

  it('throws when name or url is missing', () => {
    expect(() => applyDefaults({ name: '', url: 'https://example.com' })).toThrow();
    expect(() => applyDefaults({ name: 'Site', url: '' })).toThrow();
  });
});

describe('parseMonitorsYaml', () => {
  it('parses a valid monitors.yml document', () => {
    const yaml = `
monitors:
  - name: Website
    url: https://example.com
  - name: API
    url: https://api.example.com
    method: HEAD
    expectedStatus: 204
`;
    const monitors = parseMonitorsYaml(yaml);
    expect(monitors).toHaveLength(2);
    expect(monitors[0]?.name).toBe('Website');
    expect(monitors[1]?.method).toBe('HEAD');
  });

  it('throws on an empty monitors list', () => {
    expect(() => parseMonitorsYaml('monitors: []')).toThrow();
  });

  it('throws when the monitors key is missing', () => {
    expect(() => parseMonitorsYaml('foo: bar')).toThrow();
  });
});
