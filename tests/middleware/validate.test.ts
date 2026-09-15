import { describe, test, expect, vi, beforeEach } from 'vitest';
import { makeValidator } from "@middleware/validate";
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

describe('validate middleware', () => {
  let mockRes: Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    mockNext = vi.fn() as NextFunction;
  });

  test('should pass global checks and proceed', async () => {
    const validator = makeValidator();
    const mockReq = { method: 'GET', headers: {} } as Request;
    await validator.request(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects body method with non-JSON Content-Type with 415', async () => {
    const validator = makeValidator();
    const req = {
      method: 'POST',
      body: { name: 'test' },
      headers: { 'content-type': 'text/plain' },
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(415);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNSUPPORTED_MEDIA_TYPE' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects non-plain object body', async () => {
    const validator = makeValidator();
    const req = {
      method: 'POST',
      body: [1, 2, 3],
      headers: { 'content-type': 'application/json' },
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVALID_REQUEST',
        message: 'Request body must be a JSON object',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects prototype pollution in request body', async () => {
    const validator = makeValidator();
    const pollutedBody = JSON.parse('{"__proto__": {"admin": true}}');
    const req = {
      method: 'POST',
      body: pollutedBody,
      headers: { 'content-type': 'application/json' },
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVALID_REQUEST',
        message: 'Request body contains forbidden keys',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('rejects prototype pollution in query parameters', async () => {
    const validator = makeValidator();
    const pollutedQuery = JSON.parse('{"constructor": "danger"}');
    const req = {
      method: 'GET',
      query: pollutedQuery,
      headers: {},
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVALID_REQUEST',
        message: 'Query string contains forbidden keys',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('validates and rejects invalid path parameters', async () => {
    const schema = z.object({ id: z.string().uuid() });
    const validator = makeValidator({ params: schema });

    const req = {
      method: 'GET',
      params: { id: 'not-a-uuid' },
      headers: {},
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVALID_REQUEST',
        message: 'Invalid path parameters',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('validates and accepts valid path parameters', async () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ params: schema });

    const req = {
      method: 'GET',
      params: { id: '123' },
      headers: {},
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.validated?.params).toEqual({ id: '123' });
  });

  test('validates and rejects invalid query parameters', async () => {
    const schema = z.object({ page: z.coerce.number().min(1) });
    const validator = makeValidator({ query: schema });

    const req = {
      method: 'GET',
      query: { page: '0' },
      headers: {},
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVALID_REQUEST',
        message: 'Invalid query parameters',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('validates and accepts valid query parameters', async () => {
    const schema = z.object({ page: z.coerce.number().min(1) });
    const validator = makeValidator({ query: schema });

    const req = {
      method: 'GET',
      query: { page: '2' },
      headers: {},
    } as unknown as Request;

    await validator.request(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(req.validated?.query).toEqual({ page: 2 });
  });

  test('should fail body validation', async () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ body: schema });
    
    const req = { method: 'POST', body: { wrong: 'field' }, headers: { 'content-type': 'application/json' } } as Request;
    await validator.request(req, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should pass body validation', async () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ body: schema });
    
    const req = { method: 'POST', body: { id: '123' }, headers: { 'content-type': 'application/json' } } as Request;
    await validator.request(req, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(req.validated?.body).toEqual({ id: '123' });
  });

  test('should validate response', () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ response: schema });
    
    const data = { id: '123' };
    expect(validator.response(data)).toEqual(data);
    
    expect(() => validator.response({ wrong: 'field' })).toThrow('Response validation failed');
  });

  test('response returns data untouched when no response schema provided', () => {
    const validator = makeValidator();
    const data = { anything: 123 };
    expect(validator.response(data)).toBe(data);
  });
});
