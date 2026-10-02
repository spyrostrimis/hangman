const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_BATCH_SIZE = 100;

// Five indexed, bounded statements keep each hourly sweep small on Free.
export async function purgeExpiredData(db: D1Database, now: number) {
  await db.batch([
    db.prepare(`DELETE FROM rounds WHERE id IN (
      SELECT id FROM rounds WHERE claimed_at IS NOT NULL AND claimed_at <= ?
      ORDER BY claimed_at LIMIT ?)` ).bind(now - DAY_MS, RETENTION_BATCH_SIZE),
    db.prepare(`DELETE FROM rounds WHERE id IN (
      SELECT id FROM rounds WHERE claimed_at IS NULL AND expires_at <= ?
      ORDER BY expires_at LIMIT ?)` ).bind(now - DAY_MS, RETENTION_BATCH_SIZE),
    db.prepare(`DELETE FROM illucia_rounds WHERE id IN (
      SELECT id FROM illucia_rounds WHERE claimed_at IS NOT NULL AND claimed_at <= ?
      ORDER BY claimed_at LIMIT ?)`).bind(now - DAY_MS, RETENTION_BATCH_SIZE),
    db.prepare(`DELETE FROM illucia_rounds WHERE id IN (
      SELECT id FROM illucia_rounds WHERE claimed_at IS NULL AND expires_at <= ?
      ORDER BY expires_at LIMIT ?)`).bind(now - DAY_MS, RETENTION_BATCH_SIZE),
    db.prepare(`DELETE FROM deleted_accounts WHERE id IN (
      SELECT id FROM deleted_accounts WHERE deleted_at < ?
      ORDER BY deleted_at LIMIT ?)` ).bind(now - 7 * DAY_MS, RETENTION_BATCH_SIZE),
  ]);
}

export async function scheduledRetention(controller: ScheduledController, env: Env) {
  try {
    await purgeExpiredData(env.DB, controller.scheduledTime);
  } catch {
    console.error(JSON.stringify({ event: 'retention_failure' }));
    // Report failure without logging SQL, account identifiers or request data.
    throw new Error('Retention sweep failed');
  }
}
