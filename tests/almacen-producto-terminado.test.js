/* Almacén › Ingreso de producto terminado: lógica de la bandeja, reglas de la migración glacial_56 y conexiones. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const P=require(R+'/js/almacen/101-producto-terminado.js');

const pal=(id,linea,marca,pres,paletas,und,ms,extra)=>Object.assign({id,linea,fecha:'2026-11-16',turno:'DÍA',marca,presentacion:pres,hora:'10:20',tipoPaleta:'COMPLETA',paletas,totalUnidades:und,usuario:'Yeikari M.',creadoEn:ms,actualizadoEn:ms},extra||{});
const paletas=[pal('pal_1','PET1','Scala','2.5 L',2,2400,1000),pal('pal_2','PET2','Aro','340 ml',3,3600,2000),pal('pal_3','B7L','Scala','7 L',1,840,3000),pal('pal_0','PET1','Scala','2.5 L',1,0,500)];
let b=P.bandeja(paletas,[]);
ok(b.length===3&&b.every(x=>x.estado==='PENDIENTE')&&b.map(x=>x.id).join()==='pal_3,pal_2,pal_1','todo lo anotado queda «por recibir» (más recientes primero) y las anotaciones sin unidades no cuentan');

const rec=(paleta,n,estado,extra)=>Object.assign({opId:P.idRecepcion(paleta.id,n),tipo:'RECEPCION',estado,paletaId:paleta.id,secuencia:n,unidadesAnotadas:paleta.totalUnidades,unidadesRecibidas:paleta.totalUnidades,diferencia:0,anotadoActualizadoEn:paleta.actualizadoEn,usuario:'Ana'},extra||{});
b=P.bandeja(paletas,[rec(paletas[0],1,'RECIBIDA'),rec(paletas[1],1,'DIFERENCIA',{unidadesRecibidas:3480,diferencia:-120,motivo:'una caja rota'}),rec(paletas[2],1,'OBSERVADA',{unidadesRecibidas:0,diferencia:-840,motivo:'film roto'})]);
const e=id=>b.find(x=>x.id===id);
ok(e('pal_1').estado==='RECIBIDA'&&e('pal_2').estado==='DIFERENCIA'&&e('pal_3').estado==='OBSERVADA','estados: recibida, con diferencia y en observación');
let r=P.resumen(b,'2026-11-16');
ok(r.pendientes===0&&r.recibidas===2&&r.diferencias===1&&r.faltante===120&&r.observadas===1&&r.recibidasHoyUnidades===2400+3480&&r.recibidasHoyPaletas===5,'resumen: recibidas, faltante, observadas y lo de hoy');
// anulación: vuelve a por recibir y la siguiente recepción es la R2
const anu={opId:P.idAnulacion('pal_1_R1'),tipo:'ANULACION',anulaA:'pal_1_R1',paletaId:'pal_1',motivo:'se recibió por error'};
b=P.bandeja(paletas,[rec(paletas[0],1,'RECIBIDA'),anu]);
ok(e('pal_1').estado==='PENDIENTE'&&e('pal_1').anulada&&e('pal_1').siguiente===2&&P.construirDocumento(e('pal_1'),{tipo:'RECIBIDA'}).opId==='pal_1_R2','anular devuelve la paleta a «por recibir» y la nueva recepción usa el id _R2 (no se pisa el historial)');
b=P.bandeja(paletas,[rec(paletas[0],1,'RECIBIDA'),anu,rec(paletas[0],2,'DIFERENCIA',{unidadesRecibidas:2300,diferencia:-100,motivo:'faltaron 100'})]);
ok(e('pal_1').estado==='DIFERENCIA'&&e('pal_1').historial.length===2,'después de anular se puede volver a recibir; el historial conserva ambas');
// el acumulado
b=P.bandeja(paletas,[rec(paletas[0],1,'RECIBIDA'),rec(paletas[1],1,'DIFERENCIA',{unidadesRecibidas:3480,diferencia:-120,motivo:'x1234'}),rec(paletas[2],1,'OBSERVADA',{unidadesRecibidas:0,diferencia:-840,motivo:'film roto'})]);
const ac=P.acumulado(b,'');
ok(ac.length===2&&ac[0].unidades===3480&&ac[1].unidades===2400&&!ac.some(x=>x.linea==='B7L'),'el acumulado suma lo que llegó y NO incluye las paletas en observación');
// cambios posteriores de Producción
const editada=paletas.map(p=>p.id==='pal_1'?{...p,totalUnidades:2300,actualizadoEn:9999}:p);
b=P.bandeja(editada,[rec(paletas[0],1,'RECIBIDA')]);
ok(e('pal_1').cambioPosterior===true,'si Producción cambia la anotación después de recibirla, se avisa');

// validación
const pend=P.bandeja(paletas,[]).find(x=>x.id==='pal_1');
ok(P.validarRecepcion(pend,{tipo:'RECIBIDA'}).length===0,'recibir completo no pide nada más');
ok(P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:2400,motivo:'lo mismo'}).length>0,'«con diferencia» con la misma cantidad se rechaza (usa Recibir)');
ok(P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:2300,motivo:'ok'}).length>0&&P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:2300.5,motivo:'faltaron cajas'}).length>0&&P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:-3,motivo:'faltaron cajas'}).length>0,'diferencia: motivo de 5+ caracteres y unidades enteras de 0 o más');
ok(P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:2300,motivo:'faltaron 100 UND'}).length===0&&P.validarRecepcion(pend,{tipo:'DIFERENCIA',unidadesRecibidas:0,motivo:'no llegó la paleta'}).length===0,'diferencia válida (también 0 unidades)');
ok(P.validarRecepcion(pend,{tipo:'OBSERVADA',motivo:''}).length>0&&P.validarRecepcion(pend,{tipo:'OBSERVADA',motivo:'film roto'}).length===0,'observación: el motivo es obligatorio');
ok(P.validarRecepcion(P.bandeja(paletas,[rec(paletas[0],1,'RECIBIDA')]).find(x=>x.id==='pal_1'),{tipo:'RECIBIDA'}).length>0,'no se puede recibir dos veces la misma anotación');
const d=P.construirDocumento(pend,{tipo:'OBSERVADA',motivo:'film roto'});
ok(d.estado==='OBSERVADA'&&d.unidadesRecibidas===0&&d.unidadesAnotadas===2400&&d.diferencia===-2400&&d.opId==='pal_1_R1'&&d.linea==='PET1','el documento de una observación: 0 recibidas, todo lo anotado como diferencia');

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
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
