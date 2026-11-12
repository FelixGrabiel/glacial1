/* Asistente de Producción · previsión de insumos a varios días, desviación de consumo y alertas
   (js/asistente/82-asistente-prevision-nucleo.js). node tests/asistente-prevision.test.js */
'use strict';
const fs=require('fs'),vm=require('vm'),R=require('path').resolve(__dirname,'..');
let fallas=0;const ok=(c,t)=>{console.log((c?'✔ ':'✘ FALLA ')+t);if(!c){fallas++;process.exitCode=1;}};
const leer=f=>fs.readFileSync(R+'/'+f,'utf8');
const sb={console,Math,Number,Array,Object,String,Date,JSON,Set,Map,Promise,Error,RegExp,Proxy};vm.createContext(sb);sb.window=sb;sb.globalThis=sb;
vm.runInContext(leer('js/asistente/70-asistente-nucleo.js'),sb);vm.runInContext(leer('js/asistente/82-asistente-prevision-nucleo.js'),sb);
const P=sb.glacialAsistentePrevision;

const ins=[{codigo:'PREFORMA',nombre:'Preforma',unidad:'UND',activo:true},{codigo:'TAPA',nombre:'Tapa',unidad:'UND',activo:true}];
const fac=(insumo,factor)=>({insumo,linea:'PET1',marca:'*',presentacion:'*',base:'UND',cantidadBase:1,factor,vigenteDesde:'2026-01-01',vigenteHasta:null});
const factores=[fac('PREFORMA',1),fac('TAPA',1)];
const cu=(fecha,programado,producido,extra)=>Object.assign({clave:fecha+'|PET1|scala',fecha,linea:'PET1',marca:'Scala',presentacion:'2.5L',programado,producido:producido||0,unidadesPorPaleta:0,estado:'PENDIENTE'},extra||{});

{
  ok(P.sumarDias('2026-10-30',3)==='2026-11-02'&&P.sumarDias('2026-03-01',-1)==='2026-02-28','sumarDias cruza meses sin errores de zona horaria');
  const dias=[{fecha:'2026-10-21',cuadros:[cu('2026-10-21',1000,400)]},{fecha:'2026-10-22',cuadros:[cu('2026-10-22',1000,0)]},{fecha:'2026-10-23',cuadros:[cu('2026-10-23',1000,0)]}];
  const pv=P.prevision({dias,factores,insumos:ins,stockProd:{PREFORMA:1500,TAPA:5000},stockAlm:{PREFORMA:{estado:'OK',disponible:1000},TAPA:{estado:'SIN_ENLACE'}},enCamino:{PREFORMA:0,TAPA:0}});
  const f=c=>pv.filas.find(x=>x.insumo.codigo===c);
  ok(f('PREFORMA').porDia['2026-10-21']===600&&f('PREFORMA').total===2600,'hoy cuenta solo lo que falta producir (1000−400); los días siguientes, lo programado');
  ok(f('PREFORMA').alcanzaHasta==='2026-10-21'&&f('PREFORMA').primerFalta==='2026-10-22'&&f('PREFORMA').faltaProd===1100,'con 1500 en Producción alcanza hasta el día 21; el 22 se acaba; hay que pedir 1100');
  ok(f('PREFORMA').estado==='SIN_STOCK'&&f('PREFORMA').stockAlm===1000&&f('PREFORMA').faltaTotal===100,'si Almacén tiene 1000, faltan 100 aun pidiendo todo → no alcanza con Almacén');
  const pvB=P.prevision({dias,factores,insumos:ins,stockProd:{PREFORMA:1500},stockAlm:{PREFORMA:{estado:'OK',disponible:5000}},enCamino:{}});
  ok(pvB.filas.find(x=>x.insumo.codigo==='PREFORMA').estado==='PEDIR','si Almacén sí tiene lo que falta, el estado es «Pedir»');
  ok(f('TAPA').estado==='OK'&&f('TAPA').alcanzaHasta==='2026-10-23','la tapa (5000 para 2600) alcanza todo el período');
  ok(pv.filas[0].insumo.codigo==='PREFORMA','lo urgente va primero');
  const pv2=P.prevision({dias,factores,insumos:ins,stockProd:{PREFORMA:1500,TAPA:5000},stockAlm:{},enCamino:{PREFORMA:1200}});
  ok(pv2.filas.find(x=>x.insumo.codigo==='PREFORMA').estado==='OK','lo que viene en camino (pedido o entregado sin recibir) cuenta como cubierto');
  const dias2=[{fecha:'2026-10-21',cuadros:[cu('2026-10-21',1000,0,{estado:'FINALIZADA'}),cu('2026-10-21',500,0,{clave:'b',estado:'CANCELADA'}),cu('2026-10-21',0,0,{clave:'c',completar:true})]}];
  const pv3=P.prevision({dias:dias2,factores,insumos:ins,stockProd:{},stockAlm:{},enCamino:{}});
  ok(pv3.filas.length===0&&pv3.pendientesCierre===1,'cuadros finalizados o cancelados no piden insumos; «completar» sin cierre se avisa');
  const pv4=P.prevision({dias:[{fecha:'2026-10-21',cuadros:[cu('2026-10-21',100,0,{linea:'PET2'})]}],factores:[fac('PREFORMA',1)],insumos:ins,stockProd:{},stockAlm:{},enCamino:{}});
  ok(pv4.filas.length===0,'sin factor para esa línea no se inventa un consumo');
}
{
  const cuadros=[cu('2026-10-20',1000,1000,{clave:'k1'}),cu('2026-10-20',1000,1000,{clave:'k2'}),cu('2026-10-19',1000,1000,{clave:'k3'})];
  const movimientos=[{opId:'1',tipo:'CONSUMO',cuadro:'k1',insumo:'PREFORMA',cantidad:1100},{opId:'2',tipo:'CONSUMO',cuadro:'k2',insumo:'PREFORMA',cantidad:1020},
    {opId:'3',tipo:'CONSUMO',cuadro:'k3',insumo:'TAPA',cantidad:900},{opId:'4',tipo:'CONSUMO',cuadro:'k3',insumo:'PREFORMA',cantidad:5000},{opId:'5',tipo:'ANULACION',anulaA:'4'}];
  const d=P.desviacionConsumo({cuadros,factores,insumos:ins,movimientos});
  const pre=d.filas.find(x=>x.insumo.codigo==='PREFORMA'),tap=d.filas.find(x=>x.insumo.codigo==='TAPA');
  ok(pre.teorico===2000&&pre.real===2120&&pre.estado==='EXCESO'&&pre.cuadros===2,'consumo real vs teórico por insumo (el consumo anulado no cuenta) y exceso fuera de tolerancia');
  ok(Math.abs(pre.pct-0.06)<1e-9,'desviación = +6 %');
  ok(tap.estado==='DEFECTO'&&tap.pct===-0.1,'consumo por debajo del teórico');
  ok(d.filas[0].insumo.codigo==='TAPA','se ordena por mayor desviación');
  const n=P.desviacionConsumo({cuadros:[cu('2026-10-20',1000,1000,{clave:'k1'})],factores,insumos:ins,movimientos:[{opId:'1',tipo:'CONSUMO',cuadro:'k1',insumo:'PREFORMA',cantidad:1020}]});
  ok(n.filas[0].estado==='NORMAL','dentro de ±3 % es normal');
  ok(P.desviacionConsumo({cuadros,factores,insumos:ins,movimientos:[]}).filas.length===0,'sin consumos confirmados no se compara nada');
}
{
  /* Sin conciliación: se estima con la merma del Registro de producción (teórico + merma registrada). */
  const rep=(clave,extra)=>cu('2026-10-20',1000,1000,Object.assign({clave,reporte:{recordId:'r'+clave,indice:0}},extra||{}));
  const mermas={k1:{TAPA:50},k2:{TAPA:10},k3:{TAPA:0}};
  const mermaDe=(c,i)=>i.codigo==='TAPA'?((mermas[c.clave]||{}).TAPA??0):null;
  const d=P.desviacionConsumo({cuadros:[rep('k1'),rep('k2'),rep('k3'),cu('2026-10-20',1000,1000,{clave:'sinrep'})],factores,insumos:ins,movimientos:[],mermaDe});
  const tap=d.filas.find(x=>x.insumo.codigo==='TAPA');
  ok(tap&&tap.teorico===3000&&tap.real===3060&&tap.cuadros===3&&tap.estimados===3&&tap.confirmados===0,'sin conciliar: real estimado = teórico + merma del Registro (solo cuadros con reporte)');
  ok(Math.abs(tap.pct-0.02)<1e-9&&tap.estado==='NORMAL'&&d.estimados===3,'merma 60 de 3000 = 2 %: dentro de la tolerancia');
  ok(!d.filas.some(x=>x.insumo.codigo==='PREFORMA'),'un insumo que no se registra en el Registro (mermaDe → null) no se estima');
  const alto=P.desviacionConsumo({cuadros:[rep('k1'),rep('k2')],factores,insumos:ins,movimientos:[],mermaDe:(c,i)=>i.codigo==='TAPA'?60:null});
  ok(alto.filas[0].estado==='EXCESO'&&Math.abs(alto.filas[0].pct-0.06)<1e-9,'merma del 6 % → consumo alto');
  const al=P.alertasExtra({desviaciones:alto});
  ok(al.length===1&&/merma del Registro es 6 % del teórico/.test(al[0].texto),'el aviso dice que sale de la merma del Registro');
  const mix=P.desviacionConsumo({cuadros:[rep('k1'),rep('k2')],factores,insumos:ins,movimientos:[{opId:'9',tipo:'CONSUMO',cuadro:'k1',insumo:'TAPA',cantidad:1200}],mermaDe:(c,i)=>i.codigo==='TAPA'?999:null});
  const m=mix.filas[0];
  ok(m.confirmados===1&&m.estimados===1&&m.real===1200+1999,'si un cuadro está conciliado se usa el real conciliado (no se suma la merma) y el otro se estima');
  const sinProd=P.desviacionConsumo({cuadros:[cu('2026-10-20',1000,0,{clave:'z',reporte:{recordId:'x',indice:0}})],factores,insumos:ins,movimientos:[],mermaDe:()=>5});
  ok(sinProd.filas.length===0,'un reporte sin producción no se compara');
}
{
  const ahora=100*3600000;
  const sols=[{id:'S1',estado:'SOLICITADA',historial:[{en:ahora-5*3600000}],items:[]},{id:'S2',estado:'SOLICITADA',historial:[{en:ahora-1*3600000}],items:[]},
    {id:'S3',estado:'ENTREGADA',historial:[{en:ahora-13*3600000}],items:[{insumo:'A',entregado:10,recibido:0}]},{id:'S4',estado:'ENTREGADA',historial:[{en:ahora-13*3600000}],items:[{insumo:'A',entregado:10,recibido:10}]}];
  const prev={filas:[{estado:'SIN_STOCK',insumo:ins[0],faltaTotal:100,primerFalta:'2026-10-22'},{estado:'PEDIR',insumo:ins[1],faltaProd:50,primerFalta:null},{estado:'OK',insumo:ins[1]}]};
  const a=P.alertasExtra({prevision:prev,solicitudes:sols,ahora,desviaciones:{filas:[{estado:'EXCESO',pct:0.08,cuadros:3,insumo:ins[0]},{estado:'EXCESO',pct:0.5,cuadros:1,insumo:ins[1]}]},
    stockMinimoAlmacen:[{insumo:ins[0],disponible:10,minimo:100},{insumo:ins[1],disponible:500,minimo:100}]});
  const t=x=>a.filter(y=>y.tipo===x);
  ok(a[0].nivel==='critico'&&/no alcanza|ni con el stock/.test(a[0].texto),'lo crítico va primero (ni con Almacén alcanza)');
  ok(t('PREVISION').length===2,'avisos de previsión: pedir a Almacén y sin stock');
  ok(t('SOLICITUD_DEMORA').length===1&&/S1/.test(t('SOLICITUD_DEMORA')[0].texto),'solicitud con más de 4 h sin entregar (la de 1 h no)');
  ok(t('SIN_RECIBIR').length===1&&/S3/.test(t('SIN_RECIBIR')[0].texto),'entregada hace más de 12 h sin recibir (la ya recibida no)');
  ok(t('DESVIACION').length===1,'desviación fuera de tolerancia con al menos 2 cuadros (evita avisar por un solo dato)');
  ok(t('MINIMO_ALMACEN').length===1&&/Preforma/.test(t('MINIMO_ALMACEN')[0].texto),'stock de Almacén bajo el mínimo del catálogo');
}
{
  const p72=leer('js/asistente/72-asistente-pantalla.js'),idx=leer('index.html');
  ok(/subPrevision/.test(p72)&&/subDesviacion/.test(p72)&&/apSolicitarPrevision/.test(p72)&&/alertasPrevision\(\)/.test(p72),'72 muestra Previsión, Desviación de consumo y las alertas en «Por atender»');
  ok(/asistente\/82-asistente-prevision-nucleo\.js\?v=/.test(idx),'index.html carga 82');
}
console.log(fallas?`\n${fallas} fallas`:'\nTodo en orden');
