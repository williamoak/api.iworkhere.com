import "tsconfig-paths/register";
import { db } from "../src/services/dbService";

async function findDuplicates() {
    try {
        const result = await db.execute(`
            SELECT slug, lang, count(*)
            FROM localizations
            GROUP BY slug, lang
            HAVING count(*) > 1;
        `);
        console.log("Duplicates found:", result.rows);
    } catch (err) {
        console.error("Error finding duplicates:", err);
    } finally {
        process.exit(0);
    }
}

findDuplicates();
