import { vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';

export const createBaseDbMock = () => {
  const mock: any = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockImplementation((cb) => cb(mock)),
    // Default then implementation for promise-like behavior in chaining
    then: vi.fn().mockImplementation((cb) => Promise.resolve(cb ? cb([]) : [])),
  };
  return mock;
};

export const createDbServiceMock = (dbOverrides = {}) => {
  const dbStorage = new AsyncLocalStorage<any>();
  const baseDb = { ...createBaseDbMock(), ...dbOverrides };
  
  return {
    __esModule: true,
    dbStorage,
    baseDb,
    db: new Proxy({}, {
      get(_, prop) {
        const instance = dbStorage.getStore() || baseDb;
        return instance[prop];
      }
    }),
    getDb: () => dbStorage.getStore() || baseDb,
    pool: new Proxy({}, {
      get(_, prop) {
        if (prop === 'query') return vi.fn().mockResolvedValue({ rows: [] });
        if (prop === 'on') return vi.fn();
        if (prop === 'connect') return vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() });
        return vi.fn();
      }
    }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    verifyConnection: vi.fn().mockResolvedValue({ now: new Date() }),
    schema: {} // Mock schema if needed
  };
};
