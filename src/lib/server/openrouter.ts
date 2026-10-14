/**
 * Lógica servidor de /api/generate (OpenRouter opcional, SOLO modelos gratuitos).
 *
 * Garantías:
 * - Desactivado por defecto (OPENROUTER_ENABLED !== "true" → 503 sin llamar a nadie).
 * - Sin clave → 503 sin llamar a nadie. La clave solo vive en process.env del servidor.
 * - Solo "openrouter/free" o IDs ":free", y además se confirma en tiempo real que el
 *   modelo figura con precio 0 en https://openrouter.ai/api/v1/models. Nunca hay
 *   fallback a modelos de pago ni reintentos automáticos.
 * - El cliente envía la INTENCIÓN, no un prompt libre: el servidor construye el mismo
 *   prompt determinista que el modo manual (evita usar el endpoint como proxy genérico).
 * - Timeout, max_tokens, tamaño máximo de prompt, rate limit por IP y cuota diaria.
 *   Los contadores son en memoria por instancia (best-effort en serverless).
 */
import { z } from "zod";
import type { Catalog } from "@/lib/catalog/types";
import { buildPrompt, DURATIONS } from "@/lib/generator/prompt";

export interface GenerateEnv {
  OPENROUTER_ENABLED?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_TIMEOUT_MS?: string;
  OPENROUTER_MAX_TOKENS?: string;
  OPENROUTER_MAX_PROMPT_CHARS?: string;
  OPENROUTER_RATE_LIMIT_PER_IP?: string;
  OPENROUTER_DAILY_QUOTA?: string;
}

export interface GenerateDeps {
  fetch: typeof fetch;
  now: () => number;
  state: LimiterState;
  catalog: Catalog;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MODELS_CACHE_MS = 10 * 60 * 1000;

export interface LimiterState {
  perIp: Map<string, number[]>;
  day: string;
  dayCount: number;
  freeModels: { at: number; ids: Set<string> } | null;
}

export function createLimiterState(): LimiterState {
  return { perIp: new Map(), day: "", dayCount: 0, freeModels: null };
}

const intNum = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export function readConfig(env: GenerateEnv) {
  return {
    enabled: env.OPENROUTER_ENABLED === "true",
    hasKey: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()),
    model: (env.OPENROUTER_MODEL ?? "openrouter/free").trim() || "openrouter/free",
    timeoutMs: intNum(env.OPENROUTER_TIMEOUT_MS, 45_000, 5_000, 120_000),
    maxTokens: intNum(env.OPENROUTER_MAX_TOKENS, 4_000, 256, 8_000),
    maxPromptChars: intNum(env.OPENROUTER_MAX_PROMPT_CHARS, 24_000, 2_000, 60_000),
    ratePerIp: intNum(env.OPENROUTER_RATE_LIMIT_PER_IP, 5, 1, 100),
    dailyQuota: intNum(env.OPENROUTER_DAILY_QUOTA, 40, 1, 1_000),
  };
}

/** Lista blanca sintáctica: solo el router gratuito o variantes ":free". */
export function isFreeModelId(model: string): boolean {
  return model === "openrouter/free" || /^[a-z0-9._-]+\/[a-z0-9._:-]+:free$/i.test(model);
}

const IntentBody = z.object({
  intent: z.object({
    idea: z.string().max(1000),
    duration: z.union(DURATIONS.map((d) => z.literal(d)) as unknown as [z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
    characterIds: z.array(z.string().max(80)).min(1).max(5),
    tone: z.string().max(40),
    backgroundId: z.string().max(80).nullable(),
  }),
});

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function statusInfo(env: GenerateEnv, deps: Pick<GenerateDeps, "now" | "state">) {
  const cfg = readConfig(env);
  const today = dayKey(deps.now());
  const used = deps.state.day === today ? deps.state.dayCount : 0;
  return {
    enabled: cfg.enabled && cfg.hasKey && isFreeModelId(cfg.model),
    freeOnly: true,
    model: cfg.model,
    dailyQuota: cfg.dailyQuota,
    remainingToday: Math.max(0, cfg.dailyQuota - used),
    notice:
      "Modo gratuito de OpenRouter: la disponibilidad y los límites (p. ej. ~50 peticiones/día en cuentas sin crédito) pueden cambiar. Nunca se usan modelos de pago.",
  };
}

/** Confirma en tiempo real que el modelo figura con precio 0 en OpenRouter. */
async function confirmFree(model: string, deps: GenerateDeps, timeoutMs: number): Promise<boolean> {
  const cache = deps.state.freeModels;
  if (!cache || deps.now() - cache.at > MODELS_CACHE_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 10_000));
    try {
      const res = await deps.fetch(`${OPENROUTER_BASE}/models`, { signal: ctrl.signal });
      if (!res.ok) return false;
      const json = (await res.json()) as { data?: { id: string; pricing?: Record<string, string> }[] };
      const ids = new Set<string>();
      for (const m of json.data ?? []) {
        const p = m.pricing ?? {};
        const zero = (k: string) => p[k] === undefined || Number(p[k]) === 0;
        if (p.prompt !== undefined && zero("prompt") && zero("completion") && zero("request")) ids.add(m.id);
      }
      deps.state.freeModels = { at: deps.now(), ids };
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return deps.state.freeModels!.ids.has(model);
}

export async function handleGenerate(body: unknown, ip: string, env: GenerateEnv, deps: GenerateDeps): Promise<HandlerResponse> {
  const cfg = readConfig(env);
  if (!cfg.enabled) {
    return { status: 503, body: { error: "disabled", message: "La generación con OpenRouter está desactivada en este despliegue. Usa el modo Copiar prompt → ChatGPT." } };
  }
  if (!cfg.hasKey) {
    return { status: 503, body: { error: "no_key", message: "El servidor no tiene OPENROUTER_API_KEY configurada. Usa el modo manual." } };
  }
  if (!isFreeModelId(cfg.model)) {
    return { status: 500, body: { error: "model_not_free", message: `El modelo configurado "${cfg.model}" no es gratuito; se rechaza por seguridad.` } };
  }

  const parsed = IntentBody.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "bad_request", message: "Petición no válida: se esperaba { intent: { idea, duration, characterIds, tone, backgroundId } }." } };
  }
  const { prompt } = buildPrompt(parsed.data.intent, deps.catalog);
  if (prompt.length > cfg.maxPromptChars) {
    return { status: 413, body: { error: "prompt_too_large", message: `El prompt (${prompt.length} caracteres) supera el máximo de ${cfg.maxPromptChars}.` } };
  }

  // Rate limit por IP (ventana deslizante) y cuota diaria global.
  const now = deps.now();
  const hits = (deps.state.perIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= cfg.ratePerIp) {
    deps.state.perIp.set(ip, hits);
    return { status: 429, body: { error: "rate_limited", message: `Has alcanzado ${cfg.ratePerIp} peticiones en 10 minutos. Espera un poco o usa el modo manual.` } };
  }
  const today = dayKey(now);
  if (deps.state.day !== today) {
    deps.state.day = today;
    deps.state.dayCount = 0;
  }
  if (deps.state.dayCount >= cfg.dailyQuota) {
    return { status: 429, body: { error: "daily_quota", message: `Se agotó la cuota diaria de este despliegue (${cfg.dailyQuota}). Vuelve mañana o usa el modo manual.` } };
  }

  if (!(await confirmFree(cfg.model, deps, cfg.timeoutMs))) {
    return {
      status: 503,
      body: { error: "free_unconfirmed", message: `No se pudo confirmar ahora mismo que "${cfg.model}" sea gratuito en OpenRouter. No se ha enviado nada. Usa el modo manual.` },
    };
  }

  hits.push(now);
  deps.state.perIp.set(ip, hits);
  deps.state.dayCount += 1;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await deps.fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "PUNETOS Pocket",
      },
      body: JSON.stringify({
        model: cfg.model, // un único modelo: sin lista "models" de fallback
        messages: [{ role: "user", content: prompt }],
        max_tokens: cfg.maxTokens,
        temperature: 0.8,
        provider: { max_price: { prompt: 0, completion: 0, request: 0 } },
      }),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: 504,
      body: { error: aborted ? "timeout" : "network", message: aborted ? `OpenRouter no respondió en ${cfg.timeoutMs / 1000}s.` : "No se pudo contactar con OpenRouter." },
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429) {
      return { status: 429, body: { error: "free_limit", message: "OpenRouter ha limitado el uso gratuito (límite por minuto o diario). No se reintenta ni se cambia a modelos de pago. Prueba más tarde o usa el modo manual." } };
    }
    if (res.status === 402) {
      return { status: 402, body: { error: "payment_required", message: "OpenRouter solicita crédito para esta petición. Pocket no usa modelos de pago: petición cancelada." } };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 502, body: { error: "auth", message: "OpenRouter rechazó la clave del servidor." } };
    }
    return { status: 502, body: { error: "upstream", message: `OpenRouter devolvió un error (${res.status}).` } };
  }

  const json = (await res.json().catch(() => null)) as { model?: string; choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { status: 502, body: { error: "empty", message: "El modelo gratuito no devolvió contenido. Prueba de nuevo más tarde o usa el modo manual." } };
  }
  return { status: 200, body: { content, model: json?.model ?? cfg.model, remainingToday: Math.max(0, cfg.dailyQuota - deps.state.dayCount) } };
}
