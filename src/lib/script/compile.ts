/**
 * MONTADOR DE GUIONES. ChatGPT (o cualquiera) escribe solo el guion —escenas, quién dice qué, con qué
 * emoción, pausas, «a la vez», entradas y salidas, efectos— y Pocket lo monta con todo el oficio de la
 * serie: humanos de espaldas en sus sillas, posturas al hablar, coros, silencios, miradas, tiempos,
 * bocas y bocadillos. Sin coordenadas ni segundos en el guion.
 *
 * Formato «puñetos-guion-1» (claves en español; ver GUION_EJEMPLO más abajo).
 */
import type { Catalog } from "@/lib/catalog/types";
import type { PocketEvent, PocketProject, Take } from "@/lib/schema/pocket";
import { groupLayout } from "@/lib/timeline/arrange";
import { animDuration, resolveAnimation } from "@/lib/animation/animations";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function isScript(v: unknown): v is Obj {
  return isObj(v) && Array.isArray(v.escenas);
}

// ---------------------------------------------------------------- humanos de espaldas en la oficina
/** Escenarios de oficina con los 5 puestos (vista por detrás). */
export const OFFICE_BGS = ["bg_oficina_manana", "bg_oficina_soporte", "bg_oficina_noche"];
// centro de la silla respecto al centro de la imagen y ancho de la silla (px de la imagen a 800 de alto)
const CHAIR: Record<string, [number, number]> = {
  barbas_espaldas_habla: [-2, 490], barbas_espaldas_teclea: [-6, 520], jefe_espaldas_senala: [35, 500], jefe_espaldas_teclea: [18, 520],
  reynaldo_espaldas_hombros: [24, 459], reynaldo_espaldas_teclea: [-4, 437], sister_espaldas_explica: [-6, 475], sister_espaldas_senala: [-16, 400],
  sister_espaldas_teclea: [14, 401], usu_espaldas_habla: [-15, 450], usu_espaldas_teclea: [-11, 471],
};
const SEAT: Record<string, [number, number, number]> = { sister: [102, 975, 0.312], reynaldo: [427, 1028, 0.319], barbas: [782, 1090, 0.331], jefe: [83, 1622, 0.775], usu: [575, 1848, 0.875] };
const SEAT_Z: Record<string, number> = { sister: 1, reynaldo: 2, barbas: 3, jefe: 4, usu: 5 };
/** Postura de espaldas al hablar (y alternativas por gesto). */
const BACK_TALK: Record<string, string> = { sister: "explica", reynaldo: "hombros", barbas: "habla", jefe: "senala", usu: "habla" };
const BACK_GESTURE: Record<string, Record<string, string>> = {
  sister: { senala: "senala", pointing: "senala", explica: "explica" },
  reynaldo: { hombros: "hombros" },
  jefe: { senala: "senala", pointing: "senala" },
  barbas: {},
  usu: {},
};

// ---------------------------------------------------------------- nombres tolerantes
const CHAR_ALIAS: Record<string, string> = { fake: "fake", fake_el_fallido: "fake", alf: "alf", ruan: "ruan", vanesa: "vanesa", cientifica: "cientifica", damian: "damian", gala: "gala", neli: "neli", director: "director", el_director: "director", usu: "usu", reynaldo: "reynaldo", rey: "reynaldo", sister: "sister", sis: "sister", barbas: "barbas", jefe: "jefe", el_jefe: "jefe" };
const EMO_ALIAS: Record<string, string> = {
  neutral: "neutral", serio: "neutral", seria: "neutral", normal: "neutral",
  alegria: "alegria", contento: "alegria", contenta: "alegria", feliz: "alegria", sonrie: "alegria",
  risa: "risa", riendo: "risa", rie: "risa", carcajada: "risa",
  enfado: "enfado", enfadado: "enfado", enfadada: "enfado", enfadarse: "enfado", furioso: "enfado", molesto: "enfado",
  sorpresa: "sorpresa", sorprendido: "sorpresa", sorprendida: "sorpresa", asustado: "sorpresa", asustada: "sorpresa", susto: "sorpresa",
  tristeza: "tristeza", triste: "tristeza", resignado: "tristeza", resignada: "tristeza",
};
const POSE_ALIAS: Record<string, string> = {
  frente: "neutral_front", neutral: "neutral_front", neutral_front: "neutral_front",
  explica: "talk_explain", explicar: "talk_explain", talk_explain: "talk_explain", habla: "talk_explain",
  enfatiza: "talk_emphasis", enfasis: "talk_emphasis", talk_emphasis: "talk_emphasis", grita: "talk_emphasis",
  senala: "pointing", pointing: "pointing", apunta: "pointing",
  brazos_cruzados: "arms_crossed", cruzado: "arms_crossed", arms_crossed: "arms_crossed",
  reacciona: "reaction", reaccion: "reaction", reaction: "reaction",
  camina_izquierda: "walk_small_left", camina_derecha: "walk_small_right",
  confundido: "confundido", confusa: "confundido", confundida: "confundido", duda: "confundido",
  panico: "panico", desesperado: "panico", desesperada: "panico",
  sorprendido: "sorprendido", sorprendida: "sorprendido", retrocede: "sorprendido",
  camina: "camina", andando: "camina", entra: "entra", saluda: "entra",
  sentado: "sentado_habla", sentado_habla: "sentado_habla", cansado: "sentado_cansado", sentado_cansado: "sentado_cansado",
  teclea: "sentado_teclea", sentado_teclea: "sentado_teclea", agobiado: "sentado_agobiado",
  celebra: "celebra", celebrar: "celebra", victoria: "celebra", pensando: "pensando", piensa: "pensando", pensativo: "pensando",
  movil: "movil", telefono_movil: "movil", encoge: "encoge", hombros: "encoge", corre: "corre", corriendo: "corre", susto: "susto",
};
/** Vista «humanos» (de frente, poses dibujadas enteras): equivalencias de las poses de los Puñetos. */
function humanRow(n: number) {
  const xs = Array.from({ length: n }, (_, i) => Math.round((n >= 6 ? 110 : 140) + (i * (n >= 6 ? 860 : 800)) / (n - 1)));
  return xs.map((x, i) => ({ x, y: 1790, scale: n >= 6 ? 0.66 : n >= 5 ? 0.72 : 0.8, zIndex: 1 + (i % 2) }));
}
const HUMAN_POSE: Record<string, string[]> = {
  neutral_front: ["neutro"], neutral_3q_left: ["neutro"], neutral_3q_right: ["neutro"],
  talk_explain: ["explica"], talk_emphasis: ["explica"], pointing: ["senala", "explica"], arms_crossed: ["brazos_cruzados", "neutro"],
  reaction: ["sorprendido"], walk_small_left: ["camina"], walk_small_right: ["camina"],
  susto: ["susto", "sorprendido"], panico: ["panico", "susto"], pensando: ["pensando", "confundido"], encoge: ["encoge", "explica"],
  sentado_habla: ["sentado_habla", "sentado_teclea"], sentado_agobiado: ["sentado_agobiado", "sentado_cansado"], sentado_cansado: ["sentado_cansado", "sentado_agobiado"],
};
const AMBIENT_BY_BG: Record<string, string> = {
  bg_recepcion: "recepcion", bg_sistemas: "oficina", bg_oficina_soporte: "oficina", bg_oficina_manana: "oficina", bg_oficina: "oficina",
  bg_pasillo: "oficina", bg_sala_reuniones: "oficina", bg_despacho_director: "oficina", bg_despacho_director_2: "oficina",
};
const SOUND_ALIAS: Record<string, string> = { telefono: "sfx_telefono", alarma: "sfx_alarma", pop: "sfx_pop", whoosh: "sfx_whoosh", ding: "sfx_ding", boing: "sfx_boing", golpe: "sfx_golpe", fracaso: "sfx_fracaso", teclado: "sfx_teclado", pantallazo: "sfx_pantallazo", servidor: "sfx_servidor", explosion: "sfx_explosion", portazo: "sfx_golpe" };

const COMIC_FX: Record<string, "sudor" | "sorpresa" | "enfado" | "lineas" | "risa" | "onomatopeya" | "corazones" | "mareo" | "humo"> = {
  sudor: "sudor", gotas: "sudor", sorpresa: "sorpresa", susto: "sorpresa", enfado: "enfado", vena: "enfado", furia: "enfado",
  lineas: "lineas", velocidad: "lineas", risa: "risa", ja: "risa", jaja: "risa", onomatopeya: "onomatopeya", zas: "onomatopeya", humo: "humo", polvo: "humo", polvareda: "humo", mareo: "mareo", aturdido: "mareo", estrellas: "mareo", corazones: "corazones", corazon: "corazones", amor: "corazones", enamorada: "corazones",
};

/**
 * Indicación de interpretación automática para ElevenLabs v3 (solo si la frase no trae ya una):
 * cómo suena cada personaje por defecto y gritos / preguntas / susto según el texto y el gesto.
 * Los demás motores de voz quitan las acotaciones, así que no molestan.
 */
export function actingTag(who: string | undefined, text: string, gesture?: string): string {
  if (!who || /^\s*\[[^\]]{1,30}\]/.test(text)) return text;
  const plain = text.replace(/[¡!¿?.,…«»"]/g, "").trim();
  const words = plain.split(/\s+/).filter(Boolean);
  const shout = /!/.test(text) && (words.some((w) => w.length > 2 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)) || /¡.*!.*¡/.test(text));
  const g = norm(gesture ?? "");
  let tag: string | undefined;
  if (shout) tag = "shouting";
  else if (/panico|susto|sorpre/.test(g)) tag = who === "jefe" ? "panicking" : "surprised";
  else if (who === "barbas") tag = "mischievously";
  else if (who === "usu") tag = words.length <= 7 ? "nervously" : "excitedly"; // nervioso, agudo y rápido
  else if (who === "jefe") tag = /!/.test(text) ? "exasperated" : /\?/.test(text) ? "confused" : undefined;
  else if (who === "reynaldo") tag = "dryly";
  else if (who === "sister") tag = "calmly";
  else if (who === "neli") tag = "cheerfully";
  else if (who === "gala") tag = "smugly";
  else if (who === "damian") tag = "flatly";
  else if (who === "cientifica") tag = "dryly";
  else if (who === "anastasia") tag = /enamorada|suspira|corazon|coqueta|timida|guino/.test(g) ? "lovingly" : /enfado|mosqueo|acusa|celosa/.test(g) ? "annoyed" : "sarcastically";
  else if (who === "fake") tag = /huevo|panico|garras|acurrucado|huye|para|grita/.test(g) ? "terrified" : "nervously";
  else if (who === "alf") tag = /garra|malva|trama|acecha|grita/.test(g) ? "menacing" : "sweetly";
  else if (who === "vanesa") tag = /reynaldo|reycito/i.test(text) ? "sweetly" : "exasperated";
  return tag ? `[${tag}] ${text}` : text;
}

/** Por escena: toma que genera y segundo (dentro de la toma) en que empieza cada paso; el último = fin de los pasos. */
export type ScriptMarks = ({ take: number; times: number[] } | undefined)[];

/** Personaje del catálogo al que se refiere un nombre del guion («Usu», «el jefe», «Rey»…). */
export function resolveCharacter(v: unknown, catalog: Catalog): string | undefined {
  if (typeof v !== "string") return undefined;
  const n = norm(v);
  return CHAR_ALIAS[n] ?? catalog.characters.find((c) => norm(c.name) === n || c.id === n)?.id;
}
export { norm as normKey };

export interface ScriptIssue {
  path: string;
  message: string;
}

/** Duración estimada de una frase (s). La real la pone luego la voz. */
export function estimate(text: string): number {
  const words = text.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(0.6, words * 0.34 + 0.4) * 10) / 10;
}

// ---------------------------------------------------------------- montaje de una escena
/** Gestos que son una postura (se mantienen), frente a los gestos de acompañar una frase (vuelven al reposo). */
const isStateGesture = (g: string) => !/habla|explica/.test(norm(g)) && /^(sentad|silla|ko|tumbad|despiert|aturdid|brazos_cruzados|brazos2|movil|telefono|mostrador|lee|portatil|acurrucad|manos_espalda|espalda|cafe|mesa|carpeta)/.test(norm(g));

class SceneBuilder {
  t = 0.3;
  ev: PocketEvent[] = [];
  n = 0;
  actors: Take["actors"] = [];
  backBeats: [string, number, number, string][] = [];
  absent: [string, number, number][] = [];
  hiddenFrom = new Set<string>();
  /** Posición x actual de cada actor (cambia con empujones / huidas). */
  px = new Map<string, number>();
  /** Ya está colgada la tele de Anastas-IA en esta escena. */
  iaTv = false;
  /** Dónde cuelga la tele de Anastas-IA (para poner efectos sobre ella). */
  iaTvPos?: { x: number; y: number; scale: number };
  /** Postura de reposo de cada actor (cambia con gestos «de estado»: sentarse, cruzar brazos, el móvil…). */
  rest = new Map<string, string>();
  /** Vueltas a la postura de reposo tras una frase (se quitan si enseguida hay otro gesto). */
  reverts = new Set<PocketEvent>();
  /** Gestos automáticos de hablar (y su vuelta al reposo): las acciones de la columna del personaje pueden mandar sobre ellos. */
  talk: { ev: PocketEvent; who: string; column: boolean; revert: boolean }[] = [];
  constructor(
    readonly id: string,
    readonly back: boolean,
    readonly cast: string[],
    readonly catalog: Catalog,
    /** Humanos de frente (poses «flat» pose_h_*). */
    readonly human = false,
    /** Prefijo de las poses dibujadas enteras: «h» humanos, «p» Puñetos rediseñados. */
    readonly pfx: "h" | "p" = "h",
  ) {}

  nid(p: string) {
    this.n++;
    return `${this.id}_${p}${this.n}`;
  }
  add(e: Record<string, unknown>, start = this.t) {
    const ev = { id: this.nid(String(e.track).slice(0, 2)), start: Math.round(start * 100) / 100, ...e, duration: Math.round(Number(e.duration) * 100) / 100 } as PocketEvent;
    this.ev.push(ev);
    return ev;
  }
  has(cid: string) {
    return this.cast.includes(cid);
  }
  expr(cid: string, emo: string) {
    const id = `expression.${cid}.${emo}`;
    const ch = this.catalog.characters.find((c) => c.id === cid);
    return ch?.expressions.some((e) => e.id === id) ? id : ch?.fallbackExpressionId;
  }
  /** Recurso de cómic automático según el gesto o la acotación (sudor en el pánico, «JA» en la risa…). */
  comicAuto(who: string, gestureKey: string | undefined, text: string, at: number, d: number) {
    if (this.back) return;
    const g = gestureKey ?? "";
    const kind =
      /panico|agobiado|sentado_agobiado/.test(g) ? "sudor"
      : /sorprendido|susto|reaction/.test(g) ? "sorpresa"
      : /^(camina|corre)$/.test(g) ? "lineas"
      : /^risa$/.test(g) || /\[(laughs|laughing)\]/i.test(text) ? "risa"
      : /\[(angry|furious|shouting)\]/i.test(text) ? "enfado"
      : undefined;
    const dup = this.ev.some((e) => e.track === "screen" && e.effect === "comic" && e.kind === kind && e.actorUid === who && Math.abs(e.start - at) < 1.5);
    if (kind && !dup) this.add({ track: "screen", effect: "comic", kind, actorUid: who, duration: Math.max(1.1, Math.min(2.2, d)) }, at);
  }
  /** speaking: el personaje habla en esa pose → con humanos, solo poses que tienen boca abierta (talkSrc). */
  pose(cid: string, key: string, speaking = false, fallback = true) {
    const ch = this.catalog.characters.find((c) => c.id === cid);
    if (!this.human) {
      const id = `char.${cid}.pose_${key}`;
      return ch?.poses.some((p) => p.id === id) ? id : undefined;
    }
    const keys = [...(HUMAN_POSE[key] ?? [key]), ...(speaking && fallback ? ["explica", "neutro"] : [])];
    // los secundarios sin versión Puñeto usan sus poses humanas también en vista Puñetos
    const pf = this.pfx === "p" && !ch?.poses.some((p) => p.id === `char.${cid}.pose_p_neutro`) ? "h" : this.pfx;
    const ok = (k: string) => ch?.poses.find((p) => p.id === `char.${cid}.pose_${pf}_${k}` && (!speaking || (p.talkSrc && p.talkSrc !== p.src)));
    return keys.map(ok).find(Boolean)?.id;
  }

  say(who: string | undefined, text: string, opts: { emo?: string; gesture?: string; gap?: number; voiceOf?: string; speakerName?: string; at?: number; column?: boolean }) {
    if (opts.at === undefined) text = actingTag(who ?? opts.voiceOf, text, opts.gesture); // el coro, tal cual
    const d = estimate(text);
    const at = opts.at ?? this.t;
    if (who && !this.back && this.has(who)) {
      if (opts.emo) this.add({ track: "face", actorUid: who, duration: 0.3, expressionId: this.expr(who, opts.emo) }, at);
      const g = opts.gesture ?? (text.replace(/\[[^\]]*\]/g, "").split(/\s+/).length >= 7 ? "talk_explain" : undefined);
      // gesto elegido a mano: esa pose aunque no tenga boca dibujada (entonces la boca no se mueve)
      const poseId = opts.gesture ? this.pose(who, opts.gesture, true, false) ?? this.pose(who, opts.gesture) ?? this.pose(who, opts.gesture, true) : g ? this.pose(who, g, true) : undefined;
      if (poseId) {
        this.talk.push({ ev: this.add({ track: "body", actorUid: who, duration: 0.3, poseId }, at), who, column: !!opts.column, revert: false });
        // los gestos de hablar (señalar, explicar, gritar…) vuelven a la postura de reposo al acabar la frase;
        // los «de estado» (sentado, brazos cruzados, móvil, KO…) se quedan y pasan a ser el reposo
        if (!opts.gesture || !isStateGesture(opts.gesture)) {
          const base = this.rest.get(who) ?? this.actors.find((a) => a.uid === who)?.poseId;
          if (base && base !== poseId) {
            const rv = this.add({ track: "body", actorUid: who, duration: 0.3, poseId: base }, at + d + 0.15);
            this.reverts.add(rv);
            this.talk.push({ ev: rv, who, column: !!opts.column, revert: true });
          }
        } else this.rest.set(who, poseId);
      }
      this.add({ track: "dialogue", actorUid: who, duration: d, text }, at);
      this.comicAuto(who, opts.gesture, text, at, d);
    } else if (who && this.back && this.has(who)) {
      this.add({ track: "dialogue", voiceOf: who, duration: d, text }, at);
      const g = opts.gesture ? BACK_GESTURE[who]?.[norm(opts.gesture)] : undefined;
      this.backBeats.push([who, at - 0.1, at + d + 0.1, g ?? BACK_TALK[who]]);
    } else if (opts.voiceOf) {
      this.add({ track: "dialogue", voiceOf: opts.voiceOf, ...(opts.speakerName ? { speakerName: opts.speakerName } : {}), duration: d, text }, at);
    } else if (opts.speakerName) {
      this.add({ track: "dialogue", speakerName: opts.speakerName, duration: d, text }, at);
    } else {
      this.add({ track: "dialogue", duration: d, text }, at);
    }
    if (opts.at === undefined) this.t = at + d + (opts.gap ?? 0.35);
    return d;
  }

  build(name: string, bg: string | null, camera?: "auto", transition?: "cut" | "fade" | "white"): Take {
    const dur = Math.round((this.t + 0.5) * 10) / 10;
    // una vuelta al reposo justo antes de otro gesto del mismo actor solo haría parpadear la pose
    const ev = this.ev.filter((e) => !this.reverts.has(e) || !this.ev.some((o) => o !== e && o.track === "body" && o.actorUid === e.actorUid && "poseId" in o && o.start >= e.start && o.start - e.start < 0.6));
    for (const a of this.actors) ev.push({ id: this.nid("mo"), track: "mouth", start: 0, duration: dur, actorUid: a.uid, mode: "auto" } as PocketEvent);
    if (this.back) ev.push(...this.backProps(dur));
    for (const e of ev) if (e.start + e.duration > dur) e.duration = Math.max(0.1, Math.round((dur - e.start) * 100) / 100);
    for (const a of this.actors) if (this.hiddenFrom.has(a.uid)) a.hidden = true;
    return { id: this.id, name, duration: dur, backgroundId: bg, ...(camera ? { camera } : {}), ...(transition ? { transition } : {}), actors: this.actors, events: ev };
  }

  private backProps(dur: number): PocketEvent[] {
    const out: PocketEvent[] = [];
    for (const who of this.cast) {
      const seat = SEAT[who];
      if (!seat) continue;
      const [x, y, s] = seat;
      const cuts = this.backBeats.filter((b) => b[0] === who).sort((a, b) => a[1] - b[1]);
      let segs: [number, number, string][] = [];
      let t = 0;
      for (const [, a0, b, v] of cuts) {
        const a = Math.max(a0, t);
        if (a > t) segs.push([t, a, "teclea"]);
        if (b > a) segs.push([a, b, v]);
        t = Math.max(t, b);
      }
      if (t < dur) segs.push([t, dur, "teclea"]);
      for (const [w, fa, fb] of this.absent) {
        if (w !== who) continue;
        const cut: [number, number, string][] = [];
        for (const [a, b, v] of segs) {
          if (b <= fa || a >= fb) cut.push([a, b, v]);
          else {
            if (a < fa) cut.push([a, fa, v]);
            if (b > fb) cut.push([fb, b, v]);
          }
        }
        segs = cut;
      }
      for (const [a0, b0, v] of segs) {
        const a = Math.round(a0 * 100) / 100;
        const b = Math.round(b0 * 100) / 100;
        if (b - a < 0.05) continue;
        const base = CHAIR[`${who}_espaldas_teclea`];
        const vv = CHAIR[`${who}_espaldas_${v}`] ?? base;
        const s2 = (s * base[1]) / vv[1];
        const px = Math.round(x + base[0] * s - vv[0] * s2);
        out.push({
          id: this.nid("pr"), track: "props", start: a, duration: Math.round((b - a) * 100) / 100, propId: `prop_${who}_espaldas_${CHAIR[`${who}_espaldas_${v}`] ? v : "teclea"}`,
          layer: "props-front", x: px, y, scale: Math.round(s2 * 1000) / 1000, zIndex: SEAT_Z[who], ...(v === "teclea" ? { loop: "type" as const } : {}),
        } as PocketEvent);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- columnas de los personajes
/**
 * Acción de la columna de un personaje: { quien, desde, hasta, gesto?, x?, y?, modo?, acaba? }.
 * desde/hasta = índices de paso (0 = primero; «hasta» incluido). Mientras dura manda sobre el gesto automático de
 * hablar de las frases marcadas con «columna»: true; en las demás frases habla con su gesto y vuelve a la acción.
 * modo: «anda» (por defecto si se mueve), «desliza» o «aparece».
 */
function applyActions(b: SceneBuilder, list: unknown[], times: number[], path: string, charId: (v: unknown, path: string) => string | undefined, issues: ScriptIssue[], anims?: unknown) {
  const n = times.length - 1;
  const items = list
    .map((a, i) => ({ a, i }))
    .filter((x): x is { a: Obj; i: number } => isObj(x.a))
    .sort((x, y) => (Number(x.a.desde) || 0) - (Number(y.a.desde) || 0));
  for (const { a, i } of items) {
    const ap = `${path}[${i}]`;
    const who = charId(a.quien, `${ap}.quien`);
    const actor = b.actors.find((x) => x.uid === who);
    if (!who || !actor) {
      if (who) issues.push({ path: ap, message: "ese personaje no está en la escena" });
      continue;
    }
    const d0 = Math.max(0, Math.min(Math.max(0, n - 1), Math.round(Number(a.desde) || 0)));
    const d1 = Math.max(d0, Math.min(Math.max(0, n - 1), Math.round(typeof a.hasta === "number" ? a.hasta : d0)));
    const T0 = times[d0] ?? 0;
    let T1 = times[d1 + 1] ?? b.t;
    if (T1 - T0 < 0.5) T1 = T0 + 0.8;
    const key = (g: unknown) => (typeof g === "string" && g ? POSE_ALIAS[norm(g)] ?? norm(g) : undefined);
    const g = key(a.gesto);
    const gPose = g ? b.pose(who, g) : undefined;
    if (g && !gPose) issues.push({ path: `${ap}.gesto`, message: `${actor.characterId} no tiene la pose «${String(a.gesto)}»` });
    const x0 = b.px.get(who) ?? actor.x;
    const moves = typeof a.x === "number" || typeof a.y === "number";
    const x1 = typeof a.x === "number" ? Math.round(a.x) : x0;
    const modo = norm(String(a.modo ?? ""));
    const mode = modo.startsWith("apare") ? "aparece" : modo.startsWith("desliz") ? "desliza" : "anda";
    // animación del personaje (secuencia de sus poses)
    // al ir andando sin animación elegida, usa su «andar» si lo tiene
    const autoWalk = !(typeof a.animacion === "string" && a.animacion) && !g && moves && mode === "anda" && x1 !== x0;
    const anim = typeof a.animacion === "string" && a.animacion ? resolveAnimation(who, a.animacion, anims) : autoWalk ? resolveAnimation(who, "andar", anims) : undefined;
    if (typeof a.animacion === "string" && a.animacion && !anim) issues.push({ path: `${ap}.animacion`, message: `${actor.characterId} no tiene la animación «${a.animacion}»` });
    const frames = anim ? anim.frames.map((f) => ({ id: b.pose(who, f.pose), dur: f.dur })).filter((f): f is { id: string; dur: number } => !!f.id) : [];
    const walkPose = !frames.length && moves && mode === "anda" && x1 !== x0 ? b.pose(who, "camina") : undefined;
    const hold = frames[0]?.id ?? walkPose ?? gPose;
    // si todas las poses de la animación tienen boca (p. ej. «andar»), habla sin pararse: como con «columna»
    const mouthOf = (id: string) => b.catalog.characters.find((c) => c.id === who)?.poses.find((p) => p.id === id);
    const talksMoving = frames.length > 0 && frames.every((f) => { const p = mouthOf(f.id); return !!p?.talkSrc && p.talkSrc !== p.src; });
    // los gestos automáticos de hablar dentro de la acción
    for (const te of b.talk) {
      if (te.who !== who || te.ev.start < T0 - 0.01 || te.ev.start >= T1) continue;
      if (te.column || talksMoving) b.ev = b.ev.filter((e) => e !== te.ev);
      else if (te.revert && hold && "poseId" in te.ev) (te.ev as { poseId: string }).poseId = hold;
    }
    // si justo empieza una frase suya sin «columna», manda su gesto de hablar: la acción entra al acabar la frase
    const talking = b.talk.some((te) => te.who === who && !te.column && !te.revert && b.ev.includes(te.ev) && Math.abs(te.ev.start - T0) < 0.05);
    if (frames.length) {
      // frases suyas sin «columna» dentro de la acción: mientras habla manda su gesto de hablar
      const quiet: [number, number][] = [];
      b.talk.forEach((te, k) => {
        if (te.who !== who || te.column || te.revert || te.ev.start < T0 - 0.01 || te.ev.start >= T1 || !b.ev.includes(te.ev)) return;
        const rv = b.talk.slice(k + 1).find((o) => o.who === who && o.revert);
        quiet.push([te.ev.start, rv ? rv.ev.start : te.ev.start + 1.5]);
      });
      const until = anim!.bucle ? T1 : Math.min(T1, T0 + animDuration(anim!));
      let t = T0;
      for (let k = 0; t < until - 0.01 && k < 2000; k++) {
        const f = frames[k % frames.length];
        if (!quiet.some(([q0, q1]) => t >= q0 - 0.01 && t < q1)) b.add({ track: "body", actorUid: who, duration: Math.min(f.dur, until - t), poseId: f.id, ease: "instant" }, t);
        else {
          // al acabar la frase vuelve a la animación
          const q = quiet.find(([q0, q1]) => t >= q0 - 0.01 && t < q1)!;
          if (q[1] < until) b.add({ track: "body", actorUid: who, duration: 0.1, poseId: f.id, ease: "instant" }, q[1] + 0.01);
        }
        t += f.dur;
        if (!anim!.bucle && k + 1 >= frames.length) break;
      }
      const fx = anim!.mov === "bote" ? "walk" : anim!.mov === "tiembla" ? "shake" : anim!.mov === "salto" ? "jump" : undefined;
      if (fx && !moves) b.add({ track: "body", actorUid: who, duration: Math.max(0.3, until - T0), fx }, T0);
    } else if (hold && !talking) b.add({ track: "body", actorUid: who, duration: 0.3, poseId: hold }, T0);
    if (moves) {
      const dur = mode === "aparece" ? 0.05 : Math.max(0.4, T1 - T0 - 0.15);
      b.add({ track: "body", actorUid: who, duration: dur, ...(typeof a.x === "number" ? { x: x1 } : {}), ...(typeof a.y === "number" ? { y: Math.round(a.y) } : {}), ...(mode === "aparece" ? { ease: "instant" } : mode === "anda" ? { ease: "linear", ...(frames.length ? (anim!.mov === "bote" ? { fx: "walk" } : {}) : { fx: "walk" }) } : {}), ...(mode === "anda" && x1 !== x0 ? { flip: x1 < x0 } : {}) }, T0);
      b.px.set(who, x1);
    }
    // al acabar: la pose de «acaba», o vuelta al reposo si era un gesto pasajero (las posturas se quedan)
    const end = key(a.acaba);
    const endPose = end ? b.pose(who, end) : undefined;
    if (endPose) {
      b.add({ track: "body", actorUid: who, duration: 0.3, poseId: endPose }, T1);
      if (isStateGesture(end!)) b.rest.set(who, endPose);
    } else if (hold) {
      if (gPose && !walkPose && !frames.length && isStateGesture(g!)) b.rest.set(who, gPose);
      else {
        const base = (gPose && walkPose ? gPose : undefined) ?? b.rest.get(who) ?? actor.poseId;
        if (base !== hold) b.add({ track: "body", actorUid: who, duration: 0.3, poseId: base }, T1);
      }
    }
  }
}

// ---------------------------------------------------------------- guion → proyecto
export function compileScript(raw: Obj, catalog: Catalog): { project?: PocketProject; issues: ScriptIssue[]; marks: ScriptMarks } {
  const issues: ScriptIssue[] = [];
  const marks: ScriptMarks = [];
  const charId = (v: unknown, path: string): string | undefined => {
    if (typeof v !== "string") return undefined;
    const n = norm(v);
    const id = CHAR_ALIAS[n] ?? catalog.characters.find((c) => norm(c.name) === n || c.id === n)?.id;
    if (!id) issues.push({ path, message: `personaje «${v}» no existe (usa: Usu, Reynaldo, Sister, Barbas, Jefe, Director, Neli, Gala, Damián, Vanesa, Ruan, Alf, Fake, Anastas-IA)` });
    return id;
  };
  const emo = (v: unknown) => (typeof v === "string" ? EMO_ALIAS[norm(v)] : undefined);
  const bgId = (v: unknown, path: string): string | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    const n = norm(v);
    const hit = catalog.backgrounds.find((b) => b.id === v || norm(b.id) === n || norm(b.id) === `bg_${n}` || norm(b.label) === n);
    if (!hit) issues.push({ path, message: `lugar «${v}» no existe en el catálogo` });
    return hit?.id ?? null;
  };
  const scenes = (raw.escenas as unknown[]) ?? [];
  if (!scenes.length) issues.push({ path: "escenas", message: "el guion no tiene escenas" });
  const takes: Take[] = [];
  scenes.forEach((sc0, si) => {
    const p = `escenas[${si}]`;
    if (!isObj(sc0)) return issues.push({ path: p, message: "escena no válida" });
    const sc = sc0;
    const bg = bgId(sc.lugar ?? sc.escenario ?? sc.fondo, `${p}.lugar`);
    const cast = [...new Set(((Array.isArray(sc.personajes) ? sc.personajes : []) as unknown[]).map((c, i) => charId(c, `${p}.personajes[${i}]`)).filter((c): c is string => !!c))];
    const vista = norm(String(sc.vista ?? ""));
    // «humanos»: de frente con sus poses humanas si todos las tienen; si no, de espaldas en la oficina (como antes)
    // «puñetos»: los Puñetos rediseñados (poses dibujadas enteras pose_p_*), si todos las tienen
    // sin «vista»: Puñetos (lo normal en los sketches); los secundarios sin versión Puñeto salen como humanos
    const pfx: "h" | "p" = vista.startsWith("human") ? "h" : "p";
    const hasPose = (cid: string, k: string) => !!catalog.characters.find((c) => c.id === cid)?.poses.some((x) => x.id === `char.${cid}.pose_${k}`);
    const cpfx = (cid: string): "h" | "p" => (pfx === "p" && !hasPose(cid, "p_neutro") ? "h" : pfx);
    const hasHuman = (cid: string) => hasPose(cid, `${cpfx(cid)}_neutro`);
    const human = cast.length === 0 || cast.every(hasHuman);
    const wantsBack = vista.startsWith("espalda") && catalog.props.some((x) => x.id.endsWith("_espaldas_teclea"));
    const back = wantsBack && !!bg && OFFICE_BGS.includes(bg);
    const b = new SceneBuilder(`s${si + 1}`, back, cast, catalog, human, pfx);
    if (!back) {
      const bgInfo = bg ? catalog.backgrounds.find((x) => x.id === bg) : undefined;
      // «escala» de la escena: acerca o aleja a todo el reparto (p. ej. 0.6 para un plano más abierto)
      const k = (bgInfo?.actorScale ?? 1) * (typeof sc.escala === "number" && sc.escala > 0.2 && sc.escala < 3 ? sc.escala : 1);
      const dy = bgInfo?.actorY !== undefined ? bgInfo.actorY - 1780 : 0;
      // humanos: dibujos anchos y de frente → en una sola fila (con 4-5 en dos filas se tapan unos a otros)
      const slots = (human && cast.length >= 4 ? humanRow(cast.length) : groupLayout(cast.length)).map((sl) => ({ ...sl, y: Math.round(sl.y + dy), scale: Math.round(sl.scale * k * 1000) / 1000, x: Math.round(540 + (sl.x - 540) * (0.6 + 0.4 * (bgInfo?.actorScale ?? 1))) }));
      cast.forEach((cid, i) => {
        const sl = slots[i];
        const pose = human ? `${cpfx(cid)}_neutro` : sl.x < 470 ? "neutral_3q_right" : sl.x > 610 ? "neutral_3q_left" : "neutral_front";
        // humanos: las poses están dibujadas mirando a la derecha; los de la mitad derecha se giran hacia el centro
        const flip = human && sl.x > 610 ? { flip: true } : {};
        // «tumbados»: en el suelo (inconscientes), girados sobre los pies
        const lying = Array.isArray(sc.tumbados) && (sc.tumbados as unknown[]).some((x) => typeof x === "string" && charId(x, `${p}.tumbados`) === cid);
        const ko = lying && human ? ["ko", "tumbada", "tumbado"].map((k) => `char.${cid}.pose_${cpfx(cid)}_${k}`).find((id) => catalog.characters.find((c) => c.id === cid)?.poses.some((x) => x.id === id)) : undefined;
        const rot = lying && !ko ? (sl.x > 540 ? 88 : -88) : 0;
        // «colocar»: posición a mano de algún personaje { "Vanesa": { "x": 900, "z": -5 } }
        const ov = isObj(sc.colocar) ? Object.entries(sc.colocar).find(([k]) => charId(k, `${p}.colocar`) === cid)?.[1] : undefined;
        const o = isObj(ov) ? ov : {};
        const ox = typeof o.x === "number" ? o.x : lying && !ko ? Math.round(540 + (sl.x - 540) * 0.45) : sl.x;
        const oy = typeof o.y === "number" ? o.y : sl.y;
        const osc = (typeof o.escala === "number" ? sl.scale * o.escala : sl.scale) * (pfx === "p" && cast.length >= 4 ? 0.85 : 1);
        const oz = typeof o.z === "number" ? Math.max(-100, Math.min(100, Math.round(o.z))) : sl.zIndex;
        const oflip = typeof o.mira === "string" ? { flip: norm(o.mira) === "izquierda" } : human && ox > 610 ? { flip: true } : {};
        b.px.set(cid, ox);
        // «colocar»: { "gesto": "sentado_teclea" } = la escena empieza ya en esa postura (sin cambio a la vista)
        const g0 = typeof o.gesto === "string" ? POSE_ALIAS[norm(o.gesto)] ?? norm(o.gesto) : undefined;
        const p0 = g0 ? b.pose(cid, g0) : undefined;
        if (p0 && isStateGesture(g0!)) b.rest.set(cid, p0);
        b.actors.push({ uid: cid, characterId: cid, poseId: p0 ?? ko ?? `char.${cid}.pose_${pose}`, x: ox, y: oy, scale: osc, zIndex: oz, ...(typeof o.x === "number" || typeof o.mira === "string" ? oflip : flip), ...(rot ? { rot } : {}), expressionId: b.expr(cid, "neutral") });
      });
    }
    const steps = (Array.isArray(sc.pasos) ? sc.pasos : []) as unknown[];
    const seen = new Set<string>();
    const times: number[] = [];
    marks[si] = { take: takes.length, times };
    steps.forEach((st0, k) => {
      times[k] = b.t;
      const sp = `${p}.pasos[${k}]`;
      if (!isObj(st0)) return issues.push({ path: sp, message: "paso no válido" });
      const st = st0;
      const text = typeof st.texto === "string" ? st.texto.trim() : "";
      const gap = typeof st.pausa_despues === "number" ? Math.max(0, Math.min(4, st.pausa_despues)) : undefined;
      if (st.dice !== undefined) {
        const who = charId(st.dice, `${sp}.dice`);
        if (!who || !text) return;
        if (!cast.includes(who)) {
          // habla alguien que no está en escena: con su voz, fuera de cuadro
          b.say(undefined, text, { voiceOf: who, gap });
          return;
        }
        seen.add(who);
        b.say(who, text, { emo: emo(st.emocion), gesture: typeof st.gesto === "string" ? POSE_ALIAS[norm(st.gesto)] ?? norm(st.gesto) : undefined, gap, column: st.columna === true });
      } else if (st.narrador !== undefined) {
        const tx = typeof st.narrador === "string" ? st.narrador : text;
        if (tx) b.say(undefined, tx, { gap });
      } else if (st.off !== undefined) {
        if (typeof st.off === "string" && text) {
          const t0 = b.t;
          // «off» de un protagonista que no está en escena (o con «voz»: un personaje con la voz de otro, p. ej. «Jefe del pasado»)
          const voz = typeof st.voz === "string" ? CHAR_ALIAS[norm(st.voz)] : CHAR_ALIAS[norm(st.off)];
          const name = st.off.slice(0, 40);
          if (voz && catalog.characters.some((c) => c.id === voz)) {
            b.say(undefined, text, { voiceOf: voz, speakerName: typeof st.voz === "string" ? name : undefined, gap });
            if (typeof st.voz === "string" && catalog.props.some((x) => x.id === "prop_anastasia_pantalla"))
              b.add({ track: "props", propId: "prop_anastasia_pantalla", layer: "props-front", x: 840, y: 520, scale: 0.9, duration: estimate(text) + 0.3, enter: "pop", exit: "fade", loop: "pulse" }, t0 - 0.15);
            return;
          }
          // Anastas-IA en off: se ve su pantalla y la boca de la pantalla se mueve con su voz
          const who = norm(st.off).replace(/[^a-z]/g, "");
          const ia = who.startsWith("anastas") || who === "nodo";
          const iaChar = ia && catalog.characters.some((c) => c.id === "anastasia");
          b.say(undefined, text, iaChar ? { voiceOf: "anastasia", speakerName: name, gap } : { speakerName: name, gap });
          if (ia && iaChar && catalog.props.some((x) => x.id === "prop_anastasia_tv")) {
            // la tele cuelga en la escena desde el principio (no aparece de la nada) y mueve la boca con su voz
            if (!b.iaTv) {
              const tv = isObj(sc.pantalla) ? sc.pantalla : {};
              b.add({ track: "props", propId: "prop_anastasia_tv", altPropId: "prop_anastasia_tv_boca", talkOf: "anastasia", layer: "props-back", x: typeof tv.x === "number" ? tv.x : 800, y: typeof tv.y === "number" ? tv.y : 640, scale: typeof tv.escala === "number" ? tv.escala : 0.85, enter: "none", exit: "none", duration: 999 }, 0);
              b.iaTv = true;
              b.iaTvPos = { x: typeof tv.x === "number" ? tv.x : 800, y: typeof tv.y === "number" ? tv.y : 640, scale: typeof tv.escala === "number" ? tv.escala : 0.85 };
            }
          } else if (ia && catalog.props.some((x) => x.id === "prop_anastasia_pantalla")) {
            b.add({ track: "props", propId: "prop_anastasia_pantalla", layer: "props-front", x: 790, y: 700, scale: 1.35, duration: estimate(text) + 0.3, enter: "pop", exit: "fade", loop: "pulse" }, t0 - 0.15);
          }
        }
      } else if (st.coro !== undefined) {
        const whos = ((Array.isArray(st.coro) ? st.coro : []) as unknown[]).map((c, i) => charId(c, `${sp}.coro[${i}]`)).filter((c): c is string => !!c && cast.includes(c));
        if (!whos.length || !text) return;
        const t0 = b.t;
        whos.forEach((w, i) => b.say(w, text, { at: t0 + 0.06 * i, emo: emo(st.emocion) }));
        b.t = t0 + estimate(text) + 0.06 * whos.length + (gap ?? 0.4);
      } else if (st.pausa !== undefined) {
        b.t += Math.max(0, Math.min(5, Number(st.pausa) || 0.8));
      } else if (st.mira !== undefined) {
        const who = charId(st.mira, `${sp}.mira`);
        const to = charId(st.a, `${sp}.a`);
        const me = b.actors.find((a) => a.uid === who);
        const other = b.actors.find((a) => a.uid === to);
        if (me && other) b.add({ track: "eyes", actorUid: me.uid, duration: Number(st.durante) || 1.2, gazeX: other.x > me.x ? 0.7 : -0.7, gazeY: 0 });
      } else if (st.cara !== undefined) {
        const who = charId(st.cara, `${sp}.cara`);
        if (who && !back && cast.includes(who)) b.add({ track: "face", actorUid: who, duration: 0.3, expressionId: b.expr(who, emo(st.emocion) ?? "neutral") });
      } else if (st.gesto !== undefined && st.quien !== undefined) {
        const who = charId(st.quien, `${sp}.quien`);
        const poseId = who ? b.pose(who, POSE_ALIAS[norm(String(st.gesto))] ?? norm(String(st.gesto))) : undefined;
        if (who && poseId && !back) {
          b.add({ track: "body", actorUid: who, duration: 0.3, poseId });
          if (isStateGesture(String(st.gesto))) b.rest.set(who, poseId);
          b.comicAuto(who, POSE_ALIAS[norm(String(st.gesto))] ?? norm(String(st.gesto)), "", b.t, 1.4);
        }
      } else if (st.sale !== undefined || st.entra !== undefined) {
        const entering = st.entra !== undefined;
        const who = charId(entering ? st.entra : st.sale, sp);
        if (!who || !cast.includes(who)) return;
        if (back) {
          if (entering) {
            const last = b.absent.find((a) => a[0] === who && a[2] === 9999);
            if (last) last[2] = b.t;
            else b.absent.push([who, 0, b.t]);
          } else b.absent.push([who, b.t, 9999]);
          b.add({ track: "sfx", soundId: "sfx_whoosh", duration: 0.6 });
        } else {
          if (entering && !seen.has(who)) b.hiddenFrom.add(who);
          b.add({ track: "body", actorUid: who, duration: 0.4, ...(entering ? { appear: "fade" } : { disappear: "fade" }) });
        }
        seen.add(who);
        b.t += 0.4;
      } else if (st.salta !== undefined || st.tiembla !== undefined) {
        const who = charId(st.salta ?? st.tiembla, sp);
        if (who && !back && cast.includes(who)) b.add({ track: "body", actorUid: who, duration: st.salta !== undefined ? 0.6 : 1.0, fx: st.salta !== undefined ? "jump" : "shake" });
      } else if (st.sonido !== undefined) {
        const id = typeof st.sonido === "string" ? SOUND_ALIAS[norm(st.sonido)] ?? st.sonido : "";
        const snd = catalog.sounds?.find((s) => s.id === id);
        if (snd) b.add({ track: "sfx", soundId: snd.id, duration: snd.duration });
        else issues.push({ path: `${sp}.sonido`, message: `sonido «${String(st.sonido)}» no existe` });
      } else if (st.efecto !== undefined) {
        const ef = norm(String(st.efecto));
        const toIa = typeof st.donde === "string" && norm(st.donde).replace(/[^a-z]/g, "").startsWith("anastas") && !b.actors.some((a) => a.characterId === "anastasia");
        const near = typeof st.donde === "string" && !toIa ? b.actors.find((a) => a.uid === charId(st.donde, `${sp}.donde`)) : undefined;
        if (ef === "explosion" || ef === "explota") {
          b.add({ track: "screen", effect: "explosion", duration: 1.9, x: near?.x ?? 540, y: near ? near.y - 300 : 1000, ...(text ? { text } : {}) });
          b.add({ track: "sfx", soundId: "sfx_explosion", duration: 2.4 });
          b.t += 1.6;
        } else if (ef === "pantallazo" || ef === "bluescreen") {
          b.add({ track: "screen", effect: "bluescreen", duration: 2.8, ...(text ? { text } : {}) });
          b.add({ track: "sfx", soundId: "sfx_pantallazo", duration: 2.2 });
          b.t += 2.9;
        } else if (ef === "destello" || ef === "flash") {
          b.add({ track: "screen", effect: "flash", duration: 0.6, color: typeof st.color === "string" && /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : "#ffffff" });
        } else if (ef === "temblor" || ef === "terremoto") {
          b.add({ track: "screen", effect: "shake", duration: 0.7 });
        } else if (ef === "oscuro" || ef === "apagon") {
          b.add({ track: "screen", effect: "darken", duration: Number(st.durante) || 2 });
        } else if (COMIC_FX[ef]) {
          // recursos de cómic sobre un personaje
          // «donde: Anastas-IA» con su tele colgada: el efecto sale sobre la tele
          const onTv = toIa ? b.iaTvPos : undefined;
          b.add({ track: "screen", effect: "comic", kind: COMIC_FX[ef], ...(near ? { actorUid: near.uid } : {}), ...(onTv ? { x: Math.round(onTv.x), y: Math.round(onTv.y) } : !near && typeof st.x === "number" && typeof st.y === "number" ? { x: Math.round(st.x), y: Math.round(st.y) } : {}), duration: Number(st.durante) || 1.6, ...(text ? { text } : {}) });
        } else issues.push({ path: `${sp}.efecto`, message: `efecto «${String(st.efecto)}» no existe (explosion, pantallazo, destello, temblor, oscuro, sudor, sorpresa, enfado, lineas, risa, onomatopeya, corazones, mareo, humo)` });
      } else if (st.camara !== undefined) {
        // planos de cámara: «general», «medio» / «primer_plano» de alguien, o un punto con zoom; «mover»: travelling suave
        const c = norm(String(st.camara));
        const who = typeof st.quien === "string" ? charId(st.quien, `${sp}.quien`) : undefined;
        const shot = c.startsWith("primer") || c === "close" ? "close" : c.startsWith("medio") ? "medium" : "wide";
        const pt = typeof st.x === "number" && typeof st.y === "number" ? { x: st.x, y: st.y, zoom: typeof st.zoom === "number" ? st.zoom : 1.5 } : typeof st.zoom === "number" ? { zoom: st.zoom } : {};
        const dur = Number(st.durante) || (st.mover ? 1.5 : 0.1);
        b.add({ track: "camera", shot, ...(who && b.actors.some((x) => x.uid === who) ? { actorUid: who } : {}), ...pt, ...(st.mover ? { move: true } : {}), duration: dur });
      } else if (st.teclea !== undefined) {
        const who = charId(st.teclea, `${sp}.teclea`);
        if (who && b.actors.some((a) => a.uid === who)) b.add({ track: "body", actorUid: who, duration: Number(st.durante) || 2, fx: "type" });
      } else if (st.empuja !== undefined) {
        // empujón de cómic: el que empuja da un golpe hacia el otro y el empujado sale despedido unos pasos
        const who = charId(st.empuja, `${sp}.empuja`);
        const to = charId(st.a, `${sp}.a`);
        const me = b.actors.find((a) => a.uid === who);
        const other = b.actors.find((a) => a.uid === to);
        if (me && other) {
          const mx = b.px.get(me.uid) ?? me.x;
          const ox = b.px.get(other.uid) ?? other.x;
          const dir = ox >= mx ? 1 : -1;
          const dist = typeof st.distancia === "number" ? st.distancia : 170;
          const nx = Math.max(60, Math.min(1020, ox + dir * dist));
          b.add({ track: "body", actorUid: me.uid, duration: 0.14, x: mx + dir * 70, ease: "linear" });
          b.add({ track: "body", actorUid: me.uid, duration: 0.3, x: mx }, b.t + 0.16);
          b.add({ track: "body", actorUid: other.uid, duration: 0.35, x: nx }, b.t + 0.1);
          b.add({ track: "screen", effect: "comic", kind: "lineas", actorUid: other.uid, duration: 0.7 }, b.t + 0.1);
          b.add({ track: "sfx", soundId: "sfx_boing", duration: 0.5 }, b.t + 0.08);
          b.px.set(other.uid, nx);
          b.t += 0.6;
        }
      } else if (st.huye !== undefined) {
        // sale disparado de escena con nube de polvo y líneas de velocidad (recurso de cómic)
        const who = charId(st.huye, `${sp}.huye`);
        const me = b.actors.find((a) => a.uid === who);
        if (me && who) {
          const mx = b.px.get(me.uid) ?? me.x;
          const left = typeof st.hacia === "string" ? norm(st.hacia).startsWith("izq") : mx < 540;
          const walk = b.pose(who, "camina");
          if (walk) b.add({ track: "body", actorUid: me.uid, duration: 0.15, poseId: walk, flip: left });
          b.add({ track: "screen", effect: "comic", kind: "humo", x: mx, y: me.y - 80, duration: 1.4 }, b.t + 0.2);
          b.add({ track: "screen", effect: "comic", kind: "lineas", actorUid: me.uid, duration: 0.6 }, b.t + 0.15);
          b.add({ track: "body", actorUid: me.uid, duration: 0.45, x: left ? -350 : 1430, ease: "linear" }, b.t + 0.2);
          b.add({ track: "sfx", soundId: "sfx_whoosh", duration: 0.6 }, b.t + 0.15);
          b.px.set(me.uid, left ? -350 : 1430);
          b.t += 0.8;
        }
      } else if (st.rotulo !== undefined) {
        // cartela de cómic arriba: «LUNES · 08:59 — Cuatro días antes»
        b.add({ track: "screen", effect: "comic", kind: "rotulo", text: String(st.rotulo).slice(0, 200), duration: Number(st.durante) || 2.5 });
      } else if (st.objeto !== undefined) {
        const id = String(st.objeto);
        const prop = catalog.props.find((x) => x.id === id || norm(x.label) === norm(id));
        if (!prop) return issues.push({ path: `${sp}.objeto`, message: `objeto «${id}» no existe en el catálogo` });
        const where = norm(String(st.donde ?? "centro"));
        const dur = Number(st.durante) || 30;
        const loopAlias: Record<string, string> = { flota: "float", float: "float", vibra: "shake", shake: "shake", late: "pulse", pulse: "pulse", gira: "spin", spin: "spin", parpadea: "blink", blink: "blink" };
        const loop = typeof st.anim === "string" ? loopAlias[norm(st.anim)] : undefined;
        if (where.startsWith("bocadillo")) {
          const of = charId(where.split("_").slice(1).join("_") || String(st.de ?? ""), `${sp}.donde`);
          if (of && b.actors.some((a) => a.uid === of)) {
            b.add({ track: "props", propId: prop.id, layer: "props-front", x: 540, y: 600, bubbleOf: of, enter: "pop", exit: "fade", loop: loop ?? "float", duration: Math.min(dur, 6) });
            b.add({ track: "sfx", soundId: "sfx_pop", duration: 0.4 });
            return;
          }
        }
        const xs: Record<string, number> = { izquierda: 270, centro: 540, derecha: 810 };
        // colocado a mano (x/y = base del objeto): parte del decorado, sin «pop»
        if (typeof st.x === "number" && typeof st.y === "number") {
          const depth = typeof st.profundidad === "number" ? { depth: Math.max(-100, Math.min(100, Math.round(st.profundidad))) } : {};
          b.add({ track: "props", propId: prop.id, layer: norm(String(st.capa ?? "")) === "detras" ? "props-back" : "props-front", x: st.x, y: st.y, scale: typeof st.escala === "number" ? st.escala : 1, ...depth, ...(st.voltear ? { flip: true } : {}), ...(typeof st.hasta_x === "number" ? { toX: st.hasta_x } : {}), ...(typeof st.hasta_y === "number" ? { toY: st.hasta_y } : {}), enter: "none", exit: "none", ...(loop ? { loop } : {}), duration: Number(st.durante) || 999 });
          return;
        }
        b.add({ track: "props", propId: prop.id, layer: "props-front", x: xs[where] ?? 540, y: 1250, enter: "pop", exit: "fade", ...(loop ? { loop } : {}), duration: dur });
        b.add({ track: "sfx", soundId: "sfx_pop", duration: 0.4 });
      } else {
        issues.push({ path: sp, message: "paso desconocido (usa dice, narrador, off, coro, pausa, mira, cara, gesto, entra, sale, salta, tiembla, sonido, efecto, objeto, camara, rotulo, teclea, empuja, huye)" });
      }
    });
    // entre escenas, fundido rápido a negro (salvo «transicion»: «corte»)
    const trn = norm(String(sc.transicion ?? ""));
    const tr = trn.startsWith("corte") ? "cut" : trn.startsWith("blanc") ? "white" : "fade";
    // ambiente de fondo en bucle, si hay un sonido real «sfx_ambiente_<tipo>» en la biblioteca (p. ej. «ambiente oficina»)
    // (por escenario, o «ambiente» en la escena; «ambiente»: "no" lo quita)
    const amb = typeof sc.ambiente === "string" ? norm(sc.ambiente) : bg ? AMBIENT_BY_BG[bg] : undefined;
    const ambId = amb && amb !== "no" && amb !== "ninguno" ? `sfx_ambiente_${amb}` : undefined;
    // también vale un audio subido con «ambiente oficina» / «office ambience» en el nombre
    const ambSnd = ambId
      ? catalog.sounds?.find((x) => x.id === ambId) ??
        catalog.sounds?.find((x) => { const n = norm(`${x.id} ${x.label}`); return /ambien|ambience|ambiance|room_tone/.test(n) && n.includes(amb === "oficina" ? "ofic" : (amb ?? "").slice(0, 5)); }) ??
        (amb === "oficina" ? catalog.sounds?.find((x) => /office.*(ambien|room_tone)|(ambien|room_tone).*office/.test(norm(`${x.id} ${x.label}`))) : undefined)
      : undefined;
    if (ambSnd) {
      const total = b.t + 0.5;
      for (let at = 0; at < total; at += ambSnd.duration - 0.4) b.add({ track: "sfx", soundId: ambSnd.id, duration: Math.min(ambSnd.duration, total - at), volume: 0.25 }, at);
    }
    times[steps.length] = b.t;
    // «acciones»: la columna de cada personaje (gestos y movimientos que abarcan uno o varios pasos)
    if (!back && Array.isArray(sc.acciones)) applyActions(b, sc.acciones as unknown[], times, `${p}.acciones`, (v, path) => charId(v, path), issues, raw.animaciones);
    takes.push(b.build(typeof sc.nombre === "string" ? sc.nombre.slice(0, 120) : `Escena ${si + 1}`, bg, norm(String(sc.camara ?? "")) === "auto" ? "auto" : undefined, tr));
  });
  if (issues.some((i) => /no existe|no tiene|no válid/.test(i.message)) && !takes.length) return { issues, marks };
  const total = takes.reduce((s, t) => s + t.duration, 0);
  const project: PocketProject = {
    schemaVersion: "pocket-1",
    catalogVersion: catalog.catalogVersion,
    metadata: {
      title: String(raw.titulo ?? raw.title ?? "Sketch").slice(0, 120),
      language: "es-ES",
      approxDuration: Math.min(180, Math.max(1, Math.round(total * 10) / 10)),
      ...(typeof raw.idea === "string" ? { idea: raw.idea.slice(0, 1000) } : {}),
      script: JSON.parse(JSON.stringify(raw)) as Record<string, unknown>,
      ...(Array.isArray(raw.faltan) ? { wishlist: (raw.faltan as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12).map((s) => s.slice(0, 120)) } : {}),
    },
    canvas: { width: 1080, height: 1920 },
    takes,
  };
  return { project, issues, marks };
}

/** Ejemplo del formato (también va en el prompt para ChatGPT). */
export const GUION_EJEMPLO = {
  formato: "puñetos-guion-1",
  titulo: "La reunión",
  idea: "El Jefe olvida una reunión con el Director",
  escenas: [
    {
      nombre: "Barbas calienta al Jefe",
      lugar: "bg_oficina_manana",
      vista: "puñetos",
      personajes: ["Jefe", "Barbas", "Sister", "Usu", "Reynaldo"],
      pasos: [
        { off: "Director", texto: "Si la incidencia sigue abierta el viernes, habrá cambios." },
        { dice: "Jefe", texto: "¿Cambios? ¿Qué cambios?", pausa_despues: 0.2 },
        { dice: "Barbas", texto: "[mischievously] Yo no digo nada, Jefe… pero lo ha dicho mirando tu silla." },
        { pausa: 0.6 },
        { dice: "Jefe", texto: "[angry] ¡Voy ahora mismo!" },
        { sale: "Jefe" },
        { coro: ["Sister", "Usu", "Reynaldo"], texto: "No." },
      ],
    },
    {
      nombre: "Lunes",
      lugar: "bg_oficina_manana",
      vista: "puñetos",
      personajes: ["Reynaldo", "Sister", "Jefe", "Usu", "Barbas"],
      pasos: [
        { dice: "Reynaldo", texto: "Vale. ¿Lo decimos o no lo decimos?", emocion: "enfado", gesto: "brazos_cruzados" },
        { mira: "Jefe", a: "Reynaldo" },
        { dice: "Jefe", texto: "¿Decir qué?" },
        { efecto: "explosion", donde: "Usu", texto: "¡BUM!" },
        { dice: "Usu", texto: "…Ha sido Humillos.", emocion: "risa" },
      ],
    },
  ],
};
