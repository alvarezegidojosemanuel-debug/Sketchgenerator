import { z } from "zod";
import { PocketProject } from "./pocket";

export function pocketJsonSchema() {
  const schema = z.toJSONSchema(PocketProject, { io: "input", target: "draft-2020-12" }) as Record<string, unknown>;
  return {
    $id: "https://punetos-pocket.local/schema/pocket.schema.json",
    title: "PUÑETOS Pocket project (pocket-1)",
    description:
      "Contrato JSON canónico de PUÑETOS Pocket. Campos propuestos para Pocket; no equivalen automáticamente al esquema V3/V8. " +
      "Los IDs (characterId, poseId, expressionId, backgroundId, propId) deben existir en el catálogo de la versión indicada.",
    ...schema,
  };
}
