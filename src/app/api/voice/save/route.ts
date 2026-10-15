import { NextResponse, type NextRequest } from "next/server";
import { handleVoiceSave, type ElevenEnv } from "@/lib/server/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 3000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const r = await handleVoiceSave(body, req.headers.get("x-pocket-code"), process.env as ElevenEnv, { fetch });
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
