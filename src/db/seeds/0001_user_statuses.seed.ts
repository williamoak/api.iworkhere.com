import { db } from "@services/dbService";

/**
 * Seed default user statuses
 * CockroachDB UPSERT
 */

await db.execute(`
    UPSERT INTO user_statuses (status_code, description) VALUES
        ('active',   'User account is active'),
        ('disabled', 'User account is disabled'),
        ('pending',  'User account pending verification')
`);

console.log("🌱 user_statuses seed executed");
