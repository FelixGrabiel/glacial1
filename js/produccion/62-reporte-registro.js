/* =============================================================
   GLACIAL · REPORTE DIARIO DE UNA LÍNEA (botón «Exportar PNG» de la pestaña Gráficos)
   -------------------------------------------------------------
   Aplica la plantilla aprobada (61-reporte-linea.js) al reporte que se exporta desde un REGISTRO de producción.
   Este adaptador SOLO presenta: toma los valores que ya entrega el flujo actual (calcDerived, agruparParadas,
   construirAnalisisAccionReporte, Paletas, Distribución de personal) y los coloca en el modelo de la plantilla.
   No recalcula producción, ratios, paradas, rendimiento, disponibilidad, calidad, OEE ni mermas; lo que no existe se
   muestra «—» o «Pendiente de confirmar».

   Flujo: botón «Exportar PNG» (08-graficos.js › renderGraficosTab) → exportarPNG() → glacialReporteRegistro.exportar()
          → modelo(rec, d) → glacialReporteLinea.dibujar(modelo) → descarga «Reporte_Diario_<línea>_<fecha>.png».
   El diseño anterior (cascada, Pareto, análisis) sigue disponible como salida secundaria: exportarPNGDetalle().
   Cargar DESPUÉS de 08-graficos.js y 61-reporte-linea.js.
   ============================================================= */
(function instalarReporteRegistro(){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const esNum=v=>typeof v==='number'&&Number.isFinite(v);
  const R=()=>window.glacialReporteLinea;
  const bloqueDeRegistro=rec=>(rec&&rec.grupoTurno==='NOCHE')||String(rec&&rec.turno||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  const cuadrosDe=rec=>typeof normalizarCuadros==='function'?normalizarCuadros(rec):(Array.isArray(rec&&rec.cuadros)?rec.cuadros:[]);
  const unidadRatio=l=>l==='C20L'?'C/H':'B/H';

  /* Hora «HH:MM» → instante, con la regla de la noche (de 00:00 a 11:59 es el día siguiente). */
  function horaMs(fecha,hora,bloque){
    if(!fecha||!/^\d{1,2}:\d{2}$/.test(String(hora||'')))return 0;
    const d=new Date(fecha+'T'+String(hora).padStart(5,'0')+':00');
    if(bloque==='NOCHE'&&Number(String(hora).slice(0,2))<12)d.setDate(d.getDate()+1);
    return d.getTime();
  }
  /* Inicio y fin del registro según las horas de sus cuadros (datos existentes). */
  function periodo(rec,bloque){
    let ini=0,fin=0;
    cuadrosDe(rec).forEach(q=>{
      const a=horaMs(rec.fecha,q&&q.horaInicio,bloque),b=horaMs(rec.fecha,q&&q.horaFin,bloque);
      if(a&&(!ini||a<ini))ini=a;
      if(b&&b>fin)fin=b;
    });
    const hhmm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
    return {inicioMs:ini,finMs:fin,inicio:ini?hhmm(ini):'',fin:fin?hhmm(fin):''};
  }

  /* modelo(rec, d): objeto serializable para la plantilla. Async solo por la lectura de la distribución de personal. */
  async function modelo(rec,d,opc){
    opc=opc||{};
    const L=R();
    const linea=rec.linea||(typeof state!=='undefined'&&state.currentLine)||'';
    const bloque=bloqueDeRegistro(rec);
    const per=periodo(rec,bloque);
    const cerrado=rec.estadoRegistro==='FINALIZADO';
    const cuadros=cuadrosDe(rec);
    const pres=(marca,p)=>typeof nombrePresentacionUI==='function'?nombrePresentacionUI(linea,marca,p):String(p||'').replace(/_/g,' ');

    /* producción por marca / presentación (como en el flujo actual) */
    const mapa=new Map();
    cuadros.forEach(c=>{
      const u=num(c&&c.produccion&&c.produccion.efectiva);if(u<=0)return;
      const k=(c.marca||'Sin marca')+'|'+(c.presentacion||'');
      const o=mapa.get(k)||{marca:String(c.marca||'Sin marca').trim()||'Sin marca',presentacion:pres(c.marca,c.presentacion)||'Sin presentación',produccion:0,_m:c.marca,_p:c.presentacion};
      o.produccion+=u;mapa.set(k,o);
    });
    const marcas=[...mapa.values()].sort((a,b)=>b.produccion-a.produccion).map(o=>({marca:o.marca,presentacion:o.presentacion,produccion:o.produccion}));
    const prodsHora=[...mapa.values()].map(o=>({marca:o._m,presentacion:o._p}));
    const totalMarcas=marcas.reduce((s,k)=>s+k.produccion,0);

    const programado=num(d.programada),producido=num(d.efectiva);
    const hhEfect=num(d.horasEfectivas),hhTurno=num(d.horasTurno);
    const paradasH=num(d.pProg)+num(d.pNoProg);

    /* paradas: las del flujo actual (agruparParadas) */
    const ap=typeof agruparParadas==='function'?agruparParadas(rec):{filas:[],total:0};
    const porMotivo=new Map();
    (ap.filas||[]).forEach(f=>{
      const k=String(f.descripcion||'').trim().toLowerCase();
      const o=porMotivo.get(k)||{motivo:String(f.descripcion||'').trim(),minutos:0,tipo:/no programada/i.test(f.tipo)?'NO_PROGRAMADA':'PROGRAMADA'};
      o.minutos+=num(f.minutos);porMotivo.set(k,o);
    });
    const motivos=[...porMotivo.values()].sort((a,b)=>b.minutos-a.minutos);
    const progMin=num(d.pProg)*60,npMin=num(d.pNoProg)*60;

    /* indicadores: los valores del flujo actual con sus metas actuales (colorSegunMeta / METAS de 08-graficos.js) */
    const color=(v,meta)=>typeof colorSegunMeta==='function'&&typeof METAS!=='undefined'?colorSegunMeta(num(v),meta):'gris';
    const conVel=num(d.produccionNominal)>0;
    const indicadores={
      disponibilidad:{valor:hhTurno>0?num(d.disponibilidad):null,nivel:hhTurno>0?color(d.disponibilidad,METAS.disponibilidad):'gris'},
      rendimiento:{valor:conVel?num(d.rendimiento):null,nivel:conVel?color(d.rendimiento,METAS.rendimiento):'gris',aRevisar:conVel&&num(d.rendimiento)>1,sinVelocidad:!conVel},
      calidad:{valor:esNum(d.calidad)?num(d.calidad):null,nivel:color(d.calidad,METAS.calidad),texto:'Sin datos suficientes'},
      oee:{valor:conVel?num(d.oee):null,nivel:conVel?color(d.oee,METAS.oee):'gris'}
    };

    /* producción por hora: registros de Paletas del bloque (fuente existente) */
    let porHora=null;
    try{
      const corteMs=per.finMs||Math.min(typeof window.tareoAhoraServidor==='function'?window.tareoAhoraServidor():Date.now(),(window.GlacialIndicadores.horarioBloque(rec.fecha,bloque)||{}).fin||Infinity);
      const prods=prodsHora;
      if(per.inicioMs&&corteMs>per.inicioMs)porHora=L.porHora({linea,productos:prods,inicioMs:per.inicioMs,corteMs},rec.fecha,bloque);
    }catch(_){porHora=null;}

    /* personal y horas hombre: la distribución compartida de Tareo (si no hay dato: pendiente) */
    let personal=null,personalEstado='PENDIENTE',horasHombre=null;
    const D=window.glacialDistribucionPersonal;
    if(D&&per.inicioMs){
      const corteMs=per.finMs||per.inicioMs;
      try{if(opc.cargarDistribucion!==false)await Promise.race([D.cargar(rec.fecha,bloque),new Promise((_,no)=>setTimeout(()=>no(new Error('tiempo agotado')),4000))]);}catch(_){/* sin conexión o lenta: se usa lo ya cargado (o queda pendiente) */}
      try{
        const p=D.consultar(rec.fecha,bloque,linea,corteMs);
        if(p.estado==='CONFIRMADO'){personal=p.cantidad;personalEstado='CONFIRMADO';}
        const hh=D.consultarHorasHombre(rec.fecha,bloque,linea,per.inicioMs,corteMs);
        horasHombre={horas:hh.horas,estado:hh.estado,cobertura:hh.cobertura};
      }catch(_){/* queda pendiente */}
    }

    /* acciones: las del análisis existente (construirAnalisisAccionReporte); sin responsable real → «Por asignar» */
    const an=typeof construirAnalisisAccionReporte==='function'?construirAnalisisAccionReporte(rec,d):{acciones:[],textoEditado:''};
    const acciones=an.textoEditado
      ?[{area:'Sugerencia del supervisor',accion:an.textoEditado,responsable:'Por asignar',estado:'Por validar'}]
      :(an.acciones||[]).map(a=>({area:a.area||'General',accion:(a.dato?a.dato+' → ':'')+a.texto,responsable:'Por asignar',estado:'Por validar'}));

    const m={
      version:L.VERSION_REPORTE,linea,nombre:linea==='C20L'?'CAJAS 20L':linea,
      encabezado:{fecha:rec.fecha,bloque,estado:cerrado?'CERRADO':'PARCIAL',inicio:per.inicio,corte:per.fin,fin:cerrado?per.fin:'',
        supervisor:rec.registradoPor||'',tipo:'REGISTRO',idSnapshot:String(rec.id||'')},
      resumen:{programado,producido,pendiente:Math.max(0,programado-producido),excedente:Math.max(0,producido-programado),
        cumplimiento:programado>0?num(d.cumplimiento)*100:null,
        ratio:hhEfect>0?num(d.ratioEfectivo):null,unidadRatio:unidadRatio(linea),unidad:L.unidadProd(linea),
        minutosEfectivos:hhEfect*60,minutosTranscurridos:hhTurno*60,paradasMin:paradasH*60,
        personal,personalEstado,horasHombre},
      marcas,marcasTotal:totalMarcas||producido,
      indicadores,porHora,
      paradas:{programadas:progMin,noProgramadas:npMin,total:progMin+npMin,documentalMin:num(ap.total),
        motivos:motivos.slice(0,4),motivosOtros:Math.max(0,motivos.length-4),difiere:Math.abs(num(ap.total)-(progMin+npMin))>=0.5},
      insumos:L.insumosDesdeCuadros(linea,cuadros,producido,0,rec.fecha,bloque),
      acciones
    };
    return JSON.parse(JSON.stringify(m,(k,v)=>v===undefined?null:v));
  }

  async function generarCanvas(rec,d,opc){
    const m=await modelo(rec,d,opc);
    return {canvas:await R().dibujar(m,opc),modelo:m};
  }

  /* Botón «Exportar PNG»: genera y descarga el reporte con la plantilla aprobada. */
  async function exportar(){
    const data=obtenerRegistroExportacion();
    if(!data)return;
    try{
      const {canvas}=await generarCanvas(data.rec,data.d);
      canvas.toBlob(blob=>{
        if(!blob){alert('No se pudo generar la imagen PNG.');return;}
        const fecha=nombreArchivoSeguro(data.rec.fecha||new Date().toISOString().slice(0,10));
        const linea=nombreArchivoSeguro(data.rec.linea||state.currentLine);
        descargarArchivo(blob,`Reporte_Diario_${linea}_${fecha}.png`);
      },'image/png');
    }catch(error){
      console.error(error);
      alert('No se pudo generar el PNG. Inténtalo nuevamente.');
    }
  }

  window.glacialReporteRegistro={modelo,generarCanvas,exportar,periodo};
})();
