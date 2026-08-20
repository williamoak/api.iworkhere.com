
import { db } from './src/services/dbService';
import { visitInfo } from './src/db/schema/visit_info';
import { sql } from 'drizzle-orm';

async function verify() {
    console.log("Verifying database connection and schemas...");
    try {
        const result = await db.execute(sql`SELECT current_schema()`);
        console.log("Current schema:", result.rows[0]);

        console.log("Checking visit_info in public...");
        const publicCount = await db.execute(sql`SELECT count(*) FROM public.visit_info`);
        console.log("Public visit_info count:", publicCount.rows[0].count);

        console.log("Checking visit_info in joinaunion...");
        const joinCount = await db.execute(sql`SELECT count(*) FROM joinaunion.visit_info`);
        console.log("Joinaunion visit_info count:", joinCount.rows[0].count);

    } catch (e) {
        console.error("Verification failed:", e.message);
    }
    process.exit(0);
}

verify();
