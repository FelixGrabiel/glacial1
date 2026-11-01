// ARCHIVO GENERADO por scripts/generar-nucleo-drive.js: NO se edita a mano (cambia js/asistente/90-control-proceso-nucleo.js y vuelve a generar).
/* =============================================================
   GLACIAL · CONTROL DE PROCESO EN EL ENVASADO (CF - CA - F - 047) — NÚCLEO (puro: sin ExcelJS ni pantalla; se prueba con node)
   -------------------------------------------------------------
   Arma, desde los reportes de producción de una línea y un mes, el modelo del formulario «Control de proceso en el envasado» que hoy se lleva
   a mano en Drive (un libro por línea y mes, p. ej. «C.P_BIDON_7L-OCTUBRE», con UNA HOJA POR MARCA y UNA FILA POR CUADRO de producción).
   Columnas del formulario (B7L):
     SOPLADO     MAN · LAV · LLEN · L.PREFORMA · CIERRE · CANT          ENVASADO   CANT · L.TAPA · CONF
     ETIQUETADO  LOTE · ROTUL                                          EMPAQUETADO LOTE ASA · CONF · CANT          FECHA · (turno D/N)
   GLACIAL llena lo que ya sabe: lote de producción, cantidades, fecha y turno (del reporte) y los lotes de insumo usados en el cuadro (preforma, tapa,
   etiqueta y asa, de la trazabilidad de lotes). Las columnas de verificación (MAN, LAV, LLEN, CIERRE, CONF, ROTUL) las completa planta: GLACIAL no las inventa.
   NO toca producción, ratio, paradas, Avance/Cierre, tareo ni stock SAP: solo LEE los reportes y los lotes de insumo registrados en cada cuadro.
   Documento de diseño: docs/asistente/control-proceso-drive.md.
   ============================================================= */
(function instalarControlProcesoNucleo(global){
  'use strict';

  const FORMULARIO={codigo:'CF - CA - F - 047',titulo:'CONTROL DE PORCESO EN EL ENVASADO'};      // el título conserva la grafía del formulario controlado
  /* Líneas con formulario conocido. Las demás (PET1, PET2, C20L, B20L) tienen su propio formulario: se agregan aquí cuando se conozca su formato. */
  const LINEAS={B7L:{codigo:'B7L',nombre:'BIDÓN 7L',presentacion:'7L',archivo:'C.P_BIDON_7L'}};
  const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  /* Categoría del lote de insumo (trazabilidad) → columna del formulario. */
  const COLUMNA_DE_CATEGORIA={preformas:'preforma',tapas:'tapa',etiquetas:'etiqueta',asas:'asa'};
  const COLUMNAS_LOTES=['preforma','tapa','etiqueta','asa'];
  const ETIQUETA_COLUMNA={preforma:'L.PREFORMA',tapa:'L.TAPA',etiqueta:'LOTE ETIQUETA',asa:'LOTE ASA'};
  /* De dónde sale cada CANT del formulario (campo de cuadro.produccion). En el Drive actual las tres cantidades suelen coincidir; se deja configurable. */
  const MAPEO_CANTIDADES_DEFECTO={soplado:'sopladas',envasado:'efectiva',empaquetado:'efectiva'};
  const SEPARADOR_LOTES=' + ';

  const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const texto=v=>String(v==null?'':v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
  const mm=n=>String(n).padStart(2,'0');

  /* ---------- fechas y códigos ---------- */
  const esFechaIso=v=>{
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(v))return false;
    const [a,m,d]=v.slice(0,10).split('-').map(Number),f=new Date(Date.UTC(a,m-1,d));
    return f.getUTCFullYear()===a&&f.getUTCMonth()===m-1&&f.getUTCDate()===d;
  };
  /** '2027-10-01' → '01102027' (formato del lote de producción en el Drive: CF3-01102027). */
  function ddmmaaaa(iso){
    if(!esFechaIso(iso))return '';
    const [a,m,d]=iso.slice(0,10).split('-');
    return d+m+a;
  }
  /** Vencimiento por defecto cuando el cuadro no trae fecha de vencimiento: un año después de la fecha del lote. El turno NOCHE termina de madrugada del día siguiente, así que su lote lleva la fecha del día siguiente
   *  (en el Drive: 01/10 DÍA → CF3-01102027, 01/10 NOCHE → CF3-02102027). */
  function vencimientoPorDefecto(fecha,turno){
    if(!esFechaIso(fecha))return '';
    const [a,m,d]=fecha.slice(0,10).split('-').map(Number),f=new Date(Date.UTC(a,m-1,d));
    if(norm(turno).includes('NOCHE'))f.setUTCDate(f.getUTCDate()+1);
    f.setUTCFullYear(f.getUTCFullYear()+1);
    return f.getUTCFullYear()+'-'+mm(f.getUTCMonth()+1)+'-'+mm(f.getUTCDate());
  }
  /** Lote de producción tal como lo escribe planta: código del lote + «-» + vencimiento DDMMAAAA (CF3-01102027). El vencimiento sale del cuadro; si no lo trae (ctx={fecha,turno} del reporte), se calcula; sin nada, solo el código. */
  function lotePT(c,ctx){
    const l=texto(c&&c.lote),v=ddmmaaaa(c&&c.fechaVencimiento)||(ctx?ddmmaaaa(vencimientoPorDefecto(String(ctx.fecha||''),ctx.turno)):'');
    return l&&v?l+'-'+v:l;
  }
  /** Turno del formulario: «D» (día e intermedio) o «N» (noche). */
  function turnoLetra(t){
    const s=norm(t);
    if(!s)return '';
    return s.includes('NOCHE')?'N':'D';
  }
  const bloqueDe=t=>String(t||'').toUpperCase().includes('NOCHE')?'NOCHE':'DIA';
  /** Misma clave de cuadro que usa el Asistente de Producción (fecha|bloque|línea|marca|presentación). */
  const normClave=v=>String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/(\d)\s*(litros?|lts?)(?![a-z])/g,'$1l').replace(/\s+/g,' ').trim();      // igual que el norm del Asistente (70): «7 litros» = «7l»
  const claveCuadro=(fecha,turno,linea,marca,presentacion)=>[fecha,bloqueDe(turno),linea,normClave(marca),normClave(presentacion)].join('|');

  /** Clave única de la fila en el formulario (columna R): reporte + n.º de cuadro. Sigue al cuadro aunque se corrija su marca (la fila no se duplica); sin id de reporte, la clave del Asistente. */
  const claveFila=(r,c,i,linea)=>texto(r&&r.id)?texto(r.id)+'#'+(num(c&&c.numero)||i+1):claveCuadro(String(r.fecha).slice(0,10),r.turno,linea,c&&c.marca,c&&c.presentacion);

  /* ---------- lotes de insumo del cuadro ---------- */
  /**
   * cuadro.lotesInsumo = [{unidadId, loteId, loteProveedor, categoria, insumo, …}] (lo llena la trazabilidad de lotes al usar una unidad en el cuadro).
   * Devuelve {preforma, tapa, etiqueta, asa}: los lotes del proveedor distintos de cada categoría, unidos con « + » (si en el cuadro se cambió de lote).
   */
  function lotesDelCuadro(cuadro){
    const out={preforma:[],tapa:[],etiqueta:[],asa:[]};
    (Array.isArray(cuadro&&cuadro.lotesInsumo)?cuadro.lotesInsumo:[]).forEach(l=>{
      const col=COLUMNA_DE_CATEGORIA[String(l&&l.categoria||'').toLowerCase()],lote=texto(l&&l.loteProveedor);
      if(col&&lote&&!out[col].includes(lote))out[col].push(lote);
    });
    return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.join(SEPARADOR_LOTES)]));
  }

  /* ---------- filas del mes ---------- */
  /** Un cuadro entra al formulario si tiene marca y produjo algo (sopladas o producción efectiva). Los cuadros solo programados no se registran. */
  const cuadroProducido=c=>!!c&&!!texto(c.marca)&&(num(c.produccion&&c.produccion.efectiva)>0||num(c.produccion&&c.produccion.sopladas)>0);
  /** Un cuadro entra al formulario cuando planta lo finalizó («FINALIZAR MARCA») o cuando el reporte completo ya está finalizado. Los demás son producción en curso: aparecen cuando se finalicen. */
  const cuadroFinalizado=(r,c)=>texto(c&&c.estadoCuadro).toUpperCase()==='FINALIZADO'||texto(r&&r.estadoRegistro).toUpperCase()==='FINALIZADO';
  const mesDe=(anio,mes)=>String(anio)+'-'+mm(mes);

  /**
   * registros: reportes de producción ({fecha, turno, linea, cuadros:[{numero, marca, presentacion, lote, fechaVencimiento, produccion, lotesInsumo?}]}).
   * Una fila por cuadro producido de esa línea en ese mes. Ordenadas por fecha, turno (D antes que N) y n.º de cuadro.
   */
  function filasDeRegistros(registros,{linea,anio,mes,mapeo,pendientes:pend}){
    const mp=Object.assign({},MAPEO_CANTIDADES_DEFECTO,mapeo||{}),prefijo=mesDe(anio,mes),filas=[],pendientes=pend||{n:0};
    (Array.isArray(registros)?registros:[]).forEach(r=>{
      if(!r||r.linea!==linea||String(r.fecha||'').slice(0,7)!==prefijo||!esFechaIso(String(r.fecha)))return;
      (Array.isArray(r.cuadros)?r.cuadros:[]).forEach((c,i)=>{
        if(!cuadroProducido(c))return;
        if(!cuadroFinalizado(r,c)){pendientes.n++;return;}
        const p=c.produccion||{},lotes=lotesDelCuadro(c),f={
          clave:claveFila(r,c,i,linea),claveCuadro:claveCuadro(String(r.fecha).slice(0,10),r.turno,linea,c.marca,c.presentacion),
          fecha:String(r.fecha).slice(0,10),turno:turnoLetra(r.turno),numero:num(c.numero)||i+1,marca:texto(c.marca),presentacion:texto(c.presentacion),
          lotePT:lotePT(c,{fecha:String(r.fecha).slice(0,10),turno:r.turno}),soplado:num(p[mp.soplado]),envasado:num(p[mp.envasado]),empaquetado:num(p[mp.empaquetado]),
          preforma:lotes.preforma,tapa:lotes.tapa,etiqueta:lotes.etiqueta,asa:lotes.asa,registroId:texto(r.id)
        };
        f.sinLotes=COLUMNAS_LOTES.filter(k=>!f[k]);
        filas.push(f);
      });
    });
    return filas.sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.turno==='N')-(b.turno==='N')||a.numero-b.numero||a.clave.localeCompare(b.clave));
  }

  /** Nombre de hoja válido en Excel/Sheets: sin \ / ? * [ ] :, máximo 31 y único (sin distinguir mayúsculas). */
  function nombreHoja(marca,usados){
    let base=texto(marca).replace(/[\\/?*\[\]:]/g,' ').replace(/\s+/g,' ').trim().slice(0,31)||'SIN MARCA',n=base,i=2;
    while(usados.has(n.toLowerCase())){const suf=' ('+i+')';n=base.slice(0,31-suf.length)+suf;i++;}
    usados.add(n.toLowerCase());
    return n;
  }
  /** Una hoja por marca (orden alfabético), cada una con sus filas. */
  function hojasPorMarca(filas,presentacionDefecto){
    const por=new Map();
    filas.forEach(f=>{const k=norm(f.marca);if(!por.has(k))por.set(k,{marca:f.marca,filas:[]});por.get(k).filas.push(f);});
    const usados=new Set();
    return [...por.values()].sort((a,b)=>norm(a.marca).localeCompare(norm(b.marca),'es')).map(h=>({
      marca:h.marca.toUpperCase(),nombre:nombreHoja(h.marca.toUpperCase(),usados),
      presentacion:presentacionDefecto,filas:h.filas      // el formulario lleva la presentación de la línea («7L»), no el texto largo del reporte
    }));
  }
  const nombreArchivo=(linea,anio,mes)=>{
    const L=LINEAS[linea];
    return L?L.archivo+'-'+MESES[Number(mes)-1]+'-'+anio+'.xlsx':'';
  };
  /** Modelo completo del mes: hojas por marca, totales y cuántas filas no tienen todos los lotes de insumo (para avisar antes de exportar). */
  function modeloMes(registros,{linea,anio,mes,mapeo}){
    const L=LINEAS[linea];
    if(!L)return {error:'La línea '+linea+' todavía no tiene formulario de control de proceso configurado.'};
    if(!(Number(anio)>=2020&&Number(anio)<=2100)||!(Number(mes)>=1&&Number(mes)<=12))return {error:'Elige un mes válido.'};
    const pendientes={n:0},filas=filasDeRegistros(registros,{linea,anio:Number(anio),mes:Number(mes),mapeo,pendientes});
    return {linea,nombreLinea:L.nombre,presentacion:L.presentacion,anio:Number(anio),mes:Number(mes),mesNombre:MESES[Number(mes)-1],archivo:nombreArchivo(linea,Number(anio),Number(mes)),
      hojas:hojasPorMarca(filas,L.presentacion),total:filas.length,sinFinalizar:pendientes.n,
      sinLotes:filas.filter(f=>f.sinLotes.length).length,sinLotesPorColumna:Object.fromEntries(COLUMNAS_LOTES.map(k=>[k,filas.filter(f=>!f[k]).length])),
      sinVencimiento:filas.filter(f=>f.lotePT&&!/-\d{8}$/.test(f.lotePT)).length};
  }

  const API={FORMULARIO,LINEAS,MESES,COLUMNA_DE_CATEGORIA,COLUMNAS_LOTES,ETIQUETA_COLUMNA,MAPEO_CANTIDADES_DEFECTO,SEPARADOR_LOTES,ddmmaaaa,vencimientoPorDefecto,lotePT,turnoLetra,claveCuadro,lotesDelCuadro,cuadroProducido,cuadroFinalizado,
    filasDeRegistros,nombreHoja,hojasPorMarca,nombreArchivo,modeloMes,esFechaIso,norm};
  global.glacialControlProcesoNucleo=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);

export default globalThis.glacialControlProcesoNucleo;
