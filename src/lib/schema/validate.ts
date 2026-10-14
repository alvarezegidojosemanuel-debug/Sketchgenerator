import type { Catalog, Character } from "@/lib/catalog/types";
import { expressionForEmotion, findCharacter } from "@/lib/catalog";
import { LIMITS, PocketProject, SCHEMA_VERSION, type PocketProject as Project } from "./pocket";

export interface Issue {
  /** Ruta legible, p. ej. "takes[0].events[3].poseId". */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  project?: Project;
  errors: Issue[];
  /** Correcciones automáticas aplicadas y avisos (nunca fabrican assets). */
  warnings: Issue[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const UNSAFE_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(script|iframe|object|embed|style|img|svg|link|meta|a)\b/i,
  /javascript\s*:/i,
  /\bon[a-z]+\s*=\s*["']?/i,
  /data\s*:\s*text\/html/i,
];

/** Rechaza scripts/código incrustado en cualquier cadena (incluidas claves). */
export function findUnsafeStrings(value: unknown, path = "$", out: Issue[] = []): Issue[] {
  if (out.length > 20) return out;
  if (typeof value === "string") {
    if (UNSAFE_PATTERNS.some((re) => re.test(value))) {
      out.push({ path, message: "contiene código o HTML incrustado; no se permite" });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findUnsafeStrings(v, `${path}[${i}]`, out));
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        out.push({ path: `${path}.${k}`, message: "clave reservada no permitida" });
        continue;
      }
      findUnsafeStrings(k, `${path}.<clave>`, out);
      findUnsafeStrings(v, `${path}.${k}`, out);
    }
  }
  return out;
}

const TRACK_ALIASES: Record<string, string> = {
  dialogue: "dialogue", dialog: "dialogue", dialogo: "dialogue", "diálogo": "dialogue", speech: "dialogue", say: "dialogue", text: "dialogue",
  body: "body", cuerpo: "body", pose: "body", move: "body", movement: "body",
  face: "face", cara: "face", expression: "face", expresion: "face", "expresión": "face", emotion: "face",
  mouth: "mouth", boca: "mouth",
  eyes: "eyes", ojos: "eyes", gaze: "eyes", mirada: "eyes",
  props: "props", prop: "props", objeto: "props", objetos: "props",
};

const NUMERIC_KEYS = new Set(["start", "duration", "x", "y", "scale", "zIndex", "gazeX", "gazeY", "dx", "dy", "rate", "pitch", "approxDuration"]);

/** Convierte "3.5" → 3.5 en claves numéricas conocidas (corrección común de LLMs). */
function coerceNumbers(o: Obj, path: string, warnings: Issue[]) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (NUMERIC_KEYS.has(k) && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      o[k] = Number(v);
      warnings.push({ path: `${path}.${k}`, message: `convertido de texto a número (${v})` });
    }
  }
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]+/g, "_");

function matchCharacter(catalog: Catalog, raw: unknown): Character | undefined {
  if (typeof raw !== "string") return undefined;
  const n = norm(raw);
  return catalog.characters.find((c) => norm(c.id) === n || norm(c.name) === n);
}

function matchPoseId(ch: Character, raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const n = norm(raw);
  const hit =
    ch.poses.find((p) => p.id === raw) ??
    ch.poses.find((p) => norm(p.id) === n) ??
    ch.poses.find((p) => norm(p.key) === n) ??
    ch.poses.find((p) => norm(p.key) === `pose_${n}`) ??
    ch.poses.find((p) => norm(p.label) === n);
  return hit?.id;
}

/** Sinónimos frecuentes → emoción del catálogo. */
export const EMOTION_SYNONYMS: Record<string, string> = {
  neutro: "neutral", normal: "neutral", serio: "neutral",
  feliz: "alegria", contento: "alegria", alegre: "alegria", happy: "alegria", sonrisa: "alegria",
  reir: "risa", riendo: "risa", carcajada: "risa", laugh: "risa",
  enfadado: "enfado", enojado: "enfado", furioso: "enfado", ira: "enfado", angry: "enfado",
  sorprendido: "sorpresa", asombro: "sorpresa", surprised: "sorpresa", susto: "sorpresa", asustado: "sorpresa",
  triste: "tristeza", sad: "tristeza", pena: "tristeza", llorar: "tristeza",
};

export function normalizeEmotion(raw: string): string {
  const n = norm(raw);
  return EMOTION_SYNONYMS[n] ?? n;
}

function matchExpressionId(ch: Character, raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const n = norm(raw);
  const last = n.split(".").pop() ?? n;
  const hit =
    ch.expressions.find((e) => e.id === raw) ??
    ch.expressions.find((e) => norm(e.id) === n) ??
    ch.expressions.find((e) => norm(e.label) === n) ??
    ch.expressions.find((e) => e.emotion === normalizeEmotion(last) && (n === last || n.startsWith(`expression.${ch.id}.`)));
  return hit?.id;
}

function matchById<T extends { id: string; label: string }>(list: T[], raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const n = norm(raw);
  return (list.find((x) => x.id === raw) ?? list.find((x) => norm(x.id) === n || norm(x.label) === n))?.id;
}

/** Duración estimada de un diálogo en segundos (ritmo de habla ~3 palabras/s). */
export function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((0.5 + words * 0.36) * 10) / 10;
}

/**
 * Normaliza un objeto crudo (p. ej. salida de un LLM) corrigiendo errores comunes
 * SIN inventar assets: solo resuelve IDs que existen en el catálogo.
 */
export function normalizeRaw(input: unknown, catalog: Catalog, warnings: Issue[]): unknown {
  if (!isObj(input)) return input;
  const p: Obj = structuredClone(input);

  // Algunos modelos envuelven el resultado: { "project": {...} }
  if (!p.takes && isObj(p.project)) {
    warnings.push({ path: "$", message: "se usó el objeto interior 'project'" });
    return normalizeRaw(p.project, catalog, warnings);
  }

  if (p.schemaVersion === undefined) {
    p.schemaVersion = SCHEMA_VERSION;
    warnings.push({ path: "schemaVersion", message: `faltaba; se asume "${SCHEMA_VERSION}"` });
  }
  if (p.catalogVersion === undefined) {
    p.catalogVersion = catalog.catalogVersion;
    warnings.push({ path: "catalogVersion", message: `faltaba; se asume "${catalog.catalogVersion}"` });
  } else if (p.catalogVersion !== catalog.catalogVersion) {
    warnings.push({
      path: "catalogVersion",
      message: `el proyecto indica "${String(p.catalogVersion)}" pero el catálogo cargado es "${catalog.catalogVersion}"; se validan los IDs contra el catálogo actual`,
    });
  }
  if (p.canvas === undefined) p.canvas = { width: 1080, height: 1920 };

  if (!isObj(p.metadata)) p.metadata = {};
  const meta = p.metadata as Obj;
  coerceNumbers(meta, "metadata", warnings);
  if (typeof meta.title !== "string" || !meta.title.trim()) {
    meta.title = "Sketch sin título";
    warnings.push({ path: "metadata.title", message: "faltaba; se puso 'Sketch sin título'" });
  }
  if (meta.language === undefined) meta.language = "es-ES";

  if (!Array.isArray(p.takes)) return p;

  p.takes.forEach((takeRaw, ti) => {
    if (!isObj(takeRaw)) return;
    const take = takeRaw;
    const tp = `takes[${ti}]`;
    coerceNumbers(take, tp, warnings);
    if (take.id === undefined) {
      take.id = `take_${ti + 1}`;
      warnings.push({ path: `${tp}.id`, message: `faltaba; se asignó "${take.id}"` });
    }
    if (take.backgroundId === undefined || take.backgroundId === "") {
      take.backgroundId = null;
    } else if (take.backgroundId !== null) {
      const bg = matchById(catalog.backgrounds, take.backgroundId);
      if (bg && bg !== take.backgroundId) {
        warnings.push({ path: `${tp}.backgroundId`, message: `"${String(take.backgroundId)}" → "${bg}"` });
        take.backgroundId = bg;
      }
    }

    const actorChars = new Map<string, Character>();
    if (Array.isArray(take.actors)) {
      take.actors.forEach((aRaw, ai) => {
        if (!isObj(aRaw)) return;
        const a = aRaw;
        const ap = `${tp}.actors[${ai}]`;
        coerceNumbers(a, ap, warnings);
        if (a.uid === undefined && typeof a.actorUid === "string") a.uid = a.actorUid;
        if (a.uid === undefined) {
          a.uid = `actor${ai + 1}`;
          warnings.push({ path: `${ap}.uid`, message: `faltaba; se asignó "${a.uid}"` });
        }
        delete a.actorUid;
        const ch = matchCharacter(catalog, a.characterId);
        if (ch) {
          if (ch.id !== a.characterId) {
            warnings.push({ path: `${ap}.characterId`, message: `"${String(a.characterId)}" → "${ch.id}"` });
            a.characterId = ch.id;
          }
          actorChars.set(String(a.uid), ch);
          if (a.poseId === undefined) {
            a.poseId = ch.poses[0]?.id;
            warnings.push({ path: `${ap}.poseId`, message: `faltaba; se usó la primera pose "${a.poseId}"` });
          } else {
            const pid = matchPoseId(ch, a.poseId);
            if (pid && pid !== a.poseId) {
              warnings.push({ path: `${ap}.poseId`, message: `"${String(a.poseId)}" → "${pid}"` });
              a.poseId = pid;
            }
          }
          if (a.expressionId !== undefined) {
            const eid = matchExpressionId(ch, a.expressionId);
            if (eid) a.expressionId = eid;
            else {
              warnings.push({ path: `${ap}.expressionId`, message: `"${String(a.expressionId)}" no existe; se usa fallback "${ch.fallbackExpressionId}"` });
              a.expressionId = ch.fallbackExpressionId;
            }
          }
        }
      });
    }

    let maxEnd = 0;
    if (Array.isArray(take.events)) {
      take.events.forEach((eRaw, ei) => {
        if (!isObj(eRaw)) return;
        const e = eRaw;
        const ep = `${tp}.events[${ei}]`;
        if (e.actorUid === undefined && typeof e.actor_uid === "string") {
          e.actorUid = e.actor_uid;
          delete e.actor_uid;
        }
        coerceNumbers(e, ep, warnings);
        if (e.voice && isObj(e.voice)) coerceNumbers(e.voice, `${ep}.voice`, warnings);
        if (typeof e.track === "string") {
          const t = TRACK_ALIASES[norm(e.track)];
          if (t && t !== e.track) {
            warnings.push({ path: `${ep}.track`, message: `"${e.track}" → "${t}"` });
            e.track = t;
          }
        }
        if (e.id === undefined) {
          e.id = `${String(take.id)}_e${ei + 1}`;
        }
        if (e.track === "dialogue" && typeof e.text === "string" && e.duration === undefined) {
          e.duration = estimateSpeechDuration(e.text);
          warnings.push({ path: `${ep}.duration`, message: `faltaba; estimada en ${e.duration}s según el texto` });
        }
        if (e.start === undefined) {
          e.start = 0;
          warnings.push({ path: `${ep}.start`, message: "faltaba; se asume 0" });
        }
        if ((e.track === "mouth") && e.mode === undefined) e.mode = "auto";

        const ch = typeof e.actorUid === "string" ? actorChars.get(e.actorUid) : undefined;
        if (ch && e.track === "body" && e.poseId !== undefined) {
          const pid = matchPoseId(ch, e.poseId);
          if (pid && pid !== e.poseId) {
            warnings.push({ path: `${ep}.poseId`, message: `"${String(e.poseId)}" → "${pid}"` });
            e.poseId = pid;
          }
        }
        if (ch && e.track === "face") {
          if (e.expressionId !== undefined) {
            const eid = matchExpressionId(ch, e.expressionId);
            if (eid) e.expressionId = eid;
            else {
              // ¿Es en realidad una emoción?
              const asEmotion = typeof e.expressionId === "string" ? normalizeEmotion(String(e.expressionId).split(".").pop() ?? "") : "";
              const { expression, usedFallback } = expressionForEmotion(catalog, ch.id, asEmotion);
              warnings.push({
                path: `${ep}.expressionId`,
                message: usedFallback
                  ? `"${String(e.expressionId)}" no está registrada para ${ch.name}; se usa el fallback declarado "${expression?.id}"`
                  : `"${String(e.expressionId)}" → "${expression?.id}"`,
              });
              e.expressionId = expression?.id;
            }
          } else if (typeof e.emotion === "string") {
            const { expression, usedFallback } = expressionForEmotion(catalog, ch.id, normalizeEmotion(e.emotion));
            if (usedFallback) {
              warnings.push({
                path: `${ep}.emotion`,
                message: `emoción "${e.emotion}" no registrada para ${ch.name}; se usa el fallback declarado "${expression?.id}"`,
              });
            }
            e.expressionId = expression?.id;
          }
        }
        if (e.track === "props" && e.propId !== undefined) {
          const pid = matchById(catalog.props, e.propId);
          if (pid && pid !== e.propId) {
            warnings.push({ path: `${ep}.propId`, message: `"${String(e.propId)}" → "${pid}"` });
            e.propId = pid;
          }
          if (e.layer === undefined) e.layer = "props-front";
        }
        if (typeof e.start === "number" && typeof e.duration === "number") {
          maxEnd = Math.max(maxEnd, e.start + e.duration);
        }
      });
    }

    // Eventos que terminan después de la toma: se amplía la toma (sin pasar del máximo).
    if (take.duration === undefined && maxEnd > 0) {
      take.duration = Math.round(maxEnd * 10) / 10;
      warnings.push({ path: `${tp}.duration`, message: `faltaba; se calculó ${take.duration}s a partir de los eventos` });
    } else if (typeof take.duration === "number" && maxEnd > take.duration + 1e-6 && maxEnd <= LIMITS.maxTakeDuration) {
      warnings.push({ path: `${tp}.duration`, message: `ampliada de ${take.duration}s a ${maxEnd.toFixed(1)}s para cubrir todos los eventos` });
      take.duration = Math.round(maxEnd * 10) / 10;
    }
  });

  if (meta.approxDuration === undefined) {
    const total = (p.takes as Obj[]).reduce((s, t) => s + (typeof t?.duration === "number" ? t.duration : 0), 0);
    if (total > 0) meta.approxDuration = Math.round(total);
  }
  return p;
}

/** Comprobaciones semánticas contra el catálogo y referencias internas. */
export function checkSemantics(project: Project, catalog: Catalog): Issue[] {
  const errors: Issue[] = [];
  let totalEvents = 0;
  let totalDuration = 0;
  const takeIds = new Set<string>();

  project.takes.forEach((take, ti) => {
    const tp = `takes[${ti}]`;
    if (takeIds.has(take.id)) errors.push({ path: `${tp}.id`, message: `ID de toma duplicado "${take.id}"` });
    takeIds.add(take.id);
    totalDuration += take.duration;
    totalEvents += take.events.length;

    if (take.backgroundId !== null && !catalog.backgrounds.some((b) => b.id === take.backgroundId)) {
      errors.push({ path: `${tp}.backgroundId`, message: `fondo "${take.backgroundId}" no existe en el catálogo` });
    }

    const actorChar = new Map<string, string>();
    take.actors.forEach((a, ai) => {
      const ap = `${tp}.actors[${ai}]`;
      if (actorChar.has(a.uid)) errors.push({ path: `${ap}.uid`, message: `uid duplicado "${a.uid}"` });
      const ch = findCharacter(catalog, a.characterId);
      if (!ch) {
        errors.push({ path: `${ap}.characterId`, message: `personaje "${a.characterId}" no existe en el catálogo` });
        return;
      }
      actorChar.set(a.uid, ch.id);
      if (!ch.poses.some((p) => p.id === a.poseId)) {
        errors.push({ path: `${ap}.poseId`, message: `pose "${a.poseId}" no existe para ${ch.name}` });
      }
      if (a.expressionId && !ch.expressions.some((e) => e.id === a.expressionId)) {
        errors.push({ path: `${ap}.expressionId`, message: `expresión "${a.expressionId}" no existe para ${ch.name}` });
      }
    });

    const eventIds = new Set<string>();
    take.events.forEach((e, ei) => {
      const ep = `${tp}.events[${ei}]`;
      if (eventIds.has(e.id)) errors.push({ path: `${ep}.id`, message: `ID de evento duplicado "${e.id}"` });
      eventIds.add(e.id);
      if (e.start + e.duration > take.duration + 1e-6) {
        errors.push({ path: ep, message: `termina en ${(e.start + e.duration).toFixed(2)}s, después de la toma (${take.duration}s)` });
      }
      if (e.actorUid !== undefined && !actorChar.has(e.actorUid)) {
        errors.push({ path: `${ep}.actorUid`, message: `actor "${e.actorUid}" no existe en esta toma` });
        return;
      }
      const charId = e.actorUid ? actorChar.get(e.actorUid) : undefined;
      const ch = charId ? findCharacter(catalog, charId) : undefined;
      switch (e.track) {
        case "body":
          if (e.poseId && ch && !ch.poses.some((p) => p.id === e.poseId)) {
            errors.push({ path: `${ep}.poseId`, message: `pose "${e.poseId}" no existe para ${ch.name}` });
          }
          break;
        case "face":
          if (!e.expressionId) {
            errors.push({ path: ep, message: "evento face sin expressionId ni emotion válida" });
          } else if (ch && !ch.expressions.some((x) => x.id === e.expressionId)) {
            errors.push({ path: `${ep}.expressionId`, message: `expresión "${e.expressionId}" no existe para ${ch.name}` });
          }
          break;
        case "props":
          if (!catalog.props.some((p) => p.id === e.propId)) {
            errors.push({ path: `${ep}.propId`, message: `objeto "${e.propId}" no existe en el catálogo` });
          }
          break;
      }
    });
  });

  if (totalEvents > LIMITS.maxEventsTotal) {
    errors.push({ path: "takes", message: `demasiados eventos (${totalEvents} > ${LIMITS.maxEventsTotal})` });
  }
  if (totalDuration > LIMITS.maxTotalDuration) {
    errors.push({ path: "takes", message: `duración total ${totalDuration.toFixed(1)}s supera el máximo de ${LIMITS.maxTotalDuration}s` });
  }
  return errors;
}

function formatZodPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg)), "") || "$";
}

/** Pipeline completo: seguridad → normalización → esquema → semántica. */
export function validateProject(input: unknown, catalog: Catalog): ValidationResult {
  const warnings: Issue[] = [];
  const unsafe = findUnsafeStrings(input);
  if (unsafe.length) return { ok: false, errors: unsafe, warnings };
  if (!isObj(input)) {
    return { ok: false, errors: [{ path: "$", message: "se esperaba un objeto JSON { ... } con 'takes'" }], warnings };
  }

  const normalized = normalizeRaw(input, catalog, warnings);
  const parsed = PocketProject.safeParse(normalized);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 30).map((iss) => ({ path: formatZodPath(iss.path), message: iss.message }));
    return { ok: false, errors, warnings };
  }
  const errors = checkSemantics(parsed.data, catalog);
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, project: parsed.data, errors: [], warnings };
}
