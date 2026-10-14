/**
 * TTS con Web Speech API del navegador (gratis, local al dispositivo).
 * Las voces disponibles y la sincronización varían entre dispositivos y
 * navegadores; no se genera audio exportable.
 */
import type { VoiceSettings } from "@/lib/schema/pocket";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function listVoices(lang = "es"): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const all = window.speechSynthesis.getVoices();
  const preferred = all.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  return preferred.length ? preferred : all;
}

/** Espera a que el navegador cargue la lista de voces (Chrome la carga async). */
export function onVoicesReady(cb: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (!ttsSupported()) return () => {};
  const handler = () => cb(listVoices());
  handler();
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

// Referencias vivas: algunos navegadores pierden onend si el objeto se recolecta.
const live = new Set<SpeechSynthesisUtterance>();

export function speak(
  text: string,
  opts: VoiceSettings & { lang?: string; defaults?: { pitch: number; rate: number }; onStart?: () => void; onEnd?: () => void } = {},
): boolean {
  if (!ttsSupported()) return false;
  const u = new SpeechSynthesisUtterance(text.replace(/\s*\[[^\]]{1,30}\]\s*/g, " ").trim());
  live.add(u);
  u.onstart = () => opts.onStart?.();
  const finish = () => {
    live.delete(u);
    opts.onEnd?.();
  };
  u.onend = finish;
  u.onerror = finish;
  u.lang = opts.lang ?? "es-ES";
  u.rate = opts.rate ?? opts.defaults?.rate ?? 1;
  u.pitch = opts.pitch ?? opts.defaults?.pitch ?? 1;
  if (opts.voiceName) {
    const v = window.speechSynthesis.getVoices().find((x) => x.name === opts.voiceName);
    if (v) u.voice = v;
  }
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/** Dictado por voz (SpeechRecognition) si el navegador lo ofrece. */
type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function dictationSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export function startDictation(onText: (t: string) => void, onEnd: (err?: string) => void): (() => void) | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "es-ES";
  rec.interimResults = false;
  rec.continuous = false;
  rec.onresult = (ev) => {
    const parts: string[] = [];
    for (let i = 0; i < ev.results.length; i++) parts.push(ev.results[i][0].transcript);
    onText(parts.join(" "));
  };
  rec.onerror = (ev) => onEnd(ev.error);
  rec.onend = () => onEnd();
  rec.start();
  return () => rec.stop();
}
