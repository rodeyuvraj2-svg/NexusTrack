import { describe, expect, test } from "bun:test";
import { clearSupabaseSessionStorage } from "./client";

describe("clearSupabaseSessionStorage", () => {
  test("removes only Supabase auth entries and keeps other localStorage keys intact", () => {
    const storage = new Map<string, string>([
      ["sb-project-auth-token", "stale-token"],
      ["sb-project-auth-token-code-verifier", "verify"],
      ["theme", "dark"],
      ["other-value", "keep-me"],
    ]);

    const fakeStorage = {
      length: storage.size,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
    } satisfies Pick<Storage, "length" | "key" | "removeItem">;

    clearSupabaseSessionStorage(fakeStorage);

    expect(Array.from(storage.keys())).toEqual(["theme", "other-value"]);
  });
});
