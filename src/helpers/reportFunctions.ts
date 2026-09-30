/**
 * @myDocBlock
 * @file reportFunctions.ts
 * @internal
 * @module helpers
 * @tag reporting, functions, aggregation
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path @helpers/reportFunctions.ts
 * @summary Centralized registry and evaluator for curated output shape report functions.
 *
 * @description
 * Provides a curated list of query and aggregation functions for dynamic output shapes
 * in report endpoints. Allows parsing function signatures (e.g. "count", "hits", "count_distinct(city)",
 * "sum(latitude)") and evaluating them across matching record sets and grouped aggregations.
 */

export interface CuratedFunctionDefinition {
  name: string;
  aliases: string[];
  description: string;
  requiresColumn?: boolean;
  evaluate: (
    records: Record<string, unknown>[],
    targetColumn?: string | null,
    options?: Record<string, unknown>,
  ) => unknown;
}

export interface FunctionInvocation {
  outputKey: string;
  functionName: string;
  targetColumn?: string | null;
  rawExpression?: unknown;
}

const BUILT_IN_FUNCTIONS: CuratedFunctionDefinition[] = [
  {
    name: 'count',
    aliases: [
      'count',
      'count()',
      'count(*)',
      ':count',
      'hits',
      'num_hits',
      'numhits',
      'numHits',
      'records',
      'record_count',
      'recordcount',
      'num_records',
      'numrecords',
      'numRecords',
      'total',
      'hit_count',
      'hitcount',
      'hitCount',
    ],
    description: 'Returns the number of matching records in the group or result set.',
    requiresColumn: false,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (targetColumn) {
        return records.filter(
          (r) =>
            r[targetColumn] !== null &&
            r[targetColumn] !== undefined &&
            r[targetColumn] !== '' &&
            String(r[targetColumn]).toLowerCase() !== 'null',
        ).length;
      }
      return records.length;
    },
  },
  {
    name: 'count_distinct',
    aliases: [
      'count_distinct',
      'count_distinct()',
      'distinct_count',
      'unique_count',
      'countDistinct',
    ],
    description: 'Returns the count of distinct non-null values for a column.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn) return records.length;
      const uniqueValues = new Set(
        records
          .map((r) => r[targetColumn])
          .filter((val) => val !== null && val !== undefined),
      );
      return uniqueValues.size;
    },
  },
  {
    name: 'sum',
    aliases: ['sum', 'sum()', 'total_sum'],
    description: 'Returns the arithmetic sum of numeric values for a column.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn) return 0;
      return records.reduce((acc, r) => {
        const val = Number(r[targetColumn]);
        return acc + (!isNaN(val) ? val : 0);
      }, 0);
    },
  },
  {
    name: 'avg',
    aliases: ['avg', 'avg()', 'average', 'mean'],
    description: 'Returns the arithmetic mean of numeric values for a column.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn || records.length === 0) return 0;
      const numbers = records
        .map((r) => Number(r[targetColumn]))
        .filter((val) => !isNaN(val));
      if (numbers.length === 0) return 0;
      return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
    },
  },
  {
    name: 'min',
    aliases: ['min', 'min()', 'minimum'],
    description: 'Returns the minimum value for a column.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn || records.length === 0) return null;
      let minVal: unknown = null;
      for (const rec of records) {
        const val = rec[targetColumn];
        if (val === null || val === undefined) continue;
        if (minVal === null || (val as number) < (minVal as number)) {
          minVal = val;
        }
      }
      return minVal;
    },
  },
  {
    name: 'max',
    aliases: ['max', 'max()', 'maximum'],
    description: 'Returns the maximum value for a column.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn || records.length === 0) return null;
      let maxVal: unknown = null;
      for (const rec of records) {
        const val = rec[targetColumn];
        if (val === null || val === undefined) continue;
        if (maxVal === null || (val as number) > (maxVal as number)) {
          maxVal = val;
        }
      }
      return maxVal;
    },
  },
  {
    name: 'first',
    aliases: ['first', 'first()'],
    description: 'Returns the value from the first matching record in the group.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn || records.length === 0) return null;
      const val = records[0][targetColumn];
      return val !== undefined ? val : null;
    },
  },
  {
    name: 'last',
    aliases: ['last', 'last()'],
    description: 'Returns the value from the last matching record in the group.',
    requiresColumn: true,
    evaluate: (records: Record<string, unknown>[], targetColumn?: string | null) => {
      if (!targetColumn || records.length === 0) return null;
      const val = records[records.length - 1][targetColumn];
      return val !== undefined ? val : null;
    },
  },
];

class FunctionRegistry {
  private functions = new Map<string, CuratedFunctionDefinition>();
  private aliasMap = new Map<string, string>();

  constructor() {
    for (const fn of BUILT_IN_FUNCTIONS) {
      this.register(fn);
    }
  }

  public register(fn: CuratedFunctionDefinition): void {
    const canonicalName = fn.name.toLowerCase();
    this.functions.set(canonicalName, fn);
    this.aliasMap.set(canonicalName, canonicalName);

    for (const alias of fn.aliases) {
      this.aliasMap.set(alias.toLowerCase(), canonicalName);
    }
  }

  public get(nameOrAlias: string): CuratedFunctionDefinition | undefined {
    const canonical = this.aliasMap.get(nameOrAlias.trim().toLowerCase());
    if (!canonical) return undefined;
    return this.functions.get(canonical);
  }

  public has(nameOrAlias: string): boolean {
    return this.aliasMap.has(nameOrAlias.trim().toLowerCase());
  }

  public list(): CuratedFunctionDefinition[] {
    return Array.from(this.functions.values());
  }
}

export const functionRegistry = new FunctionRegistry();

export const CURATED_FUNCTIONS = BUILT_IN_FUNCTIONS;

export function getCuratedFunction(nameOrAlias: string): CuratedFunctionDefinition | undefined {
  return functionRegistry.get(nameOrAlias);
}

export function registerCuratedFunction(fn: CuratedFunctionDefinition): void {
  functionRegistry.register(fn);
}

export function listCuratedFunctions(): CuratedFunctionDefinition[] {
  return functionRegistry.list();
}

/**
 * Checks if a key / value pair in output_shape represents a curated function.
 */
export function isCuratedFunction(
  key: string,
  value: unknown,
  isKnownColumn?: (name: string) => boolean,
): boolean {
  if (typeof value === 'string') {
    const trimmedVal = value.trim();
    const lowerVal = trimmedVal.toLowerCase();

    // Direct function name or alias match
    if (functionRegistry.has(lowerVal)) {
      return true;
    }

    // Pattern like fn(column_name)
    const fnCallMatch = lowerVal.match(/^([a-z_]+)\s*\((.*)\)$/);
    if (fnCallMatch && functionRegistry.has(fnCallMatch[1])) {
      return true;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const fnName = obj.fn ?? obj.function;
    if (typeof fnName === 'string' && functionRegistry.has(fnName)) {
      return true;
    }
  }

  const trimmedKey = key.trim();
  const lowerKey = trimmedKey.toLowerCase();

  // If the key is an alias for a function (like num_hits, hits, count, etc.)
  if (functionRegistry.has(lowerKey)) {
    return true;
  }

  // If value is numeric or wildcard count placeholder and key is not a registered database column
  if (typeof value === 'number' && (!isKnownColumn || !isKnownColumn(key))) {
    return true;
  }

  return false;
}

/**
 * Parses an output_shape field into a FunctionInvocation descriptor.
 */
export function parseFunctionInvocation(
  outputKey: string,
  rawValue: unknown,
  columnResolver?: (colName: string) => string | undefined,
): FunctionInvocation | null {
  const trimmedKey = outputKey.trim();

  // Case 1: Value is an object with fn/function property
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    const obj = rawValue as Record<string, unknown>;
    const rawFn = String(obj.fn ?? obj.function ?? obj.func ?? 'count');
    const fnDef = functionRegistry.get(rawFn);
    if (fnDef) {
      const rawCol =
        typeof obj.column === 'string'
          ? obj.column
          : typeof obj.col === 'string'
            ? obj.col
            : typeof obj.target === 'string'
              ? obj.target
              : typeof obj.field === 'string'
                ? obj.field
                : undefined;
      const targetColumn = rawCol && columnResolver ? (columnResolver(rawCol) ?? rawCol) : rawCol;
      return {
        outputKey: trimmedKey,
        functionName: fnDef.name,
        targetColumn: targetColumn ?? null,
        rawExpression: rawValue,
      };
    }
  }

  // Case 2: Value is a string expression (e.g. "count", "count()", "count_distinct(device_id)", "sum(latitude)")
  if (typeof rawValue === 'string') {
    const trimmedVal = rawValue.trim();
    const fnCallMatch = trimmedVal.match(/^([a-zA-Z_]+)\s*\((.*)\)$/);

    if (fnCallMatch) {
      const rawFnName = fnCallMatch[1];
      const fnDef = functionRegistry.get(rawFnName);
      if (fnDef) {
        const innerArg = fnCallMatch[2].trim();
        let targetCol: string | null = null;
        if (innerArg.length > 0 && innerArg !== '*') {
          targetCol = columnResolver ? (columnResolver(innerArg) ?? innerArg) : innerArg;
        }
        return {
          outputKey: trimmedKey,
          functionName: fnDef.name,
          targetColumn: targetCol,
          rawExpression: rawValue,
        };
      }
    }

    const fnDef = functionRegistry.get(trimmedVal);
    if (fnDef) {
      return {
        outputKey: trimmedKey,
        functionName: fnDef.name,
        targetColumn: null,
        rawExpression: rawValue,
      };
    }
  }

  // Case 3: Key itself matches a function name/alias (e.g. "num_hits", "hits", "count", "total")
  const keyFnDef = functionRegistry.get(trimmedKey);
  if (keyFnDef) {
    let targetCol: string | null = null;
    if (typeof rawValue === 'string' && rawValue.trim().length > 0 && !functionRegistry.has(rawValue)) {
      targetCol = columnResolver ? (columnResolver(rawValue) ?? rawValue) : rawValue;
    }
    return {
      outputKey: trimmedKey,
      functionName: keyFnDef.name,
      targetColumn: targetCol,
      rawExpression: rawValue,
    };
  }

  // Case 4: Numeric fallback when key is not a column
  if (typeof rawValue === 'number') {
    return {
      outputKey: trimmedKey,
      functionName: 'count',
      targetColumn: null,
      rawExpression: rawValue,
    };
  }

  return null;
}

/**
 * Evaluates a single FunctionInvocation against a dataset of records.
 */
export function evaluateFunctionInvocation(
  records: Record<string, unknown>[],
  invocation: FunctionInvocation,
): unknown {
  const fnDef = functionRegistry.get(invocation.functionName);
  if (!fnDef) {
    return records.length;
  }
  return fnDef.evaluate(records, invocation.targetColumn);
}

/**
 * Evaluates all function invocations over a record set and returns the computed key-value pairs.
 */
export function evaluateFunctions(
  records: Record<string, unknown>[],
  invocations: FunctionInvocation[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const inv of invocations) {
    result[inv.outputKey] = evaluateFunctionInvocation(records, inv);
  }
  return result;
}
