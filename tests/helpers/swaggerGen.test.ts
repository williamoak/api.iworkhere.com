import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import { __test__ } from "@helpers/swaggerGen";

const {
    extractDocBlock,
    hasExternalMarker,
    inferHttpMethodFromFile,
    normalizePath,
    buildQueryParameters,
    getSingleLineTag,
    getBlockTag,
    derivePathFromFile,
    extractJsonObject,
    convertToSwagger,
} = __test__;

describe("swaggerGen helpers", () => {

    /* ------------------------------------------------------------------ */
    /* extractDocBlock                                                     */
    /* ------------------------------------------------------------------ */

    it("extractDocBlock returns null if not @myDocBlock", () => {
        const src = `
        /**
         * @file test.ts
         * @summary Not a myDocBlock
         */
        `;
        expect(extractDocBlock(src)).toBeNull();
    });

    it("extractDocBlock returns full block when @myDocBlock is present", () => {
        const src = `
        /**
         * @myDocBlock
         * @file test.ts
         * @summary Example
         */
        `;
        const block = extractDocBlock(src);

        expect(block).toContain("@myDocBlock");
        expect(block).toContain("@file test.ts");
        expect(block).toContain("@summary Example");
    });

    it("extractDocBlock ignores inline comments and non-block text", () => {
        const src = `
        // @myDocBlock
        const x = 1;
        `;
        expect(extractDocBlock(src)).toBeNull();
    });

    /* ------------------------------------------------------------------ */
    /* hasExternalMarker                                                   */
    /* ------------------------------------------------------------------ */

    it("detects @external marker", () => {
        expect(hasExternalMarker("@external")).toBe(true);
        expect(hasExternalMarker("@external public")).toBe(true);
        expect(hasExternalMarker("@internal")).toBe(false);
    });

    it("returns false when input is empty or undefined", () => {
        expect(hasExternalMarker("")).toBe(false);
        expect(hasExternalMarker(undefined as any)).toBe(false);
    });

    /* ------------------------------------------------------------------ */
    /* inferHttpMethodFromFile                                             */
    /* ------------------------------------------------------------------ */

    it("infers HTTP method from filename", () => {
        expect(inferHttpMethodFromFile("/x/GET.ts")).toBe("get");
        expect(inferHttpMethodFromFile("/x/POST.ts")).toBe("post");
        expect(inferHttpMethodFromFile("/x/GET.js")).toBe("get");
        expect(inferHttpMethodFromFile("/x/PUT.test.ts")).toBe("put");
        expect(inferHttpMethodFromFile("/x/DELETE.ts")).toBe("delete");
        expect(inferHttpMethodFromFile("/x/PATCH.ts")).toBe("patch");
    });

    it("returns null for unsupported or malformed filenames", () => {
        expect(inferHttpMethodFromFile("/x/foo.ts")).toBeNull();
        expect(inferHttpMethodFromFile("/x/GREAT.ts")).toBeNull();
        expect(inferHttpMethodFromFile("GRETA.ts")).toBeNull();
    });

    /* ------------------------------------------------------------------ */
    /* normalizePath                                                       */
    /* ------------------------------------------------------------------ */

    it("normalizePath enforces leading slash", () => {
        expect(normalizePath("/v1/health")).toBe("/v1/health");
    });

    it("normalizePath rejects missing or invalid paths", () => {
        expect(normalizePath("v1/health")).toBeNull();
        expect(normalizePath("")).toBeNull();
    });

    /* ------------------------------------------------------------------ */
    /* buildQueryParameters                                                */
    /* ------------------------------------------------------------------ */

    it("buildQueryParameters parses valid @query JSON", () => {
        const raw = `
        @query
        {
          "limit": {
            "type": "integer",
            "required": false
          }
        }
        `;

        const params = buildQueryParameters(raw);

        expect(params).toEqual([
            {
                name: "limit",
                in: "query",
                required: false,
                description: "",
                schema: {
                    type: "integer",
                    format: undefined,
                    default: undefined
                }
            }
        ]);
    });

    it("buildQueryParameters supports format and default fields", () => {
        const raw = `
        @query
        {
          "page": {
            "type": "integer",
            "format": "int32",
            "default": 1,
            "required": false
          }
        }
        `;

        const params = buildQueryParameters(raw);

        expect(params[0].schema).toEqual({
            type: "integer",
            format: "int32",
            default: 1
        });
    });

    it("buildQueryParameters returns empty array if no @query block", () => {
        const raw = `
        /**
         * @summary No query here
         */
        `;
        expect(buildQueryParameters(raw)).toEqual([]);
    });

    it("buildQueryParameters returns empty array on invalid JSON", () => {
        const raw = `
        @query
        {
          "limit": {
            "type": "integer",
        `;
        expect(buildQueryParameters(raw)).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/* getSingleLineTag                                                    */
/* ------------------------------------------------------------------ */

it("getSingleLineTag extracts single-line tags correctly", () => {
    const raw = `
    * @summary Hello world
    * @tag api
    * @version 1.2.3
    `;

    expect(getSingleLineTag(raw, "summary")).toBe("Hello world");
    expect(getSingleLineTag(raw, "tag")).toBe("api");
    expect(getSingleLineTag(raw, "version")).toBe("1.2.3");
});

it("getSingleLineTag returns empty string when tag is missing", () => {
    const raw = `
    * @summary Only summary here
    `;

    expect(getSingleLineTag(raw, "author")).toBe("");
});

/* ------------------------------------------------------------------ */
/* getBlockTag                                                         */
/* ------------------------------------------------------------------ */

it("getBlockTag extracts multi-line block content", () => {
    const raw = `
    * @description
    * Line one
    * Line two
    * Line three
    *
    * @summary Test
    `;

    const desc = getBlockTag(raw, "description");

    expect(desc).toBe("Line one\nLine two\nLine three");
});

it("getBlockTag returns null when block tag is missing", () => {
    const raw = `
    * @summary Only summary
    `;

    expect(getBlockTag(raw, "description")).toBeNull();
});

/* ------------------------------------------------------------------ */
/* derivePathFromFile                                                  */
/* ------------------------------------------------------------------ */

it("derivePathFromFile derives route path from routes directory", () => {
    const file = `${process.cwd()}/src/routes/v1/health/GET.ts`;

    expect(derivePathFromFile(file)).toBe("/v1/health");
});

it("derivePathFromFile returns '/' for root route file", () => {
    const file = `${process.cwd()}/src/routes/GET.ts`;

    expect(derivePathFromFile(file)).toBe("/");
});

it("derivePathFromFile returns null for files outside routes root", () => {
    expect(derivePathFromFile("/tmp/GET.ts")).toBeNull();
});

/* ------------------------------------------------------------------ */
/* extractJsonObject                                                   */
/* ------------------------------------------------------------------ */

it("extractJsonObject extracts JSON object after tag", () => {
    const raw = `
    * @query
    * {
    *   "limit": { "type": "integer" }
    * }
    `;

    const json = extractJsonObject(raw, "query");

    expect(json).toContain('"limit"');
});

it("extractJsonObject returns null if tag is missing", () => {
    expect(extractJsonObject("no tags here", "query")).toBeNull();
});

it("extractJsonObject returns null if brace is missing after tag", () => {
    expect(extractJsonObject("@query without braces", "query")).toBeNull();
});

it("extractJsonObject returns null if braces are unbalanced", () => {
    const raw = `
    * @query
    * {
    *   "limit": {
    `;

    expect(extractJsonObject(raw, "query")).toBeNull();
});

/* ------------------------------------------------------------------ */
/* convertToSwagger                                                    */
/* ------------------------------------------------------------------ */

it("convertToSwagger includes only external endpoints", () => {
    const swagger = convertToSwagger([
        {
            isExternal: false,
            module: "",
            tag: "api",
            version: "1.0",
            path: "/internal",
            summary: "",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/x/GET.ts"
        },
        {
            isExternal: true,
            module: "",
            tag: "health",
            version: "1.0",
            path: "/health",
            summary: "Health check",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/x/GET.ts"
        }
    ]);

    expect(swagger.paths["/health"]).toBeDefined();
    expect(swagger.paths["/internal"]).toBeUndefined();
});

it("buildQueryParameters logs warning and returns empty array on invalid JSON", () => {
    const raw = `
    @query
    {
      "limit": { "type": "integer"
    }
    `;
    expect(buildQueryParameters(raw)).toEqual([]);
});

it("convertToSwagger handles multiple methods on same route and default tags", () => {
    const swagger = convertToSwagger([
        {
            isExternal: true,
            module: "",
            tag: "",
            version: "1.0",
            path: "/items",
            summary: "Get items",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/x/GET.ts",
        },
        {
            isExternal: true,
            module: "",
            tag: "",
            version: "1.0",
            path: "/items",
            summary: "Post item",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/x/POST.ts",
        },
        {
            isExternal: true,
            module: "",
            tag: "invalid",
            version: "1.0",
            path: null,
            summary: "",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/tmp/nonroute/GET.ts",
        },
    ]);

    expect(swagger.paths["/items"]).toBeDefined();
    expect((swagger.paths["/items"] as any).get).toBeDefined();
    expect((swagger.paths["/items"] as any).post).toBeDefined();
    expect(swagger.tags).toEqual([{ name: "api" }]);
});

it("runs the CLI against a nested route tree and writes generated Swagger", async () => {
    const originalArgv = process.argv[1];
    const sourceFile = `${process.cwd()}/src/helpers/swaggerGen.ts`;
    const routesRoot = `${process.cwd()}/src/routes`;
    const publicRouteFile = `${routesRoot}/v1/health/GET.ts`;
    const ignoredSourceFile = `${routesRoot}/ignored.ts`;
    const docblock = `
        /**
         * @myDocBlock
         * @external
         * @tag health
         * @summary Health check
         * @description
         * Returns the service health.
         * @query
         * { "verbose": { "type": "boolean", "required": false } }
         */
    `;
    const writeFileSync = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const readdirSync = vi.spyOn(fs, "readdirSync").mockImplementation((dir) => {
        if (dir === routesRoot) return ["v1", "ignored.ts", "types.d.ts"] as any;
        if (dir === `${routesRoot}/v1`) return ["health"] as any;
        if (dir === `${routesRoot}/v1/health`) return ["GET.ts", "README.md"] as any;
        throw new Error(`Unexpected directory: ${String(dir)}`);
    });
    const statSync = vi.spyOn(fs, "statSync").mockImplementation((file) => ({
        isDirectory: () => file === routesRoot + "/v1" || file === `${routesRoot}/v1/health`,
    } as any));
    const readFileSync = vi.spyOn(fs, "readFileSync").mockImplementation((file) => {
        if (file === publicRouteFile) return docblock as any;
        if (file === ignoredSourceFile) return "// no documentation" as any;
        throw new Error(`Unexpected file: ${String(file)}`);
    });
    const log = vi.fn();

    try {
        process.argv[1] = sourceFile;
        vi.resetModules();
        vi.doMock("@helpers/logger", () => ({ logger: { log, warn: vi.fn() } }));

        await import("@helpers/swaggerGen");

        expect(writeFileSync).toHaveBeenCalledTimes(1);
        const [outputFile, output] = writeFileSync.mock.calls[0];
        expect(outputFile).toContain("swagger.json");

        const generated = JSON.parse(output as string);
        expect(generated.paths["/v1/health"].get).toMatchObject({
            summary: "Health check",
            tags: ["health"],
            parameters: [{ name: "verbose", in: "query", required: false }],
        });
        expect(log).toHaveBeenCalledWith("  GET /v1/health");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("1 external endpoint"));
    } finally {
        process.argv[1] = originalArgv;
        writeFileSync.mockRestore();
        readdirSync.mockRestore();
        statSync.mockRestore();
        readFileSync.mockRestore();
        vi.doUnmock("@helpers/logger");
        vi.resetModules();
    }
});
