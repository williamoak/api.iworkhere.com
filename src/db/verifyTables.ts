import { logger } from '@helpers/logger';

;
import { db } from '@services/dbService';
import { sql } from 'drizzle-orm';

async function verify() {
  try {
      await db.execute(sql`INSERT INTO joinaunion.visit_info (device_id, request_method, touch_time, note) VALUES ('4bf53ac4-0db4-3d1a-4221-e4f97340f3c3', 'GET', NOW(), 'test insert')`);
      logger.log('Insert successful');
  } catch (e) {
      logger.error(e);
  }
}

verify().catch(logger.error);
