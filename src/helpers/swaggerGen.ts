/**
 * @myDocBlock v2.3
 * @file swaggerGen.ts
 * @internal
 * @module helpers
 * @tag tooling, swagger
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path @helpers/swaggerGen.ts
 * @summary Generate swagger.json from @myDocBlock route annotations.
 * @description
 * Build/dev-only Swagger/OpenAPI generator.
 *
 * PUBLIC ENDPOINT RULE (intentional):
 * - A docblock is PUBLIC if (and only if) the FIRST docblock in the file
 *   contains `@external` anywhere.
 * - If the FIRST docblock contains `@internal`, this file is treated as private.
 *
 * PATH RESOLUTION:
 * 1) If @path exists and starts with "/", it is used as-is.
 * 2) Otherwise, the path is derived from the filesystem under src/routes by
 *    removing the HTTP method filename (GET.ts/POST.ts/PUT.ts/DELETE.ts/PATCH.ts).
 *
 * SAFETY:
 * - This file is a build/dev utility and MUST NOT be imported at runtime.
 * @query none
 * @requestExample none
 * @response none
 * @requires
 * {
 *   "inputs": ["src\\/routes\\/**\\/*.ts"],
 *   "outputs": ["swagger.json"]
 * }
 */

import "tsconfig-paths/register";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocBlockData {
    isExternal: boolean;
    module: string;
    tag: string;
    version: string;
    path: string | null;
    summary: string;
    description: string;
    author: string;
    query: string | null;
    __sourceFile: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const ROUTES_ROOT = path.join(PROJECT_ROOT, "src/routes");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "swagger.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// NOTE:
// getAllTSFiles() is intentionally excluded from unit tests.
// It performs real filesystem traversal and is only used by the CLI runner.
// Covered indirectly via integration usage.
function getAllTSFiles(dir: string): string[] {
    let list: string[] = [];

    for (const entry of fs.readdirSync(dir)) {
        const resolved = path.join(dir, entry);
        const stat = fs.statSync(resolved);

        if (stat.isDirectory()) {
            list = list.concat(getAllTSFiles(resolved));
        } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
            list.push(resolved);
        }
    }

    return list;
}

function extractDocBlock(content: string): string | null {
    const match = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) return null;

    // Only accept @myDocBlock blocks
    if (!match[1].includes("@myDocBlock")) return null;

    return match[1];
}

function hasExternalMarker(raw: string): boolean {
    // Intentional: @internal means this file should not be processed as public
    if (/@internal\b/.test(raw)) return false;

    return /@external\b/.test(raw);
}

function getSingleLineTag(raw: string, label: string): string {
    const r = new RegExp(`@${label}\\s+([^\\n\\r*]+)`);
    const m = raw.match(r);
    return m ? m[1].trim() : "";
}

function getBlockTag(raw: string, label: string): string | null {
    const r = new RegExp(
        `@${label}[\\s\\r\\n]*([\\s\\S]*?)(?=\\n\\s*\\*\\s*@\\w+|\\n\\s*\\*/|$)`
    );

    const m = raw.match(r);
    if (!m) return null;

    return m[1]
        .split("\n")
        .map(line => line.replace(/^\s*\*\s?/, ""))
        .join("\n")
        .trim() || null;
}

function inferHttpMethodFromFile(filePath: string): string | null {
    const base = path.basename(filePath).toUpperCase();

    if (base.startsWith("GET")) return "get";
    if (base.startsWith("POST")) return "post";
    if (base.startsWith("PUT")) return "put";
    if (base.startsWith("DELETE")) return "delete";
    if (base.startsWith("PATCH")) return "patch";

    return null;
}

function derivePathFromFile(filePath: string): string | null {
    if (!filePath.startsWith(ROUTES_ROOT)) return null;

    const relative = filePath
        .replace(ROUTES_ROOT, "")
        .replace(/\\/g, "/")
        .replace(/\/(GET|POST|PUT|DELETE|PATCH)\.ts$/, "");

    return relative || "/";
}

function normalizePath(rawPath: string): string | null {
    const trimmed = rawPath.trim();

    // v2.2: path MUST be a pure URL path
    if (!trimmed.startsWith("/")) return null;

    return trimmed;
}

function extractJsonObject(raw: string, label: string): string | null {
    const tagIndex = raw.indexOf(`@${label}`);
    if (tagIndex === -1) return null;

    const braceStart = raw.indexOf("{", tagIndex);
    if (braceStart === -1) return null;

    let depth = 0;
    let i = braceStart;

    for (; i < raw.length; i++) {
        if (raw[i] === "{") depth++;
        else if (raw[i] === "}") {
            depth--;
            if (depth === 0) {
                return raw.slice(braceStart, i + 1);
            }
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Query handling
// ---------------------------------------------------------------------------

function buildQueryParameters(queryRaw: string | null) {
    if (!queryRaw) return [];

    const start = queryRaw.indexOf("{");
    const end = queryRaw.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        return [];
    }

    const jsonText = queryRaw.slice(start, end + 1);

    // ✅ remove JSDoc '*' prefixes
    const sanitized = jsonText
        .split("\n")
        .map(line => line.replace(/^\s*\*\s?/, ""))
        .join("\n")
        .trim();

    try {
        const parsed = JSON.parse(sanitized);

        return Object.entries(parsed).map(([name, def]: any) => ({
            name,
            in: "query",
            required: def.required === true,
            description: def.description || "",
            schema: {
                type: def.type || "string",
                format: def.format,
                default: def.default
            }
        }));
    } catch (err) {
        console.warn("⚠️  Invalid @query JSON, skipping:", err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Swagger conversion
// ---------------------------------------------------------------------------

function convertToSwagger(docblocks: DocBlockData[]) {
    const paths: Record<string, any> = {};
    const tags = new Set<string>();

    for (const d of docblocks) {
        if (!d.isExternal) continue;

        const method = inferHttpMethodFromFile(d.__sourceFile);
        if (!method) continue;

        const routePath =
            d.path
                ? normalizePath(d.path)
                : derivePathFromFile(d.__sourceFile);

        if (!routePath) continue;

        tags.add(d.tag || "api");

        paths[routePath] ??= {};
        paths[routePath][method] = {
            summary: d.summary,
            description: d.description,
            tags: [d.tag || "api"],
            parameters: buildQueryParameters(d.query),
            responses: {
                200: { description: "Successful response" },
                400: { description: "Bad request" },
                409: { description: "Conflict" },
                500: { description: "Internal server error" }
            }
        };
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "API Documentation",
            version: "1.0.0"
        },
        tags: [...tags].map(name => ({ name })),
        paths
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
    console.log("🔍 Scanning routes for @myDocBlock files...");

    const files = getAllTSFiles(ROUTES_ROOT);
    const parsed: DocBlockData[] = [];

    for (const file of files) {
        const raw = extractDocBlock(fs.readFileSync(file, "utf8"));
        if (!raw) continue;

        parsed.push({
            isExternal: hasExternalMarker(raw),
            module: getSingleLineTag(raw, "module"),
            tag: getSingleLineTag(raw, "tag"),
            version: getSingleLineTag(raw, "version"),
            path: getSingleLineTag(raw, "path") || null,
            summary: getSingleLineTag(raw, "summary"),
            description: getBlockTag(raw, "description") || "",
            author: getSingleLineTag(raw, "author"),
            query: extractJsonObject(raw, "query"),
            __sourceFile: file
        });
    }

    console.log(`📦 Parsed ${parsed.length} @myDocBlock(s).`);

    const swagger = convertToSwagger(parsed);

    console.log("\n🌐 Public API endpoints exposed:");
    let routes = 0;
    for (const [route, methods] of Object.entries(swagger.paths)) {
        for (const m of Object.keys(methods)) {
            console.log(`  ${m.toUpperCase()} ${route}`);
            routes++;
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(swagger, null, 2));
    console.log(`\n✅ ${routes} external endpoint(s) generated.`);
    console.log(`✅ Swagger file written to: ${OUTPUT_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run();
}

// At bottom of swaggerGen.ts
export const __test__ = {
    extractDocBlock,
    hasExternalMarker,
    getSingleLineTag,
    getBlockTag,
    inferHttpMethodFromFile,
    derivePathFromFile,
    normalizePath,
    extractJsonObject,
    buildQueryParameters,
    convertToSwagger,
};