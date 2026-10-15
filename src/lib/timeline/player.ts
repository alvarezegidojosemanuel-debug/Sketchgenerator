import type { DialogueEvent, PocketProject, SfxEvent } from "@/lib/schema/pocket";
import { locate, projectSchedule } from "./evaluate";

export interface PlayerCallbacks {
  onFrame: (takeIndex: number, t: number, globalT: number) => void;
  /**
   * Se dispara una vez cuando el cabezal cruza el inicio de un diálogo.
   * Devuelve true si se va a locutar: entonces el reproductor espera a que la voz termine
   * (speechStarted / speechEnded con la misma clave) antes de pasar del final del bloque.
   */
  onDialogue?: (e: DialogueEvent, takeIndex: number, key: string) => boolean | void;
  /** Se dispara una vez cuando el cabezal cruza el inicio de un sonido. */
  onSfx?: (e: SfxEvent, takeIndex: number) => void;
  /** Cambio de toma, pausa o fin: el consumidor debe detener la voz. */
  onInterrupt?: () => void;
  onEnd?: () => void;
}

export interface Clock {
  now(): number;
  request(cb: () => void): number;
  cancel(handle: number): void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

interface PendingSpeech {
  actorUid: string;
  endGlobal: number;
  firedAt: number;
  startedAt: number | null;
  done: boolean;
}

/** Si la voz no empieza en este tiempo tras su bloque, se da por fallida y no se espera. */
const START_TIMEOUT_MS = 2500;
/** Máximo que se espera a una sola frase. */
const MAX_HOLD_MS = 30000;

/**
 * Temporizador de la animación. «El diálogo manda»: si una voz dura más que su bloque,
 * el reloj se detiene al final del bloque hasta que la voz termina, para que los gestos
 * siguientes no se adelanten al audio. Sin voz, el tiempo es puramente el del reloj.
 */
export class Player {
  private globalT = 0;
  private lastTick = 0;
  private handle: number | null = null;
  private currentTake = -1;
  private pending = new Map<string, PendingSpeech>();
  private _holding = false;

  constructor(
    private project: PocketProject,
    private cb: PlayerCallbacks,
    private clock: Clock = browserClock,
  ) {}

  get playing() {
    return this.handle !== null;
  }

  get current(): PocketProject {
    return this.project;
  }

  /** true mientras el reloj espera a que termine una voz. */
  get holding() {
    return this._holding;
  }

  speechStarted(key: string) {
    const p = this.pending.get(key);
    if (p && p.startedAt === null) p.startedAt = this.clock.now();
  }

  speechEnded(key: string) {
    const p = this.pending.get(key);
    if (p) p.done = true;
  }

  /** Actores cuya voz está sonando ahora → segundos que lleva sonando. */
  liveSpeakers(): Map<string, number> {
    const now = this.clock.now();
    const m = new Map<string, number>();
    for (const p of this.pending.values()) {
      if (!p.done && p.startedAt !== null) m.set(p.actorUid, (now - p.startedAt) / 1000);
    }
    return m;
  }

  /** Actor → clave y segundos de la voz que suena ahora (para leer su envolvente). */
  liveClips(): Map<string, { key: string; elapsed: number }> {
    const now = this.clock.now();
    const m = new Map<string, { key: string; elapsed: number }>();
    for (const [key, p] of this.pending) {
      if (!p.done && p.startedAt !== null) m.set(p.actorUid, { key, elapsed: (now - p.startedAt) / 1000 });
    }
    return m;
  }

  /** true si hay voces gestionadas (entonces la boca la marca el audio, no el bloque). */
  get voiceDriven() {
    return this.pending.size > 0;
  }

  get position() {
    return this.globalT;
  }

  get total() {
    return projectSchedule(this.project).total;
  }

  setProject(project: PocketProject) {
    this.project = project;
    this.globalT = Math.min(this.globalT, this.total);
    this.emit();
  }

  play() {
    if (this.playing) return;
    if (this.globalT >= this.total - 1e-6) this.globalT = 0;
    this.currentTake = -1;
    this.lastTick = this.clock.now();
    // Diálogos que empiezan justo en la posición actual
    this.fireDialogues(this.globalT - 1e-9, this.globalT);
    this.handle = this.clock.request(this.tick);
    this.emit();
  }

  pause() {
    if (this.handle !== null) this.clock.cancel(this.handle);
    this.handle = null;
    this.pending.clear();
    this._holding = false;
    this.cb.onInterrupt?.();
    this.emit();
  }

  stop() {
    this.pause();
    this.globalT = 0;
    this.emit();
  }

  seek(globalT: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.globalT = Math.max(0, Math.min(globalT, this.total));
    this.emit();
    if (wasPlaying) this.play();
  }

  /** Avanza manualmente (tests y depuración). */
  advance(dt: number) {
    const prev = this.globalT;
    let next = Math.min(this.total, this.globalT + dt);
    // El diálogo manda: no pasar del final de un bloque cuya voz sigue sonando (o aún no ha empezado).
    const now = this.clock.now();
    let cap = Infinity;
    for (const p of this.pending.values()) {
      if (p.done) continue;
      const waited = p.startedAt === null ? now - p.firedAt : now - p.startedAt;
      if ((p.startedAt === null && waited > START_TIMEOUT_MS + 1000 * Math.max(0, next - p.endGlobal)) || waited > MAX_HOLD_MS) {
        p.done = true; // voz fallida o colgada: no bloquear la reproducción
        continue;
      }
      if (p.endGlobal <= next) cap = Math.min(cap, p.endGlobal);
    }
    this._holding = cap < Infinity && cap - 1e-4 < next;
    if (this._holding) next = Math.max(prev, cap - 1e-4);
    for (const [k, p] of this.pending) if (p.done) this.pending.delete(k);
    this.globalT = next;
    // Primero el frame (puede interrumpir la voz al cambiar de toma), luego los diálogos nuevos.
    this.emit();
    this.fireDialogues(prev, this.globalT);
    if (this.globalT >= this.total - 1e-9) {
      if (this.handle !== null) this.clock.cancel(this.handle);
      this.handle = null;
      this.cb.onInterrupt?.();
      this.cb.onEnd?.();
    }
  }

  private tick = () => {
    const now = this.clock.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.handle = this.clock.request(this.tick);
    this.advance(Math.min(dt, 0.25));
  };

  private fireDialogues(prev: number, next: number) {
    this.fireSfx(prev, next);
    if (!this.cb.onDialogue) return;
    const { slots } = projectSchedule(this.project);
    for (const s of slots) {
      if (s.offset > next || s.offset + s.duration < prev) continue;
      for (const e of this.project.takes[s.index].events) {
        if (e.track !== "dialogue") continue;
        const g = s.offset + e.start;
        if (g > prev && g <= next) {
          const key = `${s.index}:${e.id}`;
          // Se registra ANTES de lanzar la voz: un motor que empieza al instante (audio ya generado)
          // llama a speechStarted dentro de onDialogue.
          this.pending.set(key, { actorUid: e.actorUid ?? (e.voiceOf ? `voice:${e.voiceOf}` : ""), endGlobal: g + e.duration, firedAt: this.clock.now(), startedAt: null, done: false });
          if (!this.cb.onDialogue(e, s.index, key)) this.pending.delete(key);
        }
      }
    }
  }

  private fireSfx(prev: number, next: number) {
    if (!this.cb.onSfx) return;
    const { slots } = projectSchedule(this.project);
    for (const s of slots) {
      if (s.offset > next || s.offset + s.duration < prev) continue;
      for (const e of this.project.takes[s.index].events) {
        if (e.track !== "sfx") continue;
        const g = s.offset + e.start;
        if (g > prev && g <= next) this.cb.onSfx(e, s.index);
      }
    }
  }

  private emit() {
    const { takeIndex, t } = locate(this.project, this.globalT);
    if (takeIndex !== this.currentTake) {
      if (this.currentTake !== -1) this.cb.onInterrupt?.();
      this.currentTake = takeIndex;
    }
    this.cb.onFrame(takeIndex, t, this.globalT);
  }
}
