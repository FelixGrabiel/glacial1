/* Almacén › Ingreso de producto terminado: lógica de la bandeja, reglas de la migración glacial_56 y conexiones. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const P=require(R+'/js/almacen/101-producto-terminado.js');

// Producción anota ACUMULADOS (cada registro dice «llevo N paletas»); manda el último de cada tipo. Caso real: 6, 10, 15 y 28 acumuladas de Scala 7 L (126 und por paleta) + saldos.
const pal=(id,linea,marca,pres,paletas,und,ms,extra)=>Object.assign({id,linea,fecha:'2026-11-16',turno:'DÍA',marca,presentacion:pres,hora:'10:20',tipoPaleta:'COMPLETA',paletas,totalUnidades:und,usuario:'Yeikari M.',creadoEn:ms,actualizadoEn:ms},extra||{});
const b7=[pal('a1','B7L','Scala','7 Litros',6,756,1000),pal('s1','B7L','Scala','7 Litros',1,10,1001,{tipoPaleta:'INCOMPLETA'}),pal('a2','B7L','Scala','7 Litros',10,1260,2000),pal('s2','B7L','Scala','7 Litros',1,88,2001,{tipoPaleta:'INCOMPLETA'}),
  pal('a3','B7L','Scala','7 Litros',15,1890,3000),pal('s3','B7L','Scala','7 Litros',1,90,3001,{tipoPaleta:'INCOMPLETA'}),pal('a4','B7L','Scala','7 Litros',28,3528,4000)];
let b=P.bandeja(b7,[]);
ok(b.length===1&&b[0].estado==='PENDIENTE'&&b[0].paleta.paletas===28&&b[0].paleta.totalUnidades===3528,'las anotaciones son ACUMULADAS: 6+10+15+28 se leen como 28 paletas (no 59) y 3 528 UND');
ok(b[0].saldo===90&&b[0].acumulado.paletas===28,'el saldo incompleto es el último (90 UND) y no se suma a las paletas completas');
const ea=P.estadoActual(b7);ok(ea.paletas===28&&ea.unidades===3528&&ea.saldo===90,'el último acumulado coincide con Avance y Cierre (28 completas, 3 528 UND, saldo 90)');
const id=b[0].id;
ok(/^PT_2026-11-16_b7l_dia_scala_7l_/.test(id)||/^PT_2026-11-16_/.test(id),'el id de la combinación es seguro y estable (' + id + ')');

// se recibe lo que falta: a las 10:03 había 10 acumuladas → se reciben 10; luego llegan a 28 y faltan 18
const hasta10=b7.filter(x=>x.creadoEn<=2001);
let p10=P.bandeja(hasta10,[])[0];
ok(p10.paleta.paletas===10&&p10.paleta.totalUnidades===1260,'a las 10:03 Producción llevaba 10 paletas: eso es lo que hay por recibir');
const d1=P.construirDocumento(p10,{tipo:'RECIBIDA'});
ok(d1.opId===id+'_R1'&&d1.paletaId===id&&d1.paletasAnotadas===10&&d1.unidadesAnotadas===1260&&d1.unidadesRecibidas===1260&&d1.acumuladoPaletas===10,'recibir 10 guarda el tramo: 10 paletas, 1 260 UND');
const rec1=Object.assign({},d1,{uid:'u1',guardadoEn:5000});
b=P.bandeja(b7,[rec1]);
const pend=b.find(x=>x.estado==='PENDIENTE');
ok(pend&&pend.paleta.paletas===18&&pend.paleta.totalUnidades===3528-1260&&pend.siguiente===2&&pend.cubierto.paletas===10,'con 28 acumuladas y 10 ya recibidas faltan 18 paletas (2 268 UND), no 59');
ok(b.some(x=>x.estado==='RECIBIDA'&&x.id===d1.opId&&x.paleta.paletas===10),'la recepción vigente aparece en Recibidas');
const d2=P.construirDocumento(pend,{tipo:'RECIBIDA'});
b=P.bandeja(b7,[rec1,Object.assign({},d2,{uid:'u1',guardadoEn:6000})]);
ok(!b.some(x=>x.estado==='PENDIENTE')&&b.filter(x=>x.estado==='RECIBIDA').reduce((n,x)=>n+x.paleta.paletas,0)===28,'recibidas 10 + 18 = 28: ya no queda nada por recibir');
let r=P.resumen(b,'2026-11-16');
ok(r.pendientes===0&&r.recibidas===2&&r.recibidasHoyPaletas===28&&r.recibidasHoyUnidades===3528,'resumen: 28 paletas recibidas, 3 528 UND');
// anulación: el tramo vuelve a por recibir
const anu={opId:P.idAnulacion(d2.opId),tipo:'ANULACION',anulaA:d2.opId,paletaId:id,motivo:'se recibió por error'};
b=P.bandeja(b7,[rec1,Object.assign({},d2,{uid:'u1',guardadoEn:6000}),anu]);
const pa=b.find(x=>x.estado==='PENDIENTE');
ok(pa&&pa.paleta.paletas===18&&pa.siguiente===3&&P.construirDocumento(pa,{tipo:'RECIBIDA'}).opId===id+'_R3','anular devuelve las 18 paletas a «por recibir» y la nueva recepción usa _R3');
const recib=b.find(x=>x.id===d1.opId);
ok(P.documentoAnulacion(recib,'se recibió por error').paletaId===id&&P.documentoAnulacion(recib,'x').anulaA===d1.opId,'la anulación apunta a la recepción y a su combinación');

// con diferencia / observada
p10=P.bandeja(b7,[])[0];
ok(P.validarRecepcion(p10,{tipo:'RECIBIDA'}).length===0,'recibir lo nuevo no pide nada más');
ok(P.validarRecepcion(p10,{tipo:'DIFERENCIA',unidadesRecibidas:3528,motivo:'lo mismo'}).length>0,'«con diferencia» con la misma cantidad se rechaza (usa Recibir)');
ok(P.validarRecepcion(p10,{tipo:'DIFERENCIA',unidadesRecibidas:3400,motivo:'ok'}).length>0&&P.validarRecepcion(p10,{tipo:'DIFERENCIA',unidadesRecibidas:3400.5,motivo:'faltaron cajas'}).length>0&&P.validarRecepcion(p10,{tipo:'DIFERENCIA',unidadesRecibidas:-1,motivo:'faltaron cajas'}).length>0,'la diferencia pide número entero y motivo de 5 o más caracteres');
ok(P.validarRecepcion(p10,{tipo:'DIFERENCIA',unidadesRecibidas:3400,motivo:'faltaron 128 UND'}).length===0&&P.validarRecepcion(p10,{tipo:'OBSERVADA',motivo:'film roto'}).length===0&&P.validarRecepcion(p10,{tipo:'OBSERVADA',motivo:''}).length>0,'diferencia y observación válidas con su motivo');
const dd=P.construirDocumento(p10,{tipo:'DIFERENCIA',unidadesRecibidas:3400,motivo:'faltaron 128 UND'});
ok(dd.estado==='DIFERENCIA'&&dd.unidadesRecibidas===3400&&dd.diferencia===-128&&dd.unidadesAnotadas===3528&&dd.linea==='B7L','el documento con diferencia guarda lo que llegó (3 400) y la diferencia (−128)');
b=P.bandeja(b7,[Object.assign({},dd,{uid:'u1',guardadoEn:7000})]);
let ac=P.acumulado(b,'');
ok(ac.length===1&&ac[0].unidades===3400&&r!==null,'el acumulado suma lo que llegó (3 400), no lo anotado');
const dobs=P.construirDocumento(p10,{tipo:'OBSERVADA',motivo:'film roto'});
b=P.bandeja(b7,[Object.assign({},dobs,{uid:'u1',guardadoEn:7000})]);
ok(!b.some(x=>x.estado==='PENDIENTE')&&P.acumulado(b,'').length===0&&P.resumen(b,'').observadas===1,'una paleta en observación sale de «por recibir», cuenta como observada y NO entra al acumulado');

// si Producción baja el acumulado después de recibir, se avisa
const baja=b7.concat([pal('a5','B7L','Scala','7 Litros',20,2520,9000)]);
b=P.bandeja(baja,[Object.assign({},d1,{uid:'u1',guardadoEn:5000}),Object.assign({},d2,{uid:'u1',guardadoEn:6000})]);
ok(b.some(x=>x.cambioPosterior===true),'si Producción corrige el acumulado por debajo de lo recibido (28 → 20), se avisa en la recepción');

// varias combinaciones: se agrupan por producto, los turnos no se mezclan
const mix=[pal('x1','PET1','Scala','2.5 L',5,600,1000),pal('x2','PET1','Scala','2.5 L',3,360,1500,{turno:'NOCHE'}),pal('x3','PET2','Aro','340 ml',2,300,2000)];
b=P.bandeja(mix,[]);
const g=P.agrupar(b);
ok(b.length===3&&g.length===2&&g[0].paletas===8&&g[0].items.length===2&&g[1].paletas===2,'cada turno acumula por separado y se agrupan por línea y producto (PET1 Scala: 5 + 3 = 8 paletas)');
ok(P.claveGrupo(pal('q','PET1','Scala','2.5 L',1,1,1))===P.claveGrupo(pal('q','PET1','scala','2.5 litros',1,1,1)),'la combinación se normaliza igual que en Producción (2.5 L = 2.5 litros)');

// cambió la tasa de unidades por paleta: igual hay paletas nuevas por recibir (se estiman unidades con la tasa actual)
{const k=pal('k1','PET1','Scala','2.5 L',2,2400,1000),k2=pal('k2','PET1','Scala','2.5 L',3,3000,2000);
 const dk=P.construirDocumento(P.bandeja([k],[])[0],{tipo:'RECIBIDA'});
 const it=P.bandeja([k,k2],[Object.assign({},dk,{uid:'u',guardadoEn:1500})]).find(x=>x.estado==='PENDIENTE');
 ok(it&&it.paleta.paletas===1&&it.paleta.totalUnidades===600,'si cambia la tasa de unidades por paleta, la paleta nueva igual se recibe (unidades estimadas con la tasa actual)');}

// ---- SALDO INCOMPLETO: el supervisor entrega, Almacén cuenta en paquetes, deben coincidir exacto ----
{
  const eq=(l,m,pr)=>l==='B7L'?{factor:2,singular:'paquete',plural:'paquetes'}:null;
  // B7L Scala 7 L: el saldo en línea es 7 paquetes de 2 bidones = 14 UND (registro trae paquetesIncompleta)
  const reg=[pal('a1','B7L','Scala','7 Litros',28,3528,1000),pal('s1','B7L','Scala','7 Litros',1,14,1001,{tipoPaleta:'INCOMPLETA',paquetesIncompleta:7,unidadesIncompleta:14})];
  let sl=P.saldos(reg,[],[],'',eq);
  ok(sl.length===1&&sl[0].estado==='EN_LINEA'&&sl[0].saldoLinea.unidades===14&&sl[0].saldoLinea.paquetes===7&&sl[0].factor===2,'un saldo anotado y aún no entregado aparece «en línea» (7 paquetes = 14 UND)');
  ok(P.saldos([pal('a','B7L','Scala','7 Litros',28,3528,1)],[],[],'',eq).length===0,'sin saldo no hay nada que entregar');
  const k=sl[0].id;
  // el supervisor entrega
  ok(P.validarEntregaSaldo(sl[0],{cantidad:0}).length>0&&P.validarEntregaSaldo(sl[0],{cantidad:2.5}).length>0&&P.validarEntregaSaldo(sl[0],{cantidad:7}).length===0,'la entrega pide un número entero de paquetes (1 o más)');
  const ent=Object.assign(P.construirEntregaSaldo(sl[0],{cantidad:7}),{uid:'sup',guardadoEn:2000});
  ok(ent.opId===k+'_E1'&&ent.tipo==='ENTREGA'&&ent.paletaId===k&&ent.unidades===14&&ent.paquetes===7&&ent.factor===2,'la entrega guarda 7 paquetes → 14 UND con su equivalencia');
  sl=P.saldos(reg,[],[ent],'',eq);
  ok(sl[0].estado==='ENTREGADO'&&P.resumenSaldos(sl).porContar===1,'entregado por el supervisor: falta que Almacén lo cuente');
  // Almacén cuenta en paquetes y el sistema convierte a UND
  ok(P.validarConteoSaldo(sl[0],{cantidad:0}).length>0&&P.validarConteoSaldo(sl[0],{cantidad:'x'}).length>0&&P.validarConteoSaldo(sl[0],{cantidad:7}).length===0,'el conteo pide un entero de paquetes');
  const cont=P.construirConteoSaldo(sl[0],{cantidad:7});
  ok(cont.opId===k+'_S_R1'&&cont.paletaId===k+'_S'&&cont.claveSaldo===k&&cont.esSaldo===true&&cont.unidadesRecibidas===14&&cont.unidadesAnotadas===14&&cont.paquetes===7&&cont.estado==='RECIBIDA'&&cont.tipo==='RECEPCION','Almacén cuenta 7 paquetes y se guardan 14 UND (conversión automática)');
  ok(!('entrega' in cont)&&!JSON.stringify(cont).includes('"unidades"'),'el conteo de Almacén no lleva la cifra del supervisor (conteo a ciegas)');
  sl=P.saldos(reg,[Object.assign({},cont,{uid:'alm',guardadoEn:3000})],[ent],'',eq);
  ok(sl[0].estado==='CONFORME'&&P.resumenSaldos(sl).conformes===1,'7 paquetes = 7 paquetes: CONFORME');
  // diferencia: exacto
  const cont6=Object.assign(P.construirConteoSaldo(P.saldos(reg,[],[ent],'',eq)[0],{cantidad:6}),{uid:'alm',guardadoEn:3000});
  sl=P.saldos(reg,[cont6],[ent],'',eq);
  ok(sl[0].estado==='DIFERENCIA'&&sl[0].conteo.unidadesRecibidas===12&&sl[0].entrega.unidades===14&&P.resumenSaldos(sl).diferencias===1,'6 paquetes contra 7: CON DIFERENCIA (tiene que coincidir exacto)');
  ok(P.validarConteoSaldo(sl[0],{cantidad:7}).length>0,'con un conteo vigente no se puede registrar otro: primero se anula');
  // Almacén corrige: anula su conteo y vuelve a contar → conforme
  const anul={opId:P.idAnulacion(cont6.opId),tipo:'ANULACION',anulaA:cont6.opId,paletaId:cont6.paletaId,motivo:'recontamos con el supervisor'};
  sl=P.saldos(reg,[cont6,anul],[ent],'',eq);
  ok(sl[0].estado==='ENTREGADO'&&sl[0].siguienteConteo===2,'al anular su conteo vuelve a «entregado» y el siguiente conteo es _R2');
  const cont7=Object.assign(P.construirConteoSaldo(sl[0],{cantidad:7}),{uid:'alm',guardadoEn:4000});
  ok(cont7.opId===k+'_S_R2'&&P.saldos(reg,[cont6,anul,cont7],[ent],'',eq)[0].estado==='CONFORME','tras recontar 7 paquetes queda CONFORME');
  // el supervisor corrige su entrega
  const anE=P.documentoAnulacionEntrega(P.saldos(reg,[cont6],[ent],'',eq)[0],'conté mal el saldo');
  ok(anE.tipo==='ANULACION'&&anE.opId==='ANUL_'+ent.opId&&anE.anulaA===ent.opId&&anE.paletaId===k,'el supervisor anula su entrega con motivo');
  sl=P.saldos(reg,[cont6],[ent,anE],'',eq);
  ok(sl[0].estado==='SIN_ENTREGA'&&sl[0].siguienteEntrega===2,'sin entrega vigente y con conteo de Almacén: «falta la entrega del supervisor»');
  const ent6=Object.assign(P.construirEntregaSaldo(sl[0],{cantidad:6}),{uid:'sup',guardadoEn:5000});
  ok(ent6.opId===k+'_E2'&&P.saldos(reg,[cont6],[ent,anE,ent6],'',eq)[0].estado==='CONFORME','el supervisor entrega de nuevo 6 paquetes y coincide con lo que contó Almacén');
  // sin equivalencia: se cuenta en unidades
  const sinEq=P.saldos([pal('b','C20L','San Fernando','20 L',3,60,1),pal('bs','C20L','San Fernando','20 L',1,5,2,{tipoPaleta:'INCOMPLETA'})],[],[],'',null);
  ok(sinEq[0].factor===null&&P.construirConteoSaldo(sinEq[0],{cantidad:5}).unidadesRecibidas===5&&P.construirConteoSaldo(sinEq[0],{cantidad:5}).paquetes===null,'sin equivalencia el conteo se registra directo en unidades');
  // las recepciones de saldo aparecen en Recibidas y suman UND al acumulado (no paletas completas)
  const b=P.bandeja(reg,[Object.assign({},cont7,{uid:'alm',guardadoEn:4000})]);
  ok(b.some(x=>x.recepcion&&x.recepcion.esSaldo&&x.estado==='RECIBIDA')&&P.acumulado(b,'').some(a=>a.unidades===14&&a.paletas===0),'el saldo contado entra al acumulado recibido en UND y no suma paletas completas');
  ok(b.filter(x=>x.estado==='PENDIENTE').length===1&&b.find(x=>x.estado==='PENDIENTE').paleta.paletas===28,'el conteo del saldo no descuenta paletas completas');
}

// migración
const sql=leer('supabase/migraciones/glacial_56_almacen_producto_terminado.sql');
ok(/almacenPtRecepcion/.test(sql)&&/if accion <> 'create' then return false; end if/.test(sql)&&/ap_alm/.test(sql)&&/pt_recepcion_valida\(n, d, u, ahora\)/.test(sql),'glacial_56: colección inmutable (solo crear), con el permiso de Almacén y validación');
ok(/n->'guardadoEn' = ahora/.test(sql)&&/n->>'uid' = u/.test(sql)&&/char_length\(btrim\(coalesce\(n->>'motivo', ''\)\)\) >= 5/.test(sql)&&/'RECIBIDA', 'DIFERENCIA', 'OBSERVADA'/.test(sql)&&/d = 'ANUL_' \|\| /.test(sql),'glacial_56: uid y hora del servidor, motivo de 5+ caracteres, estados válidos y anulación con id ANUL_');
ok(/cuenta <> 1 then raise exception/.test(sql)&&/position\('almacenPtRecepcion' in def\) = 0/.test(sql)&&/return aut and not mant/.test(sql),'glacial_56: anclas verificadas (se detiene si no aparecen una sola vez), repetible, lectura como apAlmacenMov');
// conexiones
const idx=leer('index.html'),sb=leer('js/nucleo/04-sidebar.js'),js=leer('js/almacen/101-producto-terminado.js');
ok(/id="btn-almacen-pt"[\s\S]{0,120}goAlmacenPT\(\)/.test(idx)&&idx.indexOf('id="btn-almacen-pt"')>idx.indexOf('id="sidebar-group-almacen"')&&idx.indexOf('id="btn-almacen-pt"')<idx.indexOf('id="sidebar-group-calidad"'),'el menú Almacén tiene «Producto terminado»');
ok(/state\.currentTab==='almacen-pt'\)return 'almacen'/.test(sb)&&/101-producto-terminado\.js/.test(idx),'el grupo Almacén se abre solo y el módulo se carga');
ok(/tienePermiso\('moduloAlmacen'\)/.test(js)&&!/sync'\)\.doc\('paletas'\)\.(set|update)/.test(js)&&/db\.collection\('almacenPtRecepcion'\)/.test(js),'usa el permiso de Almacén, escribe solo en almacenPtRecepcion y nunca en sync/paletas');
ok(P.INICIO_PT==='2026-11-16','el producto terminado cuenta desde el 16/11/2026');
{const f=(id,fecha)=>pal(id,'PET1','Scala','2.5 L',2,240,1000,{fecha});const ps=[f('a','2026-11-15'),f('b','2026-11-16'),f('c','2026-11-17')];
 ok(P.bandeja(ps,[],P.INICIO_PT).length===2&&P.bandeja(ps,[]).length===3,'lo anotado antes de la fecha de inicio no entra a la bandeja');}
{const s58=leer('supabase/migraciones/glacial_58_almacen_saldo_entrega.sql');
 ok(/almacenPtSaldoEntrega/.test(s58)&&/accion = 'create' and coalesce\(\(k->>'opera'\)::boolean, false\) and glacial_fs\.pt_saldo_entrega_valida/.test(s58)&&/n->'guardadoEn' = ahora/.test(s58)&&/'ENTREGA'/.test(s58)&&/>= 5/.test(s58),'glacial_58: libro inmutable de entregas, solo quien opera Producción, con hora del servidor y motivo en la anulación');
 ok(/cuenta <> 1 then raise exception/.test(s58)&&/c in \('almacenPtRecepcion', 'almaceneros', 'almacenPtSaldoEntrega'\)/.test(s58),'glacial_58: anclas verificadas y la cuenta compartida de Almacén puede leer las entregas');
 const j16c=leer('js/produccion/16c-saldo-entrega.js');
 ok(/db\.collection\('almacenPtSaldoEntrega'\)\.doc\(doc\.opId\)\.set/.test(j16c)&&!/sync'\)\.doc\('paletas'\)\.(set|update)/.test(j16c),'el panel del supervisor escribe solo en almacenPtSaldoEntrega y nunca toca sync/paletas');}
ok(P.turnoCoincide('DÍA','DIA')&&P.turnoCoincide('INTERMEDIO','DIA')&&!P.turnoCoincide('NOCHE','DIA')&&P.turnoCoincide('NOCHE','NOCHE')&&!P.turnoCoincide('DÍA','NOCHE')&&P.turnoCoincide('NOCHE','TODOS')&&P.turnoCoincide('DÍA',undefined),'filtro de turno: Día (con Intermedio), Noche y Todos');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
