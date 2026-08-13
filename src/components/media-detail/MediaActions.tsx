import { Heart, Trash2, Check, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusLabel } from "@/lib/media-types";
import type { WatchStatus, MediaSummary } from "@/lib/media-types";

interface MediaActionsProps {
  summary: MediaSummary;
  mediaId: string | undefined;
  entry: any;
  entryFavorited: boolean;
  statusOptions: WatchStatus[];
  handleStatusChange: (opt: WatchStatus) => void;
  handleFavorite: () => void;
  handleRemove: () => void;
  handleRating: (n: number) => void;
  mUpsertPending: boolean;
  mRemovePending: boolean;
  requireAuth: (action: string) => boolean;
}

export function MediaActions({
  summary,
  mediaId,
  entry,
  entryFavorited,
  statusOptions,
  handleStatusChange,
  handleFavorite,
  handleRemove,
  handleRating,
  mUpsertPending,
  mRemovePending,
  requireAuth,
}: MediaActionsProps) {
  return (
    <>
      {/* Mobile Actions */}
      <div className="md:hidden px-4 mt-6 w-full">
        {!entry?.id ? (
          <button
            disabled={mUpsertPending || !mediaId}
            onClick={() => handleStatusChange("planned")}
            className="w-full min-h-[44px] rounded-lg bg-gradient-accent text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            <BookmarkPlus className="inline h-4 w-4 mr-1.5" />
            {getStatusLabel("planned", summary?.media_type)}
          </button>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((opt) => {
                const active = entry?.status === opt;
                return (
                  <button
                    key={opt}
                    disabled={mUpsertPending || !mediaId}
                    onClick={() => handleStatusChange(opt)}
                    className={cn(
                      "w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5",
                      active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"
                    )}
                  >
                    {active ? <Check className="h-4 w-4" /> : null}
                    {getStatusLabel(opt, summary?.media_type)}
                  </button>
                );
              })}
              <button
                disabled={mUpsertPending || !mediaId}
                onClick={handleFavorite}
                className={cn(
                  "w-full min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5",
                  entryFavorited ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40"
                )}
              >
                <Heart className={cn("h-4 w-4", entryFavorited && "fill-current")} />
                {entryFavorited ? "Favorited" : "Favorite"}
              </button>
            </div>
            {entry && (
              <button
                onClick={handleRemove}
                disabled={mRemovePending}
                className="mt-2 w-full min-h-[44px] rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </>
        )}
      </div>

      {/* Desktop Actions */}
      <div className="hidden md:flex flex-wrap gap-2 mt-6">
        {(entry?.id ? statusOptions : statusOptions.filter((o) => o === "planned")).map((opt) => {
          const active = entry?.status === opt;
          return (
            <button
              key={opt}
              disabled={mUpsertPending || !mediaId}
              onClick={() => handleStatusChange(opt)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40",
                active ? "bg-gradient-accent text-white" : "glass hover:bg-muted/40"
              )}
            >
              {active ? <Check className="inline h-4 w-4 mr-1" /> : null}
              {getStatusLabel(opt, summary?.media_type)}
            </button>
          );
        })}
        <button
          disabled={mUpsertPending || !mediaId}
          onClick={handleFavorite}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40",
            entryFavorited ? "bg-accent/25 text-accent" : "glass hover:bg-muted/40"
          )}
        >
          <Heart className={cn("inline h-4 w-4 mr-1", entryFavorited && "fill-current")} /> {entryFavorited ? "Favorited" : "Favorite"}
        </button>
        {entry && (
          <button
            onClick={handleRemove}
            disabled={mRemovePending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="inline h-4 w-4 mr-1" /> Remove
          </button>
        )}
      </div>
    </>
  );
}
