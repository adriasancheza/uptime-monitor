/**
 * Minimal GitHub REST API client for opening/closing incident issues, using
 * plain fetch (no @octokit dependency) and the workflow's GITHUB_TOKEN.
 */

const API_BASE = 'https://api.github.com';

interface GithubEnv {
  token: string;
  repo: string; // "owner/repo"
}

export function getGithubEnv(): GithubEnv | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  return { token, repo };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function openIncidentIssue(env: GithubEnv, monitorName: string, body: string): Promise<number | null> {
  const res = await fetch(`${API_BASE}/repos/${env.repo}/issues`, {
    method: 'POST',
    headers: headers(env.token),
    body: JSON.stringify({
      title: `Incident: ${monitorName} is down`,
      body,
      labels: ['incident'],
    }),
  });
  if (!res.ok) {
    console.error(`Failed to open incident issue for ${monitorName}: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = (await res.json()) as { number: number };
  return json.number;
}

export async function closeIncidentIssue(env: GithubEnv, issueNumber: number, commentBody: string): Promise<void> {
  const commentRes = await fetch(`${API_BASE}/repos/${env.repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: headers(env.token),
    body: JSON.stringify({ body: commentBody }),
  });
  if (!commentRes.ok) {
    console.error(`Failed to comment on issue #${issueNumber}: ${commentRes.status} ${await commentRes.text()}`);
  }

  const closeRes = await fetch(`${API_BASE}/repos/${env.repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: headers(env.token),
    body: JSON.stringify({ state: 'closed' }),
  });
  if (!closeRes.ok) {
    console.error(`Failed to close issue #${issueNumber}: ${closeRes.status} ${await closeRes.text()}`);
  }
}
