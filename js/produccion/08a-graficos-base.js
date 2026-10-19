/* =============================================================
   GLACIAL · BASE DE GRÁFICOS (ApexCharts · ECharts · canvas-gauges)
   -------------------------------------------------------------
   // GRAFICOS: capa común para los gráficos nuevos. Las librerías se cargan en index.html ANTES de los scripts de js/:
     ApexCharts 3.45.2 (columnas, líneas, áreas, dona, treemap, heatmap…) · ECharts 5.4.3 (velocímetros) · canvas-gauges 2.1.7 (velocímetro analógico).
   API (window.*):
     METAS_GRAFICOS / metaGrafico(k)  metas en %, LEÍDAS de la tabla configurada (sync/configIndicadores): las mismas de las tarjetas, insights y Excel
     colorKpi(valorPct, claveOMeta)  verde ≥ meta · ámbar ≥ umbral ámbar configurado · rojo por debajo
     colorCumplimiento(valorPct)     rojo/ámbar/verde con las metas configuradas · >105 naranja (SOBREPRODUCCIÓN)
     apexCrear(id, opciones)         crea o ACTUALIZA un ApexCharts en #id (altura numérica del contenedor; sin parpadeo en el tiempo real)
     velocimetroOEE(id, valor, op)   velocímetro ECharts con aguja, bandas, marca triangular de la meta, título y valor grande
     velocimetrosCompactos(id, lista, op)  varios medidores pequeños en UN solo gráfico (sin números en el borde)
     velocimetroAnalogico(id, valor, op)   velocímetro analógico canvas-gauges (0–100)
     graficoAImagen(id)              Promise con el PNG en base64 (Apex: dataURI · ECharts: getDataURL · canvas-gauges: toDataURL)
     graficosDestruir(id) / graficosDestruirTodo()   destruye lo registrado (Apex, ECharts, canvas-gauges y Chart.js registrados)
     graficoRegistrarChartJs(id, chart)    registra una instancia de Chart.js en el mismo registro único
   Cargar DESPUÉS de las librerías y ANTES de 08-graficos.js.
   ============================================================= */
(function(global){
  'use strict';
  const COLOR={azul:'#2F6690',azulSuave:'#7FA5BF',ambar:'#F2A93B',verde:'#3F8F5F',rojo:'#C4472B',naranja:'#E8731A',gris:'#B7C4CC',grisSuave:'#E8EAE4',texto:'#3A4551',grilla:'#EFF2F4',oscuro:'#1F2D3A'};
  const FUENTE='"IBM Plex Sans", sans-serif';

  /* ---------- metas y colores: UNA sola fuente = la tabla configurada (sync/configIndicadores → glacialMetasIndicadores) ----------
     Las mismas metas que usan las tarjetas, los insights y el Excel. Se leen en cada uso (getters), así que si el administrador las cambia,
     los gráficos las siguen en el siguiente dibujo. Mientras la tabla no exista se usan los valores iniciales del módulo de indicadores. */
  const RESPALDO={oee:{verde:85,ambar:75},disponibilidad:{verde:90,ambar:80},ratio:{verde:95,ambar:85},cumplimiento:{verde:95,ambar:85}};
  const CLAVE_TABLA={oee:'oee',disponibilidad:'disponibilidad',rendimiento:'ratio',cumplimiento:'cumplimiento'};
  function tablaMetas(){
    try{if(typeof global.glacialMetasIndicadores==='function'){const t=global.glacialMetasIndicadores();if(t)return t;}}catch(_){/* sin configuración */}
    try{if(global.GlacialIndicadores&&global.GlacialIndicadores.METAS_INICIALES)return global.GlacialIndicadores.METAS_INICIALES;}catch(_){/* sin módulo */}
    return RESPALDO;
  }
  /* {verde, ambar} en % de un indicador: verde ≥ verde · ámbar ≥ ámbar · rojo por debajo. */
  function metaGrafico(clave){
    const k=CLAVE_TABLA[clave]||clave,e=tablaMetas()[k]||RESPALDO[k];
    return e?{verde:Number(e.verde),ambar:Number(e.ambar)}:null;
  }
  const METAS_GRAFICOS={};
  ['oee','disponibilidad','rendimiento','cumplimiento'].forEach(k=>Object.defineProperty(METAS_GRAFICOS,k,{enumerable:true,get:()=>{const m=metaGrafico(k);return m?m.verde:NaN;}}));
  const metaDe=c=>typeof c==='number'?{verde:c,ambar:c-10}:metaGrafico(c);
  function colorKpi(valor,clave){
    const m=metaDe(clave),v=Number(valor);
    if(!m||!Number.isFinite(v)||!Number.isFinite(m.verde))return COLOR.gris;
    return v>=m.verde?COLOR.verde:v>=m.ambar?COLOR.ambar:COLOR.rojo;
  }
  /* Cumplimiento del programa: rojo < ámbar · ámbar < verde (metas configuradas) · verde hasta 105 · naranja > 105 (SOBREPRODUCCIÓN). */
  function colorCumplimiento(valor){
    const v=Number(valor),m=metaGrafico('cumplimiento');
    if(!Number.isFinite(v)||!m)return COLOR.gris;
    return v<m.ambar?COLOR.rojo:v<m.verde?COLOR.ambar:v<=105?COLOR.verde:COLOR.naranja;
  }
  /* Bandas del arco de un velocímetro en fracción 0–1 de `max`. */
  function bandasKpi(clave,max){
    const mx=max||100,m=metaDe(clave);
    if(clave==='cumplimiento'&&mx>100)return [[m.ambar/mx,COLOR.rojo],[m.verde/mx,COLOR.ambar],[105/mx,COLOR.verde],[1,COLOR.naranja]];
    return [[m.ambar/mx,COLOR.rojo],[m.verde/mx,COLOR.ambar],[1,COLOR.verde]];
  }
  const fmtEs=n=>Math.round(Number(n)||0).toLocaleString('es-PE');
  const fmtPct=n=>(Math.round((Number(n)||0)*10)/10).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const fmtSoles=n=>'S/ '+fmtEs(n);

  /* Colores del tema: hoy no hay modo oscuro; si se define --grafico-texto / --grafico-grilla / --grafico-fondo se toman de ahí. */
  function tema(){
    let cs=null;try{cs=getComputedStyle(document.documentElement);}catch(_){/* sin DOM */}
    const v=(k,def)=>{const x=cs&&cs.getPropertyValue(k);return x&&x.trim()?x.trim():def;};
    return {texto:v('--grafico-texto',COLOR.texto),grilla:v('--grafico-grilla',COLOR.grilla),fondo:v('--grafico-fondo','transparent')};
  }

  /* ---------- registro único de instancias por id de contenedor ---------- */
  const REG={apex:{},echarts:{},gauge:{},chartjs:{}};
  function destruirUno(tipo,id){
    const r=REG[tipo][id];if(!r)return;
    try{
      if(tipo==='apex')r.inst.destroy();
      else if(tipo==='echarts')r.inst.dispose();
      else if(tipo==='chartjs')r.inst.destroy();
      else if(tipo==='gauge'){r.inst.destroy&&r.inst.destroy();if(r.canvas&&r.canvas.parentNode)r.canvas.parentNode.removeChild(r.canvas);}
    }catch(_){/* ya destruido */}
    delete REG[tipo][id];
  }
  function graficosDestruir(id){Object.keys(REG).forEach(t=>destruirUno(t,id));}
  function graficosDestruirTodo(){Object.keys(REG).forEach(t=>Object.keys(REG[t]).forEach(id=>destruirUno(t,id)));}
  function graficoRegistrarChartJs(id,chart){destruirUno('chartjs',id);REG.chartjs[id]={inst:chart};return chart;}
  function graficosActivos(){return {apex:Object.keys(REG.apex),echarts:Object.keys(REG.echarts),gauge:Object.keys(REG.gauge),chartjs:Object.keys(REG.chartjs)};}

  let temporizadorResize=null;
  if(typeof window!=='undefined'&&window.addEventListener){
    window.addEventListener('resize',()=>{
      clearTimeout(temporizadorResize);
      temporizadorResize=setTimeout(()=>Object.keys(REG.echarts).forEach(id=>{try{REG.echarts[id].inst.resize();}catch(_){/* destruido */}}),120);
    });
  }

  /* ---------- ApexCharts ---------- */
  const esObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  function mezclar(base,extra){
    const out=Object.assign({},base);
    Object.keys(extra||{}).forEach(k=>{out[k]=esObj(extra[k])&&esObj(out[k])?mezclar(out[k],extra[k]):extra[k];});
    return out;
  }
  function apexBase(){
    const t=tema();
    return {
      chart:{fontFamily:FUENTE,foreColor:t.texto,background:t.fondo,toolbar:{show:false},zoom:{enabled:false},parentHeightOffset:0,
        // sin animación: destruir un ApexCharts a mitad de animación (cambio rápido de pestaña o refresco en vivo) lanza errores asíncronos de la librería
        animations:{enabled:false}},
      colors:[COLOR.azul,COLOR.ambar,COLOR.verde,COLOR.rojo,COLOR.azulSuave,COLOR.gris],
      grid:{borderColor:t.grilla,strokeDashArray:0},
      dataLabels:{style:{fontFamily:FUENTE,fontSize:'11px'}},
      legend:{position:'bottom',fontSize:'12px',fontFamily:FUENTE,markers:{radius:12,width:8,height:8},itemMargin:{horizontal:8,vertical:2}},
      tooltip:{theme:'dark',style:{fontFamily:FUENTE,fontSize:'12px'}},
      noData:{text:'Sin datos',style:{color:t.texto,fontFamily:FUENTE}}
    };
  }
  function mensajeSinLibreria(el,nombre){if(el)el.innerHTML='<div class="small-muted" style="padding:20px;text-align:center;">No se cargó la librería de gráficos ('+nombre+'). Revisa tu conexión a internet y recarga la página.</div>';}
  function apexCrear(id,opciones){
    const el=document.getElementById(id);if(!el)return null;
    if(typeof ApexCharts==='undefined'){mensajeSinLibreria(el,'ApexCharts');return null;}
    const op=opciones||{};
    const alto=Number(op.alto)||el.clientHeight||Number(op.chart&&op.chart.height)||280;   // altura NUMÉRICA: height:'100%' desborda la tarjeta
    const sinAlto=Object.assign({},op);delete sinAlto.alto;
    const opts=mezclar(apexBase(),sinAlto);
    opts.chart=Object.assign({},opts.chart,{height:alto,parentHeightOffset:0});
    const reg=REG.apex[id];
    if(reg&&reg.el===el&&reg.tipo===opts.chart.type){
      // mismo contenedor y mismo tipo: se actualiza en sitio (sin recrear ni parpadear)
      try{reg.inst.updateOptions(opts,true,true);return reg.inst;}catch(_){/* se recrea */}
    }
    destruirUno('apex',id);
    el.innerHTML='';
    const inst=new ApexCharts(el,opts);
    inst.render();
    REG.apex[id]={inst,el,tipo:opts.chart.type};
    return inst;
  }

  /* ---------- ECharts: velocímetros ---------- */
  const TRIANGULO_META={type:'gauge',silent:true,z:5,axisLine:{show:false},splitLine:{show:false},axisTick:{show:false},axisLabel:{show:false},anchor:{show:false},
    detail:{show:false},title:{show:false}};
  function serieMeta(base,meta){
    return Object.assign({},TRIANGULO_META,base,{pointer:{icon:'triangle',length:13,width:13,offsetCenter:[0,'-104%'],itemStyle:{color:COLOR.oscuro}},data:[{value:meta}]});
  }
  function serieAguja(base,valor,nombre,color,compacto){
    return Object.assign({type:'gauge',z:4},base,{
      axisLine:{roundCap:false,lineStyle:{width:base.grosor,color:base.bandas}},
      progress:{show:false},
      pointer:{icon:'rect',length:compacto?'60%':'64%',width:compacto?4:6,offsetCenter:[0,0],itemStyle:{color:COLOR.oscuro}},
      anchor:{show:true,showAbove:true,size:compacto?9:14,itemStyle:{color:'#fff',borderWidth:compacto?3:4,borderColor:COLOR.oscuro}},   // eje circular hueco
      splitLine:{distance:-base.grosor,length:base.grosor,lineStyle:{color:'#fff',width:compacto?2:3}},
      axisTick:{distance:-base.grosor,length:compacto?4:6,splitNumber:5,lineStyle:{color:'#fff',width:1}},
      axisLabel:{show:!compacto,distance:base.grosor+6,color:COLOR.texto,fontSize:11,formatter:v=>String(Math.round(v))},
      title:{show:true,offsetCenter:[0,compacto?'44%':'38%'],color:COLOR.texto,fontSize:compacto?12:14,fontWeight:600,fontFamily:FUENTE},
      detail:{show:true,valueAnimation:true,offsetCenter:[0,compacto?'72%':'62%'],fontSize:compacto?17:30,fontWeight:700,fontFamily:FUENTE,color,
        formatter:v=>(Math.round(v*10)/10).toLocaleString('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'},
      data:[{value:valor,name:nombre,detail:{color}}]
    });
  }
  function montarEcharts(id,option){
    const el=document.getElementById(id);if(!el)return null;
    if(typeof echarts==='undefined'){mensajeSinLibreria(el,'ECharts');return null;}
    const reg=REG.echarts[id];
    if(reg&&reg.el===el&&!reg.cambio)return reg;
    destruirUno('echarts',id);
    el.innerHTML='';
    const inst=echarts.init(el,null,{renderer:'canvas'});
    inst.setOption(option);
    return (REG.echarts[id]={inst,el});
  }
  /* valor y meta en la misma escala de `max` (100 por defecto). op: {max, meta, clave, nombre, bandas, grosor, radio, center, color} */
  function velocimetroOEE(id,valor,op){
    op=op||{};
    const max=op.max||100,clave=op.clave||'oee';
    const meta=op.meta!=null?op.meta:(max===100?metaDe(clave).verde:null);
    const color=op.color||(clave==='cumplimiento'?colorCumplimiento(valor):colorKpi(valor,clave));
    const base={min:0,max,startAngle:200,endAngle:-20,radius:op.radio||'92%',center:op.center||['50%','64%'],grosor:op.grosor||16,
      bandas:op.bandas||bandasKpi(clave,max),splitNumber:max>100?6:5};
    const series=[serieAguja(base,valor,op.nombre||'OEE',color,false)];
    if(meta!=null)series.push(serieMeta({min:0,max,startAngle:200,endAngle:-20,radius:base.radio,center:base.center},meta));
    const reg=REG.echarts[id],el=document.getElementById(id);
    if(reg&&el&&reg.el===el&&reg.tipo==='velocimetroOEE'){
      // actualización: solo se mueve la aguja y se recolorea el valor
      reg.inst.setOption({series:[{data:[{value:valor,name:op.nombre||'OEE',detail:{color}}]}].concat(meta!=null?[{data:[{value:meta}]}]:[])});
      return reg.inst;
    }
    const r=montarEcharts(id,{animationDuration:600,series});
    if(r){r.tipo='velocimetroOEE';return r.inst;}
    return null;
  }
  /* lista: [{nombre, valor, meta?, clave?, max?}]. Reparte los medidores en fila dentro de un solo gráfico. */
  function velocimetrosCompactos(id,lista,op){
    op=op||{};const n=lista.length||1;
    const series=[];
    lista.forEach((m,i)=>{
      const max=m.max||100,clave=m.clave||'oee',meta=m.meta!=null?m.meta:(max===100?metaDe(clave).verde:null);
      const cx=((i+.5)/n*100).toFixed(2)+'%';
      const base={min:0,max,startAngle:200,endAngle:-20,radius:op.radio||(n>=3?'62%':'80%'),center:[cx,op.centroY||'58%'],grosor:op.grosor||10,
        bandas:m.bandas||bandasKpi(clave,max),splitNumber:5};
      const color=clave==='cumplimiento'?colorCumplimiento(m.valor):colorKpi(m.valor,clave);
      series.push(serieAguja(base,m.valor,m.nombre,color,true));                       // compacto: sin números en el borde
      if(meta!=null)series.push(serieMeta({min:0,max,startAngle:200,endAngle:-20,radius:base.radio,center:base.center},meta));
    });
    const reg=REG.echarts[id],el=document.getElementById(id);
    if(reg&&el&&reg.el===el&&reg.tipo==='compactos'&&reg.n===n){
      const upd=[];lista.forEach((m,i)=>{
        const max=m.max||100,clave=m.clave||'oee',meta=m.meta!=null?m.meta:(max===100?metaDe(clave).verde:null);
        const color=clave==='cumplimiento'?colorCumplimiento(m.valor):colorKpi(m.valor,clave);
        upd.push({data:[{value:m.valor,name:m.nombre,detail:{color}}]});if(meta!=null)upd.push({data:[{value:meta}]});
      });
      reg.inst.setOption({series:upd});return reg.inst;
    }
    const r=montarEcharts(id,{animationDuration:600,series});
    if(r){r.tipo='compactos';r.n=n;return r.inst;}
    return null;
  }

  /* ---------- canvas-gauges: velocímetro analógico ---------- */
  function velocimetroAnalogico(id,valor,op){
    op=op||{};
    const el=document.getElementById(id);if(!el)return null;
    if(typeof RadialGauge==='undefined'){mensajeSinLibreria(el,'canvas-gauges');return null;}
    const clave=op.clave||'oee',mt=metaDe(clave),m=mt.verde,am=mt.ambar,t=tema();
    const reg=REG.gauge[id];
    if(reg&&reg.el===el){reg.inst.value=valor;return reg.inst;}
    destruirUno('gauge',id);el.innerHTML='';
    const cv=document.createElement('canvas');el.appendChild(cv);
    const lado=Math.max(160,Math.min(el.clientWidth||260,el.clientHeight||260));
    const g=new RadialGauge({renderTo:cv,width:lado,height:lado,minValue:0,maxValue:100,value:valor,units:'%',title:op.titulo||'OEE',
      majorTicks:['0','20','40','60','80','100'],minorTicks:5,strokeTicks:true,
      highlights:[{from:0,to:am,color:COLOR.rojo},{from:am,to:m,color:COLOR.ambar},{from:m,to:100,color:COLOR.verde}],highlightsWidth:12,
      colorPlate:'transparent',colorTitle:t.texto,colorUnits:t.texto,colorNumbers:t.texto,colorMajorTicks:t.texto,colorMinorTicks:t.texto,colorBorderShadow:false,
      colorBorderOuter:'transparent',colorBorderMiddle:'transparent',colorBorderInner:'transparent',borders:false,
      needleType:'arrow',needleWidth:3,needleCircleSize:7,needleCircleInner:false,needleShadow:false,colorNeedle:COLOR.oscuro,colorNeedleEnd:COLOR.oscuro,colorNeedleCircleOuter:COLOR.oscuro,
      valueBox:true,valueDec:1,valueInt:1,fontValueSize:34,colorValueText:colorKpi(valor,clave),colorValueBoxBackground:'transparent',colorValueBoxShadow:false,colorValueBoxRect:'transparent',colorValueBoxRectEnd:'transparent',
      animationDuration:600,animationRule:'linear'});
    g.draw();
    REG.gauge[id]={inst:g,el,canvas:cv};
    return g;
  }

  /* ---------- imagen ---------- */
  async function graficoAImagen(id){
    if(REG.apex[id]){const r=await REG.apex[id].inst.dataURI();return r&&(r.imgURI||r);}
    if(REG.echarts[id])return REG.echarts[id].inst.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#fff'});
    if(REG.gauge[id])return REG.gauge[id].canvas.toDataURL('image/png');
    const el=document.getElementById(id),cv=el&&(el.tagName==='CANVAS'?el:el.querySelector('canvas'));
    return cv?cv.toDataURL('image/png'):null;
  }

  Object.assign(global,{METAS_GRAFICOS,metaGrafico,colorKpi,colorCumplimiento,apexCrear,velocimetroOEE,velocimetrosCompactos,velocimetroAnalogico,graficoAImagen,
    graficosDestruir,graficosDestruirTodo,graficoRegistrarChartJs});
  global.glacialGraficosBase={COLOR,METAS_GRAFICOS,metaGrafico,colorKpi,colorCumplimiento,bandasKpi,fmtEs,fmtPct,fmtSoles,tema,mezclar,apexBase,graficosActivos,REG};
})(typeof window!=='undefined'?window:globalThis);
