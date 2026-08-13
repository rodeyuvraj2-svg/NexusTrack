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
          staleTime: 5 * 60_000,   // 5 min — avoid redundant refetches when navigating between pages
          gcTime: 30 * 60_000,     // 30 min — keep cached metadata in memory longer
          retry: 1,                // fail fast on broken requests
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
    defaultPreload: "intent",
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
