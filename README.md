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
- **Resolver** (`src/resolve-formation.mjs`): functional, tested (11/11),
  but has one known gap — see "Known gap" below.
- **`based_on_formation` schema field**: proposed in the RFC, **not yet
  shipped in `schema/v1.json`**. A document produced by `resolveFormation()`
  today validates cleanly if you drop `meta.based_on_formation` before
  validating; once the schema PR from the RFC lands, drop that workaround.

## Known gap: named-position coordinates are duplicated, not imported

`src/resolve-formation.mjs` contains a hardcoded `FIBA_NAMED_POSITIONS`
table mirroring `docs/specification-v1.adoc`'s named-position catalog. This
exists because `@opencoachingformat/spec` doesn't yet export a public
named-position resolver function — only the raw JSON Schema, where
`Coordinate.named` is typed as a plain `string`, not a schema `enum` (so
there's nothing to import or generate types from for this specific piece).

This is the same class of problem the `ocf-renderer` codegen fix addressed
(a second, hand-maintained copy of schema-adjacent data), just not yet
solvable the same way, because the source of truth for named positions
currently lives in prose documentation, not in structured data the schema
references. Two ways to close this gap, in order of preference:

1. **Promote the named-position table to a small JSON data file in
   `opencoachingformat/spec`** (e.g. `positions/fiba-v1.json`), the same way
   this package promotes formations to data — then both `ocf-renderer` and
   this package import it instead of each keeping a copy.
2. Short of that, `@opencoachingformat/spec` exports a
   `resolveNamedPosition(name, ruleset)` function, and this package's
   `FIBA_NAMED_POSITIONS` constant is deleted in favor of calling it.

Until one of those lands, treat `FIBA_NAMED_POSITIONS` here as a
**deliberately flagged duplicate** — `scripts/validate-registry.mjs`
validates registry *entries* reference real position names, but nothing yet
guards this file's coordinate values against drifting from the spec's own
table if that table changes. Update this file by hand alongside any change
to the named-position catalog until the gap is closed properly.

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
