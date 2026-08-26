/**
 * Resolves a formation reference (registry id + optional per-entity
 * adjustments) into concrete OCF `entities`. This is the only place that
 * needs to know formations exist at all — once resolved, the result is
 * plain entities data indistinguishable from anything hand-authored, per
 * the "resolve at authoring time, not render time" rule (see
 * rfc-external-references.md §2). ocf-renderer never imports this module.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ entity: string, dx: number, dy: number, note?: string }} Adjustment
 * @typedef {{ type: "offense"|"defense", nr: number, x: number, y: number }} Entity
 */

let _registryCache = null;

function loadRegistry() {
  if (_registryCache) return _registryCache;
  const path = resolve(__dirname, "../basketball-v1.json");
  _registryCache = JSON.parse(readFileSync(path, "utf-8"));
  return _registryCache;
}

/**
 * Resolves named-position references inside a formation entry to absolute
 * coordinates for a given ruleset. NOTE: this is a placeholder mapping for
 * FIBA only, mirroring the table in docs/specification-v1.adoc — this
 * should be replaced with a real call into @opencoachingformat/spec's own
 * named-position resolver once that's exposed as a public function there,
 * rather than duplicated here. Flagged deliberately rather than silently
 * hidden, per the project's own lesson about undocumented duplicated
 * schema knowledge.
 */
const FIBA_NAMED_POSITIONS = {
  basket: { x: 0.0, y: 12.425 },
  left_block: { x: -2.45, y: 11.0 },
  right_block: { x: 2.45, y: 11.0 },
  paint_center: { x: 0.0, y: 10.5 },
  left_short_corner: { x: -7.5, y: 11.5 },
  right_short_corner: { x: 7.5, y: 11.5 },
  left_elbow: { x: -2.45, y: 8.2 },
  right_elbow: { x: 2.45, y: 8.2 },
  free_throw_line: { x: 0.0, y: 8.2 },
  high_post_left: { x: -2.45, y: 7.0 },
  high_post_right: { x: 2.45, y: 7.0 },
  top_of_the_key: { x: 0.0, y: 5.68 },
  left_wing: { x: -6.75, y: 8.6 },
  right_wing: { x: 6.75, y: 8.6 },
  left_corner: { x: -7.5, y: 13.98 },
  right_corner: { x: 7.5, y: 13.98 },
};

function entityRef(entity) {
  return `${entity.type}_${entity.nr}`;
}

/**
 * @param {string} formationId - e.g. "4_out_1_in"
 * @param {Adjustment[]} [adjustments]
 * @param {{ ruleset?: string }} [options] - only "fiba" supported currently
 * @returns {{ entities: Entity[], meta: { based_on_formation: object } }}
 */
export function resolveFormation(formationId, adjustments = [], options = {}) {
  const ruleset = options.ruleset ?? "fiba";
  if (ruleset !== "fiba") {
    throw new Error(
      `resolveFormation: only 'fiba' is supported by this package's built-in ` +
        `coordinate table today; got '${ruleset}'. See FIBA_NAMED_POSITIONS ` +
        `comment — this needs a real named-position resolver per ruleset.`
    );
  }

  const registry = loadRegistry();
  const formation = registry.formations[formationId];
  if (!formation) {
    const available = Object.keys(registry.formations).join(", ");
    throw new Error(`Unknown formation id '${formationId}'. Available: ${available}`);
  }

  const adjustmentsByEntity = new Map(adjustments.map((a) => [a.entity, a]));

  const entities = formation.entities.map((e) => {
    const base = FIBA_NAMED_POSITIONS[e.named];
    if (!base) {
      throw new Error(
        `Formation '${formationId}' references unknown named position '${e.named}' ` +
          `for player ${e.nr}. Run scripts/validate-registry.mjs to catch this in CI.`
      );
    }
    const ref = entityRef(e);
    const adj = adjustmentsByEntity.get(ref);
    return {
      type: e.type,
      nr: e.nr,
      x: base.x + (adj?.dx ?? 0),
      y: base.y + (adj?.dy ?? 0),
    };
  });

  return {
    entities,
    meta: {
      based_on_formation: {
        id: formationId,
        title: formation.title,
        source: `https://opencoachingformat.org/registry/formations/${registry.registry_id}.json`,
        source_version: registry.version,
        ...(adjustments.length > 0 ? { adjustments } : {}),
      },
    },
  };
}

/**
 * Lists formations for a closed-vocabulary LLM prompt or a GUI picker.
 * Deliberately returns only id/title/description/category/tags — never
 * coordinates — so callers building a prompt don't leak raw numbers the
 * model might start echoing back incorrectly instead of just picking a name.
 */
export function listFormations(options = {}) {
  const registry = loadRegistry();
  return Object.entries(registry.formations)
    .filter(([, f]) => !options.category || f.category === options.category)
    .map(([id, f]) => ({
      id,
      title: f.title,
      description: f.description,
      category: f.category,
      tags: f.tags,
    }));
}
