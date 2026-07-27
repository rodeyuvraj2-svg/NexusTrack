import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loading?: "lazy" | "eager";
}

export function SafeImage({ src, alt, className, wrapperClassName, loading = "lazy" }: SafeImageProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset states when src changes
  useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [src]);

  if (!src || error) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50", wrapperClassName || className)}>
        <div className="text-center p-4">
          <div className="mx-auto mb-1 h-8 w-8 rounded-full bg-gradient-accent/30 grid place-items-center text-xs font-bold text-muted-foreground">
            {alt ? alt.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="text-[10px] text-muted-foreground/60 line-clamp-1">{alt}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName || className)}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/50" />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </div>
  );
}
