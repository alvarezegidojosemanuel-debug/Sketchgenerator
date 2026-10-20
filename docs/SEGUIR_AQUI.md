# Seguir aquí (traspaso de sesión)

Rama: `claude/new-session-w14x31` · todo subido · 155 tests verdes (`npx vitest run`, `npx tsc --noEmit`, `npm run build`).
Commits: terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01JMuA9ngbhrTgayxwJt3uwf`. No crear PR salvo que lo pidan. Responder en español.
**Subir SIEMPRE también a la rama principal `claude/new-session-w14x31`** (de ahí publica Vercel la app del usuario; lo pidió él): tras cada push a la rama de la sesión, `git push origin HEAD:claude/new-session-w14x31` (avance rápido, sin forzar).

## Hecho en esta sesión
- **Editor de guion** (pestaña ✎ Guion, `src/components/screens/GuionScreen.tsx`): escenas/pasos a la izquierda, vista previa en el centro, propiedades a la derecha; «▶ Ver desde aquí» (`playFrom` en usePocket → PreviewScreen hace seek). El guion se guarda en `project.metadata.script`; `compileScript` devuelve `marks` (segundo de cada paso).
- **Columnas por personaje** (formato: `escena.acciones: [{quien, desde, hasta, gesto?, animacion?, x?, y?, modo: anda|desliza|aparece, acaba?}]`, `applyActions` en `src/lib/script/compile.ts`). En una frase, `"columna": true` = manda la columna sobre el gesto de hablar. Destino arrastrando al personaje en la vista previa. Las acciones siguen a sus pasos al insertar/borrar/mover.
- **Pestaña 🎞 Animación** (`AnimScreen.tsx`, `src/lib/animation/animations.ts`): animaciones por personaje (poses + duración, bucle/una vez, movimiento). Comunes en `src/data/animations.json`; locales en localStorage; al usarlas se copian dentro del guion (`guion.animaciones`). Al ir «andando» sin animación elegida usa la animación «andar» del personaje si existe. Fotogramas = eventos body con `ease: "instant"` (cambio seco).
- **Categorías de poses** (`src/lib/catalog/poseCategories.ts`, editables en Recursos, cambios locales + «copiar para Claude» → `src/data/pose-categories.json`).
- **Recursos**: seleccionar y descargar (.zip, `src/lib/export/zip.ts`); **👄 Dar boca** a poses (`MouthEditor.tsx`, guardadas como LibraryItem kind "talk"; descargar .zip para fijarlas en el repo).
- El gesto elegido a mano se respeta aunque la pose no tenga boca (👄 marca las que sí).
- **Andar de verdad**: poses `pose_p_anda1..4` + animación «andar» para **Usu, Reynaldo, Sister, Barbas, Jefe** (Barbas también `anda_contento1..4` / «andar contento», ya con la cintura retocada por el usuario).

## Cómo se hacen los «andar» (lo que funcionó)
ChatGPT NO sabe hacer ciclos de andar (no alterna piernas). Solución: **piernas de Usu reutilizadas** (dibujadas/retocadas a mano por el usuario).
1. El usuario pasa una imagen del personaje caminando de perfil (vale una tira de ChatGPT; solo se usa el cuerpo de la 1.ª figura).
2. `python3 tools/andar/cutwhite.py <imagen> /tmp/x/f` → recorta figuras (fondo blanco).
3. `python3 tools/andar/transplant.py /tmp/x/f1.png /tmp/x/t` (desde la raíz del repo) → `t1..t4.png` + `t_sheet.png`: cuerpo arriba de la cadera + piernas de Usu escaladas por altura total (protege bolso/mochila del fundido).
4. `python3 tools/andar/gif.py /tmp/x/t /tmp/x/prueba.gif` y se le manda al usuario la tira y el GIF. Él suele retocar la cintura a mano y devuelve la tira (fondo beige).
5. Limpieza de la tira retocada: `tools/andar/fix.py` (editar rutas y las cajas `fix(x0,y0,x1,y1)` de la cintura; evitar bolso/mochila; si deja contornos dentados, usar la tira tal cual). Recortar con `tools/andar/cut.py <png> <salida>` (4 figuras, fondo beige).
6. Instalar: `python3 tools/andar/install_walk.py <id> <prefijo_png> [clave] [nombre]` (escribe webp en `public/assets/punetos/punetos/<id>/`, poses en `catalog.json` y `src/data/catalog.json` con indent=1, animación en `src/data/animations.json`). Si el personaje no tiene `pose_p_camina` se mide con `pose_p_neutro` → multiplicar displayScale por **0.894** (lo que encoge al andar).
7. Boca para hablar andando: `python3 tools/andar/boca.py <id> <clave> <x> <y> <ancho> [giro] [sonrisa|ovalo]` (centro y ancho de la sonrisa en el paso 1; probar antes con un 8.º argumento = carpeta de salida). Dibuja `<clave>N_boca.webp` y pone `talkSrc`. Si todas las poses de una animación tienen boca, el personaje habla sin dejar de andar (`talksMoving` en compile.ts).
8. Tests, commit y push.

## Pendiente
- Pasar los capítulos ya hechos a columnas (gestos/entra/sale/teclea/huye → `acciones`).
- Rehacer «¿Está en vigor?» sentados a la mesa (espera arte de cafetería: poses sentados, mesa, fondo con vida).
- «Emoción» del editor: no hace nada con poses de Puñeto (dibujos enteros). Propuesto: que cambie tono de voz + icono de cómic, o quitarla. Sin respuesta.
- Orden de pestañas (ya son 8; el usuario dijo «te lo cuento yo»).
- Dar boca: bocas hechas en un dispositivo se pasan al repo con el .zip.
- Ideas aparcadas: sincronizar proyectos en la nube para Sister; código muerto de vista de espaldas en compile.ts; la exportación V3 pierde sfx/screen/camera.

## Herramientas útiles
- Servidor de pruebas: `npm run build` y `npx next start -p 3123`; capturas con playwright-core (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

## Añadido desde la otra sesión (19-oct)
- **Escenario grande (siguiente tarea propuesta):** fondo panorámico más ancho que la pantalla (p. ej. 3240×1920 con zonas: entrada, puestos, cafetería, despacho) por el que se mueven los personajes. Diseño: `background.worldWidth`; x de 0 a worldWidth; cámara con ventana de 1080 que sigue a un personaje (`camara: "sigue", quien`) o hace travelling; el editor muestra el panorama entero en pequeño para arrastrar; renderizador y exportador desplazan el fondo según la cámara. Arte: ChatGPT da ~1536×1024 → ampliar por los lados (outpainting) o unir 2-3 imágenes.
- Sketch de prueba **«El último café»** (`src/data/sketch-02-ultimo-cafe.json`, botón en Proyectos, test `tests/sketch-cafe.test.ts`): andar en paralelo, columna de brazos cruzados, off, coro, entra el Jefe andando, primer plano, logo. Mejorable: la taza flota en el suelo y están apretados.

## Petición del usuario (19-oct): más cinematográfico, «2,5D»
Quiere que se muevan por la escena en profundidad (arriba/abajo, en diagonal), más dinamismo y otros personajes moviéndose detrás. Plan propuesto (pendiente de empezar):
1. **Perspectiva automática**: cada fondo con línea de suelo/horizonte (`floorTop`, `floorBottom`); la escala del personaje depende de su y (más arriba = más lejos = más pequeño) y el orden de capas también (más abajo = delante). Así andar en diagonal ya «se aleja/acerca».
2. **Acciones con destino x,y** (ya existe) usando esa escala; arrastrar en la vista previa también hacia arriba/abajo.
3. **Andar hacia el fondo / hacia cámara**: necesita poses de espaldas y de frente andando (arte nuevo; mismo truco de piernas de Usu si sirve).
4. **Vida de fondo**: extras o Puñetos cruzando por detrás en bucle mientras hablan (acciones en columnas de personajes «de fondo»).
5. **Cámara**: seguir a un personaje, travelling, zoom lento (ken burns), cortes de plano; capas delante (primer término) con parallax.
6. **Escenario grande** (ver arriba).
7. **Gestos mal clasificados**: revisar las categorías mirando cada pose (Claude puede ver las imágenes y proponer categorías por personaje).
- **Decisión del usuario:** la vida de fondo = personajes con **animaciones fijas en bucle** (ciclos largos hechos con el animador), sin más complicación. Ideas: ciclos con «esperas» (pose A 3 s, B 0,4 s, A 2 s…), desfase para que dos extras no vayan sincronizados, movimiento de la app (respirar, bote, teclear) cuando no hay arte. Arte de ciclos: pedir a ChatGPT **editar** la misma imagen cambiando solo una parte (brazo arriba/abajo, taza), no generar de cero.

## Arte pedido para la gran escena de la cafetería (19-oct)
Orden: 1A fondo panorámico vacío (entrada, mesas, barra, sofás; suelo despejado abajo; ampliar por los lados si sale estrecho) · 1B primer término (planta + canto de mesa) · 2 hoja de objetos (mesa redonda, silla de lado, taza, vaso para llevar, cruasán, bandeja, jarra, servilletero) · 3 cada Puñeto sentado de perfil en silla (habla, bebe, aburrido) · 4 extras con ciclos por edición (camarero secando taza, clienta con móvil, cliente con portátil, pareja en sofá). Todo en el estilo de bg_cafeteria, fondo blanco, sin sombra, separados.

## Arte recibido de la cafetería (sesión 1 de ChatGPT, 20-oct)
- Fondos panorámicos (2000×667, 3:1) guardados en `public/assets/punetos/backgrounds/panoramicas/cafeteria_pano_a.webp` (mesas más cerca) y `cafeteria_pano_b.webp` (más suelo libre, recomendado). **No están en el catálogo** porque la app aún no sabe mostrar fondos más anchos que la pantalla: es el primer paso del «escenario grande» (cámara que recorre el panorama; ojo, 667 px de alto es poco para 1920: habrá que escalar ~2,9× o pedir más resolución/ampliar por arriba y abajo).
- Objetos ya instalados (catálogo): prop_mesa_redonda, prop_silla_cafeteria, prop_taza_cafe, prop_vaso_cafe, prop_cruasan, prop_bandeja, prop_jarrita_leche, prop_servilletero, prop_primer_planta y prop_primer_mesa (primer término, para delante de los personajes).
- Falta la sesión 2 (Puñetos sentados y extras con ciclos).
- Poses sentados con café instaladas (pose_p_cafe_habla / cafe_bebe / cafe_aburrido) para los 5; Sister sale con pelo y bolso más oscuros que en su diseño.
- Extras instalados como objetos: prop_extra_camarero, prop_extra_clienta_movil, prop_extra_cliente_portatil, prop_extra_pareja_sofa (pose base; faltan sus ciclos por edición). Recorte con tools/andar/cut_extras.py (conserva blancos interiores: ojos, tazas); re-recortados con él todos los packs sentado/comer.
- 12 extras más (prop_extra_movil_1..3, prop_extra_portatil_1..3, prop_extra_sofa_1..6); cut_extras.py admite --rejilla (ordena por filas).
