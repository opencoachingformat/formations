# @opencoachingformat/formations

Standard basketball formation registry for Open Coaching Format (OCF).

## What this is

A small, versioned dataset of standard starting formations (offense and zone
defense), plus a resolver that turns a formation reference into concrete
OCF `entities`. See `../rfc-external-references.md` for the design
rationale (why this is a separate package from `@opencoachingformat/spec`,
why formations resolve at authoring time rather than being a renderer-side
concept, and the `based_on_formation` metadata shape).

## Status

- **Registry data** (`basketball-v1.json`): 10 formations — 7 offense, 3 zone
  defense — all expressed via named positions, all validated against a
  known-good named-position list (`scripts/validate-registry.mjs`).
- **Resolver** (`src/resolve-formation.mjs`): resolves via
  `@opencoachingformat/spec`'s `resolveNamedPosition(name, ruleset)` — no
  duplicated coordinate table. Supports every ruleset the spec ships
  (`fiba`, `nba`, `ncaa`, `nfhs`).
- **`based_on_formation` schema field**: shipped in
  `@opencoachingformat/spec` v1.1.0, so a document produced by
  `resolveFormation()` validates as-is (no need to drop
  `meta.based_on_formation`).

## Named positions come from the spec, not a local copy

Coordinates are resolved through `@opencoachingformat/spec`'s
`resolveNamedPosition(name, ruleset)` / `loadPositions(ruleset)`, backed by
`positions/{fiba,nba,ncaa,nfhs}-v1.json` in the spec package. There is **no**
`FIBA_NAMED_POSITIONS` table in this repo and no hand-maintained allowlist in
`scripts/validate-registry.mjs` — both derive their data from the spec, so
this package cannot drift from the spec's named-position catalog. (Earlier
revisions carried a flagged duplicate; it was removed once the spec exported a
public position resolver.)

## Usage

```js
import { listFormations, resolveFormation } from "@opencoachingformat/formations";

// For a closed-vocabulary LLM prompt or a GUI picker — no coordinates leak.
const offenseFormations = listFormations({ category: "offense" });

// Resolve a formation (optionally with per-player adjustments) to entities.
const { entities, meta } = resolveFormation("4_out_1_in", [
  { entity: "offense_5", dx: -0.5, dy: 0, note: "tighter to the block" },
]);

const doc = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: crypto.randomUUID(), title: "My Play", ...meta },
  court: { ruleset: "fiba", type: "half_court" },
  entities,
  frames: [ /* ... */ ],
};
```

## Development

```bash
npm install
npm run validate   # checks basketball-v1.json names against the spec's position data
npm test           # runs the resolver test suite (also runs validate via pretest)
```

Requires `@opencoachingformat/spec` (>=1.1.0) resolvable — installed as a dev
dependency here, or a sibling `../spec` checkout for local dev. The resolver
and the registry validator both read named-position data from that package
(`resolveNamedPosition` / `loadPositions`), so there is no local coordinate
copy to keep in sync.

## Releasing

Published to npm via GitHub Actions OIDC trusted publishing (no `NPM_TOKEN`),
the same mechanism as `@opencoachingformat/spec`.

1. **First release only** (one-time bootstrap): a maintainer runs
   `npm publish --access public` once locally to create the package, then on
   npmjs.com configures a **Trusted Publisher** for
   `@opencoachingformat/formations`:
   - Publisher: GitHub Actions
   - Organization or user: `opencoachingformat` (the bare name, not a URL)
   - Repository: `formations`
   - Workflow filename: `release.yml`
   - Environment name: leave blank
2. **Thereafter**: bump `version` in `package.json`, commit, tag `vX.Y.Z`
   (the tag MUST match `package.json` version), and push the tag. The workflow
   runs the test suite and publishes. If a tag-triggered run gets stuck, you
   can re-run manually with `gh workflow run release.yml --ref main`.

`package.json` already carries the `repository.url` that npm provenance
verification requires — omitting it causes an `E422` on publish.
