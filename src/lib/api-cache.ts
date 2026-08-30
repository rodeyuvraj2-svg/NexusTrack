// Simple in-memory TTL cache for outbound API reads (TMDB / AniList).
// Lives in the server process, so it is shared across all requests —
// repeated dashboard/discover queries become instant responses instead
// of another round trip to the external API.

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Return the cached value for `key` if it is still fresh; otherwise call
 * `fn`, cache the result for `ttlMs`, and return it. Concurrent calls with
 * the same key share a single in-flight request. Failures are never cached.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = fn()
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMs });
      // Bound the cache — Map iterates in insertion order, so evict the oldest
      if (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}
