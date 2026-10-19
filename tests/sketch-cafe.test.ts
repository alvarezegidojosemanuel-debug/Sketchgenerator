import { it, expect } from "vitest";
import { catalog } from "@/lib/catalog";
import { compileScript } from "@/lib/script/compile";
import raw from "@/data/sketch-02-ultimo-cafe.json";
it("el último café monta sin avisos", () => {
  const r = compileScript(raw as never, catalog);
  console.log(JSON.stringify(r.issues), r.project?.takes[0].duration);
  expect(r.issues).toEqual([]);
});
