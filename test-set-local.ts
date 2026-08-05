import { baseDb } from '@services/dbService';
import { sql } from 'drizzle-orm';

async function test() {
    try {
        await baseDb.transaction(async (tx) => {
            console.log('Executing SET LOCAL search_path...');
            await tx.execute(sql`SET LOCAL search_path TO public`);
            console.log('Success!');
        });
    } catch (e) {
        console.error('Failed:', e);
    }
}
test();
