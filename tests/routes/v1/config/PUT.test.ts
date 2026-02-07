/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/config
 * @tag config, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/config/PUT.test.ts
 * @summary Unit tests for PUT /v1/config upsert logic (repository-driven).
 * @description
 * Verifies that config upsert logic:
 *   - updates an existing record when (name, version) exists
 *   - inserts a new record when (name, version) does not exist
 *
 * @query
 *   {}
 *
 * @requestExample
 * none
 *
 * @response
 * {
 *   "ok": true
 * }
 *
 * @requires
 * {
 *   "routes": [
 *     "routes/v1/config/PUT"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * IMPORTANT:
 * The route module imports uuidv7 from 'uuidv7'. Mock it so the test
 * is deterministic and doesn't depend on randomness.
 */
vi.mock('uuidv7', () => ({
    uuidv7: () => 'fixed-uuid',
}))

import { __test__ } from '@routes/v1/config/PUT'
import type { ConfigWriteRepository, ConfigRecord } from '@routes/v1/config/PUT'

const { upsertConfig } = __test__

beforeEach(() => {
    vi.resetAllMocks()
})

describe('config PUT upsert logic (unit)', () => {
    test('updates existing record when name+version exists', async () => {
        const existing: ConfigRecord = {
            id: 'existing-id',
            name: 'feature',
            version: '1.00',
            value: { enabled: true },
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        }

        const repo: ConfigWriteRepository = {
            findByNameVersion: vi.fn().mockResolvedValue(existing),
            insert: vi.fn(),
            update: vi.fn().mockResolvedValue({
                ...existing,
                value: { enabled: false },
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        }

        const result = await upsertConfig(repo, {
            name: 'feature',
            version: '1.00',
            value: { enabled: false },
        })

        expect(repo.findByNameVersion).toHaveBeenCalledWith('feature', '1.00')
        expect(repo.update).toHaveBeenCalledWith('existing-id', { enabled: false })
        expect(repo.insert).not.toHaveBeenCalled()

        expect(result.id).toBe('existing-id')
        expect((result.value as any).enabled).toBe(false)
    })

    test('inserts new record when name+version does not exist', async () => {
        const inserted: ConfigRecord = {
            id: 'fixed-uuid',
            name: 'theme',
            version: '2.00',
            value: { dark: true },
            createdAt: new Date('2026-03-01T00:00:00Z'),
            updatedAt: new Date('2026-03-01T00:00:00Z'),
        }

        const repo: ConfigWriteRepository = {
            findByNameVersion: vi.fn().mockResolvedValue(null),
            insert: vi.fn().mockResolvedValue(inserted),
            update: vi.fn(),
        }

        const result = await upsertConfig(repo, {
            name: 'theme',
            version: '2.00',
            value: { dark: true },
        })

        expect(repo.findByNameVersion).toHaveBeenCalledWith('theme', '2.00')
        expect(repo.insert).toHaveBeenCalledWith({
            id: 'fixed-uuid',
            name: 'theme',
            version: '2.00',
            value: { dark: true },
        })
        expect(repo.update).not.toHaveBeenCalled()

        expect(result).toEqual(inserted)
    })
})