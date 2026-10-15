import { describe, expect, it, vi } from "vitest";
import { createElevenState, elevenStatus, handleSfx, handleTts, handleVoices, type ElevenEnv } from "@/lib/server/elevenlabs";
import { stripAudioTags } from "@/lib/voice/tags";
import { evaluateTake } from "@/lib/timeline/evaluate";
import { validateProject } from "@/lib/schema/validate";
import { catalog, demo } from "./helpers";

const env: ElevenEnv = { ELEVENLABS_API_KEY: "sk_test", POCKET_ACCESS_CODE: "puñetos-2026", ELEVENLABS_DAILY_CHARS: "100", ELEVENLABS_RATE_PER_IP: "3" };
const body = { text: "Hola, soy Usu.", voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_multilingual_v2", settings: { stability: 0.4, similarity: 0.8, style: 0.3, speed: 1 } };
const mp3 = () => new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200, headers: { "content-type": "audio/mpeg" } });
const setup = (responses: (() => Response)[] = []) => {
  const f = vi.fn(async () => (responses.shift() ?? mp3)());
  return { f, deps: { fetch: f as unknown as typeof fetch, now: () => Date.UTC(2026, 9, 15, 10), state: createElevenState() } };
};

describe("ElevenLabs: seguridad", () => {
  it("sin clave, sin código configurado o con código incorrecto no llama a ElevenLabs", async () => {
    const { f, deps } = setup();
    expect((await handleTts(body, "ip", "puñetos-2026", { ...env, ELEVENLABS_API_KEY: "" }, deps)).json?.error).toBe("no_key");
    expect((await handleTts(body, "ip", "x", { ...env, POCKET_ACCESS_CODE: "" }, deps)).json?.error).toBe("no_code");
    expect((await handleTts(body, "ip", "otro", env, deps)).status).toBe(401);
    expect((await handleTts(body, "ip", null, env, deps)).status).toBe(401);
    expect((await handleVoices(env, "otro", deps)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("con el código correcto envía la clave solo al servidor de ElevenLabs y devuelve el audio", async () => {
    const { f, deps } = setup();
    const r = await handleTts(body, "ip", "puñetos-2026", env, deps);
    expect(r.status).toBe(200);
    expect(r.audio?.byteLength).toBe(4);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ text: "Hola, soy Usu.", model_id: "eleven_multilingual_v2", language_code: "es" });
    expect(elevenStatus(env, deps.state, deps.now()).usedToday).toBe(body.text.length);
  });

  it("rechaza modelos fuera de la lista, textos largos e IDs raros", async () => {
    const { f, deps } = setup();
    expect((await handleTts({ ...body, model: "eleven_pro_max" }, "ip", "puñetos-2026", env, deps)).status).toBe(400);
    expect((await handleTts({ ...body, text: "x".repeat(401) }, "ip", "puñetos-2026", env, deps)).status).toBe(400);
    expect((await handleTts({ ...body, voiceId: "../../v1/user" }, "ip", "puñetos-2026", env, deps)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("ElevenLabs: límites", () => {
  it("tope diario de caracteres y peticiones por IP", async () => {
    const { deps } = setup();
    for (let i = 0; i < 3; i++) expect((await handleTts(body, "A", "puñetos-2026", env, deps)).status).toBe(200);
    expect((await handleTts(body, "A", "puñetos-2026", env, deps)).json?.error).toBe("rate_limited");
    expect((await handleTts({ ...body, text: "y".repeat(80) }, "B", "puñetos-2026", env, deps)).json?.error).toBe("daily_cap");
  });

  it("si ElevenLabs falla no cuenta los caracteres y avisa de créditos agotados", async () => {
    const { deps } = setup([() => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })]);
    const r = await handleTts(body, "A", "puñetos-2026", env, deps);
    expect(r.json?.error).toBe("quota");
    expect(deps.state.chars).toBe(0);
  });
});

describe("acotaciones de voz", () => {
  it("se quitan del texto para subtítulos y voces que no las entienden", () => {
    expect(stripAudioTags("[sighs] Otra vez lunes.")).toBe("Otra vez lunes.");
    expect(stripAudioTags("Vale [laughs] perfecto")).toBe("Vale perfecto");
    const p = validateProject(demo(), catalog).project!;
    (p.takes[0].events.find((e) => e.id === "t1_d1") as { text: string }).text = "[laughs] Ah, lunes.";
    const sub = evaluateTake(p.takes[0], catalog, 1).subtitles[0];
    expect(sub.text).toBe("Ah, lunes.");
  });
});

describe("voces de España", () => {
  it("detecta el acento de España y el reparto automático las prefiere", async () => {
    const { autoCast, isSpainVoice } = await import("@/lib/voice/elevenlabs");
    const v = (id: string, gender: string, accent: string) => ({ id, name: id, category: "x", labels: { gender, accent }, preview: "" });
    const voices = [v("BrianUS0001", "male", "american"), v("Madrid00001", "male", "castilian spanish"), v("Sevilla0001", "female", "andalusian"), v("LatAm000001", "female", "latin american")];
    expect(voices.map(isSpainVoice)).toEqual([false, true, true, false]);
    const cast = autoCast(voices, ["usu", "sister"]);
    expect(cast.usu.voiceId).toBe("Madrid00001");
    expect(cast.sister.voiceId).toBe("Sevilla0001");
  });
});

describe("ElevenLabs: efectos de sonido", () => {
  it("exige el código, valida la petición y cuenta contra el tope diario", async () => {
    const { f, deps } = setup();
    const big = { ...env, ELEVENLABS_DAILY_CHARS: "1000", ELEVENLABS_RATE_PER_IP: "10" };
    expect((await handleSfx({ text: "teléfono antiguo", duration: 2 }, "ip", "mal", big, deps)).status).toBe(401);
    expect((await handleSfx({ text: "x", duration: 2 }, "ip", "puñetos-2026", big, deps)).status).toBe(400);
    expect((await handleSfx({ text: "rugido de dragón", duration: 30 }, "ip", "puñetos-2026", big, deps)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    const r = await handleSfx({ text: "rugido de dragón", duration: 2 }, "ip", "puñetos-2026", big, deps);
    expect(r.status).toBe(200);
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain("/v1/sound-generation");
    expect(elevenStatus(big, deps.state, deps.now()).usedToday).toBe(200);
  });
});
