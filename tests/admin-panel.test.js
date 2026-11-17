/* Panel de Administración · etapa 1: reglas puras, acceso, auditoría consolidada, migración glacial_59 y conexiones. node tests/admin-panel.test.js */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const N=require(R+'/js/admin/110-admin-nucleo.js');

// ---- acceso ----
ok(N.puedeAcceder({rol:'Administrador'},false)===true,'el Administrador entra');
ok(N.puedeAcceder({rol:'Administrador',__vista:true},false)===false&&N.puedeAcceder({rol:'Administrador'},true)===false,'un Administrador en «Ver como» no entra');
['Supervisor','mantenimiento_compartido','almacen_compartido','Gerente General','Gerente','Jefatura','Jefe de Producción','Jefe de Operaciones','RRHH','Planificación',''].forEach(r=>ok(N.puedeAcceder({rol:r,permisos:'todos'},false)===false,'«'+(r||'sin rol')+'» no entra aunque tenga todos los permisos'));
ok(N.puedeAcceder(null,false)===false&&N.puedeAcceder(undefined,false)===false,'sin sesión no entra');

// ---- secciones ----
ok(N.SECCIONES.length===17&&N.GRUPOS.join()==='General,Personas,Operación,Datos,Control','17 secciones en 5 grupos');
ok(new Set(N.SECCIONES.map(s=>s.id)).size===17&&N.SECCIONES.every(s=>N.GRUPOS.includes(s.grupo)),'ids únicos y cada sección pertenece a un grupo');
ok(N.SECCIONES.filter(s=>s.etapa===1).map(s=>s.id).join()==='resumen,usuarios,roles,auditoria','etapa 1: Resumen, Usuarios, Roles y permisos y Auditoría');
ok(N.SECCIONES.filter(s=>s.etapa===2).map(s=>s.id).join()==='maestros,metas,consumos'&&N.SECCIONES.filter(s=>s.etapa===3).length===6&&N.SECCIONES.filter(s=>s.etapa===4).length===4,'etapas 2, 3 y 4 como en el plan');

// ---- motivo ----
ok(N.validarMotivo('corto').length===1&&N.validarMotivo('   123456789   ').length===1&&N.validarMotivo('Cambio de turno')[0]===undefined&&N.validarMotivo(null).length===1,'motivo obligatorio de al menos 10 caracteres (sin contar espacios de los lados)');

// ---- auditoría consolidada ----
ok(N.msDe({toMillis:()=>5000})===5000&&N.msDe(1700000000)===1700000000000&&N.msDe(1700000000000)===1700000000000&&N.msDe({seconds:10,nanoseconds:5e6})===10005&&N.msDe('2026-11-17T10:00:00Z')===Date.parse('2026-11-17T10:00:00Z')&&N.msDe(null)===0,'fechas de cualquier auditoría → milisegundos');
const t=N.normalizarAuditoria('auditoriaTareos',{timestamp:1700000003000,usuarioNombre:'RRHH Ana',accion:'EDITAR_TAREO_BLOQUEADO',trabajador:'Luis',fechaTareo:'2026-11-16',area:'Producción',estadoAnterior:{a:1},estadoNuevo:{a:2},motivoCorreccion:'corrige hora'},'t1');
ok(t.ms===1700000003000&&t.quien==='RRHH Ana'&&t.modulo==='Tareo · Producción'&&/editar tareo bloqueado/.test(t.accion)&&t.motivo==='corrige hora'&&t.antes==='{"a":1}','auditoriaTareos se adapta (quién, módulo, acción, antes, después, motivo)');
const a=N.normalizarAuditoria('apAuditoria',{en:1700000002000,usuario:'Rosa',operacion:'crear',coleccion:'apFactores',docId:'f1',despues:{factor:1}},'a1');
ok(a.modulo==='Asistente de Producción'&&a.accion==='crear · apFactores · f1'&&a.quien==='Rosa','apAuditoria se adapta');
const i=N.normalizarAuditoria('insumosAuditoria',{enMs:1700000001000,usuario:'Rosa',tipo:'CONTEO',articulo:'Preforma',antes:1,despues:2},'i1');
ok(i.modulo==='Inventario de insumos'&&i.ms===1700000001000&&/conteo · Preforma/.test(i.accion),'insumosAuditoria se adapta');
const r=N.normalizarAuditoria('auditoriaRegistros',{timestamp:1700000004000,usuario:'Pedro',accion:'ELIMINAR',linea:'PET1',fecha:'2026-11-16',turno:'DÍA',motivo:'duplicado',estadoRegistro:'FINALIZADO'},'r1');
ok(r.modulo==='Registros de producción'&&/eliminar reporte PET1/.test(r.accion)&&r.motivo==='duplicado'&&/Eliminado/.test(r.despues),'auditoriaRegistros se adapta');
const p=N.normalizarAuditoria('adminAuditoria',{guardadoEn:1700000005000,usuarioNombre:'Félix',modulo:'Usuarios',accion:'Editó a Pedro',antes:{rol:'Supervisor'},despues:{rol:'Calidad'},motivo:'cambio de puesto'},'ADM_1');
ok(p.modulo==='Usuarios'&&p.quien==='Félix'&&p.motivo==='cambio de puesto'&&p.antes==='{"rol":"Supervisor"}','adminAuditoria (la del panel) se adapta');
const todo=N.consolidar({auditoriaTareos:[{id:'t1',data:{timestamp:1700000003000}}],apAuditoria:[{id:'a1',data:{en:1700000002000}}],adminAuditoria:[{id:'x',data:{guardadoEn:1700000005000,modulo:'Usuarios',accion:'Editó',motivo:'x'.repeat(10)}}],insumosAuditoria:[],auditoriaRegistros:[{id:'r1',data:{timestamp:1700000004000}}]});
ok(todo.map(x=>x.ms-1700000000000).join()==='5000,4000,3000,2000','consolidar ordena de la más reciente a la más antigua mezclando todas las fuentes');
ok(N.consolidar({apAuditoria:[{id:'a1',data:{en:1700000000001}},{id:'a2',data:{en:1700000000002}}]},1).length===1,'consolidar respeta el límite');
const filas=[{modulo:'Tareo',quien:'Ana',accion:'editar',motivo:'hora',antes:'',despues:''},{modulo:'Usuarios',quien:'Félix',accion:'Editó a Pedro',motivo:'cambio',antes:'',despues:''}];
ok(N.filtrarAuditoria(filas,{modulo:'Tareo'}).length===1&&N.filtrarAuditoria(filas,{quien:'Félix'}).length===1&&N.filtrarAuditoria(filas,{texto:'pedro'}).length===1&&N.filtrarAuditoria(filas,{modulo:'Todos',quien:'Todos'}).length===2,'filtros por módulo, persona y texto');
ok(N.modulosDe(filas).join()==='Tareo,Usuarios'&&N.quienesDe(filas).join()==='Ana,Félix','listas de módulos y personas para los filtros');

// ---- usuarios y permisos en borrador ----
const claves=['nuevo','historial','paletas','planificacion','graficos'];
const u0={username:'pedro',nombre:'Pedro',rol:'Supervisor',linea:'PET1',permisos:['nuevo','paletas','otro-que-ya-no-existe'],password:'x'};
ok(N.permisosDe(u0,claves).join()==='nuevo,paletas'&&N.permisosDe({permisos:'todos'},claves).length===5&&N.resumenPermisos(u0,claves)==='2 permisos'&&N.resumenPermisos({permisos:'todos'},claves)==='Todos los permisos','permisos de un usuario (ignora claves que ya no existen)');
let b=N.borradorDe(u0,claves);
ok(N.diffUsuario(u0,b,claves).length===0,'un borrador sin tocar no tiene diferencias');
b.permisos=[...b.permisos,'graficos'];b.rol='Planificación';
const d=N.diffUsuario(u0,b,claves,k=>k.toUpperCase());
ok(d.length===2&&d[0].campo==='rol'&&d[1].campo==='permisos'&&d[1].agregados.join()==='GRAFICOS'&&d[1].quitados.length===0,'diferencias: rol y permisos (qué se agrega y qué se quita)');
const n=N.aplicarBorrador(u0,b,['Planificación']);
ok(n.rol==='Planificación'&&n.permisos.includes('graficos')&&n.password==='x'&&n.permisosGestionVersion===1&&n.permisos.includes('-planificacion'),'aplicar el borrador conserva el resto de la ficha; un rol con Planificación por defecto sin marcarla guarda «-planificacion»');
ok(N.aplicarBorrador(u0,Object.assign({},b,{permisos:N.TODOS}),[]).permisos==='todos','«todos los permisos» se guarda como «todos»');
ok(N.esAdminPrincipal({username:'admin',rol:'Supervisor'})&&N.esAdminPrincipal({username:'x',rol:'Administrador'})&&!N.esAdminPrincipal({username:'pedro',rol:'Supervisor'}),'los administradores no se tocan desde el panel');
const k=N.kpisResumen({usuarios:[1,2,3],trabajadores:[{activo:true},{activo:false},{}],registros:[{estadoRegistro:'EN_REGISTRO'},{estadoRegistro:'FINALIZADO'},{}],auditoria:[{ms:100},{ms:5}],inicioHoyMs:50});
ok(k.usuarios===3&&k.trabajadores===2&&k.registrosEnCurso===1&&k.cambiosHoy===1,'KPI del Resumen: usuarios, trabajadores activos, registros en curso y cambios de hoy');

// ---- migración glacial_59 ----
const sql=leer('supabase/migraciones/glacial_59_panel_administracion.sql');
ok(/'adm_panel', coalesce\(aut and not v_mant and not v_solo and v_admin, false\)/.test(sql),'glacial_59: marca adm_panel = Administrador, no Mantenimiento, no solo vista');
ok(/accion = 'create' and coalesce\(\(k->>'adm_panel'\)::boolean, false\) and glacial_fs\.adm_auditoria_valida\(n, d, u, ahora\)/.test(sql)&&/n->'guardadoEn' = ahora/.test(sql)&&/n->>'uid' = u/.test(sql)&&/>= 10/.test(sql),'glacial_59: adminAuditoria es un libro que solo crea el Administrador, con hora del servidor y motivo de 10 caracteres');
ok(/''adminAuditoria'' then return coalesce\(\(k->>''adm_panel''\)::boolean, false\)/.test(sql)&&(sql.match(/cuenta <> 1 then raise exception/g)||[]).length>=3,'glacial_59: solo el Administrador la lee y las anclas se verifican (se detiene sin cambiar nada)');

// ---- conexiones ----
const idx=leer('index.html'),sb=leer('js/nucleo/04-sidebar.js'),acc=leer('js/admin/111-admin-acceso-datos.js'),pan=leer('js/admin/112-admin-pantalla.js');
ok(!/btn-admin-panel|Panel de Administración|goAdminPanel/.test(idx),'index.html NO trae la entrada del menú: se crea solo para el Administrador');
ok(/110-admin-nucleo\.js/.test(idx)&&idx.indexOf('110-admin-nucleo.js')<idx.indexOf('111-admin-acceso-datos.js')&&idx.indexOf('111-admin-acceso-datos.js')<idx.indexOf('112-admin-pantalla.js')&&idx.indexOf('112-admin-pantalla.js')<idx.indexOf('12-init.js'),'los tres archivos del panel se cargan en orden y antes del arranque');
ok(/state\.currentTab==='admin-panel'\)return 'configuracion'/.test(sb),'el grupo Configuración se abre solo con el panel');
ok(/esAdministradorSeguridad/.test(acc)&&/N\.puedeAcceder\(state\.user,vistaActiva\(\)\)/.test(acc)&&/__vistaComo/.test(acc),'el acceso reutiliza esAdministradorSeguridad y excluye «Ver como»');
ok(/glacialCierresSesion\.push/.test(acc)&&/quitarMenu\(\)/.test(acc),'al cerrar sesión o cambiar de cuenta se cierran las lecturas y se quita la entrada');
ok(!/sync'\)\.doc\('users'\)\.(set|update)/.test(pan+acc)&&/saveUsers\(nuevos\)/.test(acc),'los usuarios se guardan con la función de siempre (saveUsers), no con una copia paralela');
ok(/onSnapshot/.test(acc)&&/orderBy\(campo,'desc'\)\.limit\(LIMITE\)/.test(acc),'la auditoría se lee en vivo (onSnapshot)');
ok(/firma\(actuales\[i\]\)!==JSON\.stringify\(c\.base\)/.test(acc)&&/Esto cambió en otro equipo/.test(acc),'control de conflictos entre equipos');
ok(/PERMISOS_SUGERIDOS_POR_ROL/.test(leer('js/nucleo/02-estado.js'))&&/sugeridos = PERMISOS_SUGERIDOS_POR_ROL/.test(leer('js/accesos/10-usuarios.js')),'las plantillas por rol son una sola (la usan Gestionar usuarios y el panel)');

// ---- etapa 2: tolerancias, roles propios, factores ----
ok(N.validarTolerancias({PET1:{mermaPct:'2,5',desviacionPct:''},B7L:{mermaPct:100}}).length===0,'tolerancias: porcentajes válidos (con coma decimal y vacío = como hoy)');
ok(N.validarTolerancias({PET1:{mermaPct:-1}}).length===1&&N.validarTolerancias({PET1:{desviacionPct:101}}).length===1&&N.validarTolerancias({PET1:{mermaPct:'abc'}}).length===1,'tolerancias: fuera de 0–100 o no numéricas se rechazan');
const nt=N.normalizarTolerancias({PET1:{mermaPct:'2,5',desviacionPct:'',validarMermaAntes:true},PET2:{mermaPct:'',desviacionPct:'',validarMermaAntes:true},B7L:{mermaPct:'',desviacionPct:'3',validarMermaAntes:false}});
ok(nt.PET1.mermaPct===2.5&&nt.PET1.desviacionPct===null&&!nt.PET2&&nt.B7L.desviacionPct===3&&nt.B7L.validarMermaAntes===false,'solo se guardan las líneas con valor (las demás siguen como hoy)');
ok(N.variacionPct(10,12)===20&&N.variacionPct(10,8)===-20&&N.variacionPct(0,0)===0&&N.variacionPct(0,5)===null&&N.esCambioGrande(20)&&N.esCambioGrande(-25.5)&&!N.esCambioGrande(19.9)&&!N.esCambioGrande(null),'cambio porcentual y alerta roja desde 20 %');
ok(N.validarRolNuevo('Calidad',['Supervisor']).length===0&&N.validarRolNuevo('calidad',['Calidad']).length===1&&N.validarRolNuevo('x',[]).length===1&&N.validarRolNuevo('Almacén compartida',[]).length===1&&N.validarRolNuevo('Administrador',['Administrador']).length>=1,'rol nuevo: nombre válido, único y sin pisar al sistema');
ok(N.limpiarPlantilla(['a','b','z','a'],['a','b']).join()==='a,b','plantilla: solo permisos que existen, sin repetir');
const nf=(fs,q)=>{const c=fs.filter(f=>f.insumo===q.insumo&&f.linea===q.linea);return c.length?{factor:c[0]}:{error:'SIN_FACTOR'};};
const pend=N.combosSinFactor([{linea:'PET1',fecha:'2026-11-10',cuadros:[{marca:'Scala',presentacion:'2.5 L'},{marca:'Aro',presentacion:'340 ml'}]},{linea:'B7L',fecha:'2026-01-01',marca:'X',presentacion:'7 L'}],[{codigo:'TAPA',nombre:'Tapa',activo:true},{codigo:'ETI',nombre:'Etiqueta',activo:true}],[{insumo:'TAPA',linea:'PET1'}],'2026-11-17',nf,'2026-10-18');
ok(pend.length===2&&pend[0].faltan.map(i=>i.codigo).join()==='ETI'&&pend.every(p=>p.linea==='PET1'),'pendientes: lo producido sin factor (y se ignora lo muy antiguo)');
// ---- el Asistente usa las tolerancias; sin valor todo igual ----
require(R+'/js/asistente/70-asistente-nucleo.js');const AN=globalThis.glacialAsistenteNucleo;
const base={saldoInicial:100,saldoFinal:40,entregado:0,devuelto:0,transfEntrada:0,transfSalida:0,teorico:50,mermaValidada:0,mermaRegistro:0};
const sin=AN.conciliar(base);
ok(sin.real===60&&sin.porRevisar===10&&sin.dentroDeTolerancia===false&&sin.mermaExcede===false,'sin tolerancias el Asistente se comporta exactamente como hoy (10 por revisar)');
const con=AN.conciliar(Object.assign({},base,{toleranciaDesvPct:25}));
ok(con.porRevisar===0&&con.porRevisarBruto===10&&con.dentroDeTolerancia===true,'con desviación aceptable del 25 % del teórico, 10 sobre 50 (20 %) ya no es «por revisar»');
ok(AN.conciliar(Object.assign({},base,{toleranciaDesvPct:10})).porRevisar===10&&AN.conciliar(Object.assign({},base,{toleranciaDesvPct:''})).porRevisar===10,'si la desviación supera la tolerancia (o no hay valor) sigue por revisar');
ok(AN.conciliar(Object.assign({},base,{mermaValidada:4,mermaAceptablePct:5})).mermaExcede===true&&AN.conciliar(Object.assign({},base,{mermaValidada:2,mermaAceptablePct:5})).mermaExcede===false,'merma aceptable: avisa cuando la merma supera el % del teórico');
const al=AN.alertas({conciliaciones:[{mermaExcede:true,mermaValidada:4,mermaRegistro:0,etiqueta:'PET1 · A',unidad:'UND',porRevisar:0}]});
ok(al.some(a=>a.tipo==='MERMA_ALTA'),'la merma alta genera su alerta');
ok(AN.pendientesDeCierre({mermas:[{estado:'PENDIENTE',linea:'PET1'},{estado:'PENDIENTE',linea:'B7L'}],lineasSinExigirMerma:['B7L']}).mermas===1&&AN.pendientesDeCierre({mermas:[{estado:'PENDIENTE',linea:'B7L'}]}).mermas===1,'una línea sin exigir merma validada no frena el cierre; sin configuración, como hoy');
// ---- migración glacial_60 ----
const s60=leer('supabase/migraciones/glacial_60_admin_config.sql');
ok(/'tolerancias', 'roles', 'anuncio', 'mantenimiento', 'alertas', 'sesion', 'respaldos'/.test(s60)&&/accion in \('create', 'update'\) and coalesce\(\(k->>'adm_panel'\)::boolean, false\) and glacial_fs\.adm_config_valida\(n, d, u, v\)/.test(s60),'glacial_60: adminConfig solo con adm_panel, ids permitidos, sin borrar');
ok(/\(n->>'version'\)::numeric = coalesce\(case when jsonb_typeof\(v->'version'\) = 'number' then \(v->>'version'\)::numeric end, 0\) \+ 1/.test(s60)&&/>= 10/.test(s60)&&/>= 10/.test(s60),'glacial_60: el servidor exige versión anterior + 1 y motivo de 10 caracteres');
ok((s60.match(/cuenta <> 1 then raise exception/g)||[]).length>=2,'glacial_60: anclas verificadas');
// ---- conexiones etapa 2 ----
const e2=leer('js/admin/114-admin-etapa2.js'),cfg=leer('js/admin/113-admin-config.js');
ok(idx.indexOf('111-admin-acceso-datos.js')<idx.indexOf('113-admin-config.js')&&idx.indexOf('113-admin-config.js')<idx.indexOf('112-admin-pantalla.js')&&idx.indexOf('112-admin-pantalla.js')<idx.indexOf('114-admin-etapa2.js')&&idx.indexOf('114-admin-etapa2.js')<idx.indexOf('12-init.js'),'orden de carga: 110 · 111 · 113 · 112 · 114, antes del arranque');
ok(/guardarFactor\(n,f\.id\)/.test(e2)&&/guardarParametrosMerma\(/.test(e2)&&/guardarCambio\(/.test(e2),'consumos, causas y conversiones se guardan con las funciones del Asistente (no hay copias paralelas)');
ok(!/collection\('apFactores'\)|collection\('apParametros'\)/.test(e2),'el panel no escribe directo en apFactores ni apParametros');
ok(/runTransaction/.test(cfg)&&/CONFLICTO/.test(cfg)&&/Esto cambió en otro equipo/.test(cfg),'adminConfig: control de versión también en el navegador');
ok(/window\.glacialAdminConfig/.test(leer('js/asistente/72-asistente-pantalla.js'))&&/panel:\{grupos/.test(leer('js/asistente/95-conversiones.js')),'el Asistente lee las tolerancias y las conversiones se exponen para el panel');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
