import { NextResponse, type NextRequest } from "next/server";
import { createElevenState, handleVoices, type ElevenEnv } from "@/lib/server/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const state = createElevenState();

export async function GET(req: NextRequest) {
  const r = await handleVoices(process.env as ElevenEnv, req.headers.get("x-pocket-code"), { fetch, now: Date.now, state });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
