# Dataset blobs (`.n2k`)

The web app answers lookups from precomputed `.n2k` blobs in
`web/public/data/`. Four are tracked in git:

| File | Bytes | What it covers | How it loads |
| --- | ---: | --- | --- |
| `standard.n2k` | 979,848 | every standard dice triple, targets 1 to 999 | eagerly, on boot |
| `aether-arity3.n2k` | 32,056,540 | every Æther 3-tuple, targets 1 to 5,000 | lazily, first Æther query |
| `aether-arity4-commons.n2k` | 39,124,077 | 1,651 curated arity-4 tuples | lazily, first arity-4 query |
| `aether-arity5-commons.n2k` | 1,960,276 | first 50 arity-5 commons tuples | lazily, first arity-5 query |

Total: 74,120,741 bytes (`du -ch` reports 71M) across 4 files.

## The app needs them at runtime

They are not dev artifacts. `web/src/services/n2kLoader.ts` fetches them
from `${BASE_URL}data/<name>.n2k`, Vite copies `web/public/` into the build,
and Firebase Hosting serves them with 1-year immutable cache headers. If an
arity-4 or arity-5 blob is missing, lookups fall back to the Web Worker
solver pool, which takes seconds instead of being instant. The standard
blob has no fallback.

## They can be regenerated

`scripts/bake-blob.ts` (`npm run bake`) writes them. I checked on
2026-09-24 by baking into a scratch directory on a 20-thread machine:

| Command | Bake time | Same bytes as the tracked file? |
| --- | ---: | --- |
| `npm run bake -- --mode standard` | 1.30 s | yes |
| `npm run bake -- --mode aether --arity 3` | 21.02 s | yes |
| `npm run bake -- --mode aether --arity 4 --legality commons` | hours (not re-measured) | not checked |
| `npm run bake -- --mode aether --arity 5 --legality commons` | 23.7 min for the 50-tuple subset (changelog, 2026-04-20) | not checked |

The bake is deterministic for the two blobs I checked, so a rebuilt file
keeps the same bytes and the immutable cache headers stay honest.

## Options for hosting them

Nothing here has been changed yet. This is a decision for Ethan.

1. **Leave them in git.** Works today. Every clone pulls about 71 MB, and
   each future rebake adds another full copy to history. Each file is under
   GitHub's 100 MB limit.
2. **Git LFS.** Clones get small pointers. Transfers count against the
   account's LFS quota, and a public repo means strangers' clones spend it.
   Firebase deploys need `git lfs pull` first.
3. **Release asset plus a fetch script.** Upload the blobs to a GitHub
   release and have a `prebuild` step download them into
   `web/public/data/`. No quota, but a deploy depends on the release existing.
4. **Generate at build time.** Only practical for the two cheap blobs:
   standard (about 1 s) and arity-3 (about 21 s) could be baked in a
   `prebuild` step and dropped from git. Arity-4 and arity-5 take too long.

My pick: keep `standard.n2k` in git (under 1 MB, and the app cannot start
without it), bake `aether-arity3.n2k` at build time, and move the two
commons blobs to a release asset. None of the options shrink existing
history. That would need a history rewrite, which is a separate call.
