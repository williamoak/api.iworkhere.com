import { logger } from '@helpers/logger';

import { db } from '@services/dbService';
import { sql } from 'drizzle-orm';

async function listTables() {
  const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
;

  logger.log(result.rows);
}
;
listTables().catch(logger.error);
