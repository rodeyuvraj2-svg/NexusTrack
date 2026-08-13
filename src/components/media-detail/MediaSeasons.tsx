import { Check, Play, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusLabel } from "@/lib/media-types";
import type { WatchStatus } from "@/lib/media-types";

interface Season {
  id: string;
  season_number: number;
  name: string | null;
  episode_count: number | null;
  air_date: string | null;
  poster_url: string | null;
  overview: string | null;
  status: string | null;
}

interface MediaSeasonsProps {
  seasons: Season[];
  mSetSeason: {
    mutate: (payload: { season_id: string; status: WatchStatus }) => void;
  };
}

const SEASON_STATUS_ACTIONS: Array<{ key: WatchStatus; label: string; icon: typeof Play | typeof CircleCheck }> = [
  { key: "watching", label: "Watching", icon: Play },
  { key: "completed", label: "Completed", icon: CircleCheck },
  { key: "planned", label: "Plan to Read", icon: Play },
];

export function MediaSeasons({ seasons, mSetSeason }: MediaSeasonsProps) {
  if (seasons.length === 0) return null;

  return (
    <section className="mt-6 md:mt-12 px-4 md:px-0">
      <h2 className="mb-3 md:mb-4 text-xl md:text-2xl font-bold">Seasons</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {seasons.map((sn) => (
          <div key={sn.id} className="glass rounded-xl p-4 flex gap-4">
            <div className="h-24 w-16 rounded-lg shrink-0 overflow-hidden bg-muted">
              {sn.poster_url ? (
                <img src={sn.poster_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{sn.name || `Season ${sn.season_number}`}</h3>
              <p className="text-xs text-muted-foreground">
                {sn.episode_count ?? "?"} eps{sn.air_date ? ` · ${sn.air_date.slice(0, 4)}` : ""}
                {sn.overview ? ` · ${sn.overview.slice(0, 60)}…` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SEASON_STATUS_ACTIONS.map((action) => {
                  const active = sn.status === action.key;
                  return (
                    <button
                      key={action.key}
                      onClick={() => mSetSeason.mutate({ season_id: sn.id, status: action.key })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs transition-colors flex items-center gap-1",
                        active ? "bg-gradient-accent text-white" : "bg-muted/40 hover:bg-muted/60"
                      )}
                    >
                      {active ? <Check className="h-3 w-3" /> : <action.icon className="h-3 w-3" />}
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
