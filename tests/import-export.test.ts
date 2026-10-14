import { describe, expect, it } from "vitest";
import { exportProjectText, importProjectText, projectFileName } from "@/lib/import-export";
import { validateProject } from "@/lib/schema/validate";
import { catalog, demo } from "./helpers";

describe("exportar/importar (prueba 2)", () => {
  it("conserva diálogos y posiciones tras un ciclo completo", () => {
    const original = validateProject(demo(), catalog).project!;
    // Simula una edición: mover un actor y cambiar un diálogo
    original.takes[1].actors[0].x = 222;
    (original.takes[1].events[0] as { text: string }).text = "Texto editado en el móvil";
    const text = exportProjectText(original);
    const back = importProjectText(text, catalog);
    expect(back.ok).toBe(true);
    expect(back.warnings).toEqual([]);
    expect(back.project).toEqual(original);

    const dialogues = (p: typeof original) => p.takes.flatMap((t) => t.events.filter((e) => e.track === "dialogue").map((e) => [e.id, (e as { text: string }).text]));
    const positions = (p: typeof original) => p.takes.flatMap((t) => t.actors.map((a) => [a.uid, a.x, a.y, a.scale]));
    expect(dialogues(back.project!)).toEqual(dialogues(original));
    expect(positions(back.project!)).toEqual(positions(original));
  });

  it("nombre de archivo seguro", () => {
    expect(projectFileName(demo())).toBe("la-taza-del-jefe.pocket.json");
  });
});
