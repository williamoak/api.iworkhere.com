import { db } from '@services/dbService';

/**
 * Seed application_origins for Bill and Michael's consumers.
 *
 * CockroachDB-safe
 * Fully idempotent
 */

const CONSUMERS = [
  {
    app_key: 'bill.iworkhere.com',
    origin: 'https://bill.iworkhere.com',
    name: 'Bill Web',
  },
  {
    app_key: 'michael.iworkhere.com',
    origin: 'https://michael.iworkhere.com',
    name: 'Michael Web',
  },
  {
    app_key: 'api.iworkhere.com',
    origin: 'https://api.iworkhere.com',
    name: 'API Server',
  }
];

for (const consumer of CONSUMERS) {
  /* -------------------------------------------------
   * 1. Ensure application exists
   * ------------------------------------------------- */
  await db.execute(`
        INSERT INTO applications (
            id,
            app_key,
            name,
            is_enabled,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            '${consumer.app_key}',
            '${consumer.name}',
            true,
            now(),
            now()
        WHERE NOT EXISTS (
            SELECT 1
            FROM applications
            WHERE app_key = '${consumer.app_key}'
        )
    `);

  /* -------------------------------------------------
   * 2. Resolve application id
   * ------------------------------------------------- */
  const appResult = await db.execute<{ id: string }>(`
        SELECT id
        FROM applications
        WHERE app_key = '${consumer.app_key}'
        LIMIT 1
    `);

  if (appResult.rows.length === 0) {
    throw new Error(
      `application_origins_seed: application '${consumer.app_key}' not found`,
    );
  }

  const applicationId = appResult.rows[0].id;

  /* -------------------------------------------------
   * 3. Ensure origin exists
   * ------------------------------------------------- */
  await db.execute(`
        INSERT INTO application_origins (
            id,
            application_id,
            origin,
            type,
            is_enabled,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            '${applicationId}',
            '${consumer.origin}',
            'web',
            true,
            now(),
            now()
        WHERE NOT EXISTS (
            SELECT 1
            FROM application_origins
            WHERE application_id = '${applicationId}'
              AND origin = '${consumer.origin}'
        )
    `);
}

console.log('🌱 Application origins seeded for Bill and Michael');
