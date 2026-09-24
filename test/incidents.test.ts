import { describe, expect, it } from 'vitest';
import { FAILURE_THRESHOLD, INITIAL_INCIDENT_STATE, transitionIncidentState } from '../src/aggregate/incidents.js';
import type { CheckResult, IncidentState } from '../src/checker/types.js';

function makeResult(ok: boolean, timestamp = '2026-01-15T10:00:00.000Z'): CheckResult {
  return {
    name: 'Test',
    url: 'https://example.com',
    timestamp,
    ok,
    statusCode: ok ? 200 : 500,
    responseTimeMs: 100,
    error: ok ? null : 'boom',
    tls: null,
  };
}

describe('transitionIncidentState', () => {
  it('does nothing on a single failure (below threshold)', () => {
    const { state, action } = transitionIncidentState(INITIAL_INCIDENT_STATE, makeResult(false));
    expect(state.isDown).toBe(false);
    expect(state.consecutiveFailures).toBe(1);
    expect(action.type).toBe('none');
  });

  it(`opens an incident after ${FAILURE_THRESHOLD} consecutive failures`, () => {
    let state: IncidentState = INITIAL_INCIDENT_STATE;
    let transition = transitionIncidentState(state, makeResult(false, '2026-01-15T10:00:00.000Z'));
    state = transition.state;
    expect(transition.action.type).toBe('none');

    transition = transitionIncidentState(state, makeResult(false, '2026-01-15T10:30:00.000Z'));
    state = transition.state;
    expect(transition.action.type).toBe('open');
    expect(state.isDown).toBe(true);
    if (transition.action.type === 'open') {
      expect(transition.action.downSince).toBe('2026-01-15T10:00:00.000Z');
    }
  });

  it('stays down and takes no action on further failures while already down', () => {
    const state: IncidentState = {
      consecutiveFailures: 2,
      isDown: true,
      issueNumber: 7,
      downSince: '2026-01-15T10:00:00.000Z',
    };
    const { state: next, action } = transitionIncidentState(state, makeResult(false, '2026-01-15T11:00:00.000Z'));
    expect(action.type).toBe('none');
    expect(next.isDown).toBe(true);
    expect(next.consecutiveFailures).toBe(3);
    expect(next.issueNumber).toBe(7);
  });

  it('recovers on the first success after being down', () => {
    const state: IncidentState = {
      consecutiveFailures: 3,
      isDown: true,
      issueNumber: 7,
      downSince: '2026-01-15T10:00:00.000Z',
    };
    const { state: next, action } = transitionIncidentState(state, makeResult(true, '2026-01-15T12:00:00.000Z'));
    expect(action.type).toBe('recover');
    if (action.type === 'recover') {
      expect(action.downSince).toBe('2026-01-15T10:00:00.000Z');
    }
    expect(next).toEqual(INITIAL_INCIDENT_STATE);
  });

  it('resets the failure counter on success while up', () => {
    const state: IncidentState = { consecutiveFailures: 1, isDown: false, issueNumber: null, downSince: null };
    const { state: next, action } = transitionIncidentState(state, makeResult(true));
    expect(action.type).toBe('none');
    expect(next.consecutiveFailures).toBe(0);
  });

  it('does not reopen an incident while already down and issueNumber is set', () => {
    const state: IncidentState = {
      consecutiveFailures: 5,
      isDown: true,
      issueNumber: 42,
      downSince: '2026-01-14T00:00:00.000Z',
    };
    const { action } = transitionIncidentState(state, makeResult(false));
    expect(action.type).toBe('none');
  });
});
