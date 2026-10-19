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
