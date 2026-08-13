import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import type { MediaSummary } from "@/lib/media-types";

interface MediaHeaderProps {
  summary: MediaSummary;
  type: string;
  releaseYear?: number | null;
  runtime?: number | null;
  duration?: string | null;
  chapters?: number | null;
  volumes?: number | null;
  isManga: boolean;
  isAnime: boolean;
  mReclassify: {
    mutate: (type: "movie" | "tv" | "anime" | "manga") => void;
    isPending: boolean;
  };
}

export function MediaHeader({
  summary,
  type,
  releaseYear,
  runtime,
  duration,
  chapters,
  volumes,
  isManga,
  isAnime,
  mReclassify,
}: MediaHeaderProps) {
  return (
    <>
      {/* Backdrop */}
      <div className="relative -mx-4 md:-mx-8 -mt-6 md:-mt-10 h-48 md:h-80 overflow-hidden mb-4 md:mb-8">
        {summary.backdrop_url ? (
          <SafeImage src={summary.backdrop_url} alt="" wrapperClassName="h-full w-full" className="h-full w-full object-cover opacity-30" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />

        <button
          onClick={() => window.history.back()}
          className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur-md px-3 py-2 text-sm font-medium hover:bg-background/90 transition-colors shadow-lg"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden xs:inline">Back</span>
        </button>
      </div>

      {/* Poster + Title + Meta (Mobile) */}
      <div className="md:hidden flex flex-col items-center px-4">
        <div className="w-3/5 max-w-[200px] aspect-[2/3] rounded-xl overflow-hidden glass shadow-2xl -mt-20 relative z-10">
          <SafeImage src={summary.poster_url} alt={summary.title} wrapperClassName="h-full w-full" className="h-full w-full object-cover" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-xs uppercase tracking-widest text-muted-foreground">
          {!mReclassify.isPending ? (
            <select
              value={type}
              onChange={(e) => mReclassify.mutate(e.target.value as "movie" | "tv" | "anime" | "manga")}
              className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-semibold text-accent focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
            >
              <option value="movie">MOVIE</option>
              <option value="tv">TV</option>
              <option value="anime">ANIME</option>
              <option value="manga">MANGA</option>
            </select>
          ) : (
            <span className="text-accent font-semibold">{type}</span>
          )}
          {releaseYear ? <span>· {releaseYear}</span> : null}
          {isManga ? (
            <>
              {chapters ? <span>· {chapters} chapters</span> : null}
              {volumes ? <span>· {volumes} volumes</span> : null}
            </>
          ) : (
            <>
              {runtime ? <span>· {runtime}m</span> : null}
              {isAnime && duration ? <span>· {duration}</span> : null}
            </>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-black text-center px-2">{summary.title}</h1>
      </div>

      {/* Desktop Layout Header */}
      <div className="hidden md:grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="glass rounded-xl overflow-hidden aspect-[2/3] -mt-40 shadow-2xl relative z-10 max-w-[220px]">
          <SafeImage src={summary.poster_url} alt={summary.title} wrapperClassName="h-full w-full" className="h-full w-full object-cover" />
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2 flex-wrap">
            {!mReclassify.isPending ? (
              <select
                value={type}
                onChange={(e) => mReclassify.mutate(e.target.value as "movie" | "tv" | "anime" | "manga")}
                className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-semibold text-accent focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="movie">MOVIE</option>
                <option value="tv">TV</option>
                <option value="anime">ANIME</option>
                <option value="manga">MANGA</option>
              </select>
            ) : (
              <span className="text-accent font-semibold">{type}</span>
            )}
            {releaseYear ? <span>· {releaseYear}</span> : null}
            {isManga ? (
              <>
                {chapters ? <span>· {chapters} chapters</span> : null}
                {volumes ? <span>· {volumes} volumes</span> : null}
              </>
            ) : (
              <>
                {runtime ? <span>· {runtime}m</span> : null}
                {isAnime && duration ? <span>· {duration}</span> : null}
              </>
            )}
          </div>
          <h1 className="mt-2 text-5xl font-black">{summary.title}</h1>
        </div>
      </div>
    </>
  );
}
