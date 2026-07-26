export type MediaType = "movie" | "tv" | "anime";
export type WatchStatus =
  | "watching"
  | "completed"
  | "planned"
  | "paused"
  | "dropped"
  | "skipped"
  | "rewatching";

export interface MediaSummary {
  external_id: string;
  source: "tmdb" | "jikan" | "anilist";
  media_type: MediaType;
  title: string;
  overview?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  release_year?: number | null;
  vote_average?: number | null;
  genres?: string[];
  runtime?: number | null;
  season_count?: number | null;
  status?: string | null;
}

export const STATUS_LABELS: Record<WatchStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  planned: "Watchlist",
  paused: "Paused",
  dropped: "Dropped",
  skipped: "Skipped",
  rewatching: "Rewatching",
};

export const STATUS_COLORS: Record<WatchStatus, string> = {
  watching: "bg-primary/20 text-primary border-primary/30",
  completed: "bg-success/20 text-success border-success/30",
  planned: "bg-warning/20 text-warning border-warning/30",
  paused: "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30",
  dropped: "bg-destructive/20 text-destructive border-destructive/30",
  skipped: "bg-muted/40 text-muted-foreground border-border",
  rewatching: "bg-accent/20 text-accent border-accent/30",
};
