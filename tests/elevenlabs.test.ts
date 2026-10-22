import { describe, expect, it, vi } from "vitest";
import { createElevenState, elevenStatus, handleDialogue, handleSfx, handleTts, handleVoices, type ElevenEnv } from "@/lib/server/elevenlabs";
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

  it("explica qué límite de ElevenLabs ha saltado", async () => {
    const { deps } = setup([() => new Response('{"detail":{"status":"quota_exceeded","message":"This request exceeds your API key quota of 10000."}}', { status: 401 })]);
    const r = await handleTts(body, "A", "puñetos-2026", env, deps);
    expect(r.json?.message).toContain("API key quota of 10000");
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

describe("ElevenLabs: conversación de una escena", () => {
  it("exige el código, envía todas las frases juntas al modelo v3 y devuelve los tiempos por frase", async () => {
    const reply = () =>
      new Response(
        JSON.stringify({
          audio_base64: "AAAA",
          voice_segments: [
            { voice_id: "a", start_time_seconds: 0.1, end_time_seconds: 1.2, dialogue_input_index: 0 },
            { voice_id: "b", start_time_seconds: 1.3, end_time_seconds: 2.0, dialogue_input_index: 1 },
            { voice_id: "b", start_time_seconds: 2.0, end_time_seconds: 2.6, dialogue_input_index: 1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const { f, deps } = setup([reply]);
    const big = { ...env, ELEVENLABS_DAILY_CHARS: "1000", ELEVENLABS_RATE_PER_IP: "10" };
    const inputs = [
      { text: "¿Cambios?", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
      { text: "[mischievously] Yo no digo nada.", voiceId: "AZnzlk1XvdvUeBnXmlld" },
    ];
    expect((await handleDialogue({ inputs }, "ip", "mal", big, deps)).status).toBe(401);
    expect((await handleDialogue({ inputs: [] }, "ip", "puñetos-2026", big, deps)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
    const r = await handleDialogue({ inputs }, "ip", "puñetos-2026", big, deps);
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/text-to-dialogue/with-timestamps");
    const sent = JSON.parse(String(init.body));
    expect(sent.model_id).toBe("eleven_v3");
    expect(sent.inputs).toEqual([
      { text: "¿Cambios?", voice_id: "JBFqnCBsd6RMkjVDRZzb" },
      { text: "[mischievously] Yo no digo nada.", voice_id: "AZnzlk1XvdvUeBnXmlld" },
    ]);
    expect(r.json?.segments).toEqual([
      { index: 0, start: 0.1, end: 1.2 },
      { index: 1, start: 1.3, end: 2.6 },
    ]);
    expect(elevenStatus(big, deps.state, deps.now()).usedToday).toBe(inputs[0].text.length + inputs[1].text.length);
  });
});

describe("ElevenLabs: casting de voces a medida", () => {
  it("diseña voces con la descripción y guarda la elegida", async () => {
    const { handleVoiceDesign, handleVoiceSave } = await import("@/lib/server/elevenlabs");
    const design = () => new Response(JSON.stringify({ previews: [{ audio_base_64: "AAAA", generated_voice_id: "gen_abc123" }, { audio_base_64: "BBBB", generated_voice_id: "gen_def456" }] }), { status: 200 });
    const save = () => new Response(JSON.stringify({ voice_id: "VoiceIdABC12345", name: "Puñetos · Barbas" }), { status: 200 });
    const { f, deps } = setup([design, save]);
    const big = { ...env, ELEVENLABS_DAILY_CHARS: "5000", ELEVENLABS_RATE_PER_IP: "10" };
    const body = { description: "Hombre de 45 años, voz grave de bonachón pícaro.", text: "x".repeat(120) };
    expect((await handleVoiceDesign(body, "ip", "mal", big, deps)).status).toBe(401);
    expect((await handleVoiceDesign({ ...body, text: "corta" }, "ip", "puñetos-2026", big, deps)).status).toBe(400);
    const r = await handleVoiceDesign(body, "ip", "puñetos-2026", big, deps);
    expect(r.status).toBe(200);
    expect(r.json?.previews).toEqual([{ id: "gen_abc123", audio: "AAAA" }, { id: "gen_def456", audio: "BBBB" }]);
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain("/v1/text-to-voice/design");
    const sv = await handleVoiceSave({ name: "Puñetos · Barbas", description: body.description, generatedVoiceId: "gen_abc123" }, "puñetos-2026", big, deps);
    expect(sv.json).toEqual({ voiceId: "VoiceIdABC12345", name: "Puñetos · Barbas" });
    const sent = JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(sent).toMatchObject({ generated_voice_id: "gen_abc123", voice_name: "Puñetos · Barbas" });
  });
  it("las frases de prueba de todos los personajes cumplen el mínimo de ElevenLabs", async () => {
    const { CASTING } = await import("@/lib/voice/casting");
    for (const [cid, p] of Object.entries(CASTING)) {
      expect(p.sample.length, cid).toBeGreaterThanOrEqual(100);
      expect(p.description.length, cid).toBeGreaterThanOrEqual(20);
    }
  });
});
