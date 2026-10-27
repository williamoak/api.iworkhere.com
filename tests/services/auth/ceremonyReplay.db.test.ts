/**
 * Real-database replay tests for WebAuthn ceremony claims.
 *
 * These run against CockroachDB and are skipped unless
 * RUN_WEBAUTHN_REPLAY_DB_TEST=1 is set. Each run builds a throwaway schema,
 * applies the 0038 migration inside it, and drops it afterwards. The `api`
 * schema is never touched.
 *
 * Each Pool stands in for one API pod, so the races below cross instances
 * the same way production traffic does.
 */
// tests/vitest.setup.ts mocks these modules for every unit test. This file needs
// the real implementations to talk to CockroachDB, so it opts out of each mock.
vi.unmock('@db/schema');
vi.unmock('drizzle-orm');
vi.unmock('crypto');
vi.unmock('fs');
vi.unmock('node:fs');

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { configGet } from '@helpers/config';

const enabled = process.env.RUN_WEBAUTHN_REPLAY_DB_TEST === '1';
const SCHEMA = `webauthn_replay_test_${crypto.randomBytes(4).toString('hex')}`;
const MIGRATION = path.resolve(process.cwd(), 'src/db/migrations/0038_create_consumed_webauthn_ceremonies.sql');
const GRACE_MS = 5 * 60_000;

const pools: Pool[] = [];
let schemaModule: typeof import('@db/schema');
let claimCeremonyJti: typeof import('@services/auth/ceremonyService')['claimCeremonyJti'];
let cleanupExpiredCeremonies: typeof import('@jobs/cleanupExpiredTokens')['cleanupExpiredCeremonies'];
let setupPool: Pool;

/** Same connection settings as src/services/dbService.ts. */
function connectionConfig(): PoolConfig {
  const certDir = configGet('DB_CERT_DIR');
  const user = configGet('DB_USER');
  const host = configGet('DB_HOSTNAME');

  return {
    host,
    port: Number(configGet('DB_PORT')),
    database: configGet('DB_NAME'),
    user,
    ssl: {
      ca: fs.readFileSync(`${certDir}/ca.crt`, 'utf8'),
      cert: fs.readFileSync(`${certDir}/client.${user}.crt`, 'utf8'),
      key: fs.readFileSync(`${certDir}/client.${user}.key`, 'utf8'),
      rejectUnauthorized: true,
      servername: host,
    },
  };
}

/** A pool whose connections all resolve table names inside the scratch schema. */
function createPodPool(): Pool {
  const pool = new Pool(connectionConfig());
  pool.on('connect', (client) => {
    void client.query(`SET search_path TO ${SCHEMA}`);
  });
  pools.push(pool);
  return pool;
}

function podDb(pool: Pool) {
  return drizzle(pool, { schema: schemaModule });
}

function claimFromPod(jti: string, expiresAt: number, pool: Pool) {
  return claimCeremonyJti(jti, expiresAt, podDb(pool));
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe.skipIf(!enabled)('WebAuthn ceremony replay protection (CockroachDB)', () => {
  beforeAll(async () => {
    // Imported here so the default test run never loads the real database service.
    schemaModule = await import('@db/schema');
    ({ claimCeremonyJti } = await import('@services/auth/ceremonyService'));
    ({ cleanupExpiredCeremonies } = await import('@jobs/cleanupExpiredTokens'));

    setupPool = new Pool(connectionConfig());
    pools.push(setupPool);
    await setupPool.query(`CREATE SCHEMA ${SCHEMA}`);

    // One checked-out client, so SET search_path applies to every migration statement.
    const migrationSql = fs.readFileSync(MIGRATION, 'utf8');
    const client = await setupPool.connect();
    try {
      await client.query(`SET search_path TO ${SCHEMA}`);
      for (const statement of migrationSql.split(';').map((s) => s.trim()).filter(Boolean)) {
        await client.query(statement);
      }
    } finally {
      client.release();
    }

    // Refuse to continue if the table did not land in the scratch schema.
    const created = await setupPool.query<{ table_name: string | null }>(
      `SELECT to_regclass($1) AS table_name`,
      [`${SCHEMA}.consumed_webauthn_ceremonies`],
    );
    if (!created.rows[0].table_name) {
      throw new Error(`consumed_webauthn_ceremonies was not created in ${SCHEMA}`);
    }
  });

  afterAll(async () => {
    if (setupPool) {
      await setupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    }
    await Promise.all(pools.map((pool) => pool.end()));
  });

  it('lets exactly one of many concurrent API instances claim each ceremony', async () => {
    const pods = Array.from({ length: 12 }, () => createPodPool());

    for (let round = 0; round < 5; round++) {
      const jti = crypto.randomUUID();
      const expiresAt = nowSeconds() + 300;

      const results = await Promise.all(pods.map((pod) => claimFromPod(jti, expiresAt, pod)));

      expect(results.filter(Boolean)).toHaveLength(1);
    }
  });

  it('rejects a replay of a consumed ceremony from any other instance', async () => {
    const [first, second, third] = [createPodPool(), createPodPool(), createPodPool()];
    const jti = crypto.randomUUID();
    const expiresAt = nowSeconds() + 300;

    expect(await claimFromPod(jti, expiresAt, first)).toBe(true);
    expect(await claimFromPod(jti, expiresAt, second)).toBe(false);
    expect(await claimFromPod(jti, expiresAt, third)).toBe(false);
  });

  it('keeps distinct ceremonies independent', async () => {
    const pod = createPodPool();
    const expiresAt = nowSeconds() + 300;

    const claims = await Promise.all([
      claimFromPod(crypto.randomUUID(), expiresAt, pod),
      claimFromPod(crypto.randomUUID(), expiresAt, pod),
    ]);

    expect(claims).toEqual([true, true]);
  });

  it('cleanup deletes only records past expiry plus the grace period, even when pods run it concurrently', async () => {
    const pods = [createPodPool(), createPodPool(), createPodPool()];
    const now = Date.now();

    const expiredBeyondGrace = crypto.randomUUID();
    const expiredWithinGrace = crypto.randomUUID();
    const stillActive = crypto.randomUUID();
    await podDb(pods[0]).insert(schemaModule.consumedWebauthnCeremonies).values([
      { jti: expiredBeyondGrace, expiresAt: new Date(now - GRACE_MS - 60_000) },
      { jti: expiredWithinGrace, expiresAt: new Date(now - 60_000) },
      { jti: stillActive, expiresAt: new Date(now + 300_000) },
    ]);

    const deleted = await Promise.all(pods.map((pod) => cleanupExpiredCeremonies(podDb(pod))));

    expect(deleted.reduce((sum, count) => sum + count, 0)).toBe(1);

    const remaining = await setupPool.query<{ jti: string }>(
      `SELECT jti FROM ${SCHEMA}.consumed_webauthn_ceremonies WHERE jti = ANY($1::uuid[])`,
      [[expiredBeyondGrace, expiredWithinGrace, stillActive]],
    );
    expect(remaining.rows.map((row) => row.jti).sort()).toEqual([expiredWithinGrace, stillActive].sort());
  });
});
