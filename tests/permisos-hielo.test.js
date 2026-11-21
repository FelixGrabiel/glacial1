/* Permisos de Hielo (js/nucleo/02b-permisos-hielo.js): Administrador todo; los demás por permiso dado, quitado o valor de su rol. node tests/permisos-hielo.test.js */
'use strict';
const P=require('../js/nucleo/02b-permisos-hielo.js');
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)process.exitCode=1;};
const U=(rol,permisos)=>({rol,permisos:permisos||[]});
ok(P.CLAVES.length===7&&P.CLAVES.every(k=>P.permitido(U('Administrador'),k)),'el Administrador tiene los 7 permisos de Hielo');
ok(P.CLAVES.every(k=>P.permitido(U('Operador','todos'.length?'todos':[]),k)),'quien tiene «todos los permisos» también los tiene todos');
const sup=U('Supervisor');
ok(P.permitido(sup,'hielo')&&P.permitido(sup,'hieloCerrar')&&P.permitido(sup,'hieloVer')&&P.permitido(sup,'hieloExportar')&&!P.permitido(sup,'hieloReabrir')&&!P.permitido(sup,'programarHielo')&&!P.permitido(sup,'configurarHielo'),'Supervisor: lo de siempre (registra, cierra, ve y descarga; no reabre, programa ni configura)');
const jefe=U('Jefe de Producción');
ok(P.permitido(jefe,'hielo')&&P.permitido(jefe,'programarHielo')&&P.permitido(jefe,'configurarHielo')&&!P.permitido(jefe,'hieloReabrir'),'Jefe de Producción: registra, programa y configura, como antes');
ok(P.permitido(U('Planificación'),'programarHielo')&&!P.permitido(U('Planificación'),'hielo')&&P.permitido(U('Gerente'),'configurarHielo')&&!P.permitido(U('Gerente'),'hielo'),'Planificación programa; Gerente configura; ninguno registra');
const op=U('Operador');
ok(P.permitido(op,'hieloVer')&&!P.permitido(op,'hielo')&&!P.permitido(op,'hieloCerrar'),'un rol sin permisos de Hielo solo ve (como antes)');
ok(P.permitido(U('Operador',['hielo']),'hielo')&&P.permitido(U('Operador',['hielo']),'hieloCerrar')&&!P.permitido(U('Operador',['hieloCerrar']),'hielo'),'dar «registrar» a alguien también le deja cerrar; «cerrar» solo no lo deja registrar');
ok(!P.permitido(U('Supervisor',['-hielo']),'hielo')&&!P.permitido(U('Supervisor',['-hielo']),'hieloCerrar')&&P.permitido(U('Supervisor',['-hieloCerrar']),'hielo')&&!P.permitido(U('Supervisor',['-hieloCerrar']),'hieloCerrar'),'se puede quitar registrar (y con eso cerrar) o solo cerrar');
ok(P.permitido(U('Supervisor',['hieloReabrir']),'hieloReabrir')&&!P.permitido(U('Supervisor',['-hieloVer']),'hieloVer'),'dar «reabrir» y quitar «ver» a un rol por defecto');
ok(P.CLAVES.every(k=>!P.permitido(U('mantenimiento_compartido',['hielo','hieloVer']),k))&&!P.permitido(null,'hielo')&&!P.permitido(sup,'inexistente'),'la cuenta compartida de Mantenimiento, sin usuario o una clave desconocida: no');
/* aplicar: de las casillas a lo que se guarda */
const set=a=>JSON.stringify(a.slice().sort());
ok(set(P.aplicar('Supervisor',['hielo','hieloCerrar','hieloVer','hieloExportar','produccionActual']))===set(['hielo','hieloVer','hieloExportar','produccionActual']),'Supervisor con todo lo suyo marcado: se guarda lo marcado (Cerrar queda implícito) y el resto de permisos queda igual');
ok(set(P.aplicar('Supervisor',['hieloVer','hieloExportar']))===set(['hieloVer','hieloExportar','-hielo']),'Supervisor sin «registrar» (y por eso sin «cerrar»): se guarda -hielo');
ok(set(P.aplicar('Supervisor',['hielo','hieloVer','hieloExportar']))===set(['hielo','hieloVer','hieloExportar','-hieloCerrar']),'Supervisor que registra pero no cierra: -hieloCerrar');
ok(set(P.aplicar('Operador',['hieloVer','hieloExportar','hielo','hieloCerrar','hieloReabrir']))===set(['hieloVer','hieloExportar','hielo','hieloReabrir']),'Operador al que se le da registrar, cerrar y reabrir: se guardan registrar y reabrir (cerrar queda implícito)');
ok(set(P.aplicar('Operador',['hieloVer','hieloExportar','hielo']))===set(['hieloVer','hieloExportar','hielo','-hieloCerrar']),'Operador que registra pero con «cerrar» desmarcado: se guarda -hieloCerrar');
ok(set(P.aplicar('Operador',[]))===set(['-hieloVer','-hieloExportar']),'Operador sin nada marcado: se le quita ver y descargar (valores por defecto de todos los roles)');
ok(set(P.aplicar('Operador',['hieloVer','hieloExportar','hieloCerrar']))===set(['hieloVer','hieloExportar','hieloCerrar']),'«cerrar» marcado sin «registrar»: se guarda explícito');
ok(set(P.aplicar('Supervisor',['hielo','-programarHielo','-hielo','x']))===set(['x','hielo','-hieloCerrar','-hieloVer','-hieloExportar']),'las marcas «-» de Hielo que vengan en la lista se recalculan (no se arrastran) y el resto (x) se conserva');
/* idempotencia: guardar y volver a abrir muestra exactamente lo marcado */
const casos=[['Supervisor',['hielo','hieloCerrar','hieloVer']],['Supervisor',['hieloVer']],['Operador',['hielo','hieloCerrar','hieloVer','hieloExportar','hieloReabrir']],['Operador',['hielo','hieloVer']],['Jefe de Producción',['hielo','hieloCerrar','programarHielo','hieloVer']],['Gerente',['configurarHielo','hieloVer','hieloExportar']],['Operador',[]]];
ok(casos.every(([rol,marc])=>{const u={rol,permisos:P.aplicar(rol,marc)};return set(P.efectivas(u))===set(marc);}),'guardar y volver a abrir: se ve exactamente lo marcado (idempotente, 7 casos)');
/* El catálogo de permisos de la pantalla de usuarios (02-estado.js) trae las mismas 7 claves y etiquetas, en el área Hielo. */
const fs=require('fs'),est=fs.readFileSync(require('path').resolve(__dirname,'..','js/nucleo/02-estado.js'),'utf8');
ok(P.CLAVES.every(k=>new RegExp("\\{key:'"+k+"',area:'hielo',label:'"+P.PERMISOS[k].etiqueta.replace(/[()]/g,'\\$&')+"'\\}").test(est)),'el catálogo de Usuarios (02-estado.js) tiene los 7 permisos de Hielo con la misma etiqueta');
ok((est.match(/area:'hielo'/g)||[]).length===7,'y no tiene otros permisos de Hielo');
/* Panel de Administración (110-admin-nucleo.js): la ficha muestra lo que puede hacer y al guardar convierte en «permiso» / «-permiso». */
const AD=require('../js/admin/110-admin-nucleo.js');
const claves=['hieloVer','hielo','hieloCerrar','hieloReabrir','programarHielo','configurarHielo','hieloExportar','produccionActual','planificacion'];
const sup2={username:'s1',nombre:'Sup',rol:'Supervisor',linea:'',permisos:['produccionActual']};
const b0=AD.borradorDe(sup2,claves);
ok(['hieloVer','hielo','hieloCerrar','hieloExportar','produccionActual'].every(k=>b0.permisos.includes(k))&&!b0.permisos.includes('hieloReabrir'),'ficha de un Supervisor sin permisos propios de Hielo: se muestran los que su rol trae');
ok(AD.diffUsuario(sup2,b0,claves).length===0,'mostrar los valores de su rol no cuenta como un cambio');
const b1=Object.assign({},b0,{permisos:b0.permisos.filter(k=>k!=='hielo'&&k!=='hieloCerrar')});
const u1=AD.aplicarBorrador(sup2,b1,[]);
ok(u1.permisos.includes('-hielo')&&!u1.permisos.includes('hielo')&&u1.permisos.includes('produccionActual'),'el Administrador le quita «registrar»: se guarda -hielo y se conserva el resto');
ok(AD.permisosConHielo(u1,claves).includes('hieloVer')&&!AD.permisosConHielo(u1,claves).includes('hielo')&&!AD.permisosConHielo(u1,claves).includes('hieloCerrar'),'al volver a abrir la ficha ya no marca registrar ni cerrar');
const b2=Object.assign({},b0,{permisos:[...b0.permisos,'hieloReabrir']});
ok(AD.aplicarBorrador(sup2,b2,[]).permisos.includes('hieloReabrir'),'le da «reabrir»: se guarda hieloReabrir');
ok(AD.plantillaConHielo('Supervisor',['produccionActual']).includes('hielo')&&AD.plantillaConHielo('Operador',['produccionActual']).includes('hieloVer')&&!AD.plantillaConHielo('Operador',['produccionActual']).includes('hielo')&&AD.plantillaConHielo('Administrador','todos')==='todos','plantilla de rol con los valores efectivos de Hielo');
