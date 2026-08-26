/**
 * Resolves a formation reference (registry id + optional per-entity
 * adjustments) into concrete OCF `entities`. This is the only place that
 * needs to know formations exist at all — once resolved, the result is
 * plain entities data indistinguishable from anything hand-authored, per
 * the "resolve at authoring time, not render time" rule (see
 * rfc-external-references.md §2). ocf-renderer never imports this module.
 *
 * Named-position coordinates come from @opencoachingformat/spec's own
 * per-ruleset resolver — this package intentionally keeps no local
 * coordinate table, so there is one source of truth and no drift.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNamedPosition } from "@opencoachingformat/spec/positions/resolve-position.mjs";

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

function entityRef(entity) {
  return `${entity.type}_${entity.nr}`;
}

/**
 * @param {string} formationId - e.g. "4_out_1_in"
 * @param {Adjustment[]} [adjustments]
 * @param {{ ruleset?: string }} [options] - ruleset for coordinate resolution (default "fiba")
 * @returns {{ entities: Entity[], meta: { based_on_formation: object } }}
 */
export function resolveFormation(formationId, adjustments = [], options = {}) {
  const ruleset = options.ruleset ?? "fiba";
  const registry = loadRegistry();
  const formation = registry.formations[formationId];
  if (!formation) {
    const available = Object.keys(registry.formations).join(", ");
    throw new Error(`Unknown formation id '${formationId}'. Available: ${available}`);
  }

  const adjustmentsByEntity = new Map(adjustments.map((a) => [a.entity, a]));

  const entities = formation.entities.map((e) => {
    // resolveNamedPosition throws with a clear message if the name is unknown
    // for the ruleset — no local coordinate table, no drift.
    const base = resolveNamedPosition(e.named, ruleset);
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
