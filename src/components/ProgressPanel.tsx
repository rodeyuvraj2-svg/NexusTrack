import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { updateMediaProgress } from "@/lib/library.functions";
import {
  calculateProgressPercent,
  formatChapterProgress,
  formatEpisodeProgress,
  formatNextItemLabel,
  getSeasonEpisodeTotal,
  type ContinueWatchingRow,
} from "@/lib/progress-utils";
import {
  canIncrement,
  progressTotalHint,
  validateProgressValues,
  type ProgressLimits,
} from "@/lib/progress-limits";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Saved progress state from the user's library entry for this title. */
export interface ProgressEntryState {
  status: string;
  current_season: number | null;
  current_episode: number | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
}

/** Media identity needed to insert an optimistic continue-watching row. */
interface ProgressMediaInfo {
  media_type: string;
  source: string;
  external_id: string;
  title: string;
  poster_url: string | null;
  release_year: number | null;
  vote_average: number | null;
  season_count: number | null;
  chapter_count: number | null;
}

interface ProgressPanelProps {
  mediaId: string;
  /** tv / anime / manga — the caller never renders this panel for movies. */
  mediaType: "tv" | "anime" | "manga";
  /** undefined = library entry still loading; null = not in library. */
  entry: ProgressEntryState | null | undefined;
  /** Known season metadata + the user's per-season status (listSeasonsWithProgress). */
  seasons: Array<{
    season_number: number;
    episode_count: number | null;
    name: string | null;
    status: string | null;
  }>;
  /** Total chapter count for manga, when known. */
  chapterTotal: number | null;
  media: ProgressMediaInfo;
}

/** "" → null; anything non-numeric/negative → null (treated as "not set"). */
function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function toText(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

/**
 * "Your progress" panel for the media detail page — a compact season/
 * episode (tv, anime) or chapter (manga) tracker. Saves go through
 * updateMediaProgress and patch ["library", "all"] and
 * ["continue-watching"] optimistically, rolling both back on error.
 */
export function ProgressPanel({
  mediaId,
  mediaType,
  entry,
  seasons,
  chapterTotal,
  media,
}: ProgressPanelProps) {
  const qc = useQueryClient();
  const progressFn = useServerFn(updateMediaProgress);
  const isManga = mediaType === "manga";

  // Local editable copies of the saved values (strings so an in-progress
  // "12" → "120" edit or an emptied field never crashes rendering).
  const [seasonText, setSeasonText] = useState(() => toText(entry?.current_season));
  const [episodeText, setEpisodeText] = useState(() => toText(entry?.current_episode));
  const [chapterText, setChapterText] = useState(() => toText(entry?.current_chapter));
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-sync when the authoritative saved values change (refetch after save,
  // or another tab/client touching the same entry). Typing isn't clobbered
  // because the saved values don't change while the user types.
  useEffect(() => {
    setSeasonText(toText(entry?.current_season));
    setEpisodeText(toText(entry?.current_episode));
    setChapterText(toText(entry?.current_chapter));
  }, [entry?.current_season, entry?.current_episode, entry?.current_chapter]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2000);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const season = parseCount(seasonText);
  const episode = parseCount(episodeText);
  const chapter = parseCount(chapterText);

  // Known limits (trusted metadata) — the same rules the server enforces.
  // tv: per-season episode counts + highest real season from the seasons
  // table. anime: total episodes (media.season_count). manga: chapter count.
  const limits: ProgressLimits = {};
  let episodeTotal: number | null;
  if (mediaType === "tv") {
    if (seasons.length > 0) limits.seasonTotal = Math.max(...seasons.map((s) => s.season_number));
    episodeTotal = getSeasonEpisodeTotal(seasons, season);
  } else if (mediaType === "anime") {
    episodeTotal = media.season_count && media.season_count > 0 ? media.season_count : null;
  } else {
    episodeTotal = null;
  }
  if (episodeTotal !== null) limits.episodeTotal = episodeTotal;
  if (chapterTotal !== null && chapterTotal > 0) limits.chapterTotal = chapterTotal;

  // Validate the CURRENT draft on every render — drives input maxes, button
  // disabling, and the inline error. Unsaved legacy values beyond a total
  // surface here the moment the user edits anything (same rule as server).
  const draft = isManga
    ? { current_chapter: chapter }
    : { current_season: season, current_episode: episode };
  const validation = validateProgressValues(mediaType, draft, limits);
  const totalHint = progressTotalHint(mediaType, {
    episodeTotal,
    chapterTotal: limits.chapterTotal ?? null,
  });
  const incrementAllowed = isManga
    ? canIncrement("manga", { chapter }, limits)
    : canIncrement(mediaType, { episode }, limits);
  const pct = isManga
    ? calculateProgressPercent(chapter, chapterTotal)
    : calculateProgressPercent(episode, episodeTotal);
  const formatted = isManga
    ? formatChapterProgress(chapter, chapterTotal)
    : formatEpisodeProgress(season, episode, episodeTotal);
  // Total-aware "next item" hint — the label resolves it from known totals:
  // anime/manga reaching the total → "Completed"; tv finishing an earlier
  // season → "Next: Season N+1 · Episode 1", and only the last known season
  // → "Completed". No known total → the hint stays (can't know it's the end).
  const totals: {
    episodeTotal?: number | null;
    seasonTotal?: number | null;
    chapterTotal?: number | null;
  } = {};
  if (isManga) {
    if (chapterTotal !== null && chapterTotal > 0) totals.chapterTotal = chapterTotal;
  } else if (mediaType === "anime") {
    if (episodeTotal !== null && episodeTotal > 0) totals.episodeTotal = episodeTotal;
  } else {
    totals.episodeTotal = episodeTotal;
    if (limits.seasonTotal != null && limits.seasonTotal > 0) {
      totals.seasonTotal = limits.seasonTotal;
    }
  }
  const nextLabel = formatNextItemLabel(mediaType, { season, episode, chapter }, totals);

  const savedSeason = entry?.current_season ?? null;
  const savedEpisode = entry?.current_episode ?? null;
  const savedChapter = entry?.current_chapter ?? null;
  const dirty = isManga
    ? chapter !== savedChapter
    : season !== savedSeason || episode !== savedEpisode;

  /** A season is completed if marked completed in user_seasons, if the series is
   *  completed, or if it is an earlier season than the actively tracked season. */
  const isSeasonCompleted = (seasonNum: number | null | undefined): boolean => {
    if (seasonNum == null) return false;
    const target = seasons.find((s) => s.season_number === seasonNum);
    if (target?.status === "completed") return true;
    if (entry?.status === "completed") return true;
    if (savedSeason !== null && seasonNum < savedSeason) return true;
    return false;
  };

  const isCurrentSeasonCompleted = Boolean(
    isSeasonCompleted(season) ||
      (episodeTotal !== null && episodeTotal > 0 && episode !== null && episode >= episodeTotal),
  );

  const mProgress = useMutation({
    mutationFn: (payload: {
      current_season?: number | null;
      current_episode?: number | null;
      current_chapter?: number | null;
    }) => progressFn({ data: { media_id: mediaId, ...payload } }),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["library", "all"] });
      await qc.cancelQueries({ queryKey: ["continue-watching"] });
      // Rollback snapshots for both touched caches.
      const prevLibrary = qc.getQueryData(["library", "all"]);
      const prevContinue = qc.getQueryData(["continue-watching"]);
      const now = new Date().toISOString();

      // Patch the shared library list in place.
      qc.setQueryData(["library", "all"], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((row) => {
          const r = row as { media?: { id?: string } };
          return r.media?.id === mediaId ? { ...row, ...payload, progress_updated_at: now } : row;
        });
      });

      // Patch (or insert at the front of) the matching continue-watching row.
      // An insert only happens while the title is actively watched/read —
      // the server query would exclude it otherwise.
      qc.setQueryData<ContinueWatchingRow[]>(["continue-watching"], (old) => {
        if (!old) return old;
        const idx = old.findIndex((r) => r.media_id === mediaId);
        if (idx >= 0) {
          const row = { ...old[idx], ...payload, progress_updated_at: now };
          return [row, ...old.slice(0, idx), ...old.slice(idx + 1)];
        }
        const isWatchKind = entry?.status === "watching" || entry?.status === "rewatching";
        if (!isWatchKind) return old;
        const row: ContinueWatchingRow = {
          id: "optimistic",
          media_id: mediaId,
          status: entry?.status ?? "watching",
          current_season: payload.current_season ?? null,
          current_episode: payload.current_episode ?? null,
          current_chapter: payload.current_chapter ?? null,
          progress_updated_at: now,
          updated_at: now,
          media: { id: mediaId, ...media },
        };
        return [row, ...old].slice(0, 12);
      });

      return { prevLibrary, prevContinue };
    },
    onError: (e, _payload, ctx) => {
      if (ctx?.prevLibrary !== undefined) qc.setQueryData(["library", "all"], ctx.prevLibrary);
      if (ctx?.prevContinue !== undefined) qc.setQueryData(["continue-watching"], ctx.prevContinue);
      toast.error(e instanceof Error ? e.message : "Couldn't save progress. Please try again.");
    },
    onSuccess: () => {
      // Subtle confirmation only — progress saves are frequent, so no toast.
      setSavedFlash(true);
    },
    onSettled: () => {
      // Refetch for authoritative ordering (continue-watching is sorted by
      // progress_updated_at server-side) and a fresh library-entry row.
      qc.invalidateQueries({ queryKey: ["continue-watching"] });
      qc.invalidateQueries({ queryKey: ["library-entry", mediaId] });
      qc.invalidateQueries({ queryKey: ["library"] });
      // A tv save may have auto-completed a season (user_seasons) — refresh
      // season status so the dropdown's restore-on-complete stays accurate.
      qc.invalidateQueries({ queryKey: ["seasons", mediaId] });
    },
  });

  const save = () => {
    if (!dirty || mProgress.isPending) return;
    // Client-side gate with the SAME rules the server enforces — invalid
    // drafts never reach the optimistic cache patches (which would briefly
    // show impossible values before the server rejection rolled them back).
    if (!validation.ok) {
      toast.error(validation.message ?? "That progress value isn't valid.");
      return;
    }
    if (isManga) mProgress.mutate({ current_chapter: chapter });
    else mProgress.mutate({ current_season: season, current_episode: episode });
  };

  /** Season select change:
   *  - A completed season restores its last episode (max episode count).
   *  - The currently-tracked season restores its saved episode.
   *  - Any other season starts fresh at episode 1 (never carrying over another season's episode count!).
   *  - "Not set" leaves the episode alone. */
  const onSeasonChange = (nextText: string) => {
    const next = nextText === "none" ? null : parseCount(nextText);
    setSeasonText(nextText === "none" ? "" : nextText);
    if (next === null) return;
    const target = seasons.find((s) => s.season_number === next);
    const maxEp = target?.episode_count ?? null;
    const completed = isSeasonCompleted(next);

    if (completed && maxEp !== null && maxEp > 0) {
      setEpisodeText(String(maxEp));
      return;
    }
    if (next === savedSeason) {
      setEpisodeText(toText(savedEpisode) || "1");
      return;
    }
    setEpisodeText("1");
  };

  // ── Not in library: controls stay hidden until the title is added. ──────
  if (!entry) {
    return (
      <div className="glass rounded-xl p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Your progress</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add this title to your library to start tracking your {isManga ? "chapter" : "episode"}{" "}
          progress.
        </p>
      </div>
    );
  }

  const stepperButton = (label: string, onDecrement: () => void, onIncrement: () => void) => (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDecrement}
        aria-label={label}
        disabled={(isManga ? chapter : episode) === 0}
        className="grid h-11 w-11 place-items-center rounded-lg glass hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={!incrementAllowed}
        title={
          incrementAllowed
            ? undefined
            : isManga
              ? `This manga has ${chapterTotal} chapters`
              : episodeTotal !== null
                ? `The last episode is ${episodeTotal}`
                : undefined
        }
        className="grid h-11 w-11 place-items-center rounded-lg glass hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Your progress</p>
        {savedFlash ? (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved
          </span>
        ) : null}
      </div>

      {isManga ? (
        // ── Manga: a single chapter control ──
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div>
            <label htmlFor="progress-chapter" className="text-sm font-medium">
              Chapter
            </label>
            <input
              id="progress-chapter"
              type="number"
              inputMode="numeric"
              min={0}
              max={limits.chapterTotal ?? undefined}
              aria-invalid={!validation.ok}
              value={chapterText}
              onChange={(e) => setChapterText(e.target.value)}
              className="mt-1 block h-11 w-28 rounded-lg border border-border/40 bg-card/40 px-3 text-center text-sm tabular-nums focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {totalHint ? <p className="mt-1 text-xs text-muted-foreground">{totalHint}</p> : null}
          </div>
          {stepperButton(
            "Decrease chapter",
            () => setChapterText(String(Math.max(0, (chapter ?? 0) - 1))),
            () => setChapterText(String((chapter ?? 0) + 1)),
          )}
        </div>
      ) : (
        // ── TV / anime: season + episode ──
        <div className="mt-2.5 flex flex-wrap items-end gap-3">
          {seasons.length > 0 ? (
            <div>
              <label htmlFor="progress-season" className="text-sm font-medium">
                Season
              </label>
              <Select value={seasonText || "none"} onValueChange={onSeasonChange}>
                <SelectTrigger
                  id="progress-season"
                  aria-label="Season"
                  className="mt-1 h-11 w-40 rounded-lg border border-border/40 bg-card/40 px-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl bg-card/90 backdrop-blur-xl border-border/40">
                  <SelectItem value="none">Not set</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.season_number} value={String(s.season_number)}>
                      {s.name || `Season ${s.season_number}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            // No season metadata cached (common for anime) — manual entry.
            <div>
              <label htmlFor="progress-season" className="text-sm font-medium">
                Season
              </label>
              <input
                id="progress-season"
                type="number"
                inputMode="numeric"
                min={0}
                max={limits.seasonTotal ?? undefined}
                aria-invalid={!validation.ok}
                value={seasonText}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setSeasonText(nextVal);
                  const nextSeason = parseCount(nextVal);
                  if (nextSeason !== season) {
                    if (nextSeason === savedSeason) {
                      setEpisodeText(toText(savedEpisode) || "1");
                    } else {
                      setEpisodeText("1");
                    }
                  }
                }}
                placeholder="—"
                className="mt-1 block h-11 w-24 rounded-lg border border-border/40 bg-card/40 px-3 text-center text-sm tabular-nums focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          )}
          <div>
            <label htmlFor="progress-episode" className="text-sm font-medium">
              Episode
            </label>
            <input
              id="progress-episode"
              type="number"
              inputMode="numeric"
              min={0}
              max={episodeTotal ?? undefined}
              aria-invalid={!validation.ok}
              value={episodeText}
              onChange={(e) => setEpisodeText(e.target.value)}
              className="mt-1 block h-11 w-24 rounded-lg border border-border/40 bg-card/40 px-3 text-center text-sm tabular-nums focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {totalHint ? <p className="mt-1 text-xs text-muted-foreground">{totalHint}</p> : null}
          </div>
          {stepperButton(
            "Decrease episode",
            () => setEpisodeText(String(Math.max(0, (episode ?? 0) - 1))),
            () => setEpisodeText(String((episode ?? 0) + 1)),
          )}
        </div>
      )}

      {/* Inline validation message — same wording the server returns */}
      {!validation.ok ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {validation.message}
        </p>
      ) : null}

      {/* Formatted position + thin bar when a total is known */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {formatted ?? <span className="text-muted-foreground">Not started</span>}
          {isCurrentSeasonCompleted ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              (Completed)
            </span>
          ) : null}
        </p>
        {pct !== null ? <p className="text-xs tabular-nums text-muted-foreground">{pct}%</p> : null}
      </div>
      {pct !== null ? (
        <Progress
          value={pct}
          className="mt-1.5 h-1.5"
          aria-label={
            isManga
              ? `Chapter ${chapter ?? 0}${chapterTotal ? ` of ${chapterTotal}` : ""}`
              : `Episode ${episode ?? 0}${episodeTotal ? ` of ${episodeTotal}` : ""}`
          }
        />
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{nextLabel}</p>
        <div className="flex items-center gap-3">
          {entry.progress_updated_at ? (
            <time
              className="text-xs text-muted-foreground/70"
              title={new Date(entry.progress_updated_at).toLocaleString()}
            >
              Updated{" "}
              {formatDistanceToNow(new Date(entry.progress_updated_at), { addSuffix: true })}
            </time>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || mProgress.isPending}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-40",
              dirty ? "bg-gradient-accent text-white" : "glass text-muted-foreground",
            )}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {mProgress.isPending ? "Saving…" : "Save progress"}
          </button>
        </div>
      </div>
    </div>
  );
}
