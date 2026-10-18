/* Planificación · etapa 1 (auditoría): H1 importar con posible duplicado, H3/H4 aprobar y cambiar producto en una sola transacción,
   H5 historial dentro de la misma transacción (unificar = un evento), H8 control de versión por fila, H7 producido del bloque Día + Intermedio.
   Usa las funciones REALES de 16, 24, 45 y 51–54 contra una «nube» falsa con transacciones optimistas (como el puente de Supabase):
   varias personas, fallos de red a mitad de guardado y aprobaciones simultáneas. */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const leerRef=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
const clon=v=>JSON.parse(JSON.stringify(v));
function extraer(src,n){const m=new RegExp('(?:async[ ]+)?function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s16=leer('js/produccion/16-paletas.js');
const FUNC16=['normalizarClavePaletas','claveCombinacionPaletas','esCombinacionPaletas','claveProgramacionPaleta','obtenerProgramacionPaleta','programacionValorHistorial','programacionConflicto','programacionAplicarEnLista','guardarProgramacionPaleta'].map(n=>extraer(s16,n)).join('');

/* ---------- nube falsa: documentos con versión, transacciones optimistas con reintento, fallo de red, historial de confirmaciones ---------- */
function nube(){
  const docs=new Map(),ver=new Map(),oyentes=[];let confirmaciones=0;
  const N={docs,falla:false,confirmaciones:()=>confirmaciones,oyentes};
  const ts=v=>{if(v==='__TS__')return Date.now();if(Array.isArray(v))return v.map(ts);if(v&&typeof v==='object'){const o={};Object.keys(v).forEach(k=>o[k]=ts(v[k]));return o;}return v;};
  N.db={
    collection:c=>({doc:id=>({__c:c,__id:id,__k:c+'/'+id})}),
    runTransaction:async fn=>{
      for(let intento=0;intento<5;intento++){
        const lect=new Map(),w=[];
        const tx={
          get:async r=>{await Promise.resolve();lect.set(r.__k,ver.get(r.__k)||0);const d=docs.get(r.__k);return {exists:d!==undefined,data:()=>clon(d)};},
          set:(r,d)=>w.push(['set',r,d]),update:(r,d)=>w.push(['upd',r,d])
        };
        const res=await fn(tx);
        await new Promise(r=>setTimeout(r,1));                 // otro dispositivo puede confirmar justo aquí
        let choque=false;lect.forEach((v,k)=>{if((ver.get(k)||0)!==v)choque=true;});
        if(choque)continue;
        if(N.falla)throw new Error('sin red');
        w.forEach(([t,r,d])=>{
          let nd=clon(d);if(t==='upd'){if(!docs.has(r.__k))throw new Error('no existe '+r.__k);nd=Object.assign({},docs.get(r.__k),nd);}
          docs.set(r.__k,ts(nd));ver.set(r.__k,(ver.get(r.__k)||0)+1);
        });
        confirmaciones++;oyentes.forEach(f=>f());
        return res;
      }
      throw new Error('aborted');
    }
  };
  return N;
}

/* ---------- un «dispositivo»: la página real (16 + 45 + 51–54) conectada a la nube ---------- */
function dispositivo(N,usuario,opc){
  opc=opc||{};
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,clearTimeout,Error,RegExp,parseInt,parseFloat,isNaN};vm.createContext(sb);sb.window=sb;
  const oy=[];sb.document={addEventListener:(t,f)=>oy.push([t,f]),getElementById:()=>null,createElement:()=>elemento(),body:{appendChild(){},contains:()=>true}};
  sb.__oyentes=oy;
  const els=new Map();
  function elemento(){const e={_h:'',style:{},children:[],addEventListener(){},appendChild(){},remove(){},classList:{add(){},remove(){},toggle(){}},
    querySelector(sel){const id=sel.replace(/^#/,'');if(!els.has(id))els.set(id,{id,style:{},value:'',textContent:'',innerHTML:'',disabled:false,addEventListener(){},querySelector:()=>null});return els.get(id);},
    set innerHTML(v){this._h=v;},get innerHTML(){return this._h;}};return e;}
  sb.__els=els;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.state={user:Object.assign({rol:'Planificación',nombre:usuario.nombre,username:usuario.nombre},usuario.extra||{}),currentTab:'planificacion'};
  sb.LINES=[{key:'PET1',name:'PET 1'},{key:'PET2',name:'PET 2'},{key:'B7L',name:'B7L'}];
  sb.MARCAS_POR_LINEA={PET1:['Bells','Scala'],PET2:['Bells'],B7L:['Fontlife']};
  sb.PRESENTACIONES_POR_LINEA={PET1:['Regular_380ml','Regular_625ml'],PET2:['Regular_625ml'],B7L:['7 Litros','10 Litros']};
  sb._programacionesCache=[];
  sb.loadProgramaciones=()=>sb._programacionesCache;
  sb.tienePermiso=p=>p==='planificacion'?usuario.planifica!==false:false;
  sb.escaparHtml=t=>String(t==null?'':t);
  sb.obtenerUnidadesPorPalet=(l,m,p)=>p==='Regular_625ml'?1200:p==='Regular_380ml'?2184:0;
  sb.nombreUsuarioActualPaletas=()=>usuario.nombre;
  sb.glacialCierresSesion=[];sb.loadPaletas=()=>[];
  sb.firebase={auth:()=>({currentUser:{uid:'uid-'+usuario.nombre}}),firestore:{FieldValue:{serverTimestamp:()=>'__TS__'}}};
  sb.db=N.db;
  sb.confirm=m=>{sb.__confirm=m;return opc.confirmar!==false;};sb.alert=m=>{sb.__alert=m;};
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+FUNC16,sb);
  ['51-planificacion-nucleo','52-planificacion-pantalla','53-planificacion-catalogo','54-planificacion-solicitudes'].forEach(f=>vm.runInContext(opc.fuente&&opc.fuente[f]?opc.fuente[f]:leer('js/produccion/'+f+'.js'),sb));
  // la copia local se refresca con lo que confirma la nube (como el onSnapshot real)
  const sincronizar=()=>{const d=N.docs.get('sync/programaciones');sb._programacionesCache=d&&Array.isArray(d.items)?clon(d.items):[];sb.glacialPlanificacion.refrescar&&0;};
  N.oyentes.push(sincronizar);sincronizar();
  sb.NS=sb.glacialPlanificacion;sb.sincronizar=sincronizar;
  return sb;
}
const F=(l,f,t,m,p,c,u,extra)=>Object.assign({id:'prog_'+Math.random().toString(36).slice(2,7),clave:[l,f,t,m,p].join('|'),linea:l,fecha:f,turno:t,marca:m,presentacion:p,cantidadProgramada:c,unidadesPorPaleta:u,paletasProgramadas:c/u,estadoOperacion:{estado:'PENDIENTE'}},extra||{});
const G=(sb,a)=>vm.runInContext('guardarProgramacionPaleta',sb)(...a);
const items=N=>(N.docs.get('sync/programaciones')||{items:[]}).items;
const historial=N=>[...N.docs.entries()].filter(([k])=>k.startsWith('historialProgramacion/')).map(([,v])=>v);
const sol=(N,id,extra)=>N.docs.set('solicitudesProgramacion/'+id,Object.assign({tipo:'CAMBIO_CANTIDAD',linea:'PET1',fecha:'2099-03-01',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',cantidadActual:10000,baseVersion:1,
  propuesta:{cantidad:12000},motivo:'Se necesita más',estado:'PENDIENTE',uid:'uid-Sup',usuario:'Supervisor',creadoEn:1},extra||{}));

(async()=>{
const ANA={nombre:'Ana'},LUIS={nombre:'Luis'};

/* =========================================================
   H1 · importar Excel con posible duplicado Día/Intermedio
   ========================================================= */
{
  const N=nube();N.docs.set('sync/programaciones',{items:[]});
  const filasExcel=[
    {Fecha:'2099-03-02',Turno:'Día',Línea:'PET1',Marca:'Bells',Presentación:'Regular_625ml',Cantidad:6000,'Unidades por paleta':''},
    {Fecha:'2099-03-02',Turno:'Intermedio',Línea:'PET1',Marca:'Bells',Presentación:'Regular_625ml',Cantidad:6000,'Unidades por paleta':''}];
  const probar=async(opc,etq)=>{
    const sb=dispositivo(N,ANA,opc);
    sb.XLSX={read:()=>({SheetNames:['H'],Sheets:{H:{}}}),utils:{sheet_to_json:()=>filasExcel}};
    sb.NS.estado={tab:'programacion',fecha:'2099-03-02',turno:'DÍA'};
    const click=sb.__oyentes.filter(([t])=>t==='click').map(([,f])=>f);
    const ev={target:{closest:s=>s==='#plan-root'?{}:s==='[data-plan-excel]'?{}:null}};
    click.forEach(f=>{try{f(ev);}catch(_){/* otros manejadores */}});
    const q=id=>sb.__els.get(id);
    await q('pi-archivo').onchange({target:{files:[{arrayBuffer:async()=>new ArrayBuffer(1)}]}});
    let error=null;
    try{await q('pi-aplicar').onclick();}catch(e){error=e;}
    return {sb,q,error};
  };
  // la versión anterior (2e2800c) usaba LF sin definir: el clic lanzaba ReferenceError y no importaba nada
  let antes=null;
  try{antes=await probar({confirmar:true,fuente:{'52-planificacion-pantalla':leerRef('js/produccion/52-planificacion-pantalla.js','2e2800c')}},'antes');}catch(e){antes={error:e};}
  ok(antes.error&&/LF is not defined/.test(String(antes.error.message||antes.error)),'causa confirmada: antes del arreglo, importar con posible duplicado lanzaba «LF is not defined» y no importaba nada');
  const conf=await probar({confirmar:true},'despues');
  ok(!conf.error&&/posible duplicado/.test(conf.sb.__confirm||'')&&/\n/.test(conf.sb.__confirm||''),'ahora aparece la confirmación del posible duplicado (con saltos de línea)');
  ok(items(N).length===1&&items(N)[0].cantidadProgramada===12000&&items(N)[0].turno==='DÍA','al confirmar se importa: Día + Intermedio suman 12 000 en la fila DÍA');
  const N2=nube();N2.docs.set('sync/programaciones',{items:[]});
  const sb2=dispositivo(N2,ANA,{confirmar:false});
  sb2.XLSX={read:()=>({SheetNames:['H'],Sheets:{H:{}}}),utils:{sheet_to_json:()=>filasExcel}};sb2.NS.estado={tab:'programacion',fecha:'2099-03-02',turno:'DÍA'};
  sb2.__oyentes.filter(([t])=>t==='click').forEach(([,f])=>{try{f({target:{closest:s=>s==='#plan-root'?{}:s==='[data-plan-excel]'?{}:null}});}catch(_){}});
  await sb2.__els.get('pi-archivo').onchange({target:{files:[{arrayBuffer:async()=>new ArrayBuffer(1)}]}});
  await sb2.__els.get('pi-aplicar').onclick();
  ok(items(N2).length===0&&/posible duplicado/.test(sb2.__confirm),'si no se confirma el posible duplicado, no se importa nada');
}

/* =========================================================
   H8 · control de versión por fila
   ========================================================= */
{
  const N=nube();N.docs.set('sync/programaciones',{items:[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',10000,1200,{version:1})]});
  const A=dispositivo(N,ANA),B=dispositivo(N,LUIS);
  const vistoPorAna=A.NS.existente('PET1','2099-03-01','DÍA','Bells','Regular_625ml').version;
  await G(B,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',11000,1200,{versionEsperada:1}]);
  ok(items(N)[0].cantidadProgramada===11000&&items(N)[0].version===2,'la persona B guarda con la versión que vio (1) y la fila pasa a la versión 2');
  let e=null;try{await G(A,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',9000,1200,{versionEsperada:vistoPorAna}]);}catch(x){e=x;}
  ok(e&&e.conflicto&&e.actual.cantidad===11000&&e.actual.version===2&&/11[.,\s]?000/.test(e.message),'A edita con la versión vieja: se rechaza, el error trae el valor actual (11 000 UND) y no se guarda encima');
  ok(items(N)[0].cantidadProgramada===11000&&items(N)[0].version===2&&historial(N).length===1,'la fila y el historial quedan como los dejó B (nada se pisó)');
  await G(A,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',9000,1200,{versionEsperada:e.actual.version}]);
  ok(items(N)[0].cantidadProgramada===9000&&items(N)[0].version===3,'tras «cargar el valor actual» (versión 2), A guarda y la fila pasa a la versión 3');
  e=null;try{await G(B,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',0,1200,{versionEsperada:2,motivo:'x'}]);}catch(x){e=x;}
  ok(e&&e.conflicto&&items(N).length===1,'quitar con una versión vieja también se rechaza');
  // filas nuevas: dos personas crean el mismo producto
  e=null;await G(A,['PET2','2099-03-01','DÍA','Bells','Regular_625ml',5000,1200,{versionEsperada:null}]);
  try{await G(B,['PET2','2099-03-01','DÍA','Bells','Regular_625ml',7000,1200,{versionEsperada:null}]);}catch(x){e=x;}
  ok(e&&e.conflicto&&e.actual.cantidad===5000&&items(N).find(p=>p.linea==='PET2').cantidadProgramada===5000,'dos personas crean el mismo producto: la segunda ve el valor de la primera y no lo pisa');
  // filas antiguas sin versión
  const N3=nube();N3.docs.set('sync/programaciones',{items:[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',10000,1200)]});
  const C=dispositivo(N3,ANA);
  await G(C,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',10500,1200,{versionEsperada:0}]);
  ok(items(N3)[0].version===1&&items(N3)[0].cantidadProgramada===10500,'una fila antigua sin versión cuenta como versión 0 y pasa a la 1 al editarla');
  // copia/importación (sin control) siguen funcionando
  await G(C,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',9900,1200,{}]);
  ok(items(N3)[0].version===2,'copiar/importar (sin control de versión) siguen funcionando y también suben la versión');
}

/* =========================================================
   H5 · historial dentro de la misma transacción
   ========================================================= */
{
  const N=nube();N.docs.set('sync/programaciones',{items:[]});
  const A=dispositivo(N,ANA);
  await G(A,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',10000,1200,{}]);
  ok(N.confirmaciones()===1&&historial(N).length===1&&historial(N)[0].accion==='CREACION'&&historial(N)[0].uid==='uid-Ana'&&items(N).length===1,'crear: el cambio y su evento se confirman JUNTOS (una sola confirmación)');
  N.falla=true;let e=null;
  try{await G(A,['PET1','2099-03-01','DÍA','Bells','Regular_625ml',12000,1200,{}]);}catch(x){e=x;}
  N.falla=false;
  ok(e&&items(N)[0].cantidadProgramada===10000&&historial(N).length===1,'si falla la red al confirmar, ni la fila ni el historial cambian (todo o nada)');
  // unificar en Día: un solo evento
  const N2=nube();
  N2.docs.set('sync/programaciones',{items:[F('PET1','2099-03-05','DÍA','Bells','Regular_625ml',12000,1200,{version:1}),F('PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml',8000,1200,{version:1})]});
  const B=dispositivo(N2,ANA);
  const inter=B.NS.existente('PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml');
  await B.NS.unificarEnDia(inter,'Se programó dos veces el mismo producto');
  const h=historial(N2);
  ok(items(N2).length===1&&items(N2)[0].cantidadProgramada===20000&&N2.confirmaciones()===1,'unificar: una sola transacción (12 000 + 8 000 = 20 000 en la fila DÍA)');
  ok(h.length===1&&h[0].accion==='EDICION'&&h[0].referencia.startsWith('UNIFICACION')&&h[0].desde.cantidad===8000&&h[0].anterior.cantidad===12000&&h[0].nuevo.cantidad===20000,'unificar deja UN solo evento (antes 12 000, ahora 20 000, desde Intermedio 8 000)');
  const N3=nube();N3.docs.set('sync/programaciones',{items:[F('PET1','2099-03-05','DÍA','Bells','Regular_625ml',12000,1200),F('PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml',8000,1200)]});
  const C=dispositivo(N3,ANA);N3.falla=true;
  let e3=null;try{await C.NS.unificarEnDia(C.NS.existente('PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml'),'motivo valido');}catch(x){e3=x;}
  ok(e3&&items(N3).length===2&&historial(N3).length===0,'unificar con fallo de red: no cambia la programación ni deja un evento suelto');
  // la fila de Intermedio cambió mientras se miraba
  N3.falla=false;const viejo=C.NS.existente('PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml');
  await G(dispositivo(N3,LUIS),['PET1','2099-03-05','INTERMEDIO','Bells','Regular_625ml',9000,1200,{versionEsperada:0}]);
  e3=null;try{await C.NS.unificarEnDia(viejo,'motivo valido');}catch(x){e3=x;}
  ok(e3&&e3.conflicto&&/9[.,\s]?000/.test(e3.message)&&items(N3).length===2,'unificar con la fila de Intermedio cambiada por otra persona: se rechaza y muestra el valor actual');
}

/* =========================================================
   H3 / H4 · aprobar una solicitud y cambiar de producto, en UNA transacción
   ========================================================= */
{
  const base=()=>{const N=nube();N.docs.set('sync/programaciones',{items:[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',10000,1200,{version:1})]});sol(N,'s1');return N;};
  // aprobación correcta
  let N=base();const A=dispositivo(N,ANA);
  await A.NS.resolverSolicitud('s1',true,'De acuerdo');
  ok(N.confirmaciones()===1&&N.docs.get('solicitudesProgramacion/s1').estado==='APROBADA'&&items(N)[0].cantidadProgramada===12000&&items(N)[0].version===2,'aprobar: cambia la programación, escribe el historial y marca la solicitud en UNA confirmación');
  ok(historial(N).length===1&&historial(N)[0].accion==='APROBACION'&&historial(N)[0].referencia==='s1'&&historial(N)[0].anterior.cantidad===10000&&historial(N)[0].nuevo.cantidad===12000,'el historial de la aprobación trae antes/después y la referencia de la solicitud');
  // fallo de red a mitad: nada cambia
  N=base();N.falla=true;let e=null;const A2=dispositivo(N,ANA);
  try{await A2.NS.resolverSolicitud('s1',true,'De acuerdo');}catch(x){e=x;}
  ok(e&&items(N)[0].cantidadProgramada===10000&&N.docs.get('solicitudesProgramacion/s1').estado==='PENDIENTE'&&historial(N).length===0,'aprobar con fallo de red: la programación NO cambia y la solicitud sigue PENDIENTE (antes podía quedar a medias)');
  // dos aprobadores a la vez
  N=base();const P1=dispositivo(N,ANA),P2=dispositivo(N,LUIS);
  const rs=await Promise.allSettled([P1.NS.resolverSolicitud('s1',true,'ok Ana!'),P2.NS.resolverSolicitud('s1',true,'ok Luis!')]);
  const buenos=rs.filter(r=>r.status==='fulfilled').length,mal=rs.find(r=>r.status==='rejected');
  ok(buenos===1&&mal&&mal.reason.conflicto&&/ya fue resuelta/.test(mal.reason.message),'dos aprobadores a la vez: uno aplica y el otro recibe «ya fue resuelta por otra persona» ('+rs.map(r=>r.status).join(', ')+')');
  ok(items(N)[0].cantidadProgramada===12000&&items(N)[0].version===2&&historial(N).length===1,'se aplicó una sola vez (versión 2, un evento)');
  // la fila cambió después de la solicitud
  N=base();const P3=dispositivo(N,ANA);
  await G(dispositivo(N,LUIS),['PET1','2099-03-01','DÍA','Bells','Regular_625ml',10500,1200,{versionEsperada:1}]);
  e=null;try{await P3.NS.resolverSolicitud('s1',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&e.conflicto&&/10[.,\s]?500/.test(e.message)&&/10[.,\s]?000/.test(e.message)&&items(N)[0].cantidadProgramada===10500&&N.docs.get('solicitudesProgramacion/s1').estado==='PENDIENTE','la fila cambió desde que se pidió: no se aplica, se avisa con el valor actual (10 500) y la solicitud sigue pendiente');
  // solicitud antigua sin baseVersion: se compara la cantidad con la que se pidió
  N=base();N.docs.get('solicitudesProgramacion/s1').baseVersion=undefined;delete N.docs.get('solicitudesProgramacion/s1').baseVersion;
  const P4=dispositivo(N,ANA);await P4.NS.resolverSolicitud('s1',true,'de acuerdo');
  ok(items(N)[0].cantidadProgramada===12000,'solicitudes anteriores (sin versión): se comprueba la cantidad con la que se pidió');
  // cambio de producto
  const baseProd=()=>{const N=nube();N.docs.set('sync/programaciones',{items:[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',10000,1200,{version:1})]});
    sol(N,'s2',{tipo:'CAMBIO_PRODUCTO',propuesta:{marca:'Scala',presentacion:'Regular_380ml',cantidad:8000}});return N;};
  N=baseProd();const P5=dispositivo(N,ANA);
  await P5.NS.resolverSolicitud('s2',true,'de acuerdo');
  const ev=historial(N);
  ok(N.confirmaciones()===1&&items(N).length===1&&items(N)[0].marca==='Scala'&&items(N)[0].cantidadProgramada===8000&&ev.length===2&&ev.some(h=>h.accion==='ELIMINACION')&&ev.some(h=>h.accion==='APROBACION'),'cambiar de producto: se quita el anterior y se crea el nuevo en UNA transacción, con sus dos eventos');
  N=baseProd();N.falla=true;e=null;const P6=dispositivo(N,ANA);
  try{await P6.NS.resolverSolicitud('s2',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&items(N).length===1&&items(N)[0].marca==='Bells'&&items(N)[0].cantidadProgramada===10000,'cambiar de producto con fallo de red: el producto original sigue ahí (antes se perdía)');
  N=baseProd();N.docs.get('solicitudesProgramacion/s2').propuesta={marca:'Inexistente',presentacion:'Regular_380ml',cantidad:8000};e=null;
  try{await dispositivo(N,ANA).NS.resolverSolicitud('s2',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&/marca/i.test(e.message)&&items(N)[0].marca==='Bells'&&N.docs.get('solicitudesProgramacion/s2').estado==='PENDIENTE','cambiar de producto con un dato inválido: se rechaza antes de quitar nada');
  N=baseProd();items(N).push(F('PET1','2099-03-01','DÍA','Scala','Regular_380ml',3000,2184,{version:1}));
  e=null;try{await dispositivo(N,ANA).NS.resolverSolicitud('s2',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&e.conflicto&&/3[.,\s]?000/.test(e.message)&&items(N).length===2&&items(N)[0].marca==='Bells','si el producto pedido ya está programado, no se aplica y se avisa con su valor actual');
  // programación nueva sobre una ya existente
  N=nube();N.docs.set('sync/programaciones',{items:[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',4000,1200,{version:1})]});
  sol(N,'s3',{tipo:'NUEVA_PROGRAMACION',marca:'',presentacion:'',cantidadActual:0,propuesta:{marca:'Bells',presentacion:'Regular_625ml',cantidad:9000}});delete N.docs.get('solicitudesProgramacion/s3').baseVersion;
  e=null;try{await dispositivo(N,ANA).NS.resolverSolicitud('s3',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&e.conflicto&&items(N)[0].cantidadProgramada===4000,'programación nueva cuando ya existe: no la pisa y avisa del valor actual');
  // rechazo: un solo paso con su evento; no se puede rechazar dos veces
  N=base();const R1=dispositivo(N,ANA);
  await R1.NS.resolverSolicitud('s1',false,'No hay material');
  ok(N.confirmaciones()===1&&N.docs.get('solicitudesProgramacion/s1').estado==='RECHAZADA'&&historial(N).length===1&&historial(N)[0].accion==='RECHAZO_SOLICITUD'&&items(N)[0].cantidadProgramada===10000,'rechazar: estado y evento en la misma transacción, sin tocar la programación');
  e=null;try{await dispositivo(N,LUIS).NS.resolverSolicitud('s1',true,'tarde');}catch(x){e=x;}
  ok(e&&e.conflicto&&items(N)[0].cantidadProgramada===10000,'aprobar una solicitud ya rechazada por otra persona: no aplica nada');
  // permisos
  N=base();e=null;
  try{await dispositivo(N,{nombre:'Sup',planifica:false}).NS.resolverSolicitud('s1',true,'de acuerdo');}catch(x){e=x;}
  ok(e&&/Planificación/.test(e.message)&&items(N)[0].cantidadProgramada===10000,'quien no planifica no puede resolver solicitudes');
  // la solicitud guarda la versión de la fila
  N=base();const S=dispositivo(N,{nombre:'Sup',planifica:false});
  S.firebase.auth=()=>({currentUser:{uid:'uid-Sup'}});
  const fuente54=leer('js/produccion/54-planificacion-solicitudes.js');
  ok(/baseVersion:num\(item\.version\)/.test(fuente54)&&/doc\.baseVersion=num\(s\.baseVersion\)/.test(fuente54),'al pedir un cambio se guarda la versión de la fila sobre la que se pidió');
}

/* =========================================================
   H7 · producido del bloque Día + Intermedio (con datos)
   ========================================================= */
{
  const s24=leer('js/produccion/24-semaforo-produccion-actual.js');
  const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,setTimeout,Error,RegExp};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  const prog=[F('PET1','2099-03-01','DÍA','Bells','Regular_625ml',12000,1200),F('PET1','2099-03-01','INTERMEDIO','Bells','Regular_625ml',8000,1200)];
  sb.loadProgramaciones=()=>prog;
  const paletas=[{linea:'PET1',fecha:'2099-03-01',turno:'DÍA',marca:'Bells',presentacion:'Regular_625ml',totalUnidades:5000,tipoPaleta:'COMPLETA',paletas:4},
                 {linea:'PET1',fecha:'2099-03-01',turno:'INTERMEDIO',marca:'Bells',presentacion:'Regular_625ml',totalUnidades:3000,tipoPaleta:'COMPLETA',paletas:2}];
  sb.loadPaletas=()=>paletas;
  sb.obtenerUnidadesPorPalet=()=>1200;
  sb.loadRecords=()=>[
    {linea:'PET1',fecha:'2099-03-01',turno:'DÍA',cuadros:[{marca:'Bells',presentacion:'Regular_625ml',produccion:{efectiva:4800}}]},
    {linea:'PET1',fecha:'2099-03-01',turno:'INTERMEDIO',cuadros:[{marca:'Bells',presentacion:'Regular_625ml',produccion:{efectiva:2900}}]}];
  let enCurso=true;sb.bloqueAhora=()=>null;sb.turnoActivo=()=>enCurso;
  const piezas=['normalizarClavePaletas','claveCombinacionPaletas','esCombinacionPaletas','claveProgramacionPaleta','obtenerProgramacionPaleta','datosProgramacionCombinacion','resumenProgramacionCombinacionTurnos'].map(n=>extraer(s16,n)).join('');
  const envoltura=s24.slice(s24.indexOf('const resumenTurnosAnterior=resumenProgramacionCombinacionTurnos;'),s24.indexOf('const uppAnterior=unidadesPorPaletaActiva;'));
  const regs=s24.slice(s24.indexOf('const quitarTilde='),s24.indexOf('function registroDeTurno(x){'))+extraer(s24,'registroDeTurno')+extraer(s24,'producidoVigenteDe');
  vm.runInContext('var num=v=>{const n=Number(v);return isFinite(n)?n:0;};'+piezas+envoltura+regs,sb);
  const prod=turno=>vm.runInContext('producidoVigenteDe',sb)({linea:'PET1',fecha:'2099-03-01',turno,marca:'Bells',presentacion:'Regular_625ml'});
  const sinEnvolver=vm.runInContext('resumenTurnosAnterior',sb)('PET1','2099-03-01',['DÍA'],'Bells','Regular_625ml').unidadesProducidas;
  ok(sinEnvolver===5000,'(referencia) sin la envoltura de 24, consultar solo DÍA daría 5 000 — la mitad del bloque');
  ok(prod('DÍA')===8000&&prod('INTERMEDIO')===8000,'H7 — turno en curso: la fila representativa DÍA (o INTERMEDIO) devuelve el producido del BLOQUE = 5 000 + 3 000 = 8 000');
  enCurso=false;
  ok(prod('DÍA')===7700&&prod('INTERMEDIO')===7700,'H7 — turno cerrado: el registro del bloque suma Día + Intermedio = 4 800 + 2 900 = 7 700');
  // la pantalla de Cumplimiento (54) cuenta cada producto del bloque UNA vez
  const dispo=dispositivo(nube(),ANA);
  dispo._programacionesCache=clon(prog);dispo.glacialProducidoVigente=x=>prod(x.turno);
  dispo.NS.estado={tab:'cumplimiento'};
  const fuente54=leer('js/produccion/54-planificacion-solicitudes.js');
  ok(/glacialProducidoVigente\(p\)/.test(fuente54)&&/bloques\.get\(k\)/.test(fuente54),'Cumplimiento agrupa las filas DÍA e INTERMEDIO de un producto en un solo bloque y pide su producido una vez');
}

/* =========================================================
   Reglas y compatibilidad con el puente de Supabase
   ========================================================= */
{
  const reglas=leer('_archivo/firebase/firestore.rules.etapa2.txt');
  ok(/match \/historialProgramacion\/\{id\}/.test(reglas)&&/match \/solicitudesProgramacion\/\{id\}/.test(reglas),'las reglas de historial y solicitudes ya cubren lo que ahora se escribe en la transacción');
  const fuentes=['16-paletas','51-planificacion-nucleo','52-planificacion-pantalla','54-planificacion-solicitudes'].map(f=>leer('js/produccion/'+f+'.js')).join('\n');
  ok(!/FieldValue\.(increment|arrayUnion|arrayRemove)|array-contains|startAfter|endBefore|where\([^)]*,\s*'(in|!=)'/.test(fuentes),'sin construcciones que el puente no admite (increment, arrayUnion, in, !=, startAfter…)');
  ok(!/\.add\(/.test(leer('js/produccion/54-planificacion-solicitudes.js').replace(/await db\.collection\('solicitudesProgramacion'\)\.add\(doc\);/,'').replace(/await db\.collection\('historialProgramacion'\)\.add\(doc\);/,'')),'el historial nuevo usa ids propios (set), no add()');
}
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
