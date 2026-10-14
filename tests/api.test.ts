import { describe, expect, it, vi } from "vitest";
import { createLimiterState, handleGenerate, isFreeModelId, statusInfo, type GenerateEnv } from "@/lib/server/openrouter";
import { catalog } from "./helpers";

const body = { intent: { idea: "Usu pierde las llaves", duration: 15, characterIds: ["usu", "jefe"], tone: "absurdo", backgroundId: null } };
const env: GenerateEnv = { OPENROUTER_ENABLED: "true", OPENROUTER_API_KEY: "sk-test", OPENROUTER_MODEL: "openrouter/free", OPENROUTER_RATE_LIMIT_PER_IP: "2", OPENROUTER_DAILY_QUOTA: "3" };

const models = (entries: { id: string; prompt: string; completion: string }[]) =>
  new Response(JSON.stringify({ data: entries.map((m) => ({ id: m.id, pricing: { prompt: m.prompt, completion: m.completion, request: "0" } })) }), { status: 200 });
const freeList = () => models([{ id: "openrouter/free", prompt: "0", completion: "0" }, { id: "meta/llama:free", prompt: "0", completion: "0" }, { id: "openai/gpt-x", prompt: "0.000002", completion: "0.000008" }]);
const completion = (content: string) => new Response(JSON.stringify({ model: "meta/llama:free", choices: [{ message: { content } }] }), { status: 200 });

function setup(responses: Response[]) {
  const fetchMock = vi.fn(async () => {
    const r = responses.shift();
    if (!r) throw new Error("fetch inesperado");
    return r;
  });
  return { fetchMock, deps: { fetch: fetchMock as unknown as typeof fetch, now: () => Date.UTC(2026, 9, 14, 12), state: createLimiterState(), catalog } };
}

describe("/api/generate", () => {
  it("prueba 5: desactivado o sin clave → no se llama a la red", async () => {
    const { fetchMock, deps } = setup([]);
    const off = await handleGenerate(body, "1.1.1.1", { ...env, OPENROUTER_ENABLED: undefined }, deps);
    expect(off.status).toBe(503);
    expect(off.body.error).toBe("disabled");
    const noKey = await handleGenerate(body, "1.1.1.1", { ...env, OPENROUTER_API_KEY: "" }, deps);
    expect(noKey.status).toBe(503);
    expect(noKey.body.error).toBe("no_key");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(statusInfo({ ...env, OPENROUTER_API_KEY: "" }, deps).enabled).toBe(false);
  });

  it("rechaza modelos de pago configurados sin llamar a la red", async () => {
    const { fetchMock, deps } = setup([]);
    const r = await handleGenerate(body, "ip", { ...env, OPENROUTER_MODEL: "openai/gpt-x" }, deps);
    expect(r.body.error).toBe("model_not_free");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isFreeModelId("openrouter/free")).toBe(true);
    expect(isFreeModelId("meta/llama-3:free")).toBe(true);
    expect(isFreeModelId("openai/gpt-4o")).toBe(false);
    expect(isFreeModelId("openrouter/auto")).toBe(false);
  });

  it("no envía la petición si el modelo no figura con precio 0 en tiempo real", async () => {
    const { fetchMock, deps } = setup([models([{ id: "meta/llama:free", prompt: "0.0001", completion: "0" }])]);
    const r = await handleGenerate(body, "ip", { ...env, OPENROUTER_MODEL: "meta/llama:free" }, deps);
    expect(r.body.error).toBe("free_unconfirmed");
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo la lista pública de modelos
  });

  it("prueba 6: límite gratuito (429) → error claro, sin reintento ni modelo de pago", async () => {
    const { fetchMock, deps } = setup([freeList(), new Response("{}", { status: 429 })]);
    const r = await handleGenerate(body, "ip", env, deps);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe("free_limit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const sent = JSON.parse(String(calls[1][1]!.body));
    expect(sent.model).toBe("openrouter/free");
    expect(sent.models).toBeUndefined();
    expect(sent.provider.max_price).toEqual({ prompt: 0, completion: 0, request: 0 });
    expect(sent.max_tokens).toBeGreaterThan(0);
  });

  it("402 → se cancela sin usar crédito", async () => {
    const { deps } = setup([freeList(), new Response("{}", { status: 402 })]);
    expect((await handleGenerate(body, "ip", env, deps)).body.error).toBe("payment_required");
  });

  it("éxito: devuelve el contenido; el servidor construye el prompt desde la intención", async () => {
    const { fetchMock, deps } = setup([freeList(), completion('{"takes":[]}')]);
    const r = await handleGenerate(body, "ip", env, deps);
    expect(r.status).toBe(200);
    expect(r.body.content).toBe('{"takes":[]}');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const sent = JSON.parse(String(calls[1][1]!.body));
    expect(sent.messages[0].content).toContain("PUÑETOS Pocket");
    expect((calls[1][1]!.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("rechaza prompts libres (no es un proxy genérico)", async () => {
    const { fetchMock, deps } = setup([]);
    const r = await handleGenerate({ prompt: "escribe un poema" }, "ip", env, deps);
    expect(r.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aplica rate limit por IP y cuota diaria", async () => {
    const { deps } = setup([freeList(), completion("a"), completion("b"), completion("c")]);
    expect((await handleGenerate(body, "A", env, deps)).status).toBe(200);
    expect((await handleGenerate(body, "A", env, deps)).status).toBe(200);
    expect((await handleGenerate(body, "A", env, deps)).body.error).toBe("rate_limited");
    expect((await handleGenerate(body, "B", env, deps)).status).toBe(200);
    expect((await handleGenerate(body, "C", env, deps)).body.error).toBe("daily_quota");
  });
});
