"""Genera los 5 episodios iniciales (src/data/ep1..ep5.json) a partir de un guion sencillo.

Ejecutar desde la raíz del repo:  python3 -I scripts/gen_episodios.py
Los episodios se pueden retocar luego en Pocket (Editar) o cambiando este guion.
"""
import json
import re

# ---------------------------------------------------------------- humanos de espaldas (oficina)
CHAIR = {'barbas_espaldas_habla': (-2, 490), 'barbas_espaldas_teclea': (-6, 520), 'jefe_espaldas_senala': (35, 500), 'jefe_espaldas_teclea': (18, 520),
         'reynaldo_espaldas_hombros': (24, 459), 'reynaldo_espaldas_teclea': (-4, 437), 'sister_espaldas_explica': (-6, 475), 'sister_espaldas_senala': (-16, 400),
         'sister_espaldas_teclea': (14, 401), 'usu_espaldas_habla': (-15, 450), 'usu_espaldas_teclea': (-11, 471)}
SEAT = {'sister': (102, 975, 0.312), 'reynaldo': (427, 1028, 0.319), 'barbas': (782, 1090, 0.331), 'jefe': (83, 1622, 0.775), 'usu': (575, 1848, 0.875)}
SEAT_Z = {'sister': 1, 'reynaldo': 2, 'barbas': 3, 'jefe': 4, 'usu': 5}
# postura que usa cada uno cuando habla de espaldas
TALK = {'sister': 'explica', 'reynaldo': 'hombros', 'barbas': 'habla', 'jefe': 'senala', 'usu': 'habla'}

# ---------------------------------------------------------------- puñetos de frente
CHARS = {'usu': 'usu', 'rey': 'reynaldo', 'sis': 'sister', 'bar': 'barbas', 'jefe': 'jefe'}
NAME2UID = {'usu': 'usu', 'reynaldo': 'rey', 'sister': 'sis', 'barbas': 'bar', 'jefe': 'jefe'}
GROUP = {  # (x, y, escala, z, pose inicial)
    'rey': (310, 1650, 0.68, 1, 'neutral_3q_right'), 'sis': (770, 1650, 0.68, 1, 'neutral_3q_left'),
    'jefe': (180, 1810, 0.78, 2, 'neutral_3q_right'), 'usu': (540, 1810, 0.78, 3, 'neutral_front'), 'bar': (900, 1810, 0.78, 2, 'neutral_3q_left'),
}


def est(text):
    words = len(re.sub(r'\[[^\]]*\]', '', text).split())
    return round(max(1.2, words * 0.36 + 0.6), 1)


class Take:
    def __init__(self, tid, name, bg, punetos=(), solo=None, back=False):
        self.id, self.name, self.bg = tid, name, bg
        self.t = 0.3
        self.ev = []
        self.n = 0
        self.actors = []
        self.back = back
        self.back_beats = []  # (quien, desde, hasta, variante)
        if solo:
            uid, x, y, s, pose = solo
            self._actor(uid, x, y, s, 2, pose)
        for uid in punetos:
            x, y, s, z, pose = GROUP[uid]
            self._actor(uid, x, y, s, z, pose)

    def _actor(self, uid, x, y, s, z, pose):
        cid = CHARS[uid]
        self.actors.append(dict(uid=uid, characterId=cid, poseId=f'char.{cid}.pose_{pose}', x=x, y=y, scale=s, zIndex=z, expressionId=f'expression.{cid}.neutral'))

    def _id(self, p):
        self.n += 1
        return f'{self.id}_{p}{self.n}'

    def add(self, track, dur, start=None, **k):
        e = dict(id=self._id(track[:2]), track=track, start=round(self.t if start is None else start, 2), duration=round(dur, 2), **k)
        self.ev.append(e)
        return e

    def wait(self, s):
        self.t += s

    def say(self, who, text, expr=None, pose=None, gap=0.35):
        """who: uid de puñeto | 'narr' | ('off', 'Director') | nombre de humano de espaldas ('usu', 'sister'…)."""
        d = est(text)
        if expr and who in CHARS:
            self.face(who, expr)
        if pose and who in CHARS:
            self.pose(who, pose)
        if who == 'narr':
            self.add('dialogue', d, text=text)
        elif isinstance(who, tuple):
            self.add('dialogue', d, text=text, speakerName=who[1])
        elif self.back and who in SEAT:
            self.add('dialogue', d, text=text, voiceOf=who)
            self.back_beats.append((who, self.t - 0.1, self.t + d + 0.1, TALK[who]))
        else:
            self.add('dialogue', d, actorUid=who, text=text)
        self.t += d + gap

    def face(self, uid, emo, start=None):
        self.add('face', 0.3, start, actorUid=uid, expressionId=f'expression.{CHARS[uid]}.{emo}')

    def pose(self, uid, pose, start=None):
        self.add('body', 0.3, start, actorUid=uid, poseId=f'char.{CHARS[uid]}.pose_{pose}')

    def fx(self, uid, fx, dur=0.6):
        self.add('body', dur, actorUid=uid, fx=fx)

    def sfx(self, sid, dur=None, vol=None):
        k = dict(soundId=sid)
        if vol is not None:
            k['volume'] = vol
        self.add('sfx', dur or 1.0, **k)

    def screen(self, effect, dur, **k):
        self.add('screen', dur, effect=effect, **k)

    def build(self, tail=1.2):
        dur = round(self.t + tail, 1)
        ev = list(self.ev)
        for a in self.actors:
            ev.append(dict(id=self._id('mo'), track='mouth', start=0, duration=dur, actorUid=a['uid'], mode='auto'))
        if self.back:
            ev += self._back_props(dur)
        for e in ev:  # nada se sale de la toma
            if e['start'] + e['duration'] > dur:
                e['duration'] = round(max(0.1, dur - e['start']), 2)
        return dict(id=self.id, name=self.name, duration=dur, backgroundId=self.bg, actors=self.actors, events=ev)

    def _back_props(self, dur):
        out = []
        for who, (x, y, s) in SEAT.items():
            cuts = sorted([b for b in self.back_beats if b[0] == who], key=lambda b: b[1])
            segs, t = [], 0.0
            for _, a, b, var in cuts:
                a = max(a, t)
                if a > t:
                    segs.append((t, a, 'teclea'))
                segs.append((a, b, var))
                t = b
            if t < dur:
                segs.append((t, dur, 'teclea'))
            for a, b, var in segs:
                if b - a < 0.05:
                    continue
                base = CHAIR[f'{who}_espaldas_teclea']
                v = CHAIR[f'{who}_espaldas_{var}']
                s2 = s * base[1] / v[1]
                px = round(x + base[0] * s - v[0] * s2)
                p = dict(id=self._id('pr'), track='props', start=round(a, 2), duration=round(b - a, 2), propId=f'prop_{who}_espaldas_{var}',
                         layer='props-front', x=px, y=y, scale=round(s2, 3), zIndex=SEAT_Z[who])
                if var == 'teclea':
                    p['loop'] = 'type'
                out.append(p)
        return out


def project(title, idea, takes, wishlist):
    takes = [t.build() for t in takes]
    return {"schemaVersion": "pocket-1", "catalogVersion": "v8-assets-1",
            "metadata": {"title": title, "language": "es-ES", "approxDuration": round(sum(t['duration'] for t in takes), 1), "idea": idea, "wishlist": wishlist},
            "canvas": {"width": 1080, "height": 1920}, "takes": takes}


ALL5 = ('rey', 'sis', 'jefe', 'usu', 'bar')

# ================================================================= EP. 1 · ANTES
t1 = Take('e1t1', 'La incidencia fantasma', 'bg_oficina_manana', back=True)
t1.sfx('sfx_teclado', 3, 0.5)
t1.say('narr', 'Departamento de soporte. Cinco personas. Y una incidencia que no hay manera de cerrar.')
t1.say('sister', 'La cuatro mil doce se ha vuelto a abrir. Sola. Otra vez.')
t1.say('reynaldo', 'Yo la cerré ayer a las seis menos uno. Consta en el registro.')
t1.say('barbas', 'Igual es que le caemos bien. Te lo digo con todo el amor del mundo, ¿eh?')
t1.say('usu', 'O el servidor tiene sentimientos.')
t1.sfx('sfx_ding', 0.6)
t1.wait(0.4)
t1.say(('off', 'Director'), 'Equipo de soporte: si la incidencia sigue abierta el viernes, habrá cambios.')
t2 = Take('e1t2', 'El viernes', 'bg_oficina_manana', back=True)
t2.say('jefe', '¿Cambios? ¿Qué cambios?')
t2.say('barbas', 'Jefe, lo ha dicho con un tonito… Con todo el amor del mundo: yo iría a hablar con él.')
t2.say('jefe', '[angry] ¡Voy ahora mismo!')
t2.sfx('sfx_whoosh', 0.6)
t2.say('sister', 'Jefe, la reunión con él es el viernes. Te lo apunté en tres sitios.')
t2.say('jefe', '¿Qué reunión?')
t2.wait(0.3)
t2.say('usu', 'Tranquilos. Lo arreglo yo. Con un parche.')
t2.say('sister', 'No.', gap=0.15)
t2.say('reynaldo', 'No.', gap=0.15)
t2.say('barbas', 'No.', gap=0.6)
t2.say('usu', 'Ya lo he empezado.')
t2.sfx('sfx_fracaso', 1.1)
t2.wait(0.8)
EP1 = project('Ep. 1 · Antes', 'Presentación del equipo humano y la incidencia fantasma que el Director exige cerrar antes del viernes.', [t1, t2],
              ['mañana de cada uno en casa / portal (presentación)', 'Director humano (de pie)', 'monitor con el correo del Director'])

# ================================================================= EP. 2 · EL PARCHE
t1 = Take('e2t1', 'Miércoles, 23:00', 'bg_oficina_noche', back=True)
t1.say('narr', 'Miércoles. Once de la noche.')
t1.sfx('sfx_teclado', 2.5, 0.6)
t1.say('usu', '[whispers] El viernes te arreglo. Palabra.')
t2 = Take('e2t2', 'El servidor', 'bg_sala_servidores')
t2.sfx('sfx_servidor', 3)
t2.add('props', 9, propId='prop_usu_humano', layer='props-front', x=540, y=1880, scale=1.1)
t2.say('narr', 'Jueves. Sala de servidores.')
t2.screen('shake', 0.5)
t2.say(('off', 'Servidor'), '[sighs] Brrrrr… clonc.')
t2.say('usu', 'Tranquilo, grandullón. Mañana te curo.')
t2.wait(0.5)
t3 = Take('e2t3', 'Viernes, 17:59', 'bg_oficina_soporte', back=True)
t3.sfx('sfx_teclado', 2, 0.6)
t3.say('narr', 'Viernes. Seis menos un minuto.')
t3.say('reynaldo', 'Yo a las seis ficho. Ni un segundo más. Artículo de mi convenio.')
t3.say('usu', '[excited] Parche aplicado.')
t3.say('barbas', '¿Un viernes? ¿A las seis menos uno?')
t3.screen('shake', 0.5)
t3.screen('bluescreen', 2.8, text='Tu equipo se ha puñetizado.')
t3.sfx('sfx_pantallazo', 2.2)
t3.wait(3.0)
t3.screen('flash', 0.25, color='#2a6bff')
t3.wait(0.5)
t3.say('reynaldo', '…¿Alguien más se ha visto la mano… azul?')
t3.say('sister', 'No.', gap=0.15)
t3.say('barbas', 'No.', gap=0.15)
t3.say('jefe', 'No.', gap=0.15)
t3.say('usu', 'No.', gap=1.2)
# uno a uno «levantan la mano»
for who in ('sister', 'barbas', 'jefe', 'usu'):
    t3.back_beats.append((who, t3.t, t3.t + 30, TALK[who]))
    t3.wait(0.6)
t3.wait(0.8)
EP2 = project('Ep. 2 · El parche', 'Usu prepara el parche de noche; el viernes a las 17:59 lo aplica y llega el pantallazo azul.', [t1, t2, t3],
              ['Usu humano de espaldas iluminado de noche', 'Reynaldo con abrigo', 'segundo fotograma de teclear'])

# ================================================================= EP. 3 · ¿QUÉ COÑO NOS HA PASADO?
t1 = Take('e3t1', 'Lunes', 'bg_oficina_manana', punetos=ALL5)
t1.say('narr', 'Lunes.')
t1.face('bar', 'sorpresa')
t1.face('jefe', 'sorpresa')
t1.say('jefe', 'Barbas… estás azul.', pose='pointing')
t1.say('bar', 'Tú también, Jefe. Te lo digo con todo el amor del mundo: te favorece.', expr='risa')
t1.say('sis', 'Que nadie grite. La recepcionista nos ha saludado como siempre.', expr='neutral', pose='talk_explain')
t1.say('rey', 'Esto no viene en el convenio. Lo estoy consultando.', expr='enfado', pose='arms_crossed')
t1.say('jefe', '¿Qué pasó el viernes?', pose='neutral_3q_right')
t1.say('sis', 'El parche de Usu.')
t1.say('jefe', '¿Qué parche?', expr='neutral')
t1.say('jefe', 'Eso… se lo preguntaré al Jefe del pasado.')
t1.say('usu', '[excited] ¡Yo sé cómo comprobarlo!', expr='alegria', pose='talk_emphasis')
t1.say('sis', 'Usu, no.', expr='enfado', pose='pointing')
t2 = Take('e3t2', 'Los dragones', 'bg_sala_servidores', solo=('usu', 540, 1820, 0.95, 'neutral_front'))
t2.sfx('sfx_servidor', 3)
t2.say('usu', 'A ver, grandullón. Incidencia cuatro mil doce. Tú y yo.', pose='talk_explain')
t2.pose('usu', 'pointing')
t2.wait(0.3)
t2.screen('flash', 0.5, color='#ffffff')
t2.sfx('sfx_pop', 0.4)
t2.add('props', 30, propId='prop_draco', layer='props-front', x=270, y=1050, scale=1.1, enter='pop', loop='float')
t2.wait(0.4)
t2.sfx('sfx_pop', 0.4)
t2.add('props', 30, propId='prop_humillos', layer='props-front', x=820, y=1100, scale=1.0, enter='pop', loop='float')
t2.face('usu', 'sorpresa')
t2.fx('usu', 'jump')
t2.wait(0.8)
t2.say('usu', '…¿Y vosotros de dónde salís?', pose='reaction')
t2.say('usu', 'Tú te llamas Draco. Y tú… Humillos.', expr='alegria', pose='talk_explain')
t2.say('usu', '[excited] Vale. Pues ya que estáis: la cuatro mil doce.', expr='alegria', pose='talk_emphasis')
t2.sfx('sfx_whoosh', 0.6)
t2.screen('flash', 0.6, color='#40c057')
t2.sfx('sfx_ding', 0.6)
t2.wait(0.8)
t2.say('usu', 'Incidencia cerrada. Por mis dragones.', expr='risa', pose='arms_crossed')
t3 = Take('e3t3', 'El Director', 'bg_despacho_director', punetos=ALL5)
t3.say(('off', 'Director'), 'Ni una incidencia abierta en toda la empresa. ¿Cómo lo habéis hecho?')
t3.say('sis', 'Usu cerró la cuatro mil doce. Y el Jefe arregló anoche toda la red de facturación.', pose='talk_explain')
t3.say('jefe', '¿Yo?', expr='sorpresa', pose='reaction')
t3.say('bar', 'Tú, Jefe. Tres horas. Con todo el amor del mundo: eres un crack.', expr='risa')
t3.say('jefe', 'Eso se lo preguntaré al Jefe del pasado.', expr='neutral', pose='neutral_3q_right')
t3.say('rey', 'Y conste que ha sido en horario laboral.', expr='enfado', pose='arms_crossed')
t3.wait(0.4)
EP3 = project('Ep. 3 · ¿Qué coño nos ha pasado?', 'Primer día en visión Puñeta: se ven azules, Usu descubre sus poderes y nacen Draco y Humillos.', [t1, t2, t3],
              ['Draco y Humillos definitivos', 'aura del Director (ejecutivo de sonrisa de anuncio)', 'aura de la recepcionista'])

# ================================================================= EP. 4 · FUERA DE LA OFICINA
t1 = Take('e4t1', 'Reynaldo · El banco', 'bg_oficina', solo=('rey', 540, 1800, 1.0, 'neutral_front'))
t1.say(('off', 'Empleado del banco'), 'Son doce euros de comisión por mantenimiento.')
t1.say('rey', 'Un momento.', expr='enfado', pose='arms_crossed')
t1.screen('flash', 0.5, color='#2a6bff')
t1.sfx('sfx_whoosh', 0.6)
t1.wait(0.4)
t1.sfx('sfx_ding', 0.6)
t1.say('rey', 'Normativa consultada. Reclamación enviada. Copia al sindicato.', pose='talk_explain')
t1.sfx('sfx_telefono', 1.3)
t1.wait(1.4)
t1.say(('off', 'Empleado del banco'), '…Le devolvemos la comisión. Y le pedimos disculpas.')
t1.say('rey', 'Por escrito, por favor.', expr='alegria', pose='neutral_front')
t2 = Take('e4t2', 'Sister · La casa', 'bg_salon', solo=('sis', 760, 1800, 1.0, 'neutral_3q_left'))
mess = [('prop_papeles', 180, 1500, 300, 1200, -30), ('prop_cafe', 360, 1650, 160, 1180, 20), ('prop_maletin', 520, 1760, 380, 1205, 15), ('prop_planta', 120, 1800, 520, 1210, -12)]
t2.say(('off', 'Amiga'), 'Perdona el desorden, es que no paro.')
t2.say('sis', 'No te preocupes.', expr='alegria', pose='talk_explain')
t2.pose('sis', 'pointing')
t2.sfx('sfx_whoosh', 0.6)
start = t2.t
for pid, x, y, tx, ty, rot in mess:
    t2.add('props', 1.6, start=start, propId=pid, layer='props-back', x=x, y=y, rot=rot, toX=tx, toY=ty)
    t2.add('props', 30, start=start + 1.6, propId=pid, layer='props-back', x=tx, y=ty)
for pid, x, y, tx, ty, rot in mess:  # antes del truco: el desorden
    t2.add('props', start, start=0, propId=pid, layer='props-back', x=x, y=y, rot=rot)
t2.wait(1.9)
t2.sfx('sfx_ding', 0.6)
t2.say(('off', 'Amiga'), '…¿Y este olor a limpio?')
t2.say('sis', 'Será la ventana.', expr='risa', pose='neutral_3q_left')
t3 = Take('e4t3', 'Barbas · El cuñado', 'bg_cocina', solo=('bar', 540, 1800, 1.0, 'neutral_front'))
t3.say(('off', 'Cuñado'), 'Lo de tu tele se arregla con un golpe seco. Te lo digo yo, que sé de esto.')
t3.say('bar', 'Tienes toda la razón. Te lo digo con todo el amor del mundo.', expr='alegria', pose='talk_explain')
t3.say(('off', 'Cuñado'), '…Nadie me había dado nunca la razón.')
t3.say(('off', 'Cuñado'), '[crying] Toma. La última croqueta.')
t3.say('bar', 'Gracias, cuñao.', expr='risa', pose='neutral_front')
t4 = Take('e4t4', 'Usu · El semáforo', 'bg_calle', solo=('usu', 300, 1820, 0.95, 'neutral_3q_right'))
t4.say('narr', 'Mientras tanto, en un cruce con el semáforo roto…')
t4.say('usu', 'Esto es un atasco. Necesito un guardia.', expr='neutral', pose='talk_explain')
t4.pose('usu', 'pointing')
t4.screen('flash', 0.4, color='#ffffff')
t4.sfx('sfx_pop', 0.4)
t4.add('props', 30, propId='prop_pulpo', layer='props-front', x=780, y=1500, scale=1.2, enter='pop', loop='float')
t4.wait(0.8)
t4.say('usu', 'Tú, los coches pares. Tú, los impares. Y tú, el autobús.', expr='alegria', pose='talk_emphasis')
t4.sfx('sfx_boing', 0.5)
t4.say(('off', 'Conductor'), '¡Qué guardia más eficiente!')
t5 = Take('e4t5', 'Jefe · El rellano', 'bg_salon', solo=('jefe', 540, 1800, 1.0, 'neutral_front'))
t5.say(('off', 'Vecino'), '¡Jefe! Gracias por arreglar el wifi de todo el edificio.')
t5.say('jefe', '¿El qué?', expr='sorpresa', pose='reaction')
t5.say(('off', 'Vecino'), 'Ayer. Estuviste tres horas en el cuarto de contadores.')
t5.say('jefe', 'Eso… se lo preguntaré al Jefe del pasado.', expr='neutral', pose='neutral_front')
EP4 = project('Ep. 4 · Fuera de la oficina', 'Cada uno descubre su habilidad en su día a día, rodeado de auras-cliché.', [t1, t2, t3, t4, t5],
              ['banco con ventanilla', 'casa desordenada', 'comida familiar', 'cruce con semáforo', 'rellano', 'auras: empleado del banco, amiga, cuñado, vecino', 'pulpo guardia definitivo'])

# ================================================================= EP. 5 · LA NUEVA NORMALIDAD
t1 = Take('e5t1', 'En el bar', 'bg_bar', punetos=ALL5)
t1.say(('off', 'Camarero'), '¿Lo de siempre?')
t1.say('bar', 'Lo de siempre, con todo el amor del mundo.', expr='alegria')
t1.say('rey', 'Hoy he recuperado doce euros. Y mi dignidad.', expr='alegria', pose='arms_crossed')
t1.say('sis', 'Yo he ordenado una casa entera sin tocarla.', expr='alegria', pose='talk_explain')
t1.say('bar', 'A mí mi cuñado me quiere. Me da un poco de miedo.', expr='risa')
t1.say('usu', 'Yo he creado un pulpo guardia urbano.', expr='alegria', pose='talk_emphasis')
t1.say('jefe', 'Yo he… no me acuerdo.', expr='tristeza')
t1.say('sis', 'Arreglaste el wifi de tu edificio, Jefe.')
t1.say('jefe', '¿Veis? Soy un crack.', expr='alegria', pose='talk_emphasis')
t2 = Take('e5t2', 'El plan', 'bg_bar', punetos=ALL5)
t2.say('jefe', 'Propongo investigar qué nos está pasando.', pose='talk_explain')
t2.say('rey', 'En horario laboral.', expr='enfado', pose='arms_crossed')
t2.say('jefe', 'Muy bien. ¿Qué estaba proponiendo?', expr='sorpresa', pose='reaction')
t2.say('sis', 'Lo tengo apuntado.', expr='alegria')
t2.say('bar', 'Por los Puñetos. Con todo el amor del mundo.', expr='risa', pose='talk_emphasis')
t2.sfx('sfx_ding', 0.5)
t2.say('usu', 'Y dos platitos para Draco y Humillos.', expr='alegria', pose='talk_explain')
t2.add('props', 30, propId='prop_cafe', layer='props-front', x=470, y=1560, scale=0.7)
t2.add('props', 30, propId='prop_cafe', layer='props-front', x=610, y=1560, scale=0.7)
t2.wait(0.6)
t2.sfx('sfx_pop', 0.4)
t2.add('props', 30, propId='prop_draco', layer='props-front', x=300, y=1300, scale=1.3, enter='pop', loop='float')
t2.add('props', 30, propId='prop_humillos', layer='props-front', x=800, y=1320, scale=1.2, enter='pop', loop='float')
t2.wait(1.0)
t2.say(('off', 'Camarero'), '…¿Quién me ha quemado los platos?')
t2.say('usu', 'Humillos. No se le puede llevar a ningún sitio.', expr='risa', pose='arms_crossed')
t2.wait(0.3)
t2.say('narr', 'Continuará.')
EP5 = project('Ep. 5 · La nueva normalidad', 'En el bar ponen en común sus habilidades y deciden investigar; Draco y Humillos queman los platos.', [t1, t2],
              ['bar definitivo', 'aura del camarero', 'platitos (normales y chamuscados)', 'calle de noche'])

for i, ep in enumerate([EP1, EP2, EP3, EP4, EP5], 1):
    with open(f'src/data/ep{i}.json', 'w') as f:
        json.dump(ep, f, ensure_ascii=False, indent=1)
    print(f'ep{i}', ep['metadata']['title'], ep['metadata']['approxDuration'], 's')


# ---------------------------------------------------------------- guion legible (docs/guiones/)
import os
NAMES = {'usu': 'USU', 'rey': 'REYNALDO', 'sis': 'SISTER', 'bar': 'BARBAS', 'jefe': 'JEFE', 'reynaldo': 'REYNALDO', 'sister': 'SISTER', 'barbas': 'BARBAS'}
EMO = {'alegria': 'contento', 'risa': 'riéndose', 'enfado': 'enfadado', 'sorpresa': 'sorprendido', 'tristeza': 'triste', 'neutral': 'serio'}
BGS = {'bg_oficina_manana': 'OFICINA DE SOPORTE · MAÑANA', 'bg_oficina_noche': 'OFICINA DE SOPORTE · NOCHE', 'bg_oficina_soporte': 'OFICINA DE SOPORTE · ATARDECER',
       'bg_sala_servidores': 'SALA DE SERVIDORES', 'bg_despacho_director': 'DESPACHO DEL DIRECTOR', 'bg_oficina': 'BANCO (provisional)', 'bg_salon': 'CASA / SALÓN (provisional)',
       'bg_cocina': 'COMIDA FAMILIAR (provisional)', 'bg_calle': 'CALLE (provisional)', 'bg_bar': 'BAR (provisional)'}
os.makedirs('docs/guiones', exist_ok=True)
for i, ep in enumerate([EP1, EP2, EP3, EP4, EP5], 1):
    out = [f"# {ep['metadata']['title']}", '', f"_{ep['metadata']['idea']}_ · ≈ {ep['metadata']['approxDuration']} s", '']
    for k, tk in enumerate(ep['takes'], 1):
        vista = 'humanos de espaldas' if not tk['actors'] else 'visión Puñeta'
        out += [f"## Escena {k} · {tk['name']}", f"**{BGS.get(tk['backgroundId'], tk['backgroundId'])}** — {vista}", '']
        mood = {}
        for e in sorted(tk['events'], key=lambda e: e['start']):
            tr = e['track']
            if tr == 'face':
                m = EMO.get(e['expressionId'].split('.')[-1], '')
                if e['actorUid'] == 'sis':
                    m = {'serio': 'seria', 'contento': 'contenta', 'enfadado': 'enfadada', 'sorprendido': 'sorprendida'}.get(m, m)
                mood[e['actorUid']] = m
            elif tr == 'dialogue':
                if 'actorUid' in e:
                    who = NAMES[e['actorUid']]
                    m = mood.get(e['actorUid'])
                    who += f' _({m})_' if m else ''
                elif 'voiceOf' in e:
                    who = NAMES.get(e['voiceOf'], e['voiceOf'].upper())
                elif 'speakerName' in e:
                    who = e['speakerName'].upper() + ' _(en off)_'
                else:
                    who = 'NARRADOR'
                out.append(f"- **{who}:** {e['text']}")
            elif tr == 'screen':
                out.append(f"- _[{ {'bluescreen': 'PANTALLAZO AZUL', 'flash': 'destello', 'shake': 'tiembla la pantalla', 'darken': 'oscurece'}[e['effect']] }]_")
            elif tr == 'props' and e.get('enter') == 'pop':
                out.append(f"- _[aparece {e['propId'].replace('prop_', '')}]_")
            elif tr == 'body' and e.get('fx') == 'jump':
                out.append(f"- _[{NAMES[e['actorUid']]} da un salto]_")
        out.append('')
    out += ['**Recursos pendientes:** ' + ', '.join(ep['metadata']['wishlist']), '']
    with open(f'docs/guiones/ep{i}.md', 'w') as f:
        f.write('\n'.join(out))
