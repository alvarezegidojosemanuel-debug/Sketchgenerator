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
const CHAR_ALIAS: Record<string, string> = { usu: "usu", reynaldo: "reynaldo", rey: "reynaldo", sister: "sister", sis: "sister", barbas: "barbas", jefe: "jefe", el_jefe: "jefe" };
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
const HUMAN_POSE: Record<string, string[]> = {
  neutral_front: ["neutro"], neutral_3q_left: ["neutro"], neutral_3q_right: ["neutro"],
  talk_explain: ["explica"], talk_emphasis: ["explica"], pointing: ["senala", "explica"], arms_crossed: ["neutro"],
  reaction: ["sorprendido"], walk_small_left: ["camina"], walk_small_right: ["camina"],
  susto: ["susto", "sorprendido"], panico: ["panico", "susto"], pensando: ["pensando", "confundido"], encoge: ["encoge", "explica"],
  sentado_habla: ["sentado_habla", "sentado_teclea"], sentado_agobiado: ["sentado_agobiado", "sentado_cansado"], sentado_cansado: ["sentado_cansado", "sentado_agobiado"],
};
const SOUND_ALIAS: Record<string, string> = { telefono: "sfx_telefono", alarma: "sfx_alarma", pop: "sfx_pop", whoosh: "sfx_whoosh", ding: "sfx_ding", boing: "sfx_boing", golpe: "sfx_golpe", fracaso: "sfx_fracaso", teclado: "sfx_teclado", pantallazo: "sfx_pantallazo", servidor: "sfx_servidor", explosion: "sfx_explosion", portazo: "sfx_golpe" };

const COMIC_FX: Record<string, "sudor" | "sorpresa" | "enfado" | "lineas" | "risa" | "onomatopeya"> = {
  sudor: "sudor", gotas: "sudor", sorpresa: "sorpresa", susto: "sorpresa", enfado: "enfado", vena: "enfado", furia: "enfado",
  lineas: "lineas", velocidad: "lineas", risa: "risa", ja: "risa", jaja: "risa", onomatopeya: "onomatopeya", zas: "onomatopeya",
};

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
class SceneBuilder {
  t = 0.3;
  ev: PocketEvent[] = [];
  n = 0;
  actors: Take["actors"] = [];
  backBeats: [string, number, number, string][] = [];
  absent: [string, number, number][] = [];
  hiddenFrom = new Set<string>();
  constructor(
    readonly id: string,
    readonly back: boolean,
    readonly cast: string[],
    readonly catalog: Catalog,
    /** Humanos de frente (poses «flat» pose_h_*). */
    readonly human = false,
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
  pose(cid: string, key: string, speaking = false) {
    const ch = this.catalog.characters.find((c) => c.id === cid);
    if (!this.human) {
      const id = `char.${cid}.pose_${key}`;
      return ch?.poses.some((p) => p.id === id) ? id : undefined;
    }
    const keys = [...(HUMAN_POSE[key] ?? [key]), ...(speaking ? ["explica", "neutro"] : [])];
    const ok = (k: string) => ch?.poses.find((p) => p.id === `char.${cid}.pose_h_${k}` && (!speaking || p.talkSrc));
    return keys.map(ok).find(Boolean)?.id;
  }

  say(who: string | undefined, text: string, opts: { emo?: string; gesture?: string; gap?: number; voiceOf?: string; speakerName?: string; at?: number }) {
    const d = estimate(text);
    const at = opts.at ?? this.t;
    if (who && !this.back && this.has(who)) {
      if (opts.emo) this.add({ track: "face", actorUid: who, duration: 0.3, expressionId: this.expr(who, opts.emo) }, at);
      const g = opts.gesture ?? (text.replace(/\[[^\]]*\]/g, "").split(/\s+/).length >= 7 ? "talk_explain" : undefined);
      const poseId = g ? this.pose(who, g, true) : undefined;
      if (poseId) {
        this.add({ track: "body", actorUid: who, duration: 0.3, poseId }, at);
        // vuelve a su pose al terminar (salvo gestos «de reacción» que se mantienen hasta el siguiente cambio)
        if (!opts.gesture) {
          const base = this.actors.find((a) => a.uid === who)?.poseId;
          if (base) this.add({ track: "body", actorUid: who, duration: 0.3, poseId: base }, at + d + 0.1);
        }
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

  build(name: string, bg: string | null, camera?: "auto"): Take {
    const dur = Math.round((this.t + 0.5) * 10) / 10;
    const ev = [...this.ev];
    for (const a of this.actors) ev.push({ id: this.nid("mo"), track: "mouth", start: 0, duration: dur, actorUid: a.uid, mode: "auto" } as PocketEvent);
    if (this.back) ev.push(...this.backProps(dur));
    for (const e of ev) if (e.start + e.duration > dur) e.duration = Math.max(0.1, Math.round((dur - e.start) * 100) / 100);
    for (const a of this.actors) if (this.hiddenFrom.has(a.uid)) a.hidden = true;
    return { id: this.id, name, duration: dur, backgroundId: bg, ...(camera ? { camera } : {}), actors: this.actors, events: ev };
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

// ---------------------------------------------------------------- guion → proyecto
export function compileScript(raw: Obj, catalog: Catalog): { project?: PocketProject; issues: ScriptIssue[] } {
  const issues: ScriptIssue[] = [];
  const charId = (v: unknown, path: string): string | undefined => {
    if (typeof v !== "string") return undefined;
    const n = norm(v);
    const id = CHAR_ALIAS[n] ?? catalog.characters.find((c) => norm(c.name) === n || c.id === n)?.id;
    if (!id) issues.push({ path, message: `personaje «${v}» no existe (usa: Usu, Reynaldo, Sister, Barbas, Jefe)` });
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
    const hasHuman = (cid: string) => !!catalog.characters.find((c) => c.id === cid)?.poses.some((x) => x.id === `char.${cid}.pose_h_neutro`);
    const human = vista.startsWith("human") && cast.length > 0 && cast.every(hasHuman);
    const wantsBack = vista.startsWith("espalda") || (vista.startsWith("human") && !human);
    const back = wantsBack && !!bg && OFFICE_BGS.includes(bg);
    const b = new SceneBuilder(`s${si + 1}`, back, cast, catalog, human);
    if (!back) {
      const bgInfo = bg ? catalog.backgrounds.find((x) => x.id === bg) : undefined;
      const k = bgInfo?.actorScale ?? 1;
      const dy = bgInfo?.actorY !== undefined ? bgInfo.actorY - 1780 : 0;
      const slots = groupLayout(cast.length).map((sl) => ({ ...sl, y: Math.round(sl.y + dy), scale: Math.round(sl.scale * k * 1000) / 1000, x: Math.round(540 + (sl.x - 540) * (0.6 + 0.4 * k)) }));
      cast.forEach((cid, i) => {
        const sl = slots[i];
        const pose = human ? "h_neutro" : sl.x < 470 ? "neutral_3q_right" : sl.x > 610 ? "neutral_3q_left" : "neutral_front";
        // humanos: las poses están dibujadas mirando a la derecha; los de la mitad derecha se giran hacia el centro
        const flip = human && sl.x > 610 ? { flip: true } : {};
        b.actors.push({ uid: cid, characterId: cid, poseId: `char.${cid}.pose_${pose}`, x: sl.x, y: sl.y, scale: sl.scale, zIndex: sl.zIndex, ...flip, expressionId: b.expr(cid, "neutral") });
      });
    }
    const steps = (Array.isArray(sc.pasos) ? sc.pasos : []) as unknown[];
    const seen = new Set<string>();
    steps.forEach((st0, k) => {
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
        b.say(who, text, { emo: emo(st.emocion), gesture: typeof st.gesto === "string" ? POSE_ALIAS[norm(st.gesto)] ?? norm(st.gesto) : undefined, gap });
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
          b.say(undefined, text, { speakerName: name, gap });
          // Anastas-IA (la IA del complejo) no tiene cuerpo: mientras habla se ve su pantalla, para que su voz no salga «de la nada»
          const who = norm(st.off).replace(/[^a-z]/g, "");
          if ((who.startsWith("anastas") || who === "nodo") && catalog.props.some((x) => x.id === "prop_anastasia_pantalla"))
            b.add({ track: "props", propId: "prop_anastasia_pantalla", layer: "props-front", x: 840, y: 520, scale: 0.9, duration: estimate(text) + 0.3, enter: "pop", exit: "fade", loop: "pulse" }, t0 - 0.15);
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
        const near = typeof st.donde === "string" ? b.actors.find((a) => a.uid === charId(st.donde, `${sp}.donde`)) : undefined;
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
          b.add({ track: "screen", effect: "comic", kind: COMIC_FX[ef], ...(near ? { actorUid: near.uid } : {}), duration: Number(st.durante) || 1.6, ...(text ? { text } : {}) });
        } else issues.push({ path: `${sp}.efecto`, message: `efecto «${String(st.efecto)}» no existe (explosion, pantallazo, destello, temblor, oscuro, sudor, sorpresa, enfado, lineas, risa, onomatopeya)` });
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
        b.add({ track: "props", propId: prop.id, layer: "props-front", x: xs[where] ?? 540, y: 1250, enter: "pop", exit: "fade", ...(loop ? { loop } : {}), duration: dur });
        b.add({ track: "sfx", soundId: "sfx_pop", duration: 0.4 });
      } else {
        issues.push({ path: sp, message: "paso desconocido (usa dice, narrador, off, coro, pausa, mira, cara, gesto, entra, sale, salta, tiembla, sonido, efecto, objeto)" });
      }
    });
    takes.push(b.build(typeof sc.nombre === "string" ? sc.nombre.slice(0, 120) : `Escena ${si + 1}`, bg, norm(String(sc.camara ?? "")) === "auto" ? "auto" : undefined));
  });
  if (issues.some((i) => /no existe|no tiene|no válid/.test(i.message)) && !takes.length) return { issues };
  const total = takes.reduce((s, t) => s + t.duration, 0);
  const project: PocketProject = {
    schemaVersion: "pocket-1",
    catalogVersion: catalog.catalogVersion,
    metadata: {
      title: String(raw.titulo ?? raw.title ?? "Sketch").slice(0, 120),
      language: "es-ES",
      approxDuration: Math.min(180, Math.max(1, Math.round(total * 10) / 10)),
      ...(typeof raw.idea === "string" ? { idea: raw.idea.slice(0, 1000) } : {}),
      ...(Array.isArray(raw.faltan) ? { wishlist: (raw.faltan as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12).map((s) => s.slice(0, 120)) } : {}),
    },
    canvas: { width: 1080, height: 1920 },
    takes,
  };
  return { project, issues };
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
      vista: "espaldas",
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
