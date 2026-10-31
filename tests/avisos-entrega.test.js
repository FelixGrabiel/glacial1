/* Aviso «Falta entregar el turno»: núcleo puro (45-indicadores.js › entregasPendientes) y conexión al Centro de alertas (46-proyeccion-avisos.js). */
'use strict';
const fs=require('fs'),path=require('path');
const I=require('../js/nucleo/45-indicadores.js');
const raiz=path.join(__dirname,'..'),leer=r=>fs.readFileSync(path.join(raiz,r),'utf8');
let fallas=0;
const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const L=(y,m,d,h,mi)=>new Date(y,m-1,d,h,mi||0).getTime();
const cuadro=(o={})=>Object.assign({marca:'Scala',produccion:{efectiva:1000,sopladas:1050}},o);
const rep=(o={})=>Object.assign({id:'r1',linea:'PET1',fecha:'2026-10-28',turno:'DÍA',cuadros:[cuadro()]},o);

/* Bloque Día + Intermedio 07:00–19:00; gracia de 60 min: el aviso empieza a las 20:00. */
ok(I.entregasPendientes([rep()],[],L(2026,10,28,19,59)).length===0&&I.entregasPendientes([rep()],[],L(2026,10,28,20,0)).length===1,'avisa 60 min después de terminar el turno, no antes');
const x=I.entregasPendientes([rep()],[],L(2026,10,28,20,0))[0];
ok(x.id==='2026-10-28_DIA'&&x.turno==='DIA'&&x.atrasoMin===60&&x.nivel==='ambar','datos del aviso: id de la entrega, turno y atraso');
ok(I.entregasPendientes([rep()],[],L(2026,10,29,7,30))[0].nivel==='roja','desde 12 h de atraso el aviso es rojo');
ok(I.entregasPendientes([rep()],['2026-10-28_DIA'],L(2026,10,29,9,0)).length===0,'con la entrega hecha (mismo id) no avisa');
ok(I.entregasPendientes([rep(),rep({id:'r2',linea:'PET2'})],[],L(2026,10,28,21,0)).length===1,'una entrega por fecha y turno, no una por línea');
ok(I.entregasPendientes([rep({turno:'NOCHE'})],[],L(2026,10,29,7,59)).length===0&&I.entregasPendientes([rep({turno:'NOCHE'})],[],L(2026,10,29,8,0))[0].id==='2026-10-28_NOCHE','la Noche termina a las 07:00 del día siguiente; su id usa la fecha en que empezó');
ok(I.entregasPendientes([rep({cuadros:[cuadro({produccion:{efectiva:0,sopladas:0}})]}),rep({id:'b',cuadros:[cuadro({marca:''})]})],[],L(2026,10,29,12,0)).length===0,'sin producción registrada o sin marca no hay nada que entregar');
ok(I.entregasPendientes([rep({fecha:'2026-10-20'})],[],L(2026,10,30,12,0)).length===0,'con más de 3 días de atraso ya no avisa (historia)');
ok(I.entregasPendientes([rep()],[],NaN).length===0&&I.entregasPendientes(undefined,undefined,L(2026,10,30,12,0)).length===0,'hora inválida o sin datos: lista vacía');
ok(I.entregasPendientes([rep()],[],L(2026,10,29,12,0),null,{desde:'2026-10-29'}).length===0&&I.entregasPendientes([rep({fecha:'2026-10-29'})],[],L(2026,10,30,12,0),null,{desde:'2026-10-29'}).length===1,'fecha de inicio: los turnos anteriores a ella no avisan, los posteriores sí');
const t=I.textoEntregaPendiente(x),m=I.mensajeEntregasPendientes([x]);
ok(/Falta entregar el turno DÍA 28\/10/.test(t)&&/FALTA ENTREGAR EL TURNO/.test(m)&&I.mensajeEntregasPendientes([])==='','mensaje listo para WhatsApp (vacío si no hay pendientes)');

const s46=leer('js/produccion/46-proyeccion-avisos.js'),html=leer('index.html');
ok(/const TODOS=\[[^\]]*'entrega'[^\]]*\]/.test(s46)&&/entregaGraciaMin:60,entregaDiasMax:3/.test(s46),'tipo «entrega» para supervisores, Jefatura y Administrador; umbrales por defecto (60 min, 3 días)');
ok(/const ENTREGA_DESDE='2026-10-31'/.test(s46)&&/desde:cfg\.entregaDesde/.test(s46),'el aviso empieza el 31/10/2026 (se puede cambiar con entregaDesde en sync/configAlertas)');
ok(/\['entregaGraciaMin'/.test(s46)&&/\['entregaDiasMax'/.test(s46),'los umbrales se editan en la pantalla de umbrales');
ok(/function pendientesEntrega/.test(s46)&&/,pendientesEntrega\}/.test(s46)&&/est\.listo/.test(s46),'el bot dispone de glacialAvisos.pendientesEntrega(); no avisa mientras la lista de entregas no ha cargado');
ok(/x\.tipo==='entrega'\)\{if\(typeof window\.goEntregaTurno/.test(s46),'tocar el aviso abre «Entrega de turno»');
ok(/45-indicadores\.js\?v=20261030-en2/.test(html)&&/46-proyeccion-avisos\.js\?v=20261030-en2/.test(html),'index.html: versiones ?v= subidas');
console.log(fallas?'\n'+fallas+' fallas':'\nAviso de entrega correcto');
