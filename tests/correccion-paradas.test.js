/* Corregir y reasignar paradas + duración en minutos sin horas obligatorias:
   permiso, núcleo puro (línea / marca), «Quitar de esta marca» con el autollenado real (35), guardado con nube falsa (transacciones, doble clic,
   reintento, fallo del servidor con restauración), validación de duración e intervalo del formulario de Avance (29) y reglas de Firestore. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const src29=leer('js/produccion/29-avance-produccion.js'),src35=leer('js/produccion/35-autollenado-registro.js'),src29b=leer('js/produccion/29b-correccion-paradas.js');

/* ---------- nube falsa con transacciones ---------- */
function nube(){
  const docs=new Map();const N={docs,escrituras:[],transacciones:0,fallarProximaTx:false};
  const ref=(c,id)=>({__k:c+'/'+id});
  N.db={collection:c=>({doc:id=>ref(c,id)}),
    runTransaction:async fn=>{N.transacciones++;if(N.fallarProximaTx){N.fallarProximaTx=false;throw new Error('sin conexión');}
      const w=[];const tx={get:async r=>({exists:docs.has(r.__k),data:()=>clon(docs.get(r.__k))}),set:(r,d,o)=>w.push([r,d,o])};
      const res=await fn(tx);
      w.forEach(([r,d,o])=>{const nuevo=clon(d);Object.keys(nuevo).forEach(k=>{if(nuevo[k]==='__TS__')nuevo[k]=1700000000000;});
        docs.set(r.__k,o&&o.merge&&docs.has(r.__k)?Object.assign({},docs.get(r.__k),nuevo):nuevo);N.escrituras.push(r.__k);});
      return res;}};
  return N;
}

function usuario(rol,permisos,extra){return Object.assign({rol,nombre:rol,username:rol.toLowerCase(),permisos:permisos||[]},extra||{});}
function entorno(u,opc){
  opc=opc||{};
  const N=nube();
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Promise,Error,setTimeout,setInterval:()=>0,clearInterval(){},db:N.db};
  vm.createContext(sb);sb.window=sb;
  sb.state={user:u,currentTab:'nuevo'};
  sb.AVANCE_LINEAS=['PET1','PET2','B7L','C20L','B20L','HIELO'];sb.AVANCE_NOMBRES={PET1:'PET 1',PET2:'PET 2',B7L:'B7L',C20L:'C20L',B20L:'B20L',HIELO:'HIELO'};
  sb.tareoAhoraServidor=()=>1700000100000;
  sb.firebase={firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.esUsuarioSoloConsulta=x=>['Gerente General'].includes(x.rol);
  sb.tienePermiso=p=>u.rol==='Administrador'||(u.permisos||[]).includes(p);
  if(opc.vista)sb.glacialVista={activo:()=>true};
  sb.escaparHtml=t=>String(t==null?'':t).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  sb.document={getElementById:()=>null,createElement:()=>({appendChild(){},remove(){}}),head:{appendChild(){}},body:{appendChild(){}},querySelectorAll:()=>[],querySelector:()=>null,activeElement:null};
  sb.avanceEstado={fecha:'2026-10-13',turno:'DÍA',paradasOperativas:[],snapshots:[],todosSnapshots:[]};
  return {sb,N};
}

/* registro (draft) para el autollenado real */
function conRegistro(E,cuadros,paradas){
  const sb=E.sb;
  sb.draft={id:'r1',linea:'PET1',fecha:'2026-10-13',turno:'DÍA',autollenadoV1:true,cuadros:cuadros.map(c=>Object.assign({paradasProgramadas:[],paradasNoProgramadas:[],produccion:{}},c))};
  sb.normalizarCuadros=d=>d.cuadros;
  sb.paradasOperativasActuales=()=>sb.avanceEstado.paradasOperativas;
  sb.avanceEstado.paradasOperativas=paradas;
  sb.generarIdParadaProduccion=()=>'pp_'+Math.random().toString(36).slice(2,7);
  sb.reporteEstaBloqueado=()=>!!sb.__bloqueado;
  sb.renderFormTab=()=>{sb.__render=(sb.__render||0)+1;};
  sb.actualizarCuadro=()=>{};sb.syncLegacyFromCuadro1=()=>{};
  sb.guardados=0;sb.__guardarOk=true;
  sb.guardarAvanceReporte=async()=>{sb.guardados++;if(!sb.__guardarOk)return false;sb.__ultimoGuardado=clon(sb.draft);return true;};
  sb.programarGuardadoAutomaticoReporte=()=>{};
  vm.runInContext(src35,sb);
  vm.runInContext(src29b,sb);
}
const parada=(id,min,x)=>Object.assign({id,descripcion:'Calibración '+id,minutos:min,tipo:'NO_PROGRAMADA',causa:'Ajuste o calibración',fecha:'2026-10-13',turno:'DÍA',linea:'PET1',origen:'AVANCE',actualizadoEn:1000,creadoPor:'sup'},x||{});

(async()=>{
  /* ---------- permiso ---------- */
  {
    const adm=entorno(usuario('Administrador'));vm.runInContext(src29b,adm.sb);
    const sup=entorno(usuario('Supervisor',['avanceProduccion']));vm.runInContext(src29b,sup.sb);
    const conP=entorno(usuario('Supervisor',['avanceProduccion','corregir_paradas'],{linea:'PET1'}));vm.runInContext(src29b,conP.sb);
    const vista=entorno(usuario('Supervisor',['corregir_paradas']),{vista:true});vm.runInContext(src29b,vista.sb);
    const gerente=entorno(usuario('Gerente General',['corregir_paradas']));vm.runInContext(src29b,gerente.sb);
    ok(adm.sb.glacialCorreccionParadas.puede(),'el Administrador puede corregir y reasignar paradas');
    ok(conP.sb.glacialCorreccionParadas.puede()&&!sup.sb.glacialCorreccionParadas.puede(),'un usuario con el permiso puede; sin el permiso no (aunque tenga Avance/Cierre)');
    ok(!vista.sb.glacialCorreccionParadas.puede()&&!gerente.sb.glacialCorreccionParadas.puede(),'modo visualización y cargos de solo consulta no escriben, aunque conserven el permiso guardado');
    const A=conP.sb.glacialCorreccionParadas;
    ok(A.lineaEnAlcance('PET1')&&!A.lineaEnAlcance('PET2')&&adm.sb.glacialCorreccionParadas.lineaEnAlcance('PET2'),'el alcance respeta la línea del usuario; el Administrador ve todas');
    ok(/key:'corregir_paradas'/.test(leer('js/nucleo/02-estado.js')),'el permiso «Corregir y reasignar paradas» está en el catálogo de permisos');
    ok(!/reabrirReporteProduccion|avanceProduccion/.test(src29b.replace(/\/\*[\s\S]*?\*\//g,'')),'corregir una parada no reutiliza permisos de edición general (reabrir, Avance/Cierre)');
  }

  /* ---------- núcleo: cambiar de línea ---------- */
  {
    const E=entorno(usuario('Administrador'));vm.runInContext(src29b,E.sb);const C=E.sb.glacialCorreccionParadas.nucleo;
    const lista=[parada('a',20,{horaInicio:'09:00',horaFin:'09:20'}),parada('b',50),parada('c',15,{linea:'PET2'}),parada('d',30,{turno:'NOCHE'})];
    const o={origen:'PET1',destino:'B7L',fecha:'2026-10-13',turno:'DÍA',motivo:'Se registró en la línea equivocada',actor:{uid:'u1',por:'Ana'},ahora:1700000100000,opId:'cp_1'};
    const antes=clon(lista);
    const r=C.transferirLinea(lista,['a'],o);
    ok(JSON.stringify(lista)===JSON.stringify(antes),'transferir no modifica la lista original');
    const a=r.lista.find(p=>p.id==='a');
    ok(a.linea==='B7L'&&a.minutos===20&&a.tipo==='NO_PROGRAMADA'&&a.causa==='Ajuste o calibración'&&a.horaInicio==='09:00'&&a.horaFin==='09:20'&&a.fecha==='2026-10-13'&&a.turno==='DÍA'&&a.creadoPor==='sup'&&a.origen==='AVANCE','la parada cambia solo de línea: conserva id, minutos, tipo, causa, horas, fecha, turno, autor y origen');
    ok(a.historialAsignacion.length===1&&a.historialAsignacion[0].desde.linea==='PET1'&&a.historialAsignacion[0].hacia.linea==='B7L'&&a.historialAsignacion[0].minutos===20&&a.historialAsignacion[0].motivo==='Se registró en la línea equivocada'&&a.historialAsignacion[0].uid==='u1'&&a.historialAsignacion[0].ts===1700000100000,'el historial guarda anterior, nueva, minutos, motivo, autor y hora');
    ok(r.lista.filter(p=>p.id!=='a').every(p=>JSON.stringify(p)===JSON.stringify(lista.find(x=>x.id===p.id))),'las paradas no seleccionadas quedan intactas');
    ok(r.lista.filter(p=>p.id==='a').length===1,'no se duplica: sigue habiendo una sola parada con ese id');
    const falla=(f)=>{try{f();return '';}catch(e){return e.message;}};
    ok(/ya no está en/.test(falla(()=>C.transferirLinea(lista,['c'],o))),'una parada que ya no está en la línea de origen (otra persona la movió) se rechaza con explicación');
    ok(/ya no está en/.test(falla(()=>C.transferirLinea(lista,['d'],o))),'otro turno no se mezcla');
    ok(/ya no existe/.test(falla(()=>C.transferirLinea(lista,['zzz'],o))),'una parada inexistente se rechaza');
    ok(/misma de origen/.test(falla(()=>C.transferirLinea(lista,['a'],Object.assign({},o,{destino:'PET1'})))),'destino igual al origen se rechaza');
    ok(/modificada por otro usuario/.test(falla(()=>C.transferirLinea(lista,['a'],Object.assign({},o,{base:{a:999}})))),'si el evento cambió mientras se revisaba, se rechaza y se pide revisar');
    ok(falla(()=>C.transferirLinea(lista,['a'],Object.assign({},o,{base:{a:1000}})))==='','con la versión revisada vigente, se aplica');
    const dup=lista.concat([parada('a',20,{linea:'B7L'})]);
    ok(/ya está registrada en/.test(falla(()=>C.transferirLinea(dup,['a'],o))),'si el destino ya contiene el mismo id no se agrega otra vez (se detecta por id, no por texto)');
    const doble=C.transferirLinea(lista,['a','b','a'],o);
    ok(doble.movidas.length===2&&doble.lista.filter(p=>p.linea==='B7L').length===2,'ids repetidos en la selección se cuentan una vez');
    ok(/Selecciona/.test(falla(()=>C.transferirLinea(lista,[],o))),'sin selección no hay corrección');
    // motivo y entrada
    ok(C.validarMotivo('abc')!==''&&C.validarMotivo('  ')!==''&&C.validarMotivo('error de línea')==='','el motivo es obligatorio (mínimo 5 caracteres)');
    const base={sel:new Set(['a']),motivo:'motivo ok',accion:'LINEA',destLinea:'B7L',cuadro:null,destCuadro:'',ctx:{linea:'PET1'}};
    ok(C.validarEntrada(base)==='','entrada válida: línea distinta con motivo');
    ok(C.validarEntrada(Object.assign({},base,{sel:new Set()}))!==''&&C.validarEntrada(Object.assign({},base,{motivo:''}))!==''&&C.validarEntrada(Object.assign({},base,{destLinea:''}))!==''&&C.validarEntrada(Object.assign({},base,{destLinea:'PET1'}))!=='','sin selección, sin motivo, sin destino o con el mismo destino: se rechaza');
    ok(C.validarEntrada(Object.assign({},base,{accion:'QUITAR'}))!==''&&C.validarEntrada(Object.assign({},base,{accion:'QUITAR',cuadro:0}))==='','«Quitar de esta marca» solo existe desde el Registro');
    const marca=Object.assign({},base,{accion:'MARCA',cuadro:0,destCuadro:'0'});
    ok(C.validarEntrada(marca)!==''&&C.validarEntrada(Object.assign({},marca,{destCuadro:'1'}))==='','reasignar a la misma marca se rechaza; a otra marca vale');
    // documento de auditoría: solo campos que aceptan las reglas
    const d=C.docAuditoria({opId:'cp_1',accion:'REASIGNAR_LINEA',linea:'PET1',fecha:'2026-10-13',turno:'DÍA',paradas:r.movidas,desde:{linea:'PET1'},hacia:{linea:'B7L'},motivo:'x motivo',cerrado:false,actor:{uid:'u1',por:'Ana'},ts:'__TS__'});
    const regla=leer('_archivo/firebase/firestore.rules.etapa2.txt');
    const bloque=regla.slice(regla.indexOf('match /correccionesParada/'),regla.indexOf('match /reclasificacionesParada/'));
    const permitidas=(/hasOnly\(\[([^\]]+)\]/.exec(bloque)[1]).split(',').map(x=>x.trim().replace(/'/g,''));
    ok(Object.keys(d).every(k=>permitidas.includes(k))&&d.minutos===20&&d.version===1,'el documento de constancia solo trae los campos que permiten las reglas');
    ok(/allow update, delete: if false/.test(bloque)&&/puedeCorregirParadas\(\)/.test(bloque)&&/'corregir_paradas' in perfiles/.test(regla)&&/!soloVista\(\)/.test(regla.slice(regla.indexOf('function puedeCorregirParadas'),regla.indexOf('match /correccionesParada/'))),'reglas: se crea con permiso vigente (no en modo consulta), una sola vez, y nunca se edita ni se borra');
    ok(/request\.resource\.data\.motivo\.size\(\) >= 5/.test(bloque)&&/actualizadaEn == request\.time/.test(bloque)&&/actualizadaUid == request\.auth\.uid/.test(bloque),'reglas: motivo mínimo, uid de quien actúa y hora del servidor');
  }

  /* ---------- Registro: «Quitar de esta marca» con el autollenado real ---------- */
  {
    const E=entorno(usuario('Administrador'));
    const ps=[parada('p1',20),parada('p2',30),parada('p3',50,{tipo:'PROGRAMADA',causa:''})];
    conRegistro(E,[{marca:'Marca A',presentacion:'1 L'}],ps);
    const sb=E.sb,I=sb.__autollenadoInternos;
    sb.autollenarRegistro({forzar:true});
    const filasAuto=()=>[...(sb.draft.cuadros[0].paradasProgramadas||[]),...(sb.draft.cuadros[0].paradasNoProgramadas||[])].filter(r=>r.auto);
    ok(filasAuto().length===3&&I.cuadroDeAvance(ps[0])===0,'con una sola producción las paradas se asignan solas a esa marca (comportamiento previo)');
    // abrir y quitar p1 y p3
    sb.glacialCorreccionParadas.abrirRegistro(0,'p1');
    const G=sb.glacialCorreccionParadas;
    ok(G.puede(),'permiso del Administrador');
    // el estado del modal no es público: se opera con las entradas de la pantalla
    G.marcar('p3',true);G.motivo('asignada a la marca equivocada');
    await G.confirmar();
    ok(sb.draft.asignacionParadasAvance.p1===-1&&sb.draft.asignacionParadasAvance.p3===-1&&sb.draft.asignacionParadasAvance.p2===undefined,'quitar marca solo las seleccionadas como «Sin asignar»; la otra no se toca');
    ok(I.cuadroDeAvance(ps[0])===null&&I.cuadroDeAvance(ps[2])===null&&I.cuadroDeAvance(ps[1])===0,'aunque haya UNA sola producción, una parada quitada NO se reasigna sola: queda pendiente');
    const auto=filasAuto();
    ok(auto.length===1&&auto[0].origenId==='p2','la marca ya no suma las paradas quitadas (solo queda la no seleccionada)');
    ok(ps.length===3&&ps[0].minutos===20&&ps[0].linea==='PET1'&&ps[0].descripcion==='Calibración p1'&&ps[0].tipo==='NO_PROGRAMADA','el evento fuente (sync/avancesTurno) sigue intacto: id, descripción, minutos, tipo y línea');
    const pend=I.paradasAvance().filter(p=>I.cuadroDeAvance(p)===null).map(p=>p.id).sort();
    ok(JSON.stringify(pend)==='["p1","p3"]','las paradas quitadas quedan en la lista «Sin asignar» y se pueden elegir de nuevo con el aviso del Registro');
    const h=sb.draft.correccionesParadas;
    ok(h.length===1&&h[0].accion==='QUITAR_MARCA'&&h[0].paradas.length===2&&h[0].paradas.reduce((s,p)=>s+p.minutos,0)===70&&h[0].motivo==='asignada a la marca equivocada'&&h[0].hacia.sinAsignar===true&&h[0].desde.marca.indexOf('Marca A')>=0&&h[0].ts===1700000100000,'el historial del registro guarda anterior, nueva, minutos, motivo y hora');
    ok(sb.guardados===1&&sb.__ultimoGuardado.asignacionParadasAvance.p1===-1,'se guarda el registro y solo entonces se da por hecho');
    ok(E.N.docs.size===1&&[...E.N.docs.keys()][0].startsWith('correccionesParada/')&&E.N.docs.values().next().value.accion==='QUITAR_MARCA','queda una constancia inmutable en correccionesParada');
    // volver a seleccionarla con el flujo existente
    sb.registroAsignarParada('p1','0');
    ok(I.cuadroDeAvance(ps[0])===0&&filasAuto().some(r=>r.origenId==='p1'),'elegirla de nuevo con el aviso de asignación la vuelve a poner en la marca');
  }

  /* ---------- Registro: reasignar de marca, dos marcas, sin duplicar ---------- */
  {
    const E=entorno(usuario('Administrador'));
    const ps=[parada('p1',20),parada('p2',30)];
    conRegistro(E,[{marca:'Marca A',presentacion:'1 L'},{marca:'Marca B',presentacion:'2 L'}],ps);
    const sb=E.sb,I=sb.__autollenadoInternos,G=sb.glacialCorreccionParadas;
    sb.registroAsignarParada('p1','0');sb.registroAsignarParada('p2','0');
    const filas=i=>[...(sb.draft.cuadros[i].paradasProgramadas||[]),...(sb.draft.cuadros[i].paradasNoProgramadas||[])].filter(r=>r.auto).map(r=>r.origenId).sort();
    ok(JSON.stringify(filas(0))==='["p1","p2"]'&&filas(1).length===0,'punto de partida: ambas en la Producción 1');
    G.abrirRegistro(0,'p1');
    // elegir acción de marca sin destino → rechazo
    G.accion('MARCA');G.motivo('va en la otra marca');
    await G.confirmar();
    ok(sb.draft.asignacionParadasAvance.p1===0&&sb.guardados===0,'sin marca destino no se guarda nada');
    G.destCuadro('1');
    const antesMinA=filas(0).length;
    await G.confirmar();
    ok(JSON.stringify(filas(0))==='["p2"]'&&JSON.stringify(filas(1))==='["p1"]','reasignar de marca: sale del origen y entra UNA vez al destino; la otra parada no se mueve');
    ok(sb.draft.correccionesParadas.length===1&&sb.draft.correccionesParadas[0].accion==='REASIGNAR_MARCA'&&sb.draft.correccionesParadas[0].hacia.cuadro===1,'queda el historial de la reasignación de marca');
    // intentar reasignar a la marca donde ya está
    G.abrirRegistro(1,'p1');G.accion('MARCA');G.destCuadro('1');G.motivo('misma marca');
    await G.confirmar();
    ok(sb.draft.correccionesParadas.length===1,'reasignar a la marca donde ya está no repite ni duplica');
    G.cerrar();
  }

  /* ---------- Registro: fallo del servidor restaura todo; reporte finalizado no se toca ---------- */
  {
    const E=entorno(usuario('Administrador'));
    const ps=[parada('p1',20)];
    conRegistro(E,[{marca:'Marca A',presentacion:'1 L'}],ps);
    const sb=E.sb,G=sb.glacialCorreccionParadas;sb.autollenarRegistro({forzar:true});
    sb.__guardarOk=false;
    G.abrirRegistro(0,'p1');G.motivo('prueba de fallo');
    await G.confirmar();
    ok(sb.draft.asignacionParadasAvance&&sb.draft.asignacionParadasAvance.p1===undefined&&(sb.draft.correccionesParadas||[]).length===0,'si el servidor no confirma, se restaura la asignación anterior y no queda historial a medias');
    ok(sb.__autollenadoInternos.cuadroDeAvance(ps[0])===0,'la parada sigue en su marca original tras el fallo');
    ok(E.N.docs.size===0,'sin guardado confirmado no se escribe constancia');
    sb.__guardarOk=true;sb.__bloqueado=true;
    G.cerrar();G.abrirRegistro(0,'p1');G.motivo('reporte cerrado');
    await G.confirmar();
    ok(sb.guardados===2&&sb.draft.asignacionParadasAvance.p1===undefined,'con el reporte finalizado no se cambia la asignación (primero se reabre con su permiso)');
    G.cerrar();
  }

  /* ---------- Línea: transacción real, doble clic, reintento, dos usuarios ---------- */
  {
    const E=entorno(usuario('Administrador'));
    const ps=[parada('p1',20),parada('p2',30)];
    conRegistro(E,[{marca:'Marca A',presentacion:'1 L'}],ps);
    const sb=E.sb,G=sb.glacialCorreccionParadas,N=E.N;
    N.docs.set('sync/avancesTurno',{paradasOperativas:clon(ps),updatedAt:1700000000000});
    sb.avanceEstado.paradasOperativas=clon(ps);
    sb.autollenarRegistro({forzar:true});
    G.abrirRegistro(0,'p1');G.accion('LINEA');G.destLinea('B7L');G.motivo('línea equivocada');
    const [r1,r2]=await Promise.all([G.confirmar(),G.confirmar()]);        // doble clic
    const av=N.docs.get('sync/avancesTurno');
    ok(N.transacciones===1,'un doble clic ejecuta UNA sola transacción');
    const p1=av.paradasOperativas.find(p=>p.id==='p1'),p2=av.paradasOperativas.find(p=>p.id==='p2');
    ok(av.paradasOperativas.length===2&&p1.linea==='B7L'&&p1.minutos===20&&p2.linea==='PET1','la parada pasó de línea y no se duplicó; la otra sigue en su línea');
    ok(av.updatedAt>1700000000000,'sube updatedAt de sync/avancesTurno (otros dispositivos detectan el cambio)');
    const aud=[...N.docs.entries()].filter(([k])=>k.startsWith('correccionesParada/'));
    ok(aud.length===1&&aud[0][1].accion==='REASIGNAR_LINEA'&&aud[0][1].desde.linea==='PET1'&&aud[0][1].hacia.linea==='B7L'&&aud[0][1].minutos===20&&aud[0][1].actualizadaEn===1700000000000,'una constancia en la MISMA transacción, con la hora del servidor');
    ok(N.escrituras.every(k=>k==='sync/avancesTurno'||k.startsWith('correccionesParada/')),'solo escribe avancesTurno y la constancia (no toca producción, personal ni materiales)');
    const filasAuto=()=>[...(sb.draft.cuadros[0].paradasProgramadas||[]),...(sb.draft.cuadros[0].paradasNoProgramadas||[])].filter(r=>r.auto).map(r=>r.origenId);
    ok(JSON.stringify(filasAuto())==='["p2"]','la marca de la línea de origen deja de sumar la parada movida');
    // reintento con el mismo modal ya cerrado: una segunda corrección sobre la misma parada falla (ya no está en PET1)
    ok(!sb.__autollenadoInternos.paradasAvance().some(p=>p.id==='p1'),'la parada movida ya no aparece entre las paradas de PET 1 que se pueden corregir desde este Registro');
    // dos usuarios: el B revisó la parada antes de que A la cambiara
    const N2=nube();N2.docs.set('sync/avancesTurno',{paradasOperativas:[Object.assign(clon(ps[0]),{actualizadoEn:5555})],updatedAt:1700000000000});
    const E2=entorno(usuario('Administrador'));E2.sb.db=N2.db;
    conRegistro(E2,[{marca:'Marca A',presentacion:'1 L'}],[clon(ps[0])]);
    E2.sb.db=N2.db;
    E2.sb.glacialCorreccionParadas.abrirRegistro(0,'p1');
    const G2=E2.sb.glacialCorreccionParadas;G2.accion('LINEA');G2.destLinea('PET2');G2.motivo('dos usuarios');
    await G2.confirmar();
    ok(N2.docs.get('sync/avancesTurno').paradasOperativas[0].linea==='PET1'&&![...N2.docs.keys()].some(k=>k.startsWith('correccionesParada/')),'si otro usuario modificó la parada mientras se revisaba, no se guarda nada (ni constancia) y se pide revisar');
    G2.cerrar();
    // fallo del servidor: nada parcial
    const N3=nube();N3.docs.set('sync/avancesTurno',{paradasOperativas:[clon(ps[0])],updatedAt:1});
    const E3=entorno(usuario('Administrador'));conRegistro(E3,[{marca:'Marca A',presentacion:'1 L'}],[clon(ps[0])]);E3.sb.db=N3.db;
    const G3=E3.sb.glacialCorreccionParadas;G3.abrirRegistro(0,'p1');G3.accion('LINEA');G3.destLinea('PET2');G3.motivo('caída de red');N3.fallarProximaTx=true;
    await G3.confirmar();
    ok(N3.docs.get('sync/avancesTurno').paradasOperativas[0].linea==='PET1'&&N3.docs.size===1,'si la transacción falla no queda la parada en origen y destino ni una constancia sin cambio');
    G3.cerrar();
  }

  /* ---------- aviso de correcciones posteriores al cierre ---------- */
  {
    const E=entorno(usuario('Administrador'));vm.runInContext(src29b,E.sb);const C=E.sb.glacialCorreccionParadas.nucleo;
    const p=Object.assign(parada('p1',20,{linea:'B7L'}),{historialAsignacion:[{ts:2000,desde:{linea:'PET1'},hacia:{linea:'B7L'},minutos:20}]});
    ok(C.correccionesPosteriores([p],[{fecha:'2026-10-13',turno:'DÍA',generadoEn:1000}]).length===1&&C.correccionesPosteriores([p],[{fecha:'2026-10-13',turno:'DÍA',generadoEn:3000}]).length===0,'se avisa solo de correcciones hechas DESPUÉS de generar un avance o cierre');
  }

  /* ---------- Avance: duración en minutos sin horas obligatorias ---------- */
  {
    const sb={Math,Number,Array,Object,String,Date,JSON,Map,Set,RegExp,Error,GlacialIndicadores:{normalizarBloques:b=>({diaInter:{inicio:'07:00',fin:'22:00'},noche:{inicio:'21:00',fin:'07:00'}})}};
    vm.createContext(sb);sb.window=sb;
    ['avNum','avFmt','avHoraMs','avHoraFinCalculada','avValidarCatalogoParada','avValidarDuracionIntervalo','avVentanaTurno','avBloquesCfg','avUsaCatalogo','avCat','avAvisoTotalParadas'].forEach(n=>{try{vm.runInContext(extraer(src29,n),sb);}catch(e){throw new Error(n+': '+e.message);}});
    sb.window.glacialMotivosParada={validar:()=>''};
    const m={fecha:'2026-10-13',turno:'DÍA'};
    const cat=min=>({tipo:'NO_PROGRAMADA',causa:'Ajuste o calibración',motivoCat:'x',nueva:true,minutos:min,descripcion:'x'});
    [14,15,16,30,50,120,200].forEach(min=>ok(sb.avValidarCatalogoParada(m,cat(min))===''&&sb.avValidarDuracionIntervalo(m,cat(min))==='','una parada de '+min+' min se valida sin hora de inicio ni de fin'));
    ok(!/necesita la hora de inicio/.test(src29)&&!/>15\s*\?\s*' \*'/.test(src29),'ya no existe el mensaje ni el asterisco que exigían la hora a partir de 15 min');
    ['',0,-5,'abc',NaN,null].forEach(v=>ok(sb.avValidarDuracionIntervalo(m,Object.assign(cat(0),{minutos:v}))!=='','duración «'+String(v)+'» se rechaza'));
    ok(sb.avValidarDuracionIntervalo(m,Object.assign(cat(12.5)))==='','se conserva la precisión existente (12,5 min no se redondea ni se rechaza)');
    ok(sb.avValidarDuracionIntervalo(m,Object.assign(cat(30),{horaInicio:'09:00',horaFin:'09:30'}))==='','intervalo opcional coherente con la duración: válido');
    ok(/no coincide/.test(sb.avValidarDuracionIntervalo(m,Object.assign(cat(30),{horaInicio:'09:00',horaFin:'09:45'}))),'duración e intervalo distintos: se pide corregir uno, sin sobrescribir lo escrito');
    ok(/también la de inicio/.test(sb.avValidarDuracionIntervalo(m,Object.assign(cat(30),{horaFin:'09:30'}))),'hora de fin sin inicio se rechaza');
    const noche={fecha:'2026-10-13',turno:'NOCHE'};
    ok(sb.avValidarDuracionIntervalo(noche,Object.assign(cat(60),{horaInicio:'23:30',horaFin:'00:30'}))==='','el cruce de medianoche se conserva (23:30–00:30 = 60 min)');
    ok(sb.avValidarCatalogoParada(m,Object.assign(cat(30),{horaInicio:'05:00'}))!=='','si se escribe una hora de inicio fuera del turno se sigue avisando');
    ok(sb.avAvisoTotalParadas(m,100)===''&&/supera la duración del turno/.test(sb.avAvisoTotalParadas(m,1000)),'el total mayor que el turno solo avisa (no bloquea)');
    // el guardado valida la duración para todas y no exige horas
    const guardar=extraer(src29,'avGuardarParadasModal');
    ok(/avValidarDuracionIntervalo\(m,p\)/.test(guardar)&&!/horaInicio/.test(guardar.split('Solo tocamos sync/records')[0].replace(/avValidarDuracionIntervalo[\s\S]*?\n  \}\n/,'')),'avGuardarParadasModal valida la duración y no exige horas');
    // editar el intervalo no pisa una duración ya escrita
    const hora=extraer(src29,'avParadaHora');
    ok(/avNum\(p\.minutos\)<=0/.test(hora),'completar el intervalo solo rellena una duración vacía; no la sobrescribe');
  }

  /* ---------- Avance y Registro: la pantalla ofrece la corrección solo con permiso ---------- */
  ok(/glacialCorreccionParadas\.puede\(\)/.test(src29)&&/glacialCorreccionParadas\.puede\(\)/.test(src35),'Avance y Registro muestran «Corregir asignación» solo a quien puede');
  ok(/29b-correccion-paradas\.js/.test(leer('index.html'))&&leer('index.html').indexOf('29b-correccion-paradas.js')>leer('index.html').indexOf('35-autollenado-registro.js'),'index.html carga 29b después de 29 y 35');

  console.log(fallas?'\nFALLAS: '+fallas:'\nTodo en orden');
  process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
