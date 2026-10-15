import { NextResponse, type NextRequest } from "next/server";
import { createElevenState, handleSfx, type ElevenEnv } from "@/lib/server/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const state = createElevenState();
const ip = (req: NextRequest) => req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 2000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const r = await handleSfx(body, ip(req), req.headers.get("x-pocket-code"), process.env as ElevenEnv, { fetch, now: Date.now, state });
  if (r.audio) return new NextResponse(r.audio, { status: 200, headers: { "content-type": "audio/mpeg", "Cache-Control": "no-store" } });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
