import { describe, expect, it } from "vitest";
import { pocketJsonSchema } from "@/lib/schema/json-schema";
import fs from "node:fs";
import path from "node:path";
import { validateProject } from "@/lib/schema/validate";
import { catalog, readJson, root } from "./helpers";

describe("archivos generados", () => {
  it("schema/pocket.schema.json está sincronizado con el esquema Zod (npm run gen:schema)", () => {
    expect(readJson("schema/pocket.schema.json")).toEqual(JSON.parse(JSON.stringify(pocketJsonSchema())));
  });

  it("catalog.json raíz coincide con el catálogo empaquetado", () => {
    expect(readJson("catalog.json")).toEqual(readJson("src/data/catalog.json"));
  });

  it("los ejemplos de examples/ validan contra el catálogo empaquetado sin correcciones", () => {
    const files = fs.readdirSync(path.join(root, "examples")).filter((f) => f.endsWith(".json"));
    expect(files).toContain("sketch-demo.json");
    for (const f of files) {
      const r = validateProject(readJson(`examples/${f}`), catalog);
      expect(r.errors, f).toEqual([]);
      expect(r.warnings, f).toEqual([]);
      expect(r.project!.catalogVersion, f).toBe(catalog.catalogVersion);
    }
  });
});
