/* Parte 2, commit 7: día operativo y turno vigente con una sola función (hora del servidor, corte 07:00, sin tolerancia). */
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const previo=(f,ref)=>cp.execSync('git show '+ref+':'+f,{cwd:R,maxBuffer:1e8}).toString().replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error(n);let i=src.indexOf('{',m.index),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break;}return src.slice(m.index,j+1);}
const ref=process.env.REF_ANTES||'caca16a';
let ahoraSrv=0;
function ctx(f17,extra){const sb={console,Math,Number,Array,Object,String,Date};vm.createContext(sb);sb.window=sb;
  vm.runInContext(leer('js/nucleo/45-indicadores.js'),sb);
  sb.tareoAhoraServidor=()=>ahoraSrv;
  vm.runInContext('const MT_TOLERANCIA_NOCHE_MIN=20;'+extraer(f17,'_mtFechaConHora')+extraer(f17,'_mtSumarDias')+extraer(f17,'obtenerTurnoActual')+(extra||''),sb);return sb;}
const f17='js/accesos/17-modo-trabajo.js';
let A,N;
try{A=ctx(previo(f17,ref));}catch(e){A=null;}
N=ctx(leer(f17));
const L=(h,m)=>new Date(2026,9,4,h,m,0).getTime();
const turno=(sb,ms)=>{const t=vm.runInContext('obtenerTurnoActual',sb)(new Date(ms));return t.nombre+(t.enTolerancia?' (tolerancia)':'');};
console.log('  [cronómetro · hora → antes / ahora]');
[[3,0],[6,59],[7,0],[7,10],[7,20],[14,59],[15,0],[21,59],[22,0]].forEach(([h,m])=>console.log('   '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+' → '+(A?turno(A,L(h,m)):'?')+' / '+turno(N,L(h,m))));
ok(turno(N,L(7,0))==='Mañana'&&turno(N,L(7,10))==='Mañana','07:00 y 07:10 ya es Mañana (sin tolerancia 07:20)');
ok(turno(N,L(6,59))==='Noche'&&turno(N,L(3,0))==='Noche','antes de las 07:00 sigue la Noche');
ok(turno(N,L(15,0))==='Tarde'&&turno(N,L(22,0))==='Noche','15:00 Tarde, 22:00 Noche');
const t=vm.runInContext('obtenerTurnoActual',N)(new Date(L(3,0)));
ok(t.inicio.getTime()===new Date(2026,9,3,22).getTime()&&t.fin.getTime()===L(7,0),'a las 03:00 la Noche empezó ayer 22:00 y termina hoy 07:00');
/* día operativo */
const G=vm.runInContext('GlacialIndicadores',N);
ok(G.diaOperativo(L(3,0))==='2026-10-03'&&G.diaOperativo(L(7,0))==='2026-10-04'&&G.diaOperativo(L(23,30))==='2026-10-04','día operativo: 03:00 → 3 de octubre; 07:00 y 23:30 → 4 de octubre');
const s=f=>leer(f);
ok(/GlacialIndicadores\.diaOperativo\(/.test(s('js/produccion/16-paletas.js'))&&/GlacialIndicadores\.diaOperativo\(/.test(s('js/produccion/29-avance-produccion.js'))&&/GlacialIndicadores\.diaOperativo\(/.test(s('js/produccion/09-resumen.js')),'Paletas (16), Avance (29) y Resumen (09) usan el día operativo del módulo');
ok(/const turnoVigente = \(\) => GlacialIndicadores\.turnoVigente\(ahoraServidor\(\)\)/.test(s('js/produccion/24-semaforo-produccion-actual.js'))&&/GlacialIndicadores\.horarioTurno\(/.test(s('js/produccion/24-semaforo-produccion-actual.js')),'semáforo (24): turno vigente y horarios del módulo');
ok(!/\bnew Date\(\);\s*\n\s*const t = obtenerTurnoActual/.test(s('js/accesos/17-modo-trabajo.js')),'cronómetro (17): usa la hora del servidor');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
