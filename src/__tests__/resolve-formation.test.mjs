import { describe, it, expect } from "vitest";
import { resolveFormation, listFormations } from "../resolve-formation.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(
  readFileSync(resolve(__dirname, "../../basketball-v1.json"), "utf-8")
);

describe("listFormations", () => {
  it("lists every formation in the registry", () => {
    const all = listFormations();
    expect(all.length).toBe(Object.keys(registry.formations).length);
  });

  it("filters by category", () => {
    const offense = listFormations({ category: "offense" });
    const defense = listFormations({ category: "defense" });
    expect(offense.every((f) => f.category === "offense")).toBe(true);
    expect(defense.every((f) => f.category === "defense")).toBe(true);
    expect(offense.length + defense.length).toBe(Object.keys(registry.formations).length);
  });

  it("never includes coordinates (closed-vocabulary safety for LLM prompts)", () => {
    const all = listFormations();
    for (const f of all) {
      expect(f).not.toHaveProperty("entities");
      expect(f).not.toHaveProperty("x");
      expect(f).not.toHaveProperty("y");
    }
  });
});

describe("resolveFormation", () => {
  it("resolves every registry formation without throwing", () => {
    for (const id of Object.keys(registry.formations)) {
      expect(() => resolveFormation(id)).not.toThrow();
    }
  });

  it("returns exactly 5 entities with unique nr 1-5 for every formation", () => {
    for (const id of Object.keys(registry.formations)) {
      const { entities } = resolveFormation(id);
      expect(entities).toHaveLength(5);
      expect(new Set(entities.map((e) => e.nr))).toEqual(new Set([1, 2, 3, 4, 5]));
    }
  });

  it("applies adjustments as deltas, not absolute overrides", () => {
    const withoutAdjustment = resolveFormation("4_out_1_in");
    const withAdjustment = resolveFormation("4_out_1_in", [
      { entity: "offense_5", dx: -0.5, dy: 0.25 },
    ]);
    const base = withoutAdjustment.entities.find((e) => e.nr === 5);
    const adjusted = withAdjustment.entities.find((e) => e.nr === 5);
    expect(adjusted.x).toBeCloseTo(base.x - 0.5);
    expect(adjusted.y).toBeCloseTo(base.y + 0.25);
  });

  it("leaves un-adjusted players untouched when only one player is adjusted", () => {
    const { entities } = resolveFormation("horns", [{ entity: "offense_1", dx: 1, dy: 1 }]);
    const p4 = entities.find((e) => e.nr === 4);
    const registryP4 = registry.formations.horns.entities.find((e) => e.nr === 4);
    expect(registryP4.named).toBe("high_post_left");
    // sanity: unadjusted player keeps the registry's named-position value
    // (checked indirectly since this module only exposes resolved x/y)
    expect(p4.x).toBeLessThan(0); // high_post_left is on the negative-x side
  });

  it("includes based_on_formation provenance with registry source + version", () => {
    const { meta } = resolveFormation("5_out");
    expect(meta.based_on_formation.id).toBe("5_out");
    expect(meta.based_on_formation.source).toContain("basketball-v1.json");
    expect(meta.based_on_formation.source_version).toBe(registry.version);
  });

  it("omits adjustments field entirely when there are none", () => {
    const { meta } = resolveFormation("5_out");
    expect(meta.based_on_formation.adjustments).toBeUndefined();
  });

  it("throws a clear error for an unknown formation id", () => {
    expect(() => resolveFormation("does_not_exist")).toThrow(/Unknown formation id/);
  });

  it("resolves the same formation in nba units, different coordinates than fiba", () => {
    const fiba = resolveFormation("5_out", [], { ruleset: "fiba" });
    const nba = resolveFormation("5_out", [], { ruleset: "nba" });
    const fibaPG = fiba.entities.find((e) => e.nr === 1);
    const nbaPG = nba.entities.find((e) => e.nr === 1);
    expect(fibaPG.y).toBeCloseTo(5.68, 2);
    expect(nbaPG.y).toBeCloseTo(20.75, 2);
  });

  it("still defaults to fiba when no ruleset is given", () => {
    const def = resolveFormation("5_out");
    const fiba = resolveFormation("5_out", [], { ruleset: "fiba" });
    expect(def.entities).toEqual(fiba.entities);
  });
});
