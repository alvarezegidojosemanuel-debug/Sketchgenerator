import { NextResponse, type NextRequest } from "next/server";
import { catalog } from "@/lib/catalog";
import { createLimiterState, handleGenerate, statusInfo } from "@/lib/server/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estado en memoria por instancia (best-effort). Para límites estrictos usar un KV externo.
const state = createLimiterState();
const MAX_BODY = 8_000;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET() {
  return NextResponse.json(statusInfo(process.env, { now: Date.now, state }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "too_large", message: "Petición demasiado grande." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const res = await handleGenerate(body, clientIp(req), process.env, { fetch, now: Date.now, state, catalog });
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
