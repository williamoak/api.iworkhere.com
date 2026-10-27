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

import fs from 'fs';
import { X509Certificate } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config, configGet } from '@helpers/config.js';
import * as schema from '@db/schema';
export { schema };

// === Environment variables ===
const DB_HOST = configGet('DB_HOSTNAME');
const DB_PORT = Number(configGet('DB_PORT'));
const DB_NAME = configGet('DB_NAME');
const DB_USER = configGet('DB_USER');
const DB_CERT_DIR = configGet('DB_CERT_DIR');
const DEBUG = ['1', 'true', 'yes', 'on'].includes(
  config.DEBUG?.trim().toLowerCase() ?? '',
);

// === TLS configuration ===
const ssl = {
  ca: fs.readFileSync(`${DB_CERT_DIR}/ca.crt`, 'utf8'),
  cert: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.crt`, 'utf8'),
  key: fs.readFileSync(`${DB_CERT_DIR}/client.${DB_USER}.key`, 'utf8'),
  rejectUnauthorized: true,
  servername: DB_HOST,
};

type CertificateSummary = {
  subject?: string;
  issuer?: string;
  subjectAltName?: string;
  validFrom?: string;
  validTo?: string;
  fingerprint256?: string;
};

function summarizeCertificate(pem: string | undefined): CertificateSummary | undefined {
  if (!pem) return undefined;

  try {
    const certificate = new X509Certificate(pem);
    return {
      subject: certificate.subject,
      issuer: certificate.issuer,
      subjectAltName: certificate.subjectAltName,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      fingerprint256: certificate.fingerprint256,
    };
  } catch (error) {
    if (DEBUG) {
      console.warn('[db] Unable to inspect configured TLS certificate', {
        error: describeError(error),
      });
    }
    return undefined;
  }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { value: String(error) };

  const candidate = error as Error & {
    code?: string;
    errno?: string;
    syscall?: string;
    address?: string;
    port?: number;
    reason?: string;
    host?: string;
  };

  return {
    name: candidate.name,
    message: candidate.message,
    code: candidate.code,
    errno: candidate.errno,
    syscall: candidate.syscall,
    address: candidate.address,
    port: candidate.port,
    reason: candidate.reason,
    host: candidate.host,
  };
}

function summarizePeerCertificate(client: unknown) {
  const candidate = client as {
    connection?: {
      stream?: {
        getPeerCertificate?: (detailed?: boolean) => {
          subject?: unknown;
          issuer?: unknown;
          subjectaltname?: string;
          valid_from?: string;
          valid_to?: string;
          fingerprint256?: string;
        };
      };
    };
  };
  const certificate = candidate.connection?.stream?.getPeerCertificate?.(true);
  if (!certificate || Object.keys(certificate).length === 0) return undefined;

  return {
    subject: certificate.subject,
    issuer: certificate.issuer,
    subjectAltName: certificate.subjectaltname,
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to,
    fingerprint256: certificate.fingerprint256,
  };
}

// === Shared connection pool ===
export const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  ssl,
});

if (DEBUG) {
  console.info('[db] Configured CockroachDB connection', {
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    tlsServername: ssl.servername,
    rejectUnauthorized: ssl.rejectUnauthorized,
    certDir: DB_CERT_DIR,
    clientCertificate: summarizeCertificate(ssl.cert),
  });
}

pool.on('error', (error) => {
  if (DEBUG) {
    console.error('[db] Unexpected idle-client error', describeError(error));
  }
});

// === Base Drizzle ORM Instance ===
export const baseDb = drizzle<typeof schema>(pool, { schema });

import { AsyncLocalStorage } from 'async_hooks';

// === Scoped DB Access ===
export const dbStorage = new AsyncLocalStorage<typeof baseDb>();

export function getDb() {
  return dbStorage.getStore() || baseDb;
}

// === Scoped DB Access Proxy ===
export const db = new Proxy({} as typeof baseDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

// === Legacy raw SQL (still available) ===
export async function query(sql: string, params?: unknown[]) {
  return pool.query(sql, params);
}

/**
 * Simple DB connectivity check
 * Used at server startup
 */
export async function verifyConnection() {
  const startedAt = Date.now();
  let client: PoolClient | undefined;

  if (DEBUG) {
    console.info('[db] Verifying CockroachDB connection', {
      host: DB_HOST,
      port: DB_PORT,
      tlsServername: ssl.servername,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    });
  }

  try {
    client = await pool.connect();
    const result = await client.query('SELECT now()');

    const peerCertificate = summarizePeerCertificate(client);

    console.info(
      `cockroach server connected using certificate SANs ${peerCertificate?.subjectAltName ?? 'unknown'}`,
    );

    if (DEBUG) {
      console.info('[db] CockroachDB connection verified', {
        elapsedMs: Date.now() - startedAt,
        serverTime: result.rows[0]?.now,
        peerCertificate,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
      });
    }

    return { now: result.rows[0].now };
  } catch (error) {
    if (DEBUG) {
      console.error('[db] CockroachDB connection failed', {
        elapsedMs: Date.now() - startedAt,
        connection: {
          host: DB_HOST,
          port: DB_PORT,
          database: DB_NAME,
          user: DB_USER,
          tlsServername: ssl.servername,
          rejectUnauthorized: ssl.rejectUnauthorized,
        },
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        error: describeError(error),
      });
    }
    throw error;
  } finally {
    client?.release();
  }
}

