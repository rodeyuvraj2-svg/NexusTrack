import { useState } from "react";
import { useMutation, type UseQueryResult } from "@tanstack/react-query";
import { MessageSquare, Trash2, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { RestrictedAction } from "@/lib/guest";

interface ReviewData {
  id: string;
  body: string;
  likes: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  profile: any;
  liked_by_me: boolean;
}

interface MediaReviewsProps {
  mediaId: string;
  reviews: UseQueryResult<ReviewData[]>;
  upsertFn: any;
  deleteFn: any;
  likeFn: any;
  qc: any;
  currentUserId: string | null;
  requireAuth: (action: RestrictedAction) => boolean;
}

export function MediaReviews({
  mediaId,
  reviews,
  upsertFn,
  deleteFn,
  likeFn,
  qc,
  currentUserId,
  requireAuth,
}: MediaReviewsProps) {
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");

  const myReview = reviews.data?.find((r) => r.user_id === currentUserId);

  const mSave = useMutation({
    mutationFn: () => upsertFn({ data: { media_id: mediaId, body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", mediaId] });
      setWriting(false);
      setBody("");
      toast.success("Review posted");
    },
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", mediaId] });
      toast.success("Review deleted");
    },
  });

  const mLike = useMutation({
    mutationFn: (review_id: string) => likeFn({ data: { review_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", mediaId] }),
  });

  return (
    <section className="mt-6 md:mt-12 px-4 md:px-0">
      <div className="mb-3 md:mb-4 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold">Reviews</h2>
        {!writing && !myReview ? (
          <button
            onClick={() => {
              if (requireAuth("writeReview")) setWriting(true);
            }}
            className="flex items-center gap-1.5 rounded-lg glass px-4 py-2.5 text-sm font-medium hover:bg-muted/40 min-h-[44px]"
          >
            <MessageSquare className="h-4 w-4" /> Write a review
          </button>
        ) : null}
      </div>

      {writing ? (
        <div className="glass-strong mb-6 rounded-2xl p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
            rows={4}
            maxLength={1000}
            className="w-full rounded-lg border border-input bg-background/40 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Share your thoughts (max 1000 characters)…"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/1000</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setWriting(false);
                  setBody("");
                }}
                className="rounded-lg glass px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (requireAuth("writeReview")) mSave.mutate();
                }}
                disabled={!body.trim() || mSave.isPending}
                className="rounded-lg bg-gradient-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {mSave.isPending ? "Posting…" : "Post review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviews.isLoading ? (
        <p className="text-muted-foreground">Loading reviews…</p>
      ) : (reviews.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your thoughts.</p>
      ) : (
        <div className="space-y-3">
          {reviews.data!.map((r) => {
            const p = r.profile as any;
            const isMine = r.user_id === currentUserId;
            return (
              <div key={r.id} className="glass rounded-xl p-4">
                <div className="mb-2 flex items-center gap-2">
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gradient-accent grid place-items-center text-white text-xs font-bold">
                      {(p?.display_name || p?.username || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{p?.display_name || p?.username || "Someone"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </div>
                  </div>
                  {isMine ? (
                    <button
                      onClick={() => {
                        if (requireAuth("deleteReview")) mDelete.mutate(r.id);
                      }}
                      className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed">{r.body}</p>
                <button
                  onClick={() => {
                    if (requireAuth("likeReview")) mLike.mutate(r.id);
                  }}
                  className={cn(
                    "mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors",
                    r.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ThumbsUp className={cn("h-3.5 w-3.5", r.liked_by_me && "fill-current")} /> {r.likes}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
