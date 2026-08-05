import { logger } from '@helpers/logger';

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedsDir = __dirname;
const SEED_SUFFIXES = [".seed.ts", ".seed.js"];

async function runSeeds() {
    const files = fs
        .readdirSync(seedsDir)
        .filter(f => SEED_SUFFIXES.some(suffix => f.endsWith(suffix)))
        .sort(); // numeric prefix controls order

    if (files.length === 0) {
        logger.warn("⚠️  No seed files found.");
        logger.warn("ℹ️  Expected seed files to match:");
        logger.warn("    - *.seed.ts");
        logger.warn("    - *.seed.js");
        logger.warn(`📁 Directory scanned: ${seedsDir}`);
        return;
    }

    for (const file of files) {
        logger.log(`🌱 Running seed: ${file}`);
        await import(path.join(seedsDir, file));
    }

    logger.log("✅ All seeds completed");
}

runSeeds()
    .then(() => process.exit(0))
    .catch(err => {
        logger.error("❌ Seed failure:", err);
        process.exit(1);
    });
