/** Optional Discord/Slack webhook notifications. Both are best-effort and never throw. */
export async function notifyWebhooks(message: string): Promise<void> {
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  const slackUrl = process.env.SLACK_WEBHOOK_URL;

  const tasks: Promise<unknown>[] = [];

  if (discordUrl) {
    tasks.push(
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      }).catch((err) => console.error('Discord webhook failed:', err)),
    );
  }

  if (slackUrl) {
    tasks.push(
      fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      }).catch((err) => console.error('Slack webhook failed:', err)),
    );
  }

  await Promise.all(tasks);
}
