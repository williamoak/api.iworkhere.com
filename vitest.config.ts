/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/**/*.test.ts"],

        // Equivalent to jest.setup.ts
        setupFiles: ["tests/vitest.setup.ts"],

        clearMocks: true,
        restoreMocks: true,

        // --- COVERAGE (new) ---
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: "coverage",
            exclude: [
                "node_modules/",
                "tests/",
                "**/*.test.ts",
                'src/services/dbService.ts',
            ],
            // Enforce minimum global coverage thresholds. If your project is
            // currently below these numbers, adjust thresholds temporarily and
            // raise them incrementally as you add tests.
            thresholds: {
                global: {
                    statements: 80,
                    branches: 75,
                    functions: 80,
                    lines: 80,
                },
            },
        },
    },

    resolve: {
        alias: {
            "@src": path.resolve(__dirname, "src"),
            "@helpers": path.resolve(__dirname, "src/helpers"),
            "@services": path.resolve(__dirname, "src/services"),
            "@controllers": path.resolve(__dirname, "src/controllers"),
            "@models": path.resolve(__dirname, "src/models"),
            "@middleware": path.resolve(__dirname, "src/middleware"),
            "@loaders": path.resolve(__dirname, "src/loaders"),
            "@utils": path.resolve(__dirname, "src/utils"),
            "@routes": path.resolve(__dirname, "src/routes"),
            "@schemas": path.resolve(__dirname, "src/schemas"),
            "@cache": path.resolve(__dirname, "src/cache"),
            "@tests": path.resolve(__dirname, "tests"),
            "@db": path.resolve(__dirname, "src/db")
        },
    },
});
