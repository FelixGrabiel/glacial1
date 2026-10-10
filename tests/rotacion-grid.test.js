/* Cuadro tipo Excel de las rotaciones (supervisores, mantenimiento, maquinistas). */
const fs=require('fs'),vm=require('vm');
const R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8').replace(/\r\n/g,'\n');

const noop=()=>{};
const doc={getElementById:()=>null,querySelector:()=>null,head:{appendChild:noop},createElement:()=>({}),addEventListener:noop,activeElement:null,body:{}};
const sb={window:{},document:doc,CSS:{escape:x=>x},setTimeout:noop,confirm:()=>true,Date,console};
sb.window.document=doc;vm.createContext(sb);
vm.runInContext(leer('js/personal/31a-rotacion-grid.js'),sb);
const G=sb.window.glacialRotGrid;
ok(!!G&&typeof G.html==='function','31a: expone glacialRotGrid.html');
ok(G.cruzaMedianoche('19:00','07:00')===true&&G.cruzaMedianoche('07:00','16:00')===false,'cruza medianoche solo por horas');
ok(/\(\+1 día\)/.test(G.textoHorario('19:00','07:00'))&&!/\+1/.test(G.textoHorario('07:00','16:00')),'(+1 día) solo cuando cruza');

const cfg={id:'t',col1:'SUPERVISOR',dias:['LUN','MAR'].map((e,i)=>({fecha:'2026-10-0'+(5+i),etq:e,corta:'0'+(5+i)+'/10',largo:e}))
  ,filas:[{id:'a',nombre:'ANA',sub:'x',celdas:[{valor:'DÍA',inicio:'07:00',fin:'16:00'},{valor:'DESCANSO'}]}]
  ,catalogo:[{valor:'DÍA',etq:'DÍA',clase:'dia',horas:true,base:{inicio:'07:00',fin:'16:00'}},{valor:'DESCANSO',etq:'DESCANSO',clase:'descanso',horas:false}]
  ,bloqueado:false,aplicar:'ap',rerender:'rr'};
const h=G.html(cfg);
ok(/<table/.test(h)&&/<th[^>]*scope="col"/.test(h),'html: tabla con encabezados de columna');
ok(!/<select/.test(h.split('data-rg-editor')[0]),'html: sin select permanente en las celdas');
ok(/rg-dia/.test(h)&&/rg-descanso/.test(h),'html: colores por turno');

const s31=leer('js/personal/31-rotacion-supervisores.js');
ok(/function rotSupAplicarCelda/.test(s31)&&/glacialRotGrid\.html\(rotSupConfigCuadro/.test(s31),'31: usa el cuadro y aplica turno+horas juntos');
ok(!/Propuesta visual|Datos de ejemplo/.test(s31),'31: sin "Propuesta visual" ni "Datos de ejemplo"');
const s30=leer('js/mantenimiento/30-rotacion-mantenimiento.js');
ok(/function mttoAplicarAsignacion/.test(s30)&&/glacialRotGrid\.html\(mttoConfigCuadro/.test(s30)&&/activar\('rot-mtto'\)/.test(s30),'30: Mantenimiento usa el cuadro');
ok(/mttoSucio/.test(s30)&&/mttoPuedeSalirDeLaSemana/.test(s30),'30: cambios sin guardar protegidos al cambiar de semana');
const s33=leer('js/mantenimiento/33-rotacion-maquinistas.js');
ok(/function aplicarAsignacion/.test(s33)&&/glacialRotGrid\.html\(configCuadro/.test(s33)&&/activar\('rot-maq'\)/.test(s33),'33: Maquinistas usa el cuadro');
const ix=leer('index.html');
ok(ix.indexOf('31a-rotacion-grid.js')>0&&ix.indexOf('31a-rotacion-grid.js')<ix.indexOf('30-rotacion-mantenimiento.js'),'index: el cuadro se carga antes de los módulos de rotación');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
