/**
 * Categorías de las poses (una pose puede estar en varias). Hay una clasificación automática por el nombre
 * de la pose; encima van los cambios comunes a todos (src/data/pose-categories.json) y los de este dispositivo.
 */
import shared from "@/data/pose-categories.json";

export const POSE_CATEGORIES = [
  { id: "reposo", label: "Reposo", icon: "🧍" },
  { id: "habla", label: "Hablando", icon: "🗣" },
  { id: "alegria", label: "Alegría", icon: "😄" },
  { id: "enfado", label: "Enfado", icon: "😠" },
  { id: "miedo", label: "Miedo / nervios", icon: "😱" },
  { id: "tristeza", label: "Tristeza / cansancio", icon: "😢" },
  { id: "sorpresa", label: "Sorpresa", icon: "😮" },
  { id: "piensa", label: "Piensa / duda", icon: "🤔" },
  { id: "amor", label: "Amor / ligar", icon: "😍" },
  { id: "malvado", label: "Malvado", icon: "😈" },
  { id: "accion", label: "Acción / movimiento", icon: "🏃" },
  { id: "trabajo", label: "Trabajando", icon: "💻" },
  { id: "objeto", label: "Con objeto", icon: "📱" },
  { id: "sentado", label: "Sentado", icon: "🪑" },
  { id: "suelo", label: "Suelo / tumbado / KO", icon: "🛌" },
] as const;
export type PoseCategory = (typeof POSE_CATEGORIES)[number]["id"];
export type PoseCategoryMap = Record<string, string[]>;

const RULES: [PoseCategory, RegExp][] = [
  ["reposo", /^(neutro|serio|silla_neutro|espaldas?|brazos2?$|brazos_cruzados|manos_espalda|bolsillos|jarras|relax|silla$|sentada_tranquila|mostrador|taburete|para)/],
  ["habla", /(explica|senala|grita|acusa|charla|megafono|^manos$|abre_brazos|_habla|saluda|ofrece|silla_manos|silla_explica|silla_grita|pulgar|guino)/],
  ["alegria", /(contento|risa|celebra|baila|encantada|ilusion|pulgar|punos_arriba|brazos_arriba|^puno|relax|selfie|silla_relajado|saluda|guino|idea|cohete$)/],
  ["enfado", /(enfado|furia|mosqueo|golpe_mesa|rompe_papel|corre_furia|cuernos|garras|acusa|grita|jarras|celosa|burla)/],
  ["miedo", /(panico|susto|nervios|agobiad|estresado|desesperada|preocupad|huye|acecha|acurrucado|tapa_boca|manos_cabeza|timid)/],
  ["tristeza", /(triste|resignada|suspira|cansad|agotado|bosteza|corazon_roto|facepalm|encoge|basura)/],
  ["sorpresa", /(sorpres|sorprendido|susto|ilusion|despierta)/],
  ["piensa", /(pensa|confundido|rasca|idea|duda|lupa|ajusta_gafas|lee_mapa|lee_planos|silla_notas|encoge|trama)/],
  ["amor", /(enamorada|coqueta|corazon|abraza|celosa|timid|guino)/],
  ["malvado", /(malvad|trama|garras|acecha|cuernos|burla|huevos)/],
  ["accion", /(camina|corre|huye|baila|vuela|carga|^entra|salta|empuja|golpe|abraza|agachad|friega|rompe|cohete|saluda|celebra)/],
  ["trabajo", /(teclea|portatil|tablet|papeles|carpeta|planos|lee|boli|notas|telefono|silla_tablet|agobiada_)/],
  ["objeto", /(movil|cafe|portatil|tablet|papeles|carpeta|lupa|caja|telefono|megafono|boli|bolsa|matraz|tubo|huevo|planos|libro|basura|gafas|selfie|lee|silla_te$|cohete|corazon$|mapa)/],
  ["sentado", /^(sentad|silla|taburete|ko_mesa|mesa|teclea_|relax)/],
  ["suelo", /^(tumbad|ko|suelo_|enfado_suelo|panico_suelo|portatil_suelo|aturdido|despierta|acurrucado|agachad)/],
];

/** Nombre corto de la pose (sin «pose_p_» / «pose_h_»). */
export const poseShortKey = (key: string) => key.replace(/^pose_[hp]_/, "");

/** Clasificación automática por el nombre. */
export function autoCategories(key: string): PoseCategory[] {
  const k = poseShortKey(key);
  const out = RULES.filter(([, re]) => re.test(k)).map(([c]) => c);
  return out.length ? out : ["reposo"];
}

export function poseCategoriesOf(poseId: string, key: string, local?: PoseCategoryMap | null): string[] {
  return local?.[poseId] ?? (shared as PoseCategoryMap)[poseId] ?? autoCategories(key);
}

const LOCAL_KEY = "pocket:poseCategories";
export const poseCategoryStore = {
  get(): PoseCategoryMap {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as PoseCategoryMap) : {};
    } catch {
      return {};
    }
  },
  save(m: PoseCategoryMap) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(m));
    } catch {
      /* sin almacenamiento */
    }
  },
};
