# PUÑETOS · Pack de producción de arte (temporada 1)

Este pack sirve para generar **todo el arte** con ChatGPT con la misma técnica que ya funciona con el Jefe:

- **Personajes secundarios:** 8, más el Director.
- **Escenarios:** fondos vacíos, sin personas.
- **Objetos sueltos:** se colocan y se animan en Pocket.

Cada bloque `de código` se copia tal cual en ChatGPT.

---

## 0. Cómo se monta una escena (por qué se pide así)

Una escena de Pocket tiene **capas**:

1. **Fondo** (`bg_…`): el escenario **vacío**. Lleva lo que nunca se mueve (paredes, ventanas, muebles grandes), pero **no** las cosas con las que se interactúa.
2. **Objetos de fondo:** lo que está detrás de los personajes (pantallas que se encienden, plantas que crecen, puertas).
3. **Personajes:** humanos o Puñetos, con boca sincronizada.
4. **Objetos delante** (`fg_…`): lo que tapa a los personajes, como un mostrador o el canto de una mesa. Así un personaje de pie puede estar «detrás» de un mostrador.

Por eso pedimos **los escenarios sin los objetos que importan** y **los objetos por separado sobre fondo blanco**. Así se pueden encender, mover, cambiar o hacer explotar.

**La escala es lo más importante.** Un humano de pie mide unos **900 px de los 1920** de alto, casi la mitad de la imagen. Todos los escenarios llevan esta regla, para que nadie parezca un gigante ni un enano:

> «Una puerta normal mide el 55 % del alto de la imagen. Suelo despejado en el tercio inferior.»

---

## 1. Bloque de estilo (pégalo al principio de CADA conversación nueva)

```
Vas a ser el ilustrador de la serie PUÑETOS. Respeta siempre las referencias adjuntas.

ESTILO (obligatorio): cartoon, contorno negro grueso, colores planos con sombreado suave, proporciones achaparradas y redondeadas, el mismo estilo que las referencias. Nada de texto legible, logotipos ni marcas reales. Nada parecido a personajes o lugares de películas o series conocidas.

MUNDO: un complejo tecnológico privado muy puntero (inteligencia artificial, espacio, biotecnología, robótica): campus moderno de cristal y acero blanco, plantas por todas partes. Optimista, limpio, futurista pero creíble.

FORMATOS:
- PERSONAJE (poses): fondo BLANCO liso, sin sombra, sin texto, sin números, sin cuadrícula ni marcos. Todos en UNA SOLA FILA, cuerpo entero, ocupando casi todo el alto, sin tocarse. Cada pose dos veces seguidas: boca cerrada y boca abierta hablando (solo cambia la boca). De pie: 2 poses por imagen (4 figuras). Sentado o con objeto grande: 1 pose por imagen (2 figuras).
- HOJA DE MODELO: frente, 3/4, perfil y espalda + 8 expresiones de la cara. Solo para aprobar el diseño.
- ESCENARIO: vertical 9:16, SIN personas, suelo despejado en el tercio inferior, cámara a la altura de los ojos. Escala: una puerta normal mide el 55 % del alto de la imagen.
- OBJETO: un solo objeto, centrado, fondo BLANCO liso, sin sombra.
- EDICIÓN: cuando diga «edita», mantén EXACTAMENTE composición, encuadre y tamaño; cambia solo lo que pido.

Genera UNA imagen cada vez y espera a que diga «siguiente». Dime siempre el número y el nombre.
```

---

## 2. Personajes secundarios

> **Definidos y montados:** **Neli** (bióloga genial, dulce, despistada, obsesiva e ingenua; 1,60 m provisional) y **Gala** (comercial estrella, guapísima, pelirroja, engreída, narcisista y manipuladora; 1,72 m provisional) y **Damián** (científico extraño y sombrío, CI altísimo, sin empatía; gordito, sin gafas; 1,75 m provisional). El Director ya tiene poses humanas.
>
> **`PENDIENTE` — NO generar todavía el resto.** Los secundarios se definirán con la historia de los 10 episodios. Lo de abajo es solo un borrador de ejemplo.

**Cómo se hace cada personaje:**

1. **Hoja de modelo.** La apruebas tú.
2. **Poses en parejas** de boca cerrada y abierta.
3. **Desde el Ep4, su aura,** la versión en visión Puñeta, con las mismas poses.

**Poses básicas de un secundario:** neutro, hablando, sorprendido, enfadado y caminando. Salen en 3 imágenes. Algunos tienen alguna pose extra, indicada en su ficha.

**Nombres:** son inventados, para que el guion los llame igual siempre. Cámbialos si quieres.

### 2.1 Director · Ramiro Velasco (Ep1–7, 10)
- **Rol:** director del complejo; optimismo con corbata.
- **Humano:** unos 55 años, traje gris caro, corbata roja, canas impecables, sonrisa de anuncio y reloj grande.
- **Aura:** ejecutivo de anuncio, con dientes que brillan, sonrisa enorme y un aura dorada de «éxito».
- **Poses extra:** brazos abiertos anunciando; gritando y señalando; aplaudiendo.

### 2.2 Dra. Matilde Ferrer · científica jefa de SEMILLA (biotecnología) (Ep1, 2, 5, 6)
- **Rol:** genio despistado y cariñosa. Habla con sus plantas.
- **Humano:** unos 60 años, bata blanca con manchas verdes, moño gris alborotado con dos lápices clavados, gafas en la cabeza (y otras puestas) y una maceta en la mano.
- **Aura:** sabia despistada, con el pelo electrificado, mil bolígrafos y hojitas brotándole del moño.
- **Pose extra:** abrazando una maceta.

### 2.3 Íñigo Salas · ingeniero de ÍCARO (espacio) (Ep1, 2, 6)
- **Rol:** joven, hiperactivo y entusiasta. Lo cuenta todo como una cuenta atrás.
- **Humano:** unos 28 años, chaleco técnico lleno de bolsillos, auriculares al cuello, pelo de punta y una maqueta de satélite en la mano.
- **Aura:** cohete humano, con estela de humo en los pies y ojos de cuenta atrás.
- **Pose extra:** sujetando la maqueta de ÍCARO.

### 2.4 Lucía Bermejo · neurocientífica de SINAPSIS (Ep1, 2, 6)
- **Rol:** perfeccionista, siempre entre reuniones, con todo en la tablet.
- **Humano:** unos 35 años, bata corta, coleta tirante, tablet en la mano y pinganillo en la oreja.
- **Aura:** la de las reuniones, rodeada de post-its y notificaciones flotando.
- **Pose extra:** mirando la tablet, agobiada.

### 2.5 BRUNO · robot de recepción (Ep1, 4, 10)
- **Rol:** robot amable que no deja pasar a nadie sin abrazo. Hace reverencias a los Puñetos (Ep4).
- **Diseño único:** el robot se ve igual en las dos visiones. Es redondeado, blanco con detalles cian y tiene una pantalla por cara con ojos sencillos. Brazos largos y blanditos, ruedas en vez de piernas. Nada parecido a robots de películas.
- **Poses (pareja de cara normal / cara hablando):** neutro; brazos abiertos para abrazar; abrazando (sin la otra persona); reverencia; saludando; pantalla con error (cara de rayas).

### 2.6 Victoria Lamas · inversora (Ep6)
- **Rol:** la inversora a la que hay que impresionar. Seca e impasible… hasta el final.
- **Humano:** unos 50 años, traje oscuro impecable, gafas de sol dentro del edificio y un maletín.
- **Aura:** tiburón de traje, con aleta en la espalda, sonrisa de muchos dientes y gafas de sol.
- **Pose extra:** aplaudiendo.

### 2.7 Pablo · becario del complejo (Ep1, 2, 4, 6, 10)
- **Rol:** el mensajero de todos los problemas. Entra corriendo con «otra petición». Majo y voluntarioso.
- **Humano:** unos 22 años, acreditación de «visitante», camisa demasiado grande, mochila y una torre de cafés en las manos.
- **Aura:** perrito entusiasta, con orejas de cachorro, colita y ojos brillantes. Siempre tierno, nunca humillante.
- **Pose extra:** corriendo con cafés.

### 2.8 Toni · cuñado de Barbas (Ep9)
- **Rol:** cuñado sabelotodo; le lleva la contraria en todo.
- **Humano:** unos 45 años, polo de golf metido por dentro, gafas de sol en la frente y una copa de vino.
- **Aura:** cuñado, con un megáfono saliéndole de la boca y una medalla de «experto en todo» (sin texto).
- **Pose extra:** sentado a la mesa explicando con el tenedor.

### 2.9 Manolo · camarero del bar (Ep10 y en adelante)
- **Rol:** sirve «lo de siempre» sin preguntar. Lo ve todo y no dice nada.
- **Humano:** unos 60 años, camisa blanca, chaleco negro, trapo al hombro y bigote.
- **Aura:** camarero de «lo de siempre», con bandeja flotando y un trapo con vida propia.
- **Poses extra:** sirviendo con bandeja; secando un vaso.

**Más adelante** (Ep8 y sketches sueltos): empleado de banco, amiga caótica de Sister, vecino del Jefe y vecina cotilla. Se pueden hacer con la misma ficha cuando lleguemos.

### Prompt para una hoja de modelo (cambia la descripción)
```
HOJA DE MODELO de un personaje secundario de PUÑETOS: [pega aquí la línea «Humano» de su ficha].
Personalidad: [pega el «Rol»].
Frente, 3/4, perfil y espalda, y 8 expresiones de la cara (normal, sonriente, hablando, sorprendido, enfadado, confundido, preocupado, riendo).
Mismo estilo y proporciones que los humanos de referencia.
```

### Prompt para las poses (después de aprobar la hoja)
```
Perfecto, este es el diseño oficial. Ahora las poses, con las reglas de formato de PERSONAJE.
Imagen 1: neutro + hablando con las manos.
Imagen 2: sorprendido + enfadado.
Imagen 3: caminando hacia la derecha + [pose extra de su ficha].
```

### Prompt para el aura (desde el Ep4)
```
Ahora su AURA (cómo lo ven los Puñetos): mismo personaje, mismas poses y encuadre exactos, pero convertido en la caricatura de «[pega su Aura]», con el mismo estilo de gominola que los Puñetos pero en otro color (no azul). Que se le reconozca. Empieza por neutro + hablando.
```

---

## 3. Escenarios

**Los que ya tienes:**
- oficina de 5 mesas (mañana, tarde y noche), que pasa a ser la sala de **sistemas**;
- despacho del Director;
- sala de servidores;
- bar;
- calle;
- salón y cocina, aunque estos tres últimos son del estilo antiguo y conviene rehacerlos.

### Prioridad A · Ep1–3
| # | Nombre | Descripción |
|---|---|---|
| A1 | `bg_cielo_amanecer` | Cielo al amanecer sobre tejados, degradado naranja a azul y un pequeño satélite brillando. La mitad superior libre para el título. |
| A2 | `bg_complejo_dia` | Exterior del complejo de mañana: edificio de cristal, antena parabólica y torre de lanzamiento al fondo. En la fachada, un panel digital grande, liso y oscuro (para la hora). |
| A3 | `bg_complejo_noche` | EDITA A2: de noche, con todas las ventanas apagadas menos una, de luz azulada. |
| A4 | `bg_complejo_apagado` | EDITA A2: de mañana, con el edificio entero sin luz. |
| A5 | `bg_recepcion` | Vestíbulo del complejo: suelo brillante, mostrador curvo blanco a la izquierda, tornos de acceso, plantas grandes y un ventanal. **Sin el robot.** |
| A6 | `bg_pasillo_labs` | Pasillo con puertas de cristal de laboratorios a ambos lados (vacíos por dentro) y luces en el techo. Al fondo, una puerta de baño. |
| A7 | `bg_oficina_oscuras` | EDITA la oficina de 5 mesas: a oscuras, con los monitores apagados. |
| A8 | `bg_sala_anastasia` | EDITA la sala de servidores: un núcleo cilíndrico de cristal en el centro (Anastas-IA), **apagado**. |
| A9 | `bg_sala_anastasia_on` | EDITA A8: el núcleo **encendido**, en azul cian. |
| A10 | `bg_sala_anastasia_noche` | EDITA A8: de noche, con solo la luz de emergencia y unas pantallas. |
| A11 | `bg_lab_semilla` | Laboratorio de biotecnología tipo invernadero: mesas con macetas, tubos de ensayo verdes, luces de cultivo moradas y cristaleras. |

### Prioridad B · Ep4–7
| # | Nombre | Descripción |
|---|---|---|
| B1 | `bg_lab_semilla_invadido` | EDITA A11: plantas gigantes que lo invaden todo (lianas por el techo, hojas enormes). |
| B2 | `bg_auditorio` | Auditorio moderno: escenario con atril, pantalla gigante en blanco y butacas vistas desde el lateral del escenario. |
| B3 | `bg_cabina_tecnica` | Cabina técnica del auditorio: mesa de mezclas, monitores y un cristal con vista al escenario. |
| B4 | `bg_cafeteria` | Cafetería del complejo: barra, máquina de café futurista y mesas altas. |

### Prioridad C · Ep8–10 (fuera del trabajo)
| # | Nombre | Descripción |
|---|---|---|
| C1 | `bg_banco` | Oficina bancaria con ventanilla (mostrador a media altura), mampara y cola marcada en el suelo. |
| C2 | `bg_casa_caos` | Salón desordenadísimo: ropa, cajas, platos y cojines por todas partes. |
| C3 | `bg_casa_orden` | EDITA C2: exactamente el mismo salón, perfectamente ordenado. |
| C4 | `bg_comedor_familia` | Comedor familiar con mesa larga puesta para comida de domingo, vista desde un lado. |
| C5 | `bg_cruce` | Cruce de calles con semáforo, pasos de cebra y coches parados al fondo. |
| C6 | `bg_rellano` | Rellano de edificio de viviendas con dos puertas y el ascensor. |
| C7 | `bg_bar_nuevo` | Bar de barrio: barra de madera, tapas, tele en la pared (apagada) y taburetes. |
| C8 | `bg_calle_noche` | Calle con farolas y el complejo a lo lejos, de noche. |

**Prompt de escenario:**
```
ESCENARIO [número] · [nombre]: [descripción de la tabla].
Recuerda: vertical 9:16, sin personas, suelo despejado en el tercio inferior, una puerta normal mide el 55 % del alto de la imagen, sin texto legible.
```

---

## 4. Objetos (fondo blanco, uno por imagen)

**Del complejo:**

| Nombre | Descripción |
|---|---|
| `prop_casco_sinapsis` | Casco blanco y redondeado de interfaz cerebral, con luces azules y un cable grueso. |
| `prop_vitrina` | Vitrina de cristal con pedestal (vacía, para meter el casco). |
| `prop_bateria_icaro` | Batería cilíndrica futurista con franjas de energía naranjas. |
| `prop_maqueta_icaro` | Maqueta de minisatélite con paneles solares. |
| `prop_planta_semilla` | Planta experimental en maceta de laboratorio, con hojas raras y bonitas. |
| `prop_planta_gigante` | La misma planta, enorme y con lianas. |
| `prop_cables_lio` | Maraña de cables de colores. |
| `prop_cables_orden` | Los mismos cables, perfectamente ordenados y atados. |
| `prop_monitor_on` | Monitor de pie con la pantalla encendida (gráficos sin texto). |
| `prop_monitor_off` | El mismo monitor, apagado. |
| `prop_puerta_lab` | Puerta de cristal de laboratorio, cerrada. |
| `prop_puerta_lab_abierta` | La misma puerta, abierta. |
| `prop_anastasia` | Esfera flotante de luz cian con cara sencilla (Anastas-IA en visión Puñeta). |

**Cotidianos:**

| Nombre | Descripción |
|---|---|
| `prop_cafe_torre` | Torre de 6 vasos de café para llevar. |
| `prop_tablet` | Tablet. |
| `prop_movil_linterna` | Mano con el móvil y la linterna encendida. |
| `prop_postit` | Pósit amarillo en blanco. |
| `prop_taza` | Taza blanca humeante. |
| `prop_bocadillo` | Bocadillo envuelto en papel de aluminio. |
| `prop_platito` | Platito de tapa vacío. |
| `prop_platito_quemado` | El mismo platito, chamuscado. |
| `prop_cana` | Caña de cerveza. |
| `prop_croqueta` | Una croqueta en un platito. |

**Primer plano** (`fg_`; tapan a los personajes, con fondo blanco):

| Nombre | Descripción |
|---|---|
| `fg_mostrador_recepcion` | La parte delantera del mostrador de A5, vista de frente. |
| `fg_ventanilla_banco` | El mostrador de la ventanilla de C1, visto de frente. |
| `fg_barra_bar` | La barra del bar, vista de frente. |
| `fg_atril` | El atril del auditorio. |

---

## 5. Orden de trabajo recomendado

Para tener los Ep1–2 cuanto antes:

1. **Humanos:** Usu, Sister, Barbas y Reynaldo (el Jefe ya está). Además, el **Director**.
2. **Escenarios A1–A11.**
3. **Secundarios del Ep1–2:** Matilde, Íñigo, Lucía, BRUNO y Pablo.
4. **Objetos del complejo.**
5. **Después:** prioridad B, Victoria, los Puñetos nuevos y las auras.

## 6. Cómo enviármelo
Un ZIP por tanda, con una carpeta por personaje o por grupo. Por ejemplo:

```
tanda1.zip
├── usu/          neutro+explica.png, confundido+panico.png, sentado_habla.png …
├── director/     neutro+explica.png …
├── escenarios/   bg_recepcion.png, bg_pasillo_labs.png …
└── objetos/      prop_casco_sinapsis.png, fg_mostrador_recepcion.png …
```

**Nombres de archivo:**
- **Objetos y escenarios:** con su nombre de la lista.
- **Poses:** con los nombres de las poses en orden, de izquierda a derecha.

**Si pesa mucho, divídelo:** un ZIP por carpeta.
