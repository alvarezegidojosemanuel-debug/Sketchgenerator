/**
 * Adaptador PUÑETOS Studio V3 ⇄ Pocket (subconjunto soportado).
 *
 * Basado en la forma documentada de templates/TIMELINE_SCHEMA_EXAMPLE.json (V3):
 *   { version: 3, type: "punetos_project", takes: [ { id, name, duration,
 *       scene: { version: 3, canvas: {width,height}, background, layers: [] },
 *       timeline: { events: [ { id, actor_uid, track, start, duration, ... } ] } } ] }
 * con eventos body (asset_id, body_mode, from_x/from_y, target_x/target_y),
 * face (asset_id) y mouth (asset_id: "__auto__").
 *
 * AVISO: la estructura de `scene.layers` y los valores de `body_mode` no están
 * documentados en el material disponible; se usa una forma tolerante y se
 * informa en el reporte. No se promete round-trip perfecto. V8 no está soportado.
 */
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter } from "@/lib/catalog";
import type { Actor, PocketEvent, PocketProject, Take } from "@/lib/schema/pocket";
import { SCHEMA_VERSION } from "@/lib/schema/pocket";
import { evaluateTake, sortedEvents } from "@/lib/timeline/evaluate";

export interface V3Event {
  id: string;
  actor_uid?: string;
  track: string;
  start: number;
  duration: number;
  text?: string;
  asset_id?: string;
  body_mode?: string;
  from_x?: number;
  from_y?: number;
  target_x?: number;
  target_y?: number;
  [k: string]: unknown;
}

export interface V3Layer {
  uid?: string;
  actor_uid?: string;
  type?: string;
  character_id?: string;
  asset_id?: string;
  x?: number;
  y?: number;
  scale?: number;
  z?: number;
  [k: string]: unknown;
}

export interface V3Take {
  id: string;
  name?: string;
  duration: number;
  scene: {
    version: 3;
    canvas: { width: number; height: number };
    background: string | { asset_id?: string; id?: string } | null;
    layers: V3Layer[];
  };
  timeline: { events: V3Event[] };
}

export interface V3Project {
  version: 3;
  type: "punetos_project";
  name?: string;
  takes: V3Take[];
  [k: string]: unknown;
}

export interface ConversionReport {
  /** Información que no se ha podido trasladar. */
  losses: string[];
  /** Supuestos aplicados que conviene verificar con el V3 real. */
  assumptions: string[];
}

export const V3_MOUTH_AUTO = "__auto__";

export const LAYER_ASSUMPTION =
  "La forma de scene.layers ({uid, type:'actor', character_id, asset_id, x, y, scale, z}) es una suposición de Pocket: verificar con PUNETOS_STUDIO_V3.";

const round = (n: number) => Math.round(n * 1000) / 1000;

export function pocketToV3(project: PocketProject, catalog: Catalog): { v3: V3Project; report: ConversionReport } {
  const losses: string[] = [];
  const assumptions = new Set<string>([LAYER_ASSUMPTION]);

  const takes: V3Take[] = project.takes.map((take) => {
    const layers: V3Layer[] = take.actors.map((a) => ({
      uid: a.uid,
      type: "actor",
      character_id: a.characterId,
      asset_id: a.poseId,
      x: a.x,
      y: a.y,
      scale: a.scale,
      z: a.zIndex,
    }));
    const events: V3Event[] = [];

    for (const a of take.actors) {
      if (a.flip) losses.push(`${take.id}/${a.uid}: 'flip' no tiene equivalente V3 conocido.`);
      if (a.expressionId) {
        events.push({ id: `${a.uid}_face0`, actor_uid: a.uid, track: "face", start: 0, duration: Math.min(0.1, take.duration), asset_id: a.expressionId });
      }
    }

    for (const e of sortedEvents(take)) {
      const where = `${take.id}/${e.id}`;
      switch (e.track) {
        case "dialogue":
          events.push({ id: e.id, actor_uid: e.actorUid, track: "dialogue", start: e.start, duration: e.duration, text: e.text });
          if (e.voice) losses.push(`${where}: ajustes de voz (rate/pitch/voiceName) no se exportan a V3.`);
          break;
        case "body": {
          const before = evaluateTake(take, catalog, e.start).actors.find((s) => s.uid === e.actorUid);
          const moves = e.x !== undefined || e.y !== undefined;
          const fromX = before?.x ?? 0;
          const fromY = before?.y ?? 0;
          events.push({
            id: e.id,
            actor_uid: e.actorUid,
            track: "body",
            start: e.start,
            duration: e.duration,
            asset_id: e.poseId ?? before?.poseId,
            body_mode: moves ? "move" : "pose",
            from_x: round(fromX),
            from_y: round(fromY),
            target_x: round(e.x ?? fromX),
            target_y: round(e.y ?? fromY),
          });
          assumptions.add("body_mode se exporta como 'move' (con desplazamiento) o 'pose' (solo cambio de pose): verificar valores reales de V3.");
          if (e.scale !== undefined || e.flip !== undefined) losses.push(`${where}: scale/flip en eventos body no se exportan a V3.`);
          if (e.ease && e.ease !== "inOut") losses.push(`${where}: ease "${e.ease}" no se exporta a V3.`);
          break;
        }
        case "face":
          events.push({ id: e.id, actor_uid: e.actorUid, track: "face", start: e.start, duration: e.duration, asset_id: e.expressionId });
          break;
        case "mouth":
          events.push({ id: e.id, actor_uid: e.actorUid, track: "mouth", start: e.start, duration: e.duration, asset_id: V3_MOUTH_AUTO });
          if (e.mode === "calibrated") losses.push(`${where}: calibración manual de boca (dx/dy) se exporta como "__auto__".`);
          break;
        case "eyes":
          losses.push(`${where}: evento de ojos (mirada) sin equivalente V3 conocido; omitido.`);
          break;
        case "props":
          losses.push(`${where}: objeto "${e.propId}" omitido (no hay formato de props V3 documentado).`);
          break;
      }
    }

    return {
      id: take.id,
      name: take.name ?? take.id,
      duration: take.duration,
      scene: { version: 3, canvas: { width: 1080, height: 1920 }, background: take.backgroundId, layers },
      timeline: { events },
    };
  });

  return {
    v3: { version: 3, type: "punetos_project", name: project.metadata.title, takes },
    report: { losses, assumptions: [...assumptions] },
  };
}

function poseOwner(catalog: Catalog, poseId: string | undefined) {
  if (!poseId) return undefined;
  return catalog.characters.find((c) => c.poses.some((p) => p.id === poseId));
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/**
 * V3 → Pocket. El resultado debe pasar después por validateProject() para
 * comprobar IDs contra el catálogo (este adaptador no inventa assets).
 */
export function v3ToPocket(input: unknown, catalog: Catalog): { project: PocketProject; report: ConversionReport } {
  const losses: string[] = [];
  const assumptions = new Set<string>([LAYER_ASSUMPTION]);
  if (typeof input !== "object" || input === null) throw new Error("El JSON V3 debe ser un objeto");
  const v3 = input as Partial<V3Project>;
  if (v3.version !== 3 || v3.type !== "punetos_project" || !Array.isArray(v3.takes)) {
    throw new Error('No parece un proyecto V3 (se esperaba version: 3, type: "punetos_project", takes: [...])');
  }

  const takes: Take[] = v3.takes.map((vt, ti) => {
    const takeId = typeof vt.id === "string" ? vt.id : `take_${ti + 1}`;
    const ve: V3Event[] = Array.isArray(vt.timeline?.events) ? vt.timeline.events : [];
    const layers: V3Layer[] = Array.isArray(vt.scene?.layers) ? vt.scene.layers : [];
    const bgRaw = vt.scene?.background ?? null;
    const backgroundId = typeof bgRaw === "string" ? bgRaw : bgRaw ? (bgRaw.asset_id ?? bgRaw.id ?? null) : null;

    const actors: Actor[] = [];
    layers.forEach((l, li) => {
      const uid = l.uid ?? l.actor_uid;
      if (!uid) {
        losses.push(`${takeId}: capa ${li} sin uid; ignorada.`);
        return;
      }
      if (l.type && l.type !== "actor") {
        losses.push(`${takeId}: capa "${uid}" de tipo "${l.type}" no soportada; ignorada.`);
        return;
      }
      const owner = poseOwner(catalog, l.asset_id);
      const characterId = l.character_id ?? owner?.id;
      if (!characterId) {
        losses.push(`${takeId}: capa "${uid}" sin personaje identificable; ignorada.`);
        return;
      }
      actors.push({
        uid,
        characterId,
        poseId: l.asset_id ?? findCharacter(catalog, characterId)?.poses[0]?.id ?? "",
        x: num(l.x, 540),
        y: num(l.y, 1780),
        scale: num(l.scale, 1),
        zIndex: Math.round(num(l.z, actors.length)),
      });
    });

    // Actores referenciados en eventos pero sin capa: se reconstruyen desde su primer body.
    const known = new Set(actors.map((a) => a.uid));
    for (const e of ve) {
      if (!e.actor_uid || known.has(e.actor_uid)) continue;
      const firstBody = ve.find((x) => x.actor_uid === e.actor_uid && x.track === "body" && x.asset_id);
      const owner = poseOwner(catalog, firstBody?.asset_id);
      if (!owner || !firstBody?.asset_id) {
        losses.push(`${takeId}: actor "${e.actor_uid}" sin capa ni pose de catálogo; sus eventos se omiten.`);
        known.add(e.actor_uid);
        continue;
      }
      actors.push({
        uid: e.actor_uid,
        characterId: owner.id,
        poseId: firstBody.asset_id,
        x: num(firstBody.from_x, num(firstBody.target_x, 540)),
        y: num(firstBody.from_y, num(firstBody.target_y, 1780)),
        scale: 1,
        zIndex: actors.length,
      });
      assumptions.add(`Actor "${e.actor_uid}" reconstruido a partir de su primer evento body (sin capa en scene.layers).`);
      known.add(e.actor_uid);
    }
    const valid = new Set(actors.map((a) => a.uid));

    const events: PocketEvent[] = [];
    for (const e of ve) {
      const where = `${takeId}/${e.id}`;
      if (e.actor_uid && !valid.has(e.actor_uid)) continue;
      const base = { id: String(e.id), start: num(e.start, 0), duration: num(e.duration, 0.1) };
      switch (e.track) {
        case "dialogue":
          if (!e.actor_uid || typeof e.text !== "string") {
            losses.push(`${where}: diálogo sin actor o texto; omitido.`);
            break;
          }
          events.push({ ...base, track: "dialogue", actorUid: e.actor_uid, text: e.text });
          break;
        case "body": {
          if (!e.actor_uid) break;
          const hasTarget = typeof e.target_x === "number" || typeof e.target_y === "number";
          events.push({
            ...base,
            track: "body",
            actorUid: e.actor_uid,
            ...(e.asset_id ? { poseId: e.asset_id } : {}),
            ...(hasTarget ? { x: num(e.target_x, num(e.from_x, 540)), y: num(e.target_y, num(e.from_y, 1780)) } : {}),
          });
          if (typeof e.from_x === "number" || typeof e.from_y === "number") {
            assumptions.add("from_x/from_y de V3 se ignoran: Pocket interpola desde la posición actual del actor.");
          }
          if (e.body_mode) assumptions.add(`body_mode "${e.body_mode}" no se conserva; se deduce del destino.`);
          break;
        }
        case "face":
          if (!e.actor_uid || !e.asset_id) break;
          events.push({ ...base, track: "face", actorUid: e.actor_uid, expressionId: e.asset_id });
          break;
        case "mouth":
          if (!e.actor_uid) break;
          if (e.asset_id && e.asset_id !== V3_MOUTH_AUTO) losses.push(`${where}: boca "${e.asset_id}" fija no soportada; se usa auto.`);
          events.push({ ...base, track: "mouth", actorUid: e.actor_uid, mode: "auto" });
          break;
        default:
          losses.push(`${where}: pista "${e.track}" no soportada; omitida.`);
      }
      const known = new Set(["id", "actor_uid", "track", "start", "duration", "text", "asset_id", "body_mode", "from_x", "from_y", "target_x", "target_y"]);
      const extra = Object.keys(e).filter((k) => !known.has(k));
      if (extra.length) losses.push(`${where}: campos no soportados ignorados: ${extra.join(", ")}.`);
    }

    return { id: takeId, name: vt.name, duration: num(vt.duration, 1), backgroundId, actors, events };
  });

  const total = takes.reduce((s, t) => s + t.duration, 0);
  const project: PocketProject = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion: catalog.catalogVersion,
    metadata: { title: typeof v3.name === "string" ? v3.name : "Proyecto V3 importado", language: "es-ES", approxDuration: Math.max(1, Math.round(total)) },
    canvas: { width: 1080, height: 1920 },
    takes,
  };
  return { project, report: { losses, assumptions: [...assumptions] } };
}

export function isV3Project(v: unknown): boolean {
  return typeof v === "object" && v !== null && (v as { version?: unknown }).version === 3 && (v as { type?: unknown }).type === "punetos_project";
}
