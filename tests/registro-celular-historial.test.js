/* Registro de producción · punto 4, partes 3 y 4 (auditoría 2026-11-05): secciones plegables con resumen y tablas como tarjetas en el celular;
   Historial con filtros Desde/Hasta y marca, total producido y exportación a Excel de lo filtrado. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');
function extraer(src,n){const m=new RegExp('function[ ]+'+n+'[ ]*[(]').exec(src);if(!m)throw new Error('no se encontró '+n);let i=src.indexOf('{',src.indexOf(')',m.index)),d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(m.index,j+1)+'\n';}
const s06=leer('js/produccion/06-registro.js'),s07=leer('js/produccion/07-historial.js'),html=leer('index.html'),css=leer('css/styles.css');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};

/* ---------- parte 3: resúmenes de las secciones ---------- */
const sb={Math,Number,String,Array,num};vm.createContext(sb);
vm.runInContext('let draft={personal:[{nombre:"Ana"},{nombre:""},{nombre:"Luis"}]};'+extraer(s06,'resumenSeccionRegistro')+'this.res=resumenSeccionRegistro;',sb);
const q={paradasProgramadas:[{tiempoMin:10},{tiempoMin:0}],paradasNoProgramadas:[{tiempoMin:25},{tiempoMin:10,eliminada:true}],mermas:[{peso:2.5,unidades:30},{peso:0,unidades:0},{peso:1.6}],lotesInsumo:[{loteId:'a'}]};
ok(sb.res('Paradas programadas',q)==='1 · 10 min'&&sb.res('Paradas no programadas',q)==='1 · 25 min','paradas: cuántas y minutos (sin las vacías ni las eliminadas)');
ok(/^2 ítems · 4[.,]1 kg$/.test(sb.res('Mermas',q)),'mermas: ítems con valor y kg');
ok(sb.res('Lotes de insumo usados (trazabilidad y Control de proceso)',q)==='1 marcado'&&sb.res('Personal del turno',null)==='2 personas','lotes marcados y personal registrado');
ok(sb.res('Paradas programadas',{paradasProgramadas:[]})==='sin paradas'&&sb.res('Mermas',{mermas:[]})==='sin mermas','secciones vacías lo dicen');
const pleg=extraer(s06,'plegablesYTarjetasRegistro');
ok(/innerWidth<=700/.test(pleg)&&/_plegadoRegistro/.test(pleg)&&/closest\('button,input,select,a,label'\)/.test(pleg),'en el celular empiezan cerradas, se recuerda lo que abre cada persona y «+ Agregar» sigue funcionando');
ok(/reg-tarjetas/.test(pleg)&&/td\.dataset\.t=ths\[j\]/.test(pleg)&&/aria-label/.test(pleg)&&/reg-btn-x/.test(pleg),'tablas como tarjetas (cada celda con su columna), etiqueta accesible en cada campo y botones ✕ de 44 px');
ok(/table\.reg-tarjetas thead\{display:none\}/.test(s06)&&/td\[data-t\]::before\{content:attr\(data-t\)/.test(s06),'CSS de tarjetas en el celular');
ok(/reg-plegable\.reg-cerrado/.test(extraer(s06,'aplicarIrAFaltanteRegistro')),'ir a un dato que falta abre su sección si estaba cerrada');

/* ---------- parte 4: Historial ---------- */
const hs={Math,Number,String,Array,Set,Map,num,state:{currentLine:'PET1'},normalizarCuadros:r=>r,nombrePresentacionUI:(l,m,p)=>p};vm.createContext(hs);
vm.runInContext(['histCuadrosActivos','histPresentacionNombre','histEstadoTexto','histMarcasRegistro','histFilaPasaFiltros','histFilasExcel'].map(n=>extraer(s07,n)).join('')+
  'this.f={histMarcasRegistro,histFilaPasaFiltros,histFilasExcel};',hs);
const C=(marca,ef,o)=>Object.assign({numero:1,marca,presentacion:'625',horaInicio:'07:00',horaFin:'19:00',produccion:{programada:1000,efectiva:ef},paradasProgramadas:[{tiempoMin:10}],paradasNoProgramadas:[{tiempoMin:5}]},o||{});
const V=n=>({numero:n,marca:'',presentacion:'',produccion:{programada:0,efectiva:0},paradasProgramadas:[],paradasNoProgramadas:[]});
const regs=[{id:'a',linea:'PET1',fecha:'2026-11-01',turno:'DÍA',estadoRegistro:'FINALIZADO',registradoPor:'Ana',cuadros:[C('Bells',900),C('Scala',100,{numero:2}),V(3),V(4)]},
  {id:'b',linea:'PET1',fecha:'2026-11-05',turno:'NOCHE',estadoRegistro:'EN_REGISTRO',registradoPor:'Luis',cuadros:[C('Scala',500),V(2),V(3),V(4)]}];
ok(hs.f.histMarcasRegistro(regs[0]).join()==='Bells,Scala'&&hs.f.histMarcasRegistro(regs[1]).join()==='Scala','marcas del reporte (solo de producciones en uso)');
const ds={fecha:'2026-11-05',turno:'NOCHE',estado:'EN REGISTRO',marcas:'Scala'};
ok(hs.f.histFilaPasaFiltros(ds,{desde:'2026-11-02'})&&!hs.f.histFilaPasaFiltros(ds,{hasta:'2026-11-04'})&&hs.f.histFilaPasaFiltros(ds,{desde:'2026-11-05',hasta:'2026-11-05'}),'rango Desde/Hasta (incluye los extremos)');
ok(hs.f.histFilaPasaFiltros(ds,{marca:'Scala'})&&!hs.f.histFilaPasaFiltros(ds,{marca:'Bells'})&&!hs.f.histFilaPasaFiltros(ds,{turno:'DÍA'})&&hs.f.histFilaPasaFiltros(ds,{}),'marca, turno y sin filtros');
const fx=hs.f.histFilasExcel(regs,{});
ok(fx.length===3&&fx[0][5]==='Bells'&&fx[0][11]===900&&fx[0][12]===10&&fx[0][13]===5,'Excel: una fila por producción con programada, efectiva y minutos de paradas');
ok(hs.f.histFilasExcel(regs,{marca:'Scala'}).length===2,'Excel con filtro de marca: solo esa marca');
ok(/id="hist-f-desde"/.test(s07)&&/id="hist-f-hasta"/.test(s07)&&/id="hist-f-marca"/.test(s07)&&/id="hist-f-exportar"/.test(s07)&&/id="hist-v2-resumen"/.test(s07),'Historial: controles Desde, Hasta, Marca, Exportar y resumen');
ok(/\.filter\(r=>!r\.hidden\)/.test(s07),'se exporta exactamente lo que se ve (filas visibles)');
ok(/hist-v2-rango/.test(css)&&/hist-v2-exportar/.test(css),'estilos del Historial');
ok(/06-registro\.js\?v=2026\d{4}-rc\d/.test(html)&&/07-historial\.js\?v=20261107-/.test(html)&&/styles\.css\?v=20261107-/.test(html),'versiones nuevas en index.html');

if(fallas){console.log('\n'+fallas+' falla(s)');process.exit(1);}
console.log('\nTodo bien');
