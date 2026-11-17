/* Almacén › cuenta compartida de almaceneros: PIN, rol, migración glacial_57 y conexiones. */
const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const A=require(R+'/js/almacen/102-almaceneros-pin.js'),C=require(R+'/js/almacen/103-almacen-compartido.js');
(async()=>{
  // PIN
  ok(A.pinValido('4827')===''&&A.pinValido('123456').length>0&&A.pinValido('1111').length>0&&A.pinValido('12').length>0&&A.pinValido('12345678').length>0&&A.pinValido('48a7').length>0&&A.pinValido('').length>0,'PIN: 4 a 6 dígitos, sin los fáciles de adivinar (1234, 1111…)');
  const salt=A.nuevoSalt(),h=await A.derivar('4827',salt);
  ok(await A.verificar({salt,hash:h},'4827')&&!(await A.verificar({salt,hash:h},'4828'))&&!(await A.verificar({},'4827')),'PBKDF2: el PIN correcto verifica, el incorrecto o un almacenero sin PIN no');
  ok((await A.derivar('4827',A.nuevoSalt()))!==h&&A.nuevoSalt()!==A.nuevoSalt()&&!h.includes('4827'),'la sal es distinta para cada persona y el hash no contiene el PIN');
  ok(A.activos([{id:'b',nombre:'Zoila'},{id:'a',nombre:'Ana'},{id:'c',nombre:'Luis',activo:false},null]).map(x=>x.nombre).join()==='Ana,Zoila','solo se ofrecen los almaceneros activos, en orden');
  const t0=1_000_000_000_000;
  ok(A.sesionVigente({id:'a',inicio:t0,ultimo:t0},t0+10*60000)&&!A.sesionVigente({id:'a',inicio:t0,ultimo:t0},t0+31*60000)&&!A.sesionVigente({id:'a',inicio:t0,ultimo:t0+11*3600000},t0+12.5*3600000)&&!A.sesionVigente(null,t0),'la identificación vence a los 30 min sin uso y a las 12 h');
  ok(A.estadoBloqueo({hasta:t0+5*60000},t0).bloqueado&&A.estadoBloqueo({hasta:t0+5*60000},t0).minutos===5&&!A.estadoBloqueo({hasta:t0-1},t0).bloqueado&&!A.estadoBloqueo(null,t0).bloqueado,'el bloqueo por intentos fallidos se cuenta en minutos');
  ok(A.CFG.maxIntentos===5&&A.CFG.bloqueoMin===10,'5 intentos y 10 minutos de bloqueo (igual que Mantenimiento)');
  // rol
  ok(C.ROL==='almacen_compartido'&&C.esCompartido({rol:'almacen_compartido'})&&!C.esCompartido({rol:'mantenimiento_compartido'})&&!C.esCompartido({rol:'Administrador'})&&!C.esCompartido(null),'el rol se reconoce solo en la cuenta compartida de Almacén');
  ok(C.permisosEfectivos({permisos:['gestionarPersonal','administracion','hielo','-hielo']}).join()==='moduloAlmacen,hielo'||C.permisosEfectivos({permisos:['gestionarPersonal','administracion','hielo']}).join()==='moduloAlmacen,hielo','permisos del rol: moduloAlmacen fijo, nunca gestionarPersonal ni administracion');
  ok(C.permisosEfectivos({}).join()==='moduloAlmacen','sin extras: solo moduloAlmacen');
  // migración glacial_57
  const sql=leer('supabase/migraciones/glacial_57_almacen_cuenta_compartida.sql');
  ok(/'alm_comp', coalesce\(aut and rol = 'almacen_compartido', false\)/.test(sql),'glacial_57: la marca alm_comp sale del rol almacen_compartido');
  const lee=sql.split("lectura mínima")[1].split('$g$')[0];
  ok(/d in \('accesos', 'paletas', 'users', 'workers'\)/.test(lee)&&/c in \('almacenPtRecepcion', 'almaceneros'\)/.test(lee)&&/relojServidor/.test(lee)&&!/'records'|'tareos'|'programaciones'/.test(lee),'glacial_57: la cuenta compartida solo lee paletas, accesos, usuarios, trabajadores, recepciones, almaceneros y su reloj');
  const esc=sql.split('acceso mínimo')[1].split('$g$')[0];
  ok(/accion = 'create' and glacial_fs\.pt_recepcion_valida/.test(esc)&&/array\['salt', 'hash', 'pinCreadoEn', 'pinActualizadoEn', 'ultimoAcceso'\]/.test(esc)&&/return false;\s*end if;/.test(esc),'glacial_57: solo crea recepciones válidas y cambia los campos del PIN; todo lo demás es falso');
  ok(/ap_alm[\s\S]{0,80}accion in \('create', 'update'\)/.test(sql)&&/between 2 and 80/.test(sql)&&!/accion = 'delete'/.test(sql.split("c = 'almaceneros' then                                            -- glacial_57")[1]||''),'glacial_57: quienes tienen el permiso de Almacén administran la lista (crear y editar; no se borra)');
  ok((sql.match(/cuenta <> 1 then raise exception/g)||[]).length>=5&&/falta glacial_56/.test(sql)&&/position\('alm_comp' in def\) = 0/.test(sql),'glacial_57: anclas verificadas (se detiene si no hay una sola), exige glacial_56 y es repetible');
  // conexiones
  const idx=leer('index.html'),us=leer('js/accesos/10-usuarios.js')+leer('js/nucleo/02-estado.js'),vc=leer('js/accesos/39-vista-como.js'),pt=leer('js/almacen/101-producto-terminado.js'),comp=leer('js/almacen/103-almacen-compartido.js');
  ok(idx.indexOf('101-producto-terminado.js')<idx.indexOf('102-almaceneros-pin.js')&&idx.indexOf('102-almaceneros-pin.js')<idx.indexOf('103-almacen-compartido.js'),'index: orden de carga (producto terminado → almaceneros → cuenta compartida)');
  ok(/<option value="almacen_compartido">Almacén · cuenta compartida/.test(us)&&/'almacen_compartido': \['moduloAlmacen'\]/.test(us)&&/rol:'almacen_compartido'/.test(vc),'Gestión de usuarios: se puede crear la cuenta compartida de Almacén (con su permiso) y «Ver como» la incluye');
  ok(/almacenero:p\?\{id:p\.id,nombre:p\.nombre\}:null/.test(pt)&&/puede\(\)&&!vistaActiva\(\)&&\(!compartida\(\)\|\|!!persona\(\)\)/.test(pt),'la recepción guarda qué almacenero la hizo y la cuenta compartida no recibe sin identificarse');
  ok(/state\.currentTab='almacen-pt'/.test(comp)&&/enterApp=function/.test(comp)&&/b\.id!=='btn-almacen-pt'/.test(comp)&&/sidebar-group-almacen/.test(comp),'la cuenta compartida entra directo a Producto terminado y su menú solo tiene ese acceso');
  console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
