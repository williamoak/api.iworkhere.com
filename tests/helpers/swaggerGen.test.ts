import { describe, it, expect } from "vitest";
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
        expect(inferHttpMethodFromFile("/x/PUT.ts")).toBe("put");
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

it("convertToSwagger skips entries with invalid method", () => {
    const swagger = convertToSwagger([
        {
            isExternal: true,
            module: "",
            tag: "api",
            version: "1.0",
            path: "/bad",
            summary: "",
            description: "",
            author: "",
            query: null,
            __sourceFile: "/x/FOO.ts"
        }
    ]);

    expect(Object.keys(swagger.paths)).toHaveLength(0);
});

