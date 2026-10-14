"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { findCharacter } from "@/lib/catalog";
import type { PocketProject } from "@/lib/schema/pocket";
import { evaluateTake, type FrameState } from "@/lib/timeline/evaluate";
import { Player } from "@/lib/timeline/player";
import { speak, stopSpeaking } from "@/lib/tts";

export function usePlayer(project: PocketProject, catalog: Catalog, opts: { voice: boolean }) {
  const [pos, setPos] = useState({ takeIndex: 0, t: 0, global: 0 });
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const voiceRef = useRef(opts.voice);
  voiceRef.current = opts.voice;
  const playerRef = useRef<Player | null>(null);

  if (!playerRef.current) {
    playerRef.current = new Player(project, {
      onFrame: (takeIndex, t, global) => {
        setPos({ takeIndex, t, global });
        setHolding(playerRef.current?.holding ?? false);
      },
      onDialogue: (e, takeIndex, key) => {
        if (!voiceRef.current) return false;
        const player = playerRef.current!;
        const current = player.current;
        const actor = current.takes[takeIndex]?.actors.find((a) => a.uid === e.actorUid);
        const ch = actor ? findCharacter(catalog, actor.characterId) : undefined;
        // El diálogo manda: el reproductor espera a que esta voz termine antes de seguir.
        return speak(e.text, {
          ...e.voice,
          lang: current.metadata.language,
          defaults: ch?.defaultVoice,
          onStart: () => player.speechStarted(key),
          onEnd: () => player.speechEnded(key),
        });
      },
      onInterrupt: () => stopSpeaking(),
      onEnd: () => setPlaying(false),
    });
  }

  useEffect(() => {
    playerRef.current!.setProject(project);
  }, [project]);

  useEffect(() => {
    const p = playerRef.current!;
    return () => {
      p.pause();
      stopSpeaking();
    };
  }, []);

  const frame: FrameState = useMemo(() => {
    const take = project.takes[Math.min(pos.takeIndex, project.takes.length - 1)];
    const pl = playerRef.current!;
    // Con voz activa, la boca sigue al audio real (se mueve solo mientras suena).
    return evaluateTake(take, catalog, pos.t, pl.voiceDriven ? { live: pl.liveSpeakers() } : {});
  }, [project, catalog, pos]);

  const p = playerRef.current;
  return {
    frame,
    pos,
    playing,
    holding,
    total: p.total,
    play: () => {
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
