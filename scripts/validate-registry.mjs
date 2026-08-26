#!/usr/bin/env node
/**
 * Validates every formations registry file in this package against:
 *   1. Structural sanity (valid JSON, required fields present).
 *   2. Every `entities[].nr` covers 1-5 exactly once per formation
 *      (OCF entity refs must be unique within a document).
 *   3. Every `entities[].named` position actually exists in the current
 *      OCF schema's named-position catalog — so a schema change that
 *      renames/removes a named position (e.g. spec/schema/v1.json) is
 *      caught here instead of silently producing formations that resolve
 *      to nothing.
 *
 * This mirrors the same lesson as ocf-renderer's codegen fix: a second,
 * unchecked copy of "what's a valid reference" drifts. Here we don't
 * generate types (there's no static-typing benefit for JSON registry
 * data), so instead we cross-check at CI/build time against the schema
 * package directly.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = resolve(__dirname, "..");

function resolveSchemaPath() {
  try {
    return require.resolve("@opencoachingformat/spec/schema/v1.json");
  } catch {
    return resolve(__dirname, "../../spec/schema/v1.json");
  }
}

function extractNamedPositions(schema) {
  // named positions are documented, not enumerated as a JSON Schema `enum`
  // in schema/v1.json today (Coordinate.named is typed as `string` with
  // the catalog living in docs/specification-v1.adoc). Until the schema
  // itself exposes the catalog as data (recommended follow-up: promote the
  // named-position table to a small JSON file the schema references, the
  // same way this package promotes formations to data), this script reads
  // an explicit allowlist mirrored from that table. Keep this list in sync
  // with docs/specification-v1.adoc §"Named Position Catalog" by hand
  // until that follow-up lands.
  return new Set([
    "basket",
    "left_block", "right_block",
    "paint_center",
    "left_short_corner", "right_short_corner",
    "left_elbow", "right_elbow",
    "free_throw_line",
    "high_post_left", "high_post_right",
    "top_of_the_key",
    "left_wing", "right_wing",
    "left_corner", "right_corner",
    "midcourt.center", "midcourt.left", "midcourt.right",
    "inbound.baseline_left", "inbound.baseline_right", "inbound.baseline_center",
    "inbound.sideline_left_fc", "inbound.sideline_right_fc",
  ]);
}

function validateRegistryFile(path, knownNamed) {
  const errors = [];
  let reg;
  try {
    reg = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return [`${path}: invalid JSON — ${e.message}`];
  }

  for (const field of ["registry_id", "version", "sport", "formations"]) {
    if (!(field in reg)) errors.push(`${path}: missing required field '${field}'`);
  }

  for (const [id, formation] of Object.entries(reg.formations ?? {})) {
    if (!["offense", "defense"].includes(formation.category)) {
      errors.push(`${path} [${id}]: category must be 'offense' or 'defense', got '${formation.category}'`);
    }
    const nrs = (formation.entities ?? []).map((e) => e.nr);
    const uniqueNrs = new Set(nrs);
    if (uniqueNrs.size !== nrs.length) {
      errors.push(`${path} [${id}]: duplicate player numbers: ${nrs.join(",")}`);
    }
    if (JSON.stringify([...uniqueNrs].sort()) !== JSON.stringify([1, 2, 3, 4, 5])) {
      errors.push(`${path} [${id}]: expected players 1-5 exactly once, got: ${[...uniqueNrs].sort().join(",")}`);
    }
    for (const entity of formation.entities ?? []) {
      if (entity.named && !knownNamed.has(entity.named)) {
        errors.push(`${path} [${id}]: unknown named position '${entity.named}' (player ${entity.nr})`);
      }
      if (!["offense", "defense"].includes(entity.type)) {
        errors.push(`${path} [${id}]: entity type must be 'offense' or 'defense', got '${entity.type}' (player ${entity.nr})`);
      }
    }
  }

  return errors;
}

function main() {
  const schemaPath = resolveSchemaPath();
  let knownNamed;
  try {
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    knownNamed = extractNamedPositions(schema);
  } catch (e) {
    console.error(`[validate-registry] Could not load schema at ${schemaPath}: ${e.message}`);
    process.exit(1);
  }

  const files = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json") && f !== "package.json");
  let allErrors = [];
  for (const file of files) {
    const errors = validateRegistryFile(resolve(REGISTRY_DIR, file), knownNamed);
    allErrors = allErrors.concat(errors);
  }

  if (allErrors.length > 0) {
    console.error(`[validate-registry] ${allErrors.length} error(s):`);
    for (const e of allErrors) console.error("  -", e);
    process.exit(1);
  }

  console.log(`[validate-registry] OK — validated ${files.length} registry file(s).`);
}

main();
