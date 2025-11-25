import fs from "fs";
import { Pool } from "pg";
import { configGet } from "@helpers/config";

// === Environment variables ===
const DB_HOST      = configGet("DB_HOST");
const DB_PORT     = Number(configGet("DB_PORT"));
const DB_NAME      = configGet("DB_NAME");
const DB_USER      = configGet("DB_USER");
const DB_CERT_DIR  = configGet("DB_CERT_DIR");

// === CockroachDB SSL configuration ===
export const ssl = {
    ca:   fs.readFileSync(`${DB_CERT_DIR}/ca.crt`, "utf8"),
    cert: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.crt`, "utf8"),
    key:  fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.key`, "utf8"),
    rejectUnauthorized: true,
    servername: DB_HOST
};

// === Connection Pool ===
export const db = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    ssl
});

// === Query helper ===
export async function query(sql: string, params?: any[]) {
    return db.query(sql, params);
}

// === Verify DB Connection ===
export async function verifyConnection() {
    const result = await db.query("SELECT now()");
    return { now: result.rows[0].now };
}
