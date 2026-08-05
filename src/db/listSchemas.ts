import { logger } from '@helpers/logger';

;
import { db } from '@services/dbService'; // Assuming this is where your db client is initialized
import { sql } from 'drizzle-orm';

async function listSchemas() {
  const result = await db.execute(sql`SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'`);
  logger.log(result.rows);
}

listSchemas().catch(logger.error);
