import { describe, it, expect, beforeEach } from "vitest";
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
    await cacheStore.set("foo", "bar", 10);

    expect(await cacheStore.has("foo")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

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
});
