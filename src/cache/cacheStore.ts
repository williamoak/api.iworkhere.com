/**
 * Centralized in-memory cache store.
 * Single-process, TTL-based, deterministic behavior.
 */

export type CacheValue = unknown

type CacheEntry = {
    value: CacheValue
    expiresAt: number
}

class CacheStore {
    private store = new Map<string, CacheEntry>()

    get<T = CacheValue>(key: string): T | null {
        const entry = this.store.get(key)
        if (!entry) return null

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key)
            return null
        }

        return entry.value as T
    }

    set(
        key: string,
        value: CacheValue,
        ttlMs: number
    ): void {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        })
    }

    del(key: string): void {
        this.store.delete(key)
    }

    has(key: string): boolean {
        return this.get(key) !== null
    }

    clear(): void {
        this.store.clear()
    }

    size(): number {
        return this.store.size
    }
}

/**
 * Singleton cache instance.
 * Do NOT create additional instances.
 */
export const cacheStore = new CacheStore()
