/**
 * @myDocBlock
 * file: services/dbService.ts
 * @internal
 * module: infrastructure-database
 * tag: database
 * version: v1
 * path: internal
 * summary: PostgreSQL database service with TLS and Drizzle ORM.
 * description:
 *   Provides a shared PostgreSQL connection pool configured with
 *   client-side TLS authentication. Exposes a Drizzle ORM instance
 *   for structured queries, a legacy raw SQL query helper, and a
 *   connectivity verification function used during server startup.
 *
 * requestExample:
 *   n/a
 *
 * response:
 *   n/a
 *
 * requires:
 *   - Environment variables:
 *       DB_HOSTNAME
 *       DB_PORT
 *       DB_NAME
 *       DB_USER
 *       DB_CERT_DIR
 *   - TLS certificates:
 *       ca.crt
 *       client.<DB_USER>.crt
 *       client.<DB_USER>.key
 *   - PostgreSQL server with TLS enabled
 *   - node-postgres (pg)
 *   - drizzle-orm
 */

import fs from "fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { configGet } from "@helpers/config.js";

// === Environment variables ===
const DB_HOST     = configGet("DB_HOSTNAME");
const DB_PORT     = Number(configGet("DB_PORT"));
const DB_NAME     = configGet("DB_NAME");
const DB_USER     = configGet("DB_USER");
const DB_CERT_DIR = configGet("DB_CERT_DIR");

// === TLS configuration (unchanged) ===
const ssl = {
    ca: fs.readFileSync(`${DB_CERT_DIR}/ca.crt`, "utf8"),
    cert: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.crt`, "utf8"),
    key: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.key`, "utf8"),
    rejectUnauthorized: true,
    servername: DB_HOST,
};

// === Shared connection pool ===
export const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    ssl,
});

// === Drizzle ORM (new) ===
export const db = drizzle(pool);

// === Legacy raw SQL (still available) ===
export async function query(sql: string, params?: any[]) {
    return pool.query(sql, params);
}

/**
 * Simple DB connectivity check
 * Used at server startup
 */
export async function verifyConnection() {
    const result = await pool.query("SELECT now()");
    return { now: result.rows[0].now };
}
