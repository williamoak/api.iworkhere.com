import "tsconfig-paths/register";
import fs from "fs";
import path from "path";

interface DocBlockData {
    file: string;
    external: string[] | null;
    module: string;
    tag: string;
    version: string;
    path: string;
    summary: string;
    description: string;
    requestExample: any | null;
    response: any | null;
    requires: any | null;
    author: string;
}

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ["src", "api", "routes", "controllers"]; // adjust as needed
const OUTPUT_FILE = path.join(PROJECT_ROOT, "swagger.json");

// -----------------------------------------------------------------------------
// Helper: Recursively collect .ts files
// -----------------------------------------------------------------------------
function getAllTSFiles(dir: string): string[] {
    let list: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
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

// -----------------------------------------------------------------------------
// Helper: Extract @myDocBlock from file contents
// -----------------------------------------------------------------------------
function extractDocBlock(content: string): string | null {
    const regex = /\/\*\*([\s\S]*?)\*\//g;
    const matches = [...content.matchAll(regex)];

    if (matches.length === 0) return null;
    return matches[0][1]; // return first docblock content
}

// -----------------------------------------------------------------------------
// Helper: Parse a single docblock
// -----------------------------------------------------------------------------
function parseDocBlock(raw: string): DocBlockData | null {
    const get = (label: string) => {
        const r = new RegExp(`@${label}\\s+([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|$)`, "m");
        const m = raw.match(r);
        return m ? m[1].trim() : null;
    };

    const jsonParseSafe = (str: string | null) => {
        if (!str) return null;
        try {
            return JSON.parse(str);
        } catch (_) {
            return null;
        }
    };

    return {
        file: get("file") || "",
        external: jsonParseSafe(get("external")),
        module: get("module") || "",
        tag: get("tag") || "",
        version: get("version") || "",
        path: get("path")?.replace(/"/g, "") || "",
        summary: get("summary") || "",
        description: get("description") || "",
        requestExample: jsonParseSafe(get("requestExample")),
        response: jsonParseSafe(get("response")),
        requires: jsonParseSafe(get("requires")),
        author: get("author") || ""
    };
}

// -----------------------------------------------------------------------------
// Convert docblocks to Swagger paths
// -----------------------------------------------------------------------------
function convertToSwagger(docblocks: DocBlockData[]) {
    const paths: any = {};
    const infoTags = new Set<string>();

    for (const d of docblocks) {
        if (!d.path || d.path === "none") continue;

        infoTags.add(d.tag);

        paths[d.path] = {
            post: {
                summary: d.summary,
                description: d.description,
                tags: [d.tag],
                requestBody: d.requestExample
                    ? {
                        required: true,
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                                example: d.requestExample
                            }
                        }
                    }
                    : undefined,
                responses: {
                    200: {
                        description: "Successful response",
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                                example: d.response || {}
                            }
                        }
                    }
                }
            }
        };
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "API Documentation",
            version: "1.0.0"
        },
        tags: [...infoTags].map(tag => ({ name: tag })),
        paths
    };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
function run() {
    console.log("🔍 Scanning project for @myDocBlock files...");

    const allFiles = TARGET_DIRS
        .map(d => path.join(PROJECT_ROOT, d))
        .filter(fs.existsSync)
        .flatMap(dir => getAllTSFiles(dir));

    const results: DocBlockData[] = [];

    for (const file of allFiles) {
        const content = fs.readFileSync(file, "utf8");
        const rawBlock = extractDocBlock(content);

        if (!rawBlock) continue;

        const parsed = parseDocBlock(rawBlock);
        if (parsed) {
            results.push(parsed);
            console.log(`✔ Found docblock in ${file}`);
        }
    }

    console.log(`📦 Extracted ${results.length} docblocks.`);

    const swagger = convertToSwagger(results);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(swagger, null, 2));

    console.log(`\n✅ Swagger file generated at: ${OUTPUT_FILE}`);
}

run();
