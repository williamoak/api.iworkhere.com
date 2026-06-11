import { describe, test, expect, vi } from 'vitest';
import { makeValidator } from '../../src/middleware/validate';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

describe('validate middleware', () => {
  const mockReq = { method: 'GET', headers: {} } as Request;
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const mockNext = vi.fn() as NextFunction;

  test('should pass global checks and proceed', () => {
    const validator = makeValidator();
    validator.request(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('should fail body validation', () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ body: schema });
    
    const req = { method: 'POST', body: { wrong: 'field' }, headers: { 'content-type': 'application/json' } } as Request;
    validator.request(req, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should pass body validation', () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ body: schema });
    
    const req = { method: 'POST', body: { id: '123' }, headers: { 'content-type': 'application/json' } } as Request;
    validator.request(req, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(req.validated?.body).toEqual({ id: '123' });
  });

  test('should validate response', () => {
    const schema = z.object({ id: z.string() });
    const validator = makeValidator({ response: schema });
    
    const data = { id: '123' };
    expect(validator.response(data)).toEqual(data);
    
    expect(() => validator.response({ wrong: 'field' })).toThrow();
  });
});
