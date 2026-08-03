import { db } from '@services/dbService';
import { sql } from 'drizzle-orm';

async function verify() {
  const result = await db.execute(sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('michael', 'public')`);
  console.log(result.rows);
}

verify().catch(console.error);
