import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Singleton QueryClient — avoids creating a new one on every render/call
let _queryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!_queryClient) {
    _queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,       // 1 min — don't refetch immediately on mount
          gcTime: 10 * 60_000,     // 10 min — keep unused data in cache longer
          retry: 2,                // retry twice on failure before error state
          retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // exponential backoff
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
        mutations: {
          retry: 0,                // don't retry mutations by default
        },
      },
    });
  }
  return _queryClient;
}

export const getRouter = () => {
  const queryClient = getQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
