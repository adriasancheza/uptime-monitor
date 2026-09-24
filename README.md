# uptime-monitor

Serverless uptime monitoring that runs entirely on GitHub Actions — no server, no database, no paid tier. It checks your endpoints every 30 minutes, keeps 90 days of history on a dedicated branch, opens/closes GitHub Issues for incidents, and publishes a static status page to GitHub Pages.

**Live status page:** https://adriasancheza.github.io/uptime-monitor/

[![Monitor](https://img.shields.io/github/actions/workflow/status/adriasancheza/uptime-monitor/monitor.yml?branch=main&style=flat-square&label=status%20checks)](https://github.com/adriasancheza/uptime-monitor/actions/workflows/monitor.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/adriasancheza/uptime-monitor/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/adriasancheza/uptime-monitor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

## How it works

```mermaid
flowchart LR
    subgraph Schedule["Every 30 min (cron) or manual dispatch"]
        A[monitor.yml workflow]
    end

    A --> B[Read monitors.yml]
    B --> C[Checker: fetch + TLS inspect each monitor]
    C --> D{Status OK?}
    D -- "2 consecutive fails" --> E[Open GitHub Issue\nlabel: incident]
    D -- "recovers" --> F[Comment + close Issue]
    E -.optional.-> G[Discord / Slack webhook]
    F -.optional.-> G

    C --> H[Update per-monitor JSON history]
    H --> I[Commit to status-data branch\n90-day retention]
    I --> J[Build status page\nreads history JSON]
    J --> K[Deploy to GitHub Pages]
```

1. **`monitor.yml`** runs on a `*/30 * * * *` cron (and on demand via `workflow_dispatch`).
2. It reads `monitors.yml`, and for each entry performs an HTTP request with `fetch`, measuring response time, status code, and (for HTTPS) TLS certificate days-to-expiry via `node:tls`.
3. Results are folded into a per-monitor JSON history file (daily aggregates, 90-day retention) committed to the **`status-data`** branch — keeping history data out of `main`.
4. Two consecutive failures open a GitHub Issue labelled `incident`; the next successful check closes it with a recovery comment. Optional Discord/Slack webhooks can also be notified.
5. The workflow then builds the static status page (Vite + vanilla TypeScript) from the updated history and deploys it to GitHub Pages.

## Fork and use it in 3 steps

1. **Fork this repository** and edit [`monitors.yml`](monitors.yml) with the endpoints you want to watch:

   ```yaml
   monitors:
     - name: My Website
       url: https://example.com
       expectedStatus: 200
       timeoutMs: 10000
       keyword: 'Welcome' # optional: substring that must be in the response body
   ```

2. **Enable GitHub Pages** for your fork: _Settings → Pages → Build and deployment → Source: **GitHub Actions**_.

3. **Enable workflow write permissions** (needed to commit history and open/close issues): _Settings → Actions → General → Workflow permissions → **Read and write permissions**_.

That's it — the `monitor.yml` workflow will start running every 30 minutes (or trigger it immediately from the _Actions_ tab with _Run workflow_), and your status page will appear at `https://<your-username>.github.io/<repo-name>/`.

### Optional: chat notifications

To get a message posted when a monitor goes down or recovers, add a repository secret with an incoming webhook URL:

- `DISCORD_WEBHOOK_URL` — a [Discord incoming webhook](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) URL.
- `SLACK_WEBHOOK_URL` — a [Slack incoming webhook](https://api.slack.com/messaging/webhooks) URL.

Both are optional; if neither secret is set, notifications are simply skipped.

## Config reference (`monitors.yml`)

| Field            | Required | Default | Description                                            |
| ---------------- | -------- | ------- | ------------------------------------------------------ |
| `name`           | yes      | —       | Display name on the status page and in issues.         |
| `url`            | yes      | —       | URL to request.                                        |
| `method`         | no       | `GET`   | HTTP method.                                           |
| `expectedStatus` | no       | `200`   | HTTP status code considered a success.                 |
| `timeoutMs`      | no       | `10000` | Request timeout in milliseconds.                       |
| `keyword`        | no       | —       | If set, the response body must contain this substring. |

## Project layout

```
monitors.yml                 # endpoints to watch
src/checker/                 # HTTP + TLS check logic, config loading
src/aggregate/                # daily aggregation, 90-day retention, incident state machine
src/scripts/                 # entrypoints: run-checks (writes history), build-site-data (site JSON), GitHub Issues + webhooks
src/site/                     # static status page (Vite + vanilla TypeScript)
test/                         # Vitest unit tests for the above
.github/workflows/monitor.yml # scheduled checker + Pages deploy
.github/workflows/ci.yml      # lint, test, build on PRs/pushes
```

History lives on the **`status-data`** git branch (one JSON file per monitor, plus a generated `index.json`), never on `main`, so the app's commit history stays clean and reviewable.

## Local development

Requires Node.js 22+.

```bash
npm install
npm run check       # run the checker once against monitors.yml, writes to ./data
npm run build:data  # turn ./data into public/data/index.json for the site
npm run dev          # start the status page locally
npm test             # run the Vitest suite
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # production build (data + site) into ./dist
```

## License

[MIT](LICENSE) © 2026 Adrià Sánchez
