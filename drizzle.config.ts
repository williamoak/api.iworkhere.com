import type { Config } from "drizzle-kit";
import * as fs from "fs";

import { config, configGet } from "./src/helpers/config";

const DB_HOST     = configGet("DB_HOSTNAME");
const DB_PORT     = Number(config.DB_PORT || 26257);
const DB_NAME     = configGet("DB_NAME");
const DB_USER     = configGet("DB_USER");
const DB_CERT_DIR = configGet("DB_CERT_DIR");

export default {
    schema: "./src/db/schema/index.ts",
    out: "./src/db/migrations",
    dialect: "postgresql",          // CockroachDB uses pg dialect
    dbCredentials: {
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        ssl: {
            ca: fs.readFileSync(`${DB_CERT_DIR}/ca.crt`, "utf8"),
            cert: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.crt`, "utf8"),
            key: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.key`, "utf8"),
            rejectUnauthorized: true,
            servername: DB_HOST
        }
    }
} satisfies Config;
