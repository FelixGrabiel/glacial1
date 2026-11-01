/* Copia del Control de proceso a Drive — función de servidor (lógica pura con Google y base simulados), migración glacial_35, tarjeta de la pestaña Lotes e integración.
   Solo LEE reportes; no toca producción, stock SAP ni tareo. node tests/control-proceso-drive-funcion.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const P=require('../js/asistente/90-control-proceso-nucleo.js');

const LOTES=[{categoria:'preformas',loteProveedor:'2605008F300'},{categoria:'tapas',loteProveedor:'30/05-B'},{categoria:'etiquetas',loteProveedor:'0468-26'},{categoria:'asas',loteProveedor:'01/06-B'}];
const rep=(id,fecha,turno,e,venc,extra={})=>({id,fecha,turno,linea:'B7L',cuadros:[{estadoCuadro:'FINALIZADO',numero:1,marca:'SCALA',presentacion:'Bidón 7 Litros',lote:'CF3',fechaVencimiento:venc,produccion:{efectiva:e,sopladas:e,programada:e},lotesInsumo:LOTES,...extra}]});
const REGS=[rep('r1','2026-10-01','DÍA',6552,'2027-10-01'),rep('r2','2026-10-01','NOCHE',5808,'2027-10-02')];

(async()=>{
  const S=await import('../supabase/functions/control-proceso-drive/sync.mjs');
  const N=(await import('../supabase/functions/control-proceso-drive/nucleo.mjs')).default;

  /* ================= una sola fuente de reglas ================= */
  const v=cp.spawnSync('node',[R+'/scripts/generar-nucleo-drive.js','--verificar'],{encoding:'utf8'});
  ok(v.status===0,'nucleo.mjs y logo.mjs de la función están al día con el núcleo de la página (misma fuente de reglas que el Excel)');
  const a=N.modeloMes(REGS,{linea:'B7L',anio:2026,mes:10}),b=P.modeloMes(REGS,{linea:'B7L',anio:2026,mes:10});
  ok(JSON.stringify(a)===JSON.stringify(b)&&a.total===2&&a.hojas[0].presentacion==='7L','la función y la página arman exactamente el mismo modelo del mes (la presentación del formulario es «7L», no el texto largo del reporte)');

  /* ================= meses, huellas y reintentos ================= */
  const lima=(iso)=>Date.parse(iso);
  ok(JSON.stringify(S.mesLima(lima('2026-11-01T03:00:00Z')))==='{"anio":2026,"mes":10,"dia":31}','el mes es el de Lima (UTC-5): la 1 a. m. UTC del 1 de noviembre aún es 31 de octubre');
  ok(S.mesesASincronizar(lima('2026-10-25T18:00:00Z')).map(S.claveMes).join()==='2026-10'&&S.mesesASincronizar(lima('2026-10-02T18:00:00Z')).map(S.claveMes).join()==='2026-10,2026-09'&&S.mesesASincronizar(lima('2027-01-02T18:00:00Z')).map(S.claveMes).join()==='2027-01,2026-12','mes actual y, los primeros 3 días, también el anterior (enero → diciembre del año anterior)');
  const h1=await S.huellaModelo(a),h2=await S.huellaModelo(b);
  const c=P.modeloMes([rep('r1','2026-10-01','DÍA',6553,'2027-10-01'),REGS[1]],{linea:'B7L',anio:2026,mes:10});
  ok(h1===h2&&/^[a-f0-9]{64}$/.test(h1)&&h1!==await S.huellaModelo(c),'la huella es estable y cambia cuando cambia cualquier dato que se escribe en Drive');
  ok([1,2,3,4,5,6].map(S.esperaMinutos).join()==='5,10,20,40,60,60'&&S.esperaMinutos(0)===5,'espera tras fallar: 5, 10, 20, 40 y luego 60 minutos');
  const ahora=lima('2026-10-25T18:00:00Z'),previoOk={hash:'H',ok:true,intentos:0,intento_en:new Date(ahora-3600000).toISOString()};
  ok(S.decidir(null,'H',ahora).accion==='sincronizar'&&S.decidir(previoOk,'H',ahora).motivo==='sin_cambios'&&S.decidir(previoOk,'H2',ahora).motivo==='cambio'&&S.decidir(previoOk,'H',ahora,{forzar:true}).motivo==='forzado','decide: primera vez, omitir si no cambió, sincronizar si cambió o si se fuerza');
  const previoMal={hash:'H',ok:false,intentos:2,intento_en:new Date(ahora-5*60000).toISOString()};
  ok(S.decidir(previoMal,'H',ahora).accion==='omitir'&&S.decidir(previoMal,'H',ahora).motivo==='espera'&&S.decidir({...previoMal,intento_en:new Date(ahora-11*60000).toISOString()},'H',ahora).motivo==='reintento'&&S.decidir(previoMal,'H2',ahora).accion==='sincronizar'&&S.decidir(previoMal,'H',ahora,{forzar:true}).accion==='sincronizar','tras un fallo espera antes de reintentar, salvo que el contenido cambie o se fuerce');
  ok(await S.secretoValido('a'.repeat(30),'a'.repeat(30))&&!(await S.secretoValido('a'.repeat(30),'b'.repeat(30)))&&!(await S.secretoValido('corto','corto'))&&!(await S.secretoValido(null,'a'.repeat(30)))&&!(await S.secretoValido('a'.repeat(30),'')),'el secreto se compara en tiempo constante y exige 24 caracteres');

  /* ================= cuerpo para el Apps Script ================= */
  const pl=S.payloadDeModelo(a,{secreto:'s'.repeat(30),formulario:S.FORMULARIO,logo:'LOGO'});
  const f0=pl.hojas[0].filas[0];
  ok(pl.libro.nombre==='C.P_BIDON_7L-OCTUBRE-2026'&&pl.hojas[0].nombre==='SCALA'&&pl.formulario.codigo==='CF - CA - F - 047'&&pl.logo==='LOGO'&&pl.secreto==='s'.repeat(30),'el cuerpo trae libro, hojas, formulario, logo y la clave del script');
  ok(f0.clave==='r1#1'&&f0.lotePT==='CF3-01102027'&&f0.preforma==='2605008F300'&&f0.tapa==='30/05-B'&&f0.etiqueta==='0468-26'&&f0.asa==='01/06-B'&&f0.envasado===6552&&f0.turno==='D'&&!('registroId' in f0)&&!('claveCuadro' in f0)&&!('numero' in f0),'cada fila lleva solo lo que se escribe en Drive (nada de más del reporte)');

  /* ================= llamar al Apps Script ================= */
  const URL_OK='https://script.google.com/macros/s/AKfycbxAAA_bbb-123/exec';
  const resp=(obj,status=200)=>async()=>({status,text:async()=>typeof obj==='string'?obj:JSON.stringify(obj)});
  let r=await S.llamarAppsScript(resp({ok:true,libro:{id:'L1',url:'https://docs.google.com/spreadsheets/d/L1',nuevo:true},hojas:[{nombre:'SCALA',creadas:2}]}),URL_OK,pl);
  ok(r.ok&&r.libro.id==='L1'&&r.hojas.length===1,'respuesta correcta del script');
  r=await S.llamarAppsScript(resp({ok:false,codigo:'secreto',error:'Secreto no válido.'}),URL_OK,pl);
  ok(!r.ok&&r.definitivo===true&&/Secreto/.test(r.error),'una clave rechazada es un error de configuración (definitivo)');
  r=await S.llamarAppsScript(resp({ok:false,codigo:'interno',error:'Service invoked too many times'}),URL_OK,pl);
  ok(!r.ok&&r.definitivo===false,'un error interno de Google es transitorio (se reintenta)');
  r=await S.llamarAppsScript(resp('<html>Error</html>',500),URL_OK,pl);
  ok(!r.ok&&/no válida/.test(r.error)&&r.definitivo===false,'si Google responde otra cosa que JSON, error claro y reintento');
  r=await S.llamarAppsScript(async()=>{throw new Error('fetch failed https://script.google.com/macros/s/AKfycbxAAA/exec');},URL_OK,pl);
  ok(!r.ok&&!/script\.google\.com/.test(r.error),'un fallo de red no filtra la dirección del script en el mensaje');
  r=await S.llamarAppsScript(async(u,o)=>new Promise((_,rej)=>o.signal.addEventListener('abort',()=>rej(new Error('aborted')))),URL_OK,pl,20);
  ok(!r.ok&&/tardó demasiado/.test(r.error),'si Google no responde a tiempo se corta y se reintenta después');
  r=await S.llamarAppsScript(resp({ok:false,codigo:'hoja_ajena',error:'La hoja «SCALA» no fue creada por GLACIAL'}),URL_OK,pl);
  ok(!r.ok&&r.definitivo===true,'una hoja ajena en el libro es un error de configuración (no se reintenta cada 5 minutos)');
  ok((await S.llamarAppsScript(resp({}),'http://evil.example/exec',pl)).definitivo===true&&(await S.llamarAppsScript(resp({}),'https://script.google.com.evil.com/macros/s/A/exec',pl)).definitivo===true&&(await S.llamarAppsScript(resp({}),'',pl)).ok===false,'solo se llama a una dirección de aplicación web de Google (https://script.google.com/macros/s/…/exec)');
  let enviado=null;
  await S.llamarAppsScript(async(u,o)=>{enviado={u,o};return {status:200,text:async()=>'{"ok":true,"libro":{"id":"x"}}'};},URL_OK,pl);
  ok(enviado.o.method==='POST'&&enviado.o.redirect==='follow'&&JSON.parse(enviado.o.body).secreto===pl.secreto,'POST con redirección permitida (así responde Google)');

  /* ================= sincronizar un mes de punta a punta (base y Google simulados) ================= */
  const mundo=(regs,fetchImpl)=>{
    const m={filas:new Map(),guardados:[],llamadas:0,t:lima('2026-10-25T18:00:00Z'),regs};
    m.deps={P:N,logo:'LOGO',appsUrl:URL_OK,appsSecreto:'s'.repeat(30),ahora:()=>m.t,
      leerRegistros:async()=>m.regs,leerPrevio:async(l,mes)=>m.filas.get(l+mes)||null,
      guardar:async(l,mes,campos)=>{m.guardados.push(campos);m.filas.set(l+mes,{...(m.filas.get(l+mes)||{}),...campos});},
      fetchImpl:fetchImpl||(async()=>{m.llamadas++;return {status:200,text:async()=>JSON.stringify({ok:true,libro:{id:'L1',url:'https://docs.google.com/spreadsheets/d/L1'},hojas:[]})};})};
    return m;
  };
  let w=mundo(REGS);
  let x=await S.sincronizarMes(w.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.ok&&x.estado==='sincronizado'&&x.filas===2&&x.hojas===1&&w.llamadas===1&&w.guardados[0].ok===true&&w.guardados[0].libro_url==='https://docs.google.com/spreadsheets/d/L1'&&w.guardados[0].intentos===0&&/^[a-f0-9]{64}$/.test(w.guardados[0].hash),'primera vez: llama a Google, guarda el enlace, la huella y deja los intentos en 0');
  x=await S.sincronizarMes(w.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.ok&&x.estado==='omitido'&&x.motivo==='sin_cambios'&&w.llamadas===1,'sin cambios: no vuelve a llamar a Google');
  w.regs=[rep('r1','2026-10-01','DÍA',6600,'2027-10-01'),REGS[1]];
  x=await S.sincronizarMes(w.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.estado==='sincronizado'&&x.motivo==='cambio'&&w.llamadas===2,'un reporte que cambió se vuelve a copiar');
  x=await S.sincronizarMes(w.deps,{linea:'B7L',anio:2026,mes:10,forzar:true});
  ok(x.estado==='sincronizado'&&x.motivo==='forzado'&&w.llamadas===3,'«Sincronizar ahora» fuerza la copia');
  const sinDatos=mundo([rep('z','2026-09-01','DÍA',10,'2027-09-01')]);
  x=await S.sincronizarMes(sinDatos.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.ok&&x.estado==='sin_datos'&&sinDatos.llamadas===0&&sinDatos.guardados.length===0,'un mes sin cuadros no crea libros vacíos en Drive');
  /* fallos */
  const mal=mundo(REGS,async()=>({status:200,text:async()=>JSON.stringify({ok:false,codigo:'interno',error:'Limite diario excedido'})}));
  x=await S.sincronizarMes(mal.deps,{linea:'B7L',anio:2026,mes:10});
  ok(!x.ok&&x.estado==='error'&&mal.guardados[0].ok===false&&mal.guardados[0].intentos===1&&/Limite/.test(mal.guardados[0].error),'si Google falla queda registrado el error y un intento');
  mal.t+=60_000;
  x=await S.sincronizarMes(mal.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.ok&&x.estado==='omitido'&&x.motivo==='espera'&&mal.guardados.length===1,'no insiste antes de tiempo (espera creciente)');
  mal.t+=6*60_000;
  x=await S.sincronizarMes(mal.deps,{linea:'B7L',anio:2026,mes:10});
  ok(x.estado==='error'&&mal.guardados[1].intentos===2,'pasada la espera reintenta y sube el contador');
  const conf=mundo(REGS,async()=>({status:200,text:async()=>JSON.stringify({ok:false,codigo:'secreto',error:'Secreto no válido.'})}));
  await S.sincronizarMes(conf.deps,{linea:'B7L',anio:2026,mes:10});
  ok(conf.guardados[0].intentos===3&&S.esperaMinutos(3)===20,'un error de configuración (clave o carpeta) espera más: reintentar igual no lo arregla');
  const lee=mundo(REGS);lee.deps.leerRegistros=async()=>{throw new Error('timeout');};
  x=await S.sincronizarMes(lee.deps,{linea:'B7L',anio:2026,mes:10});
  ok(!x.ok&&/No se pudieron leer los reportes/.test(x.error)&&lee.llamadas===0&&lee.guardados.length===0,'si no se pueden leer los reportes no llama a Google ni pisa el estado anterior');
  ok((await S.sincronizarMes(w.deps,{linea:'PET1',anio:2026,mes:10})).estado==='error'&&(await S.sincronizarMes(w.deps,{linea:'B7L',anio:2026,mes:13})).ok===false,'una línea sin formulario o un mes no válido no llaman a Google');
  const sinCfg=mundo(REGS);sinCfg.deps.appsUrl='';
  x=await S.sincronizarMes(sinCfg.deps,{linea:'B7L',anio:2026,mes:10});
  ok(!x.ok&&sinCfg.guardados[0].intentos>=3,'sin la dirección del Apps Script queda como error de configuración');

  /* ================= index.ts (texto) ================= */
  const ts=leer('supabase/functions/control-proceso-drive/index.ts');
  ok(/x-glacial-sync/.test(ts)&&/secretoValido\(secretoRecibido/.test(ts)&&/Bearer/.test(ts)&&/control_proceso_puede/.test(ts)&&/403/.test(ts),'dos formas de entrar: clave del disparador (en tiempo constante) o sesión de un usuario con permiso ii_esc');
  ok(/SYNC_SECRETO/.test(ts)&&/APPS_SCRIPT_URL/.test(ts)&&/APPS_SCRIPT_SECRETO/.test(ts)&&/length < 24/.test(ts)&&/--no-verify-jwt/.test(ts),'secretos de la función documentados y la clave del script exige 24 caracteres');
  ok(/from\('fs_items'\)\.select\('datos'\)/.test(ts)&&!/from\('fs_items'\)\.(insert|update|upsert|delete)/.test(ts)&&!/from\('fs_docs'\)/.test(ts)&&/from\('control_proceso_sync'\)\.upsert/.test(ts),'solo LEE los reportes (fs_items) y solo escribe en control_proceso_sync');
  ok(/LINEAS = \['B7L'\]/.test(ts)&&/forzar = modo === 'manual'/.test(ts),'solo B7L; «forzar» solo lo puede pedir una persona, no el disparador');

  /* ================= migración glacial_35 ================= */
  const sql=leer('supabase/migraciones/glacial_35_control_proceso_drive.sql');
  ok(/NO APLICADA/.test(sql)&&/ii_esc/.test(sql)&&/ii_ver/.test(sql)&&/raise exception/.test(sql)&&/glacial_24/.test(sql),'migración marcada como no aplicada; se detiene sin cambios si falta glacial_24');
  ok(/enable row level security/.test(sql)&&/revoke all on public\.control_proceso_sync from public, anon, authenticated/.test(sql)&&!/create policy/i.test(sql),'la tabla tiene RLS sin políticas y sin permisos para anon ni authenticated');
  ok(/control_proceso_url/.test(sql)&&/control_proceso_sync_secreto/.test(sql)&&/vault\.decrypted_secrets/.test(sql)&&/coalesce\(v_url, ''\) = '' or coalesce\(v_sec, ''\) = '' then return/.test(sql),'el disparador lee la dirección y la clave del Vault y no hace nada si faltan');
  ok(/cron\.schedule\('control-proceso-drive', '\*\/5 \* \* \* \*'/.test(sql)&&/cron\.unschedule/.test(sql),'trabajo de pg_cron cada 5 minutos (se reemplaza si ya existía)');
  ok(!/stock|OnHand|apMovimientos|insumosCortes/i.test(sql.replace(/--[^\n]*/g,'')),'la migración no toca stock SAP ni producción');

  /* ================= tarjeta en la pestaña Lotes ================= */
  const sb={console,Math,Number,Array,Object,String,Set,Map,JSON,Date,Promise,Error,RegExp,setTimeout,clearTimeout};
  vm.createContext(sb);sb.window=sb;
  sb.loadRecords=()=>REGS;
  let rpcs=0,estado={data:[],error:null},invocaciones=[],invocar=async()=>({data:{resultados:[{ok:true,estado:'sincronizado',filas:2,hojas:1}]},error:null});
  sb.glacialSupabaseCliente={rpc:async n=>{rpcs++;return typeof estado==='function'?estado(n):estado;},functions:{invoke:async(n,o)=>{invocaciones.push([n,o]);return invocar(n,o);}}};
  vm.runInContext(leer('js/asistente/90-control-proceso-nucleo.js'),sb);vm.runInContext(leer('js/asistente/91-control-proceso-excel.js'),sb);
  const UI=sb.iiControlProcesoUI;let repintados=0;UI.usar(()=>{repintados++;});
  const esperar=()=>new Promise(r=>setTimeout(r,25));
  const pintar=async()=>{UI.estado.drive.en=0;UI.html();await esperar();return UI.html();};
  UI.estado.mes='2026-10';
  estado={data:null,error:{code:'PGRST202',message:'Could not find the function public.control_proceso_estado'}};
  let h=await pintar();
  ok(/no está activada en este servidor/.test(h)&&!/Sincronizar ahora con Drive/.test(h),'sin glacial_35 la tarjeta dice que la copia a Drive no está activada y no ofrece sincronizar');
  estado={data:[],error:null};h=await pintar();
  ok(/todavía no se copió a Drive/.test(h)&&/Sincronizar ahora con Drive/.test(h),'sin ninguna copia: lo dice y ofrece «Sincronizar ahora»');
  const hace2=new Date(Date.now()-2*60000).toISOString();
  estado={data:[{linea:'B7L',mes:'2026-10',ok:true,filas:2,libro_url:'https://docs.google.com/spreadsheets/d/L1',sincronizado_en:hace2,intentos:0}],error:null};h=await pintar();
  ok(/✓ Copiado a Drive hace 2 min/.test(h)&&/2 filas/.test(h)&&/href="https:\/\/docs\.google\.com\/spreadsheets\/d\/L1"/.test(h)&&/target="_blank" rel="noopener noreferrer"/.test(h),'copia correcta: «Copiado a Drive hace 2 min», filas y enlace «Abrir en Drive»');
  estado={data:[{linea:'B7L',mes:'2026-10',ok:false,error:'Secreto no válido.',intentos:3,libro_url:'javascript:alert(1)',intento_en:hace2}],error:null};h=await pintar();
  ok(/La última copia a Drive falló: Secreto no válido\./.test(h)&&/reintentos: 3/.test(h)&&!/javascript:/.test(h)&&!/Abrir en Drive/.test(h),'copia fallida: muestra el error y los reintentos; un enlace que no es de Google Sheets no se muestra');
  estado={data:[{linea:'B7L',mes:'2026-10',ok:false,error:'<img src=x onerror=alert(1)>',intentos:1}],error:null};h=await pintar();
  ok(!/<img/.test(h)&&/&lt;img/.test(h),'el error se muestra escapado');
  estado={data:[{linea:'B7L',mes:'2026-09',ok:true,filas:9,sincronizado_en:hace2}],error:null};h=await pintar();
  ok(/todavía no se copió a Drive/.test(h),'cada mes muestra su propio estado');
  estado={data:null,error:{code:'42501',message:'Sin permiso para ver la copia a Drive'}};h=await pintar();
  ok(/No se pudo leer el estado: Sin permiso/.test(h),'un error de permisos se muestra como tal');
  const antes=rpcs;UI.html();UI.html();UI.html();await esperar();
  ok(rpcs===antes,'consulta el estado una vez por minuto, no en cada repintado');
  estado={data:[],error:null};h=await pintar();
  await sb.cpSincronizar();
  ok(invocaciones.length===1&&invocaciones[0][0]==='control-proceso-drive'&&invocaciones[0][1].body.forzar===true&&invocaciones[0][1].body.mes==='2026-10'&&/Copiado a Drive: 2 filas en 1 hojas/.test(UI.html()),'«Sincronizar ahora» invoca la función con forzar y el mes elegido y muestra el resultado');
  invocar=async()=>({data:{ok:false,resultados:[{ok:false,estado:'error',error:'Secreto no válido.'}]},error:null});
  await sb.cpSincronizar();
  ok(/No se pudo copiar a Drive: Secreto no válido\./.test(UI.html()),'un error de Google se muestra en la tarjeta');
  invocar=async()=>({data:null,error:{message:'Edge Function returned a non-2xx status code'}});
  await sb.cpSincronizar();
  ok(/No se pudo copiar a Drive: Edge Function returned/.test(UI.html()),'un fallo de la función (no 2xx) también se muestra');
  sb.glacialTrazabilidadDatos={puedeEscribir:()=>false};
  h=await pintar();const n=invocaciones.length;await sb.cpSincronizar();
  ok(!/Sincronizar ahora con Drive/.test(h)&&invocaciones.length===n,'solo consulta: sin botón y sin invocar la función');
  sb.glacialTrazabilidadDatos=undefined;
  ok(/\.cp-drive\{/.test(UI.css)&&/cp-err/.test(UI.css),'estilos de la línea de Drive');

  /* ================= guía e integración ================= */
  const doc=leer('docs/asistente/control-proceso-drive.md');
  ok(/Conectar con Drive/.test(doc)&&/Apps Script/.test(doc)&&/APPS_SCRIPT_URL/.test(doc)&&/control_proceso_sync_secreto/.test(doc)&&/glacial_35/.test(doc),'la guía explica cómo conectar con Drive (Apps Script, secretos, Vault y migración)');
  ok(fs.existsSync(R+'/supabase/drive/apps-script/Codigo.gs')&&/doPost/.test(leer('supabase/drive/apps-script/Codigo.gs')),'el código del Apps Script está en el repositorio');
  console.log(fallas?('\n'+fallas+' fallas'):'\ntodo correcto');
})();
