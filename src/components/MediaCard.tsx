import { Link } from "@tanstack/react-router";
import type { MediaSummary } from "@/lib/media-types";
import { Star } from "lucide-react";

export function MediaCard({ item }: { item: MediaSummary }) {
  return (
    <Link
      to="/media/$type/$source/$id"
      params={{ type: item.media_type, source: item.source, id: item.external_id }}
      className="group relative block overflow-hidden rounded-xl glass hover:ring-accent transition-all duration-300 hover:-translate-y-1"
    >
      <div className="aspect-[2/3] bg-muted overflow-hidden">
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="text-gradient font-semibold">{item.media_type}</span>
          {item.release_year ? <span>· {item.release_year}</span> : null}
          {item.vote_average ? (
            <span className="ml-auto flex items-center gap-1 text-warning">
              <Star className="h-3 w-3 fill-current" /> {item.vote_average.toFixed(1)}
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-tight">{item.title}</h3>
      </div>
    </Link>
  );
}

export function MediaGrid({ items }: { items: MediaSummary[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it) => (
        <MediaCard key={`${it.source}-${it.media_type}-${it.external_id}`} item={it} />
      ))}
    </div>
  );
}
