/**
 * Auto-generates schema metadata files for health endpoints.
 *
 * Reads /v1/health/<endpoint>/GET.ts
 * Executes handler() in dry-run mode
 * Extracts shape of returned.data
 * Writes src/schemas/health/<endpoint>.schema.ts
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

const HEALTH_ROOT = path.resolve("src/routes/v1/health");
const SCHEMA_OUT = path.resolve("src/schemas/health");

function typeOf(value: any): string {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
}

function extractTypes(obj: any): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj || {})) {
        if (typeof value === "object" && !Array.isArray(value) && value !== null) {
            out[key] = "object";
        } else {
            out[key] = typeOf(value);
        }
    }
    return out;
}

async function generate() {
    const endpoints = fs.readdirSync(HEALTH_ROOT);

    for (const name of endpoints) {
        const getPath = path.join(HEALTH_ROOT, name, "GET.ts");
        if (!fs.existsSync(getPath)) continue;

        const mod = await import(pathToFileURL(getPath).href);

        if (typeof mod.default !== "function") continue;

        // ----- Dry-run handler -----
        let result: any;
        try {
            // mock req/res minimal objects
            const req = {};
            const res = {};
            result = await mod.default(req, res);
        } catch {
            // If handler cannot run (DB, network), skip
            continue;
        }

        if (!result || typeof result !== "object" || !result.data) continue;

        const types = extractTypes(result.data);

        // ----- Write schema file -----
        const schemaFile = path.join(SCHEMA_OUT, `${name}.schema.ts`);
        const content = `export default {
    description: "Auto-generated schema for /v1/health/${name}",
    returns: ${JSON.stringify(types, null, 4)}
};
`;

        fs.writeFileSync(schemaFile, content);
        console.log(`✓ Generated ${schemaFile}`);
    }

    console.log("Done.");
}

generate();
