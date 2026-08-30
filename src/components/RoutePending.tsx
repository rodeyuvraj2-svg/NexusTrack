/**
 * Shown by the router while a route transition is pending (after
 * defaultPendingMs). A thin indeterminate bar at the very top of the
 * viewport — visible on mobile (above the fixed top bar) and desktop,
 * and it never covers or shifts content.
 */
export function RoutePending() {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" role="progressbar" aria-label="Loading page">
      <div
        className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-accent"
        style={{ animation: "route-loading 1.1s ease-in-out infinite" }}
      />
    </div>
  );
}
