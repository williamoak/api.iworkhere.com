import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import * as path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@src": path.resolve(__dirname, "src"),
            "@helpers": path.resolve(__dirname, "src/helpers"),
            "@services": path.resolve(__dirname, "src/services"),
            "@routes": path.resolve(__dirname, "src/routes"),
            "@schemas": path.resolve(__dirname, "src/schemas"),
            "@models": path.resolve(__dirname, "src/models"),
            "@utils": path.resolve(__dirname, "src/utils"),
            "@loaders": path.resolve(__dirname, "src/loaders"),
            "@middleware": path.resolve(__dirname, "src/middleware"),
            "@tests": path.resolve(__dirname, "tests"),
        }
    },

    plugins: [
        tsconfigPaths(), // keeps IDE + runtime resolution aligned
    ],

    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],

        // ----------------------------------------------
        // Coverage
        // ----------------------------------------------
        coverage: {
            provider: "v8",
            enabled: true,
            reportsDirectory: "./coverage",
            reporter: ["text", "html"],
            include: ["src/**/*.ts"],
        },
    },
});
