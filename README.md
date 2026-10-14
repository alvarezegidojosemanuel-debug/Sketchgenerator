# PUÑETOS Pocket

Web móvil (Next.js + TypeScript) que convierte una idea cómica en un sketch **editable y reproducible** de PUÑETOS.
Funciona de principio a fin **sin claves ni gasto en tokens**: genera un prompt, lo pegas en ChatGPT (u otro modelo), pegas el JSON de vuelta y lo ves y editas en el móvil.

> ⚠️ **Catálogo provisional.** El ZIP `PUNETOS_STUDIO_V3(1).zip` no estaba disponible al construir esto. La app trae un catálogo *placeholder* (dibujos SVG simples con los 5 personajes: Usu, Reynaldo, Sister, Barbas, Jefe) marcado como `source.kind: "placeholder"`, y la interfaz lo indica con la etiqueta «catálogo provisional». Sus IDs **no** son IDs de V3. Para usar la biblioteca real, ver [Catálogo V3](#catálogo-v3).

## Arranque

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 41 pruebas (Vitest)
npm run typecheck
npm run build
```

Node 20 o superior.

## Cómo se usa (pantallas)

1. **Idea**: escribe o dicta la idea, elige la duración (15/30/45/60 s), los personajes, el tono y el escenario.
2. **Generar**: tres tarjetas.
   - **Prompt para ChatGPT** (predeterminado, 0 € de API): copia un prompt determinista con el catálogo real de IDs y el contrato JSON.
   - **Importar JSON**: pega la respuesta, pulsa *Pegar* o sube un `.json`. Se valida, se normaliza (se quitan los bloques ```json, se corrigen alias de pistas, números en texto, mayúsculas…) y se muestran errores con ruta y línea. También acepta proyectos V3.
   - **OpenRouter gratuito (opcional)**: apagado. Solo aparece si lo activas tú y el despliegue lo tiene configurado.
3. **Ver**: escenario 9:16, reproducir, pausar y detener, barra de tiempo, voces del navegador (Web Speech), subtítulos y boca aproximada.
4. **Editar**: tomas, personajes (pose, expresión, X/Y, escala, profundidad, espejo), eventos ordenados por tiempo. Toca un evento para editar el texto, la voz, la pose, la expresión, la mirada, los objetos, el inicio y la duración. Arrastra a los personajes sobre el escenario.
5. **Proyectos**: se autoguarda en IndexedDB. Desde aquí puedes cargar, borrar, exportar e importar JSON Pocket y exportar a V3 (con informe de pérdidas).

> Si borras los datos del navegador, pierdes los borradores. Exporta el JSON para guardar una copia.

## Despliegue GitHub → Vercel

1. Sube el repositorio a GitHub (ya incluye CI en `.github/workflows/ci.yml`: typecheck, tests y build).
2. En [vercel.com](https://vercel.com): **Add New → Project**, importa el repositorio. Vercel detecta Next.js y no hace falta configurar nada.
3. **Deploy.** Sin variables de entorno, la app funciona en modo manual y `/api/generate` responde 503 sin llamar a nadie.
4. (Opcional) Para OpenRouter, ve a **Settings → Environment Variables** y añade las variables de `.env.example` (`OPENROUTER_ENABLED=true`, `OPENROUTER_API_KEY=…`). **Nunca** uses el prefijo `NEXT_PUBLIC_`.

Precio: el plan Hobby de Vercel, OpenRouter, los dominios y las voces pueden tener condiciones o límites. Compruébalos; Pocket no promete coste cero de alojamiento.

## Estructura

```
src/lib/
  catalog/        tipos y consultas del catálogo (única fuente de IDs válidos)
  schema/         contrato pocket-1 (Zod), JSON Schema y validador/normalizador
  generator/      prompt determinista (mismo texto para ChatGPT y OpenRouter)
  import-export/  parseo tolerante de texto/JSON (sin eval), exportación
  timeline/       evaluación pura de una toma en t y reproductor con reloj inyectable
  renderer/       layout de capas (fondo, props-back, actores, props-front)
  tts/            Web Speech (voces y dictado)
  adapters/       pocketToV3() / v3ToPocket() con informe de pérdidas
  server/         lógica de /api/generate (OpenRouter free-only)
  storage/        IndexedDB
src/components/   UI móvil (5 pantallas)
schema/pocket.schema.json   generado desde Zod (`npm run gen:schema`)
catalog.json                catálogo actual (copia de src/data/catalog.json)
examples/sketch-demo.json   sketch de 30 s con Usu y Jefe
scripts/                    generación de catálogo placeholder / desde V3
```

## Contrato JSON `pocket-1`

Mira `schema/pocket.schema.json` y `examples/sketch-demo.json`. En resumen: `metadata`, `catalogVersion`, `canvas` (1080×1920), y `takes[]`, cada una con `id`, `duration`, `backgroundId`, `actors[]` (`uid`, `characterId`, `poseId`, `x`, `y` en los pies, `scale`, `zIndex`) y `events[]` (`id`, `track`, `actorUid`, `start`, `duration`).

Tipos de evento: `dialogue` (`text`, `voice`), `body` (`poseId`, destino `x`/`y`/`scale`, `ease`), `face` (`expressionId` o `emotion`), `mouth` (`auto` o `calibrated` con `dx`/`dy`), `eyes` (`gazeX`/`gazeY`) y `props` (`propId`, `layer`, `x`, `y`).

El validador hace lo siguiente:
- Solo acepta IDs del catálogo.
- Exige `start >= 0` y `duration > 0`.
- Comprueba rangos, referencias `actorUid` e IDs únicos.
- Limita el tamaño (300 KB, 30 tomas, 200 eventos por toma, 180 s).
- Rechaza HTML y scripts incrustados.

Las correcciones automáticas nunca fabrican assets. Si se pide una expresión no registrada, se usa el *fallback* declarado del personaje y se avisa.

Estos campos son **propuestos para Pocket** y no equivalen al esquema V3/V8.

## Catálogo V3

```bash
unzip "PUNETOS_STUDIO_V3(1).zip" -d v3-source   # v3-source/ está en .gitignore
npm run catalog:v3 -- v3-source --dry-run       # inventario sin escribir nada
npm run catalog:v3 -- v3-source                 # copia assets + licencias y escribe el catálogo
```

El script lee `config/library_index.json` y conserva las rutas relativas originales bajo `public/assets/v3/`. Además copia los ficheros de licencia y escribe `docs/V3_INVENTORY.md`, que lista las entradas sin clasificar o sin archivo. No inventa IDs: lo que no sabe clasificar lo deja fuera y lo indica.

Como no se ha podido ver el formato real de `library_index.json`, la clasificación es heurística y **hay que revisarla** con el ZIP real. Después habrá que rehacer `examples/sketch-demo.json` con IDs reales.

## Adaptador V3

`src/lib/adapters/v3.ts` sigue la forma documentada de `templates/TIMELINE_SCHEMA_EXAMPLE.json`: `version: 3`, `type: "punetos_project"`, tomas con `scene` y `timeline.events`, y eventos `body` (`asset_id`, `body_mode`, `from_*`, `target_*`), `face` (`asset_id`) y `mouth` (`asset_id: "__auto__"`).

Hay un informe de pérdidas: ojos, objetos, ajustes de voz, flip, escala en body y boca calibrada no se exportan. También informa de los supuestos: la forma de `scene.layers` y los valores de `body_mode` son **suposiciones** pendientes de verificar.

El fixture `tests/fixtures/v3-timeline-example.json` se construyó a partir de la especificación, no del fichero real. No hay round-trip perfecto.

## OpenRouter (opcional, solo gratis)

- Está apagado salvo que se cumplan las tres condiciones: `OPENROUTER_ENABLED=true`, clave en el servidor y el usuario lo activa en la tarjeta.
- El cliente envía la **intención**, no un prompt libre. El servidor construye el mismo prompt del modo manual, así el endpoint no sirve como proxy genérico.
- Solo admite `openrouter/free` o IDs `:free`. Además, antes de cada petición confirma en tiempo real que el modelo figura con precio 0 en `/api/v1/models`, y envía `provider.max_price = 0`. No hay lista de fallback ni reintentos.
- Límites: timeout, `max_tokens`, tamaño máximo de prompt, rate limit por IP (10 min) y cuota diaria. Un 429 o 402 de OpenRouter devuelve un error explicativo.
- Los contadores viven **en memoria por instancia**: en serverless son orientativos. Para límites estrictos hay que usar un KV externo (pendiente).
- No se admite la clave personal del usuario: requiere un diseño explícito de autenticación y riesgos antes de habilitarla.

## Estado: qué está hecho y qué falta

| Fase | Estado |
|---|---|
| 1. Inventario V3 + web básica con reproducción | ✅ web + reproducción; ⚠️ inventario real pendiente del ZIP (script listo) |
| 2. Editor móvil, import/export con validación y tests | ✅ |
| 3. Prompt + bucle ChatGPT → JSON → Pocket | ✅ |
| 4. OpenRouter opt-in free-only con límites | ✅ (contadores en memoria) |
| 5. Compatibilidad V8, calibraciones y expresiones por pose | ❌ **depende del ZIP/código V8 real** (no se inventa compatibilidad) |
| 6. Conector ChatGPT / MCP | ❌ **pendiente**: requiere endpoints autenticados y comprobar los permisos reales de la cuenta. El copiar/pegar sigue siendo la vía garantizada |
| 7. PWA, CI y Vercel | ✅ CI + instrucciones Vercel; ❌ PWA (manifest/service worker) pendiente |

Pruebas mínimas de la especificación:
1. Sketch de 30 s con Usu y Jefe sin clave: `tests/playback.test.ts` y `schema.test.ts`.
2. Exportar e importar conservando diálogos y posiciones: `import-export.test.ts`.
3. JSON inválido con error útil: `schema.test.ts`.
4. ID inexistente rechazado: `schema.test.ts`.
5. API sin clave no llama a la red: `api.test.ts`.
6. Límite gratuito sin modelo de pago: `api.test.ts`.
7. Uso en móvil: revisado con un viewport Pixel 7 (Playwright, sin scroll horizontal). **Falta probarlo en Android e iPhone reales.**

Otras limitaciones: las voces TTS y su sincronización varían según el dispositivo, no se produce audio exportable y la boca es aproximada (abre y cierra mientras se habla). Los gestos por emoción y pose dependen de los prefabs V8.

## Licencia

El código y los dibujos *placeholder* son de este repositorio. Los assets de PUÑETOS Studio conservan su licencia original, que el script copia junto a ellos.
