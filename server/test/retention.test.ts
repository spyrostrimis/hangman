import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { purgeExpiredData } from '../src/retention';

const DAY = 86400000;
const now = 2000000000000;
beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
beforeEach(async () => {
  await env.DB.batch(['DELETE FROM rounds', 'DELETE FROM scores', 'DELETE FROM users', 'DELETE FROM deleted_accounts'].map(sql => env.DB.prepare(sql)));
  await env.DB.prepare("INSERT INTO users(id, username, username_key, salt, verifier) VALUES ('owner', 'Owner', 'owner', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')").run();
  await env.DB.prepare("INSERT INTO scores(user_id, total) VALUES ('owner', 100)").run();
});
async function round(id: string, claimed: number | null, expires: number) {
  // Each unclaimed fixture needs its own account because only one active ticket is allowed.
  await env.DB.prepare('INSERT OR IGNORE INTO users(id, username, username_key, salt, verifier) VALUES (?, ?, ?, ?, ?)').bind(id, id, id, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb').run();
  await env.DB.prepare('INSERT INTO rounds(id,user_id,word,issued_at,expires_at,claimed_at,claim_token) VALUES (?,?,?,?,?,?,?)')
    .bind(id,id,'word', expires - 1800000,expires,claimed,claimed === null ? null : id).run();
}
const ids = async (table: string) => (await env.DB.prepare(`SELECT id FROM ${table} ORDER BY id`).all()).results.map(row => row.id);

it('scheduled sweep expires claimed and unclaimed rounds by their own clocks, keeping recent rows and account scores', async () => {
  await round('claimed-old', now - DAY, now + DAY);
  await round('claimed-recent', now - DAY + 1, now - 2 * DAY);
  await round('unclaimed-old', null, now - DAY);
  await round('unclaimed-recent', null, now - DAY + 1);
  const beforeUsers = await ids('users');
  await worker.scheduled({ scheduledTime: now } as ScheduledController, env);
  expect(await ids('rounds')).toEqual(['claimed-recent', 'unclaimed-recent']);
  expect(await ids('users')).toEqual(beforeUsers);
  expect(await env.DB.prepare("SELECT total FROM scores WHERE user_id='owner'").first('total')).toBe(100);
});

it('purges tombstones older than seven days while retaining the boundary and recent positive controls', async () => {
  for (const [id, time] of [['old', now - 7 * DAY - 1], ['boundary', now - 7 * DAY], ['recent', now]] as const) {
    await env.DB.prepare('INSERT INTO deleted_accounts(id,deleted_at) VALUES (?,?)').bind(id,time).run();
  }
  await purgeExpiredData(env.DB, now);
  expect(await ids('deleted_accounts')).toEqual(['boundary', 'recent']);
});

it('bounds each category to 100 oldest rows and drains the remaining backlog on the next sweep', async () => {
  for (let i=0;i<101;i++) {
    await round(`claimed-${i}`, now - 2*DAY + i, now);
    await round(`unclaimed-${i}`, null, now - 2*DAY + i);
    await env.DB.prepare('INSERT INTO deleted_accounts(id,deleted_at) VALUES (?,?)').bind(`deleted-${i}`,now - 8*DAY + i).run();
  }
  await purgeExpiredData(env.DB, now);
  expect(await ids('rounds')).toEqual(['claimed-100','unclaimed-100']);
  expect(await ids('deleted_accounts')).toEqual(['deleted-100']);
  await purgeExpiredData(env.DB, now);
  expect(await ids('rounds')).toEqual([]);
  expect(await ids('deleted_accounts')).toEqual([]);
});

it('uses retention indexes to find eligible rows', async () => {
  for (const [sql,index] of [
    ['SELECT id FROM rounds WHERE claimed_at IS NOT NULL AND claimed_at <= ? ORDER BY claimed_at LIMIT 100','rounds_claimed_retention'],
    ['SELECT id FROM rounds WHERE claimed_at IS NULL AND expires_at <= ? ORDER BY expires_at LIMIT 100','rounds_unclaimed_retention'],
    ['SELECT id FROM deleted_accounts WHERE deleted_at < ? ORDER BY deleted_at LIMIT 100','deleted_accounts_expiry'],
  ]) {
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(now).all();
    expect(plan.results.map(row => row.detail).join(' ')).toContain(index);
  }
});

it('reports a failed scheduled sweep with only a fixed diagnostic and propagates failure', async () => {
  const log = vi.spyOn(console,'error').mockImplementation(() => {});
  await env.DB.exec("CREATE TRIGGER fail_retention BEFORE DELETE ON deleted_accounts BEGIN SELECT RAISE(ABORT, 'private detail'); END;");
  try {
    await env.DB.prepare('INSERT INTO deleted_accounts(id,deleted_at) VALUES (?,?)').bind('old',now-8*DAY).run();
    await expect(worker.scheduled({ scheduledTime: now } as ScheduledController,env)).rejects.toThrow('Retention sweep failed');
    expect(log.mock.calls).toEqual([[JSON.stringify({event:'retention_failure'})]]);
  } finally {
    await env.DB.exec('DROP TRIGGER fail_retention');
    log.mockRestore();
  }
  await worker.scheduled({ scheduledTime: now } as ScheduledController,env);
  expect(await ids('deleted_accounts')).toEqual([]);
});
