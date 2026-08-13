import { List, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";
import type { MediaSummary } from "@/lib/media-types";

interface RelatedItem {
  mal_id: number;
  title: string;
  year: number | null;
  images: { jpg: { large_image_url: string | null; image_url: string | null } } | null;
  title_english?: string | null;
  synopsis?: string | null;
  episodes?: number | null;
  status?: string | null;
  type?: string;
  score?: number | null;
  genres?: { name: string }[];
  relation?: string;
}

interface MediaRelationsProps {
  summary: MediaSummary;
  isAnime: boolean;
  isManga: boolean;
  franchiseList: any[];
  statusMap: Map<string, { status: string; favorite: boolean }>;
  animeRecommendations: RelatedItem[];
  relationForId: (id: number) => string;
}

export function MediaRelations({
  summary,
  isAnime,
  isManga,
  franchiseList,
  statusMap,
  animeRecommendations,
  relationForId,
}: MediaRelationsProps) {
  return (
    <>
      {/* Franchise Timeline */}
      {(isAnime || isManga) && franchiseList.length > 0 && (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <h2 className="mb-3 md:mb-4 text-xl md:text-2xl font-bold flex items-center gap-2">
            <List className="h-5 w-5 text-warning" /> {isManga ? "Related manga" : "Seasons, OVAs & Movies"}
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted">
            {franchiseList.map((item) => {
              const itemStatus = statusMap.get(String(item.mal_id));
              return (
                <Link
                  key={item.mal_id}
                  to="/media/$type/$source/$id"
                  params={{ type: "anime" as const, source: "anilist" as const, id: String(item.mal_id) }}
                  className={cn(
                    "group relative flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-xl glass hover:ring-2 hover:ring-accent transition-all",
                    item.isCurrent && "ring-2 ring-primary bg-primary/10"
                  )}
                >
                  <div className="aspect-[2/3] bg-muted overflow-hidden relative animate-fade-in">
                    {item.poster_url ? (
                      <SafeImage
                        src={item.poster_url}
                        alt={item.title}
                        wrapperClassName="h-full w-full"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-primary/10 to-accent/10" />
                    )}
                    {itemStatus?.status ? (
                      <span className={cn(
                        "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider font-semibold shadow-md",
                        "bg-muted text-muted-foreground" // Simplified colors for now
                      )}>
                        {itemStatus.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="inline-block rounded-md bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                        {item.relation.replace(/_/g, " ")}
                      </span>
                      <h3 className="line-clamp-2 text-xs font-semibold group-hover:text-primary transition-colors leading-tight">
                        {item.title}
                      </h3>
                    </div>
                    {item.year ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">{item.year}</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* More Like This */}
      {(isAnime || isManga) && animeRecommendations.length > 0 && (
        <section className="mt-6 md:mt-12 px-4 md:px-0">
          <h2 className="mb-3 md:mb-4 text-xl md:text-2xl font-bold flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" /> More Like This
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-muted">
            {animeRecommendations.slice(0, 10).map((item) => (
              <Link
                key={item.mal_id}
                to="/media/$type/$source/$id"
                params={{ type: "anime" as const, source: "anilist" as const, id: String(item.mal_id) }}
                className="w-36 shrink-0 snap-start group"
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden glass mb-2">
                  <SafeImage
                    src={item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null}
                    alt={item.title}
                    wrapperClassName="h-full w-full"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="px-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="text-accent font-semibold">{relationForId(item.mal_id).replace(/_/g, " ")}</span>
                    {item.year ? <span>· {item.year}</span> : null}
                  </div>
                  <h3 className="mt-0.5 text-xs font-semibold line-clamp-2 leading-tight">{item.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
