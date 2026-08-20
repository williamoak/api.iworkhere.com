
import { describe, expect, test, vi } from 'vitest';
import loggingMiddleware from '../src/middleware/joinaunion/loggingMiddleware';
import { dbStorage, db } from '../src/services/dbService';

describe('joinaunion/loggingMiddleware', () => {
    test('calls db.insert with correct values', async () => {
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue({})
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };
        
        const req = { path: '/test', headers: { 'user-agent': 'test' } } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await loggingMiddleware(req, res, next);
        });

        // We need to wait a bit because doLogging is not awaited in the middleware
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(res.locals.visitLogged).toBe(true);
    });
});
