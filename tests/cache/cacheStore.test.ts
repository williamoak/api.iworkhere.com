import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheStore } from "@cache/cacheStore";

describe("cacheStore", () => {

    beforeEach(() => {
        cacheStore.clear();
        vi.useFakeTimers();
    });

    it("set() and get() should store and retrieve a value", () => {
        cacheStore.set("foo", "bar", 1000);

        const result = cacheStore.get<string>("foo");

        expect(result).toBe("bar");
    });

    it("get() should return null for missing keys", () => {
        const result = cacheStore.get("missing");

        expect(result).toBeNull();
    });

    it("get() should expire values after TTL", () => {
        cacheStore.set("temp", "value", 10);

        // Advance time past TTL
        vi.advanceTimersByTime(20);

        const result = cacheStore.get("temp");

        expect(result).toBeNull();
    });

    it("expired entries should be removed from the store", () => {
        cacheStore.set("temp", "value", 10);

        vi.advanceTimersByTime(20);

        // Access triggers cleanup
        cacheStore.get("temp");

        expect(cacheStore.size()).toBe(0);
    });

    it("del() should remove an entry", () => {
        cacheStore.set("foo", "bar", 1000);

        cacheStore.del("foo");

        expect(cacheStore.get("foo")).toBeNull();
    });

    it("has() should return true only for valid, non-expired entries", () => {
        cacheStore.set("foo", "bar", 10);

        expect(cacheStore.has("foo")).toBe(true);

        vi.advanceTimersByTime(20);

        expect(cacheStore.has("foo")).toBe(false);
    });

    it("clear() should remove all entries", () => {
        cacheStore.set("a", 1, 1000);
        cacheStore.set("b", 2, 1000);

        cacheStore.clear();

        expect(cacheStore.size()).toBe(0);
    });

    it("size() should reflect number of active entries", () => {
        cacheStore.set("a", 1, 1000);
        cacheStore.set("b", 2, 1000);

        expect(cacheStore.size()).toBe(2);
    });
});
