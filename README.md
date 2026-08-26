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
npm run validate   # checks basketball-v1.json against a known named-position list
npm test           # runs the resolver test suite (also runs validate via pretest)
```

Requires `@opencoachingformat/spec` resolvable via `require.resolve()` (as
an installed peer dependency) or a sibling `../spec` checkout for local dev
— same convention as `ocf-renderer`'s codegen script.
