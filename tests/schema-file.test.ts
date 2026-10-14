import { describe, expect, it } from "vitest";
import { pocketJsonSchema } from "@/lib/schema/json-schema";
import { readJson } from "./helpers";

describe("schema/pocket.schema.json", () => {
  it("está sincronizado con el esquema Zod (ejecuta npm run gen:schema si falla)", () => {
    expect(readJson("schema/pocket.schema.json")).toEqual(JSON.parse(JSON.stringify(pocketJsonSchema())));
  });

  it("catalog.json raíz coincide con el catálogo empaquetado", () => {
    expect(readJson("catalog.json")).toEqual(readJson("src/data/catalog.json"));
  });

  it("examples/sketch-demo.json coincide con la copia empaquetada", () => {
    expect(readJson("src/data/sketch-demo.json")).toEqual(readJson("examples/sketch-demo.json"));
  });
});
