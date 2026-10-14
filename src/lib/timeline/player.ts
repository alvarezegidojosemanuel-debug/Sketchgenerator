import type { DialogueEvent, PocketProject } from "@/lib/schema/pocket";
import { locate, projectSchedule } from "./evaluate";

export interface PlayerCallbacks {
  onFrame: (takeIndex: number, t: number, globalT: number) => void;
  /** Se dispara una vez cuando el cabezal cruza el inicio de un diálogo. */
  onDialogue?: (e: DialogueEvent, takeIndex: number) => void;
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

/**
 * Temporizador reproducible: la posición depende solo del reloj, no de la voz.
 * Las voces TTS pueden desincronizarse según el dispositivo (se avisa en la UI).
 */
export class Player {
  private globalT = 0;
  private lastTick = 0;
  private handle: number | null = null;
  private currentTake = -1;

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
    this.globalT = Math.min(this.total, this.globalT + dt);
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
    if (!this.cb.onDialogue) return;
    const { slots } = projectSchedule(this.project);
    for (const s of slots) {
      if (s.offset > next || s.offset + s.duration < prev) continue;
      for (const e of this.project.takes[s.index].events) {
        if (e.track !== "dialogue") continue;
        const g = s.offset + e.start;
        if (g > prev && g <= next) this.cb.onDialogue(e, s.index);
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
