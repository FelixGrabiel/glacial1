/* Registro de producción · punto 4, parte 1 (auditoría 2026-11-05): una marca a la vez, «+ Agregar marca»
   y el cuadro 1 lleno desde la programación del turno (no con la 1.ª marca del catálogo). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',src.indexOf(')',m.index)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s06=leer('js/produccion/06-registro.js'),s35=leer('js/produccion/35-autollenado-registro.js'),html=leer('index.html');

const sb={console,Math,Number,Array,Object,String,Set,Map,num:v=>{const n=Number(v);return Number.isFinite(n)?n:0;},
  obtenerRatioNominal:()=>1000,generarLoteCuadro:()=>'CF1',actualizarCuadro:()=>{},reporteEstaBloqueado:()=>false,
  normalizarClavePaletas:v=>String(v||'').toLowerCase().replace(/\s+/g,''),document:{querySelectorAll:()=>[]}};
vm.createContext(sb);
vm.runInContext('let _vistaCuadros={clave:null,activo:0,abiertos:1};let draft=null;'+
  ['cuadroEnUso','claveVistaCuadros','cuadrosVisiblesRegistro','cuadroActivoRegistro','productosProgramadosRegistro','siguienteProductoProgramado',
   'ponerProductoEnCuadro','cuadro1DesdeProgramacion'].map(n=>extraer(s06,n)).join('')+
  'this.fijar=d=>{draft=d;_vistaCuadros={clave:null,activo:0,abiertos:1};};this.vista=()=>_vistaCuadros;',sb);

const vacio=n=>({numero:n,marca:'',presentacion:'',produccion:{efectiva:0,programada:0},paradasProgramadas:[{tiempoMin:0,descripcion:''}],paradasNoProgramadas:[{tiempoMin:0,descripcion:''}]});
const nuevo=()=>{const c=[1,2,3,4].map(vacio);Object.assign(c[0],{marca:'Bells',presentacion:'625',marcaPorDefecto:true});
  return {id:null,linea:'PET1',fecha:'2026-11-05',turno:'DÍA',cuadros:c};};

/* visibles */
let d=nuevo();sb.fijar(d);
ok(sb.cuadrosVisiblesRegistro()===1,'reporte nuevo: se ve solo la Producción 1');
d.cuadros[2].marca='Aro';
ok(sb.cuadrosVisiblesRegistro()===3,'una producción 3 con marca: se ven las pestañas 1 a 3 (no se esconde nada con datos)');
d=nuevo();d.cuadros[1].paradasNoProgramadas[0].tiempoMin=15;sb.fijar(d);
ok(sb.cuadrosVisiblesRegistro()===2,'una producción sin marca pero con paradas también cuenta como en uso');
d=nuevo();d.cuadros[3].estadoCuadro='FINALIZADO';sb.fijar(d);
ok(sb.cuadrosVisiblesRegistro()===4,'una producción finalizada siempre se ve');

/* programación → cuadro 1 */
sb.loadProgramaciones=()=>[
  {linea:'PET1',fecha:'2026-11-05',turno:'DÍA',marca:'Glacial',presentacion:'2.5L',cantidadProgramada:20,creadoEn:1},
  {linea:'PET1',fecha:'2026-11-05',turno:'INTERMEDIO',marca:'Scala',presentacion:'625',cantidadProgramada:5,creadoEn:2,estadoOperacion:{estado:'EN_CURSO'}},
  {linea:'PET1',fecha:'2026-11-05',turno:'DÍA',marca:'Cancelada',presentacion:'625',cantidadProgramada:5,estadoOperacion:{estado:'CANCELADA'}},
  {linea:'PET1',fecha:'2026-11-05',turno:'NOCHE',marca:'Noche',presentacion:'625',cantidadProgramada:5},
  {linea:'PET2',fecha:'2026-11-05',turno:'DÍA',marca:'OtraLinea',presentacion:'625',cantidadProgramada:5}];
d=nuevo();sb.fijar(d);
ok(sb.productosProgramadosRegistro().map(p=>p.marca).join()==='Scala,Glacial','programación del bloque Día+Intermedio: primero la que está en curso; sin canceladas, sin Noche ni otra línea');
ok(sb.cuadro1DesdeProgramacion()===true&&d.cuadros[0].marca==='Scala'&&d.cuadros[0].marcaPorDefecto===false,'cuadro 1 con la marca por defecto: toma el producto programado (y deja de ser «por defecto»)');
ok(sb.cuadro1DesdeProgramacion()===false&&d.cuadros[0].marca==='Scala','la segunda vez no cambia nada');
ok(sb.siguienteProductoProgramado(1).marca==='Glacial','«+ Agregar marca» propone el siguiente producto programado que aún no está en el reporte');
d=nuevo();d.cuadros[0].marcaPorDefecto=false;sb.fijar(d);
ok(sb.cuadro1DesdeProgramacion()===false&&d.cuadros[0].marca==='Bells','si el supervisor eligió la marca, la programación no la pisa');
d=nuevo();sb.fijar(d);sb.loadProgramaciones=()=>[];
ok(sb.cuadro1DesdeProgramacion()===false&&d.cuadros[0].marca==='Bells','sin programación: el cuadro 1 queda como antes');
d=nuevo();d.turno='NOCHE';sb.fijar(d);sb.loadProgramaciones=()=>[{linea:'PET1',fecha:'2026-11-05',turno:'NOCHE',marca:'Noche',presentacion:'625',cantidadProgramada:5}];
ok(sb.cuadro1DesdeProgramacion()===true&&d.cuadros[0].marca==='Noche','turno NOCHE usa la programación de Noche');

/* código */
ok(/marcaPorDefecto: activo && !!marca/.test(s06),'blankCuadro marca el cuadro 1 como «marca por defecto»');
ok(/name === 'presentacion'\s*\)\{\s*q\.marcaPorDefecto = false;/.test(s06),'elegir marca o presentación quita la marca por defecto');
ok(/pestanasCuadrosHtml\(cuadros, visiblesVista, activoVista, bloqueadoVista\)/.test(s06)&&!/repeat\(\s*4,\s*minmax\(0,1fr\)\s*\)/.test(s06),'el formulario muestra pestañas en vez de 4 columnas');
ok(/\$\{i===activoVista\?'':'display:none;'\}/.test(s06),'los 4 cuadros siguen en la página (para no romper lo que los busca); solo se ve el activo');
ok(/cuadro1DesdeProgramacion\(\)/.test(s35),'el autollenado llena el cuadro 1 desde la programación');
ok(/06-registro\.js\?v=202611\d\d-rc\d/.test(html)&&/35-autollenado-registro\.js\?v=20261105-rc2/.test(html),'versiones nuevas en index.html');

if(fallas){console.log('\n'+fallas+' falla(s)');process.exit(1);}
console.log('\nTodo bien');
