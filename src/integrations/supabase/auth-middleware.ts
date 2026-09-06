import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your environment.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    if (token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    // getUser() is a network roundtrip to Supabase on EVERY server-function
    // call. Cache validated (userId, client) pairs for a short window so
    // bursts of requests from the same session skip the roundtrip. The TTL
    // is short enough that revoked users are rejected within a minute.
    const AUTH_CACHE_TTL_MS = 30_000;
    const AUTH_CACHE_MAX = 200;

    interface AuthCacheEntry {
      userId: string;
      client: ReturnType<typeof createAuthenticatedClient>;
      expires: number;
    }
    const authCache = (globalThis as { __ntAuthCache?: Map<string, AuthCacheEntry> }).__ntAuthCache
      ?? ((globalThis as { __ntAuthCache?: Map<string, AuthCacheEntry> }).__ntAuthCache = new Map());

    function createAuthenticatedClient() {
      return createClient<Database>(
        SUPABASE_URL!,
        SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY!),
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
    }

    const hit = authCache.get(token);
    const now = Date.now();
    if (hit && hit.expires > now) {
      return next({
        context: {
          supabase: hit.client,
          userId: hit.userId,
          claims: { sub: hit.userId },
        },
      });
    }

    const client = createAuthenticatedClient();
    // Use getUser(jwt) to validate the token — this makes an HTTP request to Supabase
    // and returns the user. getClaims() was deprecated in Supabase JS v2.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error('Unauthorized: Invalid or expired token');
    }

    authCache.set(token, { userId: data.user.id, client, expires: now + AUTH_CACHE_TTL_MS });
    // Bound the cache — Map iterates in insertion order, so evict the oldest
    if (authCache.size > AUTH_CACHE_MAX) {
      const oldest = authCache.keys().next().value;
      if (oldest !== undefined) authCache.delete(oldest);
    }

    return next({
      context: {
        supabase: client,
        userId: data.user.id,
        claims: { sub: data.user.id },
      },
    });
  },
);
