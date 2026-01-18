export default {
    testEnvironment: "node",

    testMatch: [
        "<rootDir>/tests/**/*.test.ts"
    ],

    extensionsToTreatAsEsm: [".ts"],

    transform: {
        "^.+\\.ts$": [
            "@swc/jest",
            {
                sourceMaps: true,
                module: { type: "es6" },
                jsc: {
                    parser: {
                        syntax: "typescript",
                        tsx: false,
                        decorators: false
                    },
                    target: "es2022"
                }
            }
        ]
    },

    setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"],

    moduleNameMapper: {
        // --- ESM .js → TS source resolution (REQUIRED) ---
        "^@src/(.*)\\.js$": "<rootDir>/src/$1.ts",
        "^@helpers/(.*)\\.js$": "<rootDir>/src/helpers/$1.ts",
        "^@services/(.*)\\.js$": "<rootDir>/src/services/$1.ts",
        "^@controllers/(.*)\\.js$": "<rootDir>/src/controllers/$1.ts",
        "^@models/(.*)\\.js$": "<rootDir>/src/models/$1.ts",
        "^@middleware/(.*)\\.js$": "<rootDir>/src/middleware/$1.ts",
        "^@loaders/(.*)\\.js$": "<rootDir>/src/loaders/$1.ts",
        "^@utils/(.*)\\.js$": "<rootDir>/src/utils/$1.ts",
        "^@routes/(.*)\\.js$": "<rootDir>/src/routes/$1.ts",
        "^@schemas/(.*)\\.js$": "<rootDir>/src/schemas/$1.ts",

        // --- Existing extensionless aliases (keep these) ---
        "^@src/(.*)$": "<rootDir>/src/$1",
        "^@helpers/(.*)$": "<rootDir>/src/helpers/$1",
        "^@services/(.*)$": "<rootDir>/src/services/$1",
        "^@controllers/(.*)$": "<rootDir>/src/controllers/$1",
        "^@models/(.*)$": "<rootDir>/src/models/$1",
        "^@middleware/(.*)$": "<rootDir>/src/middleware/$1",
        "^@loaders/(.*)$": "<rootDir>/src/loaders/$1",
        "^@utils/(.*)$": "<rootDir>/src/utils/$1",
        "^@routes/(.*)$": "<rootDir>/src/routes/$1",
        "^@schemas/(.*)$": "<rootDir>/src/schemas/$1",
        "^@tests/(.*)$": "<rootDir>/tests/$1"
    },

    clearMocks: true,
    resetMocks: true,
    restoreMocks: true
};
