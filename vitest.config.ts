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
        },
    },
});
