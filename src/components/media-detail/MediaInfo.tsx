import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSummary } from "@/lib/media-types";

interface MediaInfoProps {
  summary: MediaSummary;
  voteAverage?: number | null;
  director?: string | null;
  genres?: string[];
  overview?: string | null;
}

export function MediaInfo({
  summary,
  voteAverage,
  director,
  genres,
  overview,
}: MediaInfoProps) {
  return (
    <>
      {/* Mobile Info */}
      <div className="md:hidden flex flex-col items-center px-4">
        {voteAverage ? (
          <div className="mt-2 flex items-center justify-center gap-1 text-warning">
            <Star className="h-5 w-5 fill-current" /> <span className="font-semibold text-lg">{voteAverage.toFixed(1)}</span>
            <span className="text-muted-foreground text-sm ml-1">/ 10</span>
          </div>
        ) : null}
        {director ? <p className="mt-1 text-sm text-muted-foreground text-center">Directed by {director}</p> : null}
        {genres?.length ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {genres.map((g) => <span key={g} className="rounded-full glass px-3 py-0.5 text-xs">{g}</span>)}
          </div>
        ) : null}
        {overview ? (
          <p className="mt-4 w-full text-base text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto">{overview}</p>
        ) : null}
      </div>

      {/* Desktop Info */}
      <div className="hidden md:block">
        {voteAverage ? (
          <div className="mt-2 flex items-center gap-1 text-warning">
            <Star className="h-4 w-4 fill-current" /> <span className="font-semibold">{voteAverage.toFixed(1)}</span>
            <span className="text-muted-foreground text-sm ml-1">/ 10</span>
          </div>
        ) : null}
        {director ? <p className="mt-1 text-sm text-muted-foreground">Directed by {director}</p> : null}
        {genres?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {genres.map((g) => <span key={g} className="rounded-full glass px-3 py-0.5 text-xs">{g}</span>)}
          </div>
        ) : null}
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">{overview}</p>
      </div>
    </>
  );
}
