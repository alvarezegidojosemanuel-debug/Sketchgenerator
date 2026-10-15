# PUÑETOS Pocket

Web móvil (Next.js + TypeScript) que convierte una idea cómica en un sketch **editable y reproducible** de PUÑETOS.
Funciona de principio a fin **sin claves ni gasto en tokens**: genera un prompt, lo pegas en ChatGPT (u otro modelo), pegas el JSON de vuelta y lo ves y editas en el móvil.

Usa los **assets reales de PUÑETOS STUDIO V8** (5 personajes × 10 poses, 23 ojos, 57 cejas, 50 bocas), importados desde `config/library_index.json` sin redibujar nada. Ver [Assets V8](#assets-v8) y `docs/V8_INVENTORY.md`.

> ⚠️ **Caras sin calibrar todavía.** El ZIP V8 no trae calibraciones ni prefabs (lo dice su `LEEME_ASSETS.txt`). Pocket **estima** la posición de ojos, cejas y boca en cada pose y crea **expresiones en borrador**, y la app lo marca como «estimada» / «borrador». Hay que revisarlo y guardarlo en la pantalla **Caras**. Los fondos y objetos siguen siendo provisionales, porque V8 no incluye escenarios ni props.

## Arranque

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 58 pruebas (Vitest)
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
5. **Caras**: elige personaje y pose y verás todas sus expresiones. En cada hueco (ojo izq./der., ceja izq./der., boca) puedes:
   - cambiar la pieza; las piezas dobles se recortan por mitades y las simples se reflejan para el otro lado;
   - moverla con la cruceta o arrastrando, escalarla y girarla;
   - ajustar **solo esa expresión en esa pose** (personaje + emoción + pose) o **calibrar la pose** para todas las expresiones;
   - elegir las bocas del lip-sync y probarlas con «Probar boca hablando»;
   - crear expresiones nuevas.

   Todo se guarda en el navegador y se puede exportar o importar como `pocket-face-overrides.json`. Ese archivo se puede copiar a `src/data/face-overrides.json` para que lo use todo el mundo.
6. **Proyectos**: se autoguarda en IndexedDB. Desde aquí puedes cargar, borrar, exportar e importar JSON Pocket, exportar a `punetos_project` v3 (con informe de pérdidas) y abrir las demos (Usu + Reynaldo, Usu + Jefe).

> Si borras los datos del navegador, pierdes los borradores. Exporta el JSON para guardar una copia.

## Tu primer sketch desde el móvil

1. Abre la URL de Vercel en el móvil. Si quieres, añádela a la pantalla de inicio.
2. **Idea**: escribe o dicta la idea, elige 30 s, marca Usu y Reynaldo y elige el tono.
3. **Generar** → **📋 Copiar prompt** → pégalo en ChatGPT.
4. Copia el JSON que devuelve → vuelve a Pocket → **Pegar** (o pega en el cuadro y pulsa **Validar**) → **Abrir en previsualización**.
5. **Ver** → ▶. Si algo no te convence, **Editar** (texto, pose, expresión, posición) o **Caras** (ajustar una cara en esa pose).
6. Se guarda solo. En **Proyectos** puedes exportar el JSON como copia.

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
  renderer/       capas (fondo, props-back, actores, props-front) y cara por slots (face.ts)
  face/           guardar/validar calibraciones y prefabs de expresión
  tts/            Web Speech (voces y dictado)
  adapters/       pocketToV3() / v3ToPocket() con informe de pérdidas
  server/         lógica de /api/generate (OpenRouter free-only)
  storage/        IndexedDB
src/components/   UI móvil (5 pantallas)
schema/pocket.schema.json   generado desde Zod (`npm run gen:schema`)
catalog.json                catálogo actual (copia de src/data/catalog.json)
examples/sketch-usu-reynaldo.json  demo de 30 s Usu + Reynaldo (expresiones, voces, ojos, boca, movimiento)
examples/sketch-demo.json   demo de 30 s Usu + Jefe
scripts/v8/import_v8.py     importador de assets V8 → catálogo (Python + Pillow, solo desarrollo)
src/data/face-overrides.json calibraciones/prefabs revisados versionados (vacío de momento)
```

## Voces ElevenLabs (máxima calidad)

En **Ver → Voces: ElevenLabs**:
- **Reparto:** introduces tu código de acceso y Pocket lista las voces de tu cuenta, con muestras gratis. Cada personaje recibe una voz distinta, con ajustes de estabilidad, estilo, parecido y velocidad (se guarda en `metadata.elevenVoices`).
- **Modelos:** Multilingual v2 (natural), v3 (más expresiva; entiende acotaciones como `[laughs]` o `[sighs]`, que ChatGPT puede escribir y que se quitan de los subtítulos) o Flash v2.5 (gasta la mitad).
- **Coste:** cada frase se genera **una vez** y se guarda en el dispositivo, así que repetir o editar otras frases no gasta créditos.
- **Seguridad:** la clave solo vive en el servidor (`/api/voice/tts`, `/api/voice/voices`), protegido por `POCKET_ACCESS_CODE`, con tope diario y por IP. Pon también un límite de créditos a la propia clave en ElevenLabs.

Variables en Vercel: `ELEVENLABS_API_KEY`, `POCKET_ACCESS_CODE` y, opcionalmente, `ELEVENLABS_DAILY_CHARS`.

## Voces (Piper, gratis, en el dispositivo)

En **Ver → Voces: Alta calidad (Piper)** la app genera voces neuronales en el propio navegador, sin claves ni servidor:

- **Descarga:** cada voz se baja una vez de HuggingFace (25–110 MB) y queda en la caché del navegador. Cada frase generada se guarda en IndexedDB, así que repetir o editar no vuelve a sintetizar.
- **Reparto de voces** (por proyecto, en `metadata.voices`): voz, hablante, tono y velocidad para cada personaje. El tono se cambia sin alterar la velocidad.
- **Boca:** sigue el volumen real de la onda de voz, con bocas más abiertas cuanto más alto suena.
- **Tiempos:** la escena espera a que termine cada frase. **⏱ Ajustar diálogos a las voces** pone a cada bloque la duración exacta de su audio y desplaza lo que viene detrás.
- **Piezas externas:** onnxruntime-web y el fonemizador (espeak-ng en WASM, `@diffusionstudio/piper-wasm`) se cargan desde jsDelivr.

Licencias, comprobadas en el MODEL_CARD de cada voz (`rhasspy/piper-voices` v1.0.0). Todas permiten uso comercial:

| Voz | Acento | Licencia |
|---|---|---|
| davefx | España | CC0 |
| carlfm | España | Dominio público |
| ald | México | Unlicense |
| claude | México | Apache 2.0 |
| sharvard (hombre/mujer) | España | CC BY 3.0 — **citar** |
| mls_10246 / mls_9972 | España | CC BY 4.0 — **citar** |
| daniela | Argentina | CC BY-SA 4.0 — **citar** |

La pantalla Ver muestra el texto de crédito que hay que poner en la publicación cuando el reparto usa una voz con atribución. El fonemizador espeak-ng es GPL-3.0: se carga como programa aparte y no afecta al audio que generas.

## Objetos, escenarios, sonidos e interacciones

- **Recursos → Objetos / Escenarios / Sonidos**: escribe qué necesitas, copia el *prompt de imagen* y pégalo en ChatGPT junto con la *imagen de referencia* (para que copie el estilo). Descarga el PNG y súbelo eligiendo su tamaño (diminuto, pequeño, mediano, grande, enorme). El fondo blanco se puede quitar automáticamente. Los escenarios se ajustan a 1080×1920.
- Sonidos integrados gratis (sintetizados): `sfx_telefono`, `sfx_alarma`, `sfx_pop`, `sfx_whoosh`, `sfx_ding`, `sfx_boing`, `sfx_golpe`, `sfx_fracaso`. Puedes generar más con ElevenLabs (la clave necesita el permiso «Efectos de sonido»; cada sonido cuenta 200 caracteres del tope diario) o subir tus MP3.
- La biblioteca vive en el dispositivo (IndexedDB). «Exportar paquete de recursos» la pasa a otro móvil u ordenador.
- Interacciones en el JSON / editor:
  - `props`: `enter`/`exit` (`pop`, `fade`, `slide`), `loop` (`shake`, `pulse`, `blink`, `float`, `spin`), `toX`/`toY` (movimiento), `rot`, `flip`, `bubbleOf` (dentro de un bocadillo de pensamiento sobre un actor).
  - `sfx`: `soundId`, `volume`.
  - `screen`: `flash` (con `color`), `shake`, `darken`.
  - `body.fx`: `jump`, `shake`.
- Si ChatGPT echa en falta un recurso, lo pone en `metadata.wishlist` y aparece en Recursos como «Este sketch pediría…».
- Demo: Proyectos → «Demo: interacciones».
- **Narrador (voz en off):** un diálogo sin personaje («🎙️ Narrador» en el editor, o sin `actorUid` en el JSON). Tiene su propia voz en el reparto.
- **Entrar / salir de escena:** marca el personaje como «Empieza fuera de escena» (`hidden: true`) y hazlo entrar con un evento de cuerpo `appear` (`fade`, `pop`, `flash`, `cut`); `disappear` lo hace salir.
- **Escritorio:** en Editar → personaje → «🪑 Sentar en escritorio» coloca el escritorio delante, a su escala (tapa de la cintura para abajo; cara y boca siguen a la vista). «⌨️ Teclear aquí» añade el gesto `fx: "type"` + `sfx_teclado`.
- **Pantallazo azul:** `screen` con `effect: "bluescreen"` y `text`. Sonido `sfx_pantallazo`.
- **✨ Transformar (en el editor de un objeto):** elige en qué se convierte y se crea el pantallazo, el sonido y el cambio con destello en el mismo sitio y a la misma escala, en el instante del cursor.
- **Transformación humano → puñeto:** imagen del humano como objeto en la posición del actor con `exit: "fade"`, pantallazo + sonido y el actor entrando con `appear: "flash"`. Demo: «El Pantallazo Cero».

## Contrato JSON `pocket-1` (formato definitivo del generador)

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

## Assets V8

```bash
unzip PUNETOS_ASSETS_V8_PARTE_1_DE_2.zip -d v8-source   # v8-source/ está en .gitignore
unzip PUNETOS_ASSETS_V8_PARTE_2_DE_2.zip -d v8-source
pip install pillow
npm run catalog:v8 -- v8-source
```

Qué hace el importador:
- Copia solo los PNG referenciados por `library_index.json` a `public/assets/v8/`, con sus rutas originales.
- Analiza cada pieza: tamaño original frente a normalizado, ancla (centro, mitad izquierda o derecha, labio superior de la boca) y si es simple o doble.
- Estima un *rig* facial por pose a partir del dibujo:
  - **Usu y Jefe**: gafas de sol. No tienen piezas de ojos.
  - **Reynaldo**: cristales de las gafas; sus ojos se recortan al interior de cada cristal.
  - **Sister**: óvalo de la cara.
  - **Barbas**: contorno de la barba; su boca se recorta a la barba.
- Crea 6 expresiones borrador por personaje: neutral, alegría, risa, enfado, sorpresa y tristeza.
- Escribe `docs/V8_INVENTORY.md`.

**Modelo facial** (`expresión efectiva = personaje + emoción + pose`):
- Cada pose tiene un rig: posición y escala de cada hueco.
- Cada expresión indica qué pieza va en cada hueco y puede tener ajustes propios por pose (`poseOverrides`).
- Las piezas solo se trasladan, se escalan de forma uniforme, se giran o se reflejan. Nunca se deforman.
- Al hablar, todas las bocas comparten el ancla del labio superior y la escala del dibujo original, así que no saltan de sitio. Hay tests que lo comprueban para todas las combinaciones.

**Validación hecha:** revisé visualmente las 50 poses × 5 personajes y el lip-sync en pose frontal y 3/4. **Revisar a mano en «Caras»:**
- `char.reynaldo.pose_reaction`: la mano tapa las gafas y los cristales se midieron a mano.
- Cejas en las poses 3/4 de Usu y Jefe.
- Cualquier expresión que se vaya a usar en serio. Al guardarla pasa a «calibrada» / «revisada».

## Adaptador `punetos_project` (v3)

V8 sigue usando `"version": 3, "type": "punetos_project"` en su `templates/TIMELINE_SCHEMA_EXAMPLE.json`; el test importa **ese archivo real** (`tests/fixtures/v8-timeline-schema-example.json`) con IDs reales (`char.usu.pose_walk_small_right`, `expression.usu.sorpresa`). `src/lib/adapters/v3.ts` sigue la forma de ese archivo: `version: 3`, `type: "punetos_project"`, tomas con `scene` y `timeline.events`, y eventos `body` (`asset_id`, `body_mode`, `from_*`, `target_*`), `face` (`asset_id`) y `mouth` (`asset_id: "__auto__"`).

Hay un informe de pérdidas: ojos, objetos, ajustes de voz, flip, escala en body y boca calibrada no se exportan. También informa de los supuestos: la forma de `scene.layers` y los valores de `body_mode` son **suposiciones** pendientes de verificar.

No hay round-trip perfecto, y la forma de `scene.layers` sigue sin documentar en el ZIP.

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
| 1. Inventario de assets + web básica con reproducción | ✅ V8 real (`docs/V8_INVENTORY.md`) |
| 2. Editor móvil, import/export con validación y tests | ✅ |
| 3. Prompt + bucle ChatGPT → JSON → Pocket | ✅ (IDs V8 reales en el prompt) |
| 4. OpenRouter opt-in free-only con límites | ✅ (contadores en memoria) |
| 5. Assets V8, expresiones por pose y calibración | ✅ assets, editor de caras y guardado; ⚠️ rigs **estimados** y prefabs **borrador** hasta revisarlos. No hay código V8: los gestos de manos por emoción no existen como assets |
| 6. Conector ChatGPT / MCP | ❌ pendiente |
| 7. PWA, CI y Vercel | ✅ CI + instrucciones Vercel; ❌ PWA |

Pruebas mínimas de la especificación:
1. Sketches de 30 s sin clave (Usu + Jefe y Usu + Reynaldo): `tests/playback.test.ts`, `catalog-v8.test.ts`.
2. Exportar e importar conservando diálogos y posiciones: `import-export.test.ts`.
3. JSON inválido con error útil: `schema.test.ts`.
4. ID inexistente rechazado: `schema.test.ts`.
5. API sin clave no llama a la red: `api.test.ts`.
6. Límite gratuito sin modelo de pago: `api.test.ts`.
7. Uso en móvil: revisado con un viewport Pixel 7 (Playwright, sin scroll horizontal). **Falta probarlo en Android e iPhone reales.**

Otras limitaciones: las voces TTS y su sincronización varían según el dispositivo y no se produce audio exportable. El lip-sync es aproximado: alterna las bocas de la expresión unas 4 veces por segundo y no sigue los fonemas.

## Licencia

El código y los fondos y objetos *placeholder* son de este repositorio. Los assets de PUÑETOS STUDIO V8 (`public/assets/v8/`) pertenecen a sus autores y se incluyen con su nota original (`LEEME_ASSETS.txt`).
