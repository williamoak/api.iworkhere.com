import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('throttleMiddleware', () => {
  beforeEach(() => {
    // Reset module-level state (counters Map) between tests
    vi.resetModules();
  });

  function mockReq(method = 'GET', path = '/v1/test') {
    return {
      method,
      path,
      route: { path },
    } as any;
  }

  function mockRes() {
    const listeners: Record<string, Function[]> = {};

    return {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: null as any,

      setHeader(key: string, value: string) {
        this.headers[key] = value;
      },

      status(code: number) {
        this.statusCode = code;
        return this;
      },

      json(payload: any) {
        this.body = payload;
        return this;
      },

      once(event: string, cb: Function) {
        listeners[event] ??= [];
        listeners[event].push(cb);
      },

      emit(event: string) {
        for (const cb of listeners[event] ?? []) {
          cb();
        }
      },
    } as any;
  }

  it('allows request when under concurrency limit', async () => {
    const { throttleMiddleware } = await import('@middleware/throttleMiddleware');

    const mw = throttleMiddleware(1);

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });

  it('rejects request immediately when concurrency limit is reached', async () => {
    const { throttleMiddleware } = await import('@middleware/throttleMiddleware');

    const mw = throttleMiddleware(1);

    const req1 = mockReq();
    const res1 = mockRes();
    const next1 = vi.fn();

    const req2 = mockReq();
    const res2 = mockRes();
    const next2 = vi.fn();

    await mw(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    await mw(req2, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(429);
    expect(res2.headers['Retry-After']).toBe('1');
    expect(res2.body).toEqual({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many concurrent requests',
    });
  });

  it('releases concurrency slot when response finishes', async () => {
    const { throttleMiddleware } = await import('@middleware/throttleMiddleware');

    const mw = throttleMiddleware(1);

    const req1 = mockReq();
    const res1 = mockRes();
    const next1 = vi.fn();

    const req2 = mockReq();
    const res2 = mockRes();
    const next2 = vi.fn();

    await mw(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    res1.emit('finish');

    await mw(req2, res2, next2);

    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(200);
  });

  it('releases concurrency slot when response closes', async () => {
    const { throttleMiddleware } = await import('@middleware/throttleMiddleware');

    const mw = throttleMiddleware(1);

    const req1 = mockReq();
    const res1 = mockRes();
    const next1 = vi.fn();

    const req2 = mockReq();
    const res2 = mockRes();
    const next2 = vi.fn();

    await mw(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    res1.emit('close');

    await mw(req2, res2, next2);

    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(200);
  });

  it('keeps GET and POST requests in separate concurrency buckets', async () => {
    const { throttleMiddleware } = await import('@middleware/throttleMiddleware');

    const mw = throttleMiddleware(1);

    const getReq = mockReq('GET', '/v1/test');
    const getRes = mockRes();
    const getNext = vi.fn();

    const postReq = mockReq('POST', '/v1/test');
    const postRes = mockRes();
    const postNext = vi.fn();

    await mw(getReq, getRes, getNext);
    expect(getNext).toHaveBeenCalledTimes(1);

    await mw(postReq, postRes, postNext);

    expect(postNext).toHaveBeenCalledTimes(1);
    expect(postRes.statusCode).toBe(200);
  });
});