/* =============================================================
   GLACIAL · REPORTE DIARIO DE PRODUCCIÓN (formato del Excel de la planta) — 23/11/2026
   -------------------------------------------------------------
   Botón «Exportar PNG» de la pestaña Gráficos del Registro. Una imagen por registro (línea, fecha y turno) con:
     1. Encabezado y 4 cifras: producción efectiva, producción de la semana, ratio real (con paradas), ratio sin paradas.
     2. Datos del turno (entrada/salida = horario del bloque, personas = personal del registro con nombre).
     3. PRODUCCIÓN: una columna por cuadro (formato) como en el Excel: marca, presentación, ratio nominal, lote, vencimiento,
        horas, paradas, programada, efectiva, sopladas/disponibles, calidad, ratio real, ratio sin paradas, diferencia,
        no cumplida y paletas.
     4. 9 gráficos: Producción, Tiempo efectivo vs. paradas, Indicadores, Mermas, Insumos, Tiempo de paradas,
        Producción de la semana, Sopladas/Disponibles vs. efectivos (o Total por turno), Asistencia del personal.
     5. Tablas de la semana (lunes a domingo, día/noche): producción, sopladas/disponibles y personal con % del requerido.
     6. Observaciones y firmas.
   REGLAS (las del sistema, no las del Excel):
     · Horas de producción = duración de los cuadros; horas efectivas = duración − paradas (calcDerived).
     · Ratio sin paradas = efectiva ÷ horas efectivas (d.ratioEfectivo); ratio real = efectiva ÷ horas de producción.
     · Producción nominal, disponibilidad, rendimiento, calidad, OEE, cumplimiento y eficiencia = calcDerived (06-registro.js).
     · Mermas en % de la producción efectiva (agruparMermas); insumos = agruparInsumos.
     · Colores de los indicadores = metas configuradas (glacialMetasIndicadores).
     · Personal requerido por línea: sync/configIndicadores.personalRequerido (lo edita Administrador/jefatura).
   Solo presenta datos guardados: lo que no existe se muestra «—». Cargar DESPUÉS de 08-graficos.js y 62-reporte-registro.js.
   ============================================================= */
(function instalarReporteDiario(raiz){
  'use strict';
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const LINEAS_SEC={PET1:'Botellas sopladas',PET2:'Botellas sopladas',B7L:'Bidones soplados',B20L:'Bidones disponibles'};
  const NOMBRE={PET1:'PET 1',PET2:'PET 2',B7L:'BIDONES 7 L',C20L:'CAJAS 20 L',B20L:'BIDONES 20 L'};
  const UNIDAD={PET1:'botellas',PET2:'botellas',B7L:'bidones',C20L:'cajas',B20L:'bidones'};
  const CAL={PET1:'Botellas calidad',PET2:'Botellas calidad',B7L:'Bidones calidad',C20L:'Cajas calidad',B20L:'Bidones calidad'};
  const REQUERIDO_INICIAL=Object.freeze({PET1:7,PET2:8,B7L:11,C20L:11,B20L:5});
  const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const DIAS_LARGO=['LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO','DOMINGO'];

  /* ---------- fechas ---------- */
  const fechaLocal=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null;};
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const ddmm=d=>String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
  const ddmmaaaa=s=>{const d=fechaLocal(s);return d?ddmm(d)+'/'+d.getFullYear():(s||'—');};
  /** Lunes a domingo de la semana de una fecha ISO → 7 fechas ISO. */
  function semanaDe(fechaIso){
    const d=fechaLocal(fechaIso);if(!d)return [];
    const lun=new Date(d);lun.setDate(d.getDate()-((d.getDay()+6)%7));
    return Array.from({length:7},(_,i)=>{const x=new Date(lun);x.setDate(lun.getDate()+i);return iso(x);});
  }
  /** Semana ISO 8601 y día del año (juliano). */
  function semanaISO(fechaIso){
    const d=fechaLocal(fechaIso);if(!d)return {semana:null,juliano:null};
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dia=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-dia);
    const ini=new Date(Date.UTC(t.getUTCFullYear(),0,1));
    const juliano=Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,1))/864e5)+1;
    return {semana:Math.ceil(((t-ini)/864e5+1)/7),juliano};
  }
  const bloqueDe=r=>(r&&r.grupoTurno==='NOCHE')||String(r&&r.turno||'').toUpperCase().includes('NOCHE')?'NOCHE':'DÍA';
  const hhmm=ms=>{if(!ms)return '';const d=new Date(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

  /* ---------- configuración ---------- */
  function personalRequerido(linea){
    let c=null;try{c=typeof raiz.glacialConfigIndicadores==='function'?raiz.glacialConfigIndicadores():null;}catch(_){c=null;}
    const v=num(c&&c.personalRequerido&&c.personalRequerido[linea]);
    return v>0?v:(REQUERIDO_INICIAL[linea]||0);
  }
  function metas(){
    let m=null;try{m=typeof raiz.glacialMetasIndicadores==='function'?raiz.glacialMetasIndicadores():null;}catch(_){m=null;}
    const ini=(raiz.GlacialIndicadores&&raiz.GlacialIndicadores.METAS_INICIALES)||{};
    const de=k=>(m&&m[k])||ini[k]||{verde:85,ambar:65};
    return {disponibilidad:de('disponibilidad'),rendimiento:de('ratio'),calidad:ini.calidad||{verde:98,ambar:95},oee:de('oee'),cumplimiento:de('cumplimiento'),eficiencia:de('ratio')};
  }
  const nivel=(v,meta)=>v===null||!Number.isFinite(v)?'gris':v>=meta.verde?'verde':v>=meta.ambar?'ambar':'rojo';

  const cuadrosDe=rec=>typeof raiz.normalizarCuadros==='function'?raiz.normalizarCuadros(rec):(Array.isArray(rec&&rec.cuadros)?rec.cuadros:[]);
  const activo=c=>!!c&&(num(c.horasTurno)>0||num(c.produccion&&c.produccion.efectiva)>0||num(c.produccion&&c.produccion.programada)>0);
  const personasDe=rec=>(Array.isArray(rec&&rec.personal)?rec.personal:[]).filter(p=>String(p&&p.nombre||'').trim()).length;
  const secDe=(linea,c)=>LINEAS_SEC[linea]?num(c&&c.produccion&&c.produccion.sopladas):0;

  /* ---------- semana (todos los registros de la misma línea) ---------- */
  function semana(rec,todos){
    const linea=rec.linea,fechas=semanaDe(rec.fecha);
    const vacio=()=>({DÍA:Array(7).fill(null),NOCHE:Array(7).fill(null)});
    const prod=vacio(),sec=vacio(),pers=vacio();
    (todos||[]).forEach(r=>{
      if(!r||r.linea!==linea)return;
      const i=fechas.indexOf(r.fecha);if(i<0)return;
      const b=bloqueDe(r),cs=cuadrosDe(r);
      const ef=cs.reduce((a,c)=>a+num(c&&c.produccion&&c.produccion.efectiva),0);
      const se=cs.reduce((a,c)=>a+secDe(linea,c),0);
      const pe=personasDe(r);
      if(ef>0)prod[b][i]=(prod[b][i]||0)+ef;
      if(se>0)sec[b][i]=(sec[b][i]||0)+se;
      if(pe>0)pers[b][i]=Math.max(pers[b][i]||0,pe);
    });
    const suma=a=>a.reduce((s,v)=>s+(v||0),0);
    const totDia=fechas.map((_,i)=>(prod['DÍA'][i]||0)+(prod.NOCHE[i]||0)||null);
    const totSec=fechas.map((_,i)=>(sec['DÍA'][i]||0)+(sec.NOCHE[i]||0)||null);
    return {fechas,dias:fechas.map((f,i)=>[DIAS[i],ddmm(fechaLocal(f))]),prod,sec,pers,totDia,totSec,
      totalSemana:suma(totDia),totalSec:suma(totSec),totalDia:suma(prod['DÍA']),totalNoche:suma(prod.NOCHE)};
  }

  /* ---------- modelo (puro, serializable) ---------- */
  function modelo(rec,d,todos){
    const linea=rec.linea||'',bloque=bloqueDe(rec),cs=cuadrosDe(rec),ds=(d&&d.cuadros)||[];
    const pres=(m,p)=>typeof raiz.nombrePresentacionUI==='function'?raiz.nombrePresentacionUI(linea,m,p):String(p||'').replace(/_/g,' ');
    const columnas=[];
    cs.forEach((c,i)=>{
      if(!activo(c))return;
      const dc=ds[i]||{};
      const horas=num(c.horasTurno),ef=num(dc.horasEfectivas),efe=num(c.produccion&&c.produccion.efectiva),prog=num(c.produccion&&c.produccion.programada);
      const sin=ef>0?efe/ef:null,real=horas>0?efe/horas:null;
      columnas.push({marca:String(c.marca||'').trim()||'—',presentacion:pres(c.marca,c.presentacion)||'—',ratioNominal:num(c.ratioNominal)||null,
        lote:String(c.lote||'').trim()||'—',vencimiento:c.fechaVencimiento?ddmmaaaa(c.fechaVencimiento):'—',
        inicio:c.horaInicio||'—',fin:c.horaFin||'—',horas,pProg:num(dc.pProg),pNoProg:num(dc.pNoProg),horasEfectivas:ef,
        programada:prog,efectiva:efe,secundaria:LINEAS_SEC[linea]?secDe(linea,c):null,calidad:num(c.produccion&&c.produccion.calidad),
        ratioReal:real,ratioSin:sin,diferencia:sin!==null&&real!==null?Math.max(0,sin-real):null,noCumplida:Math.max(0,prog-efe),
        paletas:num(c.produccion&&c.produccion.paletas)});
    });
    const horasProd=columnas.reduce((a,c)=>a+c.horas,0),hEf=num(d.horasEfectivas),efectiva=num(d.efectiva),programada=num(d.programada);
    const ratioSin=hEf>0?efectiva/hEf:null,ratioReal=horasProd>0?efectiva/horasProd:null;
    const conVel=num(d.produccionNominal)>0,M=metas();
    const pctOrNull=(v,ok)=>ok?num(v)*100:null;
    const ind=[['Disponib.','disponibilidad',pctOrNull(d.disponibilidad,horasProd>0)],['Rendim.','rendimiento',pctOrNull(d.rendimiento,conVel)],
      ['Calidad','calidad',d.calidad===null||d.calidad===undefined||!LINEAS_SEC[linea]||linea==='B20L'?null:num(d.calidad)*100],['OEE','oee',pctOrNull(d.oee,conVel)],
      ['Cumplim.','cumplimiento',pctOrNull(d.cumplimiento,programada>0)],['Eficiencia','eficiencia',pctOrNull(d.eficiencia,conVel)]]
      .map(([et,k,v])=>({etiqueta:et,clave:k,valor:v,nivel:nivel(v,M[k]),meta:M[k]&&M[k].verde}));
    /* mermas: todos los componentes de la línea, en % de la producción efectiva */
    const am=typeof raiz.agruparMermas==='function'?raiz.agruparMermas(rec):{filas:[]};
    const comp=t=>raiz.GlacialIndicadores&&raiz.GlacialIndicadores.componenteMerma?raiz.GlacialIndicadores.componenteMerma(t):t;
    const catalogo=(typeof raiz.obtenerItemsMerma==='function'?raiz.obtenerItemsMerma(linea):[])||[];
    const mermas=[];const vistos=new Set();
    catalogo.forEach(t=>{const k=comp(t);if(vistos.has(k))return;vistos.add(k);const f=(am.filas||[]).find(x=>x.item===k);mermas.push({item:String(t),pct:efectiva>0&&f?f.unidades/efectiva*100:0});});
    (am.filas||[]).forEach(f=>{if(!vistos.has(f.item)){vistos.add(f.item);mermas.push({item:f.item,pct:efectiva>0?f.unidades/efectiva*100:0});}});
    const ai=typeof raiz.agruparInsumos==='function'?raiz.agruparInsumos(rec):{};
    const insumos=linea==='B20L'?[['Planchas de cartón (und)',num(ai.planchasCarton)],['Stretch (kg)',num(ai.stretchFilmKg)]]
      :[[linea==='C20L'?'Cajas (und)':'Cajas de preformas',num(ai.cajasPreformas)],['Planchas de cartón',num(ai.planchasCarton)],['Polietileno (kg)',num(ai.polietilenoKg)],['Stretch (kg)',num(ai.stretchFilmKg)]];
    const hor=raiz.GlacialIndicadores&&raiz.GlacialIndicadores.horarioBloque?raiz.GlacialIndicadores.horarioBloque(rec.fecha,bloque,(typeof raiz.glacialConfigIndicadores==='function'?(raiz.glacialConfigIndicadores()||{}).bloques:undefined)):null;
    const personal=Array.isArray(rec.personal)?rec.personal:[];
    const lider=personal.find(p=>/l[ií]der/i.test(String(p&&p.cargo||'')+' '+String(p&&p.posicion||''))&&String(p.nombre||'').trim());
    /* Detalle para el Excel (23/11/2026): cada parada, mermas en kg y unidades, y el personal con nombre. */
    const paradasDetalle=[];
    cs.forEach(c=>{if(!activo(c))return;[['PROGRAMADA',c.paradasProgramadas],['NO PROGRAMADA',c.paradasNoProgramadas]].forEach(([tipo,l])=>(l||[]).forEach(x=>{
      if(!x||x.eliminada||!(num(x.tiempoMin)>0))return;
      paradasDetalle.push({marca:String(c.marca||'').trim(),tipo,descripcion:String(x.descripcion||x.motivoCat||'').trim()||'—',causa:String(x.causa||'').trim(),minutos:num(x.tiempoMin)});
    }));});
    const mermasDetalle=mermas.map(k=>{const f=(am.filas||[]).find(x=>x.item===comp(k.item));return {item:k.item,peso:f?num(f.peso):0,unidades:f?num(f.unidades):0,pct:k.pct};});
    const personalLista=personal.filter(p=>p&&String(p.nombre||'').trim()).map(p=>({posicion:String(p.posicion||'').trim(),nombre:String(p.nombre).trim(),cargo:String(p.cargo||'').trim()}));
    const sw=semanaISO(rec.fecha),fd=fechaLocal(rec.fecha);
    const sem=semana(rec,todos);
    return JSON.parse(JSON.stringify({
      version:1,linea,nombre:NOMBRE[linea]||linea,unidad:UNIDAD[linea]||'unidades',unidadRatio:linea==='C20L'?'C/H':'B/H',
      fecha:rec.fecha,fechaTexto:ddmmaaaa(rec.fecha),diaSemana:fd?DIAS_LARGO[(fd.getDay()+6)%7]:'',bloque,numeroSemana:sw.semana,juliano:rec.diaJuliano||sw.juliano,
      estado:rec.estadoRegistro==='FINALIZADO'?'CERRADO':'EN REGISTRO',
      turno:{ingreso:hor?hhmm(hor.inicio):'—',salida:hor?hhmm(hor.fin):'—',personas:personasDe(rec)||null,horasProduccion:horasProd,horasEfectivas:hEf,
        pProg:num(d.pProg),pNoProg:num(d.pNoProg),registradoPor:rec.registradoPor||'—'},
      columnas,secundaria:LINEAS_SEC[linea]||null,calidadTitulo:CAL[linea]||'Calidad',
      total:{programada,efectiva,nominal:num(d.produccionNominal),noCumplida:Math.max(0,programada-efectiva),ratioSin,ratioReal,
        diferencia:ratioSin!==null&&ratioReal!==null?Math.max(0,ratioSin-ratioReal):null,
        horasHombre:personasDe(rec)>0?personasDe(rec)*horasProd:null},
      indicadores:ind,mermas,insumos,semana:sem,paradasDetalle,mermasDetalle,personalLista,requerido:personalRequerido(linea),
      observaciones:String(rec.observaciones||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
      firmas:{lider:lider?String(lider.nombre).trim():'—',supervisor:rec.registradoPor||'—'}
    },(k,v)=>v===undefined?null:v));
  }

  /* =========================================================
     DIBUJO (canvas de 1080 px lógicos, resolución ×2)
     ========================================================= */
  const C={navy:'#0B2E4A',azul:'#0877A6',azul2:'#1F5F8B',celeste:'#E6F2FA',borde:'#CFDDE7',texto:'#1D2B36',gris:'#5E6D78',fondo:'#F3F6F8',blanco:'#FFFFFF',
    verde:'#2E8B57',ambar:'#D08A12',rojo:'#C0392B',naranja:'#E8823A',morado:'#9B3FB5',cian:'#2BA8D8',verdeClaro:'#E2F3DF',
    rosa:'#EAC3EC',lima:'#C9F2A6',turquesa:'#9FF0F2',cabT:'#F4F7FA'};
  const COLOR_NIVEL={verde:C.verde,ambar:C.ambar,rojo:C.rojo,gris:'#9AA7B1'};
  const W=1080,PAD=16,IW=W-PAD*2,ESCALA=2,FUENTE='Arial, Helvetica, sans-serif';
  const fmt=(v,dec=0)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  const fmtH=v=>fmt(v,2);
  function rr(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
  function txt(x,s,X,Y,o){
    o=o||{};const tam=o.tam||13;let t=tam;s=String(s==null?'':s);
    x.font=`${o.peso||'400'} ${t}px ${FUENTE}`;
    if(o.max){while(x.measureText(s).width>o.max&&t>(o.min||8)){t-=0.5;x.font=`${o.peso||'400'} ${t}px ${FUENTE}`;}}
    x.fillStyle=o.color||C.texto;x.textAlign=o.align||'left';x.textBaseline='alphabetic';x.fillText(s,X,Y);x.textAlign='left';
  }
  /* tabla: columnas [{w, align}], filas [{celdas:[texto|{t,color,peso}], fondo, cabecera, alto}] */
  function tabla(x,X,Y,cols,filas){
    let y=Y;
    filas.forEach(f=>{
      const h=f.alto||24;let cx=X;
      cols.forEach((c,i)=>{
        const cel=f.celdas[i];const o=cel&&typeof cel==='object'?cel:{t:cel};
        x.fillStyle=o.fondo||(i===0&&!f.cabecera?C.celeste:(f.fondo||C.blanco));x.fillRect(cx,y,c.w,h);
        x.strokeStyle=C.borde;x.lineWidth=1;x.strokeRect(cx+0.5,y+0.5,c.w,h);
        const al=i===0&&!c.align?'left':(c.align||'center');
        const tx=al==='left'?cx+7:al==='right'?cx+c.w-7:cx+c.w/2;
        if(o.sub){txt(x,o.t,tx,y+h/2-1,{tam:o.tam||12.5,peso:o.peso||(f.cabecera||i===0?'700':'600'),color:o.color,align:al,max:c.w-10});txt(x,o.sub,tx,y+h/2+12,{tam:10,color:C.gris,align:al,max:c.w-10});}
        else txt(x,o.t,tx,y+h/2+4.5,{tam:o.tam||12.5,peso:o.peso||(f.cabecera||i===0?'700':'600'),color:o.color,align:al,max:c.w-10});
        cx+=c.w;
      });
      y+=h;
    });
    return y;
  }
  function titulo(x,s,X,Y,w,color,colorTexto){x.fillStyle=color||C.azul;rr(x,X,Y,w,30,7);x.fill();x.fillRect(X,Y+20,w,10);txt(x,s,X+12,Y+20.5,{tam:15,peso:'800',color:colorTexto||C.blanco,max:w-24});return Y+30;}
  /* ---- gráficos ---- */
  function tarjetaGraf(x,X,Y,w,h,tit,sub){x.fillStyle=C.blanco;rr(x,X,Y,w,h,10);x.fill();x.strokeStyle=C.borde;x.lineWidth=1;x.stroke();txt(x,tit,X+w/2,Y+22,{tam:14,peso:'800',color:C.navy,align:'center',max:w-16});if(sub)txt(x,sub,X+w/2,Y+38,{tam:10.5,color:C.gris,align:'center',max:w-16});}
  function barras(x,X,Y,w,h,datos,o){
    o=o||{};const pie=30,arriba=20,base=Y+h-pie,alto=h-pie-arriba;
    const M=o.max||Math.max(1,...datos.map(d=>d[1]||0))*1.15,bw=(w-16)/Math.max(1,datos.length);
    x.strokeStyle=C.borde;x.lineWidth=1;x.beginPath();x.moveTo(X+6,base+0.5);x.lineTo(X+w-6,base+0.5);x.stroke();
    datos.forEach(([et,v],i)=>{
      const bx=X+8+i*bw+bw*0.2,bh=v?Math.max(1,v/M*alto):0,by=base-bh,col=(o.colores&&o.colores[i])||o.color||C.verde;
      x.fillStyle=col;if(bh>0){rr(x,bx,by,bw*0.6,bh,Math.min(3,bh/2));x.fill();}
      txt(x,v===null||v===undefined?'—':(o.fmt?o.fmt(v):fmt(v)),bx+bw*0.3,by-5,{tam:11,peso:'700',align:'center',max:bw+6});
      String(et).split('\n').forEach((t,k)=>txt(x,t,bx+bw*0.3,base+13+k*11,{tam:9.5,color:C.gris,align:'center',max:bw-2}));
    });
  }
  function dona(x,X,Y,w,h,partes,centro,sub){
    const tot=partes.reduce((a,p)=>a+(p[1]||0),0),cx=X+w*0.32,cy=Y+h/2+4,R=Math.min(w*0.24,h/2-6),r=R*0.62;
    if(tot<=0){x.strokeStyle=C.borde;x.lineWidth=R-r;x.beginPath();x.arc(cx,cy,(R+r)/2,0,Math.PI*2);x.stroke();}
    let a=-Math.PI/2;
    partes.forEach(([,v,col])=>{if(!v||tot<=0)return;const b=a+v/tot*Math.PI*2;x.fillStyle=col;x.beginPath();x.arc(cx,cy,R,a,b);x.arc(cx,cy,r,b,a,true);x.closePath();x.fill();a=b;});
    txt(x,centro,cx,cy+3,{tam:19,peso:'800',color:C.navy,align:'center',max:r*2-6});txt(x,sub,cx,cy+18,{tam:9.5,color:C.gris,align:'center',max:r*2-4});
    const lx=X+w*0.6;
    partes.forEach(([et,v,col],i)=>{const ly=Y+h/2-partes.length*21+i*42+8;x.fillStyle=col;rr(x,lx,ly,11,11,2);x.fill();
      txt(x,et,lx+16,ly+10,{tam:10.5,max:w*0.4-18});txt(x,`${fmtH(v)} h · ${tot>0?Math.round(v/tot*100):0}%`,lx+16,ly+26,{tam:12.5,peso:'800',color:C.navy,max:w*0.4-18});});
  }
  function semanaGraf(x,X,Y,w,h,dias,series){
    const pie=32,arriba=22,base=Y+h-pie,alto=h-pie-arriba-24;
    const M=Math.max(1,...series.flatMap(s=>s[2].map(v=>v||0)))*1.08,gw=(w-16)/7,bw=gw*0.7/series.length;
    let lx=X+10;series.forEach(([n,col])=>{x.fillStyle=col;rr(x,lx,Y+2,10,10,2);x.fill();txt(x,n,lx+14,Y+11,{tam:10});x.font=`400 10px ${FUENTE}`;lx+=x.measureText(n).width+30;});
    x.strokeStyle=C.borde;x.lineWidth=1;x.beginPath();x.moveTo(X+6,base+0.5);x.lineTo(X+w-6,base+0.5);x.stroke();
    dias.forEach((d,i)=>{
      series.forEach(([,col,vals],k)=>{const v=vals[i];if(!v)return;const bx=X+8+i*gw+gw*0.15+k*bw,bh=Math.max(1,v/M*alto),by=base-bh;
        x.fillStyle=col;rr(x,bx,by,bw-2,bh,Math.min(2,bh/2));x.fill();
        x.save();x.translate(bx+bw/2+3,by-4);x.rotate(-Math.PI/2);txt(x,fmt(v),0,0,{tam:9,peso:'700'});x.restore();});
      txt(x,d[0],X+8+i*gw+gw/2,base+13,{tam:9.5,color:C.gris,align:'center'});txt(x,d[1],X+8+i*gw+gw/2,base+24,{tam:8.5,color:C.gris,align:'center'});
    });
  }

  /* ---- alto total (mismas medidas que el dibujo) ---- */
  const FILAS_PROD=m=>16+(m.secundaria?1:0);
  const altoTablaSem=(n,h)=>26+34+n*(h||26);
  function alto(m){
    let h=10+110+12+74+12;                     // aviso superior, encabezado, cifras
    h+=30+3*26+12;                             // datos del turno
    h+=30+FILAS_PROD(m)*24+12;                 // producción
    h+=3*(250+10)+2;                           // gráficos
    h+=altoTablaSem(3)+10;                     // producción semana
    if(m.secundaria)h+=altoTablaSem(3)+10;
    h+=altoTablaSem(2,36)+10;                  // personal
    h+=24+Math.max(2,m.observaciones.length)*22+10;
    h+=78+34;                                  // firmas y pie
    return h;
  }

  function dibujar(m){
    const H=alto(m);
    const cv=document.createElement('canvas');cv.width=W*ESCALA;cv.height=H*ESCALA;
    const x=cv.getContext('2d');x.scale(ESCALA,ESCALA);
    x.fillStyle=C.fondo;x.fillRect(0,0,W,H);
    const U=m.unidad,UR=m.unidadRatio,t=m.total;
    let y=10;
    /* 1) encabezado */
    x.fillStyle=C.navy;rr(x,PAD,y,IW,110,12);x.fill();
    txt(x,'GLACIAL',PAD+24,y+68,{tam:40,peso:'800',color:C.blanco});
    x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=2;x.beginPath();x.moveTo(PAD+222,y+22);x.lineTo(PAD+222,y+88);x.stroke();
    txt(x,'REPORTE DIARIO DE PRODUCCIÓN',PAD+244,y+44,{tam:23,peso:'700',color:C.blanco,max:470});
    txt(x,m.nombre,PAD+244,y+88,{tam:38,peso:'800',color:C.blanco,max:470});
    const rx=W-PAD-22;
    txt(x,`${m.fechaTexto} · ${m.diaSemana}`,rx,y+34,{tam:18,peso:'700',color:C.blanco,align:'right',max:300});
    x.fillStyle=m.bloque==='NOCHE'?'#3B4C8C':'#1E8A4C';rr(x,rx-150,y+44,150,30,7);x.fill();
    txt(x,'TURNO '+m.bloque,rx-75,y+64,{tam:15,peso:'800',color:C.blanco,align:'center'});
    txt(x,`Semana ${m.numeroSemana||'—'} · Juliano ${m.juliano||'—'} · ${m.estado}`,rx,y+96,{tam:14,color:'#DCEBF5',align:'right',max:330});
    y+=110+12;
    /* 2) cifras */
    const kw=(IW-30)/4;
    [['PRODUCCIÓN EFECTIVA',fmt(t.efectiva),U,C.rojo,''],['PRODUCCIÓN DE LA SEMANA',fmt(m.semana.totalSemana),U,C.navy,''],
     ['RATIO REAL (CON PARADAS)',fmt(t.ratioReal),UR,C.navy,''],['RATIO SIN PARADAS',fmt(t.ratioSin),UR,C.navy,t.diferencia!==null?`−${fmt(t.diferencia)} por paradas`:'']]
    .forEach(([et,v,u,col,nota],i)=>{const kx=PAD+i*(kw+10);x.fillStyle=C.blanco;rr(x,kx,y,kw,74,10);x.fill();x.strokeStyle=C.borde;x.stroke();
      txt(x,et,kx+12,y+20,{tam:11.5,peso:'700',color:C.gris,max:kw-20});txt(x,v,kx+12,y+54,{tam:27,peso:'800',color:col,max:kw*0.55});
      x.font=`800 27px ${FUENTE}`;const vw=Math.min(x.measureText(v).width,kw*0.55);txt(x,u,kx+18+vw,y+54,{tam:12.5,color:C.gris,max:kw-vw-28});
      if(nota)txt(x,nota,kx+12,y+68,{tam:10.5,peso:'700',color:C.rojo,max:kw-20});});
    y+=74+12;
    /* 3) datos del turno */
    y=titulo(x,'DATOS DEL TURNO',PAD,y,IW);
    const tw=[IW*0.19,IW*0.14,IW*0.19,IW*0.14,IW*0.2,IW*0.14];
    const tc=tw.map(w=>({w,align:'center'}));tc[0].align=tc[2].align=tc[4].align='left';
    const th={fondo:C.celeste,peso:'700'};
    y=tabla(x,PAD,y,tc,[
      {alto:26,celdas:[{...th,t:'Fecha'},m.fechaTexto,{...th,t:'Ingreso del personal'},m.turno.ingreso,{...th,t:'Salida del personal'},m.turno.salida]},
      {alto:26,celdas:[{...th,t:'Turno'},m.bloque,{...th,t:'Número de personas'},m.turno.personas===null?'—':fmt(m.turno.personas),{...th,t:'Horas de producción'},fmtH(m.turno.horasProduccion)]},
      {alto:26,celdas:[{...th,t:'Registrado por'},{t:m.turno.registradoPor,tam:11.5},{...th,t:'Paradas (prog. / no prog.)'},`${fmtH(m.turno.pProg)} / ${fmtH(m.turno.pNoProg)}`,{...th,t:'Horas efectivas'},{t:fmtH(m.turno.horasEfectivas),color:C.rojo,peso:'800'}]}]);
    y+=12;
    /* 4) producción (una columna por cuadro) */
    y=titulo(x,'PRODUCCIÓN',PAD,y,IW);
    const cols=m.columnas.length?m.columnas:[{}];
    const w0=IW*0.33,wc=(IW-w0)/cols.length;
    const pc=[{w:w0,align:'left'}].concat(cols.map(()=>({w:wc})));
    const f=(et,fn,o)=>({celdas:[et].concat(cols.map(c=>{const v=c&&Object.keys(c).length?fn(c):'—';return o?Object.assign({t:v},typeof o==='function'?o(c):o):v;})),fondo:o&&o.fondoFila});
    const filas=[
      f('Marca',c=>c.marca,{peso:'800',fondo:'#D6ECFA'}),f('Presentación',c=>c.presentacion),f(`Ratio nominal (${UR})`,c=>fmt(c.ratioNominal),{color:C.verde,peso:'800'}),
      f('Lote',c=>c.lote),f('Fecha de vencimiento',c=>c.vencimiento),
      f('Hora inicio / fin / horas de producción',c=>`${c.inicio} – ${c.fin} · ${fmtH(c.horas)} h`),
      f('H. paradas prog. / no prog. / efectivas',c=>`${fmtH(c.pProg)} / ${fmtH(c.pNoProg)} / ${fmtH(c.horasEfectivas)}`),
      f(`Producción programada (${U})`,c=>fmt(c.programada)),f(`Producción efectiva (${U})`,c=>fmt(c.efectiva),{fondo:C.verdeClaro,peso:'800'})];
    if(m.secundaria)filas.push(f(`${m.secundaria}`,c=>fmt(c.secundaria)));
    filas.push(f(m.calidadTitulo,c=>fmt(c.calidad)),f(`Ratio real — con paradas (${UR})`,c=>fmt(c.ratioReal)),f(`Ratio sin paradas (${UR})`,c=>fmt(c.ratioSin)),
      f('Diferencia por paradas',c=>c.diferencia===null?'—':`${fmt(c.diferencia)} ${UR}${c.ratioSin>0?` (${Math.round(c.diferencia/c.ratioSin*100)}%)`:''}`,{color:C.rojo,peso:'800'}),
      f(`Producción no cumplida (${U})`,c=>fmt(c.noCumplida),{color:C.gris}),f('N° de paletas',c=>fmt(c.paletas,c.paletas%1?2:0)),
      {celdas:[{t:'TOTAL DEL TURNO',fondo:C.navy,color:C.blanco,peso:'800'}].concat(cols.map((_,i)=>i===0?{t:`Efectiva ${fmt(t.efectiva)} de ${fmt(t.programada)} ${U}`,fondo:C.navy,color:C.blanco,peso:'800'}:{t:'',fondo:C.navy}))});
    y=tabla(x,PAD,y,pc,filas.map(r=>Object.assign({alto:24},r)));
    y+=12;
    /* 5) gráficos */
    const gw=(IW-20)/3,gh=250;
    const g=(i,j)=>[PAD+j*(gw+10),y+i*(gh+10)];
    let [gx,gy]=g(0,0);tarjetaGraf(x,gx,gy,gw,gh,'PRODUCCIÓN',`${U} del turno`);
    barras(x,gx+6,gy+44,gw-12,gh-50,[['Nominal',t.nominal||null],['Programada',t.programada],['Efectiva',t.efectiva],['No\ncumplida',t.noCumplida],['Horas\nhombre',t.horasHombre]],{colores:[C.azul2,C.azul,C.verde,C.rojo,C.gris]});
    [gx,gy]=g(0,1);tarjetaGraf(x,gx,gy,gw,gh,'TIEMPO EFECTIVO VS. PARADAS',`Horas de producción: ${fmtH(m.turno.horasProduccion)} h`);
    const disp=m.indicadores[0].valor;
    dona(x,gx+6,gy+44,gw-12,gh-50,[['Horas efectivas',m.turno.horasEfectivas,C.cian],['Paradas prog.',m.turno.pProg,C.naranja],['Paradas no prog.',m.turno.pNoProg,C.rojo]],disp===null?'—':fmt(disp,0)+'%','disponibilidad');
    [gx,gy]=g(0,2);tarjetaGraf(x,gx,gy,gw,gh,'INDICADORES','Color según la meta configurada');
    barras(x,gx+6,gy+44,gw-12,gh-50,m.indicadores.map(k=>[k.etiqueta,k.valor]),{fmt:v=>fmt(v,1)+'%',colores:m.indicadores.map(k=>COLOR_NIVEL[k.nivel])});
    [gx,gy]=g(1,0);tarjetaGraf(x,gx,gy,gw,gh,'MERMAS','% sobre la producción efectiva');
    barras(x,gx+6,gy+44,gw-12,gh-50,m.mermas.map(k=>[k.item.replace(/ /,'\n'),k.pct]),{color:C.cian,fmt:v=>fmt(v,2)+'%',max:Math.max(0.1,...m.mermas.map(k=>k.pct))*1.25});
    [gx,gy]=g(1,1);tarjetaGraf(x,gx,gy,gw,gh,'INSUMOS','Consumo del turno');
    barras(x,gx+6,gy+44,gw-12,gh-50,m.insumos.map(([a,b])=>[a.replace(/ (?=\()/,'\n').replace(/^(\S+) (de )?/,'$1\n$2'),b]),{color:C.morado,fmt:v=>fmt(v,2)});
    [gx,gy]=g(1,2);tarjetaGraf(x,gx,gy,gw,gh,'TIEMPO DE PARADAS (H)','Programadas vs. no programadas');
    dona(x,gx+6,gy+44,gw-12,gh-50,[['Programadas',m.turno.pProg,C.naranja],['No programadas',m.turno.pNoProg,C.rojo]],fmtH(m.turno.pProg+m.turno.pNoProg)+' h','total paradas');
    const S=m.semana;
    [gx,gy]=g(2,0);tarjetaGraf(x,gx,gy,gw,gh,'PRODUCCIÓN DE LA SEMANA',`${U} por día y turno`);
    semanaGraf(x,gx+6,gy+44,gw-12,gh-50,S.dias,[['Día',C.azul,S.prod['DÍA']],['Noche',C.navy,S.prod.NOCHE]]);
    [gx,gy]=g(2,1);
    if(m.secundaria){tarjetaGraf(x,gx,gy,gw,gh,(m.secundaria+' vs. efectivos').toUpperCase(),`Semana ${m.numeroSemana||''}`.trim());
      semanaGraf(x,gx+6,gy+44,gw-12,gh-50,S.dias,[[m.secundaria,C.naranja,S.totSec],['Efectivos (P.T.)',C.verde,S.totDia]]);}
    else{tarjetaGraf(x,gx,gy,gw,gh,'TOTAL POR TURNO','Semana · día y noche');
      barras(x,gx+6,gy+44,gw-12,gh-50,[['Día',S.totalDia],['Noche',S.totalNoche],['Semana',S.totalSemana]],{colores:[C.azul,C.navy,C.verde]});}
    [gx,gy]=g(2,2);tarjetaGraf(x,gx,gy,gw,gh,'ASISTENCIA DEL PERSONAL',`Personas por día · requerido ${m.requerido||'—'}`);
    semanaGraf(x,gx+6,gy+44,gw-12,gh-50,S.dias,[['Día',C.azul2,S.pers['DÍA']],['Noche',C.navy,S.pers.NOCHE]]);
    y+=3*(gh+10)+2;
    /* 6) tablas de la semana */
    const colsSem=[{w:IW*0.16}].concat(Array.from({length:7},()=>({w:IW*0.72/7}))).concat([{w:IW*0.12}]);
    const cabSem={cabecera:true,alto:34,celdas:[{t:'Turno',fondo:C.cabT}].concat(S.dias.map(d=>({t:d[0],sub:d[1],fondo:C.cabT}))).concat([{t:'Semana',fondo:C.cabT}])};
    const sum=a=>a.reduce((s,v)=>s+(v||0),0);
    const filaSem=(et,vals,tot,neg)=>({alto:26,celdas:[{t:et,fondo:neg?'#FAFBFC':C.blanco,peso:neg?'800':'700'}].concat(vals.map(v=>({t:v?fmt(v):'',peso:neg?'800':'600',fondo:neg?'#FAFBFC':C.blanco}))).concat([{t:tot,peso:'800',fondo:C.celeste}])});
    const tablaSem=(tit,col,filasT)=>{x.fillStyle=col;rr(x,PAD,y,IW,26,7);x.fill();x.fillRect(PAD,y+16,IW,10);txt(x,tit,PAD+10,y+18,{tam:13,peso:'800',color:C.navy});y=tabla(x,PAD,y+26,colsSem,[cabSem].concat(filasT))+10;};
    tablaSem(`PRODUCCIÓN ${U.toUpperCase()} — SEMANA ${m.numeroSemana||''}`,C.rosa,[filaSem('Día',S.prod['DÍA'],fmt(sum(S.prod['DÍA']))),filaSem('Noche',S.prod.NOCHE,fmt(sum(S.prod.NOCHE))),filaSem('Total diario',S.totDia,fmt(S.totalSemana),true)]);
    if(m.secundaria)tablaSem(`${m.secundaria.toUpperCase()} — SEMANA ${m.numeroSemana||''}`,C.lima,[filaSem('Día',S.sec['DÍA'],fmt(sum(S.sec['DÍA']))),filaSem('Noche',S.sec.NOCHE,fmt(sum(S.sec.NOCHE))),filaSem('Total diario',S.totSec,fmt(S.totalSec),true)]);
    const filaPers=(et,vals)=>({alto:36,celdas:[{t:et,peso:'700',fondo:C.blanco}].concat(vals.map(v=>v?{t:fmt(v),sub:m.requerido>0?fmt(v/m.requerido*100,1)+'%':'',fondo:C.blanco}:{t:'',fondo:C.blanco})).concat([{t:'',fondo:C.celeste}])});
    tablaSem(`PERSONAL — SEMANA ${m.numeroSemana||''} (personas y % del requerido: ${m.requerido||'—'})`,C.turquesa,[filaPers('Día',S.pers['DÍA']),filaPers('Noche',S.pers.NOCHE)]);
    /* 7) observaciones y firmas */
    txt(x,'OBSERVACIONES:',PAD,y+16,{tam:13,peso:'800',color:C.navy});y+=24;
    const obs=m.observaciones.length?m.observaciones:['',''];
    obs.concat(obs.length<2?['']:[]).forEach(o=>{txt(x,o,PAD+2,y+15,{tam:12.5,max:IW-4});x.strokeStyle=C.borde;x.beginPath();x.moveTo(PAD,y+21.5);x.lineTo(W-PAD,y+21.5);x.stroke();y+=22;});
    y+=10;
    [[m.firmas.lider,'Líder de línea',PAD+40],[m.firmas.supervisor,'Supervisor de producción',W-PAD-40-260]].forEach(([n,c,fx])=>{
      x.strokeStyle=C.texto;x.beginPath();x.moveTo(fx,y+34.5);x.lineTo(fx+260,y+34.5);x.stroke();
      txt(x,n,fx+130,y+52,{tam:13,peso:'700',align:'center',max:256});txt(x,c,fx+130,y+67,{tam:11,color:C.gris,align:'center'});});
    y+=78;
    x.fillStyle=C.navy;x.fillRect(0,y,W,34);
    txt(x,'GLACIAL · Control de Producción',PAD,y+22,{tam:12.5,peso:'700',color:C.blanco});
    txt(x,`Reporte diario ${m.nombre} · ${m.fechaTexto} · turno ${m.bloque}`,W-PAD,y+22,{tam:12,color:C.blanco,align:'right'});
    return cv;
  }

  /* ---------- botón «Exportar PNG» ---------- */
  const seg=t=>typeof raiz.nombreArchivoSeguro==='function'?raiz.nombreArchivoSeguro(t):String(t||'').replace(/[^\w-]+/g,'_');
  const nombreArchivo=(m,ext)=>`Reporte_Diario_${seg(m.linea)}_${seg(m.fecha)}_${seg(m.bloque)}.${ext}`;
  function modeloActual(){
    const data=typeof raiz.obtenerRegistroExportacion==='function'?raiz.obtenerRegistroExportacion():null;
    if(!data)return null;
    const todos=typeof raiz.loadRecordsOficiales==='function'?raiz.loadRecordsOficiales():data.all;
    return modelo(data.rec,data.d,todos);
  }
  const blobImagen=m=>new Promise((ok,mal)=>dibujar(m).toBlob(b=>b?ok(b):mal(new Error('No se pudo generar la imagen PNG.')),'image/png'));
  async function exportar(){
    try{
      const m=modeloActual();if(!m)return;
      raiz.descargarArchivo(await blobImagen(m),nombreArchivo(m,'png'));
    }catch(e){console.error(e);alert('No se pudo generar el reporte diario. Inténtalo nuevamente.');}
  }
  /** «Exportar Excel»: el Reporte diario en Excel (62c-reporte-diario-excel.js). */
  async function exportarExcel(){
    try{
      const m=modeloActual();if(!m)return;
      if(!raiz.glacialReporteDiarioExcel)throw new Error('falta el módulo del Excel');
      raiz.descargarArchivo(await raiz.glacialReporteDiarioExcel.blob(m),nombreArchivo(m,'xlsx'));
    }catch(e){console.error(e);alert('No se pudo generar el Excel: '+((e&&e.message)||e));}
  }
  /** Texto corto que acompaña al archivo en WhatsApp. */
  function resumenTexto(m){
    const t=m.total,U=m.unidad,UR=m.unidadRatio;
    const ind=k=>{const x=m.indicadores.find(i=>i.clave===k);return x&&x.valor!==null?fmt(x.valor,1)+'%':'—';};
    const pct=t.programada>0?` (${fmt(t.efectiva/t.programada*100,1)}% de ${fmt(t.programada)})`:'';
    return [`*REPORTE DIARIO DE PRODUCCIÓN · ${m.nombre}*`,`${m.fechaTexto} · ${m.diaSemana} · Turno ${m.bloque}`,'',
      `Producción efectiva: *${fmt(t.efectiva)} ${U}*${pct}`,
      `Ratio real (con paradas): ${fmt(t.ratioReal)} ${UR} · sin paradas: ${fmt(t.ratioSin)} ${UR}`,
      `Paradas: ${fmtH(m.turno.pProg)} h programadas · ${fmtH(m.turno.pNoProg)} h no programadas`,
      `Disponibilidad ${ind('disponibilidad')} · OEE ${ind('oee')} · Cumplimiento ${ind('cumplimiento')}`,
      `Personal: ${m.turno.personas===null?'—':m.turno.personas} · Semana ${m.numeroSemana||'—'}: ${fmt(m.semana.totalSemana)} ${U}`,
      '','GLACIAL · Control de Producción'].join('\n');
  }
  /* Enviar por WhatsApp: en el celular abre el menú de compartir del teléfono con el archivo (se elige WhatsApp y el chat);
     en el computador (o si el menú no está) descarga el archivo y abre WhatsApp con el resumen para adjuntarlo. Igual que Hielo. */
  async function compartir(tipo){
    try{
      const m=modeloActual();if(!m)return;
      const esExcel=tipo==='xlsx';
      const blob=esExcel?await raiz.glacialReporteDiarioExcel.blob(m):await blobImagen(m);
      const nombre=nombreArchivo(m,esExcel?'xlsx':'png'),texto=resumenTexto(m);
      const archivo=typeof File==='function'?new File([blob],nombre,{type:blob.type||(esExcel?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'image/png')}):null;
      const movil=/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
      if(archivo&&movil&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[archivo]})){
        try{await navigator.share({files:[archivo],text:texto,title:'Reporte diario '+m.nombre});return;}
        catch(e){if(e&&e.name==='AbortError')return;}            // si el menú falla, se descarga
      }
      raiz.descargarArchivo(blob,nombre);
      const w=raiz.open('https://wa.me/?text='+encodeURIComponent(texto),'_blank','noopener');
      const aviso=w===null?`Se descargó ${nombre}. Abre WhatsApp y adjúntalo en el chat.`:`Se descargó ${nombre} y se abrió WhatsApp con el resumen: adjunta el archivo en el chat.`;
      if(typeof raiz.mostrarToastReporte==='function')raiz.mostrarToastReporte(aviso);else alert(aviso);
    }catch(e){console.error(e);alert('No se pudo preparar el envío por WhatsApp: '+((e&&e.message)||e));}
  }

  /* ---------- editor del personal requerido y la vida útil (Administrador y jefatura) ---------- */
  const vidaUtil=l=>raiz.glacialAutollenadoCompleto?raiz.glacialAutollenadoCompleto.vidaUtilMeses(l):12;
  const puedeConfigurar=()=>typeof raiz.glacialPuedeConfigurarIndicadores==='function'&&raiz.glacialPuedeConfigurarIndicadores();
  function editarRequerido(){
    if(!puedeConfigurar()){alert('Solo el Administrador o la jefatura pueden cambiar el personal requerido.');return;}
    if(typeof raiz.glacialConfigIndicadoresEscuchar==='function')raiz.glacialConfigIndicadoresEscuchar();
    const lineas=['PET1','PET2','B7L','C20L','B20L'];
    const fondo=document.createElement('div');
    fondo.style.cssText='position:fixed;inset:0;background:rgba(10,30,50,.6);display:flex;align-items:center;justify-content:center;z-index:10060;padding:16px;';
    fondo.innerHTML='<div class="modal" style="max-width:420px;width:100%;background:#fff;border-radius:12px;padding:16px">'+
      '<h3 style="margin:0 0 6px">Personal requerido y vida útil por línea</h3><p class="small-muted" style="margin:0 0 10px"><b>Personal:</b> personas necesarias por turno (el Reporte diario muestra la asistencia como % de este número). <b>Vida útil:</b> meses entre la producción y el vencimiento (el registro llena el vencimiento solo).</p>'+
      '<table style="width:100%;font-size:14px"><thead><tr><th align="left">Línea</th><th align="left">Personal</th><th align="left">Vida útil (meses)</th></tr></thead><tbody>'+lineas.map(l=>'<tr><td style="padding:4px 0">'+(NOMBRE[l]||l)+'</td><td><input type="number" min="1" max="99" step="1" data-req="'+l+'" value="'+personalRequerido(l)+'" style="width:80px"></td><td><input type="number" min="1" max="60" step="1" data-vida="'+l+'" value="'+vidaUtil(l)+'" style="width:80px"></td></tr>').join('')+'</tbody></table>'+
      '<div data-req-error style="color:#c62828;font-size:12px;min-height:16px;margin-top:6px"></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn btn-ghost" data-req-x>Cancelar</button><button type="button" class="btn btn-primary" data-req-ok>Guardar</button></div></div>';
    document.body.appendChild(fondo);
    const err=t=>{const e=fondo.querySelector('[data-req-error]');if(e)e.textContent=t;};
    fondo.querySelector('[data-req-x]').onclick=()=>fondo.remove();
    fondo.querySelector('[data-req-ok]').onclick=async()=>{
      const valores={},vida={};
      for(const el of fondo.querySelectorAll('[data-req]')){const v=Number(el.value);if(!Number.isInteger(v)||v<1||v>99){err('El personal debe ser un número entero entre 1 y 99.');return;}valores[el.getAttribute('data-req')]=v;}
      for(const el of fondo.querySelectorAll('[data-vida]')){const v=Number(el.value);if(!Number.isInteger(v)||v<1||v>60){err('La vida útil debe ser un número entero de meses entre 1 y 60.');return;}vida[el.getAttribute('data-vida')]=v;}
      if(raiz.glacialEstadoDatos&&raiz.glacialEstadoDatos.enLinea===false){err('Sin conexión: no se guardó. Inténtalo cuando vuelva la conexión.');return;}
      err('Guardando…');
      try{
        const ref=raiz.db.collection('sync').doc('configIndicadores');
        await raiz.db.runTransaction(async tx=>{
          await tx.get(ref);
          tx.set(ref,{personalRequerido:valores,vidaUtilMeses:vida,actualizadoPor:(raiz.state&&raiz.state.user&&raiz.state.user.username)||'',actualizadoEn:Date.now()},{merge:true});
        });
        fondo.remove();
      }catch(e){err('No se pudo guardar (¿sin conexión o sin permiso?): '+((e&&e.message)||e));}
    };
  }

  const API={modelo,dibujar,exportar,exportarExcel,compartir,resumenTexto,editarRequerido,personalRequerido,puedeConfigurar,semanaDe,semanaISO,alto,REQUERIDO_INICIAL};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
  raiz.glacialReporteDiario=API;
})(typeof window!=='undefined'?window:globalThis);
