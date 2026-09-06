#!/usr/bin/env bash
# NexusTrack — finish-and-verify script.
# Runs everything that couldn't be done without a shell:
#   1. Applies pending Supabase migrations (season-rollup unification,
#      profile stats RPC, friend-request notifications + realtime).
#   2. Untracks junk files from git and deletes them from disk.
#   3. Installs deps, typechecks, lints, tests, and builds.
#
# Run from the repo root:  bash scripts/finish-and-verify.sh
set -euo pipefail

echo "── 1. Apply database migrations ──────────────────────────────"
supabase db push
# If that fails because you're not linked, run:
#   supabase link --project-ref pgjstblnkxcywhqatkjq
#   supabase db push

echo "── 2. Remove junk from git tracking and disk ─────────────────"
git rm -r --cached tailcast-1.0.0.zip .claude/temp review_diff.txt jikan_test.json "./-Recurse -Force" package-lock.json
rm -f tailcast-1.0.0.zip review_diff.txt jikan_test.json "./-Recurse -Force" package-lock.json
rm -rf .claude/temp
# Dead code: unused hook (the media route has its own inline queries)
rm -f src/hooks/use-media-detail.ts

echo "── 3. Install, verify, build ─────────────────────────────────"
bun install
bunx tsc --noEmit
bunx eslint src --quiet
bun test
bun run build

echo "── Done. Review 'git status' and commit when satisfied. ──────"
