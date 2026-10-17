"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter } from "@/lib/catalog";
import type { PocketProject } from "@/lib/schema/pocket";
import { evaluateTake, type FrameState } from "@/lib/timeline/evaluate";
import { Player } from "@/lib/timeline/player";
import { speak, stopSpeaking } from "@/lib/tts";
import { levelAt } from "@/lib/voice/dsp";
import { clipKey } from "@/lib/voice/fit";
import { playClip, stopAllClips, type Clip } from "@/lib/voice/piper";
import { mixVolume, playSound, preloadSounds } from "@/lib/sfx/player";
import { preloadProject } from "@/lib/renderer/preload";

export type VoiceEngine = "elevenlabs" | "piper" | "browser" | "off";

export function usePlayer(project: PocketProject, catalog: Catalog, opts: { engine: VoiceEngine; clips: Map<string, Clip> | null }) {
  const [pos, setPos] = useState({ takeIndex: 0, t: 0, global: 0 });
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const playerRef = useRef<Player | null>(null);

  if (!playerRef.current) {
    playerRef.current = new Player(project, {
      onFrame: (takeIndex, t, global) => {
        setPos({ takeIndex, t, global });
        setHolding(playerRef.current?.holding ?? false);
      },
      onDialogue: (e, takeIndex, key) => {
        const { engine, clips } = optsRef.current;
        if (engine === "off") return false;
        const player = playerRef.current!;
        const current = player.current;
        const take = current.takes[takeIndex];
        // Voz Piper: audio real generado de antemano, con tiempo exacto
        const usesClips = engine === "piper" || engine === "elevenlabs";
        const clip = usesClips ? clips?.get(clipKey(take.id, e.id)) : undefined;
        if (clip) {
          playClip(clip, { onStart: () => player.speechStarted(key), onEnd: () => player.speechEnded(key) });
          return true;
        }
        if (usesClips) return false; // sin clip (aún generándose): no bloquear
        const actor = take?.actors.find((a) => a.uid === e.actorUid);
        const ch = actor ? findCharacter(catalog, actor.characterId) : undefined;
        return speak(e.text, {
          ...e.voice,
          lang: current.metadata.language,
          defaults: ch?.defaultVoice,
          onStart: () => player.speechStarted(key),
          onEnd: () => player.speechEnded(key),
        });
      },
      onSfx: (e) => {
        void playSound(catalogRef.current, e.soundId, mixVolume(e.soundId, e.volume ?? 1), e.duration);
      },
      onInterrupt: () => {
        stopSpeaking();
        stopAllClips();
      },
      onEnd: () => setPlaying(false),
    });
  }

  useEffect(() => {
    playerRef.current!.setProject(project);
    void preloadProject(project, catalogRef.current); // calentar la caché nada más abrir el proyecto
  }, [project]);

  useEffect(() => {
    const p = playerRef.current!;
    return () => {
      p.pause();
      stopSpeaking();
      stopAllClips();
    };
  }, []);

  const frame: FrameState = useMemo(() => {
    const take = project.takes[Math.min(pos.takeIndex, project.takes.length - 1)];
    const pl = playerRef.current!;
    if (!pl.voiceDriven) return evaluateTake(take, catalog, pos.t);
    // Con voz real: la boca se mueve solo mientras suena y, con Piper, según el volumen de la onda.
    const live = pl.liveSpeakers();
    const levels = new Map<string, number>();
    if ((opts.engine === "piper" || opts.engine === "elevenlabs") && opts.clips) {
      for (const [uid, { key, elapsed }] of pl.liveClips()) {
        const cut = key.indexOf(":");
        const ti = key.slice(0, cut);
        const eid = key.slice(cut + 1);
        const tk = project.takes[Number(ti)];
        const clip = tk ? opts.clips.get(clipKey(tk.id, eid)) : undefined;
        if (clip) levels.set(uid, levelAt(clip.env, elapsed));
      }
    }
    return evaluateTake(take, catalog, pos.t, { live, levels: levels.size ? levels : undefined });
  }, [project, catalog, pos, opts.engine, opts.clips]);

  const p = playerRef.current;
  return {
    frame,
    pos,
    playing,
    holding,
    total: p.total,
    play: async () => {
      const ids = project.takes.flatMap((t) => t.events.flatMap((e) => (e.track === "sfx" ? [e.soundId] : [])));
      await Promise.all([ids.length ? preloadSounds(catalog, ids) : Promise.resolve(), preloadProject(project, catalog)]);
      p.play();
      setPlaying(true);
    },
    pause: () => {
      p.pause();
      setPlaying(false);
    },
    stop: () => {
      p.stop();
      setPlaying(false);
    },
    seek: (g: number) => p.seek(g),
  };
}
