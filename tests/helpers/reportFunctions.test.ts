/**
 * @file reportFunctions.test.ts
 * @internal
 * @module tests/helpers
 * @tag reporting, functions, tests
 * @summary Unit tests for centralized report functions registry and evaluator.
 */

import { describe, expect, it } from 'vitest';
import {
  functionRegistry,
  CURATED_FUNCTIONS,
  getCuratedFunction,
  registerCuratedFunction,
  listCuratedFunctions,
  isCuratedFunction,
  parseFunctionInvocation,
  evaluateFunctionInvocation,
  evaluateFunctions,
} from '@helpers/reportFunctions';

describe('reportFunctions helper', () => {
  const SAMPLE_DATA = [
    { id: '1', city: 'Toronto', latitude: 43.65, count: 10 },
    { id: '2', city: 'Toronto', latitude: 43.66, count: 20 },
    { id: '3', city: 'Calgary', latitude: 51.04, count: 15 },
    { id: '4', city: 'Calgary', latitude: 51.05, count: 25 },
  ];

  it('lists and retrieves built-in curated functions', () => {
    const list = listCuratedFunctions();
    expect(list.length).toBeGreaterThanOrEqual(8);

    const countFn = getCuratedFunction('count');
    expect(countFn).toBeDefined();
    expect(countFn?.name).toBe('count');

    expect(getCuratedFunction('num_hits')).toBeDefined();
    expect(getCuratedFunction('hits')).toBeDefined();
    expect(getCuratedFunction('total')).toBeDefined();
    expect(getCuratedFunction('count_distinct')).toBeDefined();
    expect(getCuratedFunction('sum')).toBeDefined();
    expect(getCuratedFunction('avg')).toBeDefined();
    expect(getCuratedFunction('min')).toBeDefined();
    expect(getCuratedFunction('max')).toBeDefined();
    expect(getCuratedFunction('first')).toBeDefined();
    expect(getCuratedFunction('last')).toBeDefined();
  });

  it('correctly identifies whether a key/value pair is a curated function', () => {
    expect(isCuratedFunction('num_hits', 'count')).toBe(true);
    expect(isCuratedFunction('city', 'count')).toBe(true);
    expect(isCuratedFunction('num_hits', 0)).toBe(true);
    expect(isCuratedFunction('hits', 'xxx')).toBe(true);
    expect(isCuratedFunction('devices', 'count_distinct(deviceId)')).toBe(true);
    expect(isCuratedFunction('custom_fn', { fn: 'sum', column: 'latitude' })).toBe(true);

    const isKnownCol = (col: string) => ['city', 'touch_time'].includes(col);
    expect(isCuratedFunction('city', 'city', isKnownCol)).toBe(false);
    expect(isCuratedFunction('touch_time', 'touch_time', isKnownCol)).toBe(false);
  });

  it('parses function expressions into typed FunctionInvocation descriptors', () => {
    const inv1 = parseFunctionInvocation('num_hits', 'count');
    expect(inv1).toEqual({
      outputKey: 'num_hits',
      functionName: 'count',
      targetColumn: null,
      rawExpression: 'count',
    });

    const inv2 = parseFunctionInvocation('devices', 'count_distinct(device_id)', (col) =>
      col === 'device_id' ? 'deviceId' : col,
    );
    expect(inv2).toEqual({
      outputKey: 'devices',
      functionName: 'count_distinct',
      targetColumn: 'deviceId',
      rawExpression: 'count_distinct(device_id)',
    });

    const inv3 = parseFunctionInvocation('avg_lat', { fn: 'avg', column: 'latitude' });
    expect(inv3).toEqual({
      outputKey: 'avg_lat',
      functionName: 'avg',
      targetColumn: 'latitude',
      rawExpression: { fn: 'avg', column: 'latitude' },
    });

    const inv4 = parseFunctionInvocation('num_hits', 0);
    expect(inv4).toEqual({
      outputKey: 'num_hits',
      functionName: 'count',
      targetColumn: null,
      rawExpression: 0,
    });
  });

  it('evaluates count, distinct count, sum, avg, min, max, first, and last across dataset', () => {
    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'total',
        functionName: 'count',
      }),
    ).toBe(4);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'unique_cities',
        functionName: 'count_distinct',
        targetColumn: 'city',
      }),
    ).toBe(2);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'total_count',
        functionName: 'sum',
        targetColumn: 'count',
      }),
    ).toBe(70);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'avg_count',
        functionName: 'avg',
        targetColumn: 'count',
      }),
    ).toBe(17.5);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'min_count',
        functionName: 'min',
        targetColumn: 'count',
      }),
    ).toBe(10);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'max_count',
        functionName: 'max',
        targetColumn: 'count',
      }),
    ).toBe(25);

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'first_city',
        functionName: 'first',
        targetColumn: 'city',
      }),
    ).toBe('Toronto');

    expect(
      evaluateFunctionInvocation(SAMPLE_DATA, {
        outputKey: 'last_city',
        functionName: 'last',
        targetColumn: 'city',
      }),
    ).toBe('Calgary');
  });

  it('evaluates multiple function invocations simultaneously', () => {
    const invocations = [
      { outputKey: 'total_records', functionName: 'count' },
      { outputKey: 'unique_cities', functionName: 'count_distinct', targetColumn: 'city' },
      { outputKey: 'total_sum', functionName: 'sum', targetColumn: 'count' },
    ];

    const result = evaluateFunctions(SAMPLE_DATA, invocations);
    expect(result).toEqual({
      total_records: 4,
      unique_cities: 2,
      total_sum: 70,
    });
  });

  it('allows registering custom functions in the central registry', () => {
    registerCuratedFunction({
      name: 'custom_multiplier',
      aliases: ['multiply', 'multiplier'],
      description: 'Multiplies record count by 10',
      evaluate: (records) => records.length * 10,
    });

    const parsed = parseFunctionInvocation('scaled_hits', 'multiply');
    expect(parsed?.functionName).toBe('custom_multiplier');
    expect(evaluateFunctionInvocation(SAMPLE_DATA, parsed!)).toBe(40);
  });
});
