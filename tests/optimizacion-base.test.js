/* Optimización por la base saturada (12/11/2026):
   1 · los borradores de Nuevo Registro llevan un id fijo: el puente guarda cada uno en su propia fila y un autoguardado
       envía solo el borrador que cambió (antes la lista de 45 borradores, ~78 KB, viajaba entera en cada autoguardado);
   2 · las librerías de gráficos y de Excel ya no se cargan en la pantalla de inicio de sesión (se piden al entrar);
   3 · glacial_51 quita del tiempo real las tablas que nadie escucha. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const R=path.resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');

/* ---------- 1 · borradores con id ---------- */
const MT=leer('js/accesos/17-modo-trabajo.js');
const extraer=nombre=>{const i=MT.indexOf('function '+nombre+'(');if(i<0)throw new Error('falta '+nombre);let n=0,j=MT.indexOf('{',i);for(let k=j;k<MT.length;k++){if(MT[k]==='{')n++;else if(MT[k]==='}'){n--;if(!n)return MT.slice(i,k+1);}}throw new Error('sin cierre '+nombre);};
const ctx=vm.createContext({Map,Object,String,Number});
vm.runInContext(['_mtGrupoBorrador','_mtIdBorrador','_mtConIds'].map(extraer).join('\n'),ctx);
const conIds=l=>vm.runInContext('_mtConIds('+JSON.stringify(l)+')',ctx);
const r=conIds([
  {linea:'PET1',fecha:'2026-11-11',turno:'DÍA',actualizadoEn:1},
  {linea:'PET1',fecha:'2026-11-11',turno:'INTERMEDIO',actualizadoEn:5},
  {linea:'PET1',fecha:'2026-11-11',turno:'NOCHE',actualizadoEn:2},
  {linea:'B7L',fecha:'2026-11-11',turno:'DÍA',actualizadoEn:3}
]);
ok(r.length===3&&r.every(b=>typeof b.id==='string'&&b.id.length>0),'cada borrador queda con un id (línea|fecha|grupo de turno)');
ok(r.find(b=>b.id==='PET1|2026-11-11|DIA_INTERMEDIO').actualizadoEn===5,'si dos borradores comparten clave (Día e Intermedio) se conserva el más reciente');
ok(new Set(r.map(b=>b.id)).size===r.length,'los id no se repiten (requisito para que el puente parta la lista)');
const PU=leer('js/nucleo/00b-puente-supabase.js');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Promise,Set,Map,Error,setTimeout,clearTimeout};sb.window=sb;sb.globalThis=sb;
vm.createContext(sb);vm.runInContext(PU,sb);
ok(sb.__GLACIAL_PUENTE__.claveDeLista(r)==='id','el puente reconoce «id» como clave de la lista: cada borrador va en su propia fila');
ok(/items: conIds/.test(MT)&&(MT.match(/= _mtConIds\(items\);/g)||[]).length===2,'guardar y eliminar un borrador envían la lista con id');
ok(/id: _mtIdBorrador\(\{ linea, fecha: draftObj\.fecha, turno: draftObj\.turno \}\)/.test(MT),'el borrador nuevo nace con su id');

/* ---------- 2 · librerías sin bloquear ---------- */
const H=leer('index.html');
ok(!/<script[^>]*src="[^"]*(apexcharts|echarts|gauge)\.min\.js"/.test(H),'las librerías de gráficos ya no se cargan al abrir la página (pantalla de inicio de sesión)');
ok(/window\.glacialCargarGraficos = window\.glacialCargadorLibrerias\(/.test(H)&&['ApexCharts','echarts','RadialGauge'].every(g=>H.includes("['"+g+"', 'https://")),'glacialCargarGraficos pide ApexCharts, ECharts y canvas-gauges');
ok(/window\.glacialCargarGraficos\(\); window\.glacialCargarExcel\(\);/.test(H)&&/glacialCargarGraficos === 'function'\) window\.glacialCargarGraficos\(\)/.test(leer('js/accesos/03-auth.js')),'los gráficos se piden al entrar y con el primer toque o tecla');
ok(!/<script[^>]*src="[^"]*(xlsx\.full|exceljs)\.min\.js"/.test(H),'las librerías de Excel ya no se cargan al abrir la página (pantalla de inicio de sesión)');
ok(/window\.glacialCargarExcel = window\.glacialCargadorLibrerias\(\[/.test(H)&&/'XLSX', 'https:\/\/cdn\.sheetjs\.com/.test(H)&&/'ExcelJS', 'https:\/\/cdnjs/.test(H),'glacialCargarExcel pide XLSX y ExcelJS una sola vez');
ok(/addEventListener\('pointerdown', una, true\)/.test(H),'también se piden con el primer toque o tecla, por si se usa antes de entrar');
ok(/function enterApp\(\)\{\s*\/\*[^*]*\*\/\s*if\(typeof window\.glacialCargarGraficos === 'function'\) window\.glacialCargarGraficos\(\);\s*if\(typeof window\.glacialCargarExcel === 'function'\) window\.glacialCargarExcel\(\);/.test(leer('js/accesos/03-auth.js')),'al entrar a la aplicación se piden las librerías de Excel');
{
  const i=H.indexOf('window.glacialCargadorLibrerias = function'),j=H.indexOf('</script>',i);
  const cuerpo=H.slice(i,j);const agregados=[];
  const w={document:{createElement:()=>{const e={};return e;},head:{appendChild:e=>{agregados.push(e);setTimeout(()=>e.onload(),0);}}},console,Promise,addEventListener(){},removeEventListener(){}};
  w.window=w;vm.runInNewContext(cuerpo,w);
  const p1=w.glacialCargarExcel(),p2=w.glacialCargarExcel();
  ok(p1===p2&&agregados.length===2&&agregados.every(e=>e.async),'el cargador agrega los dos scripts (async) y no los repite');
}
const libs=['ApexCharts','echarts','RadialGauge'];
const base=leer('js/produccion/08a-graficos-base.js');
ok(libs.every(l=>base.includes("typeof "+l+"==='undefined'")),'los gráficos comprueban que su librería exista antes de usarla');

['fonts.googleapis.com/css2','css/tareo.css','css/tv-glacial.css'].forEach(h=>{
  const m=H.match(new RegExp('<link[^>]*href="[^"]*'+h.replace(/[./]/g,'\\$&')+'[^"]*"[^>]*>'));
  ok(!!m&&/media="print"/.test(m[0])&&/onload="this\.media='all'"/.test(m[0]),h+' no bloquea el primer dibujo (print → all al cargar)');
});
const sinCom=leer('css/tareo.css').replace(/\/\*[\s\S]*?\*\//g,'');
const tareo=[...sinCom.matchAll(/([^{}]+)\{/g)].map(m=>m[1].trim()).filter(x=>!x.startsWith('@'));
ok(tareo.length>50&&tareo.every(sel=>sel.split(',').every(x=>/^(\.tareo|\.tar2|#tareo)/.test(x.trim()))),'tareo.css solo tiene reglas de Tareo: cargarla después no cambia la pantalla de inicio');
['css/styles.css','css/sidebar-glacial.css','css/mobile-glacial.css'].forEach(h=>{
  const m=H.match(new RegExp('<link[^>]*href="'+h.replace(/[./]/g,'\\$&')+'[^"]*"[^>]*>'))||H.match(new RegExp('<link[^>]*\\s+href="'+h.replace(/[./]/g,'\\$&')+'[^"]*"'));
  ok(!!m&&!/media="print"/.test(m[0]),h+' sigue cargándose antes del primer dibujo (la necesita la pantalla de inicio)');
});

/* ---------- 3 · glacial_51 ---------- */
const M=leer('supabase/migraciones/glacial_51_tiempo_real_liviano.sql');
ok(/drop table public\.%I/.test(M)&&/tablename = 'fs_items' or tablename like 'g\\_%'/.test(M),'glacial_51 quita fs_items y las tablas g_* del tiempo real');
ok(!/drop table (if exists )?public\.(fs_docs|mtto)/i.test(M)&&/fs_docs no está en la publicación/.test(M),'glacial_51 no toca fs_docs ni mtto_* y se detiene si falta fs_docs');
ok(!/delete from|truncate|drop table if|drop table public\.[a-z]/i.test(M),'glacial_51 no borra tablas ni datos');
const canales=(leer('js/nucleo/00b-puente-supabase.js').match(/tabla: '([a-z_]+)'/g)||[]);
ok(canales.length===1&&canales[0]==="tabla: 'fs_docs'",'el puente solo escucha fs_docs (fs_items puede salir del tiempo real)');

console.log(fallas?'\n✘ '+fallas+' falla(s)':'\n✔ Optimización de la base: todas las pruebas pasaron');
process.exit(fallas?1:0);
