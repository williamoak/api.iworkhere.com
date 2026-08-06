import { describe, it, expect, beforeEach, vi } from "vitest";

const { storage } = vi.hoisted(() => {
  return { storage: new Map<string, { val: string; expiry: number }>() };
});

vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(function (this: any) {
      this.get = vi.fn().mockImplementation((key: string) => {
        const entry = storage.get(key);
        if (!entry) return Promise.resolve(null);
        if (entry.expiry && entry.expiry > 0 && entry.expiry < Date.now()) {
          storage.delete(key);
          return Promise.resolve(null);
        }
        return Promise.resolve(entry.val);
      });
      this.set = vi.fn().mockImplementation((key: string, val: string, mode?: string, ttl?: number) => {
        const expiry = mode === "PX" && ttl ? Date.now() + ttl : 0;
        storage.set(key, { val, expiry });
        return Promise.resolve("OK");
      });
      this.del = vi.fn().mockImplementation((key: string) => {
        storage.delete(key);
        return Promise.resolve(1);
      });
      this.exists = vi.fn().mockImplementation((key: string) => {
        const entry = storage.get(key);
        if (!entry) return Promise.resolve(0);
        if (entry.expiry && entry.expiry > 0 && entry.expiry < Date.now()) {
          storage.delete(key);
          return Promise.resolve(0);
        }
        return Promise.resolve(1);
      });
      this.flushdb = vi.fn().mockImplementation(() => {
        storage.clear();
        return Promise.resolve("OK");
      });
      this.dbsize = vi.fn().mockImplementation(() => {
        const now = Date.now();
        for (const [key, entry] of storage.entries()) {
          if (entry.expiry && entry.expiry > 0 && entry.expiry < now) {
            storage.delete(key);
          }
        }
        return Promise.resolve(storage.size);
      });
      this.scanStream = vi.fn().mockImplementation(() => {
        const now = Date.now();
        const activeKeys = Array.from(storage.entries())
          .filter(([_, entry]) => !entry.expiry || entry.expiry === 0 || entry.expiry >= now)
          .map(([key]) => key);
        let yielded = false;
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                if (!yielded) {
                  yielded = true;
                  return { value: activeKeys, done: false };
                }
                return { value: undefined, done: true };
              }
            };
          }
        };
      });
      return this;
    }),
  };
});

import { cacheStore } from "@cache/cacheStore";

describe("cacheStore", () => {
  beforeEach(async () => {
    await cacheStore.clear();
  });

  it("set() and get() should store and retrieve a value", async () => {
    await cacheStore.set("foo", "bar", 1000);

    const result = await cacheStore.get<string>("foo");

    expect(result).toBe("bar");
  });

  it("get() should return null for missing keys", async () => {
    const result = await cacheStore.get("missing");

    expect(result).toBeNull();
  });

  it("get() should expire values after TTL", async () => {
    await cacheStore.set("temp", "value", 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await cacheStore.get("temp");

    expect(result).toBeNull();
  });

  it("expired entries should be removed from the store", async () => {
    await cacheStore.set("temp", "value", 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Access triggers cleanup
    await cacheStore.get("temp");

    expect(await cacheStore.size()).toBe(0);
  });

  it("del() should remove an entry", async () => {
    await cacheStore.set("foo", "bar", 1000);

    await cacheStore.del("foo");

    expect(await cacheStore.get("foo")).toBeNull();
  });

  it("has() should return true only for valid, non-expired entries", async () => {
    await cacheStore.set("foo", "bar", 100);

    expect(await cacheStore.has("foo")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await cacheStore.has("foo")).toBe(false);
  });

  it("clear() should remove all entries", async () => {
    await cacheStore.set("a", 1, 1000);
    await cacheStore.set("b", 2, 1000);

    await cacheStore.clear();

    expect(await cacheStore.size()).toBe(0);
  });

  it("size() should reflect number of active entries", async () => {
    await cacheStore.set("a", 1, 1000);
    await cacheStore.set("b", 2, 1000);

    expect(await cacheStore.size()).toBe(2);
  });

  it("delWhere() should remove matching keys", async () => {
    await cacheStore.set("key1", "val1", 1000);
    await cacheStore.set("key2", "val2", 1000);

    await cacheStore.delWhere((key) => key === "key1");

    expect(await cacheStore.has("key1")).toBe(false);
    expect(await cacheStore.has("key2")).toBe(true);
  });
});
