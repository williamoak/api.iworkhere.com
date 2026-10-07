/// <reference types="vitest" />

import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,

    // Equivalent to jest.setup.ts
    setupFiles: ['tests/vitest.setup.ts'],

    clearMocks: true,
    restoreMocks: true,

    // --- COVERAGE (new) ---
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        'src/services/dbService.ts',
        // Re-export-only compatibility shim; behavior is covered through the central cache module.
        'src/routes/v1/localization/localizationCache.ts',
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
      '@src': path.resolve(import.meta.dirname, 'src'),
      '@helpers': path.resolve(import.meta.dirname, 'src/helpers'),
      '@services': path.resolve(import.meta.dirname, 'src/services'),
      '@controllers': path.resolve(import.meta.dirname, 'src/controllers'),
      '@models': path.resolve(import.meta.dirname, 'src/models'),
      '@middleware': path.resolve(import.meta.dirname, 'src/middleware'),
      '@loaders': path.resolve(import.meta.dirname, 'src/loaders'),
      '@utils': path.resolve(import.meta.dirname, 'src/utils'),
      '@routes': path.resolve(import.meta.dirname, 'src/routes'),
      '@schemas': path.resolve(import.meta.dirname, 'src/schemas'),
      '@cache': path.resolve(import.meta.dirname, 'src/cache'),
      '@validation': path.resolve(import.meta.dirname, 'src/validation'),
      '@tests': path.resolve(import.meta.dirname, 'tests'),
      '@db': path.resolve(import.meta.dirname, 'src/db'),
      '@jobs': path.resolve(import.meta.dirname, 'src/jobs'),
    },
  },
});
