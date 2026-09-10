// Pure validation/transition rules for media recommendations — no server or
// DB imports so they can be unit-tested with bun:test. The server functions
// in recommendations.functions.ts delegate every rule to this module.

export const RECOMMENDATION_TTL_DAYS = 30;
export const RECOMMENDATION_MESSAGE_MAX = 500;

/** Minimal shape the rules need from a recommendation row. */
export interface RecommendationRecord {
  sender_id: string;
  recipient_id: string;
  status: "unread" | "read" | "dismissed";
  created_at?: string;
  expires_at?: string | null;
}

export class RecommendationError extends Error {}

/** Users may not recommend media to themselves. */
export function assertNotSelf(senderId: string, recipientId: string): void {
  if (senderId === recipientId) {
    throw new RecommendationError("You can't recommend media to yourself.");
  }
}

/**
 * Recipients must be an accepted friend (either direction) or a followed /
 * following user (either direction), matching the existing relationship model.
 */
export function isRecommendableRecipient(relatedUserIds: ReadonlySet<string>, recipientId: string): boolean {
  return relatedUserIds.has(recipientId);
}

/** One active recommendation per (sender, recipient, media). */
export function assertNoDuplicate(existingActive: RecommendationRecord | null | undefined): void {
  if (existingActive && existingActive.status !== "dismissed") {
    throw new RecommendationError("You already recommended this to that user.");
  }
}

/** Hardcoded demo media shown when provider APIs are down is never recommendable. */
export function assertNotFallbackMedia(isFallback: boolean | undefined): void {
  if (isFallback) {
    throw new RecommendationError("Demo media can't be recommended.");
  }
}

/** Sender or recipient may delete; anyone else must be rejected. */
export function canDeleteRecommendation(userId: string, rec: Pick<RecommendationRecord, "sender_id" | "recipient_id">): boolean {
  return userId === rec.sender_id || userId === rec.recipient_id;
}

/** Only the recipient changes read/dismissed status. */
export function canUpdateRecommendation(userId: string, rec: Pick<RecommendationRecord, "recipient_id">): boolean {
  return userId === rec.recipient_id;
}

/** Expired recommendations are cleaned up server-side; this is the same rule
 *  used to filter them out of reads so the feed and the cleanup agree. */
export function isExpired(rec: Pick<RecommendationRecord, "expires_at">, now: Date = new Date()): boolean {
  if (!rec.expires_at) return false;
  return new Date(rec.expires_at).getTime() <= now.getTime();
}

/** Unread → read (idempotent); read/dismissed rows are left untouched. */
export function nextStatusAfterRead(status: RecommendationRecord["status"]): "read" | null {
  return status === "unread" ? "read" : null;
}

/** Any non-dismissed row can be dismissed. */
export function canDismiss(status: RecommendationRecord["status"]): boolean {
  return status !== "dismissed";
}

/** Expiry timestamp for a new recommendation (used by the insert path). */
export function defaultExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + RECOMMENDATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
