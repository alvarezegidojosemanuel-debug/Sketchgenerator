/** Recetas de escena: personaje trabajando en su escritorio. */
import type { Catalog, Prop } from "@/lib/catalog/types";
import { findPose, findProp, poseScale } from "@/lib/catalog";
import type { Actor, PocketEvent, PropsEvent, Take } from "@/lib/schema/pocket";

/** Altura en el lienzo (px) de un actor con su pose base. */
export function actorHeight(catalog: Catalog, a: Actor): number {
  const pose = findPose(catalog, a.characterId, a.poseId);
  return (pose?.height ?? 600) * poseScale(catalog, a.characterId, pose) * (a.scale ?? 1);
}

/** Objeto que parece un escritorio (el del usuario primero). */
export function guessDesk(catalog: Catalog): Prop | undefined {
  return catalog.props.find((p) => /escritorio|mesa|desk/i.test(`${p.id} ${p.label}`));
}

/**
 * Escritorio delante del actor: tapa de la cintura para abajo (la cara y la boca siguen a la vista).
 * El ordenador del dibujo queda a un lado, así que el escritorio se desplaza un poco hacia él.
 */
export function deskFor(catalog: Catalog, take: Take, actor: Actor, propId: string, id: string): PropsEvent | null {
  const prop = findProp(catalog, propId);
  if (!prop) return null;
  const h = actorHeight(catalog, actor);
  const scale = Math.round(((0.92 * h) / prop.height) * 100) / 100;
  const w = prop.width * scale;
  return {
    id,
    track: "props",
    actorUid: actor.uid,
    propId,
    layer: "props-front",
    x: Math.round(actor.x - (actor.flip ? -1 : 1) * 0.12 * w),
    y: Math.round(actor.y + 12),
    scale: Math.max(0.1, Math.min(4, scale)),
    flip: actor.flip || undefined,
    start: 0,
    duration: take.duration,
  };
}

/** Teclear durante `dur` segundos: gesto + sonido. */
export function typingEvents(actor: Actor, start: number, dur: number, ids: [string, string]): PocketEvent[] {
  return [
    { id: ids[0], track: "body", actorUid: actor.uid, start, duration: dur, fx: "type" },
    { id: ids[1], track: "sfx", soundId: "sfx_teclado", start, duration: Math.min(dur, 3), volume: 0.7 },
  ];
}

/**
 * Transformación de un objeto en otro en el mismo sitio (p. ej. humano de espaldas → puñeto de espaldas):
 * pantallazo azul + sonido desde `at`, y al terminar el pantallazo el cambio con destello blanco.
 */
export function transformEvents(take: Take, from: PropsEvent, toPropId: string, at: number, newId: (p: string) => string): { from: PropsEvent; add: PocketEvent[] } {
  const bs = Math.min(2, Math.max(0.6, take.duration - at - 0.6));
  const swap = Math.round((at + bs) * 10) / 10;
  const end = take.duration;
  const before: PropsEvent = { ...from, duration: Math.max(0.2, Math.round((swap + 0.3 - from.start) * 10) / 10), exit: "fade" };
  const after: PropsEvent = { ...from, id: newId("tr"), propId: toPropId, start: swap, duration: Math.max(0.2, Math.round((end - swap) * 10) / 10), enter: "fade", exit: undefined };
  return {
    from: before,
    add: [
      { id: newId("bs"), track: "screen", effect: "bluescreen", start: at, duration: bs },
      { id: newId("bss"), track: "sfx", soundId: "sfx_pantallazo", start: at, duration: Math.min(2.2, end - at) },
      after,
      { id: newId("fl"), track: "screen", effect: "flash", color: "#ffffff", start: swap, duration: Math.min(0.5, Math.max(0.1, end - swap)) },
    ],
  };
}

/** Cambio seco de un objeto por otro en el mismo sitio (p. ej. de teclear a encogerse de hombros). */
export function swapEvents(from: PropsEvent, toPropId: string, at: number, id: string): { from: PropsEvent; add: PropsEvent } | null {
  const end = from.start + from.duration;
  if (at <= from.start + 0.05 || at >= end - 0.05) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    from: { ...from, duration: r(at - from.start), exit: undefined },
    add: { ...from, id, propId: toPropId, start: r(at), duration: r(end - at), enter: undefined },
  };
}
