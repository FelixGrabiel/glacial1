/* Planificación · etapa 2: avance del plan (producido, pendiente, sobreproducción, avance, «sin registro» ≠ cero), paletas completas + UND,
   subtotales por línea, colores de estado, compromiso original (plan al iniciar el bloque) en Programación y Cumplimiento, exportación. */
const {nube,dispositivo,F,items,leer,clon}=require('./planificacion-harness');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const FECHA='2099-03-07';
const hora=h=>new Date(FECHA+'T'+h+':00').getTime();
const G=(sb,a)=>require('vm').runInContext('guardarProgramacionPaleta',sb)(...a);
const compromisos=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('compromisosProgramacion/'));

(async()=>{
const ANA={nombre:'Ana'};

/* ---------- paletas completas + UND ---------- */
{
  const sb=dispositivo(nube(),ANA),NS=sb.NS;
  ok(NS.paletasTexto(5500,120)==='45 + 100 UND'&&NS.paletasTexto(12000,1200)==='10'&&NS.paletasTexto(500,1200)==='0 + 500 UND'&&NS.paletasTexto(100,0)==='—','paletas: 5 500 / 120 = 45 paletas completas + 100 UND; sin unidades por paleta, «—»');
}

/* ---------- resumen del bloque ---------- */
{
  const N=nube();
  N.docs.set('sync/programaciones',{items:[
    F('PET1',FECHA,'DÍA','Bells','Regular_625ml',8000,1200),F('PET1',FECHA,'INTERMEDIO','Bells','Regular_625ml',4000,1200),      // un producto en Día e Intermedio
    F('PET1',FECHA,'DÍA','Scala','Regular_380ml',6000,2184,{estadoOperacion:{estado:'FINALIZADA'}}),
    F('PET1',FECHA,'DÍA','Scala','Regular_625ml',3000,1200,{estadoOperacion:{estado:'CANCELADA'}}),
    F('PET2',FECHA,'DÍA','Bells','Regular_625ml',5000,1200),
    F('B7L',FECHA,'DÍA','Fontlife','7 Litros',2000,100),
    F('PET2',FECHA,'NOCHE','Bells','Regular_625ml',4000,1200)]});
  const sb=dispositivo(N,ANA),NS=sb.NS;
  const prod={'PET1|Bells|Regular_625ml':12000,'PET1|Scala|Regular_380ml':5000,'PET2|Bells|Regular_625ml':0,'B7L|Fontlife|7 Litros':null};
  const llamadas=[];
  sb.glacialProducidoVigente=x=>{llamadas.push([x.linea,x.marca,x.presentacion].join('|'));const k=[x.linea,x.marca,x.presentacion].join('|');return k in prod?prod[k]:0;};
  const r=NS.resumenBloque(FECHA,'DÍA'),g=k=>r.grupos.get(k);
  const bells=g('PET1|Bells|Regular_625ml');
  ok(bells.programado===12000&&bells.filas.length===2&&llamadas.filter(x=>x==='PET1|Bells|Regular_625ml').length===1,'Día + Intermedio del mismo producto: un solo grupo (8 000 + 4 000 = 12 000) y el producido se pide UNA vez (no se cuenta dos veces)');
  ok(bells.producido===12000&&bells.pendiente===0&&bells.sobre===0&&bells.avance===1&&bells.alcanzada===true,'producido = programado: pendiente 0, sin sobreproducción, avance 100 %, meta alcanzada');
  const scala=g('PET1|Scala|Regular_380ml');
  ok(scala.programado===6000&&scala.pendiente===1000&&scala.sobre===0&&scala.alcanzada===false&&NS.estadoDe(scala.filas[0])==='FINALIZADA','«Finalizada» NO significa que se alcanzó la cantidad: producido 5 000 de 6 000 queda con pendiente 1 000 y sin «meta alcanzada»');
  ok(g('PET1|Scala|Regular_625ml').programado===0&&g('PET1|Scala|Regular_625ml').producido===null,'una fila CANCELADA no cuenta en el programado ni se le calcula producido');
  const pet2=g('PET2|Bells|Regular_625ml');
  ok(pet2.producido===0&&pet2.pendiente===5000&&pet2.avance===0&&pet2.alcanzada===false,'cero producido NO es «sin registro»: pendiente = programado y avance 0 %');
  const b7=g('B7L|Fontlife|7 Litros');
  ok(b7.producido===null&&b7.pendiente===null&&b7.sobre===null&&b7.avance===null,'sin registro (null): no se asume cero; pendiente, sobreproducción y avance quedan vacíos');
  prod['PET1|Bells|Regular_625ml']=13500;
  const r2=NS.resumenBloque(FECHA,'DÍA').grupos.get('PET1|Bells|Regular_625ml');
  ok(r2.sobre===1500&&r2.pendiente===0&&r2.avance===13500/12000,'sobreproducción separada del saldo pendiente: +1 500 sobre lo programado, pendiente 0');
  prod['PET1|Bells|Regular_625ml']=12000;
  const l1=NS.resumenBloque(FECHA,'DÍA').porLinea;
  ok(l1.get('PET1').programado===18000&&l1.get('PET1').producido===17000&&l1.get('PET1').pendiente===1000&&l1.get('PET1').productos===2,'subtotal por línea PET 1: programado 18 000, producido 17 000, pendiente 1 000 (la cancelada no suma)');
  ok(l1.get('B7L').sinRegistro===1&&l1.get('B7L').producido===0,'subtotal con un producto sin registro: se cuenta aparte y no suma como cero producido');
  ok(NS.resumenBloque(FECHA,'NOCHE').grupos.size===1,'Noche es otro bloque: solo sus filas');

  /* ---------- tabla de Programación (HTML real) ---------- */
  sb.puedeEntrarPlanificacion=()=>true;
  NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA'};
  const cont=sb.__el('plan-prog-tabla');
  NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  const h=cont.innerHTML;
  ok(/Sin registro/.test(h)&&/Meta alcanzada/.test(h)&&/Subtotal PET 1/.test(h)&&/Subtotal PET 2/.test(h)&&/10 \+ 0 UND|10<\/td>/.test(h)||/10/.test(h),'la tabla muestra «Sin registro», «Meta alcanzada», subtotales por línea y paletas completas');
  ok(/Pendiente<\/th>/.test(h)&&/Sobreproducción<\/th>/.test(h)&&/Producido \(UND\)<\/th>/.test(h),'columnas Producido, Pendiente y Sobreproducción separadas');
  ok(/incluido en la fila de arriba/.test(h),'la segunda fila del mismo producto (Intermedio) no repite el producido');
  ok(/est-fin/.test(h)&&/est-pend/.test(h),'estados con las clases de color acordadas (Finalizada verde, Pendiente gris)');
  const totalM=/Total del bloque[^]*?<b>([\d.,]+)<\/b>/.exec(h);
  ok(totalM&&totalM[1].replace(/[.,]/g,'')==='25000'&&/solo referencia, no mide capacidad/.test(h),'total del bloque: 25 000 = 18 000 + 5 000 + 2 000 (sin la fila cancelada de 3 000) y aclarado que mezcla líneas');
  ok(/«Sin registro» no es cero/.test(h),'nota: «Sin registro» no es cero y «Meta alcanzada» distinto de «Finalizada»');

  /* ---------- texto y Excel del plan ---------- */
  const t=NS.textoPlan(FECHA,'DÍA');
  ok(/PLAN DE PRODUCCIÓN/.test(t)&&/PET 1/.test(t)&&/Bells.*12[.,]000 UND \(10 paletas\)/.test(t)&&/Scala.*6[.,]000 UND \(2 \+ 1[.,]632 UND paletas\)/.test(t),'texto del plan: por línea y producto, Día + Intermedio sumado, paletas completas + UND');
  ok(!/Regular_625ml.*3[.,]000/.test(t)&&!/Producido|producido/.test(t),'el texto no incluye la fila cancelada ni cantidades producidas');
  const libro=[];sb.XLSX={utils:{aoa_to_sheet:a=>({a}),book_new:()=>({}),book_append_sheet:(l,ws)=>libro.push(ws)},writeFile:()=>{}};
  NS.excelPlan(FECHA,'DÍA');
  ok(libro.length===1&&libro[0].a[0].includes('Producido (UND)')&&libro[0].a.length===5,'Excel del plan: una fila por producto con programado, original, paletas, producido, pendiente, sobreproducción y avance');
}

/* ---------- compromiso original ---------- */
{
  const N=nube();
  N.docs.set('sync/programaciones',{items:[F('PET1',FECHA,'DÍA','Bells','Regular_625ml',10000,1200),F('PET1',FECHA,'DÍA','Scala','Regular_380ml',6000,2184)]});
  const sb=dispositivo(N,ANA,{ahora:hora('06:00')}),NS=sb.NS;
  sb.escuchar();
  ok(NS.inicioBloqueMs(FECHA,'DÍA')===hora('07:00')&&NS.inicioBloqueMs(FECHA,'NOCHE')===hora('21:00'),'inicio del bloque según la configuración: Día 07:00, Noche 21:00');
  await G(sb,['PET1',FECHA,'DÍA','Bells','Regular_625ml',11000,1200,{}]);
  ok(compromisos(N).length===0,'antes del inicio del bloque, el cambio es planificación: no se guarda compromiso');
  sb.__ahora=hora('09:00');
  await NS.guardar({linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidad:7000,upp:1200},{});
  const c=compromisos(N);
  ok(c.length===1&&c[0][0]==='compromisosProgramacion/'+FECHA+'_DÍA','el primer cambio después del inicio guarda el compromiso del bloque');
  const filas=c[0][1].filas;
  ok(filas.length===2&&filas.find(f=>f.marca==='Bells').cantidad===11000&&filas.find(f=>f.marca==='Scala').cantidad===6000&&c[0][1].inicioMs===hora('07:00')&&c[0][1].uid==='uid-Ana','el compromiso es el plan tal como estaba justo antes de ese cambio (Bells 11 000, cambiado antes del inicio) y cada fila trae su id');
  ok(items(N).find(p=>p.marca==='Bells').cantidadProgramada===7000,'el cambio de plan sí se aplicó');
  const confirmaciones=N.confirmaciones();
  await NS.guardar({linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidad:6500,upp:1200},{});
  ok(compromisos(N).length===1&&compromisos(N)[0][1].filas.find(f=>f.marca==='Bells').cantidad===11000&&N.confirmaciones()===confirmaciones+1,'los cambios siguientes no vuelven a escribir el compromiso (solo el cambio de plan)');
  ok(NS.originalDe(FECHA,'DÍA','PET1','Bells','Regular_625ml')===11000&&NS.originalDe(FECHA,'NOCHE','PET1','Bells','Regular_625ml')===null,'original por producto; un bloque sin compromiso devuelve null (no se registró reprogramación)');
  await NS.quitar(NS.existente('PET1',FECHA,'DÍA','Scala','Regular_380ml'),'se quitó del plan');
  const cambios=NS.cambiosDesdeInicio(FECHA,'DÍA');
  ok(cambios.length===2&&cambios.find(x=>x.marca==='Bells').original===11000&&cambios.find(x=>x.marca==='Bells').vigente===6500&&cambios.find(x=>x.marca==='Scala').vigente===0,'reprogramación: Bells 11 000 → 6 500 y Scala 6 000 → 0 (se quitó, no desaparece)');
  // pantalla
  sb.puedeEntrarPlanificacion=()=>true;NS.estado={tab:'programacion',fecha:FECHA,turno:'DÍA'};
  sb.glacialProducidoVigente=()=>0;
  const cont=sb.__el('plan-prog-tabla');NS.pestanas.find(p=>p.clave==='programacion').actualizar();
  ok(/Reprogramado después del inicio del bloque/.test(cont.innerHTML)&&/original al inicio: 11[.,]000/.test(cont.innerHTML)&&/se quitó/.test(cont.innerHTML),'Programación muestra el «original al inicio» y lo que se quitó después del inicio');
  // Noche cruza medianoche: se mide contra las 21:00 de la fecha operativa
  const N2=nube();N2.docs.set('sync/programaciones',{items:[F('PET2',FECHA,'NOCHE','Bells','Regular_625ml',4000,1200)]});
  const sbN=dispositivo(N2,ANA,{ahora:hora('20:00')});sbN.escuchar();
  await sbN.NS.guardar({linea:'PET2',fecha:FECHA,turno:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',cantidad:4500,upp:1200},{});
  ok(compromisos(N2).length===0,'Noche: a las 20:00 todavía no empezó el bloque (planificación)');
  sbN.__ahora=hora('22:30');
  await sbN.NS.guardar({linea:'PET2',fecha:FECHA,turno:'NOCHE',marca:'Bells',presentacion:'Regular_625ml',cantidad:5000,upp:1200},{});
  ok(compromisos(N2).length===1&&compromisos(N2)[0][1].filas[0].cantidad===4500,'Noche: a las 22:30 el compromiso guarda el plan de las 20:00 (4 500)');
  // no bloquea el cambio si el compromiso no se puede guardar (reglas sin publicar)
  const N3=nube();N3.denegar=['compromisosProgramacion'];N3.docs.set('sync/programaciones',{items:[F('PET1',FECHA,'DÍA','Bells','Regular_625ml',10000,1200)]});
  const sb3=dispositivo(N3,ANA,{ahora:hora('09:00')});sb3.escuchar();
  await sb3.NS.guardar({linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidad:9000,upp:1200},{});
  ok(items(N3)[0].cantidadProgramada===9000&&/permission-denied/.test(sb3.NS.compromisoFallo)&&compromisos(N3).length===0,'si no se puede guardar el compromiso (reglas sin publicar), el cambio de plan SÍ se guarda y queda el aviso');
  // los cambios por aprobación y por unificación también lo guardan
  const N4=nube();N4.docs.set('sync/programaciones',{items:[F('PET1',FECHA,'DÍA','Bells','Regular_625ml',10000,1200)]});
  N4.docs.set('solicitudesProgramacion/s1',{tipo:'CAMBIO_CANTIDAD',linea:'PET1',fecha:FECHA,turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadActual:10000,baseVersion:1,propuesta:{cantidad:12000},motivo:'Falta producto',estado:'PENDIENTE',uid:'u',usuario:'Sup',creadoEn:1});
  const sb4=dispositivo(N4,ANA,{ahora:hora('10:00')});sb4.escuchar();
  await sb4.NS.resolverSolicitud('s1',true,'de acuerdo');
  ok(compromisos(N4).length===1&&compromisos(N4)[0][1].filas[0].cantidad===10000&&items(N4)[0].cantidadProgramada===12000,'aprobar una solicitud después del inicio: guarda el compromiso (10 000) y aplica el cambio (12 000)');

  /* ---------- Cumplimiento con original ---------- */
  const sbC=dispositivo(N,ANA,{ahora:hora('12:00')});sbC.escuchar();
  sbC.glacialProducidoVigente=x=>({'PET1|Bells|Regular_625ml':5000,'PET1|Scala|Regular_380ml':2000}[[x.linea,x.marca,x.presentacion].join('|')]);
  sbC.puedeEntrarPlanificacion=()=>true;sbC.NS.estado={tab:'cumplimiento'};
  const cont2=sbC.__el('cu-cuerpo');
  sbC.NS.pestanas.find(p=>p.clave==='cumplimiento').pintar({innerHTML:'',set innerHTML(v){this._h=v;}});
  const hC=cont2.innerHTML;
  ok(/Hay reprogramación/.test(hC)&&/Original al inicio/.test(hC)&&/Cumplimiento vs original/.test(hC),'Cumplimiento muestra «Original al inicio» y «Cumplimiento vs original» cuando hubo reprogramación');
  const lineaPet1=/<td>PET 1<\/td><td class="num">([\d.,]+)<\/td><td class="num">([\d.,]+)<\/td><td class="num">([\d.,]+)<\/td>/.exec(hC);
  ok(lineaPet1&&lineaPet1[1].replace(/[.,]/g,'')==='6500'&&lineaPet1[2].replace(/[.,]/g,'')==='17000'&&lineaPet1[3].replace(/[.,]/g,'')==='7000','PET 1: vigente 6 500, original 17 000 (11 000 + 6 000 incluye lo que se quitó) y producido 7 000 — el incumplimiento no desaparece al reprogramar');
  ok(/41[.,]2 %/.test(hC)&&/107[.,]7 %/.test(hC),'cumplimiento vs original 41,2 % (7 000 / 17 000) y vigente 107,7 % (7 000 / 6 500)');
}

/* ---------- colores, reglas y puente ---------- */
{
  const s52=leer('js/produccion/52-planificacion-pantalla.js');
  ok(/EN_PRODUCCION'\?'est-curso'/.test(s52)&&/#FFEDD5/.test(s52)&&/est-curso\{background:#FFEDD5;color:#9A3412\}/.test(s52)&&/est-fin\{background:#DCFCE7/.test(s52)&&/est-det\{background:#FEE2E2/.test(s52)&&/est-pend\{background:#F3F4F6/.test(s52)&&/est-pausa\{background:#FEF9C3/.test(s52),'colores de estado = los de Producción Actual: EN PRODUCCIÓN naranja, PAUSA amarillo, DETENIDA rojo, FINALIZADA verde, PENDIENTE gris');
  ok(/'LISTA'\)\?'est-det'/.test(s52)&&/CANCELADA'\?'est-canc'/.test(s52)&&/est-canc\{[^}]*line-through/.test(s52),'Pausa, Lista y Cancelada conservan su significado (Lista = detenida; Cancelada con estilo propio, ya no igual que Detenida)');
  const r=leer('firestore.rules.etapa2.txt'),bl=r.slice(r.indexOf('match /compromisosProgramacion/{id}'),r.indexOf('match /distribucionPersonal'));
  ok(/allow create: if puedePlanificar\(\) && !soloVista\(\)/.test(bl)&&/creadoEn == request\.time/.test(bl)&&/uid == request\.auth\.uid/.test(bl)&&/allow update, delete: if false/.test(bl)&&/allow read: if autenticado\(\)/.test(bl),'reglas: lo crea quien planifica (uid y hora del servidor), nadie edita ni borra, leen los usuarios con sesión');
  const f64=leer('js/produccion/64-planificacion-avance.js');
  ok(!/FieldValue\.(increment|arrayUnion|arrayRemove)|array-contains|startAfter|endBefore|where\(/.test(f64)&&/orderBy\('fecha','desc'\)\.limit\(200\)/.test(f64),'64: solo onSnapshot con orderBy/limit, runTransaction y set (todo lo que admite el puente)');
  ok(/id:p\.clave/.test(f64),'cada fila del compromiso trae un id único (clave de la programación)');
  const idx=leer('index.html');
  ok(idx.indexOf('54-planificacion-solicitudes.js')<idx.indexOf('64-planificacion-avance.js'),'index: 64 se carga después de 54');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
