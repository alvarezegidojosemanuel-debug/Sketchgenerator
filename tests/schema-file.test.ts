import { describe, expect, it } from "vitest";
import { pocketJsonSchema } from "@/lib/schema/json-schema";
import { readJson } from "./helpers";

describe("archivos generados", () => {
  it("schema/pocket.schema.json está sincronizado con el esquema Zod (npm run gen:schema)", () => {
    expect(readJson("schema/pocket.schema.json")).toEqual(JSON.parse(JSON.stringify(pocketJsonSchema())));
  });

  it("catalog.json raíz coincide con el catálogo empaquetado", () => {
    expect(readJson("catalog.json")).toEqual(readJson("src/data/catalog.json"));
  });

  it("los ejemplos coinciden con sus copias empaquetadas", () => {
    expect(readJson("src/data/sketch-demo.json")).toEqual(readJson("examples/sketch-demo.json"));
    expect(readJson("src/data/sketch-usu-reynaldo.json")).toEqual(readJson("examples/sketch-usu-reynaldo.json"));
  });
});
