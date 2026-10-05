/* Impacto económico: filtros cruzados, periodos, análisis automático (matemática, sin NaN/Infinity) y Excel por rol. */
const E=require('../js/produccion/57-impacto-estado.js');
const AN=require('../js/produccion/59-impacto-analisis.js');
global.window=global;
const X=require('../js/produccion/60-impacto-excel.js');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c)fallas++;};
const cerca=(a,b)=>Math.abs(a-b)<1e-6;
let n=0;
const f=(o)=>Object.assign({id:'e'+(++n),tipo:'P',fecha:'2026-10-05',hora:'08:00',turno:'DÍA',grupo:'DIA',linea:'PET 1',marca:'Scala',pres:'2.5 L',maquina:'Etiquetadora',causa:'Falla',min:10,u:100,s:40,est:false,falta:null},o);
const filas=[
  f({linea:'PET 1',maquina:'Etiquetadora',causa:'Falla etiquetadora',min:30,u:300,s:120,turno:'DÍA'}),
  f({linea:'PET 1',maquina:'Sopladora',causa:'Falla sopladora',min:60,u:600,s:240,turno:'NOCHE',fecha:'2026-10-06'}),
  f({linea:'PET 2',maquina:'Etiquetadora',causa:'Falla etiquetadora',min:20,u:200,s:80,turno:'DÍA',marca:'Primor',fecha:'2026-10-06'}),
  f({linea:'PET 2',maquina:'Sin clasificar',causa:'Cambio de formato',min:10,u:100,s:40,turno:'NOCHE',marca:'Primor'}),
  f({tipo:'V',linea:'PET 1',maquina:'',causa:'Velocidad reducida',min:0,u:500,s:200}),
  f({tipo:'M',linea:'PET 2',maquina:'',causa:'Merma: Botellas',min:0,u:50,s:25})
];
const hoy='2026-10-10';
const datos=(fs,prev)=>({filas:fs,filasPrev:prev||null,per:E.resolverRango({modo:'mes'},hoy),perPrev:E.periodoAnterior(E.resolverRango({modo:'mes'},hoy)),hoy});
const vista=(e,econ,fs,prev)=>E.calcularVista(e,datos(fs||filas,prev),{economico:econ!==false});

/* 1. selección acumulativa: línea + máquina + causa */
let e=E.crearEstado();
ok(cerca(vista(e).kpis.total.s,705),'sin filtros: 120+240+80+40+200+25 = 705');
E.alternar(e,'linea','PET 1');
ok(cerca(vista(e).kpis.total.s,560),'PET 1 = 120+240+200 = 560');
E.alternar(e,'maquina','Etiquetadora');
ok(cerca(vista(e).kpis.total.s,120),'PET 1 + Etiquetadora = 120 (la máquina solo aplica a paradas)');
E.alternar(e,'causa','Falla etiquetadora');
ok(cerca(vista(e).kpis.total.s,120)&&E.chips(e).map(c=>c.dim).join()==='linea,maquina,causa','se acumula una tercera selección y los chips conservan el orden');
/* 2. el mismo gráfico muestra todas sus barras y las demás sí se filtran */
const v=vista(e);
ok(v.series.linea.length===2&&v.series.causa.length===1,'el gráfico de línea mantiene sus 2 barras aunque haya una línea elegida (se resalta, no se oculta); el de causa muestra las del contexto restante');
ok(v.series.marca.length===1&&v.series.marca[0].k==='Scala','el resto de gráficos sí queda filtrado');
ok(v.tabla.length===1,'la tabla queda filtrada por los 3 filtros');
/* 3. multiselección dentro de una dimensión = OR */
e=E.crearEstado();E.alternar(e,'linea','PET 1');E.alternar(e,'linea','PET 2');
ok(cerca(vista(e).kpis.total.s,705),'PET 1 + PET 2 suma ambas líneas');
E.alternar(e,'linea','PET 1');
ok(cerca(vista(e).kpis.total.s,145)&&E.chips(e).length===1,'quitar un valor (segundo toque) deja solo PET 2 = 80+40+25');
/* 4. quitar chip, limpiar selección, limpiar todo */
E.alternar(e,'turno','NOCHE');E.quitar(e,'linea','PET 2');
ok(E.chips(e).length===1&&E.chips(e)[0].dim==='turno','quitar un chip no toca los demás');
E.limpiarSeleccion(e);ok(!E.hayFiltros(e)&&e.rango.modo==='mes','Limpiar selección vacía los filtros y conserva el periodo');
e.rango={modo:'7',desde:'',hasta:''};E.limpiarTodo(e);ok(e.rango.modo==='mes','Limpiar todo restaura el periodo');
/* 5. día seleccionado no afecta a la serie temporal y sí a los demás */
e=E.crearEstado();E.alternar(e,'dia','2026-10-06');
const vd=vista(e);
ok(cerca(vd.kpis.total.s,320)&&cerca(vd.series.evolucion.valores.reduce((a,b)=>a+b,0),705),'seleccionar un día filtra los KPI (solo el 06 = 240+80 = 320) y la serie temporal conserva todos los días');
/* 6. periodos */
const pm=E.periodoAnterior(E.resolverRango({modo:'mes'},'2026-03-31'));
ok(pm.desde==='2026-02-01'&&pm.hasta==='2026-02-28','mes en curso: se compara con el mes anterior (febrero termina el 28)');
const p7=E.periodoAnterior(E.resolverRango({modo:'7'},hoy));
ok(p7.desde==='2026-09-27'&&p7.hasta==='2026-10-03','7 días: los 7 inmediatamente anteriores');
ok(E.resolverRango({modo:'rango',desde:'2026-10-09',hasta:'2026-10-01'},hoy).modo==='mes','rango inválido (fin antes del inicio) vuelve al mes');
ok(E.variacion(100,0).pct===null&&E.variacion(0,0).pct===null&&cerca(E.variacion(150,100).pct,50),'la variación no divide por cero');
/* 7. modo operativo: sin soles */
const vo=vista(E.crearEstado(),false);
ok(cerca(vo.kpis.total.min,120)&&vo.medida==='min'&&vo.sinValor===0,'modo operativo mide en minutos y no cuenta valores faltantes');
/* 8. valores faltantes no suman */
const vf=vista(E.crearEstado(),true,filas.concat([f({s:null,falta:'valor',u:999})]));
ok(cerca(vf.kpis.total.s,705)&&vf.sinValor===1&&vf.faltantes.productos.length===1,'un evento sin valor no suma (ni como S/ 0) y se lista como faltante');
/* 9. análisis automático */
const todos=['evolucion','linea','pareto','maquina','marca','pres','turno','tipo','dispersion','acumulada'];
const sinNaN=r=>!/NaN|Infinity|undefined|null/.test(JSON.stringify(Object.assign({},r,{datos:null})).replace(/"(hallazgo|atencion|datos)":null/g,''));
const vm=vista(E.crearEstado());
todos.forEach(k=>ok(sinNaN(AN[k](vm)),'análisis «'+k+'»: sin NaN/Infinity/undefined con datos'));
const vacio=vista(E.crearEstado(),true,[]);
todos.forEach(k=>{const r=AN[k](vacio);ok(r.estado==='sin_datos'&&r.analisis===AN.SIN_DATOS&&sinNaN(r),'análisis «'+k+'»: sin datos → mensaje de información insuficiente');});
const unico=vista(E.crearEstado(),true,[filas[0]]);
todos.forEach(k=>ok(sinNaN(AN[k](unico)),'análisis «'+k+'»: un solo dato sin NaN'));
const ceros=vista(E.crearEstado(),true,[f({s:0,u:0,min:0})]);
todos.forEach(k=>ok(sinNaN(AN[k](ceros)),'análisis «'+k+'»: todo en cero sin NaN'));
/* contenido: coincide con los datos */
const aL=AN.linea(vm);ok(/PET 1/.test(aL.analisis)&&/S\/ 560([.,]00)?/.test(aL.analisis)&&/79[.,]4 %/.test(aL.analisis),'línea: PET 1, S/ 560 y 79,4 % del total (560/705)');
const aP=AN.pareto(vm);ok(/Falla sopladora/.test(aP.analisis)&&/240/.test(aP.analisis),'pareto: la principal causa es la mayor (S/ 240)');
const aM=AN.maquina(vm);ok(/Sopladora/.test(aM.analisis)&&/no tiene máquina identificada/.test(aM.atencion||''),'máquinas: Sopladora al frente y se explica el grupo «Sin clasificar»');
ok(/Cambio de formato/.test(aM.atencion||''),'sin clasificar: lista la causa registrada');
const aD=AN.dispersion(vm);
ok(aD.estado==='ok'&&!/no determina/.test(aD.atencion||''),'dispersión: sin inversión real (más minutos = más pérdida) no se afirma que la duración no determine');
const inv=vista(E.crearEstado(),true,[f({min:60,s:100,u:10}),f({min:10,s:500,u:50})]);
ok(/no determina/.test(AN.dispersion(inv).atencion||''),'dispersión: parada corta más cara que una larga → se advierte');
const aO=AN.linea(vista(E.crearEstado(),false));ok(/min/.test(aO.analisis)&&!/S\//.test(aO.analisis),'modo operativo: el análisis habla en minutos y no menciona soles');
/* evolución: variación coherente */
const prev=[f({fecha:'2026-09-02',s:100,min:10,u:10})];
const ve=vista(E.crearEstado(),true,filas,prev);
ok(/aument/.test(AN.evolucion(ve).analisis),'evolución: dice «aumentó» respecto al periodo anterior');
ok(cerca(ve.kpis.variacion.pct,605),'variación = (705−100)/100 = 605 %');
ok(AN.evolucion(vista(E.crearEstado(),true,filas,[])).estado==='ok','evolución con periodo anterior vacío no falla');
/* foco */
const ef=E.crearEstado();E.alternar(ef,'linea','PET 1');E.alternar(ef,'turno','NOCHE');
const fo=AN.foco(vista(ef));ok(/PET 1 \+ NOCHE/.test(fo.analisis)&&/S\/ 240/.test(fo.analisis),'foco: «PET 1 + NOCHE» = S/ 240 con su porcentaje sobre PET 1');
ok(AN.foco(vista(E.crearEstado()))===null,'sin filtros no hay foco');
/* 10. Excel por rol */
const hojasG=X.armar({vista:vista(E.crearEstado()),estado:E.crearEstado(),econ:true});
const hojasO=X.armar({vista:vista(E.crearEstado(),false),estado:E.crearEstado(),econ:false});
const txt=h=>JSON.stringify(h);
ok(/Pérdida \(S\/\)/.test(txt(hojasG)),'Excel con soles para Gerencia/Jefatura');
ok(!/S\/|soles/i.test(txt(hojasO).replace(/Impacto operativo/g,'')),'Excel operativo: ninguna columna ni texto en soles');
ok(hojasG.every(h=>h.filas.every(r=>r.length<=h.cols.length)),'Excel: ninguna celda fuera de las columnas visibles');
console.log(fallas?fallas+' fallas':'todo correcto');process.exit(fallas?1:0);
