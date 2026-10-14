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
  const voiceRef = useRef(opts.voice);
  voiceRef.current = opts.voice;
  const playerRef = useRef<Player | null>(null);

  if (!playerRef.current) {
    playerRef.current = new Player(project, {
      onFrame: (takeIndex, t, global) => setPos({ takeIndex, t, global }),
      onDialogue: (e, takeIndex) => {
        if (!voiceRef.current) return;
        const current = playerRef.current!.current;
        const actor = current.takes[takeIndex]?.actors.find((a) => a.uid === e.actorUid);
        const ch = actor ? findCharacter(catalog, actor.characterId) : undefined;
        speak(e.text, { ...e.voice, lang: current.metadata.language, defaults: ch?.defaultVoice });
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
    return evaluateTake(take, catalog, pos.t);
  }, [project, catalog, pos]);

  const p = playerRef.current;
  return {
    frame,
    pos,
    playing,
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
