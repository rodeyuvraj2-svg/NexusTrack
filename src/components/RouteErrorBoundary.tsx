import { useRouter } from "@tanstack/react-router";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Per-route error boundary. The root boundary still catches catastrophic
 * failures, but wiring this as `errorComponent` on individual routes keeps
 * one broken section (e.g. a failed reviews query) from blanking the whole
 * app — the shell, sidebar, and navigation stay alive.
 */
export function RouteErrorBoundary({ error }: { error: Error }) {
  const router = useRouter();
  console.error("[RouteErrorBoundary]", error);

  return (
    <div className="glass rounded-2xl p-10 md:p-14 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-destructive/15">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">This section couldn't load</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        {error.message || "Something went wrong fetching this page's data."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => router.invalidate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-accent px-4 py-2 text-sm font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
        <button
          onClick={() => router.history.back()}
          className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
