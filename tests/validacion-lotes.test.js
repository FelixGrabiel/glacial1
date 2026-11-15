/* Calidad › Validación de lotes: función de ingesta (núcleo), migración glacial_54, lógica de la pestaña y conexiones. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const SECRETO='secreto-de-prueba-con-mas-de-24-caracteres';
const AHORA=Date.parse('2026-11-15T12:00:00Z');
const base={clave:'wa-120363@3EB0ABC123',lote:' L2411-07 ',resultado:'ok',insumo:'Cajas de preformas 15.7 g',proveedor:'Plastipak',linea:'PET1',
  controles:[{nombre:'Lote legible',resultado:'ok'},{nombre:'Fecha de vencimiento',resultado:'FALLA',detalle:'vence en 3 días'}],evidencia_sha256:'a'.repeat(64),validada_en:'2026-11-15T11:30:00Z'};

(async()=>{
  const N=await import(R+'/supabase/functions/validaciones-lotes-ingesta/nucleo.mjs');
  const v=(c,o)=>N.validarSolicitud({metodo:'POST',secretoRecibido:SECRETO,secretoEsperado:SECRETO,cuerpoTexto:typeof c==='string'?c:JSON.stringify(c),ahora:AHORA,...(o||{})});
  let r=await v(base);
  ok(r.ok&&r.fila.lote==='L2411-07'&&r.fila.resultado==='OK'&&r.fila.controles[0].resultado==='OK'&&r.fila.controles[1].detalle==='vence en 3 días'&&r.fila.validada_en==='2026-11-15T11:30:00.000Z'&&r.fila.origen==='bot','una validación correcta se limpia y se normaliza (lote sin espacios, resultado en mayúsculas)');
  r=await v(base,{metodo:'GET'});ok(!r.ok&&r.estado===405,'solo se acepta POST');
  r=await v(base,{secretoRecibido:'otro-secreto-con-mas-de-24-caracteres'});ok(!r.ok&&r.estado===401&&r.codigo==='secreto','secreto incorrecto: 401 (antes de leer el cuerpo)');
  r=await v(base,{secretoEsperado:'corto'});ok(!r.ok&&r.estado===500&&r.codigo==='sin_configurar','sin secreto configurado (o muy corto) el servicio se niega a funcionar');
  r=await v('{no json');ok(!r.ok&&r.codigo==='json','JSON inválido');
  r=await v('x'.repeat(N.MAX_CUERPO+1));ok(!r.ok&&r.estado===413,'cuerpo demasiado grande');
  r=await v({...base,clave:'corta'});ok(!r.ok&&r.codigo==='clave','la clave (idempotencia) debe tener de 8 a 128 caracteres válidos');
  r=await v({...base,lote:'  '});ok(!r.ok&&r.codigo==='lote','falta el lote');
  r=await v({...base,resultado:'TAL VEZ'});ok(!r.ok&&r.codigo==='resultado','resultado fuera de OK/OBSERVADO/RECHAZADO');
  r=await v({...base,controles:[{nombre:'x',resultado:'QUIZÁS'}]});ok(!r.ok&&r.codigo==='controles','control con resultado inválido');
  r=await v({...base,controles:new Array(41).fill({nombre:'x',resultado:'OK'})});ok(!r.ok&&r.codigo==='controles','más de 40 controles');
  r=await v({...base,evidencia_sha256:'zz'});ok(!r.ok&&r.codigo==='evidencia','la huella de la evidencia debe ser SHA-256');
  r=await v({...base,validada_en:'2026-11-20T00:00:00Z'});ok(!r.ok&&r.codigo==='validada_en','fecha de validación en el futuro: rechazada');
  r=await v({...base,validada_en:'2024-01-01T00:00:00Z'});ok(!r.ok&&r.codigo==='validada_en','fecha de hace más de 400 días: rechazada');
  r=await v({clave:'wa-120363@3EB0ABC999',lote:'A1',resultado:'rechazado',motivo:'Etiqueta ilegible\n\u0000'});
  ok(r.ok&&r.fila.validada_en===new Date(AHORA).toISOString()&&r.fila.motivo==='Etiqueta ilegible'&&r.fila.controles.length===0&&r.fila.insumo===null,'sin fecha usa la de recepción; el motivo se limpia; lo opcional queda en null');
  r=await v({...base,datos:{a:'x'.repeat(21000)}});ok(!r.ok&&r.codigo==='datos_tamano','«datos» demasiado grande');

  // migración y función
  const sql=leer('supabase/migraciones/glacial_54_validaciones_lotes.sql');
  ok(/enable row level security/.test(sql)&&/revoke all on public\.validaciones_lotes from public, anon, authenticated/.test(sql)&&!/create policy/i.test(sql),'glacial_54: RLS activada, sin permisos para anon/authenticated y sin políticas');
  ok(/'ii_ver'/.test(sql.split('validaciones_lotes_listar')[1])&&/'ii_esc'/.test(sql.split('validaciones_lotes_revisar(p_clave')[1]),'glacial_54: listar exige ii_ver y revisar exige ii_esc');
  ok(/security definer set search_path = ''/.test(sql)&&/revoke all on function public\.validaciones_lotes_listar/.test(sql)&&/grant execute on function public\.validaciones_lotes_revisar\(text, text\) to authenticated/.test(sql),'glacial_54: funciones SECURITY DEFINER con search_path vacío y permisos explícitos');
  const ts=leer('supabase/functions/validaciones-lotes-ingesta/index.ts');
  ok(/x-glacial-validaciones/.test(ts)&&/VALIDACIONES_SECRETO/.test(ts)&&/VALIDACIONES_MAX_DIA/.test(ts)&&/ignoreDuplicates: true/.test(ts)&&/tope_diario/.test(ts),'la función usa su propio secreto y cabecera, tope diario e idempotencia por clave');
  ok(!/INGESTA_SECRETO/.test(ts),'el secreto es distinto del de Evidencias');

  // lógica de la pestaña
  const P=require(R+'/js/calidad/99-validacion-lotes.js');
  const filas=[
    {clave:'a',lote:'L1',resultado:'OK',validada_en:'2026-11-15T10:00:00Z',controles:[{nombre:'x',resultado:'OK'}]},
    {clave:'b',lote:'L2',resultado:'OBSERVADO',insumo:'Polietileno 56 cm',validada_en:'2026-11-15T11:00:00Z',controles:[{nombre:'Fecha',resultado:'FALLA'}]},
    {clave:'c',lote:'L-3',resultado:'RECHAZADO',proveedor:'Acme',validada_en:'2026-11-14T09:00:00Z',revision_estado:'REVISADA',revisada_por:'ana@glacial'},
    {clave:'d',lote:'L1',resultado:'RARO',validada_en:'no es fecha'}].map(P.normalizar);
  const rs=P.resumen(filas);
  ok(rs.total===4&&rs.OK===1&&rs.OBSERVADO===2&&rs.RECHAZADO===1&&rs.pendientes===2&&rs.lotes===3,'resumen: totales por resultado, por revisar (observadas/rechazadas sin revisar) y lotes distintos');
  ok(filas[3].resultado==='OBSERVADO'&&filas[3].ms===0,'un resultado desconocido se muestra como «con observación» y una fecha inválida no rompe');
  ok(P.filtrar(filas,{revision:'PIDE'}).map(x=>x.clave).join()==='b,d','filtro «por revisar»');
  ok(P.filtrar(filas,{resultado:'RECHAZADO'}).length===1&&P.filtrar(filas,{revision:'REVISADA'})[0].clave==='c','filtros por resultado y por revisadas');
  ok(P.filtrar(filas,{texto:'l3'})[0].clave==='c'&&P.filtrar(filas,{texto:'polietileno'})[0].clave==='b','la búsqueda ignora guiones, mayúsculas y tildes (L-3 = L3)');
  ok(P.filtrar(filas,{}).map(x=>x.clave).join()==='b,a,c,d','orden: la más reciente primero');
  ok(P.normalizar(null).lote==='—'&&P.normalizar({}).controles.length===0,'normalizar no lanza con datos vacíos');

  // conexiones: módulo CALIDAD propio (ya no es una pestaña del Asistente)
  const a72=leer('js/asistente/72-asistente-pantalla.js'),idx=leer('index.html'),cal=leer('js/calidad/100-calidad-pantalla.js'),sb=leer('js/nucleo/04-sidebar.js');
  ok(!/validaciones/.test(a72.replace(/validaciones_/g,''))&&!/apValidacionLotesUI/.test(a72),'el Asistente ya no tiene la pestaña de validación de lotes');
  ok(/id="sidebar-group-calidad"/.test(idx)&&/data-sidebar-group="calidad"/.test(idx)&&/id="btn-calidad-validacion"[\s\S]{0,120}goCalidad\('validacion'\)/.test(idx)&&/Calidad<\/span>/.test(idx),'el menú lateral tiene el grupo «Calidad» con «Validación de lotes»');
  ok(/state\.currentTab==='calidad'\)return 'calidad'/.test(sb),'el grupo Calidad se abre solo cuando se está en él');
  ok(/glacialCalidadPermisos[\s\S]{0,80}puedeVer/.test(cal)&&!/glacialInventarioDatos/.test(cal)&&!/glacialInventarioDatos/.test(leer('js/calidad/99-validacion-lotes.js'))&&/window\.goCalidad=/.test(cal)&&/ajustarVistaSegunPermisos=function/.test(cal)&&/renderSidebar=function/.test(cal),'Calidad usa sus propios permisos (no los del Inventario) y se engancha a la navegación');
  ok(idx.indexOf('js/calidad/98-calidad-permisos.js')<idx.indexOf('js/calidad/99-validacion-lotes.js')&&idx.indexOf('js/calidad/99-validacion-lotes.js')<idx.indexOf('js/calidad/100-calidad-pantalla.js'),'index: orden de carga (permisos → validación → pantalla de Calidad)');
  const js=leer('js/calidad/99-validacion-lotes.js');
  ok(/validaciones_lotes_listar/.test(js)&&/validaciones_lotes_revisar/.test(js)&&!/\.from\(['"]validaciones_lotes/.test(js),'la página usa solo las funciones del servidor, nunca la tabla directa');
  ok(fs.existsSync(R+'/docs/asistente/validacion-lotes.md')||fs.existsSync(R+'/docs/calidad/validacion-lotes.md'),'existe la guía con el contrato para el bot');

  // permisos propios de Calidad (glacial_55 + Gestión de usuarios)
  const PC=require(R+'/js/calidad/98-calidad-permisos.js');
  const U=(rol,permisos)=>({rol,permisos});
  ok(PC.puedeVer(U('Administrador','todos'))&&PC.puedeVer(U('Administrador',[]))&&PC.puedeRevisar(U('Administrador','todos')),'el Administrador ve y revisa');
  ok(PC.puedeVer(U('Asistente de Producción',[]))&&PC.puedeRevisar(U('Asistente de Producción',[])),'por defecto el Asistente de Producción ve y revisa');
  ok(PC.puedeVer(U('Jefe de Operaciones',[]))&&!PC.puedeRevisar(U('Jefe de Operaciones',[])),'el Jefe de Operaciones ve pero no revisa (solo consulta)');
  ok(!PC.puedeVer(U('Supervisor',[]))&&PC.puedeVer(U('Supervisor',['calidadVer']))&&!PC.puedeRevisar(U('Supervisor',['calidadVer']))&&PC.puedeRevisar(U('Supervisor',['calidadVer','calidadRevisar'])),'un Supervisor no ve por defecto; con «calidadVer» ve y con «calidadRevisar» además revisa');
  ok(!PC.puedeVer(U('Asistente de Producción',['-calidadVer']))&&!PC.puedeRevisar(U('Asistente de Producción',['-calidadVer'])),'«-calidadVer» quita el acceso por defecto');
  ok(PC.puedeVer(U('Asistente de Producción',[]))&&!PC.puedeRevisar(U('Asistente de Producción',['-calidadRevisar'])),'«-calidadRevisar» le quita solo la revisión');
  ok(!PC.puedeVer(U('mantenimiento_compartido',['calidadVer']))&&!PC.puedeVer(null),'la cuenta compartida de Mantenimiento y sin sesión nunca ven');
  ok(!PC.puedeRevisar(U('Asistente de Producción',[]),true)&&!PC.puedeRevisar(U('Administrador','todos'),true),'en modo «Visualizar» nadie revisa');
  ok(PC.puedeVer(U('Supervisor',['calidadVer']),true)&&!PC.puedeVer(U('Asistente de Producción',[]),true),'en modo «Visualizar» solo vale el permiso marcado: el acceso por rol por defecto no se concede');
  const e02=leer('js/nucleo/02-estado.js'),p98=leer('js/calidad/98-calidad-permisos.js');
  ok(/area:'calidad',label:'VER Calidad/.test(p98)&&/area:'calidad',label:'REVISAR Calidad/.test(p98)&&/clave:'calidad',titulo:'Calidad'/.test(p98)&&/const AREAS_PERMISOS=/.test(e02),'Gestión de usuarios: área «Calidad» con los permisos «VER» y «REVISAR»');
  const sql55=leer('supabase/migraciones/glacial_55_permisos_calidad.sql');
  ok(/cap_cal_ver/.test(sql55)&&/'cal_ver'/.test(sql55)&&/'cal_esc'/.test(sql55)&&/'calidadRevisar'/.test(sql55)&&/'calidadVer'/.test(sql55),'glacial_55: marcas cal_ver / cal_esc en ctx con los permisos calidadVer y calidadRevisar');
  ok(/cuenta <> 1 then raise exception/.test(sql55)&&/position\('cal_ver' in def\) = 0/.test(sql55),'glacial_55: ancla de texto verificada (se detiene si no aparece una sola vez) y repetible');
  const lis=sql55.split('validaciones_lotes_listar(p_desde')[1].split('$f$')[1],rev=sql55.split('validaciones_lotes_revisar(p_clave')[1].split('$f$')[1];
  ok(/'cal_ver'/.test(lis)&&!/ii_ver/.test(lis)&&/'cal_esc'/.test(rev)&&!/ii_esc/.test(rev),'glacial_55: listar exige cal_ver y revisar exige cal_esc (ya no los del Inventario)');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
