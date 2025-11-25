/**
 * @file health.ts
 * @module Types.Health
 * @version 1.0.0
 * @path src/types/health.ts
 * @summary Shared TypeScript interfaces for health endpoints.
 * @description
 *   Standard response shape for all health check endpoints.
 */

export interface HealthResponse {
    /** Result status of health check */
    status: "ok" | "warn" | "fail";

    /** Short name of the health module (folder name under /v1/health) */
    name: string;

    /** Endpoint-specific data returned by the health check */
    data: any;
}
