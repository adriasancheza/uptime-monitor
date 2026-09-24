import type { CheckResult, IncidentState } from '../checker/types.js';

export const FAILURE_THRESHOLD = 2;

export const INITIAL_INCIDENT_STATE: IncidentState = {
  consecutiveFailures: 0,
  isDown: false,
  issueNumber: null,
  downSince: null,
};

export type IncidentAction =
  { type: 'none' } | { type: 'open'; downSince: string } | { type: 'recover'; downSince: string | null };

export interface IncidentTransition {
  state: IncidentState;
  action: IncidentAction;
}

/**
 * Advances the incident state machine given one new check result.
 *
 * Rules:
 * - Two consecutive failures (FAILURE_THRESHOLD) transition the monitor to
 *   "down" and request opening a GitHub issue.
 * - Any success while down transitions back to "up" and requests closing
 *   the issue with a recovery comment.
 * - A success while already up (or a single failure) does not raise an
 *   incident.
 */
export function transitionIncidentState(state: IncidentState, result: CheckResult): IncidentTransition {
  if (result.ok) {
    if (state.isDown) {
      return {
        state: { consecutiveFailures: 0, isDown: false, issueNumber: null, downSince: null },
        action: { type: 'recover', downSince: state.downSince },
      };
    }
    return {
      state: { ...state, consecutiveFailures: 0 },
      action: { type: 'none' },
    };
  }

  const consecutiveFailures = state.consecutiveFailures + 1;

  if (!state.isDown && consecutiveFailures >= FAILURE_THRESHOLD) {
    const downSince = state.downSince ?? result.timestamp;
    return {
      state: { consecutiveFailures, isDown: true, issueNumber: state.issueNumber, downSince },
      action: { type: 'open', downSince },
    };
  }

  return {
    state: {
      ...state,
      consecutiveFailures,
      downSince: state.downSince ?? (consecutiveFailures >= 1 ? result.timestamp : null),
    },
    action: { type: 'none' },
  };
}
