"""Genera src/data/sketch-origen.json (escenas de espaldas + transformación). Ejecutar desde la raíz del repo."""
import json
chair={'barbas_espaldas_habla':(-2,490),'barbas_espaldas_teclea':(-6,520),'jefe_espaldas_senala':(35,500),'jefe_espaldas_teclea':(18,520),
'reynaldo_espaldas_hombros':(24,459),'reynaldo_espaldas_teclea':(-4,437),'sister_espaldas_explica':(-6,475),'sister_espaldas_senala':(-16,400),
'sister_espaldas_teclea':(14,401),'usu_espaldas_habla':(-15,450),'usu_espaldas_teclea':(-11,471)}
seat={'sister':(102,975,0.312),'reynaldo':(427,1028,0.319),'barbas':(782,1090,0.331),'jefe':(83,1622,0.775),'usu':(575,1848,0.875)}
Z={'sister':1,'reynaldo':2,'barbas':3,'jefe':4,'usu':5}
VAR={'sister':['teclea','explica','senala'],'reynaldo':['teclea','hombros'],'barbas':['teclea','habla'],'jefe':['teclea','senala'],'usu':['teclea','habla']}

def place(who,variant):
    x,y,s=seat[who]; base=chair[f'{who}_espaldas_teclea']; v=chair[f'{who}_espaldas_{variant}']
    s2=s*base[1]/v[1]
    return round(x+base[0]*s - v[0]*s2), y, round(s2,3)

def back_take(tid,name,dur,beats,extra,bg='bg_oficina_soporte'):
    """beats: lista de (quien, desde, hasta, variante) en la que cambian de postura; el resto teclea."""
    ev=[]
    def e(i,track,start,d,**k): ev.append(dict(id=i,track=track,start=round(start,2),duration=round(d,2),**k))
    for who in seat:
        cuts=sorted([b for b in beats if b[0]==who], key=lambda b:b[1])
        segs=[]; t=0.0
        for _,a,b,var in cuts:
            if a>t: segs.append((t,a,'teclea'))
            segs.append((a,b,var)); t=b
        if t<dur: segs.append((t,dur,'teclea'))
        for k,(a,b,var) in enumerate(segs):
            x,y,s=place(who,var)
            p=dict(propId=f'prop_{who}_espaldas_{var}',layer='props-front',x=x,y=y,scale=s,zIndex=Z[who])
            if var=='teclea': p['loop']='type'
            e(f'{tid}_{who}_{k}','props',a,b-a,**p)
    for x in extra: x=dict(x); x['id']=f"{tid}_{x['id']}"; ev.append(x)
    return dict(id=tid,name=name,duration=dur,backgroundId=bg,actors=[],events=ev)

def L(i,start,d,text,who=None): 
    x=dict(id=i,track='dialogue',start=start,duration=d,text=text)
    if who: x['voiceOf']=who
    return x
def S(i,start,d,sid,vol=None):
    x=dict(id=i,track='sfx',start=start,duration=d,soundId=sid)
    if vol is not None: x['volume']=vol
    return x

# Toma 1: lunes por la mañana
t1=back_take('t1','Lunes, 9:02',16.0,
 [('sister',4.0,7.4,'explica'),('reynaldo',7.6,10.0,'hombros'),('jefe',12.6,15.6,'senala')],
 [L('n1',0.3,3.4,'Departamento de soporte. Cinco personas. Tres mil incidencias abiertas.'),
  S('tec',0.2,3.0,'sfx_teclado',0.6),
  L('d1',4.1,3.2,'Incidencia cuatro mil quinientos doce: «el ratón no va». Lo tiene boca abajo.','sister'),
  L('d2',7.7,2.2,'[sighs] Ciérrala. Resuelta por el usuario.','reynaldo'),
  dict(id='mov',track='props',start=10.2,duration=5.8,propId='prop_movil',layer='props-front',x=335,y=1300,scale=0.5,zIndex=3,enter='pop',loop='shake'),
  S('tel',10.3,2.6,'sfx_telefono'),
  L('d3',12.7,2.4,'[shouts] ¡Que nadie coja eso! Es Contabilidad.','jefe')],
 bg='bg_oficina_manana')

# Toma 2: miércoles, incidencia imposible
t2=back_take('t2','Miércoles, 12:40',15.0,
 [('barbas',0.6,4.4,'habla'),('usu',4.8,7.2,'habla'),('sister',7.4,9.4,'senala'),('usu',9.6,12.4,'habla')],
 [S('tec',0.0,2.5,'sfx_teclado',0.5),
  L('d1',0.7,3.6,'Me piden que les imprima internet. Entero. A doble cara.','barbas'),
  L('d2',4.9,2.2,'[excited] Eso tiene arreglo. Con un parche.','usu'),
  L('d3',7.5,1.8,'Usu. No.','sister'),
  L('d4',9.7,2.6,'Uno pequeñito. Para el viernes.','usu'),
  S('ding',12.4,0.6,'sfx_ding'),
  L('n2',12.9,2.0,'No era pequeñito.')],
 bg='bg_oficina_manana')

# Toma 3: viernes 17:59 (el Pantallazo)
t3=back_take('t3','Viernes, 17:59',17.0,
 [('sister',3.6,6.2,'explica'),('reynaldo',6.2,8.4,'hombros'),('usu',8.6,11.8,'habla'),('barbas',12.0,14.0,'habla')],
 [L('n1',0.3,3.0,'Viernes. Seis menos un minuto.'),
  S('tec',0.2,3.0,'sfx_teclado',0.6),
  L('d1',3.7,2.4,'¿Alguien sabe por qué el servidor hace ese ruido?','sister'),
  L('d2',6.3,1.9,'[sighs] Ni idea. Yo solo cierro tickets.','reynaldo'),
  L('d3',8.7,2.9,'[excited] Tranquilos. Acabo de lanzar el Parche Definitivo.','usu'),
  S('ding',11.6,0.6,'sfx_ding'),
  L('d4',12.1,1.8,'¿Un viernes? ¿A las seis menos uno?','barbas'),
  dict(id='shk',track='screen',start=14.0,duration=0.5,effect='shake'),
  dict(id='bs',track='screen',start=14.2,duration=2.8,effect='bluescreen',text='Tu equipo se ha puñetizado.'),
  S('bss',14.2,2.2,'sfx_pantallazo')])

# Toma 4: de frente, ya puñetos
ev2=[]
def f(i,track,start,dur,**k): ev2.append(dict(id=i,track=track,start=round(start,2),duration=round(dur,2),**k))
LAY=[('rey','reynaldo',310,1650,0.68,1,'3q_right'),('sis','sister',770,1650,0.68,1,'3q_left'),('jefe','jefe',180,1810,0.78,2,'3q_right'),('usu','usu',540,1810,0.78,3,'front'),('bar','barbas',900,1810,0.78,2,'3q_left')]
actors=[]
for uid,cid,x,y,s,zz,pose in LAY:
    actors.append(dict(uid=uid,characterId=cid,poseId=f'char.{cid}.pose_neutral_{pose}',x=x,y=y,scale=s,zIndex=zz,expressionId=f'expression.{cid}.neutral',hidden=True))
    f(f'{uid}_in','body',0.0,0.5,actorUid=uid,appear='flash')
f('fl_s','sfx',0.0,0.6,soundId='sfx_whoosh')
for uid,cid,*_ in LAY:
    if uid!='usu': f(f'{uid}_f','face',0.6,0.3,actorUid=uid,expressionId=f'expression.{cid}.sorpresa')
f('rey_sh','body',0.8,1.0,actorUid='rey',fx='shake')
f('bar_m','mouth',1.2,3,actorUid='bar',mode='auto')
f('bar_d','dialogue',1.3,1.6,actorUid='bar',text="[shouts] ¡Estamos AZULES!")
f('jefe_fe','face',3.1,0.3,actorUid='jefe',expressionId='expression.jefe.enfado')
f('jefe_p','body',3.1,0.3,actorUid='jefe',poseId='char.jefe.pose_pointing')
f('jefe_m','mouth',3.2,3,actorUid='jefe',mode='auto')
f('jefe_d','dialogue',3.3,1.6,actorUid='jefe',text="Usu. ¿Qué has hecho?")
f('usu_fe','face',5.1,0.3,actorUid='usu',expressionId='expression.usu.alegria')
f('usu_m','mouth',5.2,3,actorUid='usu',mode='auto')
f('usu_d','dialogue',5.3,2.2,actorUid='usu',text="Técnicamente… ya no hay tickets.")
f('fr','sfx',7.7,1.1,soundId='sfx_fracaso')
f('sis_fe','face',7.7,0.3,actorUid='sis',expressionId='expression.sister.enfado')
t4=dict(id='t4',name='Puñetizados',duration=9.0,backgroundId='bg_oficina_soporte',actors=actors,events=ev2)

takes=[t1,t2,t3,t4]
d={"schemaVersion":"pocket-1","catalogVersion":"v8-assets-1",
 "metadata":{"title":"El origen de los puñetos","language":"es-ES","approxDuration":sum(t['duration'] for t in takes),
   "idea":"El equipo de soporte, todavía humano, sobrevive a una semana de incidencias absurdas hasta que Usu lanza el Parche Definitivo un viernes a las 17:59.",
   "wishlist":["versiones puñeto de espaldas en la silla (para transformar sin cortar)","pantalla de ordenador con un ticket (primer plano)"]},
 "canvas":{"width":1080,"height":1920},"takes":takes}
json.dump(d,open('src/data/sketch-origen.json','w'),ensure_ascii=False,indent=2)
print('ok', d['metadata']['approxDuration'])
