import { describe, expect, test } from "bun:test";
import {
  RecommendationError,
  assertNotFallbackMedia,
  assertNotSelf,
  assertNoDuplicate,
  canDeleteRecommendation,
  canDismiss,
  canUpdateRecommendation,
  defaultExpiresAt,
  isExpired,
  isRecommendableRecipient,
  nextStatusAfterRead,
  RECOMMENDATION_TTL_DAYS,
  type RecommendationRecord,
} from "./recommendation-logic";

// Reference "now" — fixed so tests are deterministic.
const NOW = new Date(2026, 8, 10, 12, 0, 0);
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const SENDER = "11111111-1111-1111-1111-111111111111";
const RECIPIENT = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";

const rec = (over: Partial<RecommendationRecord> = {}): RecommendationRecord => ({
  sender_id: SENDER,
  recipient_id: RECIPIENT,
  status: "unread",
  expires_at: defaultExpiresAt(NOW),
  ...over,
});

// ── Self-recommendation ──────────────────────────────────────────────────────

describe("self-recommendation prevention", () => {
  test("recommending to yourself throws", () => {
    expect(() => assertNotSelf(SENDER, SENDER)).toThrow(RecommendationError);
  });

  test("recommending to someone else is allowed", () => {
    expect(() => assertNotSelf(SENDER, RECIPIENT)).not.toThrow();
  });
});

// ── Recipient authorization ──────────────────────────────────────────────────

describe("unauthorized recipients", () => {
  const related = new Set([RECIPIENT]);

  test("a friend/followed user is recommendable", () => {
    expect(isRecommendableRecipient(related, RECIPIENT)).toBe(true);
  });

  test("an unrelated user is NOT recommendable", () => {
    expect(isRecommendableRecipient(related, OUTSIDER)).toBe(false);
  });

  test("an empty relationship set rejects everyone", () => {
    expect(isRecommendableRecipient(new Set(), RECIPIENT)).toBe(false);
  });
});

// ── Duplicates ───────────────────────────────────────────────────────────────

describe("duplicate recommendations", () => {
  test("an active (unread) recommendation blocks a new one", () => {
    expect(() => assertNoDuplicate(rec({ status: "unread" }))).toThrow(RecommendationError);
  });

  test("a read recommendation still blocks a new one", () => {
    expect(() => assertNoDuplicate(rec({ status: "read" }))).toThrow(RecommendationError);
  });

  test("a dismissed recommendation allows re-recommending", () => {
    expect(() => assertNoDuplicate(rec({ status: "dismissed" }))).not.toThrow();
  });

  test("no existing row allows recommending", () => {
    expect(() => assertNoDuplicate(null)).not.toThrow();
  });
});

// ── Fallback media ───────────────────────────────────────────────────────────

describe("fallback media rejection", () => {
  test("demo (is_fallback) media cannot be recommended", () => {
    expect(() => assertNotFallbackMedia(true)).toThrow(RecommendationError);
  });

  test("real media passes", () => {
    expect(() => assertNotFallbackMedia(false)).not.toThrow();
    expect(() => assertNotFallbackMedia(undefined)).not.toThrow();
  });
});

// ── Marking as read ──────────────────────────────────────────────────────────

describe("marking as read", () => {
  test("unread becomes read", () => {
    expect(nextStatusAfterRead("unread")).toBe("read");
  });

  test("already-read stays untouched (idempotent)", () => {
    expect(nextStatusAfterRead("read")).toBeNull();
  });

  test("dismissed rows are never marked read", () => {
    expect(nextStatusAfterRead("dismissed")).toBeNull();
  });

  test("only the recipient may update status", () => {
    const r = rec();
    expect(canUpdateRecommendation(RECIPIENT, r)).toBe(true);
    expect(canUpdateRecommendation(SENDER, r)).toBe(false);
    expect(canUpdateRecommendation(OUTSIDER, r)).toBe(false);
  });
});

// ── Dismissal ────────────────────────────────────────────────────────────────

describe("dismissing recommendations", () => {
  test("unread and read rows can be dismissed", () => {
    expect(canDismiss("unread")).toBe(true);
    expect(canDismiss("read")).toBe(true);
  });

  test("dismissed rows cannot be dismissed again", () => {
    expect(canDismiss("dismissed")).toBe(false);
  });
});

// ── Deletion ─────────────────────────────────────────────────────────────────

describe("deleting recommendations", () => {
  test("the sender can delete their recommendation", () => {
    expect(canDeleteRecommendation(SENDER, rec())).toBe(true);
  });

  test("the recipient can delete a received recommendation", () => {
    expect(canDeleteRecommendation(RECIPIENT, rec())).toBe(true);
  });

  test("an unrelated user cannot delete it", () => {
    expect(canDeleteRecommendation(OUTSIDER, rec())).toBe(false);
  });
});

// ── Expiry ───────────────────────────────────────────────────────────────────

describe("expired recommendations", () => {
  test("a fresh recommendation is not expired", () => {
    expect(isExpired({ expires_at: iso(60_000) }, NOW)).toBe(false);
  });

  test("a recommendation past its expiry is expired (removed by cleanup)", () => {
    expect(isExpired({ expires_at: iso(-60_000) }, NOW)).toBe(true);
  });

  test("the expiry boundary itself counts as expired", () => {
    expect(isExpired({ expires_at: NOW.toISOString() }, NOW)).toBe(true);
  });

  test("a missing expires_at never expires", () => {
    expect(isExpired({ expires_at: null }, NOW)).toBe(false);
  });

  test("new recommendations expire after the 30-day TTL", () => {
    const expires = new Date(defaultExpiresAt(NOW));
    const ttlMs = expires.getTime() - NOW.getTime();
    expect(Math.round(ttlMs / (24 * 60 * 60 * 1000))).toBe(RECOMMENDATION_TTL_DAYS);
    // 30 days later it is expired, 30 days minus a minute it is not.
    expect(isExpired({ expires_at: defaultExpiresAt(NOW) }, new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000))).toBe(true);
    expect(isExpired({ expires_at: defaultExpiresAt(NOW) }, new Date(NOW.getTime() + (RECOMMENDATION_TTL_DAYS * 24 * 60 * 60 * 1000) - 60_000))).toBe(false);
  });
});
