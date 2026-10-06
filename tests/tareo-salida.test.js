/* Tareo de Producción: las horas de SALIDA ya guardadas no se pierden al marcar varias seguidas ni con relojes distintos. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
const src=leer('js/personal/13-tareo.js');
const trozo=n=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}throw new Error(n);};
const sb={Math,Number,Array,Object,String,Map,Set,JSON,Date};vm.createContext(sb);sb.window=sb;
sb.tareoAreaDe=t=>t.area;sb.ordenarPersonalTareo=l=>l;sb.tareoFusionarPorDia=()=>[];
sb.tareoNormalizarDNI=v=>String(v||'').replace(/\D/g,'');sb.tareoNormalizarTexto=v=>String(v||'').toUpperCase();
vm.runInContext(['tareoClavePersona','tareoAhoraMs','tareoPersonalMasReciente','tareoFusionar'].map(trozo).join('\n')+';this.fusionar=tareoFusionar;this.ahora=tareoAhoraMs;',sb);

const P=(id,o)=>Object.assign({trabajadorId:id,nombre:'P'+id,asistencia:'Asistió',horaIngreso:'07:00',horaSalida:'',actualizadoEn:0},o||{});
const T=(personal,t)=>({id:'TAR-PRO',area:'Producción',actualizadoEn:t,personal,configActualizadoEn:0,horaProgramadaIngreso:'07:00',jornadaNormal:8});
const sal=(r,id)=>r.personal.find(p=>p.trabajadorId===id).horaSalida;

/* La nube ya tiene las salidas de A y B (guardadas a las 19:00:01 y 19:00:02) */
const remoto=T([P('A',{horaSalida:'19:00',actualizadoEn:1001}),P('B',{horaSalida:'19:00',actualizadoEn:1002}),P('C')],1002);
/* El supervisor marca la salida de C, pero su copia se armó con datos un instante viejos (sin la salida de B) y es más NUEVA */
const copiaC=T([P('A',{horaSalida:'19:00',actualizadoEn:1001}),P('B',{actualizadoEn:900}),P('C',{horaSalida:'19:01',actualizadoEn:1003})],1003);
let r=sb.fusionar(remoto,copiaC);
ok(sal(r,'A')==='19:00'&&sal(r,'B')==='19:00'&&sal(r,'C')==='19:01','salidas seguidas: la copia más nueva pero con datos viejos NO pisa la salida de B ya guardada');
ok(r.personal.length===3,'la lista de personas sigue siendo la de la copia más nueva');
/* corregir/borrar a propósito una salida: lo más reciente gana */
const borrar=T([P('A',{horaSalida:'',actualizadoEn:2000}),P('B',{horaSalida:'19:00',actualizadoEn:1002}),P('C')],2000);
r=sb.fusionar(remoto,borrar);
ok(sal(r,'A')===''&&sal(r,'B')==='19:00','si el supervisor borra o corrige una salida a propósito, ese cambio (más reciente) se respeta');
/* otro dispositivo marcó a D más tarde y mi copia más nueva no lo tiene editado */
const remoto2=T([P('A',{actualizadoEn:10}),P('D',{horaSalida:'19:30',actualizadoEn:3000})],3000);
const mia=T([P('A',{horaSalida:'19:05',actualizadoEn:3500}),P('D',{actualizadoEn:20})],3500);
r=sb.fusionar(remoto2,mia);
ok(sal(r,'A')==='19:05'&&sal(r,'D')==='19:30','dos dispositivos marcando personas distintas a la vez: se conservan ambas salidas');
/* depuración de filas antiguas: lo que ya no está en la copia más nueva sigue eliminado */
const sinE=T([P('A',{horaSalida:'19:00',actualizadoEn:1001})],5000);
r=sb.fusionar(T([P('A',{actualizadoEn:1}),P('E')],4000),sinE);
ok(r.personal.length===1&&r.personal[0].trabajadorId==='A','las filas depuradas de la nómina no vuelven a aparecer');
/* reloj del equipo */
sb.tareoAhoraServidor=()=>5000000;
ok(sb.ahora()===5000000,'los cambios se marcan con la hora del servidor (calibrada), no con el reloj del equipo');
/* auditoría de código */
ok(/persona\.actualizadoEn = tareoAhoraMs\(\);/.test(src)&&!/persona\.actualizadoEn = Date\.now\(\);/.test(src),'todas las ediciones de una persona usan la hora del servidor');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
