/* Almacén › Producto terminado: despachos, stock, alertas y resumen del turno (js/almacen/104-despachos-resumen.js) + migración glacial_61. node tests/almacen-despachos.test.js */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const N=require(R+'/js/almacen/104-despachos-resumen.js');
const H=3600000,AHORA=1763400000000;

// ---- stock ----
const rec=[{linea:'PET1',marca:'Scala',presentacion:'2.5 L',paletas:10,unidades:12000},{linea:'B7L',marca:'Scala',presentacion:'7 L',paletas:0,unidades:14}];
const d1={opId:'DESP_1763400000000_ab12',tipo:'DESPACHO',destino:'Cliente Norte',referencia:'G001',items:[{linea:'PET1',marca:'Scala',presentacion:'2.5 L',paletas:4,unidades:4800}]};
let st=N.stock(rec,[]);
ok(st.lista.length===2&&st.total.stockPal===10&&st.total.stockUnd===12014,'stock sin despachos = lo recibido (paletas completas y unidades; el saldo contado entra solo en unidades)');
st=N.stock(rec,[Object.assign({},d1,{guardadoEn:1})]);
const p1=st.lista.find(f=>f.linea==='PET1');
ok(p1.desPal===4&&p1.desUnd===4800&&p1.stockPal===6&&p1.stockUnd===7200&&st.total.stockPal===6,'un despacho resta paletas y unidades del stock del producto');
const anu={opId:'ANUL_'+d1.opId,tipo:'ANULACION',anulaA:d1.opId,motivo:'error de cliente'};
st=N.stock(rec,[d1,anu]);
ok(N.vigentes([d1,anu]).length===0&&st.lista.find(f=>f.linea==='PET1').stockPal===10,'al anular un despacho esas paletas vuelven al stock');
ok(N.unidadesPorPaleta(p1)===1200&&N.unidadesPorPaleta({recPal:0,recUnd:5})===0,'unidades por paleta aproximadas para sugerir las unidades');

// ---- validación y documento ----
const lista=N.stock(rec,[]).lista;
const form={destino:'Cliente Norte',referencia:'G001-23',lineas:[{clave:'PET1|Scala|2.5 L',paletas:'2',unidades:'2400'}]};
ok(N.validarDespacho(form,lista).length===0,'un despacho válido no tiene errores');
ok(N.validarDespacho({...form,destino:'x'},lista).length===1&&N.validarDespacho({...form,destino:''},lista).length===1,'el destino pide al menos 2 caracteres');
ok(N.validarDespacho({...form,lineas:[]},lista).length===1&&N.validarDespacho({...form,lineas:[{clave:'PET1|Scala|2.5 L',paletas:'',unidades:''}]},lista).length===1,'hace falta al menos un producto con cantidad');
ok(N.validarDespacho({...form,lineas:[{clave:'PET1|Scala|2.5 L',paletas:'2',unidades:'99999'}]},lista).some(e=>/solo hay 12000/.test(e)),'no se puede despachar más unidades que el stock');
ok(N.validarDespacho({...form,lineas:[{clave:'PET1|Scala|2.5 L',paletas:'11',unidades:'1000'}]},lista).some(e=>/solo hay 10/.test(e)),'no se puede despachar más paletas que el stock');
ok(N.validarDespacho({...form,lineas:[{clave:'PET1|Scala|2.5 L',paletas:'1.5',unidades:'1000'}]},lista).length===1&&N.validarDespacho({...form,lineas:[{clave:'PET9|X|Y',paletas:'1',unidades:'10'}]},lista).some(e=>/no tiene stock/.test(e)),'paletas enteras y producto con stock');
ok(N.validarDespacho({...form,lineas:[{clave:'B7L|Scala|7 L',paletas:'0',unidades:'14'}]},lista).length===0,'el saldo contado se puede despachar en unidades (0 paletas)');
// despacho tras anular: el stock vuelve a alcanzar
const doc=N.construirDespacho(form,lista,AHORA,'ab12');
ok(doc.opId==='DESP_1763400000000_ab12'&&/^DESP_[0-9]{10,14}_[a-z0-9]{3,8}$/.test(doc.opId)&&doc.tipo==='DESPACHO'&&doc.destino==='Cliente Norte'&&doc.referencia==='G001-23'&&doc.items.length===1&&doc.items[0].paletas===2&&doc.items[0].unidades===2400&&doc.items[0].linea==='PET1','el documento trae destino, referencia y líneas con paletas y unidades (id que acepta el servidor)');
ok(N.construirDespacho({...form,referencia:'  '},lista,AHORA,'x').referencia===null&&/^DESP_\d{13}_[a-z0-9]{4,6}$/.test(N.construirDespacho(form,lista,AHORA).opId),'sin referencia se guarda null; el id lleva sufijo aleatorio válido');
const a=N.docAnulacionDespacho(d1,'  error de cliente ');
ok(a.opId==='ANUL_'+d1.opId&&a.tipo==='ANULACION'&&a.anulaA===d1.opId&&a.motivo==='error de cliente','la anulación apunta al despacho y lleva su motivo');

// ---- alertas ----
const pen=[{estado:'PENDIENTE',ms:AHORA-5*H,paleta:{paletas:3}},{estado:'PENDIENTE',ms:AHORA-1*H,paleta:{paletas:2}},{estado:'RECIBIDA',ms:AHORA-9*H,paleta:{paletas:9}}];
let al=N.alertas(pen,[],AHORA);
ok(al.length===1&&al[0].tipo==='PALETAS'&&/3 paletas llevan más de 4 h/.test(al[0].texto)&&al[0].nivel==='ambar','alerta de paletas por recibir hace más de 4 h (las recientes y las ya recibidas no cuentan)');
ok(N.alertas([{estado:'PENDIENTE',ms:AHORA-13*H,paleta:{paletas:1}}],[],AHORA)[0].nivel==='roja','pasadas 12 h la alerta es roja');
al=N.alertas([],[{estado:'ENTREGADO',entrega:{guardadoEn:AHORA-3*H}},{estado:'ENTREGADO',entrega:{guardadoEn:AHORA-1*H}},{estado:'DIFERENCIA'}],AHORA);
ok(al.some(x=>x.tipo==='SALDOS'&&/1 saldo entregado/.test(x.texto))&&al.some(x=>x.tipo==='DIFERENCIA'&&x.nivel==='roja'),'alertas de saldos entregados sin contar hace más de 2 h y de saldos con diferencia');
ok(N.alertas([],[],AHORA).length===0,'sin pendientes no hay alertas');

// ---- resumen del turno ----
const txt=N.resumenTurnoTexto({fecha:'2026-11-18',turno:'DIA',
  recibidas:[{estado:'RECIBIDA',paleta:{linea:'PET1',marca:'Scala',presentacion:'2.5 L',paletas:6},recepcion:{unidadesRecibidas:7200}},{estado:'DIFERENCIA',paleta:{linea:'PET1',marca:'Scala',presentacion:'2.5 L',paletas:2},recepcion:{unidadesRecibidas:2300,diferencia:-100,motivo:'una caja rota'}},{estado:'OBSERVADA',paleta:{linea:'PET2',marca:'Aro',presentacion:'340 ml',paletas:1},recepcion:{motivo:'film roto'}}],
  pendientes:[{paleta:{linea:'B7L',marca:'Scala',presentacion:'7 L',paletas:4,totalUnidades:504}}],saldos:[{estado:'ENTREGADO',paleta:{linea:'B7L',marca:'Scala',presentacion:'7 L'}}],
  despachos:[Object.assign({},d1,{guardadoEn:Date.parse('2026-11-18T15:00:00-05:00')})],stock:N.stock(rec,[])});
ok(/RESUMEN ALMACÉN/.test(txt)&&/18\/11\/2026 · Turno: Día \(Día \+ Intermedio\)/.test(txt),'el resumen dice la fecha y el turno');
ok(/PET1 · Scala 2\.5 L: 6 paletas · 9[.,\s]?500 UND/.test(txt)&&/Total: 6 paletas/.test(txt),'recibido por producto: 6 paletas completas y las unidades que llegaron (incluida la diferencia)');
ok(/diferencia de -100 UND \(una caja rota\)/.test(txt)&&/en observación \(film roto\)/.test(txt),'incluye diferencias y observadas con su motivo');
ok(/POR RECIBIR[\s\S]*B7L · Scala 7 L: 4 paletas/.test(txt)&&/entregado, falta contar/.test(txt),'incluye lo pendiente y los saldos sin cerrar');
ok(/Cliente Norte \(G001\): 4 paletas · 4[.,\s]?800 UND/.test(txt)&&/STOCK ACTUAL: 10 paletas/.test(txt),'incluye los despachos del día y el stock actual');
ok(/Sin despachos/.test(N.resumenTurnoTexto({fecha:'2026-11-17',turno:'NOCHE',recibidas:[],pendientes:[],saldos:[],despachos:[Object.assign({},d1,{guardadoEn:Date.parse('2026-11-18T15:00:00-05:00')})]}))&&/Turno: Noche/.test(N.resumenTurnoTexto({fecha:'2026-11-17',turno:'NOCHE'})),'los despachos de otro día no se mezclan y el turno Noche se rotula');

// ---- migración glacial_61 ----
const sql=leer('supabase/migraciones/glacial_61_almacen_despachos.sql');
ok(/almacenPtDespacho/.test(sql)&&/accion = 'create' and coalesce\(\(k->>'ap_alm'\)::boolean, false\) and glacial_fs\.pt_despacho_valido\(n, d, u, ahora\)/.test(sql)&&/if c = 'almacenPtDespacho' then return accion = 'create' and glacial_fs\.pt_despacho_valido/.test(sql),'glacial_61: libro inmutable; lo crean Almacén (ap_alm) y la cuenta compartida (alm_comp)');
ok(/n->'guardadoEn' = ahora/.test(sql)&&/n->>'uid' = u/.test(sql)&&/'ANULACION'/.test(sql)&&/>= 5/.test(sql)&&/between 1 and 30/.test(sql)&&/'almacenPtSaldoEntrega', 'almacenPtDespacho'/.test(sql),'glacial_61: hora del servidor, anulación con motivo, de 1 a 30 líneas y lectura de la cuenta compartida');
ok((sql.match(/cuenta <> 1 then raise exception/g)||[]).length>=4&&/falta glacial_60/.test(sql),'glacial_61: anclas verificadas (se detiene sin cambiar nada)');

// ---- conexiones ----
const idx=leer('index.html'),pt=leer('js/almacen/101-producto-terminado.js'),d=leer('js/almacen/104-despachos-resumen.js');
ok(idx.indexOf('103-almacen-compartido.js')<idx.indexOf('104-despachos-resumen.js')&&idx.indexOf('104-despachos-resumen.js')<idx.indexOf('12-init.js'),'orden de carga: 103 · 104, antes del arranque');
ok(/glacialAlmacenPTDespachos\.escuchar\(pintar\)/.test(pt)&&/tab\('stock','Stock'\)/.test(pt)&&/htmlAlertas\(ctx\(\)\)/.test(pt)&&/pdResumen\(\)/.test(pt),'Producto terminado muestra las pestañas Stock y Despachos, las alertas y el botón «Resumen del turno»');
ok(!/sync'\)\.doc\('paletas'\)\.(set|update)/.test(d)&&/db\.collection\('almacenPtDespacho'\)\.doc\(doc\.opId\)\.set/.test(d),'los despachos solo escriben en almacenPtDespacho (nunca en sync/paletas)');

// ---- rendimiento por almacenero ----
const ms=(h)=>AHORA-h*H;
const rr=[
 {tipo:'RECEPCION',estado:'RECIBIDA',paletasAnotadas:4,unidadesRecibidas:4800,almacenero:{nombre:'Luis Ramos'},guardadoEn:ms(1)},
 {tipo:'RECEPCION',estado:'RECIBIDA',paletasAnotadas:6,unidadesRecibidas:7200,almacenero:{nombre:'Luis Ramos'},guardadoEn:ms(2)},
 {tipo:'RECEPCION',estado:'DIFERENCIA',paletasAnotadas:2,unidadesRecibidas:2300,almacenero:{nombre:'Luis Ramos'},guardadoEn:ms(3)},
 {tipo:'RECEPCION',estado:'OBSERVADA',paletasAnotadas:1,unidadesRecibidas:0,almacenero:{nombre:'Rosa Vega'},guardadoEn:ms(3)},
 {tipo:'RECEPCION',estado:'RECIBIDA',esSaldo:true,unidadesRecibidas:14,almacenero:{nombre:'Rosa Vega'},guardadoEn:ms(4)},
 {tipo:'ANULACION',anulaA:'x',usuario:'Ana',guardadoEn:ms(5)},
 {tipo:'RECEPCION',estado:'RECIBIDA',paletasAnotadas:9,unidadesRecibidas:900,almacenero:{nombre:'Luis Ramos'},guardadoEn:ms(48)}];
const dd=[{tipo:'DESPACHO',items:[{paletas:3,unidades:3600},{paletas:1,unidades:1200}],almacenero:{nombre:'Rosa Vega'},guardadoEn:ms(2)},{tipo:'ANULACION',anulaA:'d',almacenero:{nombre:'Rosa Vega'},guardadoEn:ms(1)}];
let rd=N.rendimiento(rr,dd,0),luis=rd.find(x=>x.nombre==='Luis Ramos'),rosa=rd.find(x=>x.nombre==='Rosa Vega');
ok(luis.recibidas===3&&luis.paletas===19&&luis.diferencias===1&&luis.unidades===4800+7200+2300+900,'Luis: recibidas, paletas, unidades y diferencias contadas');
ok(rosa.observadas===1&&rosa.saldos===1&&rosa.despachos===1&&rosa.paletasDespachadas===4&&rosa.anulaciones===1&&rd.find(x=>x.nombre==='Ana').anulaciones===1,'Rosa: observadas, saldos contados, despachos con sus paletas y anulaciones; quien anula sin PIN aparece por su usuario');
rd=N.rendimiento(rr,dd,AHORA-24*H);
ok(rd.find(x=>x.nombre==='Luis Ramos').recibidas===2&&rd[0].nombre==='Luis Ramos','el período recorta lo anterior (no cuenta lo de hace 48 h) y ordena por actividad');

// ---- bandeja «Por atender» y vale de entrega (Asistente › Solicitudes) ----
const AE=require(R+'/js/asistente/80-almacen-enlace-nucleo.js');
const sol=(id,estado,min)=>({id,estado,historial:[{estado,en:AHORA-min*60000}]});
ok(AE.prioridadSolicitud(sol('a','SOLICITADA',30),AHORA).nivel==='normal'&&AE.prioridadSolicitud(sol('a','SOLICITADA',130),AHORA).nivel==='atencion'&&AE.prioridadSolicitud(sol('a','EN_PREPARACION',400),AHORA).nivel==='urgente'&&AE.prioridadSolicitud(sol('a','CERRADA',999),AHORA).atender===false&&AE.prioridadSolicitud(sol('a','BORRADOR',999),AHORA).atender===false,'prioridad: normal, atención (≥ 2 h) y urgente (≥ 6 h); lo cerrado o en borrador no se atiende');
const orden={SOLICITADA:0,EN_PREPARACION:1,ENTREGADA_PARCIAL:2,ENTREGADA:4,CERRADA:7};
const ord=AE.ordenarPorAtender([sol('c','CERRADA',10),sol('e','ENTREGADA',500),sol('s1','SOLICITADA',20),sol('s2','EN_PREPARACION',300),sol('s3','SOLICITADA',130)],AHORA,orden).map(x=>x.id).join();
ok(ord==='s2,s3,s1,e,c','primero lo que Almacén debe atender (la que más espera arriba), luego el resto por estado');
const ra=AE.resumenPorAtender([sol('s1','SOLICITADA',20),sol('s2','EN_PREPARACION',400),sol('s3','SOLICITADA',130),sol('c','CERRADA',999)],AHORA);
ok(ra.total===3&&ra.urgentes===1&&ra.atencion===1&&ra.masAntiguaMin===400&&AE.txtEspera(400)==='6 h 40 min'&&AE.txtEspera(45)==='45 min'&&AE.txtEspera(3000)==='2 d','resumen por atender: total, urgentes, con más de 2 h y la más antigua');
const insumos={TAPA:{nombre:'Tapa 28 mm',unidad:'UND'},ETI:{nombre:'Etiqueta',unidad:'UND'}};
const solV={id:'SOL-20261118-AB12',fecha:'2026-11-18',bloque:'NOCHE',creadoPor:'Rosa Asistente',observaciones:'urgente',items:[{insumo:'TAPA',unidad:'UND',solicitado:5000},{insumo:'ETI',unidad:'UND',solicitado:3000}],
  historial:[{estado:'SOLICITADA',en:1},{estado:'ENTREGADA_PARCIAL',entrega:true,entregas:{TAPA:3000,ETI:0},por:'Luis Ramos',en:AHORA,nota:'primera tanda'},{estado:'ENTREGADA',entrega:true,entregas:{TAPA:2000,ETI:3000},por:'Pedro Soto',en:AHORA+1000},{estado:'ENTREGADA',anulaEntrega:2,en:AHORA+2000}]};
const v1=AE.armarVale(solV,1,c=>insumos[c]);
ok(v1&&v1.numero==='SOL-20261118-AB12-E1'&&v1.entrego==='Luis Ramos'&&v1.solicito==='Rosa Asistente'&&v1.bloque==='Noche'&&v1.lineas.length===1&&v1.lineas[0].nombre==='Tapa 28 mm'&&v1.lineas[0].cantidad===3000&&v1.lineas[0].unidad==='UND','el vale de la entrega 1: n.º, quién entregó, quién solicitó y solo los insumos con cantidad (3 000 tapas)');
ok(AE.armarVale(solV,2,c=>insumos[c])===null&&AE.armarVale(solV,5,c=>insumos[c])===null,'una entrega anulada o inexistente no tiene vale');
const html=AE.valeHtml(v1,'18/11/2026 10:00');
ok(/VALE DE ENTREGA/.test(html)&&/SOL-20261118-AB12-E1/.test(html)&&/Tapa 28 mm/.test(html)&&/Entregó · Almacén/.test(html)&&/Recibió · Producción/.test(html)&&/primera tanda/.test(html)&&!/<script/i.test(html),'el vale es un documento HTML con su n.º, los insumos, las dos firmas y sin scripts');
ok(/&lt;b&gt;/.test(AE.valeHtml({...v1,lineas:[{codigo:'X',nombre:'<b>x</b>',cantidad:1,unidad:'UND'}]})),'el vale escapa los textos (no se inyecta HTML)');
const p72=leer('js/asistente/72-asistente-pantalla.js');
ok(/apValeEntrega\('\$\{esc\(s\.id\)\}',\$\{n\}\)/.test(p72)&&/AE\.ordenarPorAtender\(lista,D\.ahora\(\),ORDEN_SOL\)/.test(p72)&&/Van primero en la lista/.test(p72),'la pantalla de Solicitudes muestra el botón «Vale», ordena por prioridad y avisa lo que hay por atender');
ok(/tab\('rendimiento','Rendimiento'\)/.test(leer('js/almacen/101-producto-terminado.js'))&&/htmlRendimiento/.test(d),'Producto terminado tiene la pestaña Rendimiento (no para la cuenta compartida)');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
